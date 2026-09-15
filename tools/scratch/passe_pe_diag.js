/* Para onde aponta o pe no instante do contacto do passe. */
require('../headless/harness.js');
const corpo = construirCorpo('#ff0000', '#ffffff');
const rig = corpo.rig || corpo.userData.rig || corpo;
const raiz = corpo.grupo || corpo.corpo || corpo.model || corpo.objecto || corpo;
const alvo = rig.rFoot ? rig : (corpo.rig || corpo);
const contacto = (PassClip.contactFrame - 1) / (PassClip.frames.length - 1);
for (const [nome, norm] of [['armacao', (3) / 7], ['contacto', contacto], ['pos-impacto', 5 / 7]]) {
    const K = amostrarClipPasse(norm);
    aplicarPoseRemate(alvo, K);
    (raiz.updateMatrixWorld ? raiz : alvo.pelvis).updateMatrixWorld(true);
    const q = new THREE.Quaternion();
    alvo.rFoot.getWorldQuaternion(q);
    const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const lado = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    // Angulo entre a NORMAL da face interna do pe direito (o seu -X) e o eixo
    // de ataque do corpo (+Z). 0 grau = a face interna aponta para onde a bola vai.
    // A perna que bate vive em x NEGATIVO no rig, portanto a face virada para
    // o eixo do corpo -- a que bate na bola -- e o +X do pe.
    const interna = lado.clone();
    const angInterna = Math.acos(THREE.MathUtils.clamp(interna.dot(new THREE.Vector3(0, 0, 1)), -1, 1)) * 180 / Math.PI;
    const angBico = Math.acos(THREE.MathUtils.clamp(frente.dot(new THREE.Vector3(0, 0, 1)), -1, 1)) * 180 / Math.PI;
    console.log(nome.padEnd(12) + ' face interna a ' + angInterna.toFixed(0).padStart(3) +
        ' graus do alvo | ponta do pe a ' + angBico.toFixed(0).padStart(3) + ' graus');
}
