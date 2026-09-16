/*
O GUARDA-REDES AGARROU UMA BOLA ATRASADA PELO PE DE UM COMPANHEIRO?

Segue o ultimo toque de cada bola agarrada com a mao: quem tocou, de que equipa,
com que parte do corpo, e quanto a bola andou para TRAS desde esse toque.

Uso: node tools/scratch/_recuo_gk.js [segundos]
*/
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

/*
A memoria propria deste medidor, para nao depender da que se esta a testar:
regista TODOS os toques, com a parte do corpo.
*/
let ultimo = null;   // { p, team, parte, z0, dirZ }
function marcar(p, parte) {
    if (!p || !p.model) return;
    ultimo = { p: p, team: p.team, parte: parte, dirZ: p.dirZ,
        z0: Match.ball ? Match.ball.position.z : 0 };
}

const FootballPlayer = Object.getPrototypeOf(Match.players[1]).constructor;
for (const [nome, parte] of [['executeHeader', 'cabeca'], ['controlarNoPeito', 'peito']]) {
    const orig = FootballPlayer.prototype[nome];
    if (!orig) continue;
    FootballPlayer.prototype[nome] = function (...a) { const r = orig.apply(this, a); marcar(this, parte); return r; };
}
const origPe = Match.resolveBallContact;
Match.resolveBallContact = function () {
    const antes = this.lastTouchedPlayer;
    const r = origPe.call(this);
    if (this.lastTouchedPlayer && this.lastTouchedPlayer !== antes &&
        (!ultimo || ultimo.p !== this.lastTouchedPlayer)) {
        marcar(this.lastTouchedPlayer, 'pe');
    }
    return r;
};

const agarradas = [];
let bloqueios = 0, passou = 0;
const origGrab = FootballPlayer.prototype.grabBall;
FootballPlayer.prototype.grabBall = function (...a) {
    const marcaAntes = Match.recuoParaGR, equipa = this.team;
    const r = origGrab.apply(this, a);
    if (this.role === 'gk' && marcaAntes === equipa) {
        if (r === false) bloqueios++; else passou++;
    }
    if (r !== false && this.role === 'gk' && ultimo) {
        const recuo = (Match.ball.position.z - ultimo.z0) * ultimo.dirZ;
        agarradas.push({
            mesmaEquipa: ultimo.team === this.team,
            parte: ultimo.parte,
            recuo: recuo,
            marcado: Match.recuoParaGR
        });
    }
    return r;
};

for (let i = 0; i < (Number(process.argv[2] || 1800)) / dt; i++) Match.update(dt);

console.log(agarradas.length + ' bolas agarradas com a mao em ' +
    (Number(process.argv[2] || 1800) / 60).toFixed(0) + ' min');
const ilegais = agarradas.filter(a => a.mesmaEquipa && a.parte === 'pe' && a.recuo < -1.0);
console.log('  vindas do PE de um companheiro, jogadas para TRAS (>1 m): ' + ilegais.length +
    '   <- estas sao infraccao');
for (const a of ilegais) {
    console.log('     recuo ' + a.recuo.toFixed(1) + ' m | Match.recuoParaGR no instante: ' + a.marcado);
}
for (const a of agarradas.filter(a => a.mesmaEquipa && a.parte === 'pe')) {
    console.log('  [companheiro/pe] recuo ' + a.recuo.toFixed(2) +
        ' m | recuoParaGR=' + a.marcado);
}
const porParte = {};
agarradas.forEach(a => {
    const k = (a.mesmaEquipa ? 'companheiro/' : 'adversario/') + a.parte;
    porParte[k] = (porParte[k] || 0) + 1;
});
console.log('  todas, por origem: ' + JSON.stringify(porParte));
console.log('  guarda da Lei 12: ' + bloqueios + ' tentativas de agarrar BLOQUEADAS, ' +
    passou + ' passaram (tem de ser 0)');
