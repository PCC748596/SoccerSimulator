/*
A CRONOLOGIA DA DEFESA: quanto tempo ele tem, e onde está a mão quando a bola
chega à linha.

O lote de 60 jogos dá 4.89 golos (194% do alvo) com 25.67 remates (98%) e
xG 1.56: o volume está certo, o que falha é a CONVERSÃO — 67% dos remates
enquadrados acabam em golo, contra os ~30% de um jogo a sério.

Mede, remate a remate: o tempo de voo até à linha, quando ele reage, quando o
mergulho arranca, quantos metros de lado precisava e a que distância a mão
passou da bola.

Uso: node tools/headless/gk_cronologia.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 900);
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

const _v = new THREE.Vector3();
const distMao = (gk) => {
    if (!gk || !gk.rig) return Infinity;
    let d = Infinity;
    for (const nome of ['lHand', 'rHand']) {
        const mao = gk.rig[nome];
        if (!mao) continue;
        mao.getWorldPosition(_v);
        d = Math.min(d, _v.distanceTo(Match.ball.position));
    }
    return d;
};

const lances = [];
let lance = null;
{
    const orig = global.tipoDeRemate;
    global.tipoDeRemate = function (o) {
        const t = orig(o);
        const p = Match.ballCarrier || Match.lastTouchedPlayer;
        if (!p) return t;
        const gk = (p.team === 'TeamA') ? Match.opponents[0] : Match.players[0];
        lance = {
            gk: gk, tipo: t, t: 0,
            dist: Math.hypot(p.model.position.x, p.dirZ * (CAMPO_COMP / 2) - p.model.position.z),
            reagiuEm: null, mergulhouEm: null, lateral: null,
            minMao: Infinity, naLinha: null, dentro: null, tocou: false,
            gkX0: gk.model.position.x, gkZ0: gk.model.position.z,
            bolaX0: Match.ball.position.x, rematadorX: p.model.position.x
        };
        lances.push(lance);
        return t;
    };
}

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (!lance) continue;
    const gk = lance.gk;
    lance.t += dt;
    lance.minMao = Math.min(lance.minMao, distMao(gk));

    if (lance.reagiuEm === null && gk.gkReagiu) lance.reagiuEm = lance.t;
    if (lance.mergulhouEm === null && (gk.gkEstado === 'mergulho' || gk.gkEstado === 'maos')) {
        lance.mergulhouEm = lance.t;
        lance.lateral = Math.abs((gk.gkAlvoX || 0) - gk.model.position.x);
        lance.estado = gk.gkEstado;
    }

    // Instante em que a bola chega ao plano da linha de golo.
    const zLinha = gk.ownGoalZ;
    if (lance.naLinha === null && Math.abs(Match.ball.position.z) >= Math.abs(zLinha) - 0.3) {
        lance.naLinha = lance.t;
        lance.dentro = Math.abs(Match.ball.position.x) < LARGURA_BALIZA / 2 &&
            Match.ball.position.y < ALTURA_BALIZA;
        lance.maoNaLinha = distMao(gk);
        lance.entradaX = Match.ball.position.x;
        lance.gkXFinal = gk.model.position.x;
        lance = null;
    } else if (lance.t > 4 || Match.ballCarrier) {
        lance = null;
    }
}

const med = (a) => { const v = a.filter(x => x !== null && isFinite(x)); return v.length ? (v.reduce((x, y) => x + y, 0) / v.length).toFixed(2) : '-'; };
const naBaliza = lances.filter(l => l.naLinha !== null && l.dentro);
console.log(`\n${(Match.tempoDeJogo / 60).toFixed(0)} min | ${lances.length} remates | ${naBaliza.length} chegaram DENTRO da moldura`);
console.log(`tempo de voo ate a linha:     ${med(naBaliza.map(l => l.naLinha))} s`);
console.log(`ele reage aos:                ${med(naBaliza.map(l => l.reagiuEm))} s`);
console.log(`o mergulho arranca aos:       ${med(naBaliza.map(l => l.mergulhouEm))} s`);
console.log(`sobra-lhe para chegar la:     ${med(naBaliza.map(l => (l.naLinha - (l.mergulhouEm || l.naLinha))))} s`);
console.log(`metros de lado que precisava: ${med(naBaliza.map(l => l.lateral))} m`);
console.log(`mao a bola quando ela entra:  ${med(naBaliza.map(l => l.maoNaLinha))} m (mais perto no lance: ${med(naBaliza.map(l => l.minMao))})`);
console.log(`|x| do guarda-redes no remate: ${med(naBaliza.map(l => Math.abs(l.gkX0)))} m | avanco da linha: ${med(naBaliza.map(l => Math.abs(l.gkZ0) - CAMPO_COMP / 2))} m`);
console.log(`|x| do rematador: ${med(naBaliza.map(l => Math.abs(l.rematadorX)))} | x de ENTRADA da bola: ${med(naBaliza.map(l => Math.abs(l.entradaX)))} | |x| dele no fim: ${med(naBaliza.map(l => Math.abs(l.gkXFinal)))}`);
console.log(`remate de:                    ${med(naBaliza.map(l => l.dist))} m`);
const perto = naBaliza.filter(l => l.minMao < 0.6).length;
console.log(`chegou a menos de 0.6 m da bola em ${perto}/${naBaliza.length} (${(100 * perto / Math.max(1, naBaliza.length)).toFixed(0)}%)`);
