/*
ONDE E PORQUE A BOLA INVERTE O SENTIDO PERTO DA BALIZA.

Procura frames em que o vz troca de sinal com a bola a menos de 8 m da linha, e
diz quem lhe tocou: espalmada (de pe ou em mergulho), rocada, armacao, rede, ou
nada identificado.
*/
const segundos = Number(process.argv[2] || 1800);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 4242));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let marca = null;
const espOriginal = GkDive.espalmar.bind(GkDive);
GkDive.espalmar = function (p, d, q) { marca = d ? 'espalmada(mergulho)' : 'espalmada(de pe)'; return espOriginal(p, d, q); };
const balizaOriginal = Match.colidirComBaliza.bind(Match);
Match.colidirComBaliza = function () { const v = Match.ballVel.z; balizaOriginal(); if (Math.sign(v) !== Math.sign(Match.ballVel.z)) marca = 'armacao'; };

const casos = [];
let vzAnt = 0;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    marca = null;
    const zAnt = Match.ball.position.z;
    Match.update(dt);
    const vz = Match.ballVel.z;
    const b = Match.ball.position;
    const perto = Math.min(Math.abs(53 - b.z), Math.abs(-53 - b.z));
    if (vzAnt !== 0 && Math.sign(vz) !== Math.sign(vzAnt) && Math.abs(vzAnt) > 6 && perto < 8) {
        const gk = (zAnt > 0) ? Match.opponents[0] : Match.players[0];
        casos.push({
            t: (i * dt).toFixed(1), z: b.z.toFixed(1), x: b.x.toFixed(1), y: b.y.toFixed(1),
            vzAnt: vzAnt.toFixed(1), vz: vz.toFixed(1),
            gkZ: gk ? gk.model.position.z.toFixed(1) : '-', gkX: gk ? gk.model.position.x.toFixed(1) : '-',
            gkEstado: gk ? gk.gkEstado : '-', causa: marca || 'nao identificada'
        });
    }
    vzAnt = vz;
}
console.log(casos.length + ' inversoes perto da baliza em ' + (segundos / 60).toFixed(0) + ' min');
const porCausa = {};
for (const c of casos) porCausa[c.causa] = (porCausa[c.causa] || 0) + 1;
for (const k of Object.keys(porCausa)) console.log('  ' + k + ': ' + porCausa[k]);
console.log('');
console.log('t      bola(x,y,z)        vz antes -> depois   gk(x,z)      estado      causa');
for (const c of casos.slice(0, 12)) {
    console.log(c.t.padStart(5) + '  (' + c.x + ',' + c.y + ',' + c.z + ')'.padEnd(6) + '   ' +
        c.vzAnt.padStart(6) + ' -> ' + c.vz.padStart(6) + '   (' + c.gkX + ',' + c.gkZ + ')  ' +
        String(c.gkEstado).padEnd(11) + ' ' + c.causa);
}
