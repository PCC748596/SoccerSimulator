/*
O GUARDA-REDES CHEGA À BOLA?

Os golos do headless entram a ~2.4 m do eixo e a 0.6 m de altura — o canto
baixo de um remate de 16-20 m — com o guarda-redes a 5.4 m da bola no instante
em que ela passa a linha. Ou ele decide tarde, ou decide para o lado errado, ou
o mergulho não anda o que tem de andar.

Mede, por remate que vai à baliza: quanto tempo ele teve, quantos metros de
lado precisava, quantos andou mesmo, e a que distância a mão mais perto passou
da bola.

Uso: node tools/headless/gk_defesa.js [segundos] [semente]
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
const _v = new THREE.Vector3();

const gkDefensor = () => {
    // Quem defende é o guarda-redes da baliza para onde a bola vai.
    if (Match.ballVel.z < -1) return Match.players[0];
    if (Match.ballVel.z > 1) return Match.opponents[0];
    return null;
};

const distMaoBola = (gk) => {
    if (!gk || !gk.rig) return Infinity;
    let melhor = Infinity;
    for (const nome of ['lHand', 'rHand']) {
        const mao = gk.rig[nome];
        if (!mao) continue;
        mao.getWorldPosition(_v);
        melhor = Math.min(melhor, _v.distanceTo(Match.ball.position));
    }
    return melhor;
};

// Um lance começa quando alguém remata (o tipoDeRemate corre uma vez por remate).
{
    const orig = global.tipoDeRemate;
    global.tipoDeRemate = function (o) {
        const t = orig(o);
        const p = Match.ballCarrier || Match.lastTouchedPlayer;
        const gk = p ? ((p.team === 'TeamA') ? Match.opponents[0] : Match.players[0]) : null;
        lance = {
            tipo: t,
            gk: gk,
            dist: p ? Math.hypot(p.model.position.x, p.dirZ * (CAMPO_COMP / 2) - p.model.position.z) : -1,
            gkX0: gk ? gk.model.position.x : 0,
            lateralPedido: null,
            andado: null,
            tempoDeVoo: 0,
            minMao: Infinity,
            estado: null,
            reagiuEm: null,
            desfecho: 'perdido'
        };
        lances.push(lance);
        return t;
    };
}

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (!lance) continue;

    const gk = lance.gk;
    if (!gk) { lance = null; continue; }

    lance.tempoDeVoo += dt;
    lance.minMao = Math.min(lance.minMao, distMaoBola(gk));

    // O instante em que ele decide: o alvo lateral aparece com o estado.
    if (lance.lateralPedido === null && (gk.gkEstado === 'mergulho' || gk.gkEstado === 'maos')) {
        lance.estado = gk.gkEstado;
        lance.reagiuEm = lance.tempoDeVoo;
        lance.lateralPedido = Math.abs((gk.gkAlvoX || 0) - gk.model.position.x);
        lance.xNaDecisao = gk.model.position.x;
    }

    const passouALinha = Math.abs(Match.ball.position.z) > CAMPO_COMP / 2 - 0.2;
    const parou = Match.ballVel.lengthSq() < 1.0;
    if (passouALinha || parou || lance.tempoDeVoo > 4) {
        if (lance.lateralPedido !== null) lance.andado = Math.abs(gk.model.position.x - lance.xNaDecisao);
        lance.desfecho = (Match.state === 'GOAL') ? 'golo'
            : (gk.hasBall || gk.gkEstado === 'segurando') ? 'agarrou'
                : (lance.minMao < 0.5) ? 'tocou' : 'nao chegou';
        lance = null;
    }
}

const med = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : NaN;
const f = (a) => isNaN(med(a)) ? '-' : med(a).toFixed(2);

const comGK = lances.filter(l => l.lateralPedido !== null);
console.log(`\n${(Match.tempoDeJogo / 60).toFixed(0)} min | ${lances.length} remates | ${comGK.length} com reacção do guarda-redes`);

const porDesfecho = {};
for (const l of lances) porDesfecho[l.desfecho] = (porDesfecho[l.desfecho] || 0) + 1;
console.log('desfechos:', Object.entries(porDesfecho).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  '));

const linha = (nome, ls) => {
    if (!ls.length) return;
    console.log(`${nome.padEnd(12)} n=${String(ls.length).padStart(3)} | reage em ${f(ls.map(l => l.reagiuEm))} s | ` +
        `precisa ${f(ls.map(l => l.lateralPedido))} m de lado | andou ${f(ls.map(l => l.andado))} m | ` +
        `mão a ${f(ls.map(l => l.minMao))} m da bola | remate de ${f(ls.map(l => l.dist))} m`);
};
console.log('');
linha('golos', lances.filter(l => l.desfecho === 'golo'));
linha('agarrou', lances.filter(l => l.desfecho === 'agarrou'));
linha('tocou', lances.filter(l => l.desfecho === 'tocou'));
linha('nao chegou', lances.filter(l => l.desfecho === 'nao chegou'));
linha('TODOS', lances);

const mergulho = comGK.filter(l => l.estado === 'mergulho');
const maos = comGK.filter(l => l.estado === 'maos');
console.log(`\nestado escolhido: mergulho ${mergulho.length} | maos ${maos.length}`);
console.log(`golos com mergulho: ${mergulho.filter(l => l.desfecho === 'golo').length}/${mergulho.length} | ` +
    `golos com maos: ${maos.filter(l => l.desfecho === 'golo').length}/${maos.length}`);
