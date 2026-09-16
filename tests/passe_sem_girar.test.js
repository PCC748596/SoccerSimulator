/*
ATE 70 GRAUS PASSA-SE SEM RODAR, E ACIMA DISSO RODA-SE SO ATE AOS 70.

Pedido: "ajusta para que os passes ate 70 graus para cada lado da linha de
deslocamento possam ser feitos sem que o jogador tenha que girar para a
trajetoria do passe. Alem disso, o jogador tera que girar ate que a linha de
passe fique no limite dos 70 graus."

O que havia:

  - o `turnForPass` (player.js) ligava-se so acima dos 90 graus
    (`dotCorrida < 0`), portanto entre 70 e 90 ele passava de lado sem rodar,
    e acima de 90 rodava;
  - e quando rodava, o `case 'PASS'` (fsm.js) fazia slerp do corpo ate ficar
    de frente PARA O ALVO -- zero graus, e nao os 70 do pedido.

A geometria vive no `direccaoDoCorpoNoPasse` (utils.js), pura e com o angulo
injectado, para se poder varrer sem montar um jogo.

Corre com: node --test tests/passe_sem_girar.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

require('../tools/headless/harness.js');

const GRAU = Math.PI / 180;
// Vector unitario a `g` graus do +Z, no plano XZ.
const dir = (g) => ({ x: Math.sin(g * GRAU), z: Math.cos(g * GRAU) });
const anguloEntre = (a, b) => {
    const na = Math.hypot(a.x, a.z) || 1, nb = Math.hypot(b.x, b.z) || 1;
    const c = Math.max(-1, Math.min(1, (a.x * b.x + a.z * b.z) / (na * nb)));
    return Math.acos(c) / GRAU;
};

test('o limite existe na configuracao e sao 70 graus', () => {
    assert.strictEqual(typeof PassModel.anguloLivreGraus, 'number',
        'PassModel.anguloLivreGraus desapareceu');
    assert.strictEqual(PassModel.anguloLivreGraus, 70);
});

test('ate 70 graus o corpo nao roda nada', () => {
    const frente = dir(0);
    for (const g of [0, 15, 35, 55, 69, 70]) {
        for (const s of [1, -1]) {
            const alvo = dir(g * s);
            const novo = direccaoDoCorpoNoPasse(frente, alvo, PassModel.anguloLivreGraus * GRAU);
            assert.strictEqual(novo, null,
                `a ${g * s} graus mandou rodar, e nao devia`);
        }
    }
});

test('acima de 70 roda so ate o passe ficar nos 70', () => {
    const frente = dir(0);
    for (const g of [75, 90, 120, 179]) {
        for (const s of [1, -1]) {
            const alvo = dir(g * s);
            const novo = direccaoDoCorpoNoPasse(frente, alvo, PassModel.anguloLivreGraus * GRAU);
            assert.ok(novo, `a ${g * s} graus nao mandou rodar`);

            const sobra = anguloEntre(novo, alvo);
            assert.ok(Math.abs(sobra - 70) < 0.5,
                `a ${g * s} graus ficou a ${sobra.toFixed(1)} graus do alvo (devia ser 70)`);

            // E roda o MINIMO: fica do lado de onde ele vinha.
            const rodou = anguloEntre(frente, novo);
            assert.ok(Math.abs(rodou - (g - 70)) < 0.5,
                `a ${g * s} graus rodou ${rodou.toFixed(1)} em vez de ${(g - 70).toFixed(1)}`);
        }
    }
});

test('o passe exactamente para tras roda para um dos lados, e so 110 graus', () => {
    const frente = dir(0);
    const novo = direccaoDoCorpoNoPasse(frente, dir(180), PassModel.anguloLivreGraus * GRAU);
    assert.ok(novo, 'com o alvo nas costas nao mandou rodar');
    assert.ok(Math.abs(anguloEntre(novo, dir(180)) - 70) < 0.5,
        'com o alvo nas costas nao parou nos 70 graus');
    assert.ok(Math.abs(anguloEntre(frente, novo) - 110) < 0.5,
        'com o alvo nas costas nao rodou os 110 que faltavam');
});

test('e o jogo usa o limite: o turnForPass ja nao espera pelos 90', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'player.js'), 'utf8');
    assert.ok(!/this\.turnForPass = \(dotCorrida < 0\)/.test(src),
        'o limite dos 90 graus (dotCorrida < 0) ainda la esta');
    assert.ok(src.includes('anguloLivreGraus'),
        'o initiatePass nao le o limite da configuracao');
    const fsm = fs.readFileSync(path.join(__dirname, '..', 'js', 'fsm.js'), 'utf8');
    assert.ok(fsm.includes('direccaoDoCorpoNoPasse'),
        'o case PASS continua a rodar o corpo para o alvo em vez do limite');
});
