/*
QUEM CORRE ATRAS DA BOLA DURANTE UMA FALTA DIRECTA.

Relato, com captura: *"durante a falta directa tem 2 jogadores tentando correr
atras da bola. Isso nao faz sentido. A menos que o goleiro rebata a bola ou ela
pegue na trave ou em algum outro jogador"*.

Amostra o estado FREE_KICK e conta quem esta em estado de perseguicao da bola,
separando ANTES da cobranca (bola parada, ninguem devia correr atras dela) de
DEPOIS (ai ja pode haver ressalto).
*/
const segundos = Number(process.argv[2] || 2400);
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

const PERSEGUE = ['CHASE', 'CHASE_BALL', 'PURSUE', 'INTERCEPT', 'RECOVER'];
const todos = () => Match.players.concat(Match.opponents);

let framesAntes = 0, somaAntes = 0, piorAntes = 0;
const porEstado = new Map(), porPos = new Map();
let lances = 0, ant = null;

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (Match.state !== 'FREE_KICK') { ant = Match.state; continue; }
    if (ant !== 'FREE_KICK') lances++;
    ant = 'FREE_KICK';

    // ANTES da cobranca: a bola ainda esta parada.
    const parada = Match.ballVel.lengthSq() < 0.25;
    if (!parada) continue;

    const taker = Match.setPieceTaker;
    const aCorrer = todos().filter(p => {
        if (p === taker || p.role === 'gk' || !p.model) return false;
        const st = p.fsm && p.fsm.currentState;
        if (!st) return false;
        // Em movimento E dirigido a bola.
        const v = Math.hypot(p.velocity.x, p.velocity.z);
        if (v < 1.5) return false;
        const dx = Match.ball.position.x - p.model.position.x;
        const dz = Match.ball.position.z - p.model.position.z;
        const d = Math.hypot(dx, dz) || 1;
        const aproxima = (p.velocity.x * dx + p.velocity.z * dz) / (v * d);
        return aproxima > 0.75 && d < 25;
    });

    framesAntes++;
    somaAntes += aCorrer.length;
    if (aCorrer.length > piorAntes) piorAntes = aCorrer.length;
    for (const p of aCorrer) {
        const st = (p.fsm && p.fsm.currentState) || '?';
        porEstado.set(st, (porEstado.get(st) || 0) + 1);
        const k = (p.pos || p.role);
        porPos.set(k, (porPos.get(k) || 0) + 1);
    }
}

console.log(lances + ' faltas, ' + framesAntes + ' frames com a bola AINDA PARADA\n');
if (!framesAntes) process.exit(0);
console.log('jogadores a correr NA DIRECCAO DA BOLA com ela parada:');
console.log('  media por frame ' + (somaAntes / framesAntes).toFixed(2) +
    '   pior frame ' + piorAntes);
console.log('\n  por estado da FSM:');
for (const [e, n] of [...porEstado.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log('    ' + e.padEnd(20) + String(n).padStart(6) + ' frames');
}
console.log('\n  por posicao:');
for (const [k, n] of [...porPos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log('    ' + String(k).padEnd(8) + String(n).padStart(6) + ' frames');
}
