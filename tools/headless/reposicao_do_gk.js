/*
A REPOSIÇÃO DO GUARDA-REDES: espera por uma boa opção, ou larga por largar?

Pedido: "após o goleiro pegar a bola ele tem que esperar até 8 s para repor,
aguardando que seus companheiros estejam numa posição boa para o passe; caso não
estejam, ele deve chutar pra frente".

Mede, por posse de mão: quanto tempo segurou, como largou (lançamento ou
chutão), e a QUALIDADE da opção escolhida — a que distância estava o adversário
mais próximo do destinatário, e se a equipa ficou com a bola 3 s depois.

Uso: node tools/headless/reposicao_do_gk.js [segundos] [semente]
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

const posses = [];
let actual = null;

const marcadorMaisPerto = (p) => {
    if (!p || !p.model) return -1;
    const rivais = (p.team === 'TeamA') ? Match.opponents : Match.players;
    let d = Infinity;
    for (const o of rivais) {
        if (!o || o.role === 'gk' || !o.model) continue;
        d = Math.min(d, o.model.position.distanceTo(p.model.position));
    }
    return d;
};

{
    const orig = FootballPlayer.prototype.releaseFromHands;
    FootballPlayer.prototype.releaseFromHands = function (alvo) {
        if (actual && actual.gk === this) {
            actual.como = 'lancamento';
            actual.alvo = alvo || null;
            actual.marcador = marcadorMaisPerto(alvo);
            actual.dist = (alvo && alvo.model) ? this.model.position.distanceTo(alvo.model.position) : -1;
            actual.avanco = (alvo && alvo.model) ? (alvo.model.position.z - this.model.position.z) * this.dirZ : 0;
        }
        return orig.apply(this, arguments);
    };
    const punt = FootballPlayer.prototype.puntBall;
    FootballPlayer.prototype.puntBall = function () {
        if (actual && actual.gk === this) { actual.como = actual.como || 'chutao'; }
        return punt.apply(this, arguments);
    };
    const grab = FootballPlayer.prototype.grabBall;
    FootballPlayer.prototype.grabBall = function () {
        const r = grab.apply(this, arguments);
        if (r !== false && this.role === 'gk') {
            actual = { gk: this, t: 0, como: null, alvo: null, marcador: -1, fim: null, dur: this.gkSegurarDur };
            posses.push(actual);
        }
        return r;
    };
}

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (!actual) continue;
    actual.t += dt;
    if (actual.como && actual.fim === null) {
        actual.tLargou = actual.t;
        actual.fim = 0;
    }
    if (actual.fim !== null) {
        actual.fim += dt;
        if (actual.fim > 3.0) {
            actual.posse = Match.possessionTeam === actual.gk.team;
            actual = null;
        }
    } else if (actual.t > 15) actual = null;
}

const feitas = posses.filter(p => p.como && p.posse !== undefined);
const med = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : '-';
console.log(`\n${(Match.tempoDeJogo / 60).toFixed(0)} min | ${posses.length} posses de mão | ${feitas.length} com desfecho medido`);
const porComo = {};
for (const p of feitas) porComo[p.como] = (porComo[p.como] || 0) + 1;
console.log('como repôs:', Object.entries(porComo).map(([k, v]) => `${k} ${v}`).join('  '));
console.log(`tempo a segurar: ${med(feitas.map(p => p.tLargou))} s (prazo sorteado: ${med(feitas.map(p => p.dur))} s)`);
const lanc = feitas.filter(p => p.como === 'lancamento');
console.log(`lançamentos: ${lanc.length} | marcador mais perto do destinatário: ${med(lanc.map(p => p.marcador))} m`);
console.log(`  distancia do lançamento: ${med(lanc.map(p => p.dist))} m (maior ${Math.max(...lanc.map(p => p.dist)).toFixed(1)})`);
console.log(`  avanço do destinatário:  ${med(lanc.map(p => p.avanco))} m`);
console.log(`  com o destinatário MARCADO (adversário a menos de 5 m): ${lanc.filter(p => p.marcador >= 0 && p.marcador < 5).length}`);
console.log('tempos por episodio:', feitas.map(p => `${p.tLargou.toFixed(1)}s/${p.como[0]}`).join(' '));
console.log(`posse da equipa 3 s depois: ${(100 * feitas.filter(p => p.posse).length / Math.max(1, feitas.length)).toFixed(0)}%`);
for (const k of Object.keys(porComo)) {
    const g = feitas.filter(p => p.como === k);
    console.log(`  ${k}: ${(100 * g.filter(p => p.posse).length / g.length).toFixed(0)}% de posse mantida`);
}
