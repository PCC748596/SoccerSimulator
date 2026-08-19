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
// O tackling passou para o nivel 2 (TacklingAI), junto com a marcacao.
const POS = fs.readFileSync(path.join(raiz, 'js', 'bt', 'position_bt.js'), 'utf8');

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
        recortarConst(CONFIG, 'TacklingModel') + '\n' +
        (setor === undefined ? '' : 'TacklingModel.setor = ' + JSON.stringify(setor) + ';\n') +
        recortarConst(POS, 'TacklingAI') +
        '\nthis.f = (p) => TacklingAI.podeRoubar(p); this.M = TacklingModel;', sandbox);
    return sandbox;
}

// Jogador a `zAtk` metros no referencial de ataque dele.
const jog = (zAtk, dirZ) => ({ dirZ: dirZ === undefined ? 1 : dirZ,
    model: { position: { x: 0, z: zAtk * (dirZ === undefined ? 1 : dirZ) } } });

test('a config pede roubo só no terço defensivo', () => {
    assert.strictEqual(montar().M.setor, 'def');
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

test('o roubo saiu do nivel 3', () => {
    for (const folha of ["vale carrinho", "vale desarme"]) {
        assert.ok(!BT.includes("cond('" + folha + "'"),
            'a folha ' + folha + ' voltou ao PlayerBT');
    }
});

test('o nivel 2 verifica o interruptor e o setor antes de tentar roubar', () => {
    const i = POS.indexOf('podeTentar(p)');
    assert.ok(i >= 0, 'TacklingAI.podeTentar nao encontrado');
    const corpo = POS.slice(i, i + 900);
    assert.ok(corpo.includes('TacklingModel.ativo'), 'podeTentar ignora o interruptor geral');
    assert.ok(corpo.includes('this.podeRoubar(p)'), 'podeTentar nao verifica o setor');
});

test('o tackling esta desligado por inteiro', () => {
    // Pedido: ver a marcacao a funcionar sozinha primeiro.
    assert.strictEqual(montar().M.ativo, false);
});

test('os Playing Styles só correm na fase de ataque', () => {
    const i = BT.indexOf('PlayingStyleBTs[player.playingStyle]');
    assert.ok(i >= 0);
    const corpo = BT.slice(i - 400, i + 100);
    assert.ok(/emAtaque\s*&&/.test(corpo),
        'o BT do estilo nao esta preso a fase de ataque');
    assert.ok(/isAttacking/.test(corpo), 'emAtaque nao vem do blackboard da equipa');
});
