/*
O ADAPTADOR DO MANAGER (js/narracao/adaptador_manager.js). Monta equipas no formato do manager (jogadores `p-<id>`, escalacao pela ordem
dos slots, as 7 formacoes do manager copiadas de types.ts) e confere que o motor as aceita: onze em campo com um guarda-redes, as
posicoes batem com os slots, os jogadores escalados sao os escalados (e nao os que o motor escolheria), e o jogo corre sem erro.
*/
require('../tools/headless/harness.js');
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = true;
let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

// As formacoes do manager (types.ts, FORMATIONS): label por slot; x/y como no manager.
const L = (...a) => a.map((r, i) => ({ id: i, label: r[0], x: r[1], y: r[2] }));
const FORM = {
    '4-4-2': L(['GK',50,88],['LB',15,72],['CB',38,75],['CB',62,75],['RB',85,72],['LM',15,45],['CM',38,50],['CM',62,50],['RM',85,45],['ST',35,18],['ST',65,18]),
    '4-3-3': L(['GK',50,88],['LB',15,72],['CB',38,75],['CB',62,75],['RB',85,72],['DM',50,53],['CM',32,48],['CM',68,48],['LW',20,22],['ST',50,15],['RW',80,22]),
    '4-3-3 ATA': L(['GK',50,88],['LB',15,72],['CB',38,75],['CB',62,75],['RB',85,72],['CM',35,55],['CM',65,55],['AM',50,38],['LW',20,22],['ST',50,15],['RW',80,22]),
    '3-5-2': L(['GK',50,88],['CB',25,75],['CB',50,78],['CB',75,75],['LM',10,45],['DM',30,47],['CM',50,55],['DM',70,47],['RM',90,45],['SS',40,18],['ST',60,18]),
    '5-4-1': L(['GK',50,88],['LB',15,72],['CB',32,75],['CB',50,78],['CB',68,75],['RB',85,72],['LM',20,48],['CM',40,52],['CM',60,52],['RM',80,48],['ST',50,18]),
    '4-2-3-1': L(['GK',50,88],['LB',15,72],['CB',38,75],['CB',62,75],['RB',85,72],['DM',35,55],['DM',65,55],['LW',20,35],['AM',50,38],['RW',80,35],['ST',50,15]),
    '5-3-2': L(['GK',50,88],['LB',15,72],['CB',32,75],['CB',50,78],['CB',68,75],['RB',85,72],['CM',30,52],['DM',50,50],['CM',70,52],['SS',40,18],['ST',60,18])
};

Match.init(new THREE.Scene());
const eqReal = (nome) => SquadsData.equipas.find(e => e.nome === nome);
// Um jogador "do manager" a partir de um do simulador (ids p-<id>, posicao em rotulos do manager).
const paraManager = (j) => ({
    id: 'p-' + j.id, name: j.nome, position: (j.pos === 'CF' ? 'ST' : j.pos), skill: Math.round((j.tec + j.pass + j.marking + j.speed) / 4),
    fitness: 85, morale: 55, def: j.marking, pas: j.pass, drb: j.tec, sht: j.tec, shirtNumber: j.numero || 1
});
function equipaMgr(nomeReal, slots) {
    const real = eqReal(nomeReal);
    const usados = new Set(), lineup = [], porId = {};
    const posDoRotulo = AdaptadorManager.POS_DO_ROTULO;
    for (const s of slots) {
        const pos = posDoRotulo[s.label];
        const melhor = real.plantel.filter(j => !usados.has(j.id)).sort((a, b) => ((b.pb && b.pb[pos]) || 0) - ((a.pb && a.pb[pos]) || 0))[0];
        usados.add(melhor.id);
        const mp = paraManager(melhor); porId[mp.id] = mp; lineup.push(mp.id);
    }
    return { equipa: { id: 'T-' + nomeReal, name: nomeReal, city: '', lineup: lineup, bench: [], tactics: { style: 'Offensive' } }, porId: porId, ids: lineup };
}

for (const nome of Object.keys(FORM)) {
    const slots = FORM[nome];
    const c = equipaMgr('Flamengo-RJ', slots), f = equipaMgr('Palmeiras-SP', FORM['4-4-2']);
    Math.random = (function (a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(5);
    try {
        AdaptadorManager.prepararPartida(
            { equipa: c.equipa, jogadoresPorId: c.porId, formacao: { nome: nome, slots: slots } },
            { equipa: f.equipa, jogadoresPorId: f.porId, formacao: { nome: '4-4-2', slots: FORM['4-4-2'] } });
    } catch (e) { erro(nome + ': prepararPartida falhou: ' + e.message); continue; }
    if (Match.players.length !== 11) erro(nome + ': a casa tem ' + Match.players.length + ' jogadores');
    if (Match.opponents.length !== 11) erro(nome + ': o visitante tem ' + Match.opponents.length + ' jogadores');
    if (Match.players.filter(p => p.role === 'gk').length !== 1) erro(nome + ': a casa nao tem exactamente um guarda-redes');
    const posEsperadas = slots.map(s => posDoRotuloEsperada(s.label)).sort().join(',');
    const posReais = Match.players.map(p => p.pos).sort().join(',');
    if (posEsperadas !== posReais) erro(nome + ': posicoes ' + posReais + ' != slots ' + posEsperadas);
    const idsEmCampo = Match.players.map(p => 'p-' + p.skills.id).sort().join(',');
    if (idsEmCampo !== c.ids.slice().sort().join(',')) erro(nome + ': o onze em campo nao e o escalado');
    const dt = 1 / 60; let nan = 0;
    try { for (let i = 0; i < 60 * 90; i++) { Match.update(dt); } } catch (e) { erro(nome + ': o jogo deu erro: ' + e.message); continue; }
    for (const p of Match.players.concat(Match.opponents)) { const q = p.model.position; if (!isFinite(q.x + q.z)) nan++; }
    if (nan) erro(nome + ': ' + nan + ' jogadores com posicao invalida');
    console.log('  ' + nome.padEnd(10) + ' ok: ' + posReais + ' | Eventos ' + Eventos.lista.length);
}
function posDoRotuloEsperada(l) { return AdaptadorManager.POS_DO_ROTULO[l]; }
if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK adaptador_manager');
