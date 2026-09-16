/*
DIAGNOSTICO DO CARA A CARA — para onde vai o portador e de onde remata.

Dispara `Match.triggerCaraACara` com angulos varridos, segue o portador frame a
frame e imprime: onde comecou, o ponto mais fundo a que chegou, o |x| maximo, e
o sitio/angulo de baliza do remate (se houver).

Corre com: node tools/scratch/cara_a_cara_diag.js [sementeBase]
*/
const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(Number(process.argv[2] || 777));
// OFF=1 desliga o progresso-para-a-baliza, para comparar antes/depois.
const DESLIGAR = process.env.OFF === '1';

require('../headless/harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

if (DESLIGAR) CarryModel.progressoParaBalizaDist = 0;
const angulos = [-30, -20, -10, 0, 10, 20, 30];
const larg = (typeof LARGURA_BALIZA !== 'undefined') ? LARGURA_BALIZA : 7.32;

console.log('ang   inicio(x,z)   fim(x,z)      |x|max  avancoMax  remate  angBaliza@remate  desfecho');
for (const ang of angulos) {
    // Um jogo limpo por lance.
    Match.init(scene);
    if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
    for (let i = 0; i < 30; i++) Match.update(dt);

    Match.triggerCaraACara('TeamA', ang);
    const atacante = Match.players.filter(p => p.role !== 'gk')
        .find(p => p.hasBall) || Match.ballCarrier;
    if (!atacante) { console.log(ang + ': sem atacante'); continue; }

    const p0 = atacante.model.position.clone();
    let xMax = Math.abs(p0.x), avancoMax = p0.z * atacante.dirZ;
    let remate = null, desfecho = 'sem remate';
    const estado0 = Match.state;

    for (let i = 0; i < 60 * 8; i++) {
        Match.update(dt);
        const pos = atacante.model.position;
        xMax = Math.max(xMax, Math.abs(pos.x));
        avancoMax = Math.max(avancoMax, pos.z * atacante.dirZ);
        if (!remate && atacante.fsm && atacante.fsm.currentState === 'SHOOT') {
            remate = pos.clone();
        }
        if (Match.state !== estado0 && Match.state !== 'PLAY') { desfecho = Match.state; break; }
        if (!remate && !atacante.hasBall && Match.ballCarrier && Match.ballCarrier !== atacante) {
            desfecho = 'perdeu a bola'; break;
        }
    }
    const angB = remate && typeof anguloDaBaliza === 'function'
        ? (anguloDaBaliza(remate.x, remate.z, atacante.targetGoalZ, larg) * 180 / Math.PI).toFixed(1) + ' graus'
        : '-';
    const fim = atacante.model.position;
    console.log(
        String(ang).padStart(3) + '  ' +
        ('(' + p0.x.toFixed(1) + ',' + p0.z.toFixed(1) + ')').padEnd(14) +
        ('(' + fim.x.toFixed(1) + ',' + fim.z.toFixed(1) + ')').padEnd(14) +
        xMax.toFixed(1).padStart(6) + '  ' +
        avancoMax.toFixed(1).padStart(9) + '  ' +
        (remate ? ('(' + remate.x.toFixed(1) + ',' + remate.z.toFixed(1) + ')') : '-').padEnd(14) +
        angB.padEnd(12) + '  ' + desfecho);
}
