const segundos = Number(process.argv[2] || 1200);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260917));
require('../headless/harness.js');
window.__diagCabeca = [];
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);
const d = window.__diagCabeca;
console.log(d.length + ' avaliacoes a altura da testa');
if (d.length) {
    const m = (f) => d.reduce((a, e) => a + f(e), 0) / d.length;
    console.log('  distancia do ESCOLHIDO: media ' + m(e => e.distBest).toFixed(2) +
        ' | do mais perto do campo: ' + m(e => e.distMaisPerto).toFixed(2));
    console.log('  escolhido <= 0.45: ' + d.filter(e => e.distBest <= 0.45).length +
        ' | mais perto <= 0.45: ' + d.filter(e => e.distMaisPerto <= 0.45).length);
    console.log('  escolhido com touchLock: ' + d.filter(e => e.lock > 0).length);
}
