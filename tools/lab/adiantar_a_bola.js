/*
O ATACANTE COM ESPAÇO À FRENTE ADIANTA A BOLA, OU LARGA-A?

Relato: *"Os atacantes não estão adiantando a bola quando tem espaço livre a
frente, sem marcação pela frente."*

    node tools/lab/adiantar_a_bola.js [segundos] [semente]

Mede POSSES, não frames: cada vez que um atacante fica com a bola no
meio-campo adversário, regista-se o espaço livre à frente dele nesse instante e
o que ele faz com a posse — quantos metros progride na direcção da baliza e se
chega a entrar em CARRY.

O espaço à frente é calculado como no `PlayerContext` (player_bt.js): o
adversário mais próximo dentro do corredor que abre com a distância. Está
replicado aqui, mas a ABERTURA vem da mesma constante que o jogo usa
(`CarryModel.aberturaCorredor`) — na primeira versão estava a fórmula copiada,
e quando o jogo mudou de fórmula a medição continuou a medir a antiga e deu a
entender que a correcção não tinha feito nada.
*/
require('../headless/harness.js');

const segundos = Number(process.argv[2] || 600);
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

const ATACANTES = ['CF', 'ST', 'SS', 'LW', 'RW', 'AM'];

function espacoAFrente(p) {
    const advs = (p.team === 'TeamA') ? Match.opponents : Match.players;
    const tec = p.skillFor ? p.skillFor('TEC') : 50;
    const maxVis = (typeof alcanceVisao === 'function') ? alcanceVisao(tec, 15.0) : 15.0;
    // A MESMA abertura do jogo: fixa, e nao o cone de visao. Ver
    // CarryModel.aberturaCorredor (config/player_behavior.js).
    const abertura = (typeof CarryModel.aberturaCorredor === 'number')
        ? CarryModel.aberturaCorredor
        : Math.tan((typeof coneVisao === 'function') ? coneVisao(tec) : 0.35);
    let melhor = Infinity;
    for (const o of advs) {
        if (!o || !o.model || o.role === 'gk') continue;
        const dz = (o.model.position.z - p.model.position.z) * p.dirZ;
        if (dz <= 0 || dz > maxVis) continue;
        const dx = Math.abs(o.model.position.x - p.model.position.x);
        if (dx > CarryModel.corredor + dz * abertura) continue;
        if (dz < melhor) melhor = dz;
    }
    return melhor;
}

const dt = 1 / 60;
let dono = null, posse = null;
const bandas = [
    { nome: '3 a 6 m', min: 3, max: 6 },
    { nome: '6 a 10 m', min: 6, max: 10 },
    { nome: '10 a 15 m', min: 10, max: 15 },
    { nome: 'livre (>15 m)', min: 15, max: Infinity },
];
for (const b of bandas) { b.posses = 0; b.comCarry = 0; b.metros = 0; b.zeroMetros = 0; }

function fecharPosse() {
    if (!posse) return;
    const b = bandas.find(x => posse.espaco >= x.min && posse.espaco < x.max);
    if (b) {
        b.posses++;
        if (posse.carry) b.comCarry++;
        b.metros += posse.ganho;
        if (posse.ganho < 0.5) b.zeroMetros++;
    }
    posse = null;
}

for (let i = 0; i < segundos * 60; i++) {
    Match.update(dt);

    const c = Match.ballCarrier;
    if (c !== dono) {
        fecharPosse();
        dono = c;
        if (c && c.model && ATACANTES.indexOf(c.pos) !== -1) {
            const za = c.model.position.z * c.dirZ;
            if (za > 0) {
                posse = { p: c, espaco: espacoAFrente(c), z0: za, ganho: 0, carry: false };
            }
        }
    }
    if (posse && posse.p === c) {
        posse.ganho = Math.max(posse.ganho, c.model.position.z * c.dirZ - posse.z0);
        if (c.fsm && c.fsm.currentState === 'CARRY') posse.carry = true;
    }
}
fecharPosse();

console.log(`\n${segundos}s, semente ${semente} — posses de ATACANTE no meio-campo adversario`);
console.log('espaco a frente     posses   entrou em CARRY   metros ganhos (media)   posses sem ganhar 0.5 m');
for (const b of bandas) {
    const pct = b.posses ? (100 * b.comCarry / b.posses).toFixed(0) + '%' : '-';
    const md = b.posses ? (b.metros / b.posses).toFixed(1) : '-';
    const pz = b.posses ? (100 * b.zeroMetros / b.posses).toFixed(0) + '%' : '-';
    console.log(`  ${b.nome.padEnd(16)} ${String(b.posses).padStart(6)} ${String(pct).padStart(16)} ` +
        `${String(md).padStart(22)} ${String(pz).padStart(24)}`);
}
