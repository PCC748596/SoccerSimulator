/*
LARGURA x GOLOS — a conta da sessão de 8 de Setembro, repetível.

Corre N corridas com sementes fixas (Math.random substituído por um
mulberry32) e imprime golos por 90 min, largura ocupada pela equipa e o |x|
do alvo dos laterais. Serve para comparar duas versões do posicionamento com
exactamente o mesmo ruído.

Uma semente por processo (o harness nao suporta ser recarregado).

Uso: node tools/headless/largura_golos.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 600);
const semente = Number(process.argv[3] || 0);

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const larg = [], latX = [];
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 12 || Match.state !== 'PLAY') continue;
    for (const lista of [Match.players, Match.opponents]) {
        const xs = lista.filter(p => p.role !== 'gk').map(p => p.model.position.x);
        larg.push(Math.max(...xs) - Math.min(...xs));
        for (const p of lista) {
            if ((p.pos === 'LB' || p.pos === 'RB') && p.tacticalTarget) latX.push(Math.abs(p.tacticalTarget.x));
        }
    }
}
const med = a => a.reduce((x, y) => x + y, 0) / a.length;
const min = Match.tempoDeJogo / 60;
const golos = Match.placarA + Match.placarB;
console.log(`semente ${semente}: golos/90 ${(golos * 90 / min).toFixed(2)} | largura ${med(larg).toFixed(1)} | lateral |x| ${med(latX).toFixed(2)} | ${golos} golos em ${min.toFixed(0)} min`);
