/*
A CORRIDA AO ESPACO TEM UM CONE DE ANGULOS, e nao so um limite lateral.

`espacoEntreAdversarios` (utils.js) escolhia o ponto numa grelha a frente do
corredor, limitada em X por `maxLateral` (30 m). Isso deixava a corrida ser
quase paralela a linha de fundo, ou reta, conforme o pontuasse. Agora o ponto
tem de cair dentro de um cone medido a partir da frente do corredor:

    0 graus   a direito, para a baliza adversaria
    90 graus  de lado

`anguloMin`/`anguloMax` (RunIntoSpaceModel.espaco) em graus, em modulo. Por
omissao 0 e 90, que e "sem cone" — o comportamento de antes. A chamada tambem os
aceita (`o.anguloMin`/`o.anguloMax`), para uma posicao ter o seu cone.

Corre com: node --test tests/corrida_cone_de_angulo.test.js
*/
const test = require('node:test');
const assert = require('node:assert');
require('../tools/headless/harness.js');

const base = (extra) => Object.assign({
    px: 0, pz: 0, dirZ: 1,
    // Dois adversarios que deixam o espaco mais vazio de lado do que a frente.
    adversarios: [{ x: 0, z: 14 }, { x: 0, z: 18 }],
    portador: null,
    avancoMax: 20, avancoMin: 4, larguraCampo: 68
}, extra);

const grau = (r, o) => Math.atan2(Math.abs(r.x - o.px), r.avanco - o.pz * o.dirZ) * 180 / Math.PI;

test('a configuracao traz o cone da diagonal', () => {
    const E = RunIntoSpaceModel.espaco;
    assert.strictEqual(E.anguloMin, 25);
    assert.strictEqual(E.anguloMax, 60);
});

test('sem cone na chamada vale o do modelo; 0 a 90 na chamada abre-o', () => {
    const o = base({});
    const a = espacoEntreAdversarios(o);
    const b = espacoEntreAdversarios(base({ anguloMin: 25, anguloMax: 60 }));
    assert.ok(a && b);
    assert.deepStrictEqual({ x: a.x, avanco: a.avanco }, { x: b.x, avanco: b.avanco });
    const aberto = espacoEntreAdversarios(base({ anguloMin: 0, anguloMax: 90 }));
    assert.ok(aberto, 'cone aberto devia ter ponto');
});

test('anguloMax fecha o cone: o ponto sai quase a direito', () => {
    const o = base({ anguloMin: 0, anguloMax: 15 });
    const r = espacoEntreAdversarios(o);
    assert.ok(r, 'devia haver ponto dentro de 15 graus');
    assert.ok(grau(r, o) <= 15 + 1e-6, `ponto a ${grau(r, o).toFixed(1)} graus`);
});

test('anguloMin obriga a diagonal: o ponto nao sai a direito', () => {
    const o = base({ anguloMin: 40 });
    const r = espacoEntreAdversarios(o);
    assert.ok(r, 'devia haver ponto a 40 graus ou mais');
    assert.ok(grau(r, o) >= 40 - 1e-6, `ponto a ${grau(r, o).toFixed(1)} graus`);
});

test('cone sem nenhum ponto da grelha devolve null', () => {
    // 89.5 a 90 graus: a grelha exige pelo menos 4 m de avanco, nunca e quase paralela.
    assert.strictEqual(espacoEntreAdversarios(base({ anguloMin: 89.5, anguloMax: 90 })), null);
});

test('o cone vale nos dois lados (esquerda e direita)', () => {
    for (const px of [-20, 20]) {
        const o = base({ px: px, anguloMin: 30, anguloMax: 60, adversarios: [{ x: px, z: 12 }] });
        const r = espacoEntreAdversarios(o);
        assert.ok(r, 'devia haver ponto em px=' + px);
        const g = grau(r, o);
        assert.ok(g >= 30 - 1e-6 && g <= 60 + 1e-6, `px=${px}: ${g.toFixed(1)} graus`);
    }
});
