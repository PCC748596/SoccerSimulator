/*
O PAINEL CURTO — as linhas do relatório que se usam para calibrar, numa
corrida seeded e comparável.

Uso: node tools/headless/painel.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 900);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);
const A = MatchStats.TeamA, B = MatchStats.TeamB;
const min = Match.tempoDeJogo / 60, k = 90 / min;
const soma = (f) => (f(A) + f(B)) * k;
const pct = (a, b) => b ? (100 * a / b).toFixed(0) + '%' : '-';
const golos = soma(s => s.remates.golos), rem = soma(s => s.remates.tentados);
const tot = soma(s => s.ataques.totais), per = soma(s => s.ataques.perigosos);
console.log(`semente ${semente}: golos ${golos.toFixed(2)} (${pct(golos, 2.52)}) | ` +
    `remates ${rem.toFixed(1)} (${pct(rem, 26.11)}) | ataques ${tot.toFixed(0)} (${pct(tot, 176.63)}) | ` +
    `perigosos ${per.toFixed(0)} (${pct(per, 77.84)}) | passes certos ${pct(soma(s => s.passes.certos), soma(s => s.passes.tentados))}`);
