/*
ANGULO DOS CARRINHOS. Relato: os carrinhos nao sao dados perpendicularmente a linha bola->baliza.
Mede, no 1o frame de cada SLIDE_TACKLE, o angulo entre a direccao do deslize e a linha BOLA->BALIZA do atacante
(90 = a cortar a linha; 0 = ao longo dela), e se foi 'frontal' (dentro do cone do SlideTackleModel).
Uso: node tools/headless/carrinho_angulo.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 900);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
Match.init(new THREE.Scene());
if (process.env.SEMALIN) SlideTackleModel.alinhamentoMax = 1e9;
const dt = 1 / 60;
const visto = new Set(); const angs = []; const frontais = []; const desvios = [];
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const p of Match.players.concat(Match.opponents)) {
        const em = p.fsm.currentState === 'SLIDE_TACKLE';
        if (!em) { visto.delete(p); continue; }
        if (visto.has(p)) continue;
        visto.add(p);
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(p.model.quaternion); f.y = 0; f.normalize();
        const bola = Match.ball.position;
        const alvo = Match.ballCarrier;
        const golZ = (alvo && typeof alvo.targetGoalZ === 'number') ? alvo.targetGoalZ : -p.targetGoalZ;
        let lx = 0 - bola.x, lz = golZ - bola.z; const nl = Math.hypot(lx, lz) || 1; lx /= nl; lz /= nl;
        const cos = Math.abs(f.x * lx + f.z * lz);
        const ang = Math.acos(Math.min(1, cos)) * 180 / Math.PI;
        (alvo ? angs : frontais).push(ang);
        if (alvo && ang > 60) desvios.push(Math.abs((bola.x - p.model.position.x) * lx + (bola.z - p.model.position.z) * lz));
        angs.length;
    }
}
const h = (a) => { const b = [0, 0, 0, 0, 0, 0]; for (const x of a) b[Math.min(5, Math.floor(x / 15))]++; return b.join(' '); };
console.log(`semente ${semente}: ${angs.length} carrinhos com portador; hist (0-15,15-30,...,75-90): ${h(angs)}; sem portador: ${frontais.length}; a cortar (>60): ${desvios.length}, desvio ao longo da linha medio ${(desvios.reduce((a, b) => a + b, 0) / Math.max(1, desvios.length)).toFixed(2)} m, >1 m em ${desvios.filter(d => d > 1).length}`);
