/*
ONDE ESTAO O TRONCO E AS PERNAS NAS POSES BAIXAS DO GUARDA-REDES.

Relato: *"a posicao do goleiro continua errada. O tronco ta meio deslocado das
pernas."*

Despeja, no referencial do MODELO, a posicao de cada junta. O que se procura e
o tronco longe das ancas / as ancas longe dos pes -- o "deslocado".
*/
require('../headless/harness.js');
const corpo = construirCorpo(0xff8800, 0x222222, escolherAparencia(0));
const model = corpo.corpo, rig = corpo.rig;
const _v = new THREE.Vector3(), _inv = new THREE.Matrix4();

function ler(nome) {
    const o = rig[nome];
    if (!o) return null;
    o.getWorldPosition(_v);
    _v.applyMatrix4(_inv);
    return { x: _v.x, y: _v.y, z: _v.z };
}
function despejar(titulo) {
    model.updateMatrixWorld(true);
    _inv.copy(model.matrixWorld).invert();
    console.log('\n' + titulo);
    console.log('   (referencial do modelo: z = a frente, y = altura acima da origem)');
    for (const n of ['pelvis', 'chest', 'neck', 'lLeg', 'lKnee', 'lFoot', 'rLeg', 'rKnee', 'rFoot']) {
        const p = ler(n);
        if (!p) continue;
        console.log('   ' + n.padEnd(7) + ' x ' + p.x.toFixed(2).padStart(6) +
            '  y ' + p.y.toFixed(2).padStart(6) + '  z ' + p.z.toFixed(2).padStart(6));
    }
    // O "deslocado": distancia horizontal do tronco ao ponto medio dos pes.
    const c = ler('chest'), lf = ler('lFoot'), rf = ler('rFoot');
    if (c && lf && rf) {
        const mx = (lf.x + rf.x) / 2, mz = (lf.z + rf.z) / 2;
        console.log('   tronco vs ponto medio dos pes:  ' +
            Math.hypot(c.x - mx, c.z - mz).toFixed(2) + ' m na horizontal');
    }
    // Altura da anca acima do relvado (a origem do modelo ja esta baixada).
    const pel = ler('pelvis');
    if (pel) {
        console.log('   anca acima do relvado: ' +
            (model.position.y + pel.y).toFixed(2) + ' m');
    }
    let minSola = Infinity;
    for (const b of ['lBota', 'rBota']) if (rig[b])
        minSola = Math.min(minSola, new THREE.Box3().setFromObject(rig[b]).min.y);
    console.log('   sola mais baixa: y ' + minSola.toFixed(3) +
        (Math.abs(minSola) < 0.05 ? '  (encostada)' : '  <<< NAO ENCOSTA'));
}

function limpar() {
    for (const n of ['pelvis', 'chest', 'neck', 'lLeg', 'rLeg', 'lKnee', 'rKnee', 'lFoot', 'rFoot', 'lArm', 'rArm'])
        if (rig[n]) rig[n].rotation.set(0, 0, 0);
}

// ---- ENCAIXE, como esta no config ----
{
    const EP = GoalkeeperPose.encaixe;
    limpar();
    model.position.set(0, ALTURA_BASE_Y + EP.altura, 0);
    rig.pelvis.rotation.x = EP.pelvisX;
    rig.chest.rotation.x = EP.chest;
    if (rig.neck) rig.neck.rotation.x = EP.cabeca;
    rig.rLeg.rotation.x = EP.coxaAberta;  rig.rLeg.rotation.z = -EP.aberturaAberta;
    rig.rKnee.rotation.x = EP.joelhoAberto;
    rig.lLeg.rotation.x = EP.coxaRecolhida; rig.lLeg.rotation.z = EP.aberturaRecolhida;
    rig.lKnee.rotation.x = EP.joelhoRecolhido;
    if (rig.lFoot && EP.peRecolhido !== undefined) rig.lFoot.rotation.x = EP.peRecolhido;
    despejar('ENCAIXE (config actual): altura ' + EP.altura +
        '  coxaAberta ' + EP.coxaAberta + '  coxaRecolhida ' + EP.coxaRecolhida);
}

// ---- ENCAIXE, com os valores ANTERIORES a minha alteracao ----
{
    const EP = GoalkeeperPose.encaixe;
    limpar();
    model.position.set(0, ALTURA_BASE_Y + EP.altura, 0);
    rig.pelvis.rotation.x = EP.pelvisX;
    rig.chest.rotation.x = EP.chest;
    if (rig.neck) rig.neck.rotation.x = EP.cabeca;
    rig.rLeg.rotation.x = -0.10; rig.rLeg.rotation.z = -EP.aberturaAberta;
    rig.rKnee.rotation.x = 1.55;
    rig.lLeg.rotation.x = 0.15;  rig.lLeg.rotation.z = EP.aberturaRecolhida;
    rig.lKnee.rotation.x = 1.95;
    despejar('ENCAIXE (valores ANTERIORES): coxaAberta -0.10  coxaRecolhida 0.15');
}

// ---- BARREIRA ----
{
    const B = GoalkeeperPose.barreira;
    limpar();
    model.position.set(0, ALTURA_BASE_Y + B.altura, 0);
    rig.pelvis.rotation.z = B.inclinacao;
    rig.chest.rotation.x = 0.10;
    rig.rLeg.rotation.z = -B.pernaEsticada; rig.rLeg.rotation.x = 0.05;
    rig.rKnee.rotation.x = B.pernaJoelho;
    rig.lLeg.rotation.x = B.pernaDobrada;
    rig.lKnee.rotation.x = B.pernaDobradaJoelho;
    despejar('BARREIRA (a pose da captura: perna esticada no relvado)');
}
