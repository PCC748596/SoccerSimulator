/*
VARRE coxaChute/joelhoChute do KEYFRAME DO CONTACTO e diz onde cai o pe.
Alvo: pe em z ~ ShotClip.plantar.avanco (a bola) e y baixo (bola no relvado).
*/
require('../headless/harness.js');
const scene = new THREE.Scene();
Match.init(scene);
const p = Match.players.find(j => j.role !== 'gk');
const E = (typeof ESCALA_CORPO === 'number') ? ESCALA_CORPO : 1;
const chuteR = (ShotClip.pernaChute === 'r');
const _v = new THREE.Vector3(), _inv = new THREE.Matrix4();
const idx = Number(process.argv[2] || 7) - 1;     // keyframe 1-based
const base = ShotClip.frames[idx];
const bolaZ = ShotClip.plantar.avanco;

function medir() {
    p.resetBonesToDefault();
    p.aplicarFrameRemate(Object.assign({}, base));
    p.model.updateMatrixWorld(true);
    const pe = chuteR ? p.rig.rFoot : p.rig.lFoot;
    _inv.copy(p.model.matrixWorld).invert();
    pe.getWorldPosition(_v); _v.applyMatrix4(_inv);
    return { z: _v.z * E, y: _v.y * E };
}
console.log('keyframe ' + (idx + 1) + ', bola em z = ' + bolaZ.toFixed(2) + '\n');
console.log(' coxa  joelho     peZ    peY   peZ-bola');
for (const coxa of [-0.10, -0.15, -0.20, -0.25, -0.30, -0.35, -0.40]) {
    for (const joelho of [0.10, 0.20, 0.30, 0.45, 0.60, 0.75]) {
        base.coxaChute = coxa; base.joelhoChute = joelho;
        const m = medir();
        const d = m.z - bolaZ;
        console.log(' ' + coxa.toFixed(2) + '  ' + joelho.toFixed(2) + '   ' +
            m.z.toFixed(3).padStart(6) + ' ' + m.y.toFixed(3).padStart(6) +
            '   ' + (d >= 0 ? '+' : '') + d.toFixed(3) + (Math.abs(d) < 0.05 ? '  <<<' : ''));
    }
}
