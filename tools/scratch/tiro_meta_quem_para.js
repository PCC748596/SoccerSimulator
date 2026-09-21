/*
QUEM E QUE POE ESTA GENTE EM SET_PIECE_WAIT DENTRO DA PEQUENA AREA.

Embrulha o `changeState` e guarda a pilha de chamadas da transicao que deixa um
jogador de campo parado dentro da pequena area durante um tiro de meta.
*/
const semente = Number(process.argv[2] || 4242);
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

function naPequena(p, linhaZ, dir) {
    const dz = (p.model.position.z - linhaZ) * dir;
    return dz >= -1.0 && dz <= Area.pequenaProfundidade &&
        Math.abs(p.model.position.x) <= Area.pequenaMeiaLargura;
}

const culpados = new Map();
const um = Match.players[0];
const FSM = Object.getPrototypeOf(um.fsm);
const orig = FSM.changeState;
FSM.changeState = function (novo) {
    const r = orig.call(this, novo);
    if (Match.state !== 'GOAL_KICK' || novo !== 'SET_PIECE_WAIT') return r;
    const p = this.player || this.p || this.owner;
    if (!p || !p.model || p.role === 'gk') return r;
    const team = Match.setPieceTeam;
    if (!team || p.team !== team) return r;
    const bate = (team === 'TeamA') ? Match.players : Match.opponents;
    const dir = bate.find(j => j.role !== 'gk').dirZ;
    const linhaZ = -dir * (CAMPO_COMP / 2);
    if (!naPequena(p, linhaZ, dir)) return r;
    const pilha = new Error().stack.split(String.fromCharCode(10))
        .slice(2, 6).map(l => l.trim().replace(/^at /, '')).join('  <-  ');
    culpados.set(pilha, (culpados.get(pilha) || 0) + 1);
    return r;
};

for (let i = 0; i < Math.round(1800 / dt); i++) Match.update(dt);

if (!culpados.size) { console.log('ninguem entrou em SET_PIECE_WAIT dentro da pequena area'); }
else {
    console.log('transicoes para SET_PIECE_WAIT com o jogador DENTRO da pequena area:');
    for (const [pilha, n] of [...culpados.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(String.fromCharCode(10) + '  ' + n + 'x');
        console.log('    ' + pilha);
    }
}
