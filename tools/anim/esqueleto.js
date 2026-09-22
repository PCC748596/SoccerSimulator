/*
Traca o esqueleto sobre uma imagem de referencia: linhas rectas por segmento
(pe, canela, coxa, tronco, braco, antebraco, mao, cabeca) e um circulo em cada
juncao. As coordenadas estao no espaco da imagem ORIGINAL.
*/
const { lerPNG, escreverPNG, ampliar, linha, circulo } = require('./img.js');
const fs = require('fs');

const OSSOS = [
    ['cabeca', 'pescoco', [255, 210, 60]],
    ['pescoco', 'anca', [255, 210, 60]],
    ['pescoco', 'ombroE', [90, 200, 255]], ['ombroE', 'cotoveloE', [90, 200, 255]], ['cotoveloE', 'maoE', [90, 200, 255]],
    ['pescoco', 'ombroD', [90, 140, 255]], ['ombroD', 'cotoveloD', [90, 140, 255]], ['cotoveloD', 'maoD', [90, 140, 255]],
    ['anca', 'joelhoChute', [255, 90, 90]], ['joelhoChute', 'tornozeloChute', [255, 90, 90]], ['tornozeloChute', 'bicoChute', [255, 40, 40]],
    ['anca', 'joelhoApoio', [120, 255, 120]], ['joelhoApoio', 'tornozeloApoio', [120, 255, 120]], ['tornozeloApoio', 'bicoApoio', [40, 220, 40]]
];

const ficha = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const k = +(process.argv[3] || 4);
const im = ampliar(lerPNG(ficha.imagem), k);
const P = {};
for (const n in ficha.juntas) P[n] = { x: ficha.juntas[n][0] * k, y: ficha.juntas[n][1] * k };

for (const [a, b, c] of OSSOS) if (P[a] && P[b]) linha(im, P[a].x, P[a].y, P[b].x, P[b].y, c, Math.max(1, k / 2 | 0));
for (const n in P) { circulo(im, P[n].x, P[n].y, k + 2, [20, 20, 20], true); circulo(im, P[n].x, P[n].y, k + 2, [255, 255, 255], false); }
if (ficha.bola) circulo(im, ficha.bola[0] * k, ficha.bola[1] * k, (ficha.bola[2] || 10) * k, [255, 255, 0], false);
escreverPNG(im.W, im.H, im.px, process.argv[4]);

/* ---- angulos, para copiar ao rig ---- */
const ang = (a, b) => {
    // graus face a VERTICAL PARA BAIXO, positivo = o segmento aponta para a
    // direita da imagem. E o mesmo referencial em que se leem as coxas.
    const dx = P[b].x - P[a].x, dy = P[b].y - P[a].y;
    return Math.atan2(dx, dy) * 180 / Math.PI;
};
console.log(`\n${ficha.nome} — angulos medidos na imagem (graus face a vertical para baixo, + = para a direita)`);
for (const [a, b] of [['anca', 'joelhoChute'], ['joelhoChute', 'tornozeloChute'],
    ['anca', 'joelhoApoio'], ['joelhoApoio', 'tornozeloApoio'],
    ['pescoco', 'ombroE'], ['ombroE', 'cotoveloE'], ['cotoveloE', 'maoE'],
    ['ombroD', 'cotoveloD'], ['cotoveloD', 'maoD']])
    if (P[a] && P[b]) console.log(`  ${(a + ' -> ' + b).padEnd(30)} ${ang(a, b).toFixed(0).padStart(5)}`);
if (P.anca && P.pescoco) console.log(`  ${'tronco (anca -> pescoco)'.padEnd(30)} ${(ang('anca', 'pescoco') - 180).toFixed(0).padStart(5)}   (0 = a prumo)`);
