require('../headless/harness.js');
const { FORM, equipaMgr } = require('../headless/fixtures_manager.js');
global.Sim = global.Sim || {}; Sim.running = true;
Match.init(new THREE.Scene());
Officials.arbitro = null; Officials.init(new THREE.Scene());
for (const esq of [true, false]) {
    const c = equipaMgr('Fluminense-RJ', FORM['4-3-3']), f = equipaMgr('Internacional-RS', FORM['4-4-2']);
    AdaptadorManager.prepararPartida({ equipa: c.equipa, jogadoresPorId: c.porId, formacao: { nome: '4-3-3', slots: FORM['4-3-3'] } }, { equipa: f.equipa, jogadoresPorId: f.porId, formacao: { nome: '4-4-2', slots: FORM['4-4-2'] } }, { casaEsquerda: esq });
    for (const [k, l] of [['A', Match.players], ['B', Match.opponents]]) {
        const dir = Lados.dirDe('Team' + k);
        console.log('esq', esq, k, 'dir', dir, l.map(p => p.pos + ':' + p.role + '@' + (p.baseTarget.z * dir).toFixed(0)).join(' '));
    }
    // a baliza que cada equipa ataca: onde a bola entra quando A marca
    console.log('  golA em z', Match.golo ? '' : '', 'GK A z', Match.players[0].model.position.z.toFixed(0), 'GK B z', Match.opponents[0].model.position.z.toFixed(0));
}
process.exit(0);
