const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function ler(rel) {
    return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

test('o toggle PassGrid morto foi removido', () => {
    assert.ok(!/usarPasseGrid/.test(ler('js/main.js')), 'js/main.js ainda escreve usarPasseGrid');
    assert.ok(!/btn-passgrid/.test(ler('index.html')), 'index.html ainda tem o botao');
});

test('o docstring de pass_candidates nao promete uma funcao inexistente', () => {
    assert.ok(!/findGridPassTarget/.test(ler('js/pass_candidates.js')));
});

test('os parametros de sorteio substituidos pelo Utility foram removidos', () => {
    const cfg = ler('js/config.js');
    for (const morto of ['carryChance', 'carryChanceShort', 'carryChanceLong',
                         'throughBallChance', 'chanceMax']) {
        assert.ok(!new RegExp('^\\s*' + morto + '\\s*:', 'm').test(cfg),
            'config.js ainda declara ' + morto);
    }
});

test('nada no codigo consome os parametros removidos', () => {
    for (const f of ['js/bt/player_bt.js', 'js/utility/actions.js', 'js/player.js', 'js/fsm.js']) {
        const src = ler(f);
        for (const morto of ['carryChance', 'throughBallChance', 'chanceMax']) {
            assert.ok(!new RegExp('\\.' + morto + '\\b').test(src),
                f + ' ainda lê ' + morto);
        }
    }
});

test('decisionSummary nao documenta o ramo PassarGrid inexistente', () => {
    assert.ok(!/PassarGrid/.test(ler('decisionSummary.md')));
});
