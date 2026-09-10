/*
O GUARDA-REDES NAO CORRE ATRAS DA BOLA QUE ACABOU DE PASSAR.

Relato: "o goleiro, varias vezes, sai jogando com um zagueiro dentro da area e
sai correndo atras dele para pegar a bola que acabou de passar."

No ramo dele (`updateGK`, player.js):

    let looseBallInBox = (!carrier && Match.ballVel.lengthSq() < 150);
    if (looseBallInBox || (distToBall < 3.2 && !carrier)) {
        alvoGkX = Match.ball.position.x; ... speedLerp = 6.0;
        if (distToBall < 1.2) this.gkEstado = 'apanhar';
    }

Um passe EM VOO nao tem `ballCarrier` — ele fica null no instante em que a bola
sai do pe. Logo a bola que o proprio guarda-redes acabou de jogar para um
central dentro da area conta como "solta na area", e ele vai atras dela a
6 m/s e agacha-se para a apanhar.

E a mesma armadilha que os jogadores de campo ja tinham resolvida no
`escolherChaser` (team_bt.js): "sem isto o PASSADOR corria atras da sua propria
bola". A bola ENDERECADA a um companheiro nao esta solta.

Corre com: node --test tests/gk_nao_persegue_o_proprio_passe.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(20260911);

require('../tools/headless/harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

for (let i = 0; i < 300; i++) Match.update(dt);

/*
Monta o lance do relato: o guarda-redes acabou de jogar para um central que
esta DENTRO da propria area, e a bola vai a caminho dele.
*/
const gk = Match.players[0];
const central = Match.players.find(p => p.role === 'def');
const dir = gk.dirZ;
const linha = -dir * LINHA_FUNDO;

gk.model.position.set(0, ALTURA_BASE_Y, linha + dir * 4.0);
gk.gkEstado = 'idle';
gk.hasBall = false;
central.model.position.set(9.0, ALTURA_BASE_Y, linha + dir * 11.0);

Match.mudarEstado('PLAY', 'teste');
Match.ball.position.set(3.0, BallPhysics.raio, linha + dir * 7.0);
Match.ballVel.set(7.0, 0, dir * 5.0);
Match.ballCarrier = null;
Match.intendedReceiver = central;
Match.gkHoldingBall[gk.team] = false;

const posInicial = gk.model.position.clone();
let entrouEmApanhar = false, andouParaABola = 0, distMin = Infinity, alvoNaBola = 0;
for (let i = 0; i < 90; i++) {
    // A bola continua endereçada enquanto voa — é o que o passe faz.
    if (Match.ballCarrier === null) Match.intendedReceiver = central;
    Match.update(dt);
    if (gk.gkEstado === 'apanhar') entrouEmApanhar = true;
    const dAgora = gk.model.position.distanceTo(Match.ball.position);
    const dAntes = posInicial.distanceTo(Match.ball.position);
    if (dAgora < dAntes - 0.5) andouParaABola++;
    if (dAgora < distMin) distMin = dAgora;
    // O alvo dele E a bola? Isso e persegui-la; acompanhar o angulo nao e.
    if (gk.dynamicTarget && gk.dynamicTarget.distanceTo(Match.ball.position) < 1.5) alvoNaBola++;
}

test('nao entra em apanhar por causa do proprio passe', () => {
    assert.strictEqual(entrouEmApanhar, false,
        'o guarda-redes agachou-se para apanhar a bola que ele proprio jogou');
});

test('nem faz da bola o alvo dele', () => {
    /*
    Acompanhar o angulo da bola e trabalho dele e nao e o defeito: o `gkAnchor`
    desloca-o sempre com a jogada. O que o relato descreve e o ALVO dele ser a
    bola -- a corrida em linha recta atras dela, a 6 m/s, para a apanhar.
    */
    const andou = posInicial.distanceTo(gk.model.position);
    console.log(`  andou ${andou.toFixed(2)} m em 1.5 s | chegou a ${distMin.toFixed(2)} m da bola | ` +
        `alvo em cima da bola em ${alvoNaBola} de 90 frames`);
    assert.strictEqual(alvoNaBola, 0,
        `o alvo do guarda-redes foi a propria bola em ${alvoNaBola} frames`);
    assert.ok(distMin > 2.0,
        `chegou a ${distMin.toFixed(2)} m da bola que ele proprio jogou`);
});

test('e a guarda esta escrita no ramo dele', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'player.js'), 'utf8');
    const i = src.indexOf('looseBallInBox');
    assert.ok(i > 0, 'o ramo da bola solta na area desapareceu');
    const corpo = src.slice(i - 400, i + 900);
    assert.ok(/intendedReceiver/.test(corpo),
        'a bola endereçada a um companheiro voltou a contar como solta');
});
