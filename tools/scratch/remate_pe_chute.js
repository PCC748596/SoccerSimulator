/*
ONDE ESTA O PE QUE BATE, NO INSTANTE DO CONTACTO DO REMATE.

Relato: *"na hora do chute, quando o pe pega na bola a bola nao sai chutada; a
bola sai depois que o pe esta mais na frente"*. Se for verdade, no contacto o
pe de remate ja passou a bola: `peZ - bolaZ` sai POSITIVO (a frente).

Mede tambem o mesmo ao longo do gesto, para se ver em que fracao do clip o pe
CRUZA mesmo a bola — que e onde o contacto devia cair.
*/
const segundos = Number(process.argv[2] || 900);
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
const E = (typeof ESCALA_CORPO === 'number') ? ESCALA_CORPO : 1;
const chuteR = (ShotClip.pernaChute === 'r');

function medir(p) {
    const pe = chuteR ? p.rig.rFoot : p.rig.lFoot;
    if (!pe) return null;
    p.model.updateMatrixWorld(true);
    _inv.copy(p.model.matrixWorld).invert();
    pe.getWorldPosition(_pe); _pe.applyMatrix4(_inv);
    _bola.copy(Match.ball.position).applyMatrix4(_inv);
    return { peZ: _pe.z * E, peX: _pe.x * E, peY: _pe.y * E,
             bolaZ: _bola.z * E, bolaX: _bola.x * E };
}

// 1) no instante exacto do contacto
const noContacto = [];
const originalExec = global.executeShotGameplay;
global.executeShotGameplay = function (p) {
    const m = medir(p);
    if (m) { m.norm = p.actionState ? (p.actionState.t / p.actionState.duration) : -1; noContacto.push(m); }
    return originalExec(p);
};

// 2) o gesto inteiro: todos os frames de quem esta em SHOOT
const trajecto = [];   // { norm, dz }
const jogadores = () => Match.players.concat(Match.opponents);
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const p of jogadores()) {
        if (!p.fsm || p.fsm.currentState !== 'SHOOT' || !p.actionState) continue;
        const m = medir(p);
        if (m) trajecto.push({ norm: p.actionState.t / p.actionState.duration, dz: m.peZ - m.bolaZ });
    }
}

console.log('contactTime do clip: ' + (ActionAnimClips.shot.contactTime).toFixed(4) +
    '   (frame ' + ShotClip.contactFrame + ' de ' + ShotClip.frames.length + ')');

if (!noContacto.length) console.log('sem remates');
else {
    const med = (f) => noContacto.reduce((a, s) => a + f(s), 0) / noContacto.length;
    console.log('\n' + noContacto.length + ' remates. NO CONTACTO, referencial do jogador, em metros:');
    console.log('  pe de remate:  z ' + med(s => s.peZ).toFixed(2) + '  x ' + med(s => s.peX).toFixed(2) + '  y ' + med(s => s.peY).toFixed(2));
    console.log('  bola:          z ' + med(s => s.bolaZ).toFixed(2) + '  x ' + med(s => s.bolaX).toFixed(2));
    const dz = med(s => s.peZ - s.bolaZ);
    console.log('  pe MENOS bola em z: ' + dz.toFixed(2) + ' m  ' +
        (dz > 0.05 ? '<<< o pe JA PASSOU a bola' : (dz < -0.05 ? '(o pe ainda nao chegou)' : '(em cima dela)')));
}

// onde e que o pe cruza a bola, por fatia do clip
console.log('\nPE MENOS BOLA (z, metros) ao longo do gesto:');
const baldes = new Map();
for (const t of trajecto) {
    const b = Math.round(t.norm * 20) / 20;
    if (!baldes.has(b)) baldes.set(b, []);
    baldes.get(b).push(t.dz);
}
const chaves = [...baldes.keys()].sort((a, b) => a - b);
let cruza = null, ant = null;
for (const k of chaves) {
    const v = baldes.get(k);
    const m = v.reduce((a, x) => a + x, 0) / v.length;
    const marca = (Math.abs(k - ActionAnimClips.shot.contactTime) < 0.025) ? '   <== contactTime' : '';
    console.log('  norm ' + k.toFixed(2) + '  dz ' + (m >= 0 ? '+' : '') + m.toFixed(2) + marca);
    if (ant && ant.m < 0 && m >= 0) cruza = ant.k + (k - ant.k) * (-ant.m / (m - ant.m));
    ant = { k, m };
}
if (cruza !== null) console.log('\n  o pe cruza a bola em norm ~= ' + cruza.toFixed(3) +
    '  (contactTime actual ' + ActionAnimClips.shot.contactTime.toFixed(3) + ')');
