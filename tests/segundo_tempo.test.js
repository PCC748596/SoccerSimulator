/*
DOIS TEMPOS DE 45 MINUTOS.

Pedido: *"O jogo e dividido em 2 tempos de 45 minutos. Durante o intervalo os
jogadores devem recuperar um pouco da stamina. Quando voltarem para o segundo
tempo os times devem mudar de lado."*

Prende: a 45:00 entra em INTERVALO; o deposito sobe mas nao enche tudo; os lados
trocam (dirZ, balizas, TeamAI); a saida e da equipa que NAO abriu o jogo; e um
golo na baliza +Z passa a ser contra o TeamA.

Corre com: node tests/segundo_tempo.test.js
*/
require('../tools/headless/harness.js');
let falhas = 0;
const ok = (m) => console.log('  . ' + m);
const erro = (m) => { falhas++; console.log('  X ' + m); };

if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = false;
let s = 3; Math.random = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
Match.init(new THREE.Scene());
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(new THREE.Scene());

const dt = 1 / 60;
const jogador = Match.players[3];
const antes = { dirA: jogador.dirZ, dirB: Match.opponents[3].dirZ };
Match.tempoDeJogo = 2690;
jogador.energia = 0.6;
const estados = [];
for (let f = 0; f < 60 * 60 && estados.indexOf('GOAL') < 0 || (f < 60 * 60 && Match.state === 'GOAL'); f++) {
    Match.delta = dt; Match.update(dt);
    if (estados[estados.length - 1] !== Match.state) estados.push(Match.state);
}
if (estados.indexOf('INTERVALO') < 0) erro('nao entrou em INTERVALO: ' + estados.join(','));
else ok('entrou em INTERVALO (' + estados.join(' > ') + ')');

if (Lados.trocados && jogador.dirZ === -antes.dirA && Match.opponents[3].dirZ === -antes.dirB) ok('lados trocados (dirZ invertido)');
else erro('lados nao trocaram');
if (jogador.ownGoalZ === -(CAMPO_COMP / 2) * jogador.dirZ) ok('balizas do jogador acompanham o dirZ');
else erro('ownGoalZ desactualizado');
if (TeamAI.get('TeamA').dir === jogador.dirZ) ok('TeamAI acompanha');
else erro('TeamAI com dir antigo');

if (jogador.energia > 0.6 && jogador.energia < 1) ok('energia recuperou um pouco: ' + jogador.energia.toFixed(2));
else erro('energia ' + jogador.energia);

const abriu = Match.saidaInicial;
if (Match.nextKickoffTeam === (abriu === 'TeamA' ? 'TeamB' : 'TeamA') || Match.kickoffTeam !== abriu) ok('o 2o tempo abre a outra equipa');
else erro('saida do 2o tempo: ' + Match.kickoffTeam + ', abriu ' + abriu);

// Golo no lado +Z: agora e a baliza do TeamA.
if (Lados.donoDaBaliza(1) === 'TeamA' && Lados.donoDaBaliza(-1) === 'TeamB') ok('baliza +Z e do TeamA no 2o tempo');
else erro('donoDaBaliza errado');

console.log(falhas ? 'FALHOU: ' + falhas : 'OK');
process.exit(falhas ? 1 : 0);
