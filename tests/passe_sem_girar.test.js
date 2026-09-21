/*
ATE 70 GRAUS PASSA-SE SEM RODAR; ACIMA DISSO RODA-SE DE 30 EM 30 ATE CABER.

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

SEGUNDA PASSAGEM -- a regra de cima mudou, e a terceira corrigiu-a.

Pedido seguinte: *"quando um jogador for dar um passe com mais de 70 graus de
angulo para um lado ou para o outro ele deve primeiro girar uns 30 graus para o
lado do passe para depois dar o passe"*.

Isso foi lido como "roda 30 graus e passa dai", e o teste passou a exigir
exactamente isso -- um giro fixo de um passo. Estava errado, e o esclarecimento
diz porque: *"e pra girar de 30 em 30 graus ate ficar numa posicao que consiga
dar o passe. Nao e para girar somente 30 graus. O giro e justamente para que a
animacao fique coerente com a direccao do passe. Nao adianta a animacao estar
para um lado e o passe para o outro"*.

Com um passo so, um passe nas costas deixava o corpo a 150 graus do alvo: o
boneco virado para um lado e a bola a sair para o outro, que e exactamente o
que a regra existe para evitar.

`giroGraus` e portanto o PASSO. O numero de passos e o minimo que poe o que
sobra dentro do limite, e a invariante que este teste guarda e essa: depois do
giro, o alvo esta SEMPRE dentro dos 70 graus. O limite continua a ser o que
decide SE se roda.

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

/*
A INVARIANTE, e e a razao de ser da regra: depois do giro o passe TEM de caber
na janela. Com um passo so isto reprovava a 101 graus e acima.
*/
test('depois do giro o passe cabe sempre na janela dos 70', () => {
    const frente = dir(0);
    const lim = PassModel.anguloLivreGraus;
    for (const g of [71, 75, 90, 100, 101, 120, 150, 179, 180]) {
        for (const s of [1, -1]) {
            const alvo = dir(g * s);
            const novo = direccaoDoCorpoNoPasse(frente, alvo,
                lim * GRAU, PassModel.giroGraus * GRAU);
            assert.ok(novo, `a ${g * s} graus nao mandou rodar`);
            const sobra = anguloEntre(novo, alvo);
            assert.ok(sobra <= lim + 0.5,
                `a ${g * s} graus o corpo ficou a ${sobra.toFixed(1)} do alvo: ` +
                `a animacao aponta para um lado e a bola sai para o outro`);
        }
    }
});

test('e roda sempre um MULTIPLO do passo, para o lado do passe', () => {
    const frente = dir(0);
    const passo = PassModel.giroGraus;
    for (const g of [71, 75, 90, 100, 101, 120, 150, 179, 180]) {
        for (const s of [1, -1]) {
            const alvo = dir(g * s);
            const novo = direccaoDoCorpoNoPasse(frente, alvo,
                PassModel.anguloLivreGraus * GRAU, passo * GRAU);
            const rodou = anguloEntre(frente, novo);

            const passos = rodou / passo;
            assert.ok(Math.abs(passos - Math.round(passos)) < 0.02,
                `a ${g * s} graus rodou ${rodou.toFixed(1)}, que nao e multiplo de ${passo}`);

            // Para o lado do passe: fica mais perto do alvo do que estava.
            const antes = anguloEntre(frente, alvo);
            const depois = anguloEntre(novo, alvo);
            assert.ok(depois < antes - 0.5,
                `a ${g * s} graus rodou para o lado errado ` +
                `(${antes.toFixed(1)} -> ${depois.toFixed(1)} graus do alvo)`);
        }
    }
});

/*
E RODA O MINIMO NECESSARIO -- um passo a menos ja nao chegava. Sem isto, a
regra podia satisfazer as duas acima girando sempre 180 graus.
*/
test('nao roda mais passos do que os precisos', () => {
    const frente = dir(0);
    const lim = PassModel.anguloLivreGraus, passo = PassModel.giroGraus;
    for (const g of [71, 100, 101, 120, 180]) {
        const alvo = dir(g);
        const novo = direccaoDoCorpoNoPasse(frente, alvo, lim * GRAU, passo * GRAU);
        const rodou = anguloEntre(frente, novo);
        const esperado = Math.ceil((g - lim) / passo) * passo;
        assert.ok(Math.abs(rodou - esperado) < 0.5,
            `a ${g} graus rodou ${rodou.toFixed(1)}, esperado ${esperado}`);
    }
});

/*
OS NUMEROS DO PEDIDO, escritos a mao para se lerem sem contas: quantos passos e
quanto sobra em cada caso.
*/
test('a tabela do pedido bate certo', () => {
    const frente = dir(0);
    const lim = PassModel.anguloLivreGraus * GRAU, passo = PassModel.giroGraus * GRAU;
    const esperado = [
        // alvo, giro total, o que sobra
        [75, 30, 45],
        [100, 30, 70],
        [101, 60, 41],
        [120, 60, 60],
        [150, 90, 60],
        [180, 120, 60]
    ];
    for (const [g, giro, sobra] of esperado) {
        const novo = direccaoDoCorpoNoPasse(frente, dir(g), lim, passo);
        assert.ok(Math.abs(anguloEntre(frente, novo) - giro) < 0.5,
            `a ${g} graus o giro devia ser ${giro}`);
        assert.ok(Math.abs(anguloEntre(novo, dir(g)) - sobra) < 0.5,
            `a ${g} graus deviam sobrar ${sobra}`);
    }
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
