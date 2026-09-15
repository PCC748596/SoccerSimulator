/*
O GUARDA-REDES ESTA VIRADO PARA ONDE ATIRA?

No instante em que a bola sai da mao, mede o angulo entre a FRENTE do corpo
dele e a direccao do lancamento.

Uso: node tools/scratch/gk_lancamento_angulo.js [segundos]
*/
const segundos = Number(process.argv[2] || 2400);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260921));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const _f = new THREE.Vector3();
const estados = {};
const angulos = [];
// O que o angulo SERIA com o comportamento antigo: corpo virado para o campo.
const antigos = [];
const anterior = new Map();
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const gk of [Match.players[0], Match.opponents[0]]) {
        if (!gk) continue;
        estados[gk.gkEstado] = (estados[gk.gkEstado] || 0) + 1;
        const lancando = (gk.gkEstado === 'lancando');

        // Todo o gesto: o corpo devia estar virado para o alvo do principio ao fim.
        if (lancando && gk.gkAlvoLancamento && gk.gkAlvoLancamento.model) {
            _f.set(0, 0, 1).applyQuaternion(gk.model.quaternion);
            const ax = gk.gkAlvoLancamento.model.position.x - gk.model.position.x;
            const az = gk.gkAlvoLancamento.model.position.z - gk.model.position.z;
            const n = Math.hypot(ax, az) || 1;
            const cos = (_f.x * ax + _f.z * az) / n;
            angulos.push(Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI);
            const cosAnt = (gk.dirZ * az) / n;
            antigos.push(Math.acos(Math.max(-1, Math.min(1, cosAnt))) * 180 / Math.PI);
        }
        anterior.set(gk, { lancando: lancando });
    }
}
console.log('frames por estado do guarda-redes:');
for (const k of Object.keys(estados).sort((a, b) => estados[b] - estados[a])) {
    console.log('  ' + String(k).padEnd(18) + estados[k]);
}
if (!angulos.length) { console.log('nenhum lancamento medido'); }
else {
    angulos.sort((a, b) => a - b);
    const soma = angulos.reduce((a, b) => a + b, 0);
    console.log(angulos.length + ' frames de lancamento | angulo corpo->alvo: medio ' + (soma / angulos.length).toFixed(0) +
        ' graus | mediana ' + angulos[Math.floor(angulos.length / 2)].toFixed(0) +
        ' | maximo ' + angulos[angulos.length - 1].toFixed(0));
    antigos.sort((a, b) => a - b);
    const somaAnt = antigos.reduce((a, b) => a + b, 0);
    console.log('  com o corpo virado para o campo (o comportamento antigo): medio ' +
        (somaAnt / antigos.length).toFixed(0) + ' graus | mediana ' +
        antigos[Math.floor(antigos.length / 2)].toFixed(0) + ' | maximo ' +
        antigos[antigos.length - 1].toFixed(0) +
        ' | acima de 45: ' + (100 * antigos.filter(v => v > 45).length / antigos.length).toFixed(0) + '%');
    for (const c of [15, 30, 45, 90]) {
        console.log('  acima de ' + c + ' graus: ' + angulos.filter(v => v > c).length +
            ' (' + (100 * angulos.filter(v => v > c).length / angulos.length).toFixed(0) + '%)');
    }
}
