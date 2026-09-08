/*
DEPOIS DO GOLO OS JOGADORES VOLTAM A PÉ AO MEIO-CAMPO.

O relato foi "não caminham para o centro do campo, são teletransportados de uma
vez". A sequência do golo (`goalSequenceStage`) sempre teve um estágio à espera
de "toda a gente perto da posição" — mas NINGUÉM lhes escrevia essa posição: o
nível 2 não corre fora do PLAY (`nivelActivo`), e o ramo `BolaParada` da árvore
põe toda a gente em IDLE no estado GOAL. O teste de chegada dava sempre falso,
o timeout de 3 s passava, e o `setupKickoff` colocava os 22 à mão.

O que este teste fixa é o comportamento, não o código: força um golo, deixa
correr a sequência inteira e mede, frame a frame, o maior SALTO de posição de
cada jogador de campo. Um teletransporte é um salto de dezenas de metros num
frame; uma caminhada não passa de uns centímetros.

Corre com: node tests/saida_a_pe.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

require('../tools/headless/harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const campo = () => Match.players.concat(Match.opponents).filter(p => p.role !== 'gk');

// Uns segundos de jogo para toda a gente sair do posto da formação — a
// caminhada só se mede se houver de onde caminhar.
for (let i = 0; i < 600; i++) Match.update(dt);

/*
GOLO FORÇADO na baliza do TeamA (z negativo): a bola parada logo atrás da
linha, dentro dos postes, é o que o `updateBall` reconhece como golo.
*/
Match.state = 'PLAY';
Match.ball.position.set(0, 0.5, -(CAMPO_COMP / 2) - 0.5);
Match.ballVel.set(0, 0, 0);

const maiorSalto = new Map();
const andado = new Map();
let frames = 0, viuGolo = false;

while (frames < 60 * 60) {
    const antes = new Map(campo().map(p => [p, p.model.position.clone()]));
    Match.update(dt);
    frames++;

    if (Match.state === 'GOAL') viuGolo = true;

    for (const p of campo()) {
        const a = antes.get(p);
        if (!a) continue;
        const d = a.distanceTo(p.model.position);
        maiorSalto.set(p, Math.max(maiorSalto.get(p) || 0, d));
        andado.set(p, (andado.get(p) || 0) + d);
    }

    if (viuGolo && Match.kickoffActive) break;
}

test('o golo forçado corre a sequência toda e acaba numa saída de bola', () => {
    assert.ok(viuGolo, 'a bola atrás da linha não deu golo — o teste não mediu nada');
    assert.ok(Match.kickoffActive, 'a sequência do golo não chegou à saída de bola dentro de 60 s');
});

test('ninguém é teletransportado para a posição de saída', () => {
    const saltao = [...maiorSalto.entries()]
        .filter(([, d]) => d > TOLERANCIA_SAIDA + 0.5)
        .map(([p, d]) => `${p.pos} ${d.toFixed(1)} m`);
    assert.deepStrictEqual(saltao, [],
        'houve saltos de posição num único frame: ' + saltao.join(', '));
});

test('e toda a gente andou mesmo até lá', () => {
    const parados = [...andado.entries()].filter(([, d]) => d < 1.0).map(([p]) => p.pos);
    assert.deepStrictEqual(parados, [],
        'jogadores que não andaram nada durante a sequência do golo: ' + parados.join(', '));
});

test('a posição de saída é UMA conta, lida pelos três sítios', () => {
    const fs = require('fs');
    const path = require('path');
    const raiz = path.join(__dirname, '..');
    const setup = fs.readFileSync(path.join(raiz, 'js/match/match_setup.js'), 'utf8');
    const physics = fs.readFileSync(path.join(raiz, 'js/match/match_physics.js'), 'utf8');

    assert.ok(setup.includes('posicaoDeSaida: function'), 'o helper da posição de saída desapareceu');
    assert.ok(setup.includes('caminharParaSaida: function'), 'a caminhada de volta ao meio-campo desapareceu');
    assert.ok(physics.includes('caminharParaSaida()'),
        'a sequência do golo já não manda ninguém caminhar — volta o teletransporte');
    assert.ok(physics.includes('this.posicaoDeSaida('),
        'o teste de chegada voltou a ter conta própria: com dois pontos diferentes nunca fecha');

    // Quem já lá chegou fica: sem esta guarda a caminhada é apagada no último frame.
    assert.ok(setup.includes('TOLERANCIA_SAIDA'),
        'o setupKickoff voltou a colocar toda a gente à mão');
});
