/*
A INFILTRACAO PROCURA O ESPACO ENTRE OS ADVERSARIOS, E NAO SO "A FRENTE".

Relato de 5 de Outubro de 2026: *"quando um jogador se infiltra, muitas vezes
ele corre pra frente mas nao esta correndo no espaco vazio. O ideal seria se
movimentar para espacos vazios nos meios dos jogadores adversarios."*

Testa a funcao pura `espacoEntreAdversarios` (utils.js), sem montar um jogo:
um corredor, uns adversarios e um portador a distancias conhecidas.

Corre com: node --test tests/infiltracao_entre_adversarios.test.js
*/
const test = require('node:test');
const assert = require('node:assert');
require('../tools/headless/harness.js');

const base = (extra) => Object.assign({
    px: 0, pz: 0, dirZ: 1,
    adversarios: [],
    portador: null,
    avancoMax: 20, avancoMin: 4, larguraCampo: 68
}, extra);

test('entre dois defesas, vai para o meio e nao encostado a nenhum', () => {
    // Linha de dois defesas em x = -8 e x = +8, a 12 m dele.
    const r = espacoEntreAdversarios(base({
        adversarios: [{ x: -8, z: 12 }, { x: 8, z: 12 }]
    }));
    assert.ok(r, 'devia haver espaco');
    console.log(`  alvo em x=${r.x.toFixed(1)}, avanco ${r.avanco.toFixed(1)}, folga ${r.folga.toFixed(1)} m`);
    assert.ok(r.folga >= RunIntoSpaceModel.espaco.folgaMin, `folga de ${r.folga.toFixed(1)} m`);
    // Nenhum ponto a menos da folga minima de um adversario.
    for (const a of [{ x: -8, z: 12 }, { x: 8, z: 12 }]) {
        assert.ok(Math.hypot(r.x - a.x, r.avanco - a.z) >= RunIntoSpaceModel.espaco.folgaMin,
            'o alvo ficou encostado a um adversario');
    }
});

test('nunca devolve um ponto em cima de um adversario, nem atras do corredor', () => {
    // Um adversario exactamente a frente (o ponto "20 m a frente, no mesmo x").
    const r = espacoEntreAdversarios(base({ adversarios: [{ x: 0, z: 20 }, { x: 0, z: 16 }] }));
    assert.ok(r);
    assert.ok(Math.hypot(r.x - 0, r.avanco - 20) >= RunIntoSpaceModel.espaco.folgaMin);
    assert.ok(r.avanco >= 4, 'tem de ganhar pelo menos o minimo');
});

test('a linha de passe do portador conta: nao corre para um espaco sem passe', () => {
    // Portador atras e ao centro; um defesa no meio da linha de passe para x=0
    // e nenhum para o lado. O melhor ponto nao pode ter o passe bloqueado.
    const adversarios = [{ x: 0, z: 9 }, { x: -14, z: 14 }, { x: 14, z: 14 }];
    const portador = { x: 0, z: -6 };
    const r = espacoEntreAdversarios(base({ adversarios, portador }));
    assert.ok(r);
    console.log(`  alvo em x=${r.x.toFixed(1)}, avanco ${r.avanco.toFixed(1)}, passe livre a ${r.passe.toFixed(1)} m`);
    assert.ok(r.passe >= 1.5, `passe a ${r.passe.toFixed(1)} m de um adversario`);
});

test('sem adversarios nao ha espaco a procurar (fica o recurso antigo)', () => {
    assert.strictEqual(espacoEntreAdversarios(base({ adversarios: [] })), null);
});

test('sem nenhum ponto com folga (campo cheio de defesas), devolve null', () => {
    const adversarios = [];
    for (let x = -32; x <= 32; x += 3) for (let z = 4; z <= 22; z += 3) adversarios.push({ x, z });
    assert.strictEqual(espacoEntreAdversarios(base({ adversarios })), null);
});

test('respeita o corte de impedimento: nunca passa o `avancoMax`', () => {
    const r = espacoEntreAdversarios(base({ avancoMax: 10, adversarios: [{ x: -8, z: 8 }, { x: 8, z: 8 }] }));
    assert.ok(r);
    assert.ok(r.avanco <= 10 + 1e-6, `avanco ${r.avanco} acima do tecto 10`);
});

test('a configuracao existe', () => {
    const E = RunIntoSpaceModel.espaco;
    assert.ok(E && E.folgaMin > 0 && E.passoX > 0 && E.passoAvanco > 0);
});
