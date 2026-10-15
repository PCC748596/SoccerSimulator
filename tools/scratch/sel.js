require('../headless/harness.js');
const { FORM, equipaMgr } = require('../headless/fixtures_manager.js');
Match.init(new THREE.Scene()); Officials.arbitro = null; Officials.init(new THREE.Scene());
const c = equipaMgr('Fluminense-RJ', FORM['4-3-3']), f = equipaMgr('Internacional-RS', FORM['4-4-2']);
AdaptadorManager.prepararPartida({ equipa: c.equipa, jogadoresPorId: c.porId, formacao: { nome: 'a', slots: FORM['4-3-3'] } }, { equipa: f.equipa, jogadoresPorId: f.porId, formacao: { nome: 'b', slots: FORM['4-4-2'] } }, {});
for (const id of ['t-equipa-A', 't-equipa-B']) { const s = document.getElementById(id); console.log(id, s ? s.selectedOptions[0].textContent + ' disabled=' + s.disabled : 'sem select'); }
process.exit(0);
