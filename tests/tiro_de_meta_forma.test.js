/*
NO TIRO DE META AS DUAS EQUIPAS ESTÃO À VOLTA DO MEIO-CAMPO.

Relato: "esse é o ajuste do tiro de meta, completamente sem sentido — um time
deveria estar no meio campo e o time do batedor um pouco antes".

Duas causas, e a segunda é que tornava a primeira invisível:

 1. o `nivel2Activo()` incluía o GOAL_KICK, e o bloco de quem NÃO tem a bola
    está ancorado à própria baliza: quem recebia o tiro de meta ia todo para a
    PRÓPRIA área, a 60 m da bola (medido: +11.7 m de profundidade média no
    referencial de ataque de quem bate, o mais recuado no risco da área dele);
 2. a forma era escrita em DOIS sítios com a mesma conta — o `setupSetPiece`
    uma vez e o `updateGoalKickWait` outra vez por FRAME. Mudar a do setup não
    mudava nada.

Este teste força um tiro de meta e mede as duas equipas no referencial de
ataque de quem bate, com o lance ainda de pé (medir depois é medir o jogo a
recomeçar).

Corre com: node tests/tiro_de_meta_forma.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

/*
SEMENTE FIXA. Sem isto o teste corre com o `Math.random` do Node e uma medição
de jogo — que depende de 600 s de simulação antes do lance — passa ou falha
conforme o dia. O mulberry32 é o mesmo das ferramentas em tools/headless.
*/
const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(1000);

require('../tools/headless/harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

// Uns segundos de jogo para ninguém estar no sítio da formação inicial.
for (let i = 0; i < 600; i++) Match.update(dt);

const bate = Match.players;
const recebe = Match.opponents;
const attDir = bate[0].dirZ;
const linhaZ = -attDir * LINHA_FUNDO;

Match.ball.position.set(20, 0.2, -attDir * (CAMPO_COMP / 2 + 1));
Match.ballVel.set(0, 0, 0);
Match.setupSetPiece('GOAL_KICK', 'TeamA');

let frames = 0;
while (frames < 60 * 6 && Match.state === 'GOAL_KICK') { Match.update(dt); frames++; }

const prof = (lista) => lista.filter(p => p.role !== 'gk').map(p => p.model.position.z * attDir);
const med = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const zBate = prof(bate), zRecebe = prof(recebe);

test('o lance ainda está de pé quando se mede', () => {
    assert.strictEqual(Match.state, 'GOAL_KICK', 'o tiro de meta acabou antes da medição');
});

test('quem recebe está à volta do meio-campo, e não na própria área', () => {
    const m = med(zRecebe);
    // Medido: +12.6 m antes (o mais recuado a +35.6, dentro da própria área),
    // -0.3 m depois. O meio-campo é o 0.
    assert.ok(m < 6, `profundidade média de quem recebe = ${m.toFixed(1)} m: continua enfiado na própria área`);
    assert.ok(m > -18, `profundidade média de quem recebe = ${m.toFixed(1)} m: colou-se todo à área de quem bate`);
    assert.ok(Math.max(...zRecebe) < 26,
        `o mais recuado de quem recebe está a ${Math.max(...zRecebe).toFixed(1)} m: dentro da própria área, a 60 m da bola`);
    // E alguém sobe mesmo a pressionar a saída curta.
    assert.ok(Math.min(...zRecebe) < -12,
        'ninguém de quem recebe pressiona a saída: o mais adiantado está a ' + Math.min(...zRecebe).toFixed(1));
});

test('quem bate fica um pouco antes, e ninguém deles nasce na linha de fundo', () => {
    const m = med(zBate);
    assert.ok(m < med(zRecebe), 'a equipa que bate devia estar ATRÁS da que recebe');
    assert.ok(m > -25, `profundidade média de quem bate = ${m.toFixed(1)} m: amontoado na própria baliza`);
    assert.ok(Math.max(...zBate) > -6, 'nenhum jogador de quem bate chega perto do meio-campo');
    // ... e nenhum deles anda a jogar no meio-campo adversário à espera do
    // pontapé: medido, o mais adiantado estava a +20.8 m antes e +3.5 depois.
    assert.ok(Math.max(...zBate) < 12,
        `o mais adiantado de quem bate está a ${Math.max(...zBate).toFixed(1)} m, dentro do meio-campo adversário`);
});

test('ninguém de quem recebe fica dentro da grande área de quem bate', () => {
    const dentro = recebe.filter(p => p.role !== 'gk' &&
        Area.contem(p.model.position.x, p.model.position.z, linhaZ));
    assert.deepStrictEqual(dentro.map(p => p.pos), [], 'adversários dentro da área no tiro de meta');
});

test('a forma tem UM sítio só, e o nível 2 está desligado no lance', () => {
    const fs = require('fs');
    const path = require('path');
    const raiz = path.join(__dirname, '..');
    const setpieces = fs.readFileSync(path.join(raiz, 'js/match/match_setpieces.js'), 'utf8');
    const loop = fs.readFileSync(path.join(raiz, 'js/match/match_loop.js'), 'utf8');

    assert.ok(setpieces.includes('formaDoTiroDeMeta: function'), 'a forma do tiro de meta desapareceu');
    // Chamada nos dois sítios: montagem e frame a frame.
    const chamadas = setpieces.split('this.formaDoTiroDeMeta(').length - 1;
    assert.ok(chamadas >= 2,
        'a forma voltou a ser escrita só num sítio — o outro tinha conta própria e ganhava');

    const ini = loop.indexOf('nivel2Activo: function');
    const corpo = loop.slice(ini, ini + 900);
    assert.ok(!/return[^;]*'GOAL_KICK'/.test(corpo),
        'o GOAL_KICK voltou ao nível 2: o bloco reescreve a forma do lance no frame seguinte');
});
