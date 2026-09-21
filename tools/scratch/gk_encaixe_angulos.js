/*
OS ANGULOS REAIS DAS PERNAS NO ENCAIXE AJOELHADO.

O pedido veio em graus com o RELVADO como referencia:

  perna de apoio    coxa paralela ao gramado (0 graus), parte de baixo a 45
                    graus, pe apoiado na grama
  perna ajoelhada   coxa a uns 60 graus com o gramado, parte de baixo a uns
                    25 graus, ponta do pe apoiada

O config e em radianos de rotacao de OSSO, que nao e a mesma coisa: a coxa
pendura de uma pelve que ja esta rodada, e o joelho roda sobre a coxa. Esta
ferramenta faz a conversao nos dois sentidos -- mede o que os valores actuais
dao, e procura os valores que dao os angulos pedidos.

Corre com: node tools/scratch/gk_encaixe_angulos.js
*/
require('../headless/harness.js');
const corpo = construirCorpo(0xff8800, 0x222222, escolherAparencia(0));
const model = corpo.corpo, rig = corpo.rig;
const GRAU = 180 / Math.PI;
const EP = GoalkeeperPose.encaixe;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// Angulo de um segmento com o plano do relvado, em graus (0 = deitado).
function anguloComChao(osso, filho) {
    osso.getWorldPosition(_a);
    filho.getWorldPosition(_b);
    _c.subVectors(_b, _a);
    const h = Math.hypot(_c.x, _c.z);
    if (h < 1e-9 && Math.abs(_c.y) < 1e-9) return 0;
    return Math.abs(Math.atan2(_c.y, h)) * GRAU;
}

/*
E PARA QUE LADO APONTA. O angulo com o chao nao chega: uma coxa horizontal
para a FRENTE e uma coxa horizontal para TRAS dao o mesmo numero e sao poses
opostas. +1 = o segmento avanca no +Z do modelo (a frente), -1 = recua.
*/
function sentido(osso, filho) {
    osso.getWorldPosition(_a);
    filho.getWorldPosition(_b);
    _c.subVectors(_b, _a);
    return (_c.z >= 0) ? 1 : -1;
}

/*
Aplica a pose do encaixe com os angulos das pernas que se quiser. `lado` = +1
poe a perna DIREITA como a que abre (a de apoio), que e a da fotografia.
*/
function aplicar(o) {
    model.position.set(0, ALTURA_BASE_Y + (o.altura !== undefined ? o.altura : EP.altura), 0);
    for (const n of ['pelvis', 'chest', 'lLeg', 'rLeg', 'lKnee', 'rKnee', 'lFoot', 'rFoot']) {
        if (rig[n]) rig[n].rotation.set(0, 0, 0);
    }
    rig.pelvis.rotation.x = (o.pelvisX !== undefined) ? o.pelvisX : EP.pelvisX;
    rig.chest.rotation.x = (o.chest !== undefined) ? o.chest : EP.chest;

    rig.rLeg.rotation.x = o.coxaApoio;
    rig.rLeg.rotation.z = -(o.aberturaApoio !== undefined ? o.aberturaApoio : EP.aberturaAberta);
    rig.rKnee.rotation.x = o.joelhoApoio;
    if (rig.rFoot && o.peApoio !== undefined) rig.rFoot.rotation.x = o.peApoio;

    rig.lLeg.rotation.x = o.coxaAjoelhada;
    rig.lLeg.rotation.z = (o.aberturaAjoelhada !== undefined ? o.aberturaAjoelhada : EP.aberturaRecolhida);
    rig.lKnee.rotation.x = o.joelhoAjoelhada;
    if (rig.lFoot && o.peAjoelhada !== undefined) rig.lFoot.rotation.x = o.peAjoelhada;

    model.updateMatrixWorld(true);
}

function ler() {
    const r = {
        coxaApoio: anguloComChao(rig.rLeg, rig.rKnee),
        canelaApoio: anguloComChao(rig.rKnee, rig.rFoot),
        coxaAjoelhada: anguloComChao(rig.lLeg, rig.lKnee),
        canelaAjoelhada: anguloComChao(rig.lKnee, rig.lFoot),
        sCoxaApoio: sentido(rig.rLeg, rig.rKnee),
        sCanelaApoio: sentido(rig.rKnee, rig.rFoot),
        sCoxaAjoelhada: sentido(rig.lLeg, rig.lKnee),
        sCanelaAjoelhada: sentido(rig.lKnee, rig.lFoot)
    };
    // Altura das solas, para saber se o pe esta mesmo apoiado.
    for (const [k, bota] of [['solaApoio', rig.rBota], ['solaAjoelhada', rig.lBota]]) {
        if (!bota) { r[k] = null; continue; }
        r[k] = new THREE.Box3().setFromObject(bota).min.y;
    }
    return r;
}

console.log('CONVENCAO: angulo do segmento com o relvado, 0 = paralelo ao chao.\n');

const actual = {
    coxaApoio: EP.coxaAberta, joelhoApoio: EP.joelhoAberto,
    coxaAjoelhada: EP.coxaRecolhida, joelhoAjoelhada: EP.joelhoRecolhido
};
aplicar(actual);
let m = ler();
console.log('COMO ESTA (coxaAberta ' + EP.coxaAberta + ', joelhoAberto ' + EP.joelhoAberto +
    ', coxaRecolhida ' + EP.coxaRecolhida + ', joelhoRecolhido ' + EP.joelhoRecolhido + '):');
console.log('  perna de apoio    coxa ' + m.coxaApoio.toFixed(0) + ' graus   canela ' +
    m.canelaApoio.toFixed(0) + ' graus   sola y ' + (m.solaApoio || 0).toFixed(2));
console.log('  perna ajoelhada   coxa ' + m.coxaAjoelhada.toFixed(0) + ' graus   canela ' +
    m.canelaAjoelhada.toFixed(0) + ' graus   sola y ' + (m.solaAjoelhada || 0).toFixed(2));
console.log('\nPEDIDO: apoio coxa 0 / canela 45 ; ajoelhada coxa 60 / canela 25\n');

/*
PROCURA. Varre-se a coxa e o joelho de cada perna e fica o par que menos erra
contra os dois angulos pedidos. Bruto de proposito: sao duas variaveis por
perna e o espaco e pequeno.
*/
function procurar(alvoCoxa, alvoCanela, qual, sentidoCoxa, sentidoCanela) {
    let melhor = null;
    for (let coxa = -2.2; coxa <= 2.2; coxa += 0.02) {
        for (let joelho = 0.0; joelho <= 2.8; joelho += 0.02) {
            const o = Object.assign({}, actual);
            if (qual === 'apoio') { o.coxaApoio = coxa; o.joelhoApoio = joelho; }
            else { o.coxaAjoelhada = coxa; o.joelhoAjoelhada = joelho; }
            aplicar(o);
            const r = ler();
            const c = (qual === 'apoio') ? r.coxaApoio : r.coxaAjoelhada;
            const s = (qual === 'apoio') ? r.canelaApoio : r.canelaAjoelhada;
            const sc = (qual === 'apoio') ? r.sCoxaApoio : r.sCoxaAjoelhada;
            const ss = (qual === 'apoio') ? r.sCanelaApoio : r.sCanelaAjoelhada;
            // O sentido e uma exigencia, nao um custo: descarta-se o que nao bate.
            if (sentidoCoxa && sc !== sentidoCoxa) continue;
            if (sentidoCanela && ss !== sentidoCanela) continue;
            const erro = Math.abs(c - alvoCoxa) + Math.abs(s - alvoCanela);
            if (!melhor || erro < melhor.erro) melhor = { coxa, joelho, c, s, erro };
        }
    }
    return melhor;
}

/*
OS SENTIDOS, lidos da fotografia de referencia:
  perna de apoio    coxa horizontal PARA A FRENTE, canela a descer PARA A
                    FRENTE ate ao pe plantado a frente do corpo
  perna ajoelhada   coxa a descer PARA TRAS ate ao joelho no chao, canela
                    deitada PARA TRAS com a ponta do pe apoiada
*/
const apoio = procurar(0, 45, 'apoio', +1, +1);
console.log('PERNA DE APOIO   coxa ' + apoio.coxa.toFixed(2) + '  joelho ' + apoio.joelho.toFixed(2) +
    '   ->  coxa ' + apoio.c.toFixed(0) + ' graus, canela ' + apoio.s.toFixed(0) + ' graus');
const ajo = procurar(60, 25, 'ajoelhada', -1, -1);
console.log('PERNA AJOELHADA  coxa ' + ajo.coxa.toFixed(2) + '  joelho ' + ajo.joelho.toFixed(2) +
    '   ->  coxa ' + ajo.c.toFixed(0) + ' graus, canela ' + ajo.s.toFixed(0) + ' graus');

// E a pose inteira com os dois resultados, para ver as solas.
aplicar({
    coxaApoio: apoio.coxa, joelhoApoio: apoio.joelho,
    coxaAjoelhada: ajo.coxa, joelhoAjoelhada: ajo.joelho
});
m = ler();
console.log('\nPOSE COMPLETA com esses valores:');
console.log('  apoio      coxa ' + m.coxaApoio.toFixed(0) + '  canela ' + m.canelaApoio.toFixed(0) +
    '  sola y ' + (m.solaApoio || 0).toFixed(3));
console.log('  ajoelhada  coxa ' + m.coxaAjoelhada.toFixed(0) + '  canela ' + m.canelaAjoelhada.toFixed(0) +
    '  sola y ' + (m.solaAjoelhada || 0).toFixed(3));
console.log('  (sola y 0 = encostada ao relvado; negativa = enterrada)');

/*
O TORNOZELO DA PERNA AJOELHADA. O pedido diz "ponta do pe apoiado na grama", e
sem rodar o tornozelo a sola atravessa o relvado -- e como o `assentarNoChao`
levanta o corpo ate a sola mais baixa encostar, isso poria o pe de APOIO no ar.
Procura-se a rotacao que poe a sola ajoelhada ao nivel da de apoio.
*/
{
    const alvo = 0.0;   // as duas solas ao nivel do relvado
    let melhor = null;
    for (let pe = -1.4; pe <= 1.4; pe += 0.02) {
        aplicar({
            coxaApoio: apoio.coxa, joelhoApoio: apoio.joelho,
            coxaAjoelhada: ajo.coxa, joelhoAjoelhada: ajo.joelho,
            peAjoelhada: pe
        });
        const r = ler();
        const erro = Math.abs((r.solaAjoelhada || 0) - alvo);
        if (!melhor || erro < melhor.erro) melhor = { pe, erro, sola: r.solaAjoelhada };
    }
    console.log(String.fromCharCode(10) + 'TORNOZELO AJOELHADO  pe ' + melhor.pe.toFixed(2) +
        '   -> sola y ' + (melhor.sola || 0).toFixed(3));

    aplicar({
        coxaApoio: apoio.coxa, joelhoApoio: apoio.joelho,
        coxaAjoelhada: ajo.coxa, joelhoAjoelhada: ajo.joelho,
        peAjoelhada: melhor.pe
    });
    const f = ler();
    console.log(String.fromCharCode(10) + 'POSE FINAL:');
    console.log('  apoio      coxa ' + f.coxaApoio.toFixed(0) + ' graus  canela ' +
        f.canelaApoio.toFixed(0) + ' graus  sola y ' + (f.solaApoio || 0).toFixed(3));
    console.log('  ajoelhada  coxa ' + f.coxaAjoelhada.toFixed(0) + ' graus  canela ' +
        f.canelaAjoelhada.toFixed(0) + ' graus  sola y ' + (f.solaAjoelhada || 0).toFixed(3));
    console.log(String.fromCharCode(10) + '  => config: coxaAberta ' + apoio.coxa.toFixed(2) +
        '  joelhoAberto ' + apoio.joelho.toFixed(2) +
        '  coxaRecolhida ' + ajo.coxa.toFixed(2) +
        '  joelhoRecolhido ' + ajo.joelho.toFixed(2) +
        '  peRecolhido ' + melhor.pe.toFixed(2));
}
