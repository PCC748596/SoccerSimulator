/*
O AVANCADO TOCA PARA TRAS E FICA A VER.

Relato: *"o CF toca pra tras e para de correr para frente. Fica parado olhando
a jogada."*

Isto mede o que ele faz nos SEGUNDOS A SEGUIR a um passe para tras. De cada
passe dado por um avancado (CF/ST) em que a bola vai para tras no referencial
de ataque dele, guarda-se:

  avanco      quantos metros ele ganhou em z (no referencial de ataque) nos
              `JANELA` segundos seguintes — negativo e recuar
  velMedia    a velocidade media dele nessa janela
  parado      fraccao dos frames com velocidade abaixo de 0.5 m/s
  estados     em que estados da FSM ele passou a janela

Uso: node tools/headless/cf_depois_do_passe.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 1800);
const semente = Number(process.argv[3] || 0);
const JANELA = 3.0;

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

const ehAvancado = (p) => p && (p.pos === 'CF' || p.pos === 'ST');

const emCurso = [];      // janelas a decorrer
const amostras = [];
const anterior = new Map();

const frames = Math.round(segundos / dt);
for (let f = 0; f < frames; f++) {
    Match.update(dt);

    for (const p of Match.players.concat(Match.opponents)) {
        if (!p || !p.fsm) continue;
        const estado = p.fsm.currentState;
        const antes = anterior.get(p);
        anterior.set(p, estado);

        // Entrou no estado PASS: e o instante em que o passe e decidido.
        if (estado !== 'PASS' || antes === 'PASS') continue;
        if (!ehAvancado(p)) continue;

        const alvo = p.passTarget || Match.intendedReceiver;
        if (!alvo || !alvo.model) continue;

        // Para tras no referencial de ATAQUE dele.
        const dz = (alvo.model.position.z - p.model.position.z) * p.dirZ;
        if (dz >= -1.0) continue;

        emCurso.push({
            p, t: 0, z0: p.model.position.z * p.dirZ,
            soma: 0, n: 0, parados: 0, estados: new Set(),
            accoes: new Set(), foraDeJogo: 0
        });
    }

    for (let i = emCurso.length - 1; i >= 0; i--) {
        const a = emCurso[i];
        a.t += dt;
        /*
        SO CONTA COM O JOGO A CORRER. Metade dos "parados" da primeira medicao
        eram o jogo PARADO — uma falta, um lateral — e um avancado quieto num
        lance morto nao e o relato. Os frames fora do PLAY nao entram na conta
        e a amostra e deitada fora se forem muitos.
        */
        if (Match.state !== 'PLAY') { a.foraDeJogo++; continue; }
        const v = a.p.velocity ? Math.hypot(a.p.velocity.x, a.p.velocity.z) : 0;
        a.soma += v; a.n++;
        if (v < 0.5) a.parados++;
        a.estados.add(a.p.fsm.currentState);
        // A folha da arvore que decidiu este frame (ver BTStats.contar).
        if (a.p.ultimaAccaoBT) a.accoes.add(a.p.ultimaAccaoBT);

        if (a.t >= JANELA) {
            const fraccaoParada = a.foraDeJogo * dt / JANELA;
            if (fraccaoParada < 0.2 && a.n > 30) {
                amostras.push({
                    avanco: a.p.model.position.z * a.p.dirZ - a.z0,
                    velMedia: a.soma / Math.max(1, a.n),
                    parado: a.parados / Math.max(1, a.n),
                    estados: [...a.estados].join(','),
                    accoes: [...a.accoes].join(',')
                });
            }
            emCurso.splice(i, 1);
        }
    }
}

const n = amostras.length;
if (!n) { console.log('sem passes para tras de avancados na amostra'); process.exit(0); }

const med = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
};

console.log(`\n${Math.round(segundos / 60)} minutos, semente ${semente}`);
console.log(`passes para tras de CF/ST: ${n}`);
console.log(`avanco em ${JANELA}s : mediana ${med(amostras.map(a => a.avanco)).toFixed(1)} m ` +
    `(recuou em ${(100 * amostras.filter(a => a.avanco < 0).length / n).toFixed(0)}% dos casos)`);
console.log(`velocidade media     : ${med(amostras.map(a => a.velMedia)).toFixed(2)} m/s`);
console.log(`fraccao de frames parado (< 0.5 m/s): ` +
    `mediana ${(100 * med(amostras.map(a => a.parado))).toFixed(0)}%`);

/*
O QUE INTERESSA E A CAUDA, e nao a mediana: o relato e sobre o avancado que
PARA, e um que para em cada dez nao mexe a mediana nenhuma. Aqui estao os casos
em que ele passou mais de 40% da janela abaixo de 0.5 m/s.
*/
const parados = amostras.filter(a => a.parado > 0.4);
console.log(`
casos com mais de 40% da janela parado: ${parados.length} ` +
    `(${(100 * parados.length / n).toFixed(0)}%)`);
for (const a of parados.slice(0, 12)) {
    console.log(`  parado ${(100 * a.parado).toFixed(0)}%  avanco ${a.avanco.toFixed(1)} m  ` +
        `vel ${a.velMedia.toFixed(2)} m/s
      estados [${a.estados}]
      arvore  [${a.accoes}]`);
}

const contagem = {};
for (const a of amostras) contagem[a.estados] = (contagem[a.estados] || 0) + 1;
console.log('\nestados por que passou na janela (os 8 mais comuns):');
Object.entries(contagem).sort((x, y) => y[1] - x[1]).slice(0, 8)
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}x  ${k}`));
