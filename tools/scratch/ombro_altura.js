/* Onde esta o ombro em relacao ao topo do torax. */
require('../headless/harness.js');
const c = construirCorpo('#2b6cb0', '#ffffff');
const rig = c.rig, corpo = c.corpo;
corpo.updateMatrixWorld(true);
const _v = new THREE.Vector3(), _p = new THREE.Vector3();
rig.chest.getWorldPosition(_p);
// O topo da caixa de fora do peito: meia altura 0.75 em unidades do modelo.
const escala = (typeof ESCALA_CORPO === 'number') ? ESCALA_CORPO : 1;
const topoTorax = _p.y + 0.75 * escala;
for (const nome of ['lArm', 'rArm']) {
    rig[nome].getWorldPosition(_v);
    console.log(nome + ': ombro a y=' + _v.y.toFixed(3) +
        ' | topo do torax y=' + topoTorax.toFixed(3) +
        ' | ombro ABAIXO do topo em ' + ((topoTorax - _v.y) / escala).toFixed(3) + ' unidades (' +
        (topoTorax - _v.y).toFixed(3) + ' m)');
}
