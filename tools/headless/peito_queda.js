/*
A MATADA NO PEITO: ONDE A BOLA CAI, E DE QUEM FICA.

Relato: "praticamente nenhuma matada no peito a bola cai na frente do jogador
que matou a bola; normalmente a bola vai pra longe".

O modelo diz 0.35 m (TEC 100) a 1.6 m (TEC 0) à frente — ver quedaNoPeito e
BallControl.peitoQueda*. Aqui mede-se o que acontece MESMO: a que distância do
peito a bola toca o chão, onde ela para, e quem lhe toca a seguir.

Uso: node tools/headless/peito_queda.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 900);
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

const lances = [];
let lance = null;
{
    const orig = FootballPlayer.prototype.controlarNoPeito;
    FootballPlayer.prototype.controlarNoPeito = function (altura) {
        const r = orig.apply(this, arguments);
        lance = {
            p: this, tec: this.skillFor('TEC'),
            x0: this.model.position.x, z0: this.model.position.z,
            distChao: null, distParada: null, quem: null, t: 0,
            largou: false
        };
        lances.push(lance);
        return r;
    };
    const larg = FootballPlayer.prototype.largarDoPeito;
    FootballPlayer.prototype.largarDoPeito = function () {
        const r = larg.apply(this, arguments);
        if (lance && lance.p === this) lance.largou = true;
        return r;
    };
}

const dist = (l) => Math.hypot(Match.ball.position.x - l.p.model.position.x,
    Match.ball.position.z - l.p.model.position.z);

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (!lance) continue;
    lance.t += dt;

    // Primeiro toque no relvado depois de largada.
    if (lance.largou && lance.distChao === null && Match.ball.position.y <= BallPhysics.raio + 0.02) {
        lance.distChao = dist(lance);
    }
    // Quem lhe toca a seguir (ou onde ela pára).
    if (Match.ballCarrier && Match.ballCarrier !== lance.p) {
        lance.quem = (Match.ballCarrier.team === lance.p.team) ? 'companheiro' : 'adversario';
        lance.distParada = dist(lance);
        lance = null;
    } else if (Match.ballCarrier === lance.p && lance.t > 0.2) {
        lance.quem = 'ele proprio';
        lance.distParada = dist(lance);
        lance = null;
    } else if (lance.t > 4) {
        lance.quem = 'ninguem em 4 s';
        lance.distParada = dist(lance);
        lance = null;
    }
}

const med = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : '-';
const feitos = lances.filter(l => l.quem);
console.log(`\n${(Match.tempoDeJogo / 60).toFixed(0)} min | ${lances.length} matadas no peito | ${feitos.filter(l => l.largou).length} chegaram a largar a bola`);
console.log(`distancia do peito quando a bola toca o chao: ${med(feitos.map(l => l.distChao).filter(v => v !== null))} m (modelo: 0.35 a 1.6)`);
console.log(`distancia quando o lance acaba:               ${med(feitos.map(l => l.distParada))} m`);
const quem = {};
for (const l of feitos) quem[l.quem] = (quem[l.quem] || 0) + 1;
console.log('fica com ela:', Object.entries(quem).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  '));
const longe = feitos.filter(l => l.distParada > 3);
console.log(`acabam a mais de 3 m do peito: ${longe.length}/${feitos.length} (${(100 * longe.length / Math.max(1, feitos.length)).toFixed(0)}%)`);
