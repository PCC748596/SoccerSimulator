/*
OS BRACOS DO ENCAIXE (bola ao peito, antebracos pela frente dela) NO ESPACO DO PEITO.
Varre ombroX / ombroZ / cotovelo e imprime: maos, cotovelos e ponto medio do antebraco, em relacao ao peito
(x lado, y cima, z frente), e a bola (GoalkeeperDive.bolaNoPeito). Raio da bola ~0.11.
Corre com: node tools/scratch/gk_encaixe_bracos.js
*/
require('../headless/harness.js');
const corpo = construirCorpo(0xff8800, 0x222222, escolherAparencia(0));
const model = corpo.corpo, rig = corpo.rig;
model.position.set(0, ALTURA_BASE_Y, 0);
const loc = (o) => { const v = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Quaternion(); o.getWorldPosition(v); rig.chest.getWorldPosition(c); rig.chest.getWorldQuaternion(q); return v.sub(c).applyQuaternion(q.invert()); };
const f = (v) => `(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`;
const BP = GoalkeeperDive.bolaNoPeito;
console.log('bola no peito', JSON.stringify(BP));
const lista = process.argv[2] ? JSON.parse(process.argv[2]) : [[-0.25, -0.20, -1.05], [-0.35, 0.0, -1.40], [-0.35, 0.10, -1.55], [-0.45, 0.10, -1.55], [-0.30, 0.15, -1.70]];
for (const [ox, oz, c] of lista) {
    rig.lArm.rotation.set(ox, 0, oz * -1 * -1); rig.rArm.rotation.set(ox, 0, -oz * -1 * -1);
    // convencao de poseAbracoBola: z = lado * ombroZ, lado 1 = esquerdo, -1 = direito
    rig.lArm.rotation.set(ox, 0, 1 * oz); rig.rArm.rotation.set(ox, 0, -1 * oz);
    rig.lElbow.rotation.x = c; rig.rElbow.rotation.x = c;
    model.updateMatrixWorld(true);
    const m = loc(rig.lHand), e = loc(rig.lElbow);
    const mid = m.clone().add(e).multiplyScalar(0.5);
    console.log(`ombroX ${ox} ombroZ ${oz} cot ${c}: mao E ${f(m)} cotovelo E ${f(e)} meio antebraco ${f(mid)}`);
}
