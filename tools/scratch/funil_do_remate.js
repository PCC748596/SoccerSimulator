/* O funil: de cada remate ate ao golo, onde e que a bola acaba. */
const segundos = Number(process.argv[2] || 3600);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260919));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);
for (const eq of ['TeamA', 'TeamB']) {
    const r = MatchStats[eq].remates;
    console.log(eq + ': tentados ' + r.tentados + ' | no alvo ' + r.noAlvo +
        ' | bloqueados ' + (r.bloqueados !== undefined ? r.bloqueados : '-') +
        ' | furados ' + (r.furados !== undefined ? r.furados : '-') +
        ' | golos ' + MatchStats[eq].golos +
        ' | defesas do adversario ' + (MatchStats[eq === 'TeamA' ? 'TeamB' : 'TeamA'].defesas !== undefined
            ? MatchStats[eq === 'TeamA' ? 'TeamB' : 'TeamA'].defesas : '-'));
}
