/*
OS TRES ESTILOS DO RELATO, medidos onde o relato aponta.

  box_to_box    "esta muito longe da linha da bola no eixo Z; devia acompanhar
                 mais de perto, no maximo uns 10 m a frente (atacando) ou
                 atras (defendendo) da linha da bola"
  fox_in_the_box "esta a distanciar-se muito da area durante o ataque"
  dummy_runner  "esta muito proximo dos zagueiros; devia puxar a marcacao
                 movimentando-se de um lado para o outro e para a frente e
                 para tras"

Os estilos sao FORCADOS (CM=box_to_box, CF1=fox_in_the_box, CF2=dummy_runner
nas duas equipas) para a amostra chegar; sem isso a rotacao da poucas dezenas
de frames a cada um.

Uso: node tools/headless/estilos_tres.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 600);
const semente = Number(process.argv[3] || 0);

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(1000 + semente * 977);

require('./harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const forcarEstilos = () => {
    for (const lista of [Match.players, Match.opponents]) {
        let cf = 0;
        for (const p of lista) {
            if (p.pos === 'CM') p.playingStyle = 'box_to_box';
            else if (p.pos === 'CF') p.playingStyle = (cf++ === 0) ? 'fox_in_the_box' : 'dummy_runner';
            p.playingStyleDesligado = false;
        }
    }
};
forcarEstilos();

const LINHA_AREA = CAMPO_COMP / 2 - 16.5;   // 36.5

const dados = {
    box_to_box: { dz: [], fora10: 0, n: 0, alvoFora10: 0, noTectoArea: 0 },
    fox_in_the_box: { distArea: [], distAreaActivo: [], dentro: 0, n: 0, activo: 0 },
    dummy_runner: { distDef: [], distDefCorrida: [], n: 0, corrida: 0, trilhos: new Map() }
};

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 60 === 0) forcarEstilos();
    if (i % 6) continue;

    for (const [eq, lista, outra] of [['TeamA', Match.players, Match.opponents],
                                      ['TeamB', Match.opponents, Match.players]]) {
        const bb = (typeof TeamAI !== 'undefined') ? TeamAI.get(eq) : null;
        if (!bb || !bb.isAttacking) continue;
        for (const p of lista) {
            if (!p.model) continue;
            const zAtk = p.model.position.z * p.dirZ;
            const bolaAtk = Match.ball.position.z * p.dirZ;

            if (p.playingStyle === 'box_to_box') {
                const d = dados.box_to_box;
                const dz = zAtk - bolaAtk;
                d.dz.push(dz); d.n++;
                if (Math.abs(dz) > 10) d.fora10++;
                // O ALVO, que e o que a regra controla -- o corpo so o segue.
                if (p.dynamicTarget) {
                    const alvoDz = p.dynamicTarget.z * p.dirZ - bolaAtk;
                    if (Math.abs(alvoDz) > 10.2) d.alvoFora10++;
                }
                // O tecto "de area a area" (26.5) manda por cima da faixa.
                if (Math.abs(bolaAtk) > 26.5 + 10) d.noTectoArea++;
            }
            if (p.playingStyle === 'fox_in_the_box') {
                const d = dados.fox_in_the_box;
                // metros ATRAS da linha da area (negativo = ja dentro)
                d.distArea.push(LINHA_AREA - zAtk);
                d.n++;
                // "Durante o ataque", como quem ve o jogo: a bola ja no
                // meio-campo adversario.
                if (bolaAtk > 0) d.noCampoAdv = (d.noCampoAdv || []).concat(LINHA_AREA - zAtk);
                if (zAtk >= LINHA_AREA) d.dentro++;
                if (p.styleAtivo) {
                    d.activo++; d.distAreaActivo.push(LINHA_AREA - zAtk);
                    // O que o estilo QUER, contra o que o bloco deixa.
                    if (p.dynamicTarget) d.alvo = (d.alvo || []).concat(LINHA_AREA - p.dynamicTarget.z * p.dirZ);
                    if (bb.bloco && bb.bloco.z1 !== undefined) {
                        d.bordaBloco = (d.bordaBloco || []).concat(LINHA_AREA - bb.bloco.z1 * bb.dir);
                    }
                }
            }
            if (p.playingStyle === 'dummy_runner') {
                const d = dados.dummy_runner;
                let melhor = Infinity;
                for (const o of outra) {
                    if (o.role === 'gk') continue;
                    if (o.pos !== 'CB') continue;
                    melhor = Math.min(melhor, p.model.position.distanceTo(o.model.position));
                }
                if (melhor < Infinity) {
                    d.distDef.push(melhor); d.n++;
                    if (p._dummyAtivo) { d.corrida++; d.distDefCorrida.push(melhor); }
                }
                // COLADO A ULTIMA LINHA? E a expressao directa de "esta muito
                // proximo dos zagueiros": o corpo a menos de 2 m da linha de
                // fora-de-jogo que ele proprio le.
                if (p._dummyAtivo && bb.offsideLimitDir !== null && bb.offsideLimitDir !== undefined) {
                    d.naLinha = (d.naLinha || 0) + ((bb.offsideLimitDir - zAtk < 2.0) ? 1 : 0);
                    d.naLinhaN = (d.naLinhaN || 0) + 1;
                }
                // Trilho: x e z ao longo do tempo, para medir a movimentacao.
                // So durante a corrida de arrasto: e ela que tem de mexer.
                if (p._dummyAtivo) {
                    if (!d.trilhos.has(p)) d.trilhos.set(p, { x: [], z: [], ax: [], az: [] });
                    const t = d.trilhos.get(p);
                    t.x.push(p.model.position.x); t.z.push(zAtk);
                    if (p.dynamicTarget) {
                        t.ax.push(p.dynamicTarget.x); t.az.push(p.dynamicTarget.z * p.dirZ);
                    }
                }
            }
        }
    }
}

const med = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const mediana = a => { const o = a.slice().sort((x, y) => x - y); return o.length ? o[Math.floor(o.length / 2)] : NaN; };
const dp = a => { if (a.length < 2) return NaN; const m = med(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1)); };
/*
AMPLITUDE DA MOVIMENTACAO em janelas de 3 s: e o que distingue um jogador que
anda de um lado para o outro de um que fica sentado num ponto. A dispersao ao
longo do jogo inteiro nao serve -- ela e grande so por ele acompanhar o jogo.
*/
const amplitudeEmJanelas = (serie, amostrasPorJanela) => {
    const picos = [];
    for (let i = 0; i + amostrasPorJanela <= serie.length; i += amostrasPorJanela) {
        const j = serie.slice(i, i + amostrasPorJanela);
        picos.push(Math.max(...j) - Math.min(...j));
    }
    return med(picos);
};

const B = dados.box_to_box, F = dados.fox_in_the_box, D = dados.dummy_runner;
console.log(`semente ${semente}  (${segundos}s, so frames com a equipa a atacar)`);
console.log(`  box_to_box     n=${B.n}  dz a linha da bola: media ${med(B.dz).toFixed(1)}m  ` +
    `mediana ${mediana(B.dz).toFixed(1)}m  dp ${dp(B.dz).toFixed(1)}m  ` +
    `| corpo fora da faixa de +-10m: ${(100 * B.fora10 / Math.max(1, B.n)).toFixed(0)}%` +
    `  ALVO fora: ${(100 * B.alvoFora10 / Math.max(1, B.n)).toFixed(0)}%` +
    `  (a bola fora do alcance do tecto dos 26.5: ${(100 * B.noTectoArea / Math.max(1, B.n)).toFixed(0)}%)`);
console.log(`  fox_in_the_box n=${F.n}  distancia a entrada da area: mediana ${mediana(F.distArea).toFixed(1)}m  ` +
    `(negativo = dentro)  | dentro da area: ${(100 * F.dentro / Math.max(1, F.n)).toFixed(0)}% do ataque`);
console.log(`                 com a bola no meio-campo adversario: mediana ${mediana(F.noCampoAdv || []).toFixed(1)}m da area ` +
    `(n=${(F.noCampoAdv || []).length})`);
console.log(`                 estilo activo em ${(100 * F.activo / Math.max(1, F.n)).toFixed(0)}% do ataque` +
    `, e nesses: corpo a ${mediana(F.distAreaActivo).toFixed(1)}m da area, ` +
    `alvo a ${mediana(F.alvo || []).toFixed(1)}m, borda do bloco a ${mediana(F.bordaBloco || []).toFixed(1)}m`);
const amps = { x: [], z: [], ax: [], az: [] };
for (const t of D.trilhos.values()) {
    amps.x.push(amplitudeEmJanelas(t.x, 30));   // 30 amostras a 10 Hz = 3 s
    amps.z.push(amplitudeEmJanelas(t.z, 30));
    amps.ax.push(amplitudeEmJanelas(t.ax || [], 30));
    amps.az.push(amplitudeEmJanelas(t.az || [], 30));
}
console.log(`  dummy_runner   n=${D.n}  distancia ao central mais perto: mediana ${mediana(D.distDef).toFixed(1)}m  ` +
    `| a menos de 3m: ${(100 * D.distDef.filter(v => v < 3).length / Math.max(1, D.distDef.length)).toFixed(0)}%`);
console.log(`                 em corrida de arrasto ${(100 * D.corrida / Math.max(1, D.n)).toFixed(0)}% do ataque` +
    `, e nesses a distancia ao central e ${mediana(D.distDefCorrida).toFixed(1)}m`);
console.log(`                 colado a linha de fora-de-jogo (a menos de 2m): ` +
    `${(100 * (D.naLinha || 0) / Math.max(1, D.naLinhaN || 0)).toFixed(0)}% da corrida`);
console.log(`                 movimentacao em 3s (em corrida): corpo ${med(amps.x).toFixed(1)}m em x / ` +
    `${med(amps.z).toFixed(1)}m em z  |  ALVO ${med(amps.ax).toFixed(1)}m em x / ${med(amps.az).toFixed(1)}m em z`);
