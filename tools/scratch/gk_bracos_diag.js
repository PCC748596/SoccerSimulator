/*
DIAGNOSTICO DOS BRACOS DO GUARDA-REDES NO SALTO.

Segue cada mergulho ('mergulho') e cada salto alto ('salto_alto') e mede, por
fase, o quanto os bracos abrem: rotacao z do ombro (0 = colado ao corpo, 1.57 =
na horizontal, 3.14 = a prumo) e a altura da mao em relacao ao peito.

Uso: node tools/scratch/gk_bracos_diag.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 600);
const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(Number(process.argv[3] || 31337));

require('../headless/harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const _mao = new THREE.Vector3(), _peito = new THREE.Vector3();
const episodios = [];
const emCurso = new Map();

function amostra(gk) {
    const rig = gk.rig || (gk.model && gk.model.userData && gk.model.userData.rig);
    if (!rig || !rig.lArm) return null;
    const fase = gk.dive ? gk.dive.fase : (gk.gkEstado === 'salto_alto' ? 'salto' : '-');
    let alturaMao = null;
    if (rig.lHand && rig.chest) {
        rig.lHand.getWorldPosition(_mao);
        rig.chest.getWorldPosition(_peito);
        alturaMao = _mao.y - _peito.y;
    }
    return {
        fase,
        zEsq: Math.abs(rig.lArm.rotation.z),
        zDir: Math.abs(rig.rArm.rotation.z),
        alturaMao
    };
}

const gks = () => Match.players.concat(Match.opponents).filter(p => p.role === 'gk');

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const gk of gks()) {
        const salta = (gk.gkEstado === 'mergulho' || gk.gkEstado === 'salto_alto');
        if (salta) {
            if (!emCurso.has(gk)) emCurso.set(gk, { tipo: gk.gkEstado, amostras: [] });
            const a = amostra(gk);
            if (a) emCurso.get(gk).amostras.push(a);
        } else if (emCurso.has(gk)) {
            episodios.push(emCurso.get(gk));
            emCurso.delete(gk);
        }
    }
}

const porFase = {};
for (const ep of episodios) {
    for (const a of ep.amostras) {
        const chave = ep.tipo + '/' + a.fase;
        const f = porFase[chave] || (porFase[chave] = { n: 0, zMax: 0, zSoma: 0, maoMax: -9, maoSoma: 0 });
        const z = Math.max(a.zEsq, a.zDir);
        f.n++; f.zSoma += z; f.zMax = Math.max(f.zMax, z);
        if (a.alturaMao !== null) { f.maoSoma += a.alturaMao; f.maoMax = Math.max(f.maoMax, a.alturaMao); }
    }
}

console.log(episodios.length + ' saltos em ' + segundos + ' s');
console.log('fase              frames  ombroZ medio  ombroZ max   mao-peito medio  max');
for (const k of Object.keys(porFase).sort()) {
    const f = porFase[k];
    console.log(k.padEnd(18) + String(f.n).padStart(6) + '  ' +
        (f.zSoma / f.n).toFixed(2).padStart(11) + '  ' + f.zMax.toFixed(2).padStart(10) + '  ' +
        (f.maoSoma / f.n).toFixed(2).padStart(15) + '  ' + f.maoMax.toFixed(2).padStart(5));
}
