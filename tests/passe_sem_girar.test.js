/*
ATE 70 GRAUS PASSA-SE SEM RODAR; ACIMA DISSO RODA-SE UM GIRO FIXO DE 30.

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

SEGUNDA PASSAGEM -- a regra de cima mudou.

Pedido seguinte: *"quando um jogador for dar um passe com mais de 70 graus de
angulo para um lado ou para o outro ele deve primeiro girar uns 30 graus para o
lado do passe para depois dar o passe"*.

Ou seja o giro passou a ser CONSTANTE (`PassModel.giroGraus`), e nao uma
correccao que depende de quanto se excedeu o limite. As duas regras coincidem
exactamente a 100 graus (100 - 70 = 30); fora disso divergem, e a diferenca
maior esta no passe para tras -- a regra antiga rodava 110 graus, esta roda 30.
O limite dos 70 continua a ser o que decide SE se roda.

A geometria vive no `direccaoDoCorpoNoPasse` (utils.js), pura e com os angulos
injectados, para se poder varrer sem montar um jogo.

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

test('o giro fixo existe na configuracao e sao 30 graus', () => {
    assert.strictEqual(typeof PassModel.giroGraus, 'number',
        'PassModel.giroGraus tem de existir');
    assert.strictEqual(PassModel.giroGraus, 30);
});

test('acima de 70 roda sempre os mesmos 30 graus, para o lado do passe', () => {
    const frente = dir(0);
    const giro = PassModel.giroGraus;
    for (const g of [75, 90, 100, 120, 179]) {
        for (const s of [1, -1]) {
            const alvo = dir(g * s);
            const novo = direccaoDoCorpoNoPasse(frente, alvo,
                PassModel.anguloLivreGraus * GRAU, giro * GRAU);
            assert.ok(novo, `a ${g * s} graus nao mandou rodar`);

            // O giro e o mesmo, venha o passe a 75 ou a 179 graus.
            const rodou = anguloEntre(frente, novo);
            assert.ok(Math.abs(rodou - giro) < 0.5,
                `a ${g * s} graus rodou ${rodou.toFixed(1)} em vez de ${giro}`);

            // E e PARA O LADO DO PASSE: fica mais perto do alvo do que estava.
            const antes = anguloEntre(frente, alvo);
            const depois = anguloEntre(novo, alvo);
            assert.ok(depois < antes - 0.5,
                `a ${g * s} graus rodou para o lado errado ` +
                `(${antes.toFixed(1)} -> ${depois.toFixed(1)} graus do alvo)`);
            assert.ok(Math.abs(depois - (antes - giro)) < 0.5,
                `a ${g * s} graus ficou a ${depois.toFixed(1)} do alvo, esperado ` +
                `${(antes - giro).toFixed(1)}`);
        }
    }
});

/*
A 100 GRAUS AS DUAS REGRAS COINCIDEM, e vale a pena o teste dize-lo: e o unico
angulo em que rodar "o minimo ate aos 70" e rodar "30 fixos" dao o mesmo.
*/
test('a 100 graus o passe fica exactamente nos 70, como na regra antiga', () => {
    const frente = dir(0);
    const novo = direccaoDoCorpoNoPasse(frente, dir(100),
        PassModel.anguloLivreGraus * GRAU, PassModel.giroGraus * GRAU);
    assert.ok(Math.abs(anguloEntre(novo, dir(100)) - 70) < 0.5,
        'a 100 graus o passe devia acabar nos 70 do corpo');
});

test('o passe exactamente para tras roda para um dos lados, e so o giro fixo', () => {
    const frente = dir(0);
    const novo = direccaoDoCorpoNoPasse(frente, dir(180),
        PassModel.anguloLivreGraus * GRAU, PassModel.giroGraus * GRAU);
    assert.ok(novo, 'com o alvo nas costas nao mandou rodar');
    /*
    A regra antiga rodava os 110 que faltavam para o passe ficar nos 70. Esta
    roda o giro fixo e deixa a linha de passe nos 150 -- ele passa de costas na
    mesma, so com o corpo aberto para o lado certo. E o que o pedido descreve.
    */
    const rodou = anguloEntre(frente, novo);
    assert.ok(Math.abs(rodou - PassModel.giroGraus) < 0.5,
        `com o alvo nas costas rodou ${rodou.toFixed(1)} em vez de ${PassModel.giroGraus}`);
    assert.ok(Math.abs(anguloEntre(novo, dir(180)) - 150) < 0.5,
        'com o alvo nas costas a linha de passe devia ficar nos 150 graus');
});

/*
E SEM O GIRO INJECTADO A FUNCAO TEM DE SE PORTAR COMO DANTES -- e pura, e quem
a chama pode nao ter o config a mao.
*/
test('sem giro injectado volta a regra do limite', () => {
    const frente = dir(0);
    const novo = direccaoDoCorpoNoPasse(frente, dir(120), PassModel.anguloLivreGraus * GRAU);
    assert.ok(Math.abs(anguloEntre(frente, novo) - PassModel.anguloLivreGraus) < 0.5,
        'sem giro injectado devia rodar o proprio limite');
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
