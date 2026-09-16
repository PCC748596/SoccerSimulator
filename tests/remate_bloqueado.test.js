/*
O REMATE BLOQUEADO — de quem e o toque, e para onde vai a bola.

Medido em 6 partidas headless (tools/headless/cantos_lote.js): 5.2 bloqueios
por jogo e ZERO deles a chegar a linha de fundo, com os cantos em 3.8 por jogo
contra os 9.9 de um jogo a serio. Duas causas, as duas neste ramo do
`executeShotGameplay`:

 1. o ultimo toque ficava atribuido ao REMATADOR (`Match.lastTouchedTeam =
    p.team` corre no fim, para os dois ramos). Pela Lei 9 quem tocou por ultimo
    foi o defensor: se a bola sair pela linha de fundo e canto, e o jogo dava
    tiro de meta;

 2. a bola bloqueada era mirada a `ball.z + dirZ * 3` -- tres metros A FRENTE,
    sempre no sentido do ataque, com potencia 4.0-6.4. Um bloqueio nao podia
    ricochetear para tras nem para o lado, portanto nao podia sair.

O desvio passa a ser um ricochete a serio: mantem-se a direccao do remate,
roda-se um angulo e perde-se velocidade. Quem decide se sai e a DISTANCIA a
que o bloqueio aconteceu, como no futebol -- um corte a 8 m da linha vai la
fora, um a 25 m morre no campo.

Corre com: node --test tests/remate_bloqueado.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(20260909);

require('../tools/headless/harness.js');

test('o desvio do bloqueio perde velocidade e roda a direccao', () => {
    assert.strictEqual(typeof desvioDeBloqueio, 'function',
        'desvioDeBloqueio tem de existir em utils.js');
    const M = BlockModel;
    let maxAng = 0, paraTras = 0, n = 0;
    for (let i = 0; i < 4000; i++) {
        const d = desvioDeBloqueio({ dirX: 0, dirZ: 1, potencia: 22 });
        const v = Math.hypot(d.x, d.z);
        assert.ok(v > 0.5, 'a bola desviada nao pode ficar parada');
        assert.ok(v < 22, 'o desvio nunca acelera a bola');
        const ang = Math.abs(Math.atan2(d.x, d.z));
        if (ang > maxAng) maxAng = ang;
        if (d.z < 0) paraTras++;
        n++;
    }
    assert.ok(maxAng <= M.anguloMax + 1e-6,
        `desvio maximo ${(maxAng * 180 / Math.PI).toFixed(0)} graus acima do tecto`);
    /*
    A cauda larga e o ponto todo: e ela que manda a bola a linha de fundo. Sem
    desvios de mais de 60 graus o bloqueio nunca da canto.
    */
    const largos = 100 * paraTras / n;
    assert.ok(M.anguloMax > Math.PI / 3,
        'sem angulos acima de 60 graus o bloqueio nao pode sair pela linha');
    void largos;
});

test('o desvio e simetrico: nao empurra sempre para o mesmo lado', () => {
    let esq = 0, dir = 0;
    for (let i = 0; i < 4000; i++) {
        const d = desvioDeBloqueio({ dirX: 0, dirZ: 1, potencia: 20 });
        if (d.x < 0) esq++; else if (d.x > 0) dir++;
    }
    const razao = esq / Math.max(1, dir);
    assert.ok(razao > 0.8 && razao < 1.25,
        `desvio enviesado para um lado: ${esq} contra ${dir}`);
});

test('o toque do bloqueio e do DEFENSOR, e nao de quem remata', () => {
    const scene = new THREE.Scene();
    Match.init(scene);
    if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
    if (typeof Sim === 'undefined') global.Sim = {};
    Sim.running = true;

    const rematador = Match.players.find(p => p.role !== 'gk');
    const bloqueador = Match.opponents.find(p => p.role !== 'gk');
    const dir = rematador.dirZ;

    let atribuidoAoDefensor = 0, tentativas = 0;
    for (let i = 0; i < 200; i++) {
        // Rematador a 10 m da baliza, com o defensor colado a frente dele.
        rematador.model.position.set(0, ALTURA_BASE_Y, dir * (CAMPO_COMP / 2 - 10));
        bloqueador.model.position.set(0.4, ALTURA_BASE_Y, dir * (CAMPO_COMP / 2 - 9));
        Match.ball.position.set(0, 0.11, dir * (CAMPO_COMP / 2 - 10));
        Match.ballVel.set(0, 0, 0);
        rematador.hasBall = true;
        Match.ballCarrier = rematador;
        Match.lastTouchedPlayer = rematador;
        Match.lastTouchedTeam = rematador.team;

        const antes = MatchStats[bloqueador.team].bloqueiosFeitos;
        executeShotGameplay(rematador);
        if (MatchStats[bloqueador.team].bloqueiosFeitos > antes) {
            tentativas++;
            if (Match.lastTouchedPlayer === bloqueador) atribuidoAoDefensor++;
        }
    }
    assert.ok(tentativas > 10, `poucos bloqueios na amostra: ${tentativas}`);
    assert.strictEqual(atribuidoAoDefensor, tentativas,
        `${tentativas - atribuidoAoDefensor} de ${tentativas} bloqueios ficaram ` +
        'creditados ao rematador -- dao tiro de meta onde a regra manda canto');
});
