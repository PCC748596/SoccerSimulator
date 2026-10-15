/*
FALTAS SEGUIDAS DA MESMA EQUIPA DAO AMARELO (RefereeModel.faltas.reincidencia, Officials._reincidente).
A 3.a falta seguida da mesma equipa, sem falta do adversario pelo meio e a menos de `janelaSegundos` da anterior, e amarelo
para quem a comete; uma falta do adversario, um cartao ou o tempo zeram a sequencia; e quem ja tem amarelo e expulso.
*/
require('../tools/headless/harness.js');
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = true;
let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
Match.init(new THREE.Scene());
const R = RefereeModel.faltas.reincidencia;
const A = { team: 'TeamA', temAmarelo: false }, B = { team: 'TeamB', temAmarelo: false };
const reinicia = () => { Match._seqFaltas = null; };

reinicia();
Match.tempoDeJogo = 100; if (Officials._reincidente(A)) erro('a 1.a falta nao devia dar cartao');
Match.tempoDeJogo = 200; if (Officials._reincidente(A)) erro('a 2.a falta seguida nao devia dar cartao');
Match.tempoDeJogo = 300; Officials._reincidente(A); Match.tempoDeJogo = 350; if (!Officials._reincidente(A)) erro('a 4.a falta seguida da mesma equipa devia dar cartao');
Officials._limparReincidencia(A);

// uma falta do adversario pelo meio quebra a sequencia
reinicia();
Match.tempoDeJogo = 100; Officials._reincidente(A);
Match.tempoDeJogo = 150; Officials._reincidente(A);
Match.tempoDeJogo = 200; Officials._reincidente(B);
Match.tempoDeJogo = 250; if (Officials._reincidente(A)) erro('a falta do adversario devia ter quebrado a sequencia');

// fora da janela
reinicia();
Match.tempoDeJogo = 0; Officials._reincidente(A);
Match.tempoDeJogo = 100; Officials._reincidente(A);
Match.tempoDeJogo = 100 + R.janelaSegundos + 50; if (Officials._reincidente(A)) erro('uma falta fora da janela contou para a sequencia');

// marcarFalta de ponta a ponta: 3 faltas leves seguidas da mesma equipa = amarelo; a 6.a (ja advertido) = vermelho
reinicia();
const inf = Match.players.find(p => p.role === 'def'), vit = Match.opponents.find(p => p.role === 'atk');
MandoModel.arbitroCasa = 0;
const faltaLeve = () => { Match.state = 'PLAY'; Officials.marcarFalta(inf, vit, { tipo: 'contacto', velocidade: 0, angulo: 0, marcacao: 100, forca: 0 }); };
const antes = MatchStats.TeamA.cartoes.amarelos;
Match.tempoDeJogo = 5000; faltaLeve();
Match.tempoDeJogo = 5050; faltaLeve();
Match.tempoDeJogo = 5100; faltaLeve();
if (MatchStats.TeamA.cartoes.amarelos !== antes) erro('3 faltas leves seguidas nao deviam dar amarelo (sao precisas 4)');
Match.tempoDeJogo = 5150; faltaLeve();
if (MatchStats.TeamA.cartoes.amarelos !== antes + 1) erro('a 4.a falta seguida devia dar amarelo: ' + MatchStats.TeamA.cartoes.amarelos);
if (!inf.temAmarelo) erro('o jogador devia ter ficado com amarelo');
if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK faltas_reincidencia');
