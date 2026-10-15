require('../headless/harness.js');
const { FORM, equipaMgr } = require('../headless/fixtures_manager.js');
global.Sim = global.Sim || {}; Sim.running = true;
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Match.init(new THREE.Scene());
Officials.arbitro = null; Officials.init(new THREE.Scene());
for (const esq of [true, false]) {
    Math.random = mulberry32(5);
    const c = equipaMgr('Fluminense-RJ', FORM['4-3-3']), f = equipaMgr('Internacional-RS', FORM['4-4-2']);
    AdaptadorManager.prepararPartida({ equipa: c.equipa, jogadoresPorId: c.porId, formacao: { nome: '4-3-3', slots: FORM['4-3-3'] } }, { equipa: f.equipa, jogadoresPorId: f.porId, formacao: { nome: '4-4-2', slots: FORM['4-4-2'] } }, { casaEsquerda: esq });
    const acc = { A: { s: 0, n: 0, gols: 0 }, B: { s: 0, n: 0 } };
    for (let i = 0; i < 60 * 240; i++) {
        Match.update(1 / 60);
        if (i % 30 === 0 && Match.state === 'PLAY') {
            for (const [k, l] of [['A', Match.players], ['B', Match.opponents]]) {
                const dir = Lados.dirDe('Team' + k);
                for (const p of l) if (p.role === 'atk') { acc[k].s += p.model.position.z * dir; acc[k].n++; }
            }
        }
    }
    console.log('casaEsquerda', esq, 'trocados', Lados.trocados, 'z medio dos atacantes no sentido de ataque (A,B):', (acc.A.s / acc.A.n).toFixed(1), (acc.B.s / acc.B.n).toFixed(1), 'placar', Match.placarA, Match.placarB);
}
process.exit(0);
