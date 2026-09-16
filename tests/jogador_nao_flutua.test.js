/*
OS JOGADORES A FLUTUAR NO CAMPO.

Relato, com captura: "por algum motivo, no meio do jogo, os jogadores ficam
flutuando no campo" — o boneco acima do relvado, com a sombra no chão por baixo.

A medida certa é a SOLA DA BOTA no mundo, e não o `model.position.y`: o corpo
pode estar à altura base e a POSE levantar o boneco. Foi medi-la que mostrou o
caso (`tools/headless/flutuar.js`, caminho do browser, 10 min):

    CM IDLE          sola=0.19  corpo=-0.04  coxa=0.86
    CB MOVE_TO_POS   sola=0.25  corpo=-0.03  coxa=-0.88
    CM MARKING       sola=0.22  corpo=-0.03  coxa=0.81
    ... 64 leituras assim em 10 minutos

O corpo está na base e a perna é que está no ar: quem acaba de parar traz a coxa
a 40-50° da última passada, e ela volta a zero por lerp ao longo de uns quinze
frames. Nesse tempo o boneco está de pé, com a perna levantada e o corpo à
altura base — a flutuar.

O `assentarNoChao` existe precisamente para isto (desce o corpo até a bota
tocar), mas o ramo de quem está PARADO no `animateBones` saía com um `return`
antes de lá chegar. Só o ramo de movimento o chamava.

Corre com: node tests/jogador_nao_flutua.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

require('../tools/headless/harness.js');

const scene = new THREE.Scene();
Match.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const dt = 1 / 60;
const _v = new THREE.Vector3();

// A mesma conta do assentarNoChao: o ponto mais baixo das duas botas, no mundo.
const solaY = (p) => {
    let min = Infinity;
    for (const bota of [p.rig.lBota, p.rig.rBota]) {
        const geo = bota.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const b = geo.boundingBox;
        bota.updateWorldMatrix(true, false);
        for (let i = 0; i < 8; i++) {
            _v.set((i & 1) ? b.max.x : b.min.x, (i & 2) ? b.max.y : b.min.y, (i & 4) ? b.max.z : b.min.z)
                .applyMatrix4(bota.matrixWorld);
            if (_v.y < min) min = _v.y;
        }
    }
    return min;
};

test('parado a meio da passada, o pé fica NO chão — nem no ar nem enterrado', () => {
    const p = Match.players[5];
    p.velocity.set(0, 0, 0);
    p.model.position.set(0, ALTURA_BASE_Y, 0);
    // As duas pernas levantadas, como fica quem pára a meio de uma passada larga.
    p.rig.lLeg.rotation.x = 0.85; p.rig.rLeg.rotation.x = 0.85;
    p.rig.lKnee.rotation.x = 0.5; p.rig.rKnee.rotation.x = 0.5;

    for (let i = 0; i < 10; i++) p.animateBones(dt);

    /*
    Medido: com o assento no ramo de quem está parado, a sola converge para
    -0.015 m (a bota assente). Sem ele, o corpo fica na altura base enquanto as
    pernas descem sozinhas e a sola vai a -0.076 — oito centímetros ENTERRADO,
    e antes disso no ar. As duas metades do mesmo defeito.
    */
    const sola = solaY(p);
    assert.ok(Math.abs(sola) < 0.04,
        `a sola ficou a ${sola.toFixed(3)} m do relvado (positivo = no ar, negativo = enterrado)`);
});

test('o ramo de quem está parado chama o assento', () => {
    const src = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'js/player.js'), 'utf8');
    const i = src.indexOf('rig.rLeg.rotation.z = lerpTo(rig.rLeg.rotation.z, -Math.PI / 32);');
    assert.ok(i > 0, 'não encontrei o fim do ramo de quem está parado');
    const bloco = src.slice(i, i + 1800);
    assert.ok(/this\.assentarNoChao\(\)/.test(bloco),
        'o ramo de quem está parado voltou a sair sem assentar o pé no chão');
});

test('a quem corre não se mexeu: a passada tem fase de voo', () => {
    /*
    Acima de `AssentoNoChao.velMax` o assento continua desligado de propósito —
    uma passada a sério tem os dois pés no ar em parte do ciclo, e corrigir isso
    frame a frame punha o corpo a subir e a descer com ela. Fica escrito aqui
    porque é a tentação óbvia a olhar para os 18% de leituras "no ar": quase
    todas são jogadores a correr, e são a passada.
    */
    const src = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'js/player.js'), 'utf8');
    assert.ok(/velocity\.length\(\) > A\.velMax\) return;/.test(src),
        'o assentarNoChao deixou de sair quando ele corre');
});
