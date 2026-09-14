/* Qual o sinal de rotation.x do ombro que leva a mao A FRENTE? */
require('../headless/harness.js');
const c = construirCorpo('#ff0000', '#ffffff');
const rig = c.rig, corpo = c.corpo;
const _m = new THREE.Vector3(), _inv = new THREE.Matrix4();
for (const x of [-1.2, -0.9, -0.5, 0, 0.5, 0.9, 1.2]) {
    rig.rArm.rotation.set(x, 0, 0);
    rig.rElbow.rotation.x = 0;
    corpo.updateMatrixWorld(true);
    rig.chest.updateWorldMatrix(true, false);
    _inv.copy(rig.chest.matrixWorld).invert();
    rig.rHand.getWorldPosition(_m); _m.applyMatrix4(_inv);
    console.log('ombro.x = ' + x.toFixed(2).padStart(5) + '  ->  mao z no peito = ' + _m.z.toFixed(2).padStart(6) +
        '  y = ' + _m.y.toFixed(2).padStart(6));
}
