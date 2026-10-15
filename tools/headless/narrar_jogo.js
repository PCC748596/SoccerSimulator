/*
NARRA UMA PARTIDA: corre um jogo entre duas equipas reais e imprime o relato que sai dos eventos do 3D.
Uso: node tools/headless/narrar_jogo.js [minutosDeSimulacao] [semente] [equipaCasa] [equipaFora]
(20 minutos de simulacao = um jogo de 90 de relogio.)
*/
const minutos = Number(process.argv[2] || 20), semente = Number(process.argv[3] || 7);
const casa = process.argv[4] || 'Flamengo-RJ', fora = process.argv[5] || 'Palmeiras-SP';
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = true;
const cena = new THREE.Scene(); Match.init(cena); Officials.arbitro = null; Officials.init(cena);
const A = SquadsData.equipas.find(e => e.nome === casa), B = SquadsData.equipas.find(e => e.nome === fora);
Match.trocarEquipas({ A: A.id, B: B.id });
MatchStats.reset(); Match.tempoDeJogo = 0; Match.placarA = 0; Match.placarB = 0;
Eventos.registar('INICIO', {});
const dt = 1 / 60;
for (let i = 0; i < Math.round(minutos * 60 / dt); i++) Match.update(dt);
Eventos.registar('FIM', { placar: { A: Match.placarA, B: Match.placarB } });
const linhas = Narrador.relato(Eventos.lista);
for (const l of linhas) console.log(String(l.minuto).padStart(3) + "'  " + l.texto);
const cont = {}; for (const e of Eventos.lista) cont[e.tipo] = (cont[e.tipo] || 0) + 1;
console.log('\n' + Eventos.lista.length + ' eventos: ' + JSON.stringify(cont) + ' | ' + linhas.length + ' linhas narradas');
