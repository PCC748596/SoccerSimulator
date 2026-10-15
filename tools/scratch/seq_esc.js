require('../headless/harness.js');
const { FORM, equipaMgr } = require('../headless/fixtures_manager.js');
global.Sim = global.Sim || {}; Sim.running = false;
Match.init(new THREE.Scene());
Officials.arbitro = null; Officials.init(new THREE.Scene());
const c = equipaMgr('Fluminense-RJ', FORM['4-4-2']), f = equipaMgr('Internacional-RS', FORM['4-3-3']);
const msg = { para: 'simulador3d', casa: { equipa: c.equipa, jogadoresPorId: c.porId, formacao: { nome: '4-4-2', slots: FORM['4-4-2'] } }, fora: { equipa: f.equipa, jogadoresPorId: f.porId, formacao: { nome: '4-3-3', slots: FORM['4-3-3'] } } };
const log = [];
Ponte.saida = (m) => { log.push(m.tipo); if (m.tipo === 'erro') console.log('ERRO', m.mensagem); };
Ponte.aoMensagem({ ...msg, tipo: 'preparar' });
const rodar = (s) => { for (let i = 0; i < s * 60; i++) Match.update(1 / 60); };
rodar(5);
if (process.argv[2] === 'esc') { Abertura.cancelar(); console.log('apos ESC', Match.state, 'segurar', Match.segurarSaida); }
else rodar(60);
console.log('antes saida', Match.state, 'tempo', Match.tempoDeJogo.toFixed(1));
rodar(5);
Ponte.aoMensagem({ ...msg, tipo: 'iniciar', modo: 'visivel', velocidade: 1, fimEmMinutos: 90 });
console.log('iniciou: estado ponte', Ponte.estado, 'Match', Match.state, 'paused', window.isPaused);
try { rodar(30); } catch (e) { console.log('EXC', e.stack.split('\n').slice(0, 4).join('|')); }
console.log('apos 30s', Match.state, 'tempo', Match.tempoDeJogo.toFixed(1), log.join(','));
process.exit(0);
