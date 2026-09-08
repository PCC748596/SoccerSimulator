/*
DEPOIS DO GOLO: ANDAM OU SAO TELETRANSPORTADOS?

Conta, por golo, quantos jogadores de campo dao um SALTO de posicao (mais de
`SALTO` metros num frame) e quantos metros andaram durante o estado GOAL.

Uso: node tools/headless/saida_caminhada.js [segundos]
*/
require('./harness.js');
const segundos = Number(process.argv[2] || 900);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const SALTO = 3.0;
const antes = new Map();
let golos = 0, saltos = 0, andado = 0, estadoAnt = Match.state;
let andadoNesteGolo = 0, saltosNesteGolo = 0;
let kickoffAnt = false;

const todos = () => Match.players.concat(Match.opponents).filter(p => p.role !== 'gk');

for (let i = 0; i < Math.round(segundos / dt); i++) {
    for (const p of todos()) antes.set(p, p.model.position.clone());
    Match.update(dt);
    const emGolo = (estadoAnt === 'GOAL');
    for (const p of todos()) {
        const a = antes.get(p); if (!a) continue;
        const d = a.distanceTo(p.model.position);
        if (d > SALTO) { saltos++; saltosNesteGolo++; }
        else if (emGolo) { andado += d; andadoNesteGolo += d; }
    }
    if (Match.state === 'GOAL' && estadoAnt !== 'GOAL') { golos++; andadoNesteGolo = 0; saltosNesteGolo = 0; }
    if (emGolo && Match.kickoffActive && !kickoffAnt) {
        const ds = todos().map(p => antes.get(p).distanceTo(p.model.position)).sort((a, b) => b - a);
        const soma = ds.reduce((a, b) => a + b, 0);
        console.log(`  reposicao do golo ${golos}: ${ds.filter(d => d > 1).length}/20 movidos a mao, maior ${ds[0].toFixed(1)} m, soma ${soma.toFixed(0)} m`);
    }
    kickoffAnt = Match.kickoffActive;
    if (estadoAnt === 'GOAL' && Match.state !== 'GOAL') {
        console.log(`golo ${golos}: andados ${andadoNesteGolo.toFixed(0)} m no total (${(andadoNesteGolo / 20).toFixed(1)} m por jogador) | saltos ${saltosNesteGolo}`);
    }
    estadoAnt = Match.state;
}
console.log(`\ngolos ${golos} | saltos totais ${saltos} | metros andados em GOAL ${andado.toFixed(0)}`);
