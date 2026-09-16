/*
O BRACO VAI PARAR ATRAS DO CORPO? Mede, por fase do mergulho, a posicao das
maos no referencial do PEITO: z positivo e a frente, negativo e atras.
*/
const segundos = Number(process.argv[2] || 600);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 31337));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const _m = new THREE.Vector3(), _inv = new THREE.Matrix4();
const porFase = {};
function amostrar(gk) {
    const rig = gk.rig;
    if (!rig || !rig.chest) return;
    const fase = gk.dive ? gk.dive.fase : gk.gkEstado;
    rig.chest.updateWorldMatrix(true, false);
    _inv.copy(rig.chest.matrixWorld).invert();
    for (const nome of ['lHand', 'rHand']) {
        const mao = rig[nome];
        if (!mao) continue;
        mao.getWorldPosition(_m);
        _m.applyMatrix4(_inv);
        const f = porFase[fase] || (porFase[fase] = { n: 0, zSoma: 0, zMin: 9, atras: 0 });
        f.n++; f.zSoma += _m.z; f.zMin = Math.min(f.zMin, _m.z);
        if (_m.z < 0) f.atras++;
    }
}
const gks = () => Match.players.concat(Match.opponents).filter(p => p.role === 'gk');
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const gk of gks()) if (gk.gkEstado === 'mergulho' || gk.gkEstado === 'salto_alto') amostrar(gk);
}
console.log('fase        amostras  z medio da mao  z minimo  % atras do peito');
for (const k of Object.keys(porFase).sort()) {
    const f = porFase[k];
    console.log(k.padEnd(12) + String(f.n).padStart(8) + '  ' + (f.zSoma / f.n).toFixed(2).padStart(14) +
        '  ' + f.zMin.toFixed(2).padStart(8) + '  ' + (100 * f.atras / f.n).toFixed(0).padStart(14) + '%');
}
