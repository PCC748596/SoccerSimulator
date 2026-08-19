/*
A marcação tem de ACONTECER, não só ser calculada.

Medido antes: com o homem a 15 m do slot do bloco, o marcador acabava a
9.9 m dele; a 25 m, acabava a 19 m. O tecto de desvio (biasMaxPorSetor,
3-10 m) comia a marcação toda, e só marcava quem já tivesse o homem ao lado.
Em campo isso lê-se como "não há marcação, toda a gente corre para a bola".

Estes testes correm o marcar() real e verificam a distância FINAL ao homem.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
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

function montar(pressao) {
    const sandbox = {
        Math, CAMPO_COMP: 105,
        Tatics: { pressaoDefensiva: pressao || 'balanced' },
        THREE: { MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } }
    };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'MarkingModel') + '\n' +
        recortarFuncao(POS, 'goalSide') + '\n' +
        recortarFuncao(POS, 'aproximar') + '\n' +
        recortarFuncao(POS, 'biasMaxDaMarcacao') + '\n' +
        recortarFuncao(POS, 'marcar') +
        '\nthis.marcar = marcar; this.M = MarkingModel;', sandbox);
    return sandbox;
}

/*
Corre o marcar() e devolve a distância a que o marcador FICA do homem.
`slot` é onde o bloco o tinha posto; `homem` é a posição do adversário.
*/
function distanciaFinal(sandbox, slot, homem) {
    const p = { dirZ: 1, ownGoalZ: -52.5, model: { position: { x: slot[0], z: slot[1] } } };
    const alvo = {
        model: {
            position: {
                x: homem[0], z: homem[1],
                distanceTo(o) { return Math.hypot(this.x - o.x, this.z - o.z); }
            }
        }
    };
    const ctx = { p, targetX: slot[0], targetZ: slot[1] };
    sandbox.marcar(ctx, alvo);
    return Math.hypot(ctx.targetX - homem[0], ctx.targetZ - homem[1]);
}

test('o alcance da marcação está declarado e é generoso', () => {
    const M = montar().M;
    assert.ok(M.alcanceMarcacao >= 20, 'alcance curto demais: ' + M.alcanceMarcacao);
});

test('marca o homem mesmo quando ele está longe do slot', () => {
    const s = montar();
    const pedida = s.M.distanciaPara(-19);   // terco defensivo
    for (const homem of [[2, -28], [6, -25], [10, -19]]) {
        const d = distanciaFinal(s, [0, -30], homem);
        assert.ok(Math.abs(d - s.M.distanciaPara(homem[1])) < 0.3,
            'homem em ' + homem + ' -> ficou a ' + d.toFixed(1) + 'm');
    }
    assert.ok(pedida > 0);
});

test('o caso que falhava: homem a 25m do slot', () => {
    const s = montar();
    const d = distanciaFinal(s, [0, -30], [15, -10]);
    const pedida = s.M.distanciaPara(-10);
    assert.ok(Math.abs(d - pedida) < 0.3,
        'ficou a ' + d.toFixed(1) + 'm, devia ficar a ' + pedida.toFixed(1) + 'm');
});

test('a distância final segue o Defensive Pressure', () => {
    for (const pressao of ['low', 'balanced', 'high']) {
        const s = montar(pressao);
        const d = distanciaFinal(s, [0, -30], [6, -25]);
        const pedida = s.M.distanciaPara(-25);
        assert.ok(Math.abs(d - pedida) < 0.3,
            pressao + ': ficou a ' + d.toFixed(1) + 'm, pedida ' + pedida.toFixed(1) + 'm');
    }
});

test('a distância de marcação é a mesma em qualquer Defensive Pressure', () => {
    // Passou a ser um número só (MarkingModel.distancia), a pedido, enquanto
    // se valida a marcação. Se voltar a diferenciar, este teste inverte-se.
    const dLow = distanciaFinal(montar('low'), [0, -30], [6, -25]);
    const dHigh = distanciaFinal(montar('high'), [0, -30], [6, -25]);
    assert.ok(Math.abs(dHigh - dLow) < 0.01,
        'low (' + dLow.toFixed(2) + ') e high (' + dHigh.toFixed(2) + ') deviam ser iguais');
});

test('o marcador fica do lado da PRÓPRIA baliza, não em cima do homem', () => {
    const s = montar();
    const p = { dirZ: 1, ownGoalZ: -52.5, model: { position: { x: 0, z: -30 } } };
    const homem = [4, -24];
    const alvo = {
        model: {
            position: {
                x: homem[0], z: homem[1],
                distanceTo(o) { return Math.hypot(this.x - o.x, this.z - o.z); }
            }
        }
    };
    const ctx = { p, targetX: 0, targetZ: -30 };
    s.marcar(ctx, alvo);
    assert.ok(ctx.targetZ < homem[1], 'devia ficar entre o homem e a propria baliza');
});

test('o tecto ainda impede uma travessia absurda do campo', () => {
    const s = montar();
    const d = distanciaFinal(s, [0, -30], [30, 20]);   // homem a ~64m
    assert.ok(d > 10, 'nao devia teletransportar-se para o outro lado do campo');
});

test('marcar() já não usa o tecto de forma como limite', () => {
    const corpo = recortarFuncao(POS, 'marcar');
    assert.ok(/alcanceMarcacao/.test(corpo), 'marcar() nao usa o alcance de marcacao');
    assert.ok(!/biasMaxDaMarcacao\(p, alvo\)/.test(corpo),
        'marcar() voltou a limitar-se ao tecto de forma');
});
