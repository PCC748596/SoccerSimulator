/*
QUANTO ABREM AS PERNAS NA PASSADA, EM METROS.

Relato: *"durante a corrida dos jogadores as pernas estao abrindo demais na
posicao mais afastada entre elas"*. Isto mede o afastamento pe-a-pe ao longo
do ciclo (`getGaitPose` + `aplicarPosePassada`) e diz o MAXIMO por andamento.
*/
require('../headless/harness.js');
const scene = new THREE.Scene();
Match.init(scene);
const p = Match.players.find(j => j.role !== 'gk');
const E = (typeof ESCALA_CORPO === 'number') ? ESCALA_CORPO : 1;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _inv = new THREE.Matrix4();

function aberturaMax(vel) {
    let max = 0, tMax = 0;
    for (let i = 0; i < 200; i++) {
        const t = i / 200;
        p.resetBonesToDefault();
        aplicarPosePassada(p.rig, getGaitPose(t, vel), t);
        p.model.updateMatrixWorld(true);
        _inv.copy(p.model.matrixWorld).invert();
        p.rig.lFoot.getWorldPosition(_a); _a.applyMatrix4(_inv);
        p.rig.rFoot.getWorldPosition(_b); _b.applyMatrix4(_inv);
        const d = Math.abs(_a.z - _b.z) * E;     // afastamento na direcao da marcha
        if (d > max) { max = d; tMax = t; }
    }
    return { max, tMax };
}

console.log('anca (rad):  andar ' + GaitModel.andar.anca + '   trote ' + GaitModel.trote.anca +
    '   correr ' + GaitModel.correr.anca + '\n');
console.log('  vel m/s   andamento     abertura maxima pe-a-pe (m)   em t');
for (const [vel, nome] of [[1.8, 'andar'], [3.0, 'andar->trote'], [4.5, 'trote'],
                           [6.0, 'trote->correr'], [8.0, 'correr'], [9.0, 'correr(tecto)']]) {
    const r = aberturaMax(vel);
    console.log('   ' + String(vel).padStart(4) + '    ' + nome.padEnd(14) +
        r.max.toFixed(3).padStart(8) + '                  ' + r.tMax.toFixed(2));
}

// VARRIMENTO da amplitude da anca a correr, para escolher o valor.
console.log('\nvarrimento de GaitModel.correr.anca (a 8 m/s):');
const orig = GaitModel.correr.anca;
for (const a of [1.20, 1.10, 1.00, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70]) {
    GaitModel.correr.anca = a;
    const r = aberturaMax(8.0);
    console.log('  anca ' + a.toFixed(2) + '  ->  ' + r.max.toFixed(3) + ' m   (delta ' +
        (r.max - 1.541).toFixed(3) + ')');
}
GaitModel.correr.anca = orig;
