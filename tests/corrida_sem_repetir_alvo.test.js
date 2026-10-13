/*
A CORRIDA AO ESPACO NAO REPETE O ALVO DE UM COMPANHEIRO, NEM FOGE DA BOLA SEM MOTIVO.

Relato (13 de Outubro de 2026): *"os 2 meias CM estao correndo para o mesmo lugar.
E para o lado oposto de onde esta a bola."*

Medido (tools/scratch, 600 s, 2 sementes): 116 a 212 amostras com dois corredores
da mesma equipa no mesmo alvo (menos de 3 m), porque `espacoEntreAdversarios` e
determinista e dois jogadores parecidos escolhem o mesmo melhor ponto; e 41% das
amostras de corrida com o alvo mais longe da bola (em X) do que o corredor, 55-57%
com o cone da diagonal (25-60), que obriga a sair de lado sem preferir um lado.

Duas regras novas, em `espacoEntreAdversarios` (utils.js):

  1. `o.companheirosEmCorrida` [{x, z}]: nenhum ponto a menos de
     `RunIntoSpaceModel.espaco.raioEntreCorredores` de um alvo de companheiro.
  2. `o.bola` {x}: o ponto paga `pesoLongeDaBola` por cada metro que o afasta da
     bola em X (so o que for AFASTAR; aproximar nao conta).

Sem esses campos na entrada, nada muda.

Corre com: node --test tests/corrida_sem_repetir_alvo.test.js
*/
const test = require('node:test');
const assert = require('node:assert');
require('../tools/headless/harness.js');

const base = (extra) => Object.assign({
    px: 0, pz: 0, dirZ: 1,
    adversarios: [{ x: -25, z: 30 }, { x: 25, z: 30 }],
    portador: null,
    avancoMax: 20, avancoMin: 4, larguraCampo: 68
}, extra);

test('a configuracao tem os dois campos', () => {
    const E = RunIntoSpaceModel.espaco;
    assert.ok(E.raioEntreCorredores > 0, 'raioEntreCorredores');
    assert.ok(E.pesoLongeDaBola > 0, 'pesoLongeDaBola');
});

test('sem os campos novos, o resultado e o de sempre', () => {
    const a = espacoEntreAdversarios(base({}));
    const b = espacoEntreAdversarios(base({ companheirosEmCorrida: [], bola: undefined }));
    assert.ok(a && b);
    assert.deepStrictEqual({ x: a.x, avanco: a.avanco }, { x: b.x, avanco: b.avanco });
});

test('nao escolhe um ponto colado ao alvo de um companheiro', () => {
    const livre = espacoEntreAdversarios(base({}));
    assert.ok(livre);
    const r = espacoEntreAdversarios(base({ companheirosEmCorrida: [{ x: livre.x, z: livre.avanco }] }));
    assert.ok(r, 'devia haver outro ponto');
    const d = Math.hypot(r.x - livre.x, r.avanco - livre.avanco);
    assert.ok(d >= RunIntoSpaceModel.espaco.raioEntreCorredores - 1e-6,
        `a ${d.toFixed(1)} m do alvo do companheiro (minimo ${RunIntoSpaceModel.espaco.raioEntreCorredores})`);
});

test('dois corredores seguidos nao acabam no mesmo alvo', () => {
    const primeiro = espacoEntreAdversarios(base({ px: 0 }));
    const segundo = espacoEntreAdversarios(base({ px: 3, companheirosEmCorrida: [{ x: primeiro.x, z: primeiro.avanco }] }));
    assert.ok(primeiro && segundo);
    assert.ok(Math.hypot(primeiro.x - segundo.x, primeiro.avanco - segundo.avanco) >= RunIntoSpaceModel.espaco.raioEntreCorredores - 1e-6);
});

test('a bola decide o lado quando o resto empata', () => {
    // Adversarios simetricos: sem bola, ganha o primeiro ponto da grelha (esquerda).
    const semBola = espacoEntreAdversarios(base({}));
    assert.ok(semBola);
    for (const bx of [-15, 15]) {
        const r = espacoEntreAdversarios(base({ bola: { x: bx } }));
        assert.ok(r, 'devia haver ponto com a bola em ' + bx);
        assert.ok(Math.sign(r.x) === Math.sign(bx) || Math.abs(r.x) < 2,
            `bola em x=${bx}: o corredor foi para x=${r.x.toFixed(1)} (para longe da bola)`);
    }
});

test('aproximar-se da bola nao e penalizado: so afastar', () => {
    // Bola ao centro e o corredor ja la: nao ha "afastar" que um lado pague mais.
    const a = espacoEntreAdversarios(base({ bola: { x: 0 } }));
    const b = espacoEntreAdversarios(base({}));
    assert.ok(a && b);
    // Com a bola em x=0 e o corredor em x=0, qualquer lado afasta por igual: o
    // desempate continua a ser o da grelha.
    assert.strictEqual(Math.sign(a.x), Math.sign(b.x));
});
