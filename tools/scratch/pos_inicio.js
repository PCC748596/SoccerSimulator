require('../headless/harness.js');
const { FORM, equipaMgr } = require('../headless/fixtures_manager.js');
global.Sim = global.Sim || {}; Sim.running = false;
Match.init(new THREE.Scene());
Officials.arbitro = null; Officials.init(new THREE.Scene());
const c = equipaMgr('Fluminense-RJ', FORM['4-4-2']);
const f = equipaMgr('Internacional-RS', FORM['4-3-3']);
const msg = { para: 'simulador3d', tipo: 'preparar', casa: { equipa: c.equipa, jogadoresPorId: c.porId, formacao: { nome: '4-4-2', slots: FORM['4-4-2'] } }, fora: { equipa: f.equipa, jogadoresPorId: f.porId, formacao: { nome: '4-3-3', slots: FORM['4-3-3'] } } };
Ponte.saida = (m) => { if (m.tipo === "erro") console.log("ERRO", m.mensagem); };
const mostrar = (t) => {
    console.log(t, 'estado', Match.state, 'trocados', Lados.trocados, 'bola', Match.ball.position.x.toFixed(1), Match.ball.position.z.toFixed(1));
    for (const [n, l] of [['A', Match.players], ['B', Match.opponents]])
        console.log(' ', n, l.map(p => p.pos + '(' + p.model.position.x.toFixed(0) + ',' + p.model.position.z.toFixed(0) + ')').join(' '));
};
Ponte.aoMensagem(msg); mostrar('preparar');
for (let i = 0; i < 90*60; i++) Match.update(1/60);
console.log('antes da saida', Match.state, Abertura.activa, Abertura.fase);
Ponte.aoMensagem(Object.assign({}, msg, { tipo: 'iniciar', modo: 'visivel' })); mostrar('iniciar');
console.log('abertura', Abertura.activa, Match.state);
for (let i = 0; i < 60*60; i++) { Match.update(1 / 60); if (i % 600 === 0) console.log(i/60|0, 's', Match.state, Abertura.activa, Abertura.fase); }
mostrar('+10s');
process.exit(0);
