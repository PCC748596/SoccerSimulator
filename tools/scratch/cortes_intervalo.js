/*
DE QUANTO EM QUANTO TEMPO O MESMO JOGADOR TENTA OUTRO CORTE.

Conta cada tentativa de desarme (de pe e carrinho) e mede o intervalo ate a
tentativa seguinte DO MESMO JOGADOR.

Uso: node tools/scratch/cortes_intervalo.js [segundos]
*/
const segundos = Number(process.argv[2] || 2400);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260917));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let agora = 0;
const ultima = new Map();
const intervalos = [];
let total = 0, dePe = 0, carrinhos = 0;
function registar(p, tipo) {
    total++;
    if (tipo === 'carrinho') carrinhos++; else dePe++;
    if (ultima.has(p)) intervalos.push(agora - ultima.get(p));
    ultima.set(p, agora);
}
/*
O `actSlideTackle` reencaminha para o `actTackle` quando o jogador nao pode
fazer carrinho (amarelo). E UMA tentativa, nao duas: sem esta bandeira ela
aparecia duas vezes no mesmo frame e falseava o minimo do intervalo.
*/
let dentroDeSlide = false;
const origTackle = global.actTackle, origSlide = global.actSlideTackle;
global.actTackle = function (ctx) { if (!dentroDeSlide) registar(ctx.p, 'pe'); return origTackle(ctx); };
global.actSlideTackle = function (ctx) {
    registar(ctx.p, 'carrinho');
    dentroDeSlide = true;
    try { return origSlide(ctx); } finally { dentroDeSlide = false; }
};

for (let i = 0; i < Math.round(segundos / dt); i++) { agora = i * dt; Match.update(dt); }

intervalos.sort((a, b) => a - b);
console.log(total + ' tentativas de corte em ' + (segundos / 60).toFixed(0) + ' min (' +
    dePe + ' de pe, ' + carrinhos + ' carrinhos)');
if (!intervalos.length) { console.log('nenhum jogador repetiu'); }
else {
    const soma = intervalos.reduce((a, b) => a + b, 0);
    console.log('intervalo ate a tentativa seguinte DO MESMO JOGADOR:');
    console.log('  amostras ' + intervalos.length + ' | medio ' + (soma / intervalos.length).toFixed(2) +
        ' s | mediana ' + intervalos[Math.floor(intervalos.length / 2)].toFixed(2) +
        ' s | minimo ' + intervalos[0].toFixed(2) + ' s');
    for (const corte of [0.5, 1, 2, 3, 6]) {
        const n = intervalos.filter(v => v < corte).length;
        console.log('  abaixo de ' + corte + ' s: ' + n + ' (' + (100 * n / intervalos.length).toFixed(0) + '%)');
    }
}
