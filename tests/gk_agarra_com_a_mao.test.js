/*
O GUARDA-REDES SO AGARRA O QUE A MAO ALCANCA.

Relato, com tres capturas: "o goleiro esta 'pegando' a bola sem pular nela. A
quase 2 metros de distancia a bola e teletransportada para as maos do goleiro.
O goleiro deveria pular em baixo e segurar a bola (GK_Low)."

Medido (tools/headless/gk_agarra_de_longe.js, 15 min de jogo):

    17 bolas agarradas
    distancia da bola ao CORPO   media 1.49 m, maximo 2.30
    distancia da bola a MAO      media 1.43 m, maximo 2.03
    agarradas a mais de 1 m da mao: 17 de 17
    estado em que agarrou: idle 11, maos 5, apanhar 1

Ou seja: em 11 das 17 ele estava PARADO, sem gesto nenhum, e a bola saltou-lhe
para as maos de mais de um metro de distancia. Duas causas, as duas com o
mesmo numero:

  - `resolveBallContact` (match_physics.js) agarrava quando a trajectoria da
    bola passava a menos de **1.3 m do CORPO** dele -- do centro do modelo,
    nao das maos, e sem gesto nenhum;
  - o estado 'maos' (player.js) media da mao mas com o mesmo 1.3 m, que e o
    dobro do que um braco alcanca.

E a bola que passa mais longe do que isso tem de ser MERGULHO
(`GoalkeeperPose.mergulhoLateralMin`), que estava em 2.0 m: entre o alcance
real do braco e os 2 m nao havia gesto nenhum, e era essa faixa que o
teletransporte tapava.

Corre com: node --test tests/gk_agarra_com_a_mao.test.js
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

const registos = [];
const _w = new THREE.Vector3();
const proto = Object.getPrototypeOf(Match.players[0]);
const orig = proto.grabBall;
proto.grabBall = function () {
    if (this.role === 'gk' && Match.ball) {
        let mao = Infinity;
        for (const nome of ['lHand', 'rHand']) {
            const m = this.rig && this.rig[nome];
            if (!m) continue;
            m.getWorldPosition(_w);
            mao = Math.min(mao, _w.distanceTo(Match.ball.position));
        }
        /*
        E A DISTÂNCIA AO CORPO, que passou a valer: desde que existe a defesa
        ao corpo (ver GkCatchModel.alcanceCorpo), uma bola ao peito ou às
        pernas é agarrada sem estar perto de nenhuma mão — e é assim que se
        defende um remate ao corpo.

        O que este teste guarda continua a ser o que o relato descreve: a bola
        agarrada de LONGE, a dois metros, sem gesto nenhum. Por isso a conta
        passou a ser "perto da mão OU no corpo" em vez de só a primeira.
        */
        let corpo = Infinity;
        if (typeof distanciaEntreSegmentos === 'function') {
            const alt = (typeof GkCatchModel.alturaCorpo === 'number')
                ? GkCatchModel.alturaCorpo : 1.85;
            const b = Match.ball.position;
            corpo = distanciaEntreSegmentos(
                this.model.position.x, ALTURA_BASE_Y, this.model.position.z,
                this.model.position.x, ALTURA_BASE_Y + alt, this.model.position.z,
                b.x, b.y, b.z, b.x, b.y, b.z);
        }
        if (mao < Infinity) registos.push({ mao: mao, corpo: corpo, estado: this.gkEstado });
    }
    return orig.call(this);
};

for (let i = 0; i < Math.round(1200 / dt); i++) Match.update(dt);

test('o alcance do contacto vive na configuracao', () => {
    assert.strictEqual(typeof GkCatchModel.alcanceContacto, 'number',
        'GkCatchModel.alcanceContacto desapareceu');
    assert.ok(GkCatchModel.alcanceContacto > 0 && GkCatchModel.alcanceContacto < 1.0,
        `alcanceContacto = ${GkCatchModel.alcanceContacto}: nao e um braco`);
});

test('a bola que passa ao lado ja e mergulho, e nao um passe de magica', () => {
    assert.ok(GoalkeeperPose.mergulhoLateralMin <= 1.2,
        `mergulhoLateralMin = ${GoalkeeperPose.mergulhoLateralMin} m: a faixa entre o ` +
        'alcance do braco e o mergulho continua sem gesto nenhum');
});

test('nenhuma bola e agarrada de longe do corpo e da mao', () => {
    const limiteMao = GkCatchModel.alcanceContacto + 0.35;
    const limiteCorpo = (typeof GkCatchModel.alcanceCorpo === 'number')
        ? GkCatchModel.alcanceCorpo + 0.15 : 0;

    // De longe = longe da mão E longe do corpo. Uma das duas basta para a
    // defesa ser legítima.
    const longe = registos.filter(r => r.mao > limiteMao && r.corpo > limiteCorpo);
    const pior = registos.length ? Math.max(...registos.map(r => Math.min(r.mao, r.corpo))) : 0;
    const media = registos.length
        ? registos.reduce((s, r) => s + Math.min(r.mao, r.corpo), 0) / registos.length : 0;
    const aoCorpo = registos.filter(r => r.corpo <= limiteCorpo && r.mao > limiteMao).length;
    console.log(`  ${registos.length} agarradas | media ${media.toFixed(2)} m do ponto mais ` +
        `proximo (mao ou corpo), pior ${pior.toFixed(2)} m | ao corpo: ${aoCorpo} | de longe: ${longe.length}`);
    assert.ok(registos.length >= 5, `amostra curta: ${registos.length} agarradas`);
    assert.ok(longe.length === 0,
        `${longe.length} de ${registos.length} agarradas com a bola a mais de ` +
        `${limiteMao.toFixed(2)} m da mao E a mais de ${limiteCorpo.toFixed(2)} m do corpo ` +
        `(a pior a ${pior.toFixed(2)} m)`);
});
