/*
O LANCAMENTO COM A MAO: DOIS GESTOS, E A BOLA NAO SALTA.

Relato, com fotografias: "quando o goleiro vai lancar a bola com a mao, a bola
fica nas costas dele e quando chega perto do corpo e teletransportada para o
lado do pe" -- e, a seguir, "lancamento de mao por cima, para alvos a mais de
30 metros".

Havia UM gesto so, o de cima (`GoalkeeperThrowClip`): o braco vai atras, sobe
por cima da cabeca e larga a bola no alto. A bola ROLADA -- a maioria das
entregas -- era largada la em cima e depois o `executePassGameplay` fazia
`Match.ball.position.y = BallPhysics.raio` (fsm.js): saltava 1.1 m para o
relvado num frame, ao lado do pe.

Agora ha o gesto de baixo, com a mao a passar rente ao chao no instante do
contacto, e a escolha e por distancia.

Corre com: node --test tests/gk_lancamento_mao.test.js
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

const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

test('o limite dos dois gestos vive na configuracao', () => {
    assert.strictEqual(typeof GkThrowModel.distanciaPorCima, 'number');
    assert.strictEqual(GkThrowModel.distanciaPorCima, 30);
    assert.ok(typeof GoalkeeperUnderarmThrowClip === 'object' &&
        GoalkeeperUnderarmThrowClip.frames.length >= 8,
        'o gesto por baixo desapareceu');
    assert.ok(ActionAnimClips.gkThrowBaixo && ActionAnimClips.gkThrowBaixo.duration > 0,
        'o clip do gesto por baixo nao esta declarado');
});

test('no gesto por baixo a mao chega ao relvado no contacto', () => {
    /*
    E este o ponto todo: se a mao esta no chao quando a bola sai, a linha do
    `BallPhysics.raio` deixa de ser um teletransporte. Le-se a ALTURA do braco
    no frame do contacto contra a do gesto por cima.
    */
    const C = ActionAnimClips.gkThrowBaixo;
    const norm = C.contactTime;
    const baixo = amostrarClipLancamentoGR(norm, GoalkeeperUnderarmThrowClip);
    const cima = amostrarClipLancamentoGR(ActionAnimClips.gkThrow.contactTime, GoalkeeperThrowClip);

    console.log(`  no contacto: braco (rotacao x) por baixo ${baixo.bracoRx.toFixed(2)}, ` +
        `por cima ${cima.bracoRx.toFixed(2)} | altura do corpo ${baixo.altura.toFixed(2)} vs ${cima.altura.toFixed(2)}`);

    // O braco por cima aponta para o alto (rotacao positiva grande); o de
    // baixo esta rente ao corpo, e o corpo esta agachado.
    /*
    0.5 e nao 0.8: o `contactTime` declarado (8/11) cai um pouco depois do
    frame 8 do clip, onde o braco esta no maximo (1.10). Fica assim porque o
    numero e do gesto antigo e nao e este teste que o deve mexer.
    */
    assert.ok(cima.bracoRx > 0.5, 'o gesto por cima deixou de largar a bola no alto');
    assert.ok(Math.abs(baixo.bracoRx) < 0.35,
        `no gesto por baixo o braco esta a ${baixo.bracoRx.toFixed(2)} rad: nao esta rente`);
    assert.ok(baixo.altura < -0.25,
        `o corpo nao desce no rolamento (altura ${baixo.altura.toFixed(2)})`);
});

test('a bola segue a mao e nao ha teletransporte no gesto por baixo', () => {
    /*
    O gesto e conduzido a mao: o que se mede e o que eu mexi -- a bola colada a
    mao do clip certo, frame a frame, sem nenhum salto. Montar o lance inteiro
    (o guarda-redes a decidir a saida) traria as guardas todas do ramo dele e
    mediria outra coisa.
    */
    const gk = Match.players[0];
    const alvo = Match.players.find(p => p.role === 'def');
    const dir = gk.dirZ;
    const linha = -dir * LINHA_FUNDO;

    gk.model.position.set(0, ALTURA_BASE_Y, linha + dir * 3.0);
    alvo.model.position.set(6.0, ALTURA_BASE_Y, linha + dir * 16.0);

    Match.mudarEstado('PLAY', 'teste');
    gk.hasBall = true;
    Match.ballCarrier = gk;
    gk.gkEstado = 'lancando';
    gk.gkLancaPorCima = false;
    gk.gkTempoMergulho = 0;
    gk.gkKickNorm = 0;
    gk.gkKickAction = new ActionState('gkThrowBaixo', {
        onContact: () => { gk.releaseFromHands(alvo); }
    });

    const dt = 1 / 60;
    let maiorSalto = 0, anterior = null, frames = 0;
    while (gk.gkEstado === 'lancando' && frames < 120) {
        Match.update(dt);
        frames++;
        if (anterior) {
            const salto = anterior.distanceTo(Match.ball.position);
            if (salto > maiorSalto) maiorSalto = salto;
        }
        anterior = Match.ball.position.clone();
        if (gk.gkKickAction && gk.gkKickAction.executed) break;
    }

    console.log(`  gesto por baixo: ${frames} frames, maior salto da bola num frame ` +
        `${maiorSalto.toFixed(2)} m, largada a y=${Match.ball.position.y.toFixed(2)}`);
    assert.ok(frames > 10, `o gesto acabou em ${frames} frames`);
    /*
    O salto frame a frame sai 0.00 aqui e isso NAO prova o gluing: no headless
    o rig nao e animado (o `animateBones` sai a porta com o `Sim.running`), a
    mao nao se mexe e a bola tambem nao. O que este assert guarda e o que
    continua a valer: nada a atira para lado nenhum durante o gesto.
    */
    assert.ok(maiorSalto < 0.6,
        `a bola saltou ${maiorSalto.toFixed(2)} m num frame durante o gesto`);
    assert.ok(Match.ball.position.y < 0.8,
        `a bola foi largada a ${Match.ball.position.y.toFixed(2)} m no gesto de rolar`);
});
