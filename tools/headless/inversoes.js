/*
INVERSÕES DE JOGO: quantos passes mudam a bola de lado, e quantos recuam para o fazer.

Relato: *"está tendo pouca inversão de jogo por passes mais curtos... os times podem voltar
um pouco a bola, com passes para trás, para inverter as jogadas"*, em especial com os
sectores Left e Right ligados.

Mede, por passe (o contexto vem do `registarPasseIniciado`, em fsm.js):
  . largura do passe |dx| em 4 faixas (<10, 10-20, 20-30, >30 m);
  . INVERSÃO = o passe troca a bola de lado do campo (|x| > 8 dos dois lados, sinais opostos)
    com |dx| >= 20 m;
  . passes para trás (progressão < -3 m no referencial de ataque) e, destes, os que invertem.

Uso: node tools/headless/inversoes.js [segundos] [semente] [setores: todos|lr|esq|dir|cen]
*/
const segundos = Number(process.argv[2] || 900);
const semente = Number(process.argv[3] || 0);
const setores = process.argv[4] || 'todos';

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(1000 + semente * 977);

require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const mapa = { todos: ['esq', 'cen', 'dir'], lr: ['esq', 'dir'], esq: ['esq'], dir: ['dir'], cen: ['cen'] };
const scene = new THREE.Scene();
Match.init(scene);
if (Tatics.setores !== undefined) Tatics.setores = mapa[setores] || mapa.todos;

// Varredura sem tocar no config: IVB=<bónus> IVC=<congestaoMin> IVF=<folga>
if (process.env.IVB) InversaoDeJogo.bonus = Number(process.env.IVB);
if (process.env.IVC) InversaoDeJogo.congestaoMin = Number(process.env.IVC);
if (process.env.IVF) InversaoDeJogo.folgaCongestao = Number(process.env.IVF);
if (process.env.IVOFF) InversaoDeJogo.activo = false;

const lista = [];
const orig = MatchStats.registarPasseIniciado.bind(MatchStats);
MatchStats.registarPasseIniciado = function (team, tipo, dados) {
    if (dados && dados.origem && dados.destino) lista.push({ team, tipo, ...dados });
    return orig(team, tipo, dados);
};

const dt = 1 / 60;
for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

const faixas = [0, 0, 0, 0];
let bandaMuda = 0, inv = 0, tras = 0, trasInv = 0, curtos = 0;
for (const p of lista) {
    const dx = Math.abs(p.destino.x - p.origem.x);
    faixas[dx < 10 ? 0 : dx < 20 ? 1 : dx < 30 ? 2 : 3]++;
    const prog = (p.destino.z - p.origem.z) * p.dirZ;
    const troca = Math.abs(p.origem.x) > 8 && Math.abs(p.destino.x) > 8 &&
        Math.sign(p.origem.x) !== Math.sign(p.destino.x);
    const inverte = troca && dx >= 20;
    if (inverte) inv++;
    // Mudança de BANDA com >= 18 m de largura (inclui o flanco para o meio e o meio para o flanco).
    const banda = (x) => (x < -10 ? 0 : (x > 10 ? 2 : 1));
    if (banda(p.origem.x) !== banda(p.destino.x) && dx >= 18) bandaMuda++;
    if (prog < -3) { tras++; if (inverte) trasInv++; }
    if (p.dist < 12) curtos++;
}
const n = Math.max(1, lista.length), min = Match.tempoDeJogo / 60;
const pc = (x) => (100 * x / n).toFixed(1) + '%';
console.log(`\nsetores=${setores} semente=${semente} | ${lista.length} passes em ${min.toFixed(1)} min`);
console.log(`  |dx| <10: ${pc(faixas[0])}  10-20: ${pc(faixas[1])}  20-30: ${pc(faixas[2])}  >30: ${pc(faixas[3])}`);
console.log(`  inversões (troca de lado, >=20 m): ${inv} = ${pc(inv)}  (${(inv * 90 / min).toFixed(1)}/90 min)`);
console.log(`  mudam de banda (>=18 m): ${bandaMuda} = ${pc(bandaMuda)}`);
console.log(`  passes para trás: ${tras} = ${pc(tras)}; destes invertem ${trasInv}`);
console.log(`  passes curtos (<12 m): ${pc(curtos)}\n`);
const tentados = MatchStats.TeamA.passes.tentados + MatchStats.TeamB.passes.tentados;
console.log(`  (MatchStats: ${tentados} passes curtos tentados; registados aqui: ${lista.length})\n`);
