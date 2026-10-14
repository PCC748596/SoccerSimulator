/*
O JOGADOR SEM A BOLA E MAIS RAPIDO QUE O COM A BOLA? Mede a velocidade (m/s) de campo, em jogo corrido, por grupo:
  . portador (tem a bola);  . sem bola da equipa que ataca;  . sem bola da equipa que defende;  . perseguidor (bb.chaser).
Imprime media, p90 e maximo de cada um, e a mesma coisa so nos frames em que vao a correr (> 3 m/s).
Uso: node tools/headless/velocidade_com_e_sem_bola.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 300);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
Match.init(new THREE.Scene());
const dt = 1 / 60;
const g = { portador: [], semBolaAtaca: [], semBolaDefende: [], perseguidor: [] };
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 3 || Match.state !== 'PLAY') continue;
    const c = Match.ballCarrier;
    if (!c || c.role === 'gk') continue;
    const bbDef = TeamAI.get(c.team === 'TeamA' ? 'TeamB' : 'TeamA');
    for (const p of Match.players.concat(Match.opponents)) {
        if (p.role === 'gk' || !p.model || !p.velocity) continue;
        const v = Math.hypot(p.velocity.x, p.velocity.z);
        if (p === c) g.portador.push(v);
        else if (bbDef && bbDef.chaser === p) g.perseguidor.push(v);
        else if (p.team === c.team) g.semBolaAtaca.push(v);
        else g.semBolaDefende.push(v);
    }
}
const est = (a) => { if (!a.length) return '-'; const s = [...a].sort((x, y) => x - y); const m = a.reduce((x, y) => x + y, 0) / a.length; return `media ${m.toFixed(2)} | p90 ${s[Math.floor(.9 * (s.length - 1))].toFixed(2)} | max ${s[s.length - 1].toFixed(2)}`; };
for (const [k, a] of Object.entries(g)) console.log(`${k.padEnd(16)} n=${String(a.length).padStart(6)} | ${est(a)}  || a correr (>3 m/s): ${est(a.filter(v => v > 3))}`);
