/* Quantos cruzamentos ha, e onde a projeccao cai. */
const segundos = Number(process.argv[2] || 2400);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260923));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let framesCross = 0, episodios = 0, naPequena = 0, naGrande = 0, fora = 0;
let anterior = false;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    // A mesma condicao do updateGK.
    const isCross = (Match.ballVel.y > 2.0 && Match.ball.position.y > 1.2 &&
        Math.abs(Match.ball.position.z) > 24 && !Match.ballCarrier);
    if (isCross) {
        framesCross++;
        if (!anterior) {
            episodios++;
            const q = preverQuedaDaBola();
            const linhaZ = Math.sign(Match.ball.position.z) * LINHA_FUNDO;
            if (q) {
                const dz = Math.abs(linhaZ - q.z);
                if (Math.abs(q.x) <= Area.pequenaMeiaLargura && dz <= Area.pequenaProfundidade) naPequena++;
                else if (Math.abs(q.x) <= Area.meiaLargura && dz <= Area.profundidade) naGrande++;
                else fora++;
            }
        }
    }
    anterior = isCross;
}
console.log(episodios + ' cruzamentos (' + framesCross + ' frames) em ' + (segundos / 60).toFixed(0) + ' min');
console.log('  projeccao na PEQUENA area: ' + naPequena + ' | na grande: ' + naGrande + ' | fora: ' + fora);
