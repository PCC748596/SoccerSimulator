/*
FALTAS SEGUIDAS SEM GRAVIDADE DAO AMARELO (RefereeModel.faltas.reincidencia, Officials._reincidente).
A terceira falta leve de um jogador dentro da janela e amarelo; um cartao limpa a conta; faltas fora da janela nao contam;
e quem ja tem amarelo e expulso (segundo amarelo) na terceira falta seguinte.
*/
require('../tools/headless/harness.js');
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = true;
let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
Match.init(new THREE.Scene());
const R = RefereeModel.faltas.reincidencia;
const j = { temAmarelo: false };
Match.tempoDeJogo = 100;
if (Officials._reincidente(j)) erro('a 1a falta nao devia dar cartao');
Match.tempoDeJogo = 200;
if (Officials._reincidente(j)) erro('a 2a falta nao devia dar cartao');
Match.tempoDeJogo = 300;
if (!Officials._reincidente(j)) erro('a 3a falta seguida devia dar cartao');
Officials._limparReincidencia(j);
if (j._faltasRecentes.length !== 0) erro('o cartao devia limpar a conta');
// fora da janela
const k = { temAmarelo: false };
Match.tempoDeJogo = 0; Officials._reincidente(k);
Match.tempoDeJogo = 100; Officials._reincidente(k);
Match.tempoDeJogo = R.janelaSegundos + 500;   // as duas primeiras ja nao contam
if (Officials._reincidente(k)) erro('faltas fora da janela contaram');
// marcarFalta de ponta a ponta: tres faltas leves de um jogador com gravidade 0 dao amarelo, e a seguir (ja advertido) vermelho
const equipa = Match.players, adv = Match.opponents;
const inf = equipa.find(p => p.role === 'def'), vit = adv.find(p => p.role === 'atk');
Match.state = 'PLAY';
const antes = MatchStats.TeamA.cartoes.amarelos;
MandoModel.arbitroCasa = 0;
const faltaLeve = () => { Match.state = 'PLAY'; Officials.marcarFalta(inf, vit, { tipo: 'contacto', velocidade: 0, angulo: 0, marcacao: 100, forca: 0 }); };
Match.tempoDeJogo = 5000;
faltaLeve(); faltaLeve();
if (MatchStats.TeamA.cartoes.amarelos !== antes) erro('2 faltas leves nao deviam dar amarelo');
faltaLeve();
if (MatchStats.TeamA.cartoes.amarelos !== antes + 1) erro('a 3a falta leve devia dar amarelo: ' + MatchStats.TeamA.cartoes.amarelos);
if (!inf.temAmarelo) erro('o jogador devia ter ficado com amarelo');
if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK faltas_reincidencia');
