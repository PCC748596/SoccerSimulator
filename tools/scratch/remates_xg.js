/*
DISTRIBUICAO DO xG DOS REMATES. Diz que corte de xG tira que fatia deles.
*/
const segundos = Number(process.argv[2] || 2400);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260918));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const xgs = [];
const orig = global.executeShotGameplay;
global.executeShotGameplay = function (p) {
    xgs.push(xgDoRemate(p.model.position.x, p.model.position.z, p.targetGoalZ, LARGURA_BALIZA, XGModel));
    return orig(p);
};
for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

xgs.sort((a, b) => a - b);
const soma = xgs.reduce((a, b) => a + b, 0);
console.log(xgs.length + ' remates em ' + (segundos / 60).toFixed(0) + ' min | xG medio ' +
    (soma / xgs.length).toFixed(3));
console.log('  percentis: p10 ' + xgs[Math.floor(xgs.length * 0.1)].toFixed(3) +
    ' | p25 ' + xgs[Math.floor(xgs.length * 0.25)].toFixed(3) +
    ' | p33 ' + xgs[Math.floor(xgs.length * 0.33)].toFixed(3) +
    ' | mediana ' + xgs[Math.floor(xgs.length * 0.5)].toFixed(3) +
    ' | p75 ' + xgs[Math.floor(xgs.length * 0.75)].toFixed(3));
console.log('  quanto se corta com cada tecto de xG:');
for (const c of [0.01, 0.02, 0.03, 0.04, 0.05, 0.06]) {
    const n = xgs.filter(v => v < c).length;
    const restantes = xgs.filter(v => v >= c);
    const novoMedio = restantes.length ? restantes.reduce((a, b) => a + b, 0) / restantes.length : 0;
    console.log('    xG >= ' + c.toFixed(2) + ' -> corta ' + n + ' (' + (100 * n / xgs.length).toFixed(0) +
        '%), sobram ' + restantes.length + ' com xG medio ' + novoMedio.toFixed(3));
}
