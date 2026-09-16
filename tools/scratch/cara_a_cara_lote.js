/*
LOTE DO CARA A CARA: N lances, e o que deu cada um.

Uso: node tools/scratch/cara_a_cara_lote.js [lances]
*/
const N = Number(process.argv[2] || 60);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(20260914);
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const conta = { golo: 0, defesa: 0, fora: 0, semRemate: 0, outro: 0 };
let mergulhos = 0, distSoma = 0, angSoma = 0, remates = 0;
const larg = (typeof LARGURA_BALIZA !== 'undefined') ? LARGURA_BALIZA : 7.32;

for (let n = 0; n < N; n++) {
    Match.init(scene);
    if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
    for (let i = 0; i < 30; i++) Match.update(dt);
    Match.triggerCaraACara('TeamA', (Math.random() * 2 - 1) * 30);
    const atk = Match.players.filter(p => p.role !== 'gk').find(p => p.hasBall) || Match.ballCarrier;
    const gk = Match.opponents.find(p => p.role === 'gk');
    let rematou = false, mergulhou = false, desfecho = null;
    for (let i = 0; i < 60 * 8; i++) {
        Match.update(dt);
        if (!rematou && atk.fsm.currentState === 'SHOOT') {
            rematou = true; remates++;
            const P = atk.model.position;
            distSoma += Math.hypot(P.x, atk.targetGoalZ - P.z);
            angSoma += anguloDaBaliza(P.x, P.z, atk.targetGoalZ, larg) * 180 / Math.PI;
        }
        if (gk.gkEstado === 'mergulho') mergulhou = true;
        if (Match.state === 'GOAL') { desfecho = 'golo'; break; }
        if (Match.state === 'GOAL_KICK') { desfecho = 'fora'; break; }
        if (Match.state === 'CORNER_KICK') { desfecho = 'defesa'; break; }
        if (gk.gkEstado === 'segurando' && rematou) { desfecho = 'defesa'; break; }
        if (gk.gkEstado === 'segurando' && !rematou) { desfecho = 'semRemate'; break; }
    }
    if (mergulhou) mergulhos++;
    conta[desfecho || (rematou ? 'outro' : 'semRemate')]++;
}
console.log(N + ' lances:');
for (const k of Object.keys(conta)) console.log('  ' + k.padEnd(10) + String(conta[k]).padStart(4) + '  ' + (100 * conta[k] / N).toFixed(0) + '%');
console.log('  remates ' + remates + ' | distancia media ' + (distSoma / Math.max(1, remates)).toFixed(1) +
    ' m | angulo medio ' + (angSoma / Math.max(1, remates)).toFixed(0) + ' graus');
console.log('  lances com mergulho do guarda-redes: ' + mergulhos + ' (' + (100 * mergulhos / N).toFixed(0) + '%)');
