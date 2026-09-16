/*
O GUARDA-REDES AGARROU UMA BOLA ATRASADA PELO PE DE UM COMPANHEIRO?

Relato: *"o goleiro nao pode pegar com a mao uma bola atrasada pelo jogador do
proprio time com o pe"* (Lei 12). Ver `avaliarRecuoParaGR` (utils.js) e
GkRecuoModel (config/goalkeeper.js).

Segue o ultimo toque de cada bola agarrada com a mao: de que equipa era quem
tocou, com que parte do corpo, e quanto a bola andou desde esse toque.

A MEMORIA DESTE MEDIDOR E PROPRIA — nao le o `Match.ultimoToque`, que e
justamente o que se esta a testar. Por isso ela discorda do motor de vez em
quando (a atribuicao aqui e mais grosseira: o `deflectBall` e os remates tambem
escrevem o `lastTouchedPlayer`), e e por isso que a linha que interessa e a
ULTIMA: o contador de bloqueios le o mesmo valor que a guarda do `grabBall` le,
no mesmo instante. Essa e a prova; o resto e contexto.

Uso: node tools/scratch/recuo_gk.js [segundos]
*/
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let ultimo = null;   // { p, team, parte, z0, dirZ }
function marcar(p, parte) {
    if (!p || !p.model) return;
    ultimo = {
        p: p, team: p.team, parte: parte, dirZ: p.dirZ,
        z0: Match.ball ? Match.ball.position.z : 0
    };
}

const FootballPlayer = Object.getPrototypeOf(Match.players[1]).constructor;

/*
A cabeca e o peito DEVOLVEM as maos, portanto tem de sobrescrever a marca do pe
— e depois de o original correr, senao a ordem entre os dois hooks troca a
atribuicao (foi um erro desta ferramenta).
*/
for (const [nome, parte] of [['executeHeader', 'cabeca'], ['controlarNoPeito', 'peito']]) {
    const orig = FootballPlayer.prototype[nome];
    if (!orig) continue;
    FootballPlayer.prototype[nome] = function (...a) {
        const r = orig.apply(this, a);
        marcar(this, parte);
        return r;
    };
}

const origContacto = Match.resolveBallContact;
Match.resolveBallContact = function () {
    const antes = this.lastTouchedPlayer;
    const r = origContacto.call(this);
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

    // A PROVA: a guarda do grabBall le exactamente este valor, neste instante.
    if (this.role === 'gk' && marcaAntes === equipa) {
        if (r === false) bloqueios++; else passou++;
    }

    if (r !== false && this.role === 'gk' && ultimo) {
        agarradas.push({
            mesmaEquipa: ultimo.team === this.team,
            parte: ultimo.parte,
            recuo: (Match.ball.position.z - ultimo.z0) * ultimo.dirZ,
            marcado: Match.recuoParaGR
        });
    }
    return r;
};

const segundos = Number(process.argv[2] || 1800);
for (let i = 0; i < segundos / dt; i++) Match.update(dt);

console.log(agarradas.length + ' bolas agarradas com a mao em ' +
    (segundos / 60).toFixed(0) + ' min');
for (const a of agarradas.filter(a => a.mesmaEquipa && a.parte === 'pe')) {
    console.log('  [companheiro/pe] deslocamento ' + a.recuo.toFixed(2) +
        ' m | recuoParaGR=' + a.marcado);
}
const porParte = {};
agarradas.forEach(a => {
    const k = (a.mesmaEquipa ? 'companheiro/' : 'adversario/') + a.parte;
    porParte[k] = (porParte[k] || 0) + 1;
});
console.log('  todas, por origem: ' + JSON.stringify(porParte));
console.log('  GUARDA DA LEI 12: ' + bloqueios + ' tentativas BLOQUEADAS, ' +
    passou + ' passaram (tem de ser 0)');
