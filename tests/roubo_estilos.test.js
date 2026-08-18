/*
Duas regras novas:
  - roubar a bola (desarme/carrinho) só no próprio terço defensivo;
  - Playing Style BTs só na fase de ataque da equipa.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const BT = fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8');
const ACTIONS = fs.readFileSync(path.join(raiz, 'js', 'utility', 'actions.js'), 'utf8');

function recortarConst(src, nome) {
    const i = src.indexOf('const ' + nome + ' = {');
    assert.ok(i >= 0, 'const ' + nome + ' nao encontrado');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1) + ';';
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

function recortarFuncao(src, nome) {
    const i = src.indexOf('function ' + nome + '(');
    assert.ok(i >= 0, 'function ' + nome + ' nao encontrada');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

const CAMPO_COMP = 105;
const terco = CAMPO_COMP / 6;   // 17.5

function montar(setor) {
    const sandbox = { Math, CAMPO_COMP, Tatics: { pressaoDefensiva: 'balanced' } };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'MarkingModel') + '\n' +
        (setor === undefined ? '' : 'MarkingModel.setorDeRoubo = ' + JSON.stringify(setor) + ';\n') +
        recortarFuncao(BT, 'podeRoubarBola') +
        '\nthis.f = podeRoubarBola; this.M = MarkingModel;', sandbox);
    return sandbox;
}

// Jogador a `zAtk` metros no referencial de ataque dele.
const jog = (zAtk, dirZ) => ({ dirZ: dirZ === undefined ? 1 : dirZ,
    model: { position: { x: 0, z: zAtk * (dirZ === undefined ? 1 : dirZ) } } });

test('a config pede roubo só no terço defensivo', () => {
    assert.strictEqual(montar().M.setorDeRoubo, 'def');
});

test('rouba dentro do próprio terço defensivo', () => {
    const s = montar();
    assert.strictEqual(s.f(jog(-40)), true);
    assert.strictEqual(s.f(jog(-20)), true);
});

test('não rouba no meio-campo nem no ataque', () => {
    const s = montar();
    assert.strictEqual(s.f(jog(-10)), false, 'meio-campo defensivo');
    assert.strictEqual(s.f(jog(0)), false, 'meio campo');
    assert.strictEqual(s.f(jog(30)), false, 'terco de ataque');
});

test('a fronteira é o terço, não o meio campo', () => {
    const s = montar();
    assert.strictEqual(s.f(jog(-terco - 0.1)), true);
    assert.strictEqual(s.f(jog(-terco + 0.1)), false);
});

test('vale igual para quem ataca no sentido oposto', () => {
    const s = montar();
    assert.strictEqual(s.f(jog(-40, -1)), true);
    assert.strictEqual(s.f(jog(30, -1)), false);
});

test("'mid' alarga a dois terços", () => {
    const s = montar('mid');
    assert.strictEqual(s.f(jog(0)), true);
    assert.strictEqual(s.f(jog(30)), false);
});

test('null desliga a restrição', () => {
    const s = montar(null);
    assert.strictEqual(s.f(jog(40)), true);
});

/* ---------------------------------------------------------------- */

test('as duas folhas de roubo do BT chamam podeRoubarBola', () => {
    for (const folha of ['vale carrinho', 'vale desarme']) {
        const i = BT.indexOf("cond('" + folha + "'");
        assert.ok(i >= 0, 'folha ' + folha + ' nao encontrada');
        const corpo = BT.slice(i, i + 400);
        assert.ok(/podeRoubarBola\(p\)/.test(corpo), folha + ' nao verifica o setor');
    }
});

test('o Utility aplica a mesma regra nas suas acções de roubo', () => {
    for (const nome of ['TACKLE', 'SLIDE_TACKLE']) {
        const i = ACTIONS.indexOf("nome: '" + nome + "'");
        assert.ok(i >= 0, 'accao ' + nome + ' nao encontrada');
        const corpo = ACTIONS.slice(i, ACTIONS.indexOf('considerandos', i));
        assert.ok(/podeRoubarBola/.test(corpo), nome + ' do Utility nao verifica o setor');
    }
});

test('os Playing Styles só correm na fase de ataque', () => {
    const i = BT.indexOf('PlayingStyleBTs[player.playingStyle]');
    assert.ok(i >= 0);
    const corpo = BT.slice(i - 400, i + 100);
    assert.ok(/emAtaque\s*&&/.test(corpo),
        'o BT do estilo nao esta preso a fase de ataque');
    assert.ok(/isAttacking/.test(corpo), 'emAtaque nao vem do blackboard da equipa');
});
