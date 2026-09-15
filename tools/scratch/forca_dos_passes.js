/*
A FORCA DOS PASSES, por tipo e por distancia: velocidade de saida.

Mede o instante em que a bola sai do pe (passe, lancamento, lateral) e a
distancia ao alvo pretendido.

Uso: node tools/scratch/forca_dos_passes.js [segundos]
*/
const segundos = Number(process.argv[2] || 2400);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260925));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const registos = [];
const origPasse = global.executePassGameplay;
global.executePassGameplay = function (p) {
    const alvo = p.passTargetPos || (p.passTarget && p.passTarget.model && p.passTarget.model.position);
    const dist = alvo ? Math.hypot(alvo.x - p.model.position.x, alvo.z - p.model.position.z) : null;
    const lanc = !!p.passeLongo || !!p.lancamento;
    const r = origPasse(p);
    registos.push({ tipo: p.isCross ? 'cruzamento' : (lanc ? 'lancamento' : 'passe'),
        dist: dist, vel: Match.ballVel.length(), alto: Match.ballVel.y > 1.5 });
    return r;
};

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

function faixa(d) {
    if (d === null) return '?';
    if (d < 8) return '0-8m';
    if (d < 15) return '8-15m';
    if (d < 25) return '15-25m';
    return '25m+';
}
const por = {};
for (const r of registos) {
    const k = faixa(r.dist);
    (por[k] = por[k] || []).push(r.vel);
}
console.log(registos.length + ' passes em ' + (segundos / 60).toFixed(0) + ' min');
console.log('faixa      n     vel mediana   p95    maximo');
for (const k of ['0-8m', '8-15m', '15-25m', '25m+', '?']) {
    const a = (por[k] || []).sort((x, y) => x - y);
    if (!a.length) continue;
    console.log(k.padEnd(10) + String(a.length).padStart(4) + '  ' +
        a[Math.floor(a.length / 2)].toFixed(1).padStart(11) + '  ' +
        a[Math.floor(a.length * 0.95)].toFixed(1).padStart(5) + '  ' +
        a[a.length - 1].toFixed(1).padStart(8));
}
