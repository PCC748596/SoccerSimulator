/*
COMO E QUE ELE CAI, E EM QUE E QUE FICA APOIADO?

Tres medidas por fase do mergulho, que sao as tres do relato:

  BARRIGA   angulo entre a frente do corpo (+Z local) e o plano do relvado.
            0 = de lado, 90 = de brucos. *"O goleiro tem que cair de peito
            para baixo"*.

  APOIO     qual o osso MAIS BAIXO do corpo. *"O goleiro esta ficando apoiado
            na mao, uns 3 ou 4 segundos"* — se o mais baixo e uma mao durante
            a fase de chao inteira, e nela que ele esta apoiado.

  ENTERRO   quanto o osso mais baixo esta ABAIXO do relvado. *"Os bracos estao
            entrando na grama"*.

Uso: node tools/scratch/gk_queda_e_apoio.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 1800);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260924));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const OSSOS = ['pelvis', 'chest', 'neck', 'lArm', 'rArm', 'lHand', 'rHand',
    'lLeg', 'rLeg', 'lKnee', 'rKnee', 'lFoot', 'rFoot', 'lBota', 'rBota'];
const _f = new THREE.Vector3(), _v = new THREE.Vector3();
const porFase = {};

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const gk of [Match.players[0], Match.opponents[0]]) {
        if (!gk || !gk.dive) continue;
        const d = gk.dive;
        _f.set(0, 0, 1).applyQuaternion(gk.model.quaternion);
        const picada = Math.asin(Math.max(-1, Math.min(1, -_f.y))) * 180 / Math.PI;

        gk.model.updateWorldMatrix(true, true);
        let baixo = null, baixoY = Infinity;
        for (const nome of OSSOS) {
            const o = gk.rig[nome];
            if (!o) continue;
            o.getWorldPosition(_v);
            if (_v.y < baixoY) { baixoY = _v.y; baixo = nome; }
        }

        let chave = d.fase;
        if (d.fase === 'voo') {
            const kf = Math.min(1, d.t / Math.max(0.001, d.tVoo));
            chave = 'voo ' + (kf < 0.35 ? '(inicio)' : kf < 0.7 ? '(meio)' : '(fim)');
        }
        const f = porFase[chave] || (porFase[chave] = { n: 0, soma: 0, max: -999, apoios: {}, enterro: 0 });
        f.n++; f.soma += picada; f.max = Math.max(f.max, picada);
        f.apoios[baixo] = (f.apoios[baixo] || 0) + 1;
        f.enterro = Math.min(f.enterro, baixoY);
    }
}

console.log('fase          frames   barriga (med/max)   enterro   apoio mais frequente');
for (const k of Object.keys(porFase).sort()) {
    const f = porFase[k];
    const top = Object.keys(f.apoios).sort((a, b) => f.apoios[b] - f.apoios[a])
        .slice(0, 2).map(n => `${n} ${Math.round(100 * f.apoios[n] / f.n)}%`).join(', ');
    console.log(`${k.padEnd(13)} ${String(f.n).padStart(6)}   ` +
        `${(f.soma / f.n).toFixed(0).padStart(3)}/${f.max.toFixed(0).padStart(3)} graus   ` +
        `${f.enterro.toFixed(2).padStart(6)} m   ${top}`);
}
