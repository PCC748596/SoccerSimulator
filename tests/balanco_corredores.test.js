/*
O BALANCO POR CORREDOR (js/balanco_corredores.js, config/balanco_corredores.js) e a regra dos setores do painel.

  . os alvos pelos corredores ligados: nenhum 33/33/33, um 60/15/15, dois 45/45/10, tres = nenhum;
  . o painel (Tatics.toggleSector) so deixa 0, 1 ou 2 ligados: ligar o terceiro limpa os tres;
  . o corredor e dos tercos iguais do campo, com histerese de 3 m (uma bola em cima do corte nao troca por frame);
  . o empurrao: 0 dentro da margem de 10 pontos de tempo, e cresce ate 1 com o excesso; o ajuste de passe tem o sinal
    certo (desce onde o time ja passou do alvo, sobe onde falta tempo);
  . a media sobe para o corredor onde a bola esta.
*/
require('../tools/headless/harness.js');
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = true;
let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const perto = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

Match.init(new THREE.Scene());

// --- os alvos
const A = (s) => TempoPorCorredor.alvo(s);
let a = A([]);
if (!(perto(a.esq, 1 / 3) && perto(a.cen, 1 / 3) && perto(a.dir, 1 / 3))) erro('nenhum ligado nao da 1/3 cada');
a = A(['esq', 'cen', 'dir']);
if (!perto(a.esq, 1 / 3)) erro('tres ligados deviam valer nenhum');
a = A(['esq']);
if (!(perto(a.esq, 0.60) && perto(a.cen, 0.15) && perto(a.dir, 0.15))) erro('um ligado nao da 60/15/15');
a = A(['esq', 'dir']);
if (!(perto(a.esq, 0.45) && perto(a.dir, 0.45) && perto(a.cen, 0.10))) erro('dois ligados nao da 45/45/10');
a = A(['cen', 'dir']);
if (!(perto(a.cen, 0.45) && perto(a.dir, 0.45) && perto(a.esq, 0.10))) erro('cen+dir nao da 45/45/10');

// --- o painel: 0, 1 ou 2
Tatics.setores = [];
Match.assignFormations = Match.assignFormations || (() => {});
const ligar = (s) => { try { Tatics.toggleSector(s); } catch (e) { /* sem DOM */ } };
const orig = Match.assignFormations; Match.assignFormations = () => {};
global.document = global.document || { getElementById: () => null };
Tatics.toggleSector('esq'); Tatics.toggleSector('dir');
if (Tatics.setores.length !== 2) erro('dois ligados: ' + Tatics.setores);
Tatics.toggleSector('cen');
if (Tatics.setores.length !== 0) erro('ligar o terceiro devia limpar os tres: ' + JSON.stringify(Tatics.setores));
Tatics.toggleSector('esq'); Tatics.toggleSector('esq');
if (Tatics.setores.length !== 0) erro('desligar o ultimo devia deixar nenhum: ' + JSON.stringify(Tatics.setores));
Match.assignFormations = orig;

// --- o corredor, com histerese (corte em 68/6 = 11.33; histerese 3)
const c = 68 / 6, h = BalancoCorredores.histerese;
const H = (at, x) => TempoPorCorredor._corredorComHisterese(at, x);
if (H('cen', c + 1) !== 'cen') erro('a 1 m do corte ainda e o centro (histerese)');
if (H('cen', c + h + 0.1) !== 'dir') erro('passada a histerese e a direita');
if (H('dir', c - 1) !== 'dir') erro('a direita so larga depois de passar o corte por ' + h + ' m');
if (H('dir', c - h - 0.1) !== 'cen') erro('a direita devia voltar ao centro');
if (H('esq', -c + h + 0.1) !== 'cen') erro('a esquerda devia voltar ao centro');
if (TempoPorCorredor.corredorDeX(-20) !== 'esq' || TempoPorCorredor.corredorDeX(0) !== 'cen' || TempoPorCorredor.corredorDeX(20) !== 'dir') erro('corredorDeX');

// --- o empurrao e o ajuste do passe
Tatics.setores = ['esq', 'dir'];
TempoPorCorredor.reset();
const e = TempoPorCorredor._de('TeamA');
e.fatia = { esq: 0.45, cen: 0.10, dir: 0.45 };
if (TempoPorCorredor.empurrao('TeamA', 'esq') !== 0) erro('no alvo o empurrao devia ser 0');
e.fatia = { esq: 0.54, cen: 0.10, dir: 0.36 };     // esquerda a +9 pontos: dentro da margem de 10
if (TempoPorCorredor.empurrao('TeamA', 'esq') !== 0) erro('dentro da margem (9 pontos) o empurrao devia ser 0');
e.fatia = { esq: 0.60, cen: 0.10, dir: 0.30 };     // esquerda a +15, direita a -15
const eE = TempoPorCorredor.empurrao('TeamA', 'esq'), eD = TempoPorCorredor.empurrao('TeamA', 'dir');
if (!(eE > 0 && eE < 1)) erro('a +15 pontos o empurrao devia estar entre 0 e 1: ' + eE);
if (!(eD < 0)) erro('a -15 pontos (falta tempo) o empurrao devia ser negativo: ' + eD);
if (!(TempoPorCorredor.ajusteDePasse('TeamA', -20) < 0)) erro('passe para o corredor que passou do alvo devia perder pontos');
if (!(TempoPorCorredor.ajusteDePasse('TeamA', 20) > 0)) erro('passe para o corredor onde falta tempo devia ganhar pontos');
e.fatia = { esq: 0.80, cen: 0.10, dir: 0.10 };
if (TempoPorCorredor.empurrao('TeamA', 'esq') !== 1) erro('o empurrao satura em 1');
if (Math.abs(TempoPorCorredor.ajusteDePasse('TeamA', -20)) > BalancoCorredores.pontosPasse + 1e-6) erro('o ajuste passa do maximo');

// --- a media: com a bola na direita do ataque da TeamA a fatia da direita sobe
TempoPorCorredor.reset();
Match.state = 'PLAY'; Match.possessionTeam = 'TeamA';
const dir = Match.players[0].dirZ;
Match.ball.position.set(22 * dir, 0.2, 0);
const antes = TempoPorCorredor.estado('TeamA', 'dir').fatia;
for (let i = 0; i < 60 * 20; i++) TempoPorCorredor.tick(1 / 60);
const depois = TempoPorCorredor.estado('TeamA', 'dir').fatia;
if (!(depois > antes + 0.08)) erro(`a fatia da direita nao subiu com a bola la (${antes.toFixed(2)} -> ${depois.toFixed(2)})`);

if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK balanco_corredores');
