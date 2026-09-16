/*
A LINHA DO TEMPO DE UM CARA A CARA: o que faz o avancado e o que faz o
guarda-redes, frame a frame.

Uso: node tools/scratch/cara_a_cara_timeline.js [angulo] [semente]
*/
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ANG = Number(process.argv[2] || 20);
Math.random = mulberry32(Number(process.argv[3] || 777));

require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
for (let i = 0; i < 30; i++) Match.update(dt);

Match.triggerCaraACara('TeamA', ANG);
const atk = Match.players.filter(p => p.role !== 'gk').find(p => p.hasBall) || Match.ballCarrier;
const gk = Match.opponents.find(p => p.role === 'gk');
const larg = (typeof LARGURA_BALIZA !== 'undefined') ? LARGURA_BALIZA : 7.32;
const A = ShootingModel.dentroDaArea;
const FF = ShootingModel.frenteAFrente;

console.log('angulo ' + ANG + ' | area: profundidade ' + A.profundidade + ' meia-largura ' + A.meiaLargura +
    ' | frenteAFrente ideal ' + FF.distanciaIdeal + ' max ' + FF.distanciaMax +
    ' | anguloMinimo ' + (ShootingModel.anguloMinimo * 180 / Math.PI).toFixed(1) + ' graus');
console.log('t     atk(x,z)      distGol  ang   naArea  fsm            ff   temBola  dGK   gk(x,z)      gkEstado      bola(x,z,y)');
for (let i = 0; i < 60 * 7; i++) {
    Match.update(dt);
    if (i % 6) continue;
    const P = atk.model.position, G = gk.model.position, B = Match.ball.position;
    const distGol = Math.hypot(P.x, atk.targetGoalZ - P.z);
    const ang = anguloDaBaliza(P.x, P.z, atk.targetGoalZ, larg) * 180 / Math.PI;
    const naArea = (Math.abs(atk.targetGoalZ - P.z) <= A.profundidade && Math.abs(P.x) <= A.meiaLargura);
    console.log(
        (i * dt).toFixed(2).padStart(4) + '  ' +
        ('(' + P.x.toFixed(1) + ',' + P.z.toFixed(1) + ')').padEnd(13) +
        distGol.toFixed(1).padStart(7) + '  ' + ang.toFixed(0).padStart(3) + '  ' +
        (naArea ? '  sim ' : '  nao ') + '  ' +
        String(atk.fsm.currentState).padEnd(14) + ' ' +
        (atk.frenteAFrente ? 'sim' : 'nao') + '  ' +
        (atk.hasBall ? '  sim  ' : '  nao  ') + ' ' +
        atk.model.position.distanceTo(G).toFixed(1).padStart(5) + '  ' +
        ('(' + G.x.toFixed(1) + ',' + G.z.toFixed(1) + ')').padEnd(13) +
        String(gk.gkEstado).padEnd(14) +
        '(' + B.x.toFixed(1) + ',' + B.z.toFixed(1) + ',' + B.y.toFixed(1) + ')');
    if (Match.state !== 'PLAY') { console.log('  -> estado do jogo: ' + Match.state + ' (' + Match.stateReason + ')'); break; }
}
