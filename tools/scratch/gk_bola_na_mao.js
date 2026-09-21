/*
DEPOIS DE AGARRAR NO MERGULHO, A BOLA FICA NA MAO?

Relato: *"ele nao esta segurando a bola. A bola toca na mao do goleiro e ela
vai instantaneamente para o gramado"*.

Mede, nos frames em que o guarda-redes esta em mergulho JA COM A BOLA AGARRADA,
a altura da bola e a distancia dela a mao que a agarrou.
*/
const segundos = Number(process.argv[2] || 3600);
const semente = Number(process.argv[3] || 4242);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(semente);
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
const _v = new THREE.Vector3();

let frames = 0, somaY = 0, somaD = 0, noChao = 0, lances = new Set();
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const g of Match.players.concat(Match.opponents)) {
        if (g.role !== 'gk' || !g.dive || !g.dive.agarrou) continue;
        if (g.gkEstado !== 'mergulho') continue;
        const mao = g.rig && g.rig[g.dive.maoAgarrou || 'rHand'];
        if (!mao) continue;
        mao.getWorldPosition(_v);
        const d = _v.distanceTo(Match.ball.position);
        frames++;
        somaY += Match.ball.position.y;
        somaD += d;
        if (Match.ball.position.y <= BallPhysics.raio + 0.02) noChao++;
        lances.add(g.team + ':' + Math.round(i / 60));
    }
}

if (!frames) { console.log('nenhum mergulho com bola agarrada'); process.exit(0); }
console.log(frames + ' frames de mergulho COM A BOLA JA AGARRADA\n');
console.log('  altura media da bola:        ' + (somaY / frames).toFixed(3) + ' m');
console.log('  distancia media a mao:       ' + (somaD / frames).toFixed(3) + ' m');
console.log('  frames com a bola NO CHAO:   ' + noChao + '/' + frames +
    '  (' + (100 * noChao / frames).toFixed(0) + '%)');
console.log('  (raio da bola = ' + BallPhysics.raio + ' m; no chao = y <= raio + 2 cm)');
