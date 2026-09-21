/*
ONDE FICA TODA A GENTE NA COBRANCA DO IMPEDIMENTO.

Relato, com captura de ecra: *"o posicionamento dos jogadores na cobranca de
impedimento nao faz sentido; uns jogadores de um lado do campo e outros do
outro"*. Isto apanha o proximo impedimento, deixa passar uns frames para o
lance assentar, e despeja as 22 posicoes com o lado do campo de cada um.
*/
const segundos = Number(process.argv[2] || 600);
const semente = Number(process.argv[3] || 4242);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(semente);
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let apanhado = null;
const orig = Officials.assinalarImpedimento.bind(Officials);
Officials.assinalarImpedimento = function (marca) {
    const r = orig(marca);
    if (r && !apanhado) apanhado = { marca, frame: 0 };
    return r;
};

function despejar(quando) {
    const bola = Match.ball.position;
    const att = Match.setPieceTeam;
    console.log('\n=== ' + quando + ' ===');
    console.log('estado ' + Match.state + '   cobra ' + att +
        '   bola x ' + bola.x.toFixed(1) + '  z ' + bola.z.toFixed(1));
    const taker = Match.setPieceTaker;
    console.log('batedor: ' + (taker ? (taker.team + ' #' + taker.number + ' ' + taker.role) : 'NENHUM'));
    for (const [nome, lista] of [['TeamA', Match.players], ['TeamB', Match.opponents]]) {
        const dirZ = lista[0].dirZ;
        console.log('  ' + nome + '  (ataca para z ' + (dirZ > 0 ? '+' : '-') + ')' +
            (nome === att ? '  <== COBRA' : '  (defende)'));
        const ordenados = lista.slice().sort((a, b) => a.model.position.z - b.model.position.z);
        for (const p of ordenados) {
            const d = Math.hypot(p.model.position.x - bola.x, p.model.position.z - bola.z);
            console.log('    #' + String(p.number).padStart(2) + ' ' + (p.role || '').padEnd(4) +
                '  x ' + p.model.position.x.toFixed(1).padStart(6) +
                '  z ' + p.model.position.z.toFixed(1).padStart(6) +
                '   dist a bola ' + d.toFixed(1).padStart(5) +
                '   ' + ((p.fsm && p.fsm.currentState) || '?'));
        }
    }
}

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (apanhado) {
        if (apanhado.frame === 0) despejar('NO APITO');
        apanhado.frame++;
        if (apanhado.frame === 60) { despejar('1 s DEPOIS'); }
        if (apanhado.frame === 180) { despejar('3 s DEPOIS'); break; }
    }
}
if (!apanhado) console.log('nenhum impedimento em ' + segundos + ' s (semente ' + semente + ')');
