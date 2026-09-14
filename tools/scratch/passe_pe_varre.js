/* Varre combinacoes de abertura de anca e de pe no instante do contacto. */
require('../headless/harness.js');
const corpo = construirCorpo('#ff0000', '#ffffff');
const rig = corpo.rig || corpo.userData.rig || corpo;
const raiz = corpo.grupo || corpo.corpo || corpo.model || corpo;
const contacto = (PassClip.contactFrame - 1) / (PassClip.frames.length - 1);
const base = amostrarClipPasse(contacto);
const q = new THREE.Quaternion();
console.log('anca   pe     face interna   ponta do pe');
for (const anca of [0.0, 0.4, 0.8, 1.2]) {
    for (const pe of [0.0, 0.5, 1.0, 1.5, 2.0]) {
        const K = Object.assign({}, base, { coxaChuteY: anca, peChuteY: pe });
        aplicarPoseRemate(rig, K);
        raiz.updateMatrixWorld(true);
        rig.rFoot.getWorldQuaternion(q);
        const interna = new THREE.Vector3(-1, 0, 0).applyQuaternion(q);
        const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        const a = (v) => (Math.acos(THREE.MathUtils.clamp(v.dot(new THREE.Vector3(0, 0, 1)), -1, 1)) * 180 / Math.PI).toFixed(0);
        console.log(anca.toFixed(2).padStart(4) + '  ' + pe.toFixed(2).padStart(4) + '  ' +
            a(interna).padStart(10) + '  ' + a(frente).padStart(12));
    }
}
