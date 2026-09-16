/*
OS TRES ESTILOS QUE NAO MEXIAM NINGUEM: creative_playmaker, target_man e
extra_frontman.

Mede o DESLOCAMENTO que o estilo imprime (distancia entre o alvo que entra no
aplicarEstiloPosicional e o que sai) e, no caso do playmaker, a que distancia
do adversario mais proximo esse alvo fica.

Uso: node tools/scratch/estilos_novos.js [segundos]
*/
const segundos = Number(process.argv[2] || 900);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260920));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const alvo = ['creative_playmaker', 'target_man', 'extra_frontman'];
const dados = {};
for (const e of alvo) dados[e] = { n: 0, desloc: 0, deslocMax: 0, distOpp: 0, nOpp: 0, pivo: 0, rompe: 0 };

const original = global.aplicarEstiloPosicional;
global.aplicarEstiloPosicional = function (p, bb, tx, tz) {
    const r = original(p, bb, tx, tz);
    const est = (typeof estiloAtivoDe === 'function') ? estiloAtivoDe(p) : null;
    const nome = p.estiloAtivo || (p.playingStyle) || null;
    if (nome && dados[nome] && bb && bb.isAttacking) {
        const d = Math.hypot(r.x - tx, r.z - tz);
        const D = dados[nome];
        D.n++; D.desloc += d; D.deslocMax = Math.max(D.deslocMax, d);
        if (nome === 'creative_playmaker' && bb.opp) {
            let min = Infinity;
            for (const o of bb.opp) {
                if (o.role === 'gk') continue;
                const dd = Math.hypot(o.model.position.x - r.x, o.model.position.z - r.z);
                if (dd < min) min = dd;
            }
            if (isFinite(min)) { D.distOpp += min; D.nOpp++; }
        }
        if (nome === 'target_man') {
            const meu = r.z * p.dirZ, bola = bb.ballZ * bb.dir;
            if (meu - bola > PlayingStyleTuning.targetMan.distParaRomper) D.pivo++; else D.rompe++;
        }
    }
    return r;
};

/*
FORCA os tres estilos: o baralho de skills pode nao os atribuir a ninguem nesta
semente, e o que se quer medir e o COMPORTAMENTO, nao o sorteio. E poe a equipa
a perder perto do fim, que e a condicao do extra_frontman.
*/
const forcar = [
    ['creative_playmaker', p => p.pos === 'SS' || p.pos === 'AM' || p.pos === 'LM'],
    ['target_man', p => p.pos === 'CF'],
    ['extra_frontman', p => p.pos === 'CB']
];
for (const p of Match.players.concat(Match.opponents)) {
    for (const [nome, cond] of forcar) {
        if (cond(p)) { p.playingStyle = nome; p.estiloBase = nome; break; }
    }
}
Match.placarA = 0; Match.placarB = 1;
Match.tempoDeJogo = MatchDuration.halfGameMinutes * 2 * 60 - 120;   // faltam 2 min

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

console.log('estilo               frames   deslocamento medio   maximo   extra');
for (const e of alvo) {
    const D = dados[e];
    if (!D.n) { console.log(e.padEnd(20) + '  sem frames activos'); continue; }
    let extra = '';
    if (e === 'creative_playmaker' && D.nOpp) extra = 'alvo a ' + (D.distOpp / D.nOpp).toFixed(1) + ' m do adversario mais perto';
    if (e === 'target_man') extra = 'pivo ' + (100 * D.pivo / D.n).toFixed(0) + '% / rompe ' + (100 * D.rompe / D.n).toFixed(0) + '%';
    console.log(e.padEnd(20) + String(D.n).padStart(7) + '  ' + (D.desloc / D.n).toFixed(2).padStart(17) +
        '  ' + D.deslocMax.toFixed(2).padStart(7) + '   ' + extra);
}
