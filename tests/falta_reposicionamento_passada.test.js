/*
NO REPOSICIONAMENTO DA FALTA NINGUEM DESLIZA SEM ANIMACAO.

Relato: *"tem jogadores, no reposicionamento das faltas, que estao se movendo
sem animacao"*. Ja tinha sido corrigido uma vez, com uma lista de estados
escrita a mao dentro do ramo `lugarBolaParada` do `Player.update`. A lista
falhava o `SLIDE_TACKLE` — e a falta vem quase sempre a seguir a um carrinho,
por isso era o infractor que deslizava.

O que se mede aqui e o predicado, nao o ramo: para CADA estado em que o
`animateBones` nao desenha a passada, o `estadoSemPassada` tem de dizer que sim.
Se amanha aparecer um estado novo que retorne cedo no `animateBones`, este teste
nao o apanha sozinho — mas apanha quem o acrescentar so a uma das listas.
*/
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');

const fsmSrc = ler('js/fsm.js');
const extrair = (src, nome) => {
    const ini = src.indexOf(`function ${nome}(`);
    assert.notStrictEqual(ini, -1, `${nome} nao encontrada`);
    const fim = src.indexOf('\n}', ini);
    return src.slice(ini, fim + 2);
};
const { temGestoComClip, estadoSemPassada } = new Function(
    `${extrair(fsmSrc, 'temGestoComClip')}
     ${extrair(fsmSrc, 'estadoSemPassada')}
     return { temGestoComClip, estadoSemPassada };`)();

test('os estados que o animateBones nao anima contam como sem passada', () => {
    // O `animateBones` retorna antes de qualquer ramo de passada nestes dois.
    for (const estado of ['TACKLE', 'SLIDE_TACKLE']) {
        assert.ok(estadoSemPassada(estado), `${estado} tem de contar como sem passada`);
    }
    // Os gestos com clip desenham o gesto e o ciclo nao chega a entrar.
    for (const estado of ['SHOOT', 'SET_PIECE_KICK', 'PASS', 'CROSS', 'BALL_CONTROL_RIGHT']) {
        assert.ok(temGestoComClip(estado), `${estado} e gesto com clip`);
        assert.ok(estadoSemPassada(estado), `${estado} tem de contar como sem passada`);
    }
    // Estes tem ramos proprios que escrevem as pernas.
    for (const estado of ['DRIBBLE', 'CHEST_CONTROL']) {
        assert.ok(estadoSemPassada(estado), `${estado} tem de contar como sem passada`);
    }
});

test('quem anda normalmente nao e apanhado pelo predicado', () => {
    for (const estado of ['IDLE', 'CARRY', 'MARKING', 'MOVE_TO_POS', 'RUN_INTO_SPACE',
                          'SUPPORT_PASS', 'INTERCEPT', 'SET_PIECE_WAIT', 'LATERAL']) {
        assert.ok(!estadoSemPassada(estado), `${estado} anda com passada, nao pode entrar`);
    }
});

test('o ramo do reposicionamento usa o predicado e nao uma lista propria', () => {
    const playerSrc = ler('js/player.js');
    const ini = playerSrc.indexOf('if (this.lugarBolaParada) {');
    assert.notStrictEqual(ini, -1, 'ramo lugarBolaParada nao encontrado');
    const ramo = playerSrc.slice(ini, ini + 3000);
    assert.ok(ramo.includes('estadoSemPassada'),
        'o ramo tem de chamar estadoSemPassada em vez de repetir a lista');
    assert.ok(ramo.includes("changeState('SET_PIECE_WAIT')"),
        'o ramo tem de passar a SET_PIECE_WAIT');
});
