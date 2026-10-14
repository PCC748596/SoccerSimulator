/*
O ANGULO DA BANDEIRA NO CANTO. Pedido: o bandeirinha aponta a bandeira para o corner a 45 graus para baixo.
Mede, com o assistente do lado do canto a apontar (fase 'horizontal'): a elevacao da haste (graus abaixo da
horizontal) e o desvio do azimute em relacao ao canto. A haste e o eixo -y da mao direita.
Corre com: node tools/scratch/bandeira_canto_angulo.js
*/
require('../headless/harness.js');
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = false;
if (process.env.ANTIGO) RefereeModel.bandeira.apontarGrausAbaixo = undefined;
const cena = new THREE.Scene(); Match.init(cena); Officials.arbitro = null; Officials.init(cena);
for (const [cx, cz] of [[34, 52.5], [-34, 52.5], [34, -52.5], [-34, -52.5]]) {
    Match.state = 'CORNER_KICK';
    const o = Officials.assistentes[cx > 0 ? 0 : 1];
    Officials.apontarBandeira('CORNER_KICK', { x: cx, z: cz });
    let res = null;
    for (let i = 0; i < 60 * 3; i++) {
        Match.delta = 1 / 60; Officials.update(1 / 60);
        if (o.bandeira && o.bandeira.fase === 'horizontal' && o.bandeira.t > 0.8) {
            o.model.updateMatrixWorld(true);
            const q = new THREE.Quaternion(); o.rig.rHand.getWorldQuaternion(q);
            const d = new THREE.Vector3(0, -1, 0).applyQuaternion(q);
            const elev = Math.asin(THREE.MathUtils.clamp(-d.y, -1, 1)) * 180 / Math.PI;
            const azH = Math.atan2(d.x, d.z);
            const p = o.model.position, azC = Math.atan2(cx - p.x, cz - p.z);
            const dif = Math.atan2(Math.sin(azH - azC), Math.cos(azH - azC)) * 180 / Math.PI;
            res = { elev: elev.toFixed(1), difAzimute: dif.toFixed(1), ombro: [o.rig.rArm.rotation.x.toFixed(2), o.rig.rArm.rotation.z.toFixed(2)], cot: o.rig.rElbow.rotation.x.toFixed(2), yaw: o.model.rotation.y.toFixed(2) };
            break;
        }
    }
    console.log(`canto (${cx}, ${cz}): ${JSON.stringify(res)}`);
    o.bandeira = null; Match.state = 'PLAY';
}
