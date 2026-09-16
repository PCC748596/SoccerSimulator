/* Verificacao directa da regra: chama o resolvedor com e sem marcacao. */
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[2] || 99));
require('../headless/harness.js');
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const gk = Match.opponents.find(p => p.role === 'gk');
const adv = Match.players.find(p => p.role !== 'gk');
const N = 400;

function correr(comMarcacao) {
    let agarrou = 0, escapou = 0, socou = 0;
    const angulos = [];
    for (let i = 0; i < N; i++) {
        gk.hasBall = false; Match.ballCarrier = null;
        gk.model.position.set(0, ALTURA_BASE_Y, gk.ownGoalZ + gk.dirZ * 2);
        adv.model.position.set(comMarcacao ? 1.0 : 30, ALTURA_BASE_Y, gk.model.position.z);
        Match.ball.position.set(gk.model.position.x + 0.3, 2.2, gk.model.position.z);
        const vIn = { x: -9, z: -gk.dirZ * 5 };
        Match.ballVel.set(vIn.x, 1.0, vIn.z);

        const r = gk.resolverSaidaAoCruzamento();
        if (!r) continue;
        if (gk.hasBall) { agarrou++; continue; }
        const v = Math.hypot(Match.ballVel.x, Match.ballVel.z);
        const n = Math.hypot(vIn.x, vIn.z);
        const dot = (Match.ballVel.x * vIn.x + Match.ballVel.z * vIn.z) / (v * n);
        if (dot > 0.5) escapou++;
        else {
            socou++;
            angulos.push(Math.acos(Math.max(-1, Math.min(1, -dot))) * 180 / Math.PI);
        }
    }
    const nome = comMarcacao ? 'COM marcacao' : 'SEM marcacao';
    let linha = nome.padEnd(14) + ' agarrou ' + (100 * agarrou / N).toFixed(1) + '%  escapou ' +
        (100 * escapou / N).toFixed(1) + '%  socou ' + (100 * socou / N).toFixed(1) + '%';
    if (angulos.length) {
        angulos.sort((a, b) => a - b);
        linha += ' | desvio do soco: medio ' + (angulos.reduce((a, b) => a + b, 0) / angulos.length).toFixed(1) +
            ' max ' + angulos[angulos.length - 1].toFixed(1) + ' graus';
    }
    console.log(linha);
}
correr(false);
correr(true);
