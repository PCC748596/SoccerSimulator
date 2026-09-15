/* Quanto tempo o guarda-redes fica no chao, por tipo de mergulho. */
const segundos = Number(process.argv[2] || 2400);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260921));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
const porTipo = {};
const emCurso = new Map();
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const gk of [Match.players[0], Match.opponents[0]]) {
        if (!gk || !gk.dive) { emCurso.delete(gk); continue; }
        const d = gk.dive;
        if (d.fase === 'chao') {
            const r = emCurso.get(gk) || { tipo: d.tipo, canto: d.tempoChao > 1, t: 0 };
            r.t += dt;
            emCurso.set(gk, r);
        } else if (emCurso.has(gk)) {
            const r = emCurso.get(gk); emCurso.delete(gk);
            const k = r.tipo + (r.canto ? ' (prazo longo)' : '');
            (porTipo[k] = porTipo[k] || []).push(r.t);
        }
    }
}
for (const k of Object.keys(porTipo)) {
    const a = porTipo[k];
    console.log(k.padEnd(22) + a.length + ' mergulhos | tempo no chao medio ' +
        (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) + ' s');
}
if (!Object.keys(porTipo).length) console.log('nenhum mergulho');
