/*
RECUO PARA O GUARDA-REDES: quantas bolas ele agarra que já não podia.

A Lei 12 está metade escrita no jogo — `Match.recuoParaGR` só é marcado quando
o passe foi ENDEREÇADO ao guarda-redes (`p.passTarget.role === 'gk'`). Um
alívio, um passe atrasado para um espaço, um toque que sobra para trás: o pé foi
do companheiro na mesma, mas a marca não aparece e o `grabBall` deixa passar.

Mede: de todas as bolas agarradas com a mão, quantas vinham do PÉ de um
companheiro sem ninguém lhe ter tocado no meio.

Uso: node tools/headless/recuo_gk.js [segundos] [semente]
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

/*
O ÚLTIMO TOQUE, e COM QUÊ. O jogo não guarda isto: `lastTouchedPlayer` diz
quem, não com que parte do corpo — e é a parte do corpo que a regra separa.
*/
let ultimo = null;
const marcar = (p, como) => {
    if (!p) return;
    ultimo = {
        p: p, como: como, t: Match.tempoDeJogo,
        // Onde a bola estava quando ele lhe tocou — é contra isto que se mede
        // se ela foi jogada para TRÁS.
        z0: Match.ball.position.z, x0: Match.ball.position.x
    };
};

{
    const orig = global.executePassGameplay;
    global.executePassGameplay = function (p) {
        // O passe (e o alívio, que passa por aqui) é jogado com o pé.
        marcar(p, (p.role === 'gk') ? 'pe do proprio GK' : 'pe');
        return orig.apply(this, arguments);
    };
    const proto = FootballPlayer.prototype;
    for (const [nome, como] of [['initiateShoot', 'pe'], ['executeHeader', 'cabeca'],
    ['controlarNoPeito', 'peito'], ['lancarLateral', 'lancamento']]) {
        if (typeof proto[nome] !== 'function') continue;
        const of = proto[nome];
        proto[nome] = function () { marcar(this, como); return of.apply(this, arguments); };
    }
}

const agarradas = [];
{
    const og = FootballPlayer.prototype.grabBall;
    FootballPlayer.prototype.grabBall = function (manterPose) {
        const r = og.apply(this, arguments);
        if (r !== false) {
            agarradas.push({
                gk: this,
                de: ultimo ? ultimo.p : null,
                como: ultimo ? ultimo.como : '?',
                mesmoTime: !!(ultimo && ultimo.p && ultimo.p.team === this.team),
                foiOProprio: !!(ultimo && ultimo.p === this),
                marcado: maosProibidasNoRecuo(Match.recuoParaGR, this.team),
                // Avanço da bola desde o toque, no referencial de ataque de
                // quem tocou: negativo = bola atrasada.
                avanco: ultimo ? (Match.ball.position.z - ultimo.z0) * ultimo.p.dirZ : 0,
                // O que o JOGO acha, ao lado do que a medicao ve.
                jogoToque: Match.ultimoToque ? `${Match.ultimoToque.team} z0=${Match.ultimoToque.z0.toFixed(1)}` : 'nenhum',
                bolaZ: Match.ball.position.z
            });
        }
        return r;
    };
}

// Um toque de outra pessoa apaga a memória do recuo, tal como no jogo.
{
    const orig = Match.resolveBallContact.bind(Match);
    Match.resolveBallContact = function () {
        const antes = Match.ballCarrier;
        const r = orig();
        const agora = Match.ballCarrier;
        if (agora && agora !== antes && (!ultimo || agora !== ultimo.p)) {
            // Dominou com o pé/corpo: passa a ser ele o último toque.
            marcar(agora, 'dominio');
        }
        return r;
    };
}

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

const doCompanheiro = agarradas.filter(a => a.mesmoTime && !a.foiOProprio);
const comPe = doCompanheiro.filter(a => (a.como === 'pe' || a.como === 'dominio') && a.avanco < -1.0);
console.log(`\n${(Match.tempoDeJogo / 60).toFixed(0)} min | ${agarradas.length} bolas agarradas com a mao`);
const porComo = {};
for (const a of agarradas) porComo[`${a.mesmoTime ? 'companheiro' : 'adversario/ninguem'}/${a.como}`] =
    (porComo[`${a.mesmoTime ? 'companheiro' : 'adversario/ninguem'}/${a.como}`] || 0) + 1;
console.log('origem do ultimo toque:', Object.entries(porComo).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  '));
console.log(`\nvinham do PE de um companheiro: ${comPe.length} (${(100 * comPe.length / Math.max(1, agarradas.length)).toFixed(0)}%)`);
console.log(`dessas, marcadas como recuo pelo jogo: ${comPe.filter(a => a.marcado).length}`);
for (const a of comPe.filter(x => !x.marcado)) {
    console.log(`  ESCAPOU: ultimo toque ${a.de.pos} (${a.como}) do ${a.de.team}, bola andou ${a.avanco.toFixed(1)} m para tras | GK ${a.gk.team} | jogo: ${a.jogoToque}, bola z=${a.bolaZ.toFixed(1)}`);
}
