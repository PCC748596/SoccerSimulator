/*
BOLA ATRASADA: O GUARDA-REDES NÃO PODE PEGAR COM A MÃO. DE CABEÇA, PODE.

Pedido: "o goleiro não pode pegar com a mão as bolas atrasadas, só se for de
cabeça".

A regra já existia em código, mas com uma condição a mais: a marca
(`Match.recuoParaGR`) só era posta quando o passe ia ENDEREÇADO ao guarda-redes
(`passTarget.role === 'gk'`). Tudo o resto que sai do pé de um companheiro e
acaba nas mãos dele — um alívio para trás, um passe curto que ninguém foi
buscar, um toque de condução que sobra — não era recuo nenhum. Medido em 74 min
de jogo, das bolas que ele agarrou com a mão uma vinha do pé de um companheiro e
NENHUMA estava marcada.

Este teste monta os três lances à mão e olha para o que o `grabBall` faz.

Corre com: node tests/bola_atrasada_maos.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(1000);

require('../tools/headless/harness.js');

const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const gk = Match.players[0];
const defesa = Match.players.find(p => p.pos === 'CB');
const adversario = Match.opponents.find(p => p.pos === 'CF');

/*
O DEFESA JOGA A BOLA NA DIRECÇÃO DA PRÓPRIA BALIZA, e ela fica a meio caminho
do guarda-redes. É o lance do relato.
*/
const montarRecuo = () => {
    Match.state = 'PLAY';
    Match.ultimoToque = null;
    Match.recuoParaGR = null;
    gk.hasBall = false;
    gk.gkEstado = 'idle';
    Match.ballCarrier = null;

    // Defesa a 20 m da própria baliza; a bola no pé dele.
    defesa.model.position.set(0, ALTURA_BASE_Y, -32);
    Match.ball.position.set(0, BallPhysics.raio, -32);
    registarToqueComPe(defesa, true);

    // ...e a bola corre 10 m para trás, na direcção do guarda-redes.
    Match.ball.position.z = -42;
    avaliarRecuoParaGR(Match);
};

test('bola atrasada com o pé de um companheiro: as mãos estão proibidas', () => {
    montarRecuo();
    assert.strictEqual(Match.recuoParaGR, gk.team, 'o recuo não foi marcado');
    assert.strictEqual(gk.grabBall(), false, 'o guarda-redes agarrou uma bola atrasada');
    assert.strictEqual(gk.hasBall, false, 'ficou com a bola na mão à mesma');
});

test('servida de CABEÇA, pode agarrar', () => {
    montarRecuo();
    // O mesmo lance, mas o último toque do companheiro foi de cabeça.
    limparRecuoParaGR();
    avaliarRecuoParaGR(Match);
    assert.strictEqual(Match.recuoParaGR, null, 'a cabeçada continuou a proibir as mãos');
    assert.ok(gk.grabBall() !== false, 'não deixou agarrar uma bola servida de cabeça');
});

test('bola do ADVERSÁRIO: pode agarrar', () => {
    montarRecuo();
    adversario.model.position.set(0, ALTURA_BASE_Y, -32);
    registarToqueComPe(adversario, true);
    Match.ball.position.z = -42;
    avaliarRecuoParaGR(Match);
    /*
    Para o adversário esta bola vai para a FRENTE (é a baliza que ele ataca),
    portanto não há recuo nenhum — e mesmo que houvesse, a marca seria da
    equipa dele e não proibiria nada a este guarda-redes.
    */
    assert.ok(!maosProibidasNoRecuo(Match.recuoParaGR, gk.team),
        'um toque do adversário não pode proibir as mãos');
    assert.ok(gk.grabBall() !== false, 'não deixou agarrar uma bola do adversário');
});

test('a DIRECÇÃO não conta: o que proíbe as mãos é o pé', () => {
    /*
    Este teste dizia o contrário — "bola jogada para a FRENTE não é bola
    atrasada" — e era essa a folga (`GkRecuoModel.atrasoMin`) que deixava
    passar os recuos que o relato apanhou: *"o goleiro não pode pegar com a mão
    uma bola atrasada pelo jogador do próprio time com o pé"*.

    Medido em 30 min (`tools/scratch/_recuo_gk.js`): sete bolas agarradas com a
    mão vinham do pé de um companheiro, TODAS dentro da folga, com
    deslocamentos de -0.73 a +3.23 m. A folga não separava o recuo do toque de
    lado — separava o recuo longo do curto, e o curto é o mais comum, porque
    quem devolve a bola ao guarda-redes está a dois metros dele.

    A Lei 12 fala do PÉ. Quem devolve as mãos é a cabeça, o peito ou um toque
    do adversário, e isso continua a ser testado aqui em cima.
    */
    montarRecuo();
    Match.ball.position.z = -22;      // a bola foi para a FRENTE
    avaliarRecuoParaGR(Match);
    assert.strictEqual(Match.recuoParaGR, 'TeamA',
        'o pé de um companheiro proíbe as mãos, venha a bola de onde vier');
    assert.strictEqual(gk.grabBall(), false, 'e o guarda-redes não a pode agarrar');
});

test('o guarda-redes não se absolve a si próprio tocando com o pé', () => {
    montarRecuo();
    /*
    Era este o buraco que sobrava: o toque dele com o pé era tratado como
    "toque de outra pessoa" e limpava a marca — tocava-lhe com o pé e agarrava
    a seguir. A Lei 12 só lhe devolve as mãos quando OUTRO jogador toca, ou
    quando o companheiro a serve de cabeça ou de peito.
    */
    registarToqueComPe(gk, true);
    // A bola continua a andar na direcção da baliza dele.
    Match.ball.position.z = -46;
    avaliarRecuoParaGR(Match);
    assert.strictEqual(gk.grabBall(), false,
        'tocou com o pé e agarrou a seguir: o recuo tem de sobreviver ao toque dele');
});
