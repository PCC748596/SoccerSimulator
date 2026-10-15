/*
Dados "do manager" para os testes da ponte: as formacoes do manager (types.ts, FORMATIONS) e uma funcao que monta uma equipa no formato
dele (jogadores p-<id>, escalacao pela ordem dos slots) a partir de uma equipa real do simulador. Exige o harness ja carregado.
*/
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
const paraManager = (j) => ({
    id: 'p-' + j.id, name: j.nome, position: (j.pos === 'CF' ? 'ST' : j.pos), skill: Math.round((j.tec + j.pass + j.marking + j.speed) / 4),
    fitness: 85, morale: 55, def: j.marking, pas: j.pass, drb: j.tec, sht: j.tec, shirtNumber: j.numero || 1
});
function equipaMgr(nomeReal, slots, tactics) {
    const real = SquadsData.equipas.find(e => e.nome === nomeReal);
    const usados = new Set(), lineup = [], porId = {};
    for (const s of slots) {
        const pos = AdaptadorManager.POS_DO_ROTULO[s.label];
        const melhor = real.plantel.filter(j => !usados.has(j.id)).sort((a, b) => ((b.pb && b.pb[pos]) || 0) - ((a.pb && a.pb[pos]) || 0))[0];
        usados.add(melhor.id);
        const mp = paraManager(melhor); porId[mp.id] = mp; lineup.push(mp.id);
    }
    return { equipa: { id: 'T-' + nomeReal, name: nomeReal, city: '', lineup: lineup, bench: [], tactics: tactics || { style: 'Balanced' } }, porId: porId, ids: lineup };
}
module.exports = { FORM, paraManager, equipaMgr };
