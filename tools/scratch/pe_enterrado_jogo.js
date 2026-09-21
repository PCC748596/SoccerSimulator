/*
QUANTO ENTRA A CHUTEIRA NO RELVADO, EM JOGO.

Le, a cada frame e para quem esta em movimento, o ponto mais baixo da malha da
chuteira. `y` negativo = abaixo do plano do relvado.
*/
const segundos = Number(process.argv[2] || 120);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 4242));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
/*
`Sim.running` FICA FALSO DE PROPOSITO. O `player.update` faz
`const headless = Sim.running` e so chama o `animateBones` quando isso e
falso — e e dentro do animateBones que vive o `assentarNoChao`. Com
`Sim.running = true` (o que os outros scratch fazem, para poupar trabalho)
esta medicao lia o rig por animar, ou seja media coisa nenhuma.
*/
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = false;
const _box = new THREE.Box3();

const porEstado = new Map();
let pior = { y: Infinity };
const profundos = new Map();   // quem enterra MAIS de 10 cm, por estado
const todos = () => Match.players.concat(Match.opponents);

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const p of todos()) {
        const vel = Math.hypot(p.velocity.x, p.velocity.z);
        if (vel < 0.5) continue;
        p.model.updateMatrixWorld(true);
        for (const nome of ['lFoot', 'rFoot']) {
            const pe = p.rig && p.rig[nome];
            if (!pe) continue;
            _box.setFromObject(pe);
            const y = _box.min.y;
            const est = 'vel ' + (Math.floor(vel) + '-' + (Math.floor(vel) + 1)).padStart(5);
            if (!porEstado.has(est)) porEstado.set(est, { n: 0, enterrados: 0, min: Infinity, soma: 0 });
            const e = porEstado.get(est);
            e.n++; e.soma += y;
            if (y < -0.005) e.enterrados++;
            if (y < e.min) e.min = y;
            const estadoReal = (p.fsm && p.fsm.currentState) || '?';
            if (y < pior.y) pior = { y, est: estadoReal, vel, nome, corpoY: p.model.position.y, role: p.role };
            if (y < -0.10) { profundos.set(estadoReal, (profundos.get(estadoReal) || 0) + 1); }
        }
    }
}

console.log('ALTURA_BASE_Y = ' + ALTURA_BASE_Y.toFixed(3) + '   (y=0 e o plano do relvado)\n');
console.log('faixa               amostras   % enterrada   y medio    y minimo');
const linhas = [...porEstado.entries()].sort();
for (const [est, e] of linhas) {
    console.log('  ' + est.padEnd(20) + String(e.n).padStart(7) + '   ' +
        (100 * e.enterrados / e.n).toFixed(1).padStart(8) + '%   ' +
        (e.soma / e.n).toFixed(3).padStart(7) + '   ' + e.min.toFixed(3).padStart(7));
}
console.log('\npior caso: y ' + pior.y.toFixed(3) + '  estado ' + pior.est +
    '  vel ' + pior.vel.toFixed(1) + '  ' + pior.nome + '  corpo.y ' + pior.corpoY.toFixed(3));
