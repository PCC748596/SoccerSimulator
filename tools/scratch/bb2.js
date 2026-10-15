require('../headless/harness.js');
const { FORM, equipaMgr } = require('../headless/fixtures_manager.js');
Match.init(new THREE.Scene());
Officials.arbitro = null; Officials.init(new THREE.Scene());
const a = TeamAI.get('TeamA'), b = TeamAI.get('TeamB'); // o quadro nasce com os lados de origem, como no navegador
console.log('antes', a.dir, a.atkGoalZ);
if (process.argv[2] === 'sem') AdaptadorManager._refrescarLados = () => {};
const c = equipaMgr('Fluminense-RJ', FORM['4-3-3']), f = equipaMgr('Internacional-RS', FORM['4-4-2']);
AdaptadorManager.prepararPartida({ equipa: c.equipa, jogadoresPorId: c.porId, formacao: { nome: '4-3-3', slots: FORM['4-3-3'] } }, { equipa: f.equipa, jogadoresPorId: f.porId, formacao: { nome: '4-4-2', slots: FORM['4-4-2'] } }, {});
console.log('depois: Lados', Lados.dirDe('TeamA'), 'bb.dir', TeamAI.get('TeamA').dir, 'atkGoalZ', TeamAI.get('TeamA').atkGoalZ);
process.exit(0);
