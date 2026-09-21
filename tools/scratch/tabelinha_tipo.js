/*
DE QUE TIPO E O PRIMEIRO TOQUE DA TABELINHA.

Pedido: *"tabelas tem que ser com passes into space e nao passes diretos"*.
Conta os tipos usados nos dois tempos da jogada.
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

const inicio = new Map(), devolucao = new Map();
let antesTab = 0;
const conta = (m, k) => m.set(k, (m.get(k) || 0) + 1);

const origIni = Object.getPrototypeOf(Match.players[0]).initiatePass;
Object.getPrototypeOf(Match.players[0]).initiatePass = function (alvo) {
    // O pedido acabado de criar marca o primeiro toque da tabelinha.
    if (this.esperarDevolucao && this.esperarDevolucao.timer > 0 &&
        MatchStats[this.team].tabelinhas > antesTab) {
        antesTab = MatchStats[this.team].tabelinhas;
        conta(inicio, this.passTipo || 'direct');
    } else if (this._eraDevolucao) {
        conta(devolucao, this.passTipo || 'direct');
        this._eraDevolucao = false;
    }
    return origIni.apply(this, arguments);
};

for (let i = 0; i < Math.round(segundos / dt); i++) {
    for (const p of Match.players.concat(Match.opponents)) {
        p._eraDevolucao = !!(p.devolverPara && p.devolverPara.timer > 0);
    }
    Match.update(dt);
}

const most = (m, t) => {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    console.log(t + '  (' + total + ')');
    if (!total) { console.log('   nenhum'); return; }
    for (const [k, n] of [...m.entries()].sort((a, b) => b[1] - a[1])) {
        console.log('   ' + String(k).padEnd(10) + String(n).padStart(4) + '  ' +
            (100 * n / total).toFixed(0) + '%');
    }
};
most(inicio, 'PRIMEIRO TOQUE da tabelinha:');
most(devolucao, 'DEVOLUCAO:');
