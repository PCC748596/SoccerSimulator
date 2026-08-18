/*
Comportamentos que TÊM de ser iguais nos dois cérebros.

Bola parada, guarda-redes e destinatário do passe não são decisões — são
regras de jogo. Estavam duplicados (uma cópia na árvore, outra nos gates do
Utility) e divergiram: a cópia do guarda-redes ficou presa na saída de bola
antiga, e como o Utility corre EM VEZ da árvore, ligar o botão desfazia a
regra dos 80/20 sem ninguém dar por isso.

Estes testes falham se a duplicação voltar.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const BT = fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8');
const UTIL = fs.readFileSync(path.join(raiz, 'js', 'utility', 'player_utility.js'), 'utf8');

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

test('as funções partilhadas vivem no player_bt.js', () => {
    for (const f of ['tratarBolaParada', 'tratarGuardaRedes', 'souODestinatario']) {
        assert.ok(BT.includes('function ' + f + '('), 'falta ' + f);
    }
});

test('o Utility chama as partilhadas em vez de as reescrever', () => {
    for (const f of ['tratarBolaParada', 'tratarGuardaRedes', 'souODestinatario']) {
        assert.ok(UTIL.includes(f + '('), 'o Utility nao usa ' + f);
        assert.ok(!UTIL.includes('function ' + f + '('),
            'o Utility tem uma COPIA de ' + f);
    }
});

test('o Utility não reimplementa a saída de bola do guarda-redes', () => {
    // A versão antiga procurava qualquer 'def' ou 'mid' — se isso reaparecer
    // aqui, a regra dos 80/20 volta a ser contornada.
    assert.ok(!/findPassTarget\(['"]def['"]\)/.test(UTIL),
        'o Utility voltou a escolher o alvo do guarda-redes por conta propria');
    assert.ok(!/puntBall\(\)/.test(UTIL),
        'o Utility voltou a decidir o chutao por conta propria');
});

test('o Utility não reimplementa a bola parada', () => {
    for (const marca of ['SET_PIECE_WAIT', 'CORNER_KICK', 'GOAL_KICK']) {
        assert.ok(!UTIL.includes(marca),
            'o Utility voltou a tratar bola parada sozinho (' + marca + ')');
    }
});

/* ------------------------------------------------------------------
   Comportamento da bola parada, corrido a sério.
   ------------------------------------------------------------------ */

function correrBolaParada(estadoJogo, estadoJogador) {
    const sandbox = { Match: { state: estadoJogo } };
    const p = {
        fsm: {
            currentState: estadoJogador,
            changeState(s) { this.currentState = s; }
        }
    };
    const fn = new Function('Match', 'p',
        recortarFuncao(BT, 'tratarBolaParada') + '; tratarBolaParada(p);');
    fn(sandbox.Match, p);
    return p.fsm.currentState;
}

test('canto: quem não está a bater espera', () => {
    assert.strictEqual(correrBolaParada('CORNER_KICK', 'CARRY'), 'SET_PIECE_WAIT');
});

test('canto: quem bate mantém-se a bater', () => {
    assert.strictEqual(correrBolaParada('CORNER_KICK', 'SET_PIECE_TAKER'), 'SET_PIECE_TAKER');
});

test('tiro de meta: MOVE_TO_POS sobrevive', () => {
    // É isto que deixa os jogadores irem para as posições do setupSetPiece
    // em vez de congelarem onde estavam.
    assert.strictEqual(correrBolaParada('GOAL_KICK', 'MOVE_TO_POS'), 'MOVE_TO_POS');
});

test('tiro de meta: quem está noutro estado passa a esperar', () => {
    assert.strictEqual(correrBolaParada('GOAL_KICK', 'CARRY'), 'SET_PIECE_WAIT');
});

test('tiro de meta: quem bate mantém-se a bater', () => {
    assert.strictEqual(correrBolaParada('GOAL_KICK', 'SET_PIECE_TAKER'), 'SET_PIECE_TAKER');
});

test('golo e outros estados parados mandam toda a gente para IDLE', () => {
    assert.strictEqual(correrBolaParada('GOAL', 'CARRY'), 'IDLE');
    assert.strictEqual(correrBolaParada('KICKOFF', 'MOVE_TO_POS'), 'IDLE');
});
