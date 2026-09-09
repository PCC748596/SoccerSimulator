/*
COM A BOLA NAS MÃOS DO GUARDA-REDES, NINGUÉM FICA ATRÁS DELE.

Relato, com captura: "quando o goleiro pega a bola os jogadores do time com a
bola demoram a se reposicionar para sair jogando; tem jogadores ficando atrás do
goleiro (entre o goleiro e seu próprio gol); eles têm que ter um pouco mais de
agilidade para dar opções".

A causa é o bloco: é desenhado à volta da BOLA, e com a bola dentro da pequena
área o rectângulo desce até três metros da linha de fundo — quem calha no terço
de trás dele fica entre o guarda-redes e a baliza, onde não há passe nenhum
para dar.

Medido em 74 min (`tools/headless/saida_do_guarda_redes.js`), durante os
segundos de posse dele, em jogo corrido:

    companheiros atrás dele     1.24 por leitura (pior caso 8)   ->  0.45
    leituras com algum atrás    46%                              ->  36%
    velocidade média            3.62 m/s, 18% parados            ->  5.21, 13%

Este teste força o lance e mede o alvo que o posicionamento escreve.

Corre com: node tests/saida_do_guarda_redes.test.js
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

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

// Uns segundos de jogo para ninguém estar no sítio da formação inicial.
for (let i = 0; i < 600; i++) Match.update(dt);

const gk = Match.players[0];
const equipa = Match.players.filter(p => p.role !== 'gk');

/*
O guarda-redes agarra a bola, e a equipa toda começa ATRÁS dele — é o pior caso
do relato posto à mão.
*/
Match.state = 'PLAY';
Match.ball.position.set(0, BallPhysics.raio, gk.model.position.z - gk.dirZ * 0.5);
Match.ballVel.set(0, 0, 0);
gk.grabBall();
Match.gkHoldingBall[gk.team] = true;

/*
A MONTAGEM É DETERMINÍSTICA, e tem de ser.

Isto era `Math.random()` por jogador. A semente está fixa no topo, mas o ponto
do FLUXO a que estas dez chamadas chegam depende de quantos aleatórios os 600
frames de aquecimento consumiram — e isso muda com qualquer alteração ao jogo.
Apanhado quando o gesto do passe passou de 0.2 s para 0.35 s: o cenário passou
a nascer com outros jogadores noutros sítios, e o teste mediu o sorteio em vez
do comportamento.

Os dez ficam espalhados em leque atrás dele, entre 1 e 5 m, que é o pior caso
do relato posto à mão.
*/
equipa.forEach((p, i) => {
    p.model.position.z = gk.model.position.z - gk.dirZ * (1 + (i % 5) * 1.0);
    p.model.position.x = -9 + i * 2;
});

const atras = () => {
    const gkAvanco = gk.model.position.z * gk.dirZ;
    return {
        posicao: equipa.filter(p => p.model.position.z * p.dirZ < gkAvanco).length,
        alvo: equipa.filter(p => p.dynamicTarget && p.dynamicTarget.z * p.dirZ < gkAvanco).length
    };
};

// Meio segundo é quanto basta para o alvo estar escrito; o corpo ainda vem a
// caminho, e é por isso que o teste olha para o ALVO.
for (let i = 0; i < 30; i++) {
    Match.gkHoldingBall[gk.team] = true;
    Match.update(dt);
}
const meio = atras();

for (let i = 0; i < 150; i++) {
    Match.gkHoldingBall[gk.team] = true;
    Match.update(dt);
}
const fim = atras();

test('o guarda-redes ainda tem a bola quando se mede', () => {
    assert.ok(Match.gkHoldingBall[gk.team], 'o lance acabou antes da medição');
});

test('o alvo de toda a gente sai de trás do guarda-redes', () => {
    assert.strictEqual(meio.alvo, 0,
        `${meio.alvo} jogadores continuam com o ALVO atrás do guarda-redes meio segundo depois`);
});

test('e os corpos saem de lá', () => {
    assert.ok(fim.posicao <= 1,
        `${fim.posicao} jogadores ainda estão entre o guarda-redes e a própria baliza 3 s depois`);
});

test('a regra tem número no config e é a última a falar', () => {
    const fs = require('fs');
    const path = require('path');
    const raiz = path.join(__dirname, '..');
    const team = fs.readFileSync(path.join(raiz, 'js/bt/team_bt.js'), 'utf8');

    assert.ok(typeof SaidaDeBolaShape.margemAFrente === 'number' &&
        SaidaDeBolaShape.margemAFrente > 0,
        'SaidaDeBolaShape.margemAFrente desapareceu');
    assert.ok(typeof RepositionPace.bonusSaidaDeBola === 'number' &&
        RepositionPace.bonusSaidaDeBola > 1,
        'a pressa da saída de bola desapareceu');

    /*
    O piso tem de ser aplicado DEPOIS do alisamento também. Posto só a meio do
    pipeline, o `restDefense` (que prende os mais recuados atrás da BOLA — e a
    bola está na mão dele), a separação lateral↔meia e o lerp do alisamento
    voltavam a empurrá-los para trás: medido, 1.24 -> 1.69, pior do que não ter
    regra nenhuma.
    */
    const iLerp = team.indexOf('p.dynamicTarget.z = lerp(');
    assert.ok(iLerp > 0, 'não encontrei o alisamento do alvo');
    assert.ok(team.indexOf('SaidaDeBolaShape', iLerp) > 0,
        'o piso da saída de bola deixou de correr depois do alisamento');
});
