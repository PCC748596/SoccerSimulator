/*
ONDE ESTA O PE DE APOIO NO INSTANTE DO CONTACTO DO REMATE.

Mede, no referencial do JOGADOR (x = lado, z = a frente), a posicao do pe de
apoio e a da bola. Num remate a serio o pe de apoio fica AO LADO da bola: z
proximo de zero e x de 0.2 a 0.4 m.
*/
const segundos = Number(process.argv[2] || 1800);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 4242));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const _pe = new THREE.Vector3(), _inv = new THREE.Matrix4(), _bola = new THREE.Vector3();
const amostras = [];
const originalExec = global.executeShotGameplay;
global.executeShotGameplay = function (p) {
    const chuteR = (ShotClip.pernaChute === 'r');
    const apoio = chuteR ? p.rig.lFoot : p.rig.rFoot;
    if (apoio) {
        p.model.updateMatrixWorld(true);
        _inv.copy(p.model.matrixWorld).invert();
        apoio.getWorldPosition(_pe); _pe.applyMatrix4(_inv);
        _bola.copy(Match.ball.position).applyMatrix4(_inv);
        amostras.push({ peX: _pe.x, peZ: _pe.z, bolaX: _bola.x, bolaZ: _bola.z });
    }
    return originalExec(p);
};

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

if (!amostras.length) { console.log('sem remates'); }
else {
    const med = (f) => amostras.reduce((a, s) => a + f(s), 0) / amostras.length;
    const E = (typeof ESCALA_CORPO === 'number') ? ESCALA_CORPO : 1;
    console.log(amostras.length + ' remates, no referencial do jogador, em METROS (z = a frente, x = lado):');
    console.log('  pe de apoio:  x ' + (med(s => s.peX) * E).toFixed(2) + '   z ' + (med(s => s.peZ) * E).toFixed(2));
    console.log('  bola:         x ' + (med(s => s.bolaX) * E).toFixed(2) + '   z ' + (med(s => s.bolaZ) * E).toFixed(2));
    console.log('  pe MENOS bola: lado ' + (med(s => s.peX - s.bolaX) * E).toFixed(2) +
        ' m | a frente/atras ' + (med(s => s.peZ - s.bolaZ) * E).toFixed(2) + ' m');
    const atras = amostras.filter(s => (s.peZ - s.bolaZ) * E < -0.25).length;
    console.log('  com o pe de apoio mais de 0.25 m ATRAS da bola: ' + atras +
        ' (' + (100 * atras / amostras.length).toFixed(0) + '%)');
}
