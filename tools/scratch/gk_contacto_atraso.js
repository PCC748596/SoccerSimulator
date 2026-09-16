/*
QUANTO \u00c9 QUE A BOLA J\u00c1 TINHA PASSADO quando o contacto do guarda-redes e
detectado. Mede, por defesa, a distancia entre onde a bola estava no fim do
frame e o ponto do trajecto em que a mao lhe tocou.
*/
const segundos = Number(process.argv[2] || 1200);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 31337));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

// Embrulha o `defender` para medir sem mexer no jogo.
const original = GkDive.defender.bind(GkDive);
const amostras = [];
GkDive.defender = function (p, rig) {
    const antes = p.dive ? p.dive.tocou : true;
    const bAntes = Match.ball.position.clone();
    original(p, rig);
    const depois = p.dive ? p.dive.tocou : true;
    if (!antes && depois) {
        // O `defender` repoe a bola no ponto do contacto: a diferenca e o
        // quanto ela ja tinha passado.
        amostras.push(bAntes.distanceTo(Match.ball.position));
    }
};

const gks = () => Match.players.concat(Match.opponents).filter(p => p.role === 'gk');
for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

if (!amostras.length) { console.log('nenhuma defesa medida'); }
else {
    amostras.sort((a, b) => a - b);
    const soma = amostras.reduce((a, b) => a + b, 0);
    console.log(amostras.length + ' defesas | recuo medio ' + (soma / amostras.length).toFixed(2) +
        ' m | mediana ' + amostras[Math.floor(amostras.length / 2)].toFixed(2) +
        ' m | maximo ' + amostras[amostras.length - 1].toFixed(2) + ' m');
    console.log('  acima de 0.20 m: ' + amostras.filter(v => v > 0.2).length +
        ' | acima de 0.40 m: ' + amostras.filter(v => v > 0.4).length);
}
