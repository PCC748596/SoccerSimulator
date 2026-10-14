// Forca uma saida aos pes: o GK A larga a baliza e um avancado B conduz a bola na area dele.
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(7);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
Match.init(new THREE.Scene());
GoalkeeperDive.saidaAosPes.chance = 1;
const gk = Match.players[0], sg = Math.sign(gk.ownGoalZ) || -1;
const atk = Match.opponents.find(p => p.role === 'atk');
Match.state = 'PLAY';
atk.model.position.set(2, ALTURA_BASE_Y, gk.ownGoalZ - sg * 9);
atk.hasBall = true; Match.ballCarrier = atk; Match.possessionTeam = atk.team;
Match.ball.position.set(2, 0.3, gk.ownGoalZ - sg * 8.5);
atk.velocity.set(0, 0, -sg * 3);
const estados = []; gk.model.position.set(0, ALTURA_BASE_Y, gk.ownGoalZ - sg * 1.0); gk.iniciarSaidaAosPes({ atk });
for (let i = 0; i < 60 * 6; i++) {
  atk.model.position.z += -sg * -sg * 0; Match.update(1 / 60);
  const e = gk.gkEstado; if (estados[estados.length - 1] !== e) estados.push(e);
  if (!isFinite(gk.model.position.x + gk.model.position.z + gk.model.quaternion.x)) { console.log('NaN!'); break; }
}
console.log('estados do GK:', estados.join(' > '), '| saidasAosPes A:', MatchStats.TeamA.saidasAosPes);
