/* Ate onde sobe a perna depois do contacto, por distancia de passe. */
require('../headless/harness.js');
const contacto = (PassClip.contactFrame - 1) / (PassClip.frames.length - 1);
const FT = PassFollowThrough;
console.log('distancia   factor   coxa no pico do seguimento (rad)');
for (const d of [3, 6, 8, 12, 18, 25, 35]) {
    const u = Math.max(0, Math.min(1, (d - FT.distCurta) / (FT.distLonga - FT.distCurta)));
    const k = FT.fraccaoCurta + (1 - FT.fraccaoCurta) * u;
    let pico = 0;
    for (let n = contacto; n <= 1; n += 0.02) {
        const K = amostrarClipPasse(n);
        pico = Math.min(pico, K.coxaChute * k);   // coxa negativa = perna a subir
    }
    console.log(String(d).padStart(6) + ' m   ' + k.toFixed(2) + '     ' + pico.toFixed(2));
}
