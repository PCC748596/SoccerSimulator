/* O voo da bola depois do remate no cara a cara, frame a frame. */
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 777));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
for (let i = 0; i < 30; i++) Match.update(dt);
Match.triggerCaraACara('TeamA', Number(process.argv[2] || 20));
const atk = Match.players.filter(p => p.role !== 'gk').find(p => p.hasBall) || Match.ballCarrier;
const gk = Match.opponents.find(p => p.role === 'gk');
let disparou = false, n = 0;
console.log('t     bola(x,y,z)          vel    gk(x,z)      gkEstado    dist bola-gk  estado');
for (let i = 0; i < 60 * 9; i++) {
    Match.update(dt);
    if (!disparou && Match.ballVel.lengthSq() > 100) disparou = true;
    if (disparou && n < 40) {
        n++;
        const b = Match.ball.position, g = gk.model.position;
        console.log((i * dt).toFixed(2).padStart(4) + '  ' +
            ('(' + b.x.toFixed(1) + ',' + b.y.toFixed(1) + ',' + b.z.toFixed(1) + ')').padEnd(20) +
            Match.ballVel.length().toFixed(1).padStart(5) + '  ' +
            ('(' + g.x.toFixed(1) + ',' + g.z.toFixed(1) + ')').padEnd(13) +
            String(gk.gkEstado).padEnd(12) + b.distanceTo(g).toFixed(2).padStart(11) + '  ' + Match.state +
            ' | reagiu=' + (gk.gkReagiu ? 'sim' : 'nao') + ' alvoX=' + (gk.gkAlvoX === undefined ? '-' : gk.gkAlvoX.toFixed(2)) +
            ' ancoraCongelada=' + (gk._gkAncoraRemate ? 'sim' : 'nao') + ' chutada=' + (window.bolaChutada ? 'sim' : 'nao'));
    }
    if (Match.state !== 'PLAY') break;
}
