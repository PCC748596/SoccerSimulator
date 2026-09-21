/*
O GUARDA-REDES ANDA ATRAS DA BOLA DEPOIS DE ELA JA TER PASSADO?

Relato, com captura: *"as bolas estao passando pelo goleiro e o goleiro vai
escorregando atras delas para defender"*.

Mede, por frame e so com a bola em movimento para a baliza dele:
  passou   a bola esta mais perto da linha de golo do que ele
  andou    ele deslocou-se neste frame
e cruza as duas: quantos frames ele passa a mover-se com a bola JA PASSADA, e
quanto terreno faz nesse estado.
*/
const segundos = Number(process.argv[2] || 1800);
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

const gks = () => Match.players.concat(Match.opponents).filter(p => p.role === 'gk');
const antes = new Map();
const porEstado = new Map();
let framesPassada = 0, framesPassadaAndou = 0, metrosDepois = 0;

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    const b = Match.ball.position;
    if (Match.state !== 'PLAY') continue;
    for (const g of gks()) {
        const prev = antes.get(g);
        antes.set(g, { x: g.model.position.x, z: g.model.position.z });
        if (!prev) continue;

        // So conta com a bola perto dele e do lado da baliza dele.
        const dist = Math.hypot(b.x - g.model.position.x, b.z - g.model.position.z);
        if (dist > 6) continue;
        // A bola JA PASSOU: esta mais perto da linha de golo dele do que ele.
        const dirGol = Math.sign(g.ownGoalZ || (-g.dirZ * (CAMPO_COMP / 2))) || 1;
        const passou = (b.z - g.model.position.z) * dirGol > 0.25;
        if (!passou) continue;

        framesPassada++;
        const andou = Math.hypot(g.model.position.x - prev.x, g.model.position.z - prev.z);
        if (andou > 0.01) {
            framesPassadaAndou++;
            metrosDepois += andou;
            const e = g.gkEstado || '?';
            if (!porEstado.has(e)) porEstado.set(e, { n: 0, m: 0 });
            const r = porEstado.get(e);
            r.n++; r.m += andou;
        }
    }
}

console.log('frames com a bola a menos de 6 m e JA PASSADA do guarda-redes: ' + framesPassada);
if (!framesPassada) process.exit(0);
console.log('  desses, com ele a mover-se: ' + framesPassadaAndou +
    ' (' + (100 * framesPassadaAndou / framesPassada).toFixed(0) + '%)');
console.log('  terreno feito com a bola ja passada: ' + metrosDepois.toFixed(1) + ' m');
console.log('\n  por estado do guarda-redes:');
for (const [e, r] of [...porEstado.entries()].sort((a, b) => b[1].m - a[1].m)) {
    console.log('    ' + e.padEnd(18) + String(r.n).padStart(6) + ' frames   ' +
        r.m.toFixed(1).padStart(6) + ' m   (' + (r.m / r.n * 60).toFixed(1) + ' m/s medios)');
}
