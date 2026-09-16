/* Quantas vezes o teste do cabeceio e alcancado, e com que distancia. */
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
const todos = window.__diagCabeca;
const naAltura = todos.filter(e => e.naAltura);
console.log(todos.length + ' contactos avaliados | ' + naAltura.length + ' deles a altura da testa');
if (naAltura.length) {
    const d = naAltura.map(e => e.dist).sort((a, b) => a - b);
    console.log('  distancia nesses: media ' + (d.reduce((a, b) => a + b, 0) / d.length).toFixed(2) +
        ' | mediana ' + d[Math.floor(d.length / 2)].toFixed(2) + ' | minimo ' + d[0].toFixed(2) + ' m');
    for (const r of [0.32, 0.5, 0.75, 0.9]) {
        console.log('    <= ' + r + ' m: ' + d.filter(v => v <= r).length);
    }
}
