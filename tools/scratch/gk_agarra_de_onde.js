/* Quem agarra a bola de longe, e em que estado. */
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 7));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
const _w = new THREE.Vector3();
const proto = Object.getPrototypeOf(Match.players[0]);
const orig = proto.grabBall;
proto.grabBall = function () {
    if (this.role === 'gk' && Match.ball) {
        let mao = Infinity;
        for (const n of ['lHand', 'rHand']) {
            const m = this.rig && this.rig[n];
            if (!m) continue;
            m.getWorldPosition(_w);
            mao = Math.min(mao, _w.distanceTo(Match.ball.position));
        }
        const corpo = Math.hypot(Match.ball.position.x - this.model.position.x,
            Match.ball.position.z - this.model.position.z);
        if (mao > 1.3 && corpo > 0.6) {
            console.log('agarrada larga: mao ' + mao.toFixed(2) + ' corpo ' + corpo.toFixed(2) +
                ' | estado ' + this.gkEstado + ' | fase ' + (this.dive ? this.dive.fase : '-') +
                ' | jogo ' + Match.state);
        }
    }
    return orig.apply(this, arguments);
};
for (let i = 0; i < Math.round(Number(process.argv[2] || 1200) / dt); i++) Match.update(dt);
