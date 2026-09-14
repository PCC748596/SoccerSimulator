/*
ONDE BATE A BOLA NO CABECEIO: testa, ou ombro?

Em cada cabeceio regista a altura do contacto (medida dos pes) contra a testa
(ALTURA_TESTA) e o desvio horizontal ao eixo da cabeca.

Uso: node tools/scratch/cabecada_altura.js [segundos]
*/
const segundos = Number(process.argv[2] || 2400);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260917));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const _cab = new THREE.Vector3();
const amostras = [];
const orig = FootballPlayer.prototype.executeHeader;
FootballPlayer.prototype.executeHeader = function () {
    const b = Match.ball.position;
    const alturaPes = b.y - this.model.position.y;
    let distCabeca = null, alturaCabeca = null;
    const cabeca = this.rig && (this.rig.neck ? this.rig.neck.children.find(c => c.isMesh) : null);
    const noRig = this.rig && this.rig.neck;
    if (noRig) {
        noRig.getWorldPosition(_cab);
        distCabeca = Math.hypot(b.x - _cab.x, b.z - _cab.z);
        alturaCabeca = b.y - _cab.y;
    }
    amostras.push({ alturaPes: alturaPes, distCabeca: distCabeca, alturaCabeca: alturaCabeca });
    return orig.call(this);
};

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

if (!amostras.length) { console.log('sem cabeceios'); }
else {
    const m = (f) => amostras.reduce((a, s) => a + (f(s) || 0), 0) / amostras.length;
    const alturas = amostras.map(s => s.alturaPes).sort((a, b) => a - b);
    console.log(amostras.length + ' cabeceios em ' + (segundos / 60).toFixed(0) + ' min');
    console.log('  ALTURA_TESTA = ' + ALTURA_TESTA.toFixed(2) + ' m | janela +-' + HeaderModel.janelaContacto);
    console.log('  altura do contacto (dos pes): media ' + m(s => s.alturaPes).toFixed(2) +
        ' | minimo ' + alturas[0].toFixed(2) + ' | mediana ' + alturas[Math.floor(alturas.length / 2)].toFixed(2) +
        ' | maximo ' + alturas[alturas.length - 1].toFixed(2));
    console.log('  desvio a testa: media ' + m(s => Math.abs(s.alturaPes - ALTURA_TESTA)).toFixed(2) + ' m');
    console.log('  abaixo da testa por mais de 0.12 m (ombro): ' +
        amostras.filter(s => s.alturaPes < ALTURA_TESTA - 0.12).length +
        ' (' + (100 * amostras.filter(s => s.alturaPes < ALTURA_TESTA - 0.12).length / amostras.length).toFixed(0) + '%)');
    const dh = amostras.map(s => s.distCabeca).sort((a, b) => a - b);
    const ah = amostras.map(s => s.alturaCabeca).sort((a, b) => a - b);
    console.log('  afastamento HORIZONTAL ao eixo da cabeca: media ' + m(s => s.distCabeca).toFixed(2) +
        ' | mediana ' + dh[Math.floor(dh.length / 2)].toFixed(2) + ' | minimo ' + dh[0].toFixed(2) +
        ' | maximo ' + dh[dh.length - 1].toFixed(2) + ' m');
    console.log('  altura da bola RELATIVA a cabeca: media ' + m(s => s.alturaCabeca).toFixed(2) +
        ' | mediana ' + ah[Math.floor(ah.length / 2)].toFixed(2) + ' | minimo ' + ah[0].toFixed(2) +
        ' | maximo ' + ah[ah.length - 1].toFixed(2) + ' m');
    const raio = BallPhysics.raio + 0.14;   // bola + meia cabeca
    const tocam = amostras.filter(s => Math.hypot(s.distCabeca, s.alturaCabeca) <= raio).length;
    console.log('  cabeceios em que a bola CHEGA a tocar a cabeca (< ' + raio.toFixed(2) + ' m): ' +
        tocam + ' de ' + amostras.length + ' (' + (100 * tocam / amostras.length).toFixed(0) + '%)');
    console.log('  quantos sobreviveriam a um raio de contacto na cabeca:');
    for (const r of [0.25, 0.35, 0.45, 0.60, 0.75, 0.90]) {
        const n = amostras.filter(s => Math.hypot(s.distCabeca, Math.max(0, s.alturaCabeca - 0.25)) <= r).length;
        console.log('    ' + r.toFixed(2) + ' m -> ' + n + ' de ' + amostras.length +
            ' (' + (100 * n / amostras.length).toFixed(0) + '%)');
    }
}
