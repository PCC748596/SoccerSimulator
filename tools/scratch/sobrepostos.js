require('../headless/harness.js');
const { FORM, equipaMgr } = require('../headless/fixtures_manager.js');
global.Sim = global.Sim || {}; Sim.running = false;
Match.init(new THREE.Scene());
Officials.arbitro = null; Officials.init(new THREE.Scene());
Ponte.saida = () => {};
const nomes = Object.keys(FORM);
let maus = 0, total = 0;
for (const fa of nomes) for (const fb of nomes) {
    const c = equipaMgr('Fluminense-RJ', FORM[fa]), f = equipaMgr('Internacional-RS', FORM[fb]);
    AdaptadorManager.prepararPartida({ equipa: c.equipa, jogadoresPorId: c.porId, formacao: { nome: fa, slots: FORM[fa] } }, { equipa: f.equipa, jogadoresPorId: f.porId, formacao: { nome: fb, slots: FORM[fb] } }, {});
    Abertura.jaCorreu = false; Abertura.activa = false; Abertura.aguardarSaida = false; Abertura.iniciar();
    let g = 0; while (Match.state !== "PLAY" && g++ < 60*120) Match.update(1 / 60);
    Match.update(1 / 60);
    // primeira saida de bola: Match.resetPlay ja posicionou; olha para as distancias entre jogadores
    const todos = [...Match.players, ...Match.opponents];
    let min = 99, par = '';
    for (let i = 0; i < todos.length; i++) for (let j = i + 1; j < todos.length; j++) {
        const d = Math.hypot(todos[i].model.position.x - todos[j].model.position.x, todos[i].model.position.z - todos[j].model.position.z);
        if (d < min) { min = d; par = todos[i].team + todos[i].pos + '/' + todos[j].team + todos[j].pos; }
    }
    total++;
    if (min < 1.0) { maus++; console.log(fa, 'x', fb, 'min', min.toFixed(2), par); }
}
console.log('combinacoes com sobreposicao (<1 m):', maus, 'de', total);
process.exit(0);
