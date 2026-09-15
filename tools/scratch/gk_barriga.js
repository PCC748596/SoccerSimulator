/*
PARA ONDE APONTA A BARRIGA DURANTE O MERGULHO?

Mede, por fase, o angulo entre a FRENTE do corpo (+Z local) e o plano do
relvado: 0 grau = barriga na horizontal (de lado, a olhar para a frente),
90 graus = barriga virada ao chao.

Uso: node tools/scratch/gk_barriga.js [segundos]
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

const _f = new THREE.Vector3();
const porFase = {};
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const gk of [Match.players[0], Match.opponents[0]]) {
        if (!gk || !gk.dive) continue;
        const d = gk.dive;
        _f.set(0, 0, 1).applyQuaternion(gk.model.quaternion);
        // Quanto a frente do corpo aponta para BAIXO.
        const picada = Math.asin(Math.max(-1, Math.min(1, -_f.y))) * 180 / Math.PI;
        let chave = d.fase;
        if (d.fase === 'voo') {
            const kf = Math.min(1, d.t / Math.max(0.001, d.tVoo));
            chave = 'voo ' + (kf < 0.35 ? '(inicio)' : kf < 0.7 ? '(meio)' : '(fim)');
        }
        const f = porFase[chave] || (porFase[chave] = { n: 0, soma: 0, max: -999 });
        f.n++; f.soma += picada; f.max = Math.max(f.max, picada);
    }
}
console.log('fase              frames   barriga para baixo (graus)   maximo');
for (const k of Object.keys(porFase).sort()) {
    const f = porFase[k];
    console.log(k.padEnd(18) + String(f.n).padStart(6) + '  ' +
        (f.soma / f.n).toFixed(1).padStart(24) + '  ' + f.max.toFixed(1).padStart(7));
}
