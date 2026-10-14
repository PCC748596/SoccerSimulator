/*
O TEMPO DE POSSE POR CORREDOR (Left / Center / Right) e o empurrao do passe (BalancoCorredores).
Corre o jogo e imprime, por equipa, a fraccao do tempo com a bola em cada corredor (acumulada e na janela), contra o
alvo dos corredores ligados, e quantas inversoes de corredor houve (a bola a mudar de corredor num passe).

SEM=1 desliga o empurrao (so mede). SETORES=esq,dir | esq | nenhum  escolhe os corredores ligados.
Uso: node tools/headless/corredores.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 600);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
Match.init(new THREE.Scene());
if (process.env.SETORES) Tatics.setores = process.env.SETORES === 'nenhum' ? [] : process.env.SETORES.split(',');
if (process.env.SEM) BalancoCorredores.activo = false;
if (process.env.SEMINV) BalancoCorredores.inversao.activo = false;
if (process.env.PTS) BalancoCorredores.pontosPasse = Number(process.env.PTS);
TempoPorCorredor.reset();

const dt = 1 / 60;
let sinais = { TeamA: 0, TeamB: 0 }, sinalAnt = { TeamA: null, TeamB: null }, framesSup = 0, passesAoApoio = 0, apoioAnt = null;
let ultimo = null; const trocas = { TeamA: 0, TeamB: 0 }; let passes = 0;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const tm of ['TeamA', 'TeamB']) { const sg = InversaoSinalizada.sinal(tm); if (sg && sg !== sinalAnt[tm]) sinais[tm]++; sinalAnt[tm] = sg; }
    for (const p of Match.players.concat(Match.opponents)) if (p.fsm.currentState === 'SUP_TO_INVERT') framesSup++;
    // uma troca de corredor da bola com a MESMA equipa a ter a posse (a bola andou de lado)
    const t = Match.possessionTeam;
    if (Match.state === 'PLAY' && (t === 'TeamA' || t === 'TeamB')) {
        const e = TempoPorCorredor._de(t);
        if (ultimo && ultimo.team === t && ultimo.cor !== e.atual) trocas[t]++;
        ultimo = { team: t, cor: e.atual };
    }
}
const a = TempoPorCorredor.alvo();
const f = (x) => (100 * x).toFixed(0).padStart(3) + '%';
console.log(`semente ${semente}, setores [${Tatics.setores.join(',')}], empurrao ${BalancoCorredores.activo ? 'ligado' : 'desligado'} | alvo esq ${f(a.esq)} cen ${f(a.cen)} dir ${f(a.dir)}`);
for (const team of ['TeamA', 'TeamB']) {
    const r = TempoPorCorredor.resumo(team);
    console.log(`  ${team}: ${r.segundos.toFixed(0)} s de posse | acumulado esq ${f(r.esq)} cen ${f(r.cen)} dir ${f(r.dir)} | janela esq ${f(r.janela.esq)} cen ${f(r.janela.cen)} dir ${f(r.janela.dir)} | trocas de corredor ${trocas[team]} | sinais de inversao ${sinais[team]}`);
}
console.log(`  frames de jogador em SUP_TO_INVERT: ${framesSup} (${(framesSup / 60).toFixed(0)} s-jogador)`);
