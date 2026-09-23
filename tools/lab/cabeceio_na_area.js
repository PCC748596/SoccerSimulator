/*
CABECEIOS DENTRO DA GRANDE ÁREA: quantos vão à baliza e quantos saem em passe?

Relato: *"O Atacante pula sozinho para cabecear dentro da área e cabeceia para
fora da área para dar um passe. Isso não faz nenhum sentido. pq não cabeceia
para o gol?"*

    node tools/lab/cabeceio_na_area.js [segundos] [semente]

A decisão está no `executeHeader` (player.js): remata-se de cabeça dentro de
`HeaderModel.raioRemateCabeca` da distância ao CENTRO DA BALIZA, e fora dele a
cabeçada é passe ou alívio — o passe procura primeiro um MÉDIO, que está atrás.

Aqui envolve-se o `executeHeader` para registar, em cada cabeçada, de onde foi
dada, se o jogador estava marcado e o que saiu de lá.
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

const registos = [];
const original = FootballPlayer.prototype.executeHeader;
FootballPlayer.prototype.executeHeader = function () {
    const x = this.model.position.x, z = this.model.position.z;
    const distGol = Math.hypot(x, this.targetGoalZ - z);
    const profundidade = (this.targetGoalZ - z) * this.dirZ * -1; // metros dentro do campo adversario
    const naArea = Math.abs(x) < Area.meiaLargura &&
        Math.abs(this.targetGoalZ - z) < Area.profundidade &&
        (this.targetGoalZ - z) * this.dirZ > 0;

    // Marcador mais perto, com o mesmo raio que o `executeHeader` usa (2.2 m).
    const advs = (this.team === 'TeamA') ? Match.opponents : Match.players;
    let distMarc = Infinity;
    for (const o of advs) {
        if (!o || !o.model || o.role === 'gk') continue;
        const d = o.model.position.distanceTo(this.model.position);
        if (d < distMarc) distMarc = d;
    }

    window.bolaChutada = false;
    original.call(this);

    if (this.role === 'def') return;      // o alívio do defesa é outro assunto
    registos.push({
        naArea: naArea,
        distGol: distGol,
        sozinho: distMarc > 2.2,
        remate: !!window.bolaChutada,
        zSaida: Match.ballVel ? Match.ballVel.z * this.dirZ : 0
    });
};

/*
CABECEIOS FORCADOS, porque em jogo livre sao raros de mais: 15 minutos dao
cinco, e um so dentro da area. Aqui poe-se um atacante num ponto sorteado da
grande area com a bola a altura da testa, e le-se a DECISAO. E a mesma
tecnica do `--forcar` do dois_toques.js: criar a condicao em vez de esperar
por ela.
*/
const N = Number(process.argv[4] || 400);
const marcado = process.argv.indexOf('--marcado') !== -1;
const atacantes = Match.players.filter(p => p.role !== 'gk' && p.role !== 'def');
const alvo = atacantes[0];
const golZ = alvo.targetGoalZ;

for (let k = 0; k < N; k++) {
    // Ponto sorteado DENTRO da grande area.
    const prof = 1.5 + Math.random() * (Area.profundidade - 2.0);
    const x = (Math.random() * 2 - 1) * (Area.meiaLargura - 1.0);
    const z = golZ - alvo.dirZ * prof;

    alvo.model.position.set(x, ALTURA_BASE_Y, z);
    alvo.jumpTimer = 0.3;
    alvo.hasHeaderedInJump = false;
    Match.ball.position.set(x, alturaTestaDe(alvo), z);
    Match.ballVel.set(0, -2, 0);

    /*
    `--marcado` cola um defesa ao cabeceador; sem ele, todos os adversarios
    vao para longe e o cabeceio e sempre sozinho. Sao os dois casos que a
    regra distingue: livre na area remata, com alguem em cima escora.
    */
    for (const o of Match.opponents) {
        if (o.role === 'gk') continue;
        o.model.position.z = golZ + alvo.dirZ * 20;
    }
    if (marcado) {
        const def = Match.opponents.find(o => o.role !== 'gk');
        if (def) def.model.position.set(x + 0.8, ALTURA_BASE_Y, z + 0.5);
    }
    alvo.executeHeader();
}

const naArea = registos.filter(r => r.naArea);
const f = (n, d) => d ? (100 * n / d).toFixed(0) + '%' : '-';

console.log(`\n${segundos}s, semente ${semente} — cabeceios de jogadores NAO-defesas`);
console.log(`total: ${registos.length};  dentro da grande area: ${naArea.length}`);

console.log('\nDENTRO DA AREA, por distancia ao centro da baliza:');
console.log('  banda            cabeceios   foram remate   sozinhos   sozinhos que remataram');
for (const b of [[0, 8], [8, 11], [11, 14], [14, 18], [18, 99]]) {
    const g = naArea.filter(r => r.distGol >= b[0] && r.distGol < b[1]);
    const so = g.filter(r => r.sozinho);
    console.log(`  ${(b[0] + ' a ' + b[1] + ' m').padEnd(16)} ${String(g.length).padStart(9)} ` +
        `${f(g.filter(r => r.remate).length, g.length).padStart(14)} ` +
        `${String(so.length).padStart(10)} ${f(so.filter(r => r.remate).length, so.length).padStart(24)}`);
}

const soZinhos = naArea.filter(r => r.sozinho);
const recuados = naArea.filter(r => !r.remate && r.zSaida < 0);
console.log(`\nsozinhos dentro da area: ${soZinhos.length}, dos quais remataram ${f(soZinhos.filter(r => r.remate).length, soZinhos.length)}`);
console.log(`cabeceios na area que saíram PARA TRAS: ${recuados.length} (${f(recuados.length, naArea.length)} dos da area)`);
