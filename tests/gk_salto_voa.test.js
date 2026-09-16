/*
O GUARDA-REDES TEM DE VOAR — e nao voava um frame que fosse.

Relato: "quando o jogador da o chute em cima e e gol, queria que o goleiro
pulasse na direccao da bola mas nao tocasse na bola. O goleiro esta pulando em
baixo, deslizando para o lado da bola mas por baixo."

A causa esta na condicao de aterragem do `GkDive.update`, fase 'voo':

    if (corpo.position.y <= D.alturaDeitado) { d.fase = 'chao'; ... }

`alturaDeitado` (0.42) e a altura da origem do modelo com ele DEITADO; de pe a
origem esta a ALTURA_BASE_Y = -0.03, ou seja 45 cm ABAIXO do valor que fecha o
voo. Nenhum salto sobe 45 cm no primeiro frame, portanto a condicao dava
verdadeira a primeira passagem e a fase saltava para 'chao' -- que escreve
y = 0.42 e desliza. Medido (tools/headless/gk_salto_alto.js), a cronologia de
um mergulho alto era:

    ler ler impulso x8 voo:-0.03 chao:0.42 chao:0.42 ...

um unico frame de voo, sempre, em todos os mergulhos do jogo.

Agora a aterragem so conta quando ele vem A DESCER, e o tempo de voo sai da
propria parabola em vez de ser adivinhado.

Corre com: node --test tests/gk_salto_voa.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(20260910);

require('../tools/headless/harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

/*
Um mergulho isolado, sem jogo por cima: poe-se o guarda-redes na linha, manda-se
`GkDive.iniciar` com um alvo, e correm-se frames a ler a altura do corpo.
*/
function voar(tipo, alvoY, alvoDx) {
    const gk = Match.players[0];
    const corpo = gk.model;
    corpo.position.set(0, ALTURA_BASE_Y, gk.ownGoalZ);
    gk.dive = null;
    GkDive.iniciar(gk, alvoDx, alvoY, tipo, Math.sign(alvoDx) || 1);

    const rig = gk.rig || gk.bones || {};
    let yMax = corpo.position.y, framesVoo = 0, alturas = [];
    for (let i = 0; i < 240 && gk.dive; i++) {
        const fase = gk.dive.fase;
        GkDive.update(gk, dt, corpo, rig);
        if (fase === 'voo') {
            framesVoo++;
            alturas.push(corpo.position.y);
            if (corpo.position.y > yMax) yMax = corpo.position.y;
        }
        if (gk.dive && gk.dive.fase === 'chao') break;
    }
    return { yMax: yMax, subida: yMax - ALTURA_BASE_Y, tVoo: framesVoo * dt, alturas: alturas };
}

test('o mergulho alto sai mesmo do chao, e nao acaba no primeiro frame', () => {
    const r = voar('alto', 2.20, 3.0);
    console.log(`  alto: voo ${r.tVoo.toFixed(2)}s, subida ${r.subida.toFixed(2)} m, ` +
        `y maximo ${r.yMax.toFixed(2)}`);
    assert.ok(r.tVoo > 0.25,
        `voo de ${r.tVoo.toFixed(3)}s -- ele nao chega a sair do chao`);
    assert.ok(r.subida > 0.55,
        `subiu ${r.subida.toFixed(2)} m num mergulho ao angulo`);
});

test('a altura sobe e depois desce: e uma parabola, nao um degrau', () => {
    const r = voar('alto', 2.20, 3.0);
    assert.ok(r.alturas.length > 8, `poucos frames de voo: ${r.alturas.length}`);
    const iMax = r.alturas.indexOf(Math.max(...r.alturas));
    assert.ok(iMax > 1, 'o ponto mais alto e o primeiro frame -- isso e um degrau');
    assert.ok(iMax < r.alturas.length - 1,
        'nunca chega a descer: o voo esta a ser cortado no apice');
});

test('o mergulho rasteiro continua rasteiro', () => {
    /*
    A altura lida aqui e a da ORIGEM do modelo, e ela sobe 45 cm so por ele
    passar de pe (-0.03) a deitado (`alturaDeitado`, 0.42) -- isso e o tombo, e
    nao o salto. O que se pede e que o rasteiro fique bem abaixo do alto, que
    e onde a diferenca se ve.
    */
    const baixo = voar('baixo', 0.30, 3.0);
    const alto = voar('alto', 2.20, 3.0);
    console.log(`  baixo: voo ${baixo.tVoo.toFixed(2)}s, y maximo ${baixo.yMax.toFixed(2)}  |  ` +
        `alto: y maximo ${alto.yMax.toFixed(2)}`);
    assert.ok(baixo.yMax < GoalkeeperDive.alturaDeitado + 0.25,
        `um mergulho a bola rasteira nao e um salto: y maximo ${baixo.yMax.toFixed(2)}`);
    assert.ok(alto.yMax - baixo.yMax > 0.35,
        `o alto e o rasteiro sobem o mesmo (${alto.yMax.toFixed(2)} contra ${baixo.yMax.toFixed(2)})`);
    assert.ok(baixo.tVoo > 0.08, `voo de ${baixo.tVoo.toFixed(3)}s -- nem o rasteiro voa`);
});

test('o golo nao apaga o mergulho a meio do voo', () => {
    /*
    No frame do golo o `match_physics` arrumava os dois guarda-redes --
    `gkEstado = 'idle'`, `dive = null` -- e isso corta a parabola no ar. E o
    caso do relato, que e precisamente um remate ao angulo que ENTRA: ele deve
    saltar na direccao da bola e nao lhe tocar, e o que se via era o mergulho a
    desaparecer no instante em que a bola passava a linha.

    Ja tinha sido arranjado no commit 5c4a9b9 ("Prevent abrupt diving state
    reset after goals") e o 20dbce1 reverteu-o com o resto do salto.
    */
    const gk = Match.players[0];
    const outro = Match.opponents[0];
    const corpo = gk.model;
    corpo.position.set(0, ALTURA_BASE_Y, gk.ownGoalZ);
    gk.gkEstado = 'mergulho';
    gk.dive = null;
    GkDive.iniciar(gk, 2.5, 2.1, 'alto', 1);
    for (let i = 0; i < 12; i++) GkDive.update(gk, dt, corpo, gk.rig || gk.bones || {});
    assert.strictEqual(gk.dive.fase, 'voo', 'o teste queria apanha-lo no ar');

    // O outro guarda-redes, esse, esta no seu lugar e deve ser arrumado.
    outro.gkEstado = 'idle';
    outro.gkReagiu = true;

    Match.arrumarGuardaRedesNoGolo();

    assert.ok(gk.dive, 'o mergulho foi apagado com ele ainda no ar');
    assert.strictEqual(gk.gkEstado, 'mergulho',
        `o estado passou a '${gk.gkEstado}' com ele ainda no ar`);
    assert.strictEqual(outro.gkReagiu, false,
        'o guarda-redes que nao esta a mergulhar tem de ser arrumado na mesma');
});
