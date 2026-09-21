/*
A ANIMACAO APONTA PARA ONDE A BOLA SAI?

Pedido: *"o giro e justamente para que a animacao fique coerente com a direccao
do passe. Nao adianta a animacao estar para um lado e o passe para o outro"*.

Mede, no instante em que a bola SAI do pe, o angulo entre a FRENTE DO CORPO e a
direccao da bola. O giro e feito por slerp durante o gesto (case 'PASS' no
fsm.js), portanto so a medicao em jogo diz se ele chega a tempo.
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

const orig = global.executePassGameplay;
global.executePassGameplay = function (p) {
    _f.set(0, 0, 1).applyQuaternion(p.model.quaternion);
    const fx = _f.x, fz = _f.z;
    const r = orig.apply(this, arguments);
    const bx = Match.ballVel.x, bz = Match.ballVel.z;
    const nb = Math.hypot(bx, bz), nf = Math.hypot(fx, fz);
    if (nb < 0.5 || nf < 1e-6) return r;
    const ang = Math.acos(Math.max(-1, Math.min(1, (fx * bx + fz * bz) / (nf * nb)))) * GRAU;
    casos.push({ ang, pediuGiro: !!p.turnForPass });
    return r;
};

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

if (!casos.length) { console.log('sem passes'); process.exit(0); }
const lim = PassModel.anguloLivreGraus;
function resumo(lista, titulo) {
    if (!lista.length) { console.log(titulo + '  (nenhum)'); return; }
    console.log(titulo + '  (' + lista.length + ')');
    for (const [lo, hi] of [[0, 30], [30, 70], [70, 90], [90, 120], [120, 180]]) {
        const n = lista.filter(c => c.ang >= lo && (c.ang < hi || hi === 180)).length;
        console.log('   ' + String(lo).padStart(3) + '-' + String(hi).padStart(3) + '  ' +
            String(n).padStart(4) + '  ' + (100 * n / lista.length).toFixed(0).padStart(3) + '%  ' +
            '#'.repeat(Math.round(30 * n / lista.length)));
    }
    const m = lista.reduce((a, c) => a + c.ang, 0) / lista.length;
    const fora = lista.filter(c => c.ang > lim + 0.5).length;
    console.log('   media ' + m.toFixed(0) + ' graus   |  fora da janela dos ' + lim +
        ': ' + fora + '/' + lista.length + ' (' + (100 * fora / lista.length).toFixed(0) + '%)');
}
console.log('ANGULO ENTRE A FRENTE DO CORPO E A BOLA, quando ela sai do pe:\n');
resumo(casos, 'TODOS os passes:');
console.log('');
resumo(casos.filter(c => c.pediuGiro), 'So os que pediram GIRO (alvo alem dos 70):');
