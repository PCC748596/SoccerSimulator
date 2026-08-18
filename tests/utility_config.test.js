const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'config.js'), 'utf8');

function bloco(nome) {
    const i = CONFIG.indexOf('const ' + nome + ' = {');
    assert.ok(i >= 0, 'bloco ' + nome + ' nao encontrado');
    return CONFIG.slice(i, CONFIG.indexOf('};', i));
}

test('EstiloBase declara as chaves de peso do Utility', () => {
    const b = bloco('EstiloBase');
    for (const chave of ['driblar', 'marcar', 'intercetar', 'apoiar',
                         'passe', 'remate', 'cruzar', 'lancar', 'conduzir',
                         'pressao', 'cadencia']) {
        assert.ok(new RegExp('\\b' + chave + '\\s*:').test(b),
            'EstiloBase sem a chave ' + chave);
    }
});

test('EstiloBase da 1.0 neutro as chaves novas', () => {
    const b = bloco('EstiloBase');
    for (const chave of ['driblar', 'marcar', 'intercetar', 'apoiar']) {
        assert.ok(new RegExp(chave + '\\s*:\\s*1\\.0').test(b),
            chave + ' deve ser neutro (1.0) na base');
    }
});

test('UtilityModel existe com os quatro parametros', () => {
    const b = bloco('UtilityModel');
    for (const chave of ['margemTopN', 'tamanhoPool', 'inerciaBase', 'inerciaDecai']) {
        assert.ok(new RegExp('\\b' + chave + '\\s*:').test(b),
            'UtilityModel sem ' + chave);
    }
});

test('os estilos com identidade de drible declaram o peso', () => {
    const esperado = {
        prolific_winger: 1.5, creative_playmaker: 1.4, roaming_flank: 1.4,
        orchestrator: 0.5, target_man: 0.5, fox_in_the_box: 0.4,
        the_destroyer: 0.4, anchor_man: 0.3
    };
    for (const estilo in esperado) {
        const i = CONFIG.indexOf(estilo + ': {');
        assert.ok(i >= 0, 'estilo ' + estilo + ' nao encontrado');
        const corpo = CONFIG.slice(i, CONFIG.indexOf('},', i));
        const m = corpo.match(/driblar\s*:\s*([0-9.]+)/);
        assert.ok(m, estilo + ' sem peso driblar');
        assert.strictEqual(parseFloat(m[1]), esperado[estilo],
            estilo + ' com peso driblar errado');
    }
});
