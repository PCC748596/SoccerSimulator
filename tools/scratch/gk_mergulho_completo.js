/*
QUANTOS MERGULHOS CHEGAM AO CHAO. Segue cada mergulho e diz em que fase
acabou: 'chao'/'levantar' e o gesto completo, ou cortado a meio.
*/
const segundos = Number(process.argv[2] || 900);
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

const emCurso = new Map();
const conta = { completo: 0, cortado: 0 };
const cortadosPorEstado = {};
const gks = () => Match.players.concat(Match.opponents).filter(p => p.role === 'gk');
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const gk of gks()) {
        const aMergulhar = (gk.gkEstado === 'mergulho' && gk.dive);
        if (aMergulhar) {
            const reg = emCurso.get(gk) || { fases: new Set(), estado: Match.state };
            reg.fases.add(gk.dive.fase);
            reg.ultimaFase = gk.dive.fase;
            reg.estadoFim = Match.state;
            emCurso.set(gk, reg);
        } else if (emCurso.has(gk)) {
            const reg = emCurso.get(gk);
            emCurso.delete(gk);
            const chegouAoChao = reg.fases.has('chao');
            if (chegouAoChao) conta.completo++;
            else {
                conta.cortado++;
                const k = reg.ultimaFase + ' @ ' + reg.estadoFim + ' -> gkEstado=' + gk.gkEstado + (gk.dive ? ' (dive vivo)' : ' (dive nulo)');
                cortadosPorEstado[k] = (cortadosPorEstado[k] || 0) + 1;
            }
        }
    }
}
console.log('mergulhos: ' + (conta.completo + conta.cortado) +
    ' | chegaram ao chao: ' + conta.completo + ' | cortados: ' + conta.cortado);
for (const k of Object.keys(cortadosPorEstado)) console.log('   cortado em ' + k + ': ' + cortadosPorEstado[k]);
