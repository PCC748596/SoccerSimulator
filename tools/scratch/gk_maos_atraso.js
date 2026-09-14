/*
QUANTO SE MEXEM AS MAOS DO GUARDA-REDES ENTRE O TESTE DE DEFESA E O DESENHO.

O `updateBall()` (que resolve o contacto bola-maos) corre ANTES do
`players.forEach(p => p.update(dt))`, que e quem escreve a pose. O teste le,
portanto, as maos do frame ANTERIOR. Isto mede a diferenca.
*/
const segundos = Number(process.argv[2] || 1200);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 4242));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const noTeste = new Map();
const original = Match.updateBall.bind(Match);
Match.updateBall = function () {
    for (const gk of [Match.players[0], Match.opponents[0]]) {
        if (!gk || !gk.rig || !gk.rig.rHand) continue;
        gk.rig.rHand.getWorldPosition(_a);
        noTeste.set(gk, _a.clone());
    }
    return original();
};

const amostras = { mergulho: [], outros: [] };
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const gk of [Match.players[0], Match.opponents[0]]) {
        if (!gk || !gk.rig || !gk.rig.rHand || !noTeste.has(gk)) continue;
        // Só interessa quando a bola anda perto e depressa: é aí que decide.
        if (Match.ballVel.length() < 8) continue;
        if (gk.model.position.distanceTo(Match.ball.position) > 4) continue;
        gk.rig.rHand.getWorldPosition(_b);
        const erro = noTeste.get(gk).distanceTo(_b);
        (gk.gkEstado === 'mergulho' ? amostras.mergulho : amostras.outros).push(erro);
    }
}
for (const k of ['mergulho', 'outros']) {
    const a = amostras[k].sort((x, y) => x - y);
    if (!a.length) { console.log(k + ': sem amostras'); continue; }
    const soma = a.reduce((x, y) => x + y, 0);
    console.log(k.padEnd(9) + ' ' + String(a.length).padStart(5) + ' amostras | medio ' +
        (soma / a.length).toFixed(2) + ' m | mediana ' + a[Math.floor(a.length / 2)].toFixed(2) +
        ' m | p95 ' + a[Math.floor(a.length * 0.95)].toFixed(2) + ' m | max ' + a[a.length - 1].toFixed(2) + ' m');
}
