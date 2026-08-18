const test = require('node:test');
const assert = require('node:assert');
const { Curvas, combinarConsiderandos, avaliarAccao, escolherAccao } =
    require('../js/utility/core.js');

test('Curvas.linear satura em 0 e 1', () => {
    assert.strictEqual(Curvas.linear(0.5), 0.5);
    assert.strictEqual(Curvas.linear(-3), 0);
    assert.strictEqual(Curvas.linear(3), 1);
});

test('Curvas.inv decresce', () => {
    assert.strictEqual(Curvas.inv(0), 1);
    assert.strictEqual(Curvas.inv(1), 0);
    assert.ok(Curvas.inv(0.25) > Curvas.inv(0.75));
});

test('Curvas.quad cresce mais devagar perto de zero do que a linear', () => {
    assert.ok(Curvas.quad(0.3) < Curvas.linear(0.3));
    assert.ok(Math.abs(Curvas.quad(1) - 1) < 1e-9);
});

test('Curvas.logistica cruza 0.5 no centro e é monotona', () => {
    assert.ok(Math.abs(Curvas.logistica(0.5) - 0.5) < 1e-9);
    assert.ok(Curvas.logistica(0.8) > Curvas.logistica(0.2));
    assert.ok(Curvas.logistica(0) > 0 && Curvas.logistica(1) < 1);
});

test('combinarConsiderandos: um zero mata a accao', () => {
    assert.strictEqual(combinarConsiderandos([0.9, 0.9, 0]), 0);
});

test('combinarConsiderandos: lista vazia vale 0', () => {
    assert.strictEqual(combinarConsiderandos([]), 0);
});

test('combinarConsiderandos: um unico valor passa intacto', () => {
    assert.ok(Math.abs(combinarConsiderandos([0.7]) - 0.7) < 1e-9);
});

test('combinarConsiderandos compensa o numero de termos', () => {
    // Sem compensacao, 0.8^4 = 0.4096 — quatro considerandos bons dariam um
    // score pior do que dois medianos. A compensacao tem de o corrigir.
    const dois = combinarConsiderandos([0.8, 0.8]);
    const quatro = combinarConsiderandos([0.8, 0.8, 0.8, 0.8]);
    assert.ok(quatro > Math.pow(0.8, 4));
    assert.ok(quatro > 0.5);
    assert.ok(dois > quatro);           // mais termos ainda penaliza, mas pouco
});

test('combinarConsiderandos nunca sai de [0,1]', () => {
    for (const v of [[1, 1, 1], [0.001, 0.001], [1], [0, 0]]) {
        const r = combinarConsiderandos(v);
        assert.ok(r >= 0 && r <= 1, 'fora de [0,1]: ' + r);
    }
});

test('avaliarAccao devolve 0 quando a pre-condicao falha', () => {
    const accao = {
        nome: 'X', estilo: null,
        pre: () => false,
        considerandos: { a: () => 1 },
        executar: () => {}
    };
    const r = avaliarAccao(accao, {});
    assert.strictEqual(r.score, 0);
});

test('avaliarAccao recolhe os considerandos para debug', () => {
    const accao = {
        nome: 'X', estilo: null,
        pre: () => true,
        considerandos: { perto: () => 0.8, livre: () => 0.6 },
        executar: () => {}
    };
    const r = avaliarAccao(accao, {});
    assert.strictEqual(r.nome, 'X');
    assert.strictEqual(r.considerandos.perto, 0.8);
    assert.strictEqual(r.considerandos.livre, 0.6);
    assert.ok(r.score > 0);
});

test('avaliarAccao sem considerandos vale 0', () => {
    const accao = {
        nome: 'HOLD', estilo: null,
        pre: () => true, considerandos: {}, executar: () => {}
    };
    assert.strictEqual(avaliarAccao(accao, {}).score, 0);
});

test('escolherAccao descarta scores residuais', () => {
    const r = escolherAccao([{ nome: 'A', score: 0.01 }], 0.65, 3, () => 0);
    assert.strictEqual(r, null);
});

test('escolherAccao devolve null para lista vazia', () => {
    assert.strictEqual(escolherAccao([], 0.65, 3, () => 0), null);
});

test('escolherAccao com margem 1.0 e argmax puro', () => {
    const cands = [{ nome: 'A', score: 0.5 }, { nome: 'B', score: 0.9 }];
    for (let i = 0; i < 20; i++) {
        assert.strictEqual(escolherAccao(cands, 1.0, 3, Math.random).nome, 'B');
    }
});

test('escolherAccao nunca escolhe fora da margem', () => {
    const cands = [
        { nome: 'BOA', score: 0.9 },
        { nome: 'MEDIA', score: 0.7 },
        { nome: 'MA', score: 0.2 }
    ];
    for (let i = 0; i < 200; i++) {
        const nome = escolherAccao(cands, 0.65, 3, Math.random).nome;
        assert.notStrictEqual(nome, 'MA');   // 0.2 < 0.9*0.65 = 0.585
    }
});

test('escolherAccao respeita o tamanho do pool', () => {
    const cands = [
        { nome: 'A', score: 1.0 }, { nome: 'B', score: 0.95 },
        { nome: 'C', score: 0.9 }, { nome: 'D', score: 0.85 }
    ];
    for (let i = 0; i < 200; i++) {
        assert.notStrictEqual(escolherAccao(cands, 0.65, 3, Math.random).nome, 'D');
    }
});

test('escolherAccao sorteia proporcionalmente ao score', () => {
    const cands = [{ nome: 'A', score: 0.9 }, { nome: 'B', score: 0.9 }];
    let a = 0;
    for (let i = 0; i < 1000; i++) {
        if (escolherAccao(cands, 0.65, 3, Math.random).nome === 'A') a++;
    }
    assert.ok(a > 380 && a < 620, 'distribuicao enviesada: ' + a);
});
