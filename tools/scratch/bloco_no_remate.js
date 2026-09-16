/*
A DEFESA NO INSTANTE DO REMATE.

Em cada remate mede: quantos defensores estao entre a bola e a baliza (dentro
do corredor que vai do ponto do remate aos dois postes), a que distancia esta o
mais proximo do rematador, e onde esta a linha defensiva em relacao a propria
baliza.

Uso: node tools/scratch/bloco_no_remate.js [segundos]
*/
const segundos = Number(process.argv[2] || 2400);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260918));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const amostras = [];
const orig = global.executeShotGameplay;
global.executeShotGameplay = function (p) {
    const P = p.model.position;
    const golZ = p.targetGoalZ;
    const meia = LARGURA_BALIZA / 2;
    const defensores = (p.team === 'TeamA') ? Match.opponents : Match.players;

    // No corredor entre a bola e a baliza: projecta-se cada defensor na recta
    // ate ao centro da baliza e conta-se quem esta a frente e perto dela.
    let noCorredor = 0, maisPerto = Infinity, linhaSoma = 0, linhaN = 0;
    const dx = 0 - P.x, dz = golZ - P.z;
    const len2 = dx * dx + dz * dz;
    for (const d of defensores) {
        if (!d.model) continue;
        const dist = d.model.position.distanceTo(P);
        if (d.role !== 'gk' && dist < maisPerto) maisPerto = dist;
        if (d.role === 'gk') continue;
        if (d.role === 'def') { linhaSoma += Math.abs(golZ - d.model.position.z); linhaN++; }
        const t = ((d.model.position.x - P.x) * dx + (d.model.position.z - P.z) * dz) / Math.max(1e-6, len2);
        if (t <= 0 || t >= 1) continue;
        const projX = P.x + t * dx, projZ = P.z + t * dz;
        const desvio = Math.hypot(d.model.position.x - projX, d.model.position.z - projZ);
        // Corredor que abre ate a largura da baliza ao chegar la.
        if (desvio <= 1.2 + meia * t) noCorredor++;
    }
    // Alguem o estava a MARCAR?
    let marcador = null;
    for (const d of defensores) {
        if (d.markingTarget === p) { marcador = d; break; }
    }
    amostras.push({
        marcado: !!marcador,
        distMarcador: marcador ? marcador.model.position.distanceTo(P) : null,
        noCorredor: noCorredor,
        maisPerto: (maisPerto === Infinity) ? 99 : maisPerto,
        dist: Math.hypot(P.x, golZ - P.z),
        naArea: Math.abs(golZ - P.z) <= 16.5 && Math.abs(P.x) <= 20.16,
        linha: linhaN ? linhaSoma / linhaN : null
    });
    return orig(p);
};

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

function resumo(nome, lista) {
    if (!lista.length) { console.log(nome + ': sem amostras'); return; }
    const m = (f) => lista.reduce((a, e) => a + f(e), 0) / lista.length;
    const semNinguem = lista.filter(e => e.noCorredor === 0).length;
    console.log(nome.padEnd(16) + String(lista.length).padStart(4) + ' remates | defensores no corredor: media ' +
        m(e => e.noCorredor).toFixed(2) + ' | sem NINGUEM pela frente: ' +
        (100 * semNinguem / lista.length).toFixed(0) + '% | marcador mais perto: ' +
        m(e => e.maisPerto).toFixed(2) + ' m | linha defensiva a ' + m(e => e.linha).toFixed(1) + ' m da baliza');
    const comMarcador = lista.filter(e => e.marcado);
    console.log(''.padEnd(16) + '  com marcador atribuido: ' + comMarcador.length + ' de ' + lista.length +
        ' (' + (100 * comMarcador.length / lista.length).toFixed(0) + '%)' +
        (comMarcador.length ? ' | esse marcador a ' +
            (comMarcador.reduce((a, e) => a + e.distMarcador, 0) / comMarcador.length).toFixed(2) + ' m' : ''));
}
resumo('todos', amostras);
resumo('dentro da area', amostras.filter(e => e.naArea));
resumo('fora da area', amostras.filter(e => !e.naArea));
