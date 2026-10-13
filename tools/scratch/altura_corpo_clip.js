/*
Mede a que altura o corpo flutua em cada andamento, com e sem o clip.

Monta o mesmo rig que o jogo usa (`construirCorpo` do pose.js), percorre o
ciclo, e lê o ponto mais baixo de TODAS as caixas do boneco — o mesmo critério
do `assentarCorpoInteiro`. Zero = botas no relvado.
*/
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const raiz = process.argv[2];
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').split('\r\n').join('\n');
const contexto2d = new Proxy({}, { get: () => () => { }, set: () => true });
const amb = {
    THREE, console,
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => contexto2d }) },
    window: {}
};
const mod = new Function(...Object.keys(amb),
    `${ler('js/config/physics.js')}
     ${ler('js/config/gait.js')}
     ${ler('js/config/gait_clips.js')}
     ${ler('js/utils.js')}
     ${ler('js/config/animations.js')}
     ${ler('js/config/player_behavior.js')}
     ${ler('js/pose.js')}
     return { construirCorpo, escolherAparencia, getGaitPose, GaitClips, ALTURA_BASE_Y };`
)(...Object.values(amb));

const { construirCorpo, escolherAparencia, getGaitPose, GaitClips, ALTURA_BASE_Y } = mod;
const feito = construirCorpo(0x1133aa, 0xffffff, escolherAparencia(0, 11, 0));
const model = feito.corpo;
const rig = feito.rig;

const v = new THREE.Vector3();
function pontoMaisBaixo() {
    model.updateMatrixWorld(true);
    let min = Infinity;
    model.traverse(o => {
        if (!o.isMesh || !o.visible || !o.geometry || !o.geometry.attributes.position) return;
        const g = o.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox;
        for (let c = 0; c < 8; c++) {
            v.set((c & 1) ? b.max.x : b.min.x, (c & 2) ? b.max.y : b.min.y, (c & 4) ? b.max.z : b.min.z);
            o.localToWorld(v);
            if (v.y < min) min = v.y;
        }
    });
    return min;
}

function medir(vel, comClip) {
    GaitClips.activo = comClip;
    let pior = Infinity, melhor = -Infinity;
    const leituras = [];
    for (let i = 0; i < 90; i++) {
        const P = getGaitPose(i / 90, vel);
        rig.lLeg.rotation.x = P.lHip; rig.lKnee.rotation.x = P.lKnee;
        rig.rLeg.rotation.x = P.rHip; rig.rKnee.rotation.x = P.rKnee;
        rig.lArm.rotation.x = P.lArm; rig.rArm.rotation.x = P.rArm;
        rig.lElbow.rotation.x = P.cotovelo; rig.rElbow.rotation.x = P.cotovelo;
        rig.chest.rotation.x = P.tronco;
        model.position.y = ALTURA_BASE_Y + P.ressalto - (P.descida || 0);
        const y = pontoMaisBaixo();
        if (y < pior) pior = y;
        if (y > melhor) melhor = y;
        leituras.push(y);
    }
    leituras.sort((a, b) => a - b);
    const mediana = leituras[Math.floor(leituras.length / 2)];
    // De pe as botas assentam em -0.050: acima disso o boneco esta a flutuar.
    const CHAO = -0.050;
    const acima = leituras.filter(y => y > CHAO + 0.005).length / leituras.length;
    return { pior, melhor, mediana, acima };
}

// Validacao do banco: o boneco tem de ter altura de gente.
{
    GaitClips.activo = false;
    const P = getGaitPose(0, 0);
    rig.lLeg.rotation.x = P.lHip; rig.rLeg.rotation.x = P.rHip;
    rig.lKnee.rotation.x = P.lKnee; rig.rKnee.rotation.x = P.rKnee;
    model.position.y = ALTURA_BASE_Y;
    model.updateMatrixWorld(true);
    let lo = Infinity, hi = -Infinity;
    model.traverse(o => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        for (let c = 0; c < 8; c++) {
            v.set((c & 1) ? b.max.x : b.min.x, (c & 2) ? b.max.y : b.min.y, (c & 4) ? b.max.z : b.min.z);
            o.localToWorld(v);
            if (v.y < lo) lo = v.y;
            if (v.y > hi) hi = v.y;
        }
    });
    console.log('validacao: de pe, o boneco vai de ' + lo.toFixed(3) + ' a ' + hi.toFixed(3) +
                ' (altura ' + (hi - lo).toFixed(3) + ' m)');
    console.log('           ALTURA_BASE_Y = ' + ALTURA_BASE_Y + ', relvado em y = 0');
    console.log('');
}

console.log('       SEM CLIP                        COM CLIP');
console.log('vel    mediana  max    %acima  |  mediana  max    %acima  | flutuacao mediana');
for (const vel of [0, 1.0, 1.8, 2.5, 3.0, 4.0, 4.5, 5.5, 6.0, 7.0, 8.0, 9.0]) {
    const s = medir(vel, false), c = medir(vel, true);
    const f = c.mediana - (-0.050);
    console.log(
        String(vel).padEnd(7) +
        s.mediana.toFixed(3).padEnd(9) + s.melhor.toFixed(3).padEnd(7) +
        (100 * s.acima).toFixed(0).padStart(3) + '%    |  ' +
        c.mediana.toFixed(3).padEnd(9) + c.melhor.toFixed(3).padEnd(7) +
        (100 * c.acima).toFixed(0).padStart(3) + '%    | ' +
        (f >= 0 ? '+' : '') + (100 * f).toFixed(1) + ' cm');
}
