/*
EM QUE DIRECCAO E QUE O CARRINHO E DADO.

Relato: *"os jogadores estao dando o carrinho em uma direccao estranha. O
carrinho deve sempre ser dado na direccao perpendicular a direccao da bola para
o gol, tentando cortar a linha de ataque. (...) A nao ser um carrinho de frente
num angulo de ate uns 30 graus para cada lado da direccao do atacante."*

Mede, no instante em que o estado SLIDE_TACKLE arranca:
  angGol  = angulo entre a direccao do deslize e a linha BOLA->BALIZA atacada
            (0 = paralelo a linha de ataque, 90 = a cortar)
  angFren = angulo entre o deslize e a direccao do ATACANTE, com sinal
            invertido (0 = carrinho de frente para ele)
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

const GRAU = 180 / Math.PI;
const casos = [];
const _f = new THREE.Vector3();

const um = Match.players[0];
const FSM = Object.getPrototypeOf(um.fsm);
const orig = FSM.changeState;
FSM.changeState = function (novo) {
    const antes = this.currentState;
    const r = orig.call(this, novo);
    if (novo !== 'SLIDE_TACKLE' || antes === 'SLIDE_TACKLE') return r;
    const p = this.p;
    if (!p || !p.model) return r;

    // Direccao do deslize: a frente do modelo (e o que o case usa).
    _f.set(0, 0, 1).applyQuaternion(p.model.quaternion);
    const dx = _f.x, dz = _f.z;
    const nd = Math.hypot(dx, dz) || 1;

    const alvo = Match.ballCarrier;
    // Linha BOLA -> BALIZA que o atacante ataca.
    const golZ = alvo ? alvo.targetGoalZ : -p.targetGoalZ;
    const b = Match.ball.position;
    const gx = 0 - b.x, gz = golZ - b.z;
    const ng = Math.hypot(gx, gz) || 1;
    const cosGol = (dx * gx + dz * gz) / (nd * ng);
    // Dobrado para 0..90: paralelo e paralelo, venha de que lado vier.
    const angGol = Math.acos(Math.min(1, Math.abs(cosGol))) * GRAU;

    let angFren = null;
    if (alvo) {
        let ax, az;
        if (alvo.velocity && alvo.velocity.lengthSq() > 0.1) { ax = alvo.velocity.x; az = alvo.velocity.z; }
        else { const q = new THREE.Vector3(0, 0, 1).applyQuaternion(alvo.model.quaternion); ax = q.x; az = q.z; }
        const na = Math.hypot(ax, az) || 1;
        // Carrinho de FRENTE = deslize contra a direccao do atacante.
        const cosF = (dx * -ax + dz * -az) / (nd * na);
        angFren = Math.acos(Math.max(-1, Math.min(1, cosF))) * GRAU;
    }
    casos.push({ angGol, angFren });
    return r;
};

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

if (!casos.length) { console.log('sem carrinhos'); process.exit(0); }
const comAlvo = casos.filter(c => c.angFren !== null);
const med = (l, f) => l.reduce((a, c) => a + f(c), 0) / l.length;
const pct = (l, f) => (100 * l.filter(f).length / l.length).toFixed(0) + '%';

console.log(casos.length + ' carrinhos (' + comAlvo.length + ' com portador)\n');
console.log('ANGULO COM A LINHA BOLA->BALIZA (90 = a cortar a linha de ataque):');
console.log('   media ' + med(casos, c => c.angGol).toFixed(0) + ' graus');
for (const [lo, hi] of [[0, 15], [15, 30], [30, 45], [45, 60], [60, 75], [75, 90]]) {
    const n = casos.filter(c => c.angGol >= lo && c.angGol < hi + (hi === 90 ? 0.01 : 0)).length;
    console.log('   ' + String(lo).padStart(2) + '-' + String(hi).padStart(2) + ' graus  ' +
        String(n).padStart(4) + '  ' + '#'.repeat(Math.round(40 * n / casos.length)));
}
console.log('\n   quase PARALELOS a linha de ataque (<30 graus): ' +
    pct(casos, c => c.angGol < 30));
console.log('   a CORTAR mesmo (>60 graus):                    ' +
    pct(casos, c => c.angGol > 60));

if (comAlvo.length) {
    console.log('\nCARRINHO DE FRENTE (angulo com a direccao do atacante):');
    console.log('   ate 30 graus (frontal, permitido):  ' + pct(comAlvo, c => c.angFren <= 30));
    console.log('   31-90 graus:                        ' +
        pct(comAlvo, c => c.angFren > 30 && c.angFren <= 90));
    console.log('   mais de 90 (por tras):              ' + pct(comAlvo, c => c.angFren > 90));
}

// E O QUE ELES RENDEM: sem isto, mudar a direccao podia matar o carrinho sem
// se dar por ela.
let tent = 0, suc = 0;
for (const t of ['TeamA', 'TeamB']) {
    if (MatchStats[t] && MatchStats[t].carrinhos) {
        tent += MatchStats[t].carrinhos.tentados;
        suc += MatchStats[t].carrinhos.sucesso;
    }
}
console.log(String.fromCharCode(10) + 'EFICACIA: ' + suc + ' de ' + tent + ' carrinhos ' +
    (tent ? '(' + (100 * suc / tent).toFixed(0) + '%)' : ''));
