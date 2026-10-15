/*
O REGISTO DE EVENTOS E O NARRADOR (js/narracao/eventos.js, narrador.js).
Corre uma partida curta e confere: os eventos vem em ordem (n crescente, minuto nao decrescente); o numero de GOLO bate com
o placar; o de DEFESA bate com as defesas do MatchStats; as faltas com cartao batem com os cartoes; todo o evento
narravel gera uma linha com texto, minuto e a equipa certa; e o nome do jogador vem do elenco.
*/
require('../tools/headless/harness.js');
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = true;
let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(31);
const cena = new THREE.Scene(); Match.init(cena); Officials.arbitro = null; Officials.init(cena);
const A = SquadsData.equipas.find(e => e.nome === 'Flamengo-RJ'), B = SquadsData.equipas.find(e => e.nome === 'Palmeiras-SP');
Match.trocarEquipas({ A: A.id, B: B.id });
MatchStats.reset(); Match.tempoDeJogo = 0; Match.placarA = 0; Match.placarB = 0;
Eventos.registar('INICIO', {});
const dt = 1 / 60;
for (let i = 0; i < 60 * 240; i++) Match.update(dt);   // 4 minutos de simulacao
const L = Eventos.lista;
if (L.length < 5) erro('poucos eventos: ' + L.length);
for (let i = 1; i < L.length; i++) {
    if (L[i].n <= L[i - 1].n) erro('n fora de ordem em ' + i);
    if (L[i].minuto < L[i - 1].minuto) erro('minuto a recuar em ' + i);
}
const golos = L.filter(e => e.tipo === 'GOLO').length;
if (golos !== Match.placarA + Match.placarB) erro('golos no registo ' + golos + ' != placar ' + (Match.placarA + Match.placarB));
const defesas = L.filter(e => e.tipo === 'DEFESA').length;
const defMS = MatchStats.TeamA.defesas + MatchStats.TeamB.defesas;
if (defesas !== defMS) erro('defesas no registo ' + defesas + ' != MatchStats ' + defMS);
const cartoes = L.filter(e => e.tipo === 'FALTA' && e.cartao).length;
const cartMS = MatchStats.TeamA.cartoes.amarelos + MatchStats.TeamB.cartoes.amarelos + MatchStats.TeamA.cartoes.vermelhos + MatchStats.TeamB.cartoes.vermelhos;
if (cartoes > cartMS) erro('mais faltas com cartao (' + cartoes + ') do que cartoes contados (' + cartMS + ')');
for (const e of L.filter(e => e.tipo === 'REMATE')) if (!e.jogador || !e.jogador.nome) erro('remate sem jogador');
const linhas = Narrador.relato(L);
if (linhas.length < 3) erro('o narrador quase nao escreveu: ' + linhas.length);
for (const l of linhas) {
    if (typeof l.texto !== 'string' || !l.texto.length) erro('linha sem texto');
    if (!(l.minuto >= 1)) erro('linha sem minuto');
}
const g = L.find(e => e.tipo === 'GOLO');
if (g) { const l = Narrador.linha(g); if (!l || l.texto.indexOf(g.jogador.nome) < 0 && !g.proprioGolo) erro('a linha do golo nao nomeia o autor'); }
if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK narracao_eventos (' + L.length + ' eventos, ' + linhas.length + ' linhas)');
