/*
OS PASSOS DO FRAME SÃO TODOS DO MESMO TAMANHO.

O loop do `animate` (js/main.js) partia o tempo do frame em fatias de
`PASSO_MAX` mais um RESTO: `passo = min(PASSO_MAX, restante)`. Com um frame de
25.1 ms e um tecto de 24.75 ms saíam dois passos — um de 24.75 ms e outro de
0.35 ms.

O segundo passo é o problema. Todo o `Match.update` corre nele: a FSM, o
`animateBones` e, lá dentro, o `lerpTo`, que suaviza por CHAMADA e não por
segundo. Medido no harness, um passo de 0.2 ms move a articulação exactamente
o mesmo que um passo de 16.7 ms (lArm.x 1.0000 -> 0.8500 nos dois). Ou seja:
o frame que parte gasta duas doses inteiras de suavização e o frame que não
parte gasta uma — e a animação avança a ritmos diferentes de frame para frame.

`partirPasso` devolve N passos IGUAIS que somam o mesmo tempo. O jogo avança
o mesmo; o que desaparece é a fatia minúscula com uma dose inteira em cima.

Corre com: node tests/passo_partido.test.js
*/
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(RAIZ, 'js', 'utils.js'), 'utf8');

// Extrai a função de produção, tal e qual — não uma cópia dela.
const i = src.indexOf('function partirPasso');
if (i < 0) throw new Error('partirPasso não existe em js/utils.js');
let nivel = 0, fim = -1, comecou = false;
for (let k = i; k < src.length; k++) {
    if (src[k] === '{') { nivel++; comecou = true; }
    else if (src[k] === '}') { nivel--; if (comecou && nivel === 0) { fim = k + 1; break; } }
}
const partirPasso = new Function(src.slice(i, fim) + '; return partirPasso;')();

let falhas = 0;
function exigir(cond, msg) {
    if (!cond) { console.log('FALHA: ' + msg); falhas++; }
    else console.log('ok: ' + msg);
}
const perto = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);

const PASSO_MAX = (1 / 60) * 0.99 * 1.5;   // 24.75 ms, o do js/main.js

// 1. Frame normal a 60 fps: um passo só, do tamanho do frame.
{
    const r = partirPasso(0.0165, PASSO_MAX);
    exigir(r.n === 1, 'frame de 16.5 ms dá 1 passo (deu ' + r.n + ')');
    exigir(perto(r.passo, 0.0165), 'e o passo é o frame inteiro');
}

// 2. O caso que motivou isto: 25.1 ms com tecto de 24.75 ms.
{
    const r = partirPasso(0.0251, PASSO_MAX);
    exigir(r.n === 2, '25.1 ms dá 2 passos (deu ' + r.n + ')');
    exigir(perto(r.passo, 0.01255), 'passos iguais de 12.55 ms, e não 24.75 + 0.35');
    exigir(r.passo <= PASSO_MAX + 1e-12, 'nenhum passo passa o tecto');
    exigir(perto(r.n * r.passo, 0.0251), 'o tempo total do frame é respeitado');
}

// 3. Frame gordo: continua a dar passos iguais e nenhum acima do tecto.
{
    const r = partirPasso(0.080, PASSO_MAX);
    exigir(r.n === 4, '80 ms dá 4 passos (deu ' + r.n + ')');
    exigir(r.passo <= PASSO_MAX + 1e-12, 'nenhum passo passa o tecto');
    exigir(perto(r.n * r.passo, 0.080), 'o tempo total é respeitado');
}

// 4. A GUARDA da espiral: o tecto de passos por frame mantém-se, e quando ela
//    morde perde-se tempo de jogo em vez de se pedir mais trabalho ao frame.
{
    const r = partirPasso(10.0, PASSO_MAX);
    exigir(r.n <= 40, 'a guarda de 40 passos por frame mantém-se (deu ' + r.n + ')');
    exigir(r.passo <= PASSO_MAX + 1e-12, 'e mesmo aí nenhum passo passa o tecto');
}

// 5. Frame degenerado: nunca devolve zero passos nem passo negativo.
{
    const r = partirPasso(0, PASSO_MAX);
    exigir(r.n >= 1 && r.passo >= 0, 'restante zero não devolve lixo (n=' + r.n + ')');
}

console.log(falhas === 0 ? 'PASSOU' : 'FALHOU (' + falhas + ')');
process.exit(falhas === 0 ? 0 : 1);
