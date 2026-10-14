/*
QUANTOS DRIBLES (entradas no estado DRIBBLE) por jogo, e onde (terco do campo, referencial de ataque), e quantos
carregamentos (CARRY) houve, para ver a taxa de drible por conducao. Uso: node tools/headless/dribles_contagem.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 600);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
Match.init(new THREE.Scene());
if (process.env.TD) DribbleModel.triggerDist = Number(process.env.TD);
if (process.env.CS) CarryModel.conduzirSoAcimaDe = Number(process.env.CS);
if (process.env.SEM) { DribbleModel.foraDoTerco.activo = false; DribbleModel.lateraisNoUltimoTerco.activo = false; }
const dt = 1 / 60;
const prev = new Map(); const dr = { def: 0, meio: 0, ult: 0 }; let carryMs = 0, driblesPorPos = {};
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const p of Match.players.concat(Match.opponents)) {
        const s = p.fsm.currentState, a = prev.get(p);
        if (s === 'CARRY') carryMs += dt;
        if (s === 'DRIBBLE' && a !== 'DRIBBLE') {
            const z = p.model.position.z * p.dirZ;
            dr[z < -17 ? 'def' : (z < 17 ? 'meio' : 'ult')]++;
            driblesPorPos[p.pos] = (driblesPorPos[p.pos] || 0) + 1;
        }
        prev.set(p, s);
    }
}
const total = dr.def + dr.meio + dr.ult;
const MS = (typeof MatchStats !== 'undefined') ? MatchStats : null;
const dst = MS ? ' | dribles tentados A ' + MS.TeamA.dribles.tentados + ' B ' + MS.TeamB.dribles.tentados + ' (certos A ' + (MS.TeamA.dribles.sucesso || 0) + ' B ' + (MS.TeamB.dribles.sucesso || 0) + ')' : '';
console.log(`semente ${semente}, ${segundos} s: ${total} dribles (terco defensivo ${dr.def}, meio ${dr.meio}, ultimo ${dr.ult}) | ${carryMs.toFixed(0)} s de conducao (CARRY) | por posicao ${JSON.stringify(driblesPorPos)}${dst}`);
