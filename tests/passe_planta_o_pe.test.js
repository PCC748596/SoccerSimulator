/*
O PASSE TEM GESTO, E O PÉ DE APOIO PLANTA ANTES DA BATIDA.

Pedido, com uma referência: *"gostaria que essa fosse a animação do passe
directo e no vazio — o jogador coloca o pé de apoio ao lado da bola e depois dá
o passe"*.

O passe era o ÚNICO gesto do jogo sem animação nenhuma. O `case 'PASS'` da FSM
lia o tempo normalizado do ActionState e **descartava-o**: as pernas ficavam na
pose que a passada tinha deixado, e não havia pé de apoio nenhum para se ver. A
máquina toda já existia e estava provada pelo remate — `ActionState` para os
tempos, um amostrador para interpolar, `aplicarPoseRemate` para escrever no
esqueleto —, por isso o `PassClip` são oito linhas de dados e mais nada.

O que este teste guarda:

  - que o clip existe, tem o contacto no keyframe que desenha o pé na bola, e
    que esse keyframe cai no `contactTime` do `ActionAnimClips.pass`;
  - que no frame do PLANTAR o pé de apoio está À FRENTE do corpo e o de passe
    ATRÁS — que é o gesto do pedido, e o que distingue isto de uma estocada;
  - que a armação é MENOR que a do remate: um passe não é um remate fraco;
  - e que a perna do PassClip é a mesma do ShotClip, porque o `aplicarPoseRemate`
    lê o `ShotClip.pernaChute` para os desenhar aos dois. Se divergirem, o passe
    passa a ser desenhado com a perna trocada, em silêncio.

Corre com: node tests/passe_planta_o_pe.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

require('../tools/headless/harness.js');

test('o clip do passe existe e tem o contacto no keyframe do pe na bola', () => {
    assert.ok(typeof PassClip === 'object' && Array.isArray(PassClip.frames),
        'o PassClip existe');
    assert.strictEqual(PassClip.frames.length, 8, 'oito keyframes');

    /*
    O `contactTime` do ActionAnimClips e o `contactFrame` do clip têm de apontar
    ao MESMO instante: um manda a bola sair, o outro desenha o pé na bola. Se
    divergirem, a bola sai num frame em que a perna ainda vem a caminho.
    */
    const n = PassClip.frames.length;
    const tDoFrame = (PassClip.contactFrame - 1) / (n - 1);
    assert.ok(Math.abs(ActionAnimClips.pass.contactTime - tDoFrame) < 1e-6,
        `o contactTime (${ActionAnimClips.pass.contactTime}) tem de cair no ` +
        `keyframe ${PassClip.contactFrame} (t = ${tDoFrame.toFixed(4)})`);
});

test('o pe de apoio planta ao lado da bola ANTES do contacto', () => {
    /*
    Convenção do clip: `coxaChute > 0` é perna para TRÁS, `coxaApoio < 0` é a
    perna de apoio à FRENTE. No frame do plantar (o 2) o corpo tem de estar
    nessa forma — apoio à frente, perna de passe já a recuar.
    */
    const plantar = PassClip.frames[1];
    assert.ok(plantar.coxaApoio < 0,
        `no frame do plantar a perna de apoio tem de estar a FRENTE ` +
        `(coxaApoio = ${plantar.coxaApoio}, esperado < 0)`);
    assert.ok(plantar.coxaChute > 0,
        `e a de passe ja a recuar (coxaChute = ${plantar.coxaChute}, esperado > 0)`);
    assert.ok(plantar.leanZ < 0,
        `com o tronco inclinado sobre o pe de apoio (leanZ = ${plantar.leanZ})`);

    // E o plantar acontece ANTES do contacto, senão não se lê como plantar.
    assert.ok(1 < PassClip.contactFrame - 1,
        'o frame do plantar vem antes do frame do contacto');

    // No CONTACTO a perna já passou para a frente e o joelho estendeu.
    const contacto = PassClip.frames[PassClip.contactFrame - 1];
    assert.ok(contacto.coxaChute < 0,
        `no contacto a perna de passe esta a FRENTE (coxaChute = ${contacto.coxaChute})`);
    assert.ok(contacto.joelhoChute < plantar.joelhoChute,
        'e o joelho estendeu desde a armacao');
});

test('a armacao do passe e menor que a do remate', () => {
    /*
    Um passe não é um remate fraco: é outro gesto. Se a armação crescer até à
    do remate, o que se vê é um jogador a fuzilar um passe de cinco metros.
    */
    const maxPasse = Math.max(...PassClip.frames.map(f => f.coxaChute));
    const maxRemate = Math.max(...ShotClip.frames.map(f => f.coxaChute));
    assert.ok(maxPasse < maxRemate * 0.7,
        `armacao do passe ${maxPasse.toFixed(2)} contra ${maxRemate.toFixed(2)} ` +
        `do remate: tem de ficar bem abaixo`);

    const leanPasse = Math.min(...PassClip.frames.map(f => f.leanZ));
    const leanRemate = Math.min(...ShotClip.frames.map(f => f.leanZ));
    assert.ok(leanPasse > leanRemate,
        'e a inclinacao lateral tambem e menor que a do remate');
});

test('a perna do passe e a mesma do remate, porque o desenhador e o mesmo', () => {
    /*
    `aplicarPoseRemate` lê o `ShotClip.pernaChute` — não o do clip que está a
    desenhar. É o preço de reaproveitar o desenhador, e este teste é o que
    impede que se pague sem dar por isso.
    */
    assert.strictEqual(PassClip.pernaChute, ShotClip.pernaChute,
        'o aplicarPoseRemate le o ShotClip.pernaChute para desenhar os dois');
});

test('o amostrador interpola entre keyframes e cobre o clip todo', () => {
    const a = amostrarClipPasse(0);
    const b = amostrarClipPasse(1);
    assert.ok(Math.abs(a.coxaChute - PassClip.frames[0].coxaChute) < 1e-9,
        't = 0 da o primeiro keyframe');
    assert.ok(Math.abs(b.coxaChute - PassClip.frames[7].coxaChute) < 1e-9,
        't = 1 da o ultimo keyframe');

    // No instante do contacto tem de sair o keyframe do contacto, sem mistura.
    const c = amostrarClipPasse(ActionAnimClips.pass.contactTime);
    const kc = PassClip.frames[PassClip.contactFrame - 1];
    assert.ok(Math.abs(c.coxaChute - kc.coxaChute) < 1e-6,
        `no contactTime sai o keyframe do contacto (deu ${c.coxaChute.toFixed(3)}, ` +
        `esperado ${kc.coxaChute})`);
});

test('o cruzamento fica de fora, e o tipo fixa-se no arranque', () => {
    /*
    O cruzamento é outro gesto (inclinar para trás, levantar a bola) e não leva
    este clip. A flag tem de ser fixada no `initiatePass` e não lida por frame:
    o `p.isCross` é limpo no instante do contacto, a meio do gesto, e lido por
    frame um cruzamento arrancava sem animação e ganhava-a a meio.
    */
    const fs = require('fs');
    const path = require('path');
    const raiz = path.join(__dirname, '..');
    const player = fs.readFileSync(path.join(raiz, 'js/player.js'), 'utf8');
    const fsmSrc = fs.readFileSync(path.join(raiz, 'js/fsm.js'), 'utf8');

    assert.ok(/initiatePass\(targetPlayer\)\s*\{[\s\S]{0,900}passeComClip\s*=\s*!this\.isCross/
        .test(player), 'o initiatePass fixa o passeComClip no arranque');
    assert.ok(fsmSrc.includes('p.passeComClip && typeof amostrarClipPasse'),
        'o case PASS desenha o clip so quando o passe o leva');
    assert.ok(!/case 'PASS':[\s\S]{0,1500}!p\.isCross/.test(fsmSrc),
        'o case PASS nao pode ler o p.isCross por frame: ele e limpo no contacto');
});
