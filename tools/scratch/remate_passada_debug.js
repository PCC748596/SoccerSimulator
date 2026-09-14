/* Segue um remate frame a frame: velocidade e distancia a bola. */
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(777);
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
for (let i = 0; i < 30; i++) Match.update(dt);
Match.triggerCaraACara('TeamA', 15);
const atk = Match.players.filter(p => p.role !== 'gk').find(p => p.hasBall) || Match.ballCarrier;
let visto = 0;
for (let i = 0; i < 60 * 8 && visto < 30; i++) {
    Match.update(dt);
    if (atk.fsm.currentState === 'SHOOT' && atk.actionState) {
        visto++;
        const d = atk.model.position.distanceTo(Match.ball.position);
        console.log('norm ' + (atk.actionState.t / atk.actionState.duration).toFixed(2) +
            '  vel ' + atk.velocity.length().toFixed(2) +
            '  dist bola ' + d.toFixed(2) +
            '  contactTime ' + atk.actionState.contactTime.toFixed(2) +
            '  plantar=' + (ShotClip.plantar ? 'sim' : 'nao'));
    }
}
if (!visto) console.log('nenhum remate visto');
