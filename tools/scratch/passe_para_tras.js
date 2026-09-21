/*
PASSES PARA TRAS DE QUEM VAI PARA A FRENTE.

Relato: *"ainda tem jogador tocando praticamente para tras durante a
movimentacao para frente"*.

Mede, no instante em que o passe SAI do pe (`executePassGameplay`):

  angMov   angulo entre a direccao da BOLA e a direccao em que o passador se
           DESLOCAVA (0 = toca para onde corria, 180 = toca para tras)
  angAtk   o mesmo contra o sentido de ATAQUE da equipa dele
  vel      a que velocidade ele ia

So conta quem ia mesmo em movimento para a frente (`velMin` m/s e a correr no
sentido de ataque), que e o caso do relato.

Corre com: node tools/scratch/passe_para_tras.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 1800);
const semente = Number(process.argv[3] || 4242);
const velMin = Number(process.argv[4] || 2.0);
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

/*
Embrulha-se o EFEITO do passe, e nao a decisao: e aqui que a bola ganha
velocidade, portanto e aqui que a direccao do passe existe de facto. A
velocidade do passador le-se ANTES de a bola sair.
*/
const orig = global.executePassGameplay;
global.executePassGameplay = function (p) {
    const vx = p.velocity ? p.velocity.x : 0;
    const vz = p.velocity ? p.velocity.z : 0;
    const vel = Math.hypot(vx, vz);
    const r = orig.apply(this, arguments);

    const bx = Match.ballVel.x, bz = Match.ballVel.z;
    const nb = Math.hypot(bx, bz);
    if (nb < 0.5) return r;

    // Contra o sentido de ataque da equipa dele.
    const angAtk = Math.acos(Math.max(-1, Math.min(1, (bz * p.dirZ) / nb))) * GRAU;

    let angMov = null;
    if (vel >= 0.3) {
        const cos = (vx * bx + vz * bz) / (vel * nb);
        angMov = Math.acos(Math.max(-1, Math.min(1, cos))) * GRAU;
    }
    // Ia ele para a frente? (deslocamento no sentido de ataque)
    const paraFrente = (vel >= velMin) && ((vz * p.dirZ) / Math.max(1e-6, vel) > 0.5);
    casos.push({ angMov, angAtk, vel, paraFrente, pos: p.pos || p.role });
    return r;
};

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

if (!casos.length) { console.log('sem passes'); process.exit(0); }

const emMov = casos.filter(c => c.angMov !== null && c.paraFrente);
console.log(casos.length + ' passes; ' + emMov.length +
    ' dados por quem ia PARA A FRENTE a mais de ' + velMin + ' m/s\n');

function histograma(lista, campo, titulo) {
    console.log(titulo);
    const faixas = [[0, 30], [30, 60], [60, 90], [90, 120], [120, 150], [150, 180]];
    for (const [lo, hi] of faixas) {
        const n = lista.filter(c => c[campo] >= lo && (c[campo] < hi || hi === 180)).length;
        console.log('   ' + String(lo).padStart(3) + '-' + String(hi).padStart(3) + '  ' +
            String(n).padStart(4) + '  ' + (100 * n / lista.length).toFixed(0).padStart(3) + '%  ' +
            '#'.repeat(Math.round(36 * n / lista.length)));
    }
    const m = lista.reduce((a, c) => a + c[campo], 0) / lista.length;
    console.log('   media ' + m.toFixed(0) + ' graus');
}

if (emMov.length) {
    histograma(emMov, 'angMov',
        'ANGULO DO PASSE COM A DIRECCAO EM QUE ELE CORRIA (180 = para tras):');
    const tras = emMov.filter(c => c.angMov > 120);
    const muito = emMov.filter(c => c.angMov > 150);
    console.log('\n   passes a mais de 120 graus (para tras):      ' +
        tras.length + '/' + emMov.length + '  (' + (100 * tras.length / emMov.length).toFixed(0) + '%)');
    console.log('   passes a mais de 150 graus (quase de costas): ' +
        muito.length + '/' + emMov.length + '  (' + (100 * muito.length / emMov.length).toFixed(0) + '%)');

    if (muito.length) {
        console.log('\n   os piores:');
        for (const c of muito.sort((a, b) => b.angMov - a.angMov).slice(0, 8)) {
            console.log('     ' + (c.pos || '?').padEnd(4) + '  ' + c.angMov.toFixed(0).padStart(3) +
                ' graus do movimento   ' + c.angAtk.toFixed(0).padStart(3) +
                ' graus do ataque   ia a ' + c.vel.toFixed(1) + ' m/s');
        }
    }
}

console.log('');
histograma(casos, 'angAtk', 'E TODOS OS PASSES CONTRA O SENTIDO DE ATAQUE:');
