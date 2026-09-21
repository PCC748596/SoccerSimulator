/*
ONDE CAI O PE DE REMATE, POSE A POSE, SEM JOGO.

Constroi um jogador, aplica `amostrarClipRemate(norm)` e le o pe que bate no
referencial do modelo. Serve para calibrar o instante do contacto contra onde a
bola esta (z ~ ShotClip.plantar.avanco, medido em `remate_pe_chute.js`).
*/
require('../headless/harness.js');
const scene = new THREE.Scene();
Match.init(scene);
const p = Match.players.find(j => j.role !== 'gk');
const E = (typeof ESCALA_CORPO === 'number') ? ESCALA_CORPO : 1;
const chuteR = (ShotClip.pernaChute === 'r');
const _v = new THREE.Vector3(), _inv = new THREE.Matrix4();

const bolaZ = ShotClip.plantar.avanco;   // onde a bola fica no contacto
console.log('bola no contacto: z = ' + bolaZ.toFixed(2) + ' m (ShotClip.plantar.avanco)');
console.log('contactTime = ' + ActionAnimClips.shot.contactTime.toFixed(4) +
    '  (contactFrame ' + ShotClip.contactFrame + ' de ' + ShotClip.frames.length + ')\n');
console.log(' norm   frame     peZ    peY    peZ-bolaZ');
for (let i = 0; i <= 22; i++) {
    const norm = i / 22;
    p.resetBonesToDefault();
    p.aplicarFrameRemate(amostrarClipRemate(norm));
    p.model.updateMatrixWorld(true);
    const pe = chuteR ? p.rig.rFoot : p.rig.lFoot;
    _inv.copy(p.model.matrixWorld).invert();
    pe.getWorldPosition(_v); _v.applyMatrix4(_inv);
    const z = _v.z * E, y = _v.y * E, d = z - bolaZ;
    const marca = (Math.abs(norm - ActionAnimClips.shot.contactTime) < 0.025) ? '  <== contactTime' : '';
    console.log(' ' + norm.toFixed(3) + '  ' + (norm * (ShotClip.frames.length - 1) + 1).toFixed(2) +
        '   ' + z.toFixed(3).padStart(6) + ' ' + y.toFixed(3).padStart(6) +
        '   ' + (d >= 0 ? '+' : '') + d.toFixed(3) + marca);
}
