/*
A MARCACAO TEM UM CONE DE ANGULOS em volta da recta homem -> propria baliza.

`pontoDeMarcacao` (utils.js) poe o marcador entre o homem e a propria baliza, mas
com o desvio ao slot cortado em `biasMax`. Quando o corte aperta, o ponto sai da
recta e pode ficar AO LADO do homem, ou ate atras, em vez de do lado da baliza.
`anguloMax` (MarkingModel, config/defense.js) fecha isso: o ponto tem de ficar a
`anguloMax` graus ou menos da recta (0 = em cima da recta, 180 = sem cone).

O tecto `biasMax` MANDA: e a forma do bloco, e foi ganho a custo. O cone aproxima
o ponto da recta o que o tecto deixar, e nunca o rompe.

Corre com: node tests/marcacao_cone_de_angulo.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));
const srcUtils = ler('js/utils.js');
const srcDefense = ler('js/config/defense.js');

const j = srcUtils.indexOf('function pontoDeMarcacao(');
if (j < 0) throw new Error('pontoDeMarcacao não encontrada');
const ponto = new Function(srcUtils.slice(j, srcUtils.indexOf(LF + '}' + LF, j) + 3) + '; return pontoDeMarcacao;')();

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

// --- o modelo ---------------------------------------------------------------
{
    const i = srcDefense.indexOf('const MarkingModel = {');
    const m = srcDefense.slice(i, srcDefense.indexOf(LF + '};', i) + 3);
    if (!/\banguloMax\s*:/.test(m)) erro('MarkingModel.anguloMax em falta');
    else ok('MarkingModel.anguloMax existe');
}

// Angulo entre (ponto - homem) e a recta homem -> baliza, em graus.
const GOL_Z = -53;
const grau = (p, homem) => {
    let gx = 0 - homem.x, gz = GOL_Z - homem.z;
    const gl = Math.hypot(gx, gz); gx /= gl; gz /= gl;
    const vx = p.x - homem.x, vz = p.z - homem.z, vl = Math.hypot(vx, vz);
    return Math.acos(Math.max(-1, Math.min(1, (vx * gx + vz * gz) / vl))) * 180 / Math.PI;
};
const homem = { x: 0, z: -20 };
const slot = { x: 6, z: -20 };      // ao lado do homem
const DIST = 2.0, BIAS = 5.0;

// --- sem cone, ou com 180, e como antes ------------------------------------
{
    const a = ponto(slot.x, slot.z, homem.x, homem.z, GOL_Z, DIST, BIAS);
    const b = ponto(slot.x, slot.z, homem.x, homem.z, GOL_Z, DIST, BIAS, 180);
    if (Math.abs(a.x - b.x) > 1e-9 || Math.abs(a.z - b.z) > 1e-9) erro('anguloMax 180 devia dar o mesmo que sem argumento');
    else ok('180 graus = sem cone (' + grau(a, homem).toFixed(1) + ' graus)');
}

// --- o cone aproxima o ponto da recta, sem romper o tecto --------------------
{
    const sem = ponto(slot.x, slot.z, homem.x, homem.z, GOL_Z, DIST, BIAS);
    const com = ponto(slot.x, slot.z, homem.x, homem.z, GOL_Z, DIST, BIAS, 20);
    const gSem = grau(sem, homem), gCom = grau(com, homem);
    const desvio = Math.hypot(com.x - slot.x, com.z - slot.z);
    if (!(gCom < gSem)) erro('o cone devia aproximar da recta: ' + gSem.toFixed(1) + ' -> ' + gCom.toFixed(1));
    else ok('aproxima da recta: ' + gSem.toFixed(1) + ' -> ' + gCom.toFixed(1) + ' graus');
    if (desvio > BIAS + 1e-6) erro('o cone rompeu o tecto: desvio ' + desvio.toFixed(2) + ' > ' + BIAS);
    else ok('o tecto manda: desvio ' + desvio.toFixed(2) + ' m (tecto ' + BIAS + ')');
}

// --- nunca piora, e melhora onde o tecto deixa --------------------------------
{
    let pior = 0, melhorias = 0, casos = 0;
    for (const sx of [-12, -8, -6, -4, -2, 2, 4, 6, 8, 12]) for (const sz of [-26, -22, -20, -18, -14]) {
        const sem = ponto(sx, sz, homem.x, homem.z, GOL_Z, DIST, BIAS);
        const com = ponto(sx, sz, homem.x, homem.z, GOL_Z, DIST, BIAS, 20);
        const d = grau(com, homem) - grau(sem, homem);
        casos++;
        if (d > pior) pior = d;
        if (d < -0.01) melhorias++;
    }
    if (pior > 1e-6) erro('o cone piorou o angulo em ' + pior.toFixed(2) + ' graus');
    else ok('em ' + casos + ' casos o cone nunca piorou o angulo');
    if (melhorias === 0) erro('o cone nao melhorou nenhum caso');
    else ok('melhorou ' + melhorias + ' de ' + casos + ' casos (o resto: o tecto nao deixa, ou ja estava dentro)');
}

// --- cone 0 com folga: em cima da recta --------------------------------------
{
    // Slot a 2 m do homem, tecto 5: o ponto da recta esta ao alcance.
    const com = ponto(2.0, -20, homem.x, homem.z, GOL_Z, DIST, 5.0, 0);
    const g = grau(com, homem);
    if (g > 0.5) erro('cone 0 com folga devia ficar na recta: ' + g.toFixed(2) + ' graus');
    else ok('cone 0 com folga: ' + g.toFixed(2) + ' graus');
}

// --- o tecto nunca e rompido, seja qual for o cone ---------------------------
{
    let pior = 0;
    for (const sx of [-12, -6, -3, 0, 3, 6, 12]) for (const sz of [-26, -20, -14]) for (const cone of [0, 15, 45, 90, 180]) {
        const p = ponto(sx, sz, homem.x, homem.z, GOL_Z, DIST, BIAS, cone);
        pior = Math.max(pior, Math.hypot(p.x - sx, p.z - sz));
    }
    if (pior > BIAS + 1e-6) erro('desvio maximo ' + pior.toFixed(3) + ' acima do tecto ' + BIAS);
    else ok('em 105 combinacoes o desvio nunca passou de ' + pior.toFixed(2) + ' m');
}

// --- biasMax <= 0 continua a ser o slot -------------------------------------
{
    const p = ponto(slot.x, slot.z, homem.x, homem.z, GOL_Z, DIST, 0, 10);
    if (p.x !== slot.x || p.z !== slot.z) erro('biasMax 0 devia devolver o slot');
    else ok('biasMax 0: o slot');
}

if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK');
