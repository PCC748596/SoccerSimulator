/*
PARA ONDE VAI O REMATE DO CARA A CARA, e onde esta o guarda-redes.

Dispara o lance nos sete angulos e, no instante do contacto, regista: o ponto
visado (miraDeRemate), o tipo de remate, a posicao do guarda-redes e a folga
entre a bola e ele quando ela cruza a linha.
*/
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[2] || 777));

require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

// Embrulha a mira e o tipo para saber o que foi pedido, sem tocar no jogo.
let ultimo = null;
const miraOriginal = global.miraDeRemate, tipoOriginal = global.tipoDeRemate;
global.tipoDeRemate = function (o) { const t = tipoOriginal(o); ultimo = { tipo: t, gkXPedido: 0 }; return t; };
global.miraDeRemate = function (o) { const m = miraOriginal(o); if (ultimo) { ultimo.mira = m; ultimo.gkX = o.gkX; } return m; };

console.log('ang  remate de (x,z)  tipo       mira x  gk x   gk fora da linha  bola cruza em x  folga ao gk');
for (const ang of [-30, -20, -10, 0, 10, 20, 30]) {
    Match.init(scene);
    if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
    for (let i = 0; i < 30; i++) Match.update(dt);
    Match.triggerCaraACara('TeamA', ang);
    const atk = Match.players.filter(p => p.role !== 'gk').find(p => p.hasBall) || Match.ballCarrier;
    const gk = Match.opponents.find(p => p.role === 'gk');
    ultimo = null;
    let disparo = null, cruzou = null, gkNoDisparo = null;
    const golZ = atk.targetGoalZ;
    let zAnt = Match.ball.position.z;
    for (let i = 0; i < 60 * 8; i++) {
        Match.update(dt);
        if (!disparo && ultimo && ultimo.mira) {
            disparo = { pos: atk.model.position.clone(), t: i * dt, gkEstado: gk.gkEstado };
            gkNoDisparo = { x: gk.model.position.x, z: gk.model.position.z };
        }
        if (disparo && disparo.vel === undefined && Match.ballVel.lengthSq() > 25) {
            disparo.vel = Match.ballVel.length();
            disparo.tSaida = i * dt;
            // Para onde a bola vai, projectado na linha de baliza.
            const v = Match.ballVel, b = Match.ball.position;
            const tt = (golZ - b.z) / (v.z || 1e-6);
            disparo.raioX = b.x + v.x * tt;
            disparo.raioY = b.y + v.y * tt - 0.5 * 9.81 * tt * tt;
        }
        const z = Match.ball.position.z;
        if (disparo && !cruzou && ((zAnt - golZ) * (z - golZ) <= 0)) {
            cruzou = { x: Match.ball.position.x, y: Match.ball.position.y };
        }
        // Folga: distancia minima da bola ao guarda-redes depois do disparo.
        if (disparo && !cruzou) {
            const d = Match.ball.position.distanceTo(gk.model.position);
            disparo.folga = Math.min(d, disparo.folga === undefined ? 99 : disparo.folga);
        }
        zAnt = z;
        if (Match.state !== 'PLAY') break;
    }
    if (!disparo) { console.log(String(ang).padStart(3) + '  (sem remate)'); continue; }
    console.log(String(ang).padStart(3) + '  ' +
        ('(' + disparo.pos.x.toFixed(1) + ',' + disparo.pos.z.toFixed(1) + ')').padEnd(15) +
        String(ultimo.tipo).padEnd(10) + ' ' +
        ultimo.mira.x.toFixed(2).padStart(6) + '  ' +
        gkNoDisparo.x.toFixed(1).padStart(5) + '  ' +
        (Math.abs(golZ) - Math.abs(gkNoDisparo.z)).toFixed(1).padStart(15) + '  ' +
        (cruzou ? cruzou.x.toFixed(2) : '  -  ').padStart(14) + '  ' +
        (disparo.folga !== undefined ? disparo.folga.toFixed(2) : '-').padStart(10) +
        '  | ' + (disparo.vel ? disparo.vel.toFixed(1) : '-') + ' m/s, vai cruzar em x=' +
        (disparo.raioX !== undefined ? disparo.raioX.toFixed(2) : '-') + ' y=' +
        (disparo.raioY !== undefined ? disparo.raioY.toFixed(2) : '-'));
}
