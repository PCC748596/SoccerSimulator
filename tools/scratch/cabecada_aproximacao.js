/*
QUANDO A BOLA PASSA A ALTURA DA TESTA, A QUE DISTANCIA ESTA O JOGADOR MAIS
PERTO? E a pergunta que decide se o raio de contacto da testa e alcancavel.
*/
const segundos = Number(process.argv[2] || 2400);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260917));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const dists = [];
let episodios = 0, anterior = false;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    const b = Match.ball.position;
    let melhor = Infinity, quem = null;
    for (const p of Match.players.concat(Match.opponents)) {
        const alturaPes = b.y - p.model.position.y;
        if (Math.abs(alturaPes - ALTURA_TESTA) > HeaderModel.janelaContacto) continue;
        const d = Math.hypot(b.x - p.model.position.x, b.z - p.model.position.z);
        if (d < melhor) { melhor = d; quem = p; }
    }
    const agora = (quem !== null && melhor < 3.0);
    if (agora && !anterior) { episodios++; dists.push(melhor); }
    else if (agora && anterior && melhor < dists[dists.length - 1]) dists[dists.length - 1] = melhor;
    anterior = agora;
}
dists.sort((a, b) => a - b);
console.log(episodios + ' passagens da bola pela altura da testa com alguem a menos de 3 m');
if (dists.length) {
    const soma = dists.reduce((a, b) => a + b, 0);
    console.log('  distancia MINIMA nessa passagem: media ' + (soma / dists.length).toFixed(2) +
        ' | mediana ' + dists[Math.floor(dists.length / 2)].toFixed(2) +
        ' | melhor ' + dists[0].toFixed(2) + ' m');
    for (const r of [0.32, 0.5, 0.75, 0.9, 1.2]) {
        const n = dists.filter(v => v <= r).length;
        console.log('    a ' + r.toFixed(2) + ' m ou menos: ' + n + ' (' + (100 * n / dists.length).toFixed(0) + '%)');
    }
}
