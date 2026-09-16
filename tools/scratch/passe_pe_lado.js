/*
PARA QUE LADO APONTA A PONTA DO PE NO PASSE?

A perna que bate e a direita, e no rig ela vive em x NEGATIVO (criarPerna(-0.4)).
"Para fora" e portanto a ponta a apontar para x negativo; "para dentro" (o
relato) e a ponta virada para a perna de apoio, em x positivo.
*/
require('../headless/harness.js');
const c = construirCorpo('#ff0000', '#ffffff');
const rig = c.rig, corpo = c.corpo;
const contacto = (PassClip.contactFrame - 1) / (PassClip.frames.length - 1);
const q = new THREE.Quaternion();
const perna = (ShotClip.pernaChute === 'r') ? 'rFoot' : 'lFoot';
const ladoDaPerna = (ShotClip.pernaChute === 'r') ? -1 : 1;   // x local da perna que bate
for (const [nome, norm] of [['armacao', 3 / 7], ['contacto', contacto], ['pos-impacto', 5 / 7]]) {
    aplicarPoseRemate(rig, amostrarClipPasse(norm));
    corpo.updateMatrixWorld(true);
    rig[perna].getWorldQuaternion(q);
    const ponta = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const paraFora = ponta.x * ladoDaPerna;   // >0 = aponta para fora do corpo
    console.log(nome.padEnd(12) + ' ponta do pe: x=' + ponta.x.toFixed(2) + ' z=' + ponta.z.toFixed(2) +
        '  -> ' + (paraFora > 0.05 ? 'PARA FORA' : paraFora < -0.05 ? 'PARA DENTRO' : 'em frente'));
}
