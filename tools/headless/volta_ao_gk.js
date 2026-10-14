/*
JOGADORES A RODAR EM VOLTA DO GUARDA-REDES. Relato: *"o goleiro defendeu a bola e 2 jogadores, um de cada time,
ficaram rodando em volta dele"*.

Procura, enquanto um guarda-redes tem a bola (Match.gkHoldingBall), jogadores de campo a menos de `RAIO` m dele
que se mexem (> 1 m/s) durante mais de `MIN_S` segundos seguidos, e mede o ângulo que varrem à volta dele. Imprime
quem são, o estado da FSM, o alvo de cada um e a causa provável (a distância ao alvo).

Uso: node tools/headless/volta_ao_gk.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 900);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
Match.init(new THREE.Scene());

const RAIO = 6, MIN_S = 2.5;
const dt = 1 / 60;
const seg = new Map();      // jogador -> { t, ang, ultAng, ultPos }
const achados = [];
let gkComBola = 0;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    // TODOS=1: qualquer guarda-redes, com ou sem a bola nas mãos.
    const donos = process.env.TODOS ? ['TeamA', 'TeamB'] : ['TeamA', 'TeamB'].filter(t => Match.gkHoldingBall && Match.gkHoldingBall[t]);
    if (!donos.length) { seg.clear(); continue; }
    gkComBola++;
    for (const dono of donos) {
        const lista = dono === 'TeamA' ? Match.players : Match.opponents;
        const gk = lista.find(p => p.role === 'gk');
        if (!gk) continue;
        for (const p of Match.players.concat(Match.opponents)) {
            if (p.role === 'gk' || !p.model) continue;
            const d = p.model.position.distanceTo(gk.model.position);
            const chave = p;
            let e = seg.get(chave);
            if (d > RAIO) { if (e) seg.delete(chave); continue; }
            const ang = Math.atan2(p.model.position.x - gk.model.position.x, p.model.position.z - gk.model.position.z);
            const vel = p.velocity ? Math.hypot(p.velocity.x, p.velocity.z) : 0;
            if (!e) { e = { t: 0, varrido: 0, ult: ang, parado: 0 }; seg.set(chave, e); }
            let da = ang - e.ult; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
            e.ult = ang;
            if (vel > 1.0) { e.t += dt; e.varrido += da; } else { e.parado += dt; }
            if (e.t >= MIN_S && Math.abs(e.varrido) > Math.PI && !e.registado) {
                e.registado = true;
                achados.push({
                    t: (i * dt).toFixed(0) + 's', quem: p.team + ' ' + p.pos, gk: dono, estado: p.fsm.currentState,
                    distGK: d.toFixed(1), voltas: (Math.abs(e.varrido) / (2 * Math.PI)).toFixed(2),
                    alvoDist: p.dynamicTarget ? p.model.position.distanceTo(p.dynamicTarget).toFixed(1) : '?',
                    chaser: (TeamAI.get(p.team) || {}).chaser === p, intercetor: (TeamAI.get(p.team) || {}).intercetor === p,
                    estadoGK: gk.gkEstado, bolaNoGK: Match.ball.position.distanceTo(gk.model.position).toFixed(1)
                });
            }
        }
    }
}
console.log(`semente ${semente}: ${(gkComBola / 60).toFixed(0)} s com um guarda-redes a segurar a bola; ${achados.length} jogadores a rodar à volta dele`);
for (const a of achados) console.log('  ', JSON.stringify(a));
