/*
A tatica do manager chega ao motor e ao painel do 3D (mensagem `tatica`) e a do painel volta ao manager (`tatica_alterada`), sem eco:
o que o manager manda nao e devolvido; o que o utilizador muda no painel e. Tambem: o painel nao repoe a formacao do manager.
*/
require('../tools/headless/harness.js');
const { FORM, equipaMgr } = require('../tools/headless/fixtures_manager.js');
let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
Match.init(new THREE.Scene());
Officials.arbitro = null; Officials.init(new THREE.Scene());
const enviadas = [];
Ponte.saida = (m) => enviadas.push(m);
const c = equipaMgr('Fluminense-RJ', FORM['4-3-3']), f = equipaMgr('Internacional-RS', FORM['4-4-2']);
const base = { para: 'simulador3d', casa: { equipa: c.equipa, jogadoresPorId: c.porId, formacao: { nome: '4-3-3', slots: FORM['4-3-3'] } }, fora: { equipa: f.equipa, jogadoresPorId: f.porId, formacao: { nome: '4-4-2', slots: FORM['4-4-2'] } } };
Ponte.aoMensagem(Object.assign({ tipo: 'preparar' }, base));
const chaveCasa = Tatics.formacaoA;
if (!/^mgr:/.test(chaveCasa)) erro('a formacao do manager nao ficou no motor: ' + chaveCasa);

// painel esquerdo: Equipa A = casa, Equipa B = visitante
const selA = document.getElementById('t-equipa-A'), selB = document.getElementById('t-equipa-B');
if (selA && selA.selectedOptions[0].textContent.indexOf('Fluminense-RJ') !== 0) erro('Equipa A no painel nao e a casa: ' + selA.selectedOptions[0].textContent);
if (selB && selB.selectedOptions[0].textContent.indexOf('Internacional-RS') !== 0) erro('Equipa B no painel nao e a visitante: ' + selB.selectedOptions[0].textContent);

// manager -> motor
Ponte.aoMensagem({ para: 'simulador3d', tipo: 'tatica', estilo: 'ataque', linhaDefensiva: 'high', pressaoDefensiva: 'high', teamPlayStyle: 'direct', setores: ['esq'] });
if (Tatics.estilo !== 'ataque') erro('estilo nao aplicado: ' + Tatics.estilo);
if (Tatics.linhaDefensiva !== 'high') erro('linha nao aplicada: ' + Tatics.linhaDefensiva);
if (Tatics.pressaoDefensiva !== 'high') erro('pressao nao aplicada (a mentalidade nao pode ganhar): ' + Tatics.pressaoDefensiva);
if (Tatics.teamPlayStyle !== 'direct') erro('estilo ofensivo nao aplicado: ' + Tatics.teamPlayStyle);
if (JSON.stringify(Tatics.setores) !== '["esq"]') erro('setores nao aplicados: ' + JSON.stringify(Tatics.setores));
if (document.getElementById('t-estilo') && document.getElementById('t-estilo').value !== 'ataque') erro('o painel nao mostra o estilo do manager');
if (enviadas.some(m => m.tipo === 'tatica_alterada')) erro('o que o manager mandou voltou como eco');
if (Tatics.formacaoA !== chaveCasa) erro('o painel repos a formacao do manager: ' + Tatics.formacaoA);

// painel -> manager
const sel = document.getElementById('t-linha');
if (sel) { sel.value = 'low'; Tatics.update(); }
const alt = enviadas.filter(m => m.tipo === 'tatica_alterada');
if (!alt.length) erro('a alteracao no painel nao foi para o manager');
else if (alt[alt.length - 1].linhaDefensiva !== 'low') erro('o manager recebeu a linha errada: ' + alt[alt.length - 1].linhaDefensiva);

// camera e zoom
Ponte.aoMensagem({ para: 'simulador3d', tipo: 'camera', modo: 'topdown' });
if (window.cameraMode !== 'topdown') erro('a camara nao mudou: ' + window.cameraMode);
const z0 = window.cameraZoom || 1;
Ponte.aoMensagem({ para: 'simulador3d', tipo: 'zoom', fator: 0.5 });
if (!((window.cameraZoom || 1) < z0)) erro('o zoom nao mudou');

// ESC e Pause do 3D pedem ao manager em vez de mexer no jogo
enviadas.length = 0;
Abertura.cancelar();
if (!enviadas.some(m => m.tipo === 'saida_pedida')) erro('o ESC antes da saida nao pediu a saida ao manager');
Ponte.modo = 'visivel';
const pausadoAntes = window.isPaused;
Match.togglePause();
if (!enviadas.some(m => m.tipo === 'alternar_pausa')) erro('o Pause do 3D nao pediu ao manager');
if (window.isPaused !== pausadoAntes) erro('o Pause do 3D mexeu no jogo sozinho');

if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK ponte_tatica');
process.exit(0);
