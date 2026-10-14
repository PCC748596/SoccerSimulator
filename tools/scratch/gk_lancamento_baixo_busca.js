// Procura os angulos de braco (ombro x, cotovelo) que levam a mao ao (y, z) pedido em cada frame do lancamento por baixo.
require('../headless/harness.js');
const corpo = construirCorpo(0xff8800, 0x222222, escolherAparencia(0));
const model = corpo.corpo, rig = corpo.rig;
model.position.set(0, ALTURA_BASE_Y, 0);
const clip = GoalkeeperUnderarmThrowClip, n = clip.frames.length, v = new THREE.Vector3();
// frame (1-based): [R y, R z, L y, L z]
const alvo = {
    4: [0.55, -0.35, 0.80, 0.85],
    5: [0.38, -0.15, 0.72, 0.70],
    6: [0.28, 0.10, 0.62, 0.40],
    7: [0.26, 0.35, 0.70, -0.05],
    8: [0.50, 0.75, 0.80, -0.35],
    9: [1.05, 0.70, 0.85, -0.25]
};
const ABRE = 0.55;
for (const fr of Object.keys(alvo).map(Number)) {
    const [ry, rz, ly, lz] = alvo[fr];
    const i = fr - 1;
    const K = amostrarClipLancamentoGR(i / (n - 1), clip);
    let melhor = { R: null, L: null };
    for (const lado of ['R', 'L']) {
        const [ty, tz] = lado === 'R' ? [ry, rz] : [ly, lz];
        let best = { d: 1e9 };
        for (let ox = -2.0; ox <= 1.2; ox += 0.05) for (let c = -0.6; c <= 0.0; c += 0.1) {
            const KK = Object.assign({}, K);
            if (lado === 'R') { KK.bracoRx = ox; KK.bracoRz = -ABRE; KK.cotoveloR = c; } else { KK.bracoLx = ox; KK.bracoLz = ABRE; KK.cotoveloL = c; }
            aplicarPoseLancamentoGR(rig, KK);
            model.position.y = ALTURA_BASE_Y + K.altura; model.updateMatrixWorld(true);
            (lado === 'R' ? rig.rHand : rig.lHand).getWorldPosition(v);
            const d = Math.hypot(v.y - ty, v.z - tz);
            if (d < best.d) best = { d, ox: +ox.toFixed(2), c: +c.toFixed(1), y: +v.y.toFixed(2), z: +v.z.toFixed(2) };
        }
        melhor[lado] = best;
    }
    console.log(`frame ${fr}: R ${JSON.stringify(melhor.R)} | L ${JSON.stringify(melhor.L)}`);
}
