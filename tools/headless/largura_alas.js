/*
A LARGURA DOS QUATRO HOMENS DE ALA — laterais E médios de ala.

Relato, com captura do campo com os anéis de debug ligados: *"os laterais e
meias pelas laterais ainda estão entrando muito pelo meio. Na imagem dá pra ver
o RM vermelho se confundindo com o CM vermelho. Lateral vermelho e meia
vermelho a pelo menos uns 15 metros de suas posições."*

A sessão de 8 de Setembro mediu e arrumou o LATERAL (|x| do alvo de 10.4 para
17.8 m, por dentro do central de 12.7% para 0.4%), e o
`tools/headless/laterais_largura.js` confirma que ele continua lá: 17.2 m de
posição contra 19.0 do posto. **Mas essa ferramenta nunca olhou para o médio de
ala**, e é ele que o relato nomeia primeiro.

Mede, para os quatro postos de ala (LB, RB, LM, RM):

  - o |x| em cada fase — posto da formação, slot do bloco, alvo final, corpo —
    para se ver ONDE a largura se perde, e não só que se perdeu;
  - o DESVIO ao posto, que é o "15 metros" do relato: distância do corpo ao
    `baseTarget`, e do alvo ao `baseTarget`;
  - e quantas vezes o homem de ala fica MAIS POR DENTRO do que o companheiro
    central da mesma linha — o RM por dentro do CM é literalmente a imagem.

Uso: node tools/headless/largura_alas.js [segundos] [semente]
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
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

/*
INTERRUPTORES, para se isolar QUAL das regras do tickFinal come a largura, sem
tocar no config de producao:

  MOLA=0     desliga a mola de coesao a bola
  MAXX=999   desliga o tecto de afastamento LATERAL a bola (distanciaMaxX)
  SEPAR=0    desliga a separacao lateral<->meia
*/
if (process.env.MOLA !== undefined) {
    MolaDeCoesao.forcaComBola = Number(process.env.MOLA);
    MolaDeCoesao.forcaSemBola = Number(process.env.MOLA);
}
if (process.env.MAXX) BlockShape.distanciaMaxX = Number(process.env.MAXX);
if (process.env.SEPAR !== undefined) BlockShape.separacaoLateral = Number(process.env.SEPAR);

const ALA = ['LB', 'RB', 'LM', 'RM'];
// O companheiro central da mesma linha: é contra ele que se vê o embolamento.
const CENTRAL = { LB: 'CB', RB: 'CB', LM: 'CM', RM: 'CM' };

const dados = {};
const reg = (pos, campo, v) => {
    const r = dados[pos] || (dados[pos] = {});
    (r[campo] = r[campo] || []).push(v);
};
const porDentro = {};   // ala mais interior que o central da mesma linha
const total = {};

const abs = (v) => Math.abs(v);

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    // Uma leitura a cada 10 frames chega, e não enche a memória.
    if (i % 10) continue;
    // Só jogo corrido: nas bolas paradas as posições são impostas pelo lance.
    if (typeof Match.state === 'string' && Match.state !== 'PLAY') continue;

    for (const lista of [Match.players, Match.opponents]) {
        for (const p of lista) {
            if (!p || p.role === 'gk' || !p.model || ALA.indexOf(p.pos) < 0) continue;

            reg(p.pos, 'corpo', abs(p.model.position.x));
            if (p.baseTarget) reg(p.pos, 'posto', abs(p.baseTarget.x));
            if (p.slotTarget) reg(p.pos, 'slot', abs(p.slotTarget.x));
            if (p.postoBase) reg(p.pos, 'estilo', abs(p.postoBase.x));
            if (p.dynamicTarget) reg(p.pos, 'alvo', abs(p.dynamicTarget.x));

            /*
            O DESVIO AO POSTO, que é o "15 metros" do relato. Separa-se em duas
            metades: quanto o ALVO já se afastou do posto (decisão), e quanto o
            CORPO está longe do alvo (ele ainda vem a caminho).
            */
            if (p.baseTarget && p.dynamicTarget) {
                reg(p.pos, 'desvioAlvo', Math.hypot(
                    p.dynamicTarget.x - p.baseTarget.x, p.dynamicTarget.z - p.baseTarget.z));
                reg(p.pos, 'desvioCorpo', Math.hypot(
                    p.model.position.x - p.baseTarget.x, p.model.position.z - p.baseTarget.z));
            }

            /*
            EMBOLADO COM O CENTRAL: o homem de ala está mais perto do eixo do
            que o companheiro central da mesma linha, do MESMO lado do campo.
            É o "RM a confundir-se com o CM" da captura.
            */
            const meuLado = Math.sign(p.model.position.x) || 1;
            const centrais = lista.filter(o => o && o.model && o.pos === CENTRAL[p.pos] &&
                (Math.sign(o.model.position.x) || 1) === meuLado);
            if (centrais.length) {
                total[p.pos] = (total[p.pos] || 0) + 1;
                const maisInterior = Math.min(...centrais.map(o => abs(o.model.position.x)));
                if (abs(p.model.position.x) < maisInterior) {
                    porDentro[p.pos] = (porDentro[p.pos] || 0) + 1;
                }
            }
        }
    }
}

const med = (a) => (a && a.length) ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const f = (a) => med(a).toFixed(1).padStart(6);

console.log(`\n${(Match.tempoDeJogo / 60).toFixed(0)} min | semente ${semente}\n`);
console.log('|x| MEDIO em cada fase (metros do eixo do campo)');
console.log('  pos    posto   slot   +estilo    alvo    corpo   |  perdido do posto ate ao corpo');
for (const pos of ALA) {
    const r = dados[pos];
    if (!r) continue;
    const perdido = med(r.posto) - med(r.corpo);
    console.log(`  ${pos.padEnd(5)} ${f(r.posto)} ${f(r.slot)} ${f(r.estilo)} ` +
        `${f(r.alvo)} ${f(r.corpo)}   |  ${perdido.toFixed(1)} m`);
}

console.log('\nDESVIO AO POSTO (o "15 metros" do relato)');
console.log('  pos    do ALVO ao posto   do CORPO ao posto   embolado com o central');
for (const pos of ALA) {
    const r = dados[pos];
    if (!r) continue;
    const pct = (100 * (porDentro[pos] || 0) / Math.max(1, total[pos] || 0)).toFixed(1);
    console.log(`  ${pos.padEnd(5)} ${f(r.desvioAlvo)} m          ${f(r.desvioCorpo)} m` +
        `            ${pct.padStart(5)}%`);
}
console.log('');
