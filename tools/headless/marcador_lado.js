/*
O MARCADOR CORRE PELO LADO DO GOL OU ATRAS DO PORTADOR? (CorteDoMarcador). Relato: o jogador que sai na marcacao corre
atras do portador; devia correr pelo lado que fecha o angulo bola-gol.
Mede, com um perseguidor (bb.chaser) adversario do portador a 2-12 m dele: o cosseno entre (perseguidor - portador) e
(propria baliza dele - portador): +1 = entre o portador e a sua baliza (fecha o angulo); -1 = atras do portador.
Imprime a media e a fraccao de frames "atras" (cos < 0).
SEM=1 desliga o CorteDoMarcador. Uso: node tools/headless/marcador_lado.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 600);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
Match.init(new THREE.Scene());
if (process.env.SEM) CorteDoMarcador.activo = false;
if (process.env.FR) { CorteDoMarcador.fraccao = Number(process.env.FR); CorteDoMarcador.max = Number(process.env.MX || 8); }
const dt = 1 / 60;
const cos = []; let atras = 0, desarmes = 0, roubos = 0;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 5) continue;
    const c = Match.ballCarrier;
    if (!c || c.role === 'gk' || Match.state !== 'PLAY') continue;
    const adv = c.team === 'TeamA' ? Match.opponents : Match.players;
    const bb = TeamAI.get(adv[0].team);
    const ch = bb && bb.chaser;
    if (!ch || !ch.model || ch.role === 'gk') continue;
    const d = Math.hypot(ch.model.position.x - c.model.position.x, ch.model.position.z - c.model.position.z);
    if (d < 2 || d > 12) continue;
    const gx = 0 - c.model.position.x, gz = ch.ownGoalZ - c.model.position.z;
    const gl = Math.hypot(gx, gz) || 1;
    const vx = ch.model.position.x - c.model.position.x, vz = ch.model.position.z - c.model.position.z;
    const k = (vx * gx + vz * gz) / (d * gl);
    cos.push(k); if (k < 0) atras++;
}
const m = cos.reduce((a, b) => a + b, 0) / Math.max(1, cos.length);
const S = (typeof MatchStats !== 'undefined') ? MatchStats : null;
console.log(`semente ${semente}, corte ${CorteDoMarcador.activo ? 'ligado' : 'desligado'}: ${cos.length} amostras | cos medio ${m.toFixed(2)} | atras do portador (cos<0) em ${(100 * atras / Math.max(1, cos.length)).toFixed(0)}%` +
    (S && S.TeamA && S.TeamA.carrinhos ? ` | carrinhos A ${S.TeamA.carrinhos.sucesso}/${S.TeamA.carrinhos.tentados} B ${S.TeamB.carrinhos.sucesso}/${S.TeamB.carrinhos.tentados}` : ''));
