/*
CENARIO CONTROLADO: cruzamento a cair na pequena area, com e sem marcacao.
Verifica a regra dos 95%/5% e a geometria do soco (<=10 graus da trajectoria
invertida).
*/
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[2] || 4242));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const gk = Match.opponents.find(p => p.role === 'gk');
const marcador = Match.players.find(p => p.role !== 'gk');

function lance(comMarcacao) {
    // Guarda-redes na linha, bola a cair na pequena area vinda da ala.
    gk.gkEstado = 'idle'; gk.dive = null; gk.hasBall = false; gk.gkSaiuAoCruzamento = false;
    Match.ballCarrier = null; Match.lastTouchedPlayer = null;
    gk.model.position.set(0, ALTURA_BASE_Y, gk.ownGoalZ + gk.dirZ * 1.0);
    if (comMarcacao) marcador.model.position.set(0.5, ALTURA_BASE_Y, gk.model.position.z + 0.5);
    else marcador.model.position.set(25, ALTURA_BASE_Y, 0);
    Match.ball.position.set(14, 2.6, gk.ownGoalZ + gk.dirZ * 8);
    Match.ballVel.set(-11, 1.5, -gk.dirZ * 4);
    const velIn = { x: Match.ballVel.x, z: Match.ballVel.z };
    for (let i = 0; i < 120; i++) {
        Match.update(dt);
        if (gk.hasBall) return { desfecho: 'agarrou' };
        const v = Math.hypot(Match.ballVel.x, Match.ballVel.z);
        const vIn = Math.hypot(velIn.x, velIn.z);
        const dot = (Match.ballVel.x * velIn.x + Match.ballVel.z * velIn.z) / Math.max(1e-6, v * vIn);
        if (dot < -0.2 && v > 8) {
            const ang = Math.acos(Math.max(-1, Math.min(1, -dot))) * 180 / Math.PI;
            return { desfecho: 'socou', angulo: ang };
        }
    }
    return { desfecho: 'nada' };
}

const semMarca = { agarrou: 0, socou: 0, nada: 0 };
const comMarca = { agarrou: 0, socou: 0, nada: 0 };
const angulos = [];
for (let n = 0; n < 40; n++) {
    const r = lance(false); semMarca[r.desfecho]++;
}
for (let n = 0; n < 40; n++) {
    const r = lance(true); comMarca[r.desfecho]++;
    if (r.angulo !== undefined) angulos.push(r.angulo);
}
console.log('SEM marcacao (40 lances): agarrou ' + semMarca.agarrou + ' | socou ' + semMarca.socou + ' | sem contacto ' + semMarca.nada);
console.log('COM marcacao (40 lances): agarrou ' + comMarca.agarrou + ' | socou ' + comMarca.socou + ' | sem contacto ' + comMarca.nada);
if (angulos.length) {
    angulos.sort((a, b) => a - b);
    console.log('  desvio do soco: medio ' + (angulos.reduce((a, b) => a + b, 0) / angulos.length).toFixed(1) +
        ' graus | maximo ' + angulos[angulos.length - 1].toFixed(1) + ' (limite 10)');
}
