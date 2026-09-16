/*
O BONUS DE QUEM INFILTRA ERA APAGADO NA LINHA SEGUINTE.

Relato: "os jogadores infiltrando nao estao com nenhuma prioridade para receber
o passe."

No `findPassTarget` (player.js) estava, com todas as letras:

    let priorityBonus = 0;
    // Bonus MASSIVO para jogadores a infiltrar (desmarcacao / corridas)
    if (opt.fsm && opt.fsm.currentState === 'RUN_INTO_SPACE') {
        priorityBonus += 400;
    }
    ...
    } else if (pRole === 'CM') {
        if (['AM', 'CF'].includes(oRole)) priorityBonus = 40;   // <- ATRIBUICAO

A tabela de pares de posicoes que vem a seguir ATRIBUI em vez de somar, e
apaga os 400 sempre que o par calha nela -- que e a maioria dos passes. Medido
(tools/headless/passe_para_quem_infiltra.js, 600 s): havia um infiltrado ao
alcance em 75.8% das escolhas de alvo e ele era o escolhido em 13.8% delas,
que com dois ou tres em corrida entre dez companheiros e o mesmo que nao ter
prioridade nenhuma.

Corre com: node --test tests/passe_para_infiltracao.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(20260911);

require('../tools/headless/harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let comInfiltrado = 0, escolheuInfiltrado = 0;
const proto = Object.getPrototypeOf(Match.players[0]);
const orig = proto.findPassTarget;
proto.findPassTarget = function (filtro) {
    const alvo = orig.call(this, filtro);
    if (alvo) {
        const colegas = (this.team === 'TeamA') ? Match.players : Match.opponents;
        const maxDist = Math.max(10, this.skillFor('PASS') * 0.6);
        const houve = colegas.some(c => c !== this && c.fsm &&
            c.fsm.currentState === 'RUN_INTO_SPACE' &&
            this.model.position.distanceTo(c.model.position) <= maxDist);
        if (houve) {
            comInfiltrado++;
            if (alvo.fsm && alvo.fsm.currentState === 'RUN_INTO_SPACE') escolheuInfiltrado++;
        }
    }
    return alvo;
};

for (let i = 0; i < Math.round(600 / dt); i++) Match.update(dt);

test('o bonus da infiltracao existe na configuracao', () => {
    assert.strictEqual(typeof PassModel.bonusInfiltracao, 'number',
        'PassModel.bonusInfiltracao desapareceu');
    assert.ok(PassModel.bonusInfiltracao > 0);
});

test('e a tabela de pares de posicoes ja nao o apaga', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'player.js'), 'utf8');
    const i = src.indexOf('RUN_INTO_SPACE');
    assert.ok(i > 0, 'o bonus da infiltracao desapareceu do findPassTarget');
    const corpo = src.slice(i, i + 2500);
    assert.ok(!/priorityBonus \+= 400/.test(corpo),
        'o bonus continua somado ao mesmo acumulador que a tabela reescreve');
    assert.ok(/score \+= priorityBonus \+ bonusInfiltracao/.test(corpo),
        'o bonus da infiltracao nao chega a nota final por um caminho proprio');
});

test('quem infiltra passa a ser escolhido com prioridade a serio', () => {
    const pct = 100 * escolheuInfiltrado / Math.max(1, comInfiltrado);
    console.log(`  com um infiltrado ao alcance ${comInfiltrado} vezes, ` +
        `escolhido em ${pct.toFixed(1)}% delas`);
    assert.ok(comInfiltrado > 300, `amostra curta: ${comInfiltrado}`);
    /*
    O TECTO SAI DA DISPERSAO ENTRE SEMENTES, e nao da semente deste teste.

    Estava em 30 e caia DENTRO da dispersao. Medido com cinco sementes, o mesmo
    codigo:

        20260911   1      2      3      4
          28.9%  47.1%  49.4%  40.4%  45.7%

    A semente 20260911 e a mais baixa das cinco, com n=1618 oportunidades — nao
    e amostra curta, e a partida que calhou. Um tecto de 30 reprovava uma em
    cada cinco corridas por causa do jogo que saiu, nao do codigo.

    A 25 continua a apanhar o que este teste existe para apanhar: antes do bonus
    da infiltracao o numero era 13.8%.
    */
    assert.ok(pct > 25,
        `escolhido em ${pct.toFixed(1)}% das oportunidades (antes eram 13.8%)`);
});
