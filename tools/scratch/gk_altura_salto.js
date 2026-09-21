/*
QUE ALTURA ATINGE O GUARDA-REDES.

Relato: *"o goleiro esta saltando muito alto, reduz em 25%"*.

Ha duas fontes de salto e convem separa-las:
  mergulho     parabola do GkDive (v0y, entre vySubidaMin e vySubidaMax)
  salto_alto   o ramo proprio do updateGK (jumpH)

Mede o APICE de cada gesto, acima do relvado (ALTURA_BASE_Y).
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
const gestos = new Map();   // gk -> { estado, apice }
const feitos = [];

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const g of gks()) {
        const e = g.gkEstado || 'idle';
        const alt = g.model.position.y - ALTURA_BASE_Y;
        const activo = (e === 'mergulho' || e === 'salto_alto');
        const cur = gestos.get(g);
        if (activo) {
            if (!cur || cur.estado !== e) gestos.set(g, { estado: e, apice: alt });
            else if (alt > cur.apice) cur.apice = alt;
        } else if (cur) {
            feitos.push({ estado: cur.estado, apice: cur.apice });
            gestos.delete(g);
        }
    }
}

if (!feitos.length) { console.log('sem gestos'); process.exit(0); }
console.log('gravidade do jogo: ' + BallPhysics.gravidade);
console.log('config: vySubidaMax ' + GoalkeeperDive.vySubidaMax +
    '  vySubidaMin ' + GoalkeeperDive.vySubidaMin);
const apiceTeorico = Math.pow(GoalkeeperDive.vySubidaMax, 2) / (2 * BallPhysics.gravidade);
console.log('apice teorico do mergulho no maximo: ' + apiceTeorico.toFixed(2) + ' m\n');

const porEstado = new Map();
for (const f of feitos) {
    if (!porEstado.has(f.estado)) porEstado.set(f.estado, []);
    porEstado.get(f.estado).push(f.apice);
}
console.log('APICE do corpo acima do relvado:');
for (const [e, lista] of porEstado) {
    lista.sort((a, b) => a - b);
    const med = lista.reduce((a, b) => a + b, 0) / lista.length;
    console.log('  ' + e.padEnd(12) + String(lista.length).padStart(4) + ' gestos   ' +
        'media ' + med.toFixed(2) + ' m   mediana ' + lista[Math.floor(lista.length / 2)].toFixed(2) +
        '   max ' + lista[lista.length - 1].toFixed(2) + ' m');
}
