/*
DEPOIS DA MATADA NO PEITO, DE QUEM FICA A BOLA?

Para cada matada: quem a fez, a TECNICA dele, o adversario mais perto no
instante do toque (pressao), e quem ficou com a bola a seguir — ele proprio, um
companheiro ou um adversario — e quanto tempo depois.

Uso: node tools/scratch/peito_dominio.js [segundos]
*/
const segundos = Number(process.argv[2] || 2400);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260916));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const eventos = [];
let pendente = null;
const origControlar = FootballPlayer.prototype.controlarNoPeito;
FootballPlayer.prototype.controlarNoPeito = function (altura) {
    const adversarios = (this.team === 'TeamA') ? Match.opponents : Match.players;
    let dMin = 999;
    for (const o of adversarios) {
        if (o.role === 'gk') continue;
        dMin = Math.min(dMin, o.model.position.distanceTo(this.model.position));
    }
    pendente = { quem: this, tec: this.skillFor('TEC'), pressao: dMin, t: 0, altura: altura,
        p0: null, percorrido: 0, ressaltos: 0, yMax: 0, noChaoAnt: false, ultima: null };
    return origControlar.call(this, altura);
};

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (pendente) {
        pendente.t += dt;
        // A bola so anda depois de ser largada do peito (peitoCola).
        if (pendente.quem.peitoCola <= 0) {
            const b = Match.ball.position;
            if (!pendente.p0) pendente.p0 = b.clone();
            if (pendente.ultima) pendente.percorrido += pendente.ultima.distanceTo(b);
            pendente.ultima = b.clone();
            pendente.yMax = Math.max(pendente.yMax, b.y);
            // Distancia ao jogador, ANTES de a posse lha colar ao pe.
            // HORIZONTAL, e so depois de a bola chegar ao chao: enquanto voa,
            // a distancia e quase toda altura e nao diz nada.
            if (b.y <= BallPhysics.raio * 1.5) {
                const dxh = pendente.quem.model.position.x - b.x;
                const dzh = pendente.quem.model.position.z - b.z;
                const dh = Math.hypot(dxh, dzh);
                if (pendente.distNoChao === undefined) pendente.distNoChao = dh;
                if (dh > (pendente.distMax || 0)) pendente.distMax = dh;
            }
            const noChao = b.y <= BallPhysics.raio * 1.5;
            if (noChao && !pendente.noChaoAnt) pendente.ressaltos++;
            pendente.noChaoAnt = noChao;
        }
        const dono = Match.ballCarrier;
        if (dono) {
            eventos.push({
                tec: pendente.tec, pressao: pendente.pressao, t: pendente.t,
                percorrido: pendente.percorrido, ressaltos: pendente.ressaltos,
                distMax: pendente.distMax || 0, distNoChao: pendente.distNoChao,
                afastou: pendente.p0 ? pendente.p0.distanceTo(Match.ball.position) : 0,
                desfecho: (dono === pendente.quem) ? 'ele'
                    : (dono.team === pendente.quem.team) ? 'companheiro' : 'adversario'
            });
            pendente = null;
        } else if (pendente.t > 4) {
            eventos.push({ tec: pendente.tec, pressao: pendente.pressao, t: pendente.t, desfecho: 'ninguem' });
            pendente = null;
        }
    }
}

function resumo(nome, lista) {
    if (!lista.length) { console.log(nome + ': sem amostras'); return; }
    const conta = {};
    for (const e of lista) conta[e.desfecho] = (conta[e.desfecho] || 0) + 1;
    const tMed = lista.reduce((a, e) => a + e.t, 0) / lista.length;
    const partes = Object.keys(conta).sort().map(k => k + ' ' + (100 * conta[k] / lista.length).toFixed(0) + '%');
    const m = (f) => lista.reduce((a, e) => a + (f(e) || 0), 0) / lista.length;
    console.log(nome.padEnd(22) + String(lista.length).padStart(4) + ' matadas | ' + partes.join('  ') +
        ' | recupera em ' + tMed.toFixed(2) + ' s | bola percorre ' + m(e => e.percorrido).toFixed(2) +
        ' m | ao tocar o chao fica a ' + m(e => e.distNoChao).toFixed(2) + ' m do pe (max ' +
        m(e => e.distMax).toFixed(2) + ') | ressaltos ' + m(e => e.ressaltos).toFixed(1));
}
console.log(eventos.length + ' matadas no peito em ' + (segundos / 60).toFixed(0) + ' min');
resumo('todas', eventos);
resumo('sem pressao (>4 m)', eventos.filter(e => e.pressao > 4));
resumo('com pressao (<=4 m)', eventos.filter(e => e.pressao <= 4));
resumo('TEC >= 70, livre', eventos.filter(e => e.pressao > 4 && e.tec >= 70));
