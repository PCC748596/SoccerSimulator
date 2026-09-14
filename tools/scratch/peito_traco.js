/* Uma matada no peito, frame a frame. */
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[2] || 20260916));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
let alvo = null, t0 = 0, n = 0;
const orig = FootballPlayer.prototype.controlarNoPeito;
FootballPlayer.prototype.controlarNoPeito = function (h) {
    if (!alvo) { alvo = this; t0 = 0; console.log('matada: TEC ' + this.skillFor('TEC').toFixed(0) +
        ' | vel do jogador ' + this.velocity.length().toFixed(2) + ' m/s | altura ' + h.toFixed(2)); }
    return orig.call(this, h);
};
for (let i = 0; i < 60 * 600 && n < 40; i++) {
    Match.update(dt);
    if (alvo) {
        t0 += dt; n++;
        const b = Match.ball.position, p = alvo.model.position;
        console.log(t0.toFixed(2).padStart(5) + '  bola(' + b.x.toFixed(2) + ',' + b.y.toFixed(2) + ',' + b.z.toFixed(2) + ')' +
            '  vel ' + Match.ballVel.length().toFixed(2).padStart(5) +
            '  jogador vel ' + alvo.velocity.length().toFixed(2).padStart(5) +
            '  dist ' + p.distanceTo(b).toFixed(2).padStart(5) +
            '  cola ' + (alvo.peitoCola > 0 ? 'sim' : 'nao') +
            '  estado ' + alvo.fsm.currentState.padEnd(14) +
            '  dono ' + (Match.ballCarrier ? (Match.ballCarrier === alvo ? 'ele' : 'outro') : '-') +
            '  peitos ' + Match.peitosSeguidos +
            '  comBola ' + (Match.players.concat(Match.opponents).filter(q => q.hasBall).map(q => q.pos + (q === alvo ? '(ele)' : '')).join(',') || '-') +
            '  gkEstados ' + [Match.players[0], Match.opponents[0]].map(g => g.gkEstado).join('/'));
    }
}
