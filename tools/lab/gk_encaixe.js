/*
O GUARDA-REDES ESTÁ VIRADO PARA A BOLA QUANDO ENCAIXA?

Relato: *"O Goleiro tem que se voltar para a bola para poder encaixar quando o
chute vier em baixo no centro."*

    node tools/lab/gk_encaixe.js [segundos] [semente]

O estado `maos` (encaixe e barreira) é a defesa de perto, e era o único ramo do
guarda-redes que não escrevia a orientação do corpo. Aqui mede-se, em cada
frame desse estado, o ÂNGULO entre a frente do modelo e a direcção da bola —
0 graus é de frente para ela.
*/
require('../headless/harness.js');

const segundos = Number(process.argv[2] || 900);
const semente = Number(process.argv[3] || 1);
let s = semente >>> 0;
Math.random = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = true;

function anguloAteBola(gk) {
    const fx = Math.sin(gk.model.rotation.y), fz = Math.cos(gk.model.rotation.y);
    const dx = Match.ball.position.x - gk.model.position.x;
    const dz = Match.ball.position.z - gk.model.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.001) return 0;
    const cos = Math.max(-1, Math.min(1, (fx * dx + fz * dz) / d));
    return Math.acos(cos) * 180 / Math.PI;
}

const dt = 1 / 60;
const gks = [Match.players[0], Match.opponents[0]].filter(g => g && g.role === 'gk');
const frames = [], episodios = [];
let dentro = new Map();

for (let i = 0; i < segundos * 60; i++) {
    Match.update(dt);
    for (const gk of gks) {
        if (gk.gkEstado === 'maos') {
            const a = anguloAteBola(gk);
            frames.push(a);
            if (!dentro.has(gk)) dentro.set(gk, { inicio: a, pior: a });
            else { const e = dentro.get(gk); if (a > e.pior) e.pior = a; }
        } else if (dentro.has(gk)) {
            episodios.push(dentro.get(gk));
            dentro.delete(gk);
        }
    }
}
for (const e of dentro.values()) episodios.push(e);

const f = (n, d) => d ? (100 * n / d).toFixed(0) + '%' : '-';
console.log(`\n${segundos}s, semente ${semente} — defesas de perto (estado 'maos'): ${episodios.length} episodios, ${frames.length} frames`);
if (!frames.length) { console.log('  (nenhuma)'); process.exit(0); }

const ord = frames.slice().sort((a, b) => a - b);
console.log(`  angulo ate a bola, por frame: mediana ${ord[Math.floor(ord.length / 2)].toFixed(0)} graus, ` +
    `pior ${ord[ord.length - 1].toFixed(0)}`);
for (const b of [[0, 15], [15, 45], [45, 90], [90, 181]]) {
    const n = frames.filter(a => a >= b[0] && a < b[1]).length;
    const nome = b[0] === 0 ? 'de frente (0-15)' : (b[0] === 15 ? 'quase (15-45)'
        : (b[0] === 45 ? 'de lado (45-90)' : 'de costas (90+)'));
    console.log(`    ${nome.padEnd(18)} ${String(n).padStart(6)}  ${f(n, frames.length)}`);
}
const inicios = episodios.map(e => e.inicio).sort((a, b) => a - b);
console.log(`\n  no PRIMEIRO frame de cada defesa: mediana ${inicios[Math.floor(inicios.length / 2)].toFixed(0)} graus, ` +
    `pior ${inicios[inicios.length - 1].toFixed(0)}`);
console.log(`  defesas que comecaram a mais de 45 graus da bola: ` +
    `${episodios.filter(e => e.inicio > 45).length} de ${episodios.length}`);
