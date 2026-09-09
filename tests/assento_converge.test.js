/*
O ASSENTO TEM DE FECHAR NUM FRAME, E O GUARDA-REDES TAMBÉM SE ASSENTA.

Três relatos, do mesmo sítio:

  1. "Um pouco antes do início do jogo, o goleiro que estava na posição correcta
     fica um pouco acima do solo."
  2. "Depois de alguns segundos de jogo, outros jogadores já não encostam no
     chão na animação de andar."
  3. "Uns jogadores estão no chão, mas quando giram para um lado ou para o
     outro, levantam do chão."

Os 2 e 3 são a mesma conta. As duas linhas que correm IMEDIATAMENTE antes do
`assentarNoChao`, no `animateBones`, escrevem a altura em ABSOLUTO todos os
frames:

    ramo de movimento   this.model.position.y = ALTURA_BASE_Y + P.ressalto - P.descida;
    ramo parado         this.model.position.y = lerpTo(this.model.position.y, ALTURA_BASE_Y);

e o `assentarNoChao` a seguir SOMA `correccao * suavizacao`. No frame seguinte a
escrita absoluta apaga o que ele somou. **A correcção nunca acumula**, e a sola
fica permanentemente a `1 - suavizacao` do levantamento da pose — por muitos
frames que passem. Medido, envolvendo o método real em 111 193 frames
(`tools/headless/assento_convergencia.js`):

    antes 0.063   depois 0.041   razao 0.65 = 1 - 0.35

Com a correcção inteira (`tools/headless/assento_tres_relatos.js`):

                          antes    depois
    a andar, minuto 13    0.042    0.004
    a girar 20-90 g/s     0.039    0.000
    a girar > 180 g/s     0.036   -0.000

O 1 é outra coisa, e a contagem de guardas enganou-me primeiro: replicar as
CONDIÇÕES do `assentarNoChao` dava "corre em 87% dos frames do guarda-redes",
mas envolver o MÉTODO deu 176 chamadas contra 111 193 dos jogadores de campo.
Ele não é chamado: o guarda-redes tem pose própria (`updateGK`), que escreve o
`gkCorpo.position.y` (que é o `this.model`) e nunca desce o corpo até à bota.

Corre com: node tests/assento_converge.test.js
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

require('../tools/headless/harness.js');

const scene = new THREE.Scene();
Match.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
/*
CAMINHO DO BROWSER. No lote, quem não passa pelo `animateBones` leva
`y = ALTURA_BASE_Y` à mão — uma rede de segurança que o browser não tem, e que
tapa exactamente o que estes relatos descrevem.
*/
Sim.running = false;

const dt = 1 / 60;
const _v = new THREE.Vector3();

// A mesma conta do assentarNoChao: o ponto mais baixo das duas botas, no mundo.
const solaY = (p) => {
    const rig = p.rig;
    if (!rig || !rig.lBota || !rig.rBota) return null;
    let min = Infinity;
    for (const bota of [rig.lBota, rig.rBota]) {
        const geo = bota.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const b = geo.boundingBox;
        bota.updateWorldMatrix(true, false);
        for (let ix = 0; ix < 2; ix++) for (let iy = 0; iy < 2; iy++) for (let iz = 0; iz < 2; iz++) {
            _v.set(ix ? b.max.x : b.min.x, iy ? b.max.y : b.min.y, iz ? b.max.z : b.min.z);
            _v.applyMatrix4(bota.matrixWorld);
            if (_v.y < min) min = _v.y;
        }
    }
    return isFinite(min) ? min : null;
};

test('a correccao do assento fecha o levantamento no proprio frame', () => {
    /*
    A escrita da altura acontece todos os frames e em absoluto, portanto o que
    o assento nao corrigir NESTE frame perde-se. Exige-se que uma passagem
    deixe a sola no chao, e nao uma fraccao do caminho.
    */
    const p = Match.players.find(j => j.role !== 'gk');
    assert.ok(p, 'ha jogador de campo');

    p.velocity.set(0, 0, 0);
    p.jumpTimer = 0;
    p.peitoHopTimer = 0;
    p.model.position.y = ALTURA_BASE_Y;
    /*
    AS DUAS COXAS LEVANTADAS. Com uma só, a outra bota fica no chão e o mínimo
    das duas — que é o que o assento mede — não sobe: media-se um cenário que
    não tem nada para corrigir. É o mesmo cenário do teste da sessão anterior.
    */
    p.rig.lLeg.rotation.x = -0.8;
    p.rig.lKnee.rotation.x = 0.6;
    p.rig.rLeg.rotation.x = -0.8;
    p.rig.rKnee.rotation.x = 0.6;

    const antes = solaY(p);
    assert.ok(antes > 0.05,
        `a pose tem de levantar a sola para haver o que corrigir (deu ${antes.toFixed(3)})`);

    p.assentarNoChao();
    const depois = solaY(p);

    /*
    A propriedade não é "fica a zero" — é "tira TUDO o que o tecto deixar".
    Um TECTO (`correccaoMax`) converge: leva o que couber e o resto no frame
    seguinte. Uma FRACÇÃO não converge nunca, porque deixa sempre a mesma
    proporção por corrigir e a escrita absoluta do frame seguinte apaga o
    progresso. É a diferença entre os dois que este teste guarda.
    */
    const esperado = Math.max(0, antes - AssentoNoChao.correccaoMax);
    assert.ok(Math.abs(depois - esperado) < 0.005,
        `uma passagem tem de tirar tudo o que o tecto deixar: antes ` +
        `${antes.toFixed(3)} m, tecto ${AssentoNoChao.correccaoMax} m, ` +
        `esperado ${esperado.toFixed(3)} m, deu ${depois.toFixed(3)} m. ` +
        `Sobrou ${(100 * depois / antes).toFixed(0)}% do levantamento — se isso ` +
        `bater com (1 - AssentoNoChao.suavizacao), a correccao esta a ser ` +
        `diluida por uma fraccao e nunca acumula, porque a altura e reescrita ` +
        `em absoluto no frame seguinte.`);
});

test('o guarda-redes tambem se assenta: o updateGK chama o assentarNoChao', () => {
    /*
    Ler o ficheiro em vez de contar chamadas em jogo: o `updateGK` tem estados
    a mais para os cobrir todos numa corrida curta, e o que se quer garantir e
    estrutural — que o ramo do guarda-redes nao volte a sair sem assentar.
    */
    const src = ler('js/player.js');
    const i = src.indexOf(LF + '    updateGK(dt) {');
    assert.ok(i > 0, 'o updateGK existe no player.js');
    // O metodo seguinte marca o fim do corpo do updateGK.
    const j = src.indexOf(LF + '    resolverDefesaComMaos(', i);
    assert.ok(j > i, 'encontra-se o fim do updateGK');

    const corpo = src.slice(i, j);
    assert.ok(corpo.includes('assentarNoChao()'),
        'o updateGK escreve o gkCorpo.position.y (que e o this.model) e nunca ' +
        'desce o corpo ate a bota: envolvido o metodo real em 19 min de jogo, ' +
        'deu 176 chamadas de guarda-redes contra 111 193 de jogadores de campo, ' +
        'e a sola dele fica a 5.8 cm do relvado em jogo e a 10.1 cm no livre.');
});

test('o guarda-redes so escapa ao assento quando esta mesmo no ar', () => {
    /*
    Relatos: "depois do chute para fora o goleiro tb fica suspenso" (o tiro de
    meta) e "depois que o goleiro pega a bola com a mao tb fica suspenso".

    A guarda era `gkEstado !== 'idle'` — tudo o que nao fosse parado escapava
    ao assento. Medida a sola por estado, em 25 min:

        tiro_meta          0.136      tiro_meta_espera   0.102
        mergulho           0.133      segurando         0.056
        chutando           0.048      maos              0.021
        idle               0.018

    So o `mergulho` e o `salto_alto` saem do chao de proposito: sao os dois
    unicos sitios do updateGK que escrevem uma altura ACIMA da base
    (`+ Pm.altura` do mergulho e `+ jumpH` do salto). Todas as poses de pe do
    GoalkeeperPose tem `altura` de 0.0, -0.05 ou -0.35 — agacham, nunca
    levantam. Logo nenhuma delas tem motivo para escapar.
    */
    const gk = Match.players.find(j => j.role === 'gk');
    assert.ok(gk, 'ha guarda-redes');

    const preparar = (estado) => {
        gk.gkEstado = estado;
        gk.jumpTimer = 0;
        gk.peitoHopTimer = 0;
        gk.velocity.set(0, 0, 0);
        gk.model.position.y = ALTURA_BASE_Y;
        gk.rig.lLeg.rotation.x = -0.8;
        gk.rig.lKnee.rotation.x = 0.6;
        gk.rig.rLeg.rotation.x = -0.8;
        gk.rig.rKnee.rotation.x = 0.6;
    };

    // Os que estao de pe: tem de assentar.
    for (const estado of ['idle', 'tiro_meta_espera', 'tiro_meta', 'chutando',
        'segurando', 'maos', 'lancando', 'apanhar']) {
        preparar(estado);
        const y = gk.model.position.y;
        gk.assentarNoChao();
        assert.notStrictEqual(gk.model.position.y, y,
            `com gkEstado '${estado}' ele esta de pe e tem de assentar`);
    }

    // Os dois que estao no ar de proposito: nao se lhes toca.
    for (const estado of ['mergulho', 'salto_alto']) {
        preparar(estado);
        const y = gk.model.position.y;
        gk.assentarNoChao();
        assert.strictEqual(gk.model.position.y, y,
            `com gkEstado '${estado}' ele escreve a propria altura`);
    }
    gk.gkEstado = 'idle';
});

test('o assento continua a NAO correr a correr, em saltos e em carrinhos', () => {
    /*
    As tres excepcoes que a correccao inteira nao pode estragar: a passada tem
    fase de voo de proposito, e o salto e o carrinho escrevem a altura eles
    proprios. Ver AssentoNoChao.velMax e as guardas do metodo.
    */
    const p = Match.players.find(j => j.role !== 'gk');
    const preparar = () => {
        p.model.position.y = ALTURA_BASE_Y;
        p.rig.lLeg.rotation.x = -0.8;
        p.rig.lKnee.rotation.x = 0.6;
        p.rig.rLeg.rotation.x = -0.8;
        p.rig.rKnee.rotation.x = 0.6;
        p.velocity.set(0, 0, 0);
        p.jumpTimer = 0;
        p.peitoHopTimer = 0;
    };

    preparar();
    p.velocity.set(0, 0, AssentoNoChao.velMax + 1);
    let y = p.model.position.y;
    p.assentarNoChao();
    assert.strictEqual(p.model.position.y, y, 'a correr nao assenta');

    preparar();
    p.jumpTimer = 0.5;
    y = p.model.position.y;
    p.assentarNoChao();
    assert.strictEqual(p.model.position.y, y, 'a saltar nao assenta');

    preparar();
    p.fsm.currentState = 'SLIDE_TACKLE';
    y = p.model.position.y;
    p.assentarNoChao();
    assert.strictEqual(p.model.position.y, y, 'no carrinho nao assenta');
    p.fsm.currentState = 'IDLE';
});
