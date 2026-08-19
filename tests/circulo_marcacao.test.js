/*
Círculo de marcação: à volta do homem marcado há um raio (o do Defensive
Pressure) onde o marcador não entra. Acompanha-o por fora.

Duas barreiras, porque uma só não chega:
  1. o ALVO do nível 2 é empurrado para fora do círculo (PositionAI.commit);
  2. a POSIÇÃO do jogador é empurrada para fora todos os frames (FSM,
     estado MARKING) — o alvo é uma intenção, a inércia da corrida e os
     empurrões de coesão podem na mesma metê-lo lá dentro.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const POS = fs.readFileSync(path.join(raiz, 'js', 'bt', 'position_bt.js'), 'utf8');
const FSM = fs.readFileSync(path.join(raiz, 'js', 'fsm.js'), 'utf8');

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

const sandbox = { Math, CAMPO_COMP: 105, Tatics: { pressaoDefensiva: 'balanced' } };
vm.createContext(sandbox);
vm.runInContext(recortarConst(CONFIG, 'MarkingModel') + '\nthis.M = MarkingModel;', sandbox);
const M = sandbox.M;

/*
Reproduz o clamp do commit. É a mesma geometria do código; o teste do
código-fonte, mais abaixo, garante que o commit continua a fazê-lo.
*/
function clamparAlvo(alvo, homem, dirZ, ownGoalZ) {
    const raio = M.distanciaPara(homem[1] * dirZ);
    let dx = alvo[0] - homem[0], dz = alvo[1] - homem[1];
    let d = Math.hypot(dx, dz);
    if (d < 0.001) { dx = 0; dz = (ownGoalZ - homem[1]) >= 0 ? 1 : -1; d = 1; }
    if (d < raio) return [homem[0] + (dx / d) * raio, homem[1] + (dz / d) * raio];
    return alvo;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('alvo dentro do círculo é empurrado para a linha', () => {
    const homem = [0, -30];
    const raio = M.distanciaPara(-30);
    const alvo = clamparAlvo([0.5, -30.5], homem, 1, -52.5);
    assert.ok(Math.abs(dist(alvo, homem) - raio) < 1e-9,
        'ficou a ' + dist(alvo, homem).toFixed(2) + ', raio ' + raio);
});

test('alvo em cima do homem sai pelo lado da própria baliza', () => {
    const homem = [0, -30];
    const alvo = clamparAlvo([0, -30], homem, 1, -52.5);
    assert.ok(alvo[1] < homem[1], 'devia sair para o lado da propria baliza');
    assert.ok(Math.abs(dist(alvo, homem) - M.distanciaPara(-30)) < 1e-9);
});

test('alvo já fora do círculo não é mexido', () => {
    const homem = [0, -30];
    const alvo = clamparAlvo([0, -38], homem, 1, -52.5);
    assert.deepStrictEqual(alvo, [0, -38]);
});

test('o raio do circulo e a distancia de marcacao, 2 m em tudo', () => {
    const homem = [0, -30];
    for (const pressao of ['low', 'balanced', 'high']) {
        const s = { Math, CAMPO_COMP: 105, Tatics: { pressaoDefensiva: pressao } };
        vm.createContext(s);
        vm.runInContext(recortarConst(CONFIG, 'MarkingModel') + '\nthis.M = MarkingModel;', s);
        assert.strictEqual(s.M.distanciaPara(homem[1]), 2.0, pressao);
    }
});

/* ---------------------------------------------------------------- */

// Clamp de POSIÇÃO do estado MARKING, com corte da velocidade para dentro.
function clamparPosicao(pos, vel, homem, dirZ) {
    const raio = M.distanciaPara(homem[1] * dirZ);
    let dx = pos[0] - homem[0], dz = pos[1] - homem[1];
    const d = Math.hypot(dx, dz);
    const out = { pos: pos.slice(), vel: vel.slice() };
    if (d > 0.001 && d < raio) {
        const nx = dx / d, nz = dz / d;
        out.pos = [homem[0] + nx * raio, homem[1] + nz * raio];
        const vn = vel[0] * nx + vel[1] * nz;
        if (vn < 0) out.vel = [vel[0] - vn * nx, vel[1] - vn * nz];
    }
    return out;
}

test('jogador dentro do círculo é empurrado para fora', () => {
    const homem = [0, -30];
    const r = clamparPosicao([1, -30], [0, 0], homem, 1);
    assert.ok(Math.abs(dist(r.pos, homem) - M.distanciaPara(-30)) < 1e-9);
});

test('a velocidade que aponta ao homem é cortada', () => {
    const homem = [0, -30];
    // A 1m do homem, a correr direito a ele (para -x).
    const r = clamparPosicao([1, -30], [-5, 0], homem, 1);
    assert.ok(r.vel[0] >= -1e-9, 'continuou a ir para cima do homem: vx=' + r.vel[0]);
});

test('a componente lateral sobrevive: ele desliza à volta do círculo', () => {
    const homem = [0, -30];
    // A correr para dentro E para o lado ao mesmo tempo.
    const r = clamparPosicao([1, -30], [-5, 4], homem, 1);
    assert.ok(Math.abs(r.vel[1] - 4) < 1e-9, 'a parte lateral nao devia ser tocada');
});

test('quem está fora do círculo não é travado', () => {
    const homem = [0, -30];
    const r = clamparPosicao([0, -38], [0, 5], homem, 1);
    assert.deepStrictEqual(r.pos, [0, -38]);
    assert.deepStrictEqual(r.vel, [0, 5]);
});

/* ---------------------------------------------------------------- */

test('o commit poe o marcador atras do homem, sem condicoes', () => {
    /*
    O circulo deixou de ser um clamp sobre o alvo da arvore: a marcacao
    passou a ser A REGRA (ver marcacao_efectiva.test.js). Quem tem homem
    atribuido fica no ponto goalSide, a MarkingModel.distancia dele - o que
    torna o circulo automatico, porque esse ponto esta sempre a essa
    distancia.
    */
    const i = POS.indexOf('commit: function');
    const j = POS.indexOf('const dt =', i);
    assert.ok(i >= 0 && j > i);
    const corpo = POS.slice(i, j);
    assert.ok(corpo.includes('if (p.markingTarget)'), 'o commit deixou de tratar a marcacao');
    assert.ok(corpo.includes('goalSide(p, p.markingTarget, MarkingModel.distancia)'),
        'o commit nao poe o marcador do lado da propria baliza');
});

test('a FSM aplica o círculo no estado MARKING', () => {
    const i = FSM.indexOf("case 'MARKING':");
    assert.ok(i >= 0);
    // Fatia generosa: o bloco cresceu com o recuo.
    const corpo = FSM.slice(i, i + 3000);
    assert.ok(/MarkingModel\.distanciaPara/.test(corpo), 'a FSM nao usa o raio');
    assert.ok(/vn < 0/.test(corpo), 'a FSM nao corta a velocidade para dentro');
});

/* ------------------------------------------------------------------
   Recuo: o homem avança, o marcador anda para trás.
   ------------------------------------------------------------------ */

/*
Reproduz o passo de recuo do estado MARKING: compara as velocidades RADIAIS
e, se o homem fecha a distância mais depressa do que o marcador a abre,
soma a diferença ao recuo.
*/
function recuar(pos, vel, homem, velHomem, dirZ) {
    const raio = M.distanciaPara(homem[1] * (dirZ || 1));
    const dx = pos[0] - homem[0], dz = pos[1] - homem[1];
    const d = Math.hypot(dx, dz);
    const out = vel.slice();
    if (d > 0.001 && d < raio + M.margemRecuo) {
        const nx = dx / d, nz = dz / d;
        const vRadHomem = velHomem[0] * nx + velHomem[1] * nz;
        const vRadMeu = vel[0] * nx + vel[1] * nz;
        if (vRadHomem > 0 && vRadMeu < vRadHomem) {
            const falta = vRadHomem - vRadMeu;
            out[0] += falta * nx;
            out[1] += falta * nz;
        }
    }
    return out;
}

test('a margem de recuo está declarada', () => {
    assert.ok(M.margemRecuo > 0, 'sem margem, o recuo so comeca depois de ja ser tarde');
});

test('homem a avançar: o marcador ganha velocidade para trás', () => {
    const homem = [0, -30];
    const raio = M.distanciaPara(-30);
    // Marcador atrás do homem (lado da própria baliza), parado.
    const pos = [0, -30 - raio];
    // Homem a correr na direcção dele a 5 m/s (z a diminuir).
    const v = recuar(pos, [0, 0], homem, [0, -5], 1);
    assert.ok(v[1] < -4.9, 'devia recuar a ~5 m/s, veio ' + v[1].toFixed(2));
});

test('o recuo iguala exactamente a aproximação — a distância mantém-se', () => {
    const homem = [0, -30];
    const raio = M.distanciaPara(-30);
    const pos = [0, -30 - raio];
    for (const velHomem of [2, 5, 8]) {
        const v = recuar(pos, [0, 0], homem, [0, -velHomem], 1);
        assert.ok(Math.abs(Math.abs(v[1]) - velHomem) < 1e-9,
            'homem a ' + velHomem + ' -> recuo ' + Math.abs(v[1]).toFixed(2));
    }
});

test('homem a AFASTAR-SE não faz o marcador recuar', () => {
    const homem = [0, -30];
    const raio = M.distanciaPara(-30);
    const pos = [0, -30 - raio];
    // Homem a fugir para a frente (z a aumentar).
    const v = recuar(pos, [0, 0], homem, [0, 5], 1);
    assert.deepStrictEqual(v, [0, 0], 'nao ha nada de que recuar');
});

test('quem já recua depressa que chegue não leva empurrão extra', () => {
    const homem = [0, -30];
    const raio = M.distanciaPara(-30);
    const pos = [0, -30 - raio];
    // Já a recuar a 6 m/s, homem só a 3.
    const v = recuar(pos, [0, -6], homem, [0, -3], 1);
    assert.deepStrictEqual(v, [0, -6]);
});

test('só a parte radial é tocada — o acompanhamento lateral fica', () => {
    const homem = [0, -30];
    const raio = M.distanciaPara(-30);
    const pos = [0, -30 - raio];
    // Marcador a deslizar de lado enquanto o homem vem a direito.
    const v = recuar(pos, [4, 0], homem, [0, -5], 1);
    assert.ok(Math.abs(v[0] - 4) < 1e-9, 'a velocidade lateral foi mexida');
    assert.ok(v[1] < -4.9, 'nao recuou');
});

test('longe do círculo não há recuo nenhum', () => {
    const homem = [0, -30];
    const pos = [0, -45];    // bem fora do raio + margem
    const v = recuar(pos, [0, 0], homem, [0, -8], 1);
    assert.deepStrictEqual(v, [0, 0]);
});

test('o recuo começa ANTES de o círculo ser violado', () => {
    const homem = [0, -30];
    const raio = M.distanciaPara(-30);
    // Ainda fora do círculo, mas dentro da margem.
    const pos = [0, -30 - (raio + M.margemRecuo * 0.5)];
    const v = recuar(pos, [0, 0], homem, [0, -5], 1);
    assert.ok(v[1] < -4.9, 'devia comecar a recuar antes de ser tocado');
});

test('a FSM faz mesmo o recuo no estado MARKING', () => {
    const i = FSM.indexOf("case 'MARKING':");
    const corpo = FSM.slice(i, i + 2600);
    assert.ok(/margemRecuo/.test(corpo), 'a FSM nao usa a margem de recuo');
    assert.ok(/vRadHomem/.test(corpo), 'a FSM nao compara a velocidade radial do homem');
});
