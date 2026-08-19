/*
Marcação por posição num 4-4-2 contra 4-4-2.

Pares pedidos:
  central   <-> avançado (e o avançado marca o central)
  lateral   <-> extremo do lado
  médio-ala <-> médio-ala oposto
  médio-centro <-> médio-centro oposto

Corre o atribuirMarcacao real.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
// A marcação vive no nível 2 desde que a defesa toda passou para lá.
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

// Um 4-4-2, em coordenadas de mundo. `dirZ` = sentido de ataque.
function equipa(nome, dirZ) {
    const linha = [
        ['GK', 0, -50], ['RB', -20, -32], ['CB', -7, -36], ['CB', 7, -36], ['LB', 20, -32],
        ['RM', -22, -8], ['CM', -7, -12], ['CM', 7, -12], ['LM', 22, -8],
        ['CF', -6, 12], ['CF', 6, 12]
    ];
    return linha.map((q, i) => ({
        id: nome + i,
        pos: q[0],
        role: q[0] === 'GK' ? 'gk' : (q[0].endsWith('B') ? 'def' : (q[0] === 'CF' ? 'atk' : 'mid')),
        team: nome,
        dirZ: dirZ,
        ownGoalZ: -52.5 * dirZ,
        baseTarget: { x: q[1] * dirZ, z: q[2] * dirZ },
        markingTarget: null,
        prevMarkingTarget: null,
        isCovering: false,
        markCount: 0,
        model: {
            position: {
                x: q[1] * dirZ, y: 0, z: q[2] * dirZ,
                distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
            }
        }
    }));
}

function correr() {
    const casa = equipa('A', 1);
    const fora = equipa('B', -1);
    const bb = {
        team: 'A',
        isAttacking: false,
        outfield: casa.filter(p => p.role !== 'gk'),
        opp: fora,
        oppCarrier: null,
        chaser: null
    };
    const sandbox = {
        Math, console, CAMPO_COMP: 105,
        Tatics: { pressaoDefensiva: 'balanced', teamPlayStyle: 'nenhum' },
        TeamPlayStyles: {},
        Match: { possessionTimer: 999, ball: { position: { x: 0, y: 0, z: 0 } } },
        MatchStats: { A: { trocasMarcacao: 0 } }
    };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'DefensivePressureModel') + '\n' +
        recortarConst(CONFIG, 'MarkingModel') + '\n' +
        recortarConst(CONFIG, 'CoberturaModel') + '\n' +
        recortarFuncao(POS, 'atribuirCobertura') + '\n' +
        recortarFuncao(POS, 'atribuirMarcacao') +
        '\nthis.f = atribuirMarcacao;', sandbox);
    sandbox.f(bb);
    return { casa, fora };
}

// Pares (posicao do marcador -> posicao do marcado).
function paresDe(casa) {
    return casa.filter(p => p.markingTarget)
        .map(p => [p.pos, p.markingTarget.pos]);
}

test('cada central marca um avançado', () => {
    const { casa } = correr();
    const cbs = casa.filter(p => p.pos === 'CB');
    assert.strictEqual(cbs.length, 2);
    for (const cb of cbs) {
        assert.ok(cb.markingTarget, 'central sem marca');
        assert.strictEqual(cb.markingTarget.pos, 'CF', 'central devia marcar avancado');
    }
    // E não o mesmo avançado os dois.
    assert.notStrictEqual(cbs[0].markingTarget, cbs[1].markingTarget);
});

test('os laterais marcam os médios-ala', () => {
    const { casa } = correr();
    const lb = casa.find(p => p.pos === 'LB');
    const rb = casa.find(p => p.pos === 'RB');
    assert.strictEqual(lb.markingTarget && lb.markingTarget.pos, 'RM');
    assert.strictEqual(rb.markingTarget && rb.markingTarget.pos, 'LM');
});

test('os médios-centro marcam os médios-centro', () => {
    const { casa } = correr();
    const cms = casa.filter(p => p.pos === 'CM');
    for (const cm of cms) {
        assert.ok(cm.markingTarget, 'medio-centro sem marca');
        assert.strictEqual(cm.markingTarget.pos, 'CM');
    }
    assert.notStrictEqual(cms[0].markingTarget, cms[1].markingTarget);
});

test('os médios-ala pegam nos laterais do lado', () => {
    /*
    O médio-ala oposto ja e' do nosso lateral (LB->RM). Num 4-4-2 contra
    4-4-2 os dez pares so fecham se o medio-ala pegar no lateral:
    LM<->RB e RM<->LB.
    */
    const { casa } = correr();
    const lm = casa.find(p => p.pos === 'LM');
    const rm = casa.find(p => p.pos === 'RM');
    assert.strictEqual(lm.markingTarget && lm.markingTarget.pos, 'RB');
    assert.strictEqual(rm.markingTarget && rm.markingTarget.pos, 'LB');
});

test('os avançados marcam os centrais', () => {
    const { casa } = correr();
    const cfs = casa.filter(p => p.pos === 'CF');
    for (const cf of cfs) {
        assert.ok(cf.markingTarget, 'avancado sem marca');
        assert.strictEqual(cf.markingTarget.pos, 'CB');
    }
    assert.notStrictEqual(cfs[0].markingTarget, cfs[1].markingTarget);
});

test('ninguém é marcado por dois jogadores', () => {
    const { casa, fora } = correr();
    const contagem = new Map();
    for (const p of casa) {
        if (!p.markingTarget) continue;
        contagem.set(p.markingTarget, (contagem.get(p.markingTarget) || 0) + 1);
    }
    for (const [alvo, n] of contagem) {
        assert.ok(n <= 1, alvo.pos + ' marcado por ' + n + ' jogadores');
    }
    assert.ok(fora.length === 11);
});

test('os dez jogadores de campo ficam todos com marca', () => {
    const { casa } = correr();
    const semMarca = casa.filter(p => p.role !== 'gk' && !p.markingTarget);
    assert.deepStrictEqual(semMarca.map(p => p.pos), [],
        'ficaram sem marca: ' + semMarca.map(p => p.pos).join(', '));
});

test('os pares ficam do mesmo lado do campo', () => {
    const { casa } = correr();
    for (const p of casa) {
        if (!p.markingTarget) continue;
        if (p.pos === 'CM') continue;   // dois centrais, lados quase iguais
        const meu = p.model.position.x;
        const dele = p.markingTarget.model.position.x;
        assert.ok(Math.sign(meu) === Math.sign(dele) || Math.abs(meu) < 8,
            p.pos + ' (x=' + meu + ') marcou alguem em x=' + dele);
    }
});

test('a tabela de pares esta declarada na config', () => {
    const i = CONFIG.indexOf('paresPorPosicao');
    assert.ok(i >= 0, 'paresPorPosicao nao existe na config');
    const bloco = CONFIG.slice(i, i + 900);
    for (const par of ['CB:', 'LB:', 'RB:', 'CM:', 'LM:', 'RM:', 'CF:']) {
        assert.ok(bloco.includes(par), 'falta ' + par);
    }
});
