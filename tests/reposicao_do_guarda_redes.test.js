/*
A REPOSIÇÃO DO GUARDA-REDES: espera até 8 s por uma boa opção; senão, chuta.

Pedido: "após o goleiro pegar a bola ele tem que esperar até 8 s para repor a
bola, aguardando que seus companheiros estejam em uma posição boa para o passe;
caso não estejam, ele deve chutar pra frente".

Medido antes (`tools/headless/reposicao_do_gk.js`, 73 min): ele largava a bola
aos **2.05 s de média**, com o prazo sorteado em 6.7 s. Duas razões:

  - o prazo era `5 + rand*3` — os 8 s da regra nunca aconteciam;
  - o gatilho do "já há a quem jogar" era o `findPassTarget()`, que devolve
    QUALQUER companheiro com linha, marcado ou não, e não a saída curta ao homem
    desmarcado que o `acharLateralParaSaida` já sabia escolher.

Este teste monta os dois lances: com toda a gente marcada (tem de esperar o
prazo e chutar) e com um defesa livre (pode lançar).

Corre com: node tests/reposicao_do_guarda_redes.test.js
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

for (let i = 0; i < 300; i++) Match.update(dt);

const gk = Match.players[0];
const equipa = Match.players.filter(p => p.role !== 'gk');
const rivais = Match.opponents.filter(p => p.role !== 'gk');

/*
Monta a posse de mão: a bola nas mãos dele, e os companheiros colocados como o
cenário pede. `marcados` cola um adversário a cada um deles.
*/
const montar = (marcados, saida) => {
    Match.state = 'PLAY';
    Match.gkHoldingBall.TeamA = false;
    gk.gkEstado = 'idle';
    gk.hasBall = false;
    gk.gkKickAction = null;
    gk.gkSaida = saida || null;
    gk.gkThrowTarget = null;

    equipa.forEach((p, i) => {
        p.model.position.set(-24 + i * 5, ALTURA_BASE_Y, gk.model.position.z + gk.dirZ * (12 + (i % 3) * 4));
    });
    rivais.forEach((o, i) => {
        const alvo = equipa[i % equipa.length];
        if (marcados) {
            // Colado ao homem: ninguém está livre para receber.
            o.model.position.set(alvo.model.position.x + 1.2, ALTURA_BASE_Y, alvo.model.position.z);
        } else {
            // Todos no meio-campo contrário: toda a gente livre.
            o.model.position.set((i - 5) * 4, ALTURA_BASE_Y, -gk.dirZ * 30);
        }
    });

    Match.ball.position.set(gk.model.position.x, 1.0, gk.model.position.z);
    Match.ballVel.set(0, 0, 0);
    gk.grabBall();
    Match.gkHoldingBall.TeamA = true;
};

/*
Corre até ele largar a bola (sai do estado 'segurando'), devolvendo o tempo.

Os marcadores são RECOLADOS a cada frame: sem isso a árvore dos adversários
afasta-os do homem em menos de um segundo, e o cenário "toda a gente marcada"
deixa de o ser antes de o guarda-redes decidir seja o que for — foi assim que
esta medição se enganou à primeira.
*/
const ateLargar = (marcados) => {
    let t = 0;
    while (t < 14 && gk.gkEstado === 'segurando') {
        if (marcados) {
            rivais.forEach((o, i) => {
                const alvo = equipa[i % equipa.length];
                o.model.position.set(alvo.model.position.x + 1.2, ALTURA_BASE_Y, alvo.model.position.z);
            });
        }
        Match.update(dt);
        t += dt;
    }
    return t;
};

test('sem ninguém desmarcado, espera o prazo todo e não larga cedo', () => {
    montar(true, 'laterais');
    const t = ateLargar(true);
    assert.ok(t >= GoalkeeperPose.segurarDur - 0.5,
        `largou aos ${t.toFixed(1)} s com toda a gente marcada — devia esperar os ${GoalkeeperPose.segurarDur} s`);
});

test('com um defesa desmarcado, larga assim que pode', () => {
    montar(false, 'laterais');
    const t = ateLargar();
    assert.ok(t >= GoalkeeperPose.segurarMinimo - 0.1,
        `largou aos ${t.toFixed(1)} s: nem a folga mínima para as equipas saírem da área`);
    assert.ok(t < GoalkeeperPose.segurarDur - 1.0,
        `esperou ${t.toFixed(1)} s com um homem livre à espera — a opção estava lá`);
});

test('o prazo é o da regra, e não um sorteio', () => {
    montar(true, 'laterais');
    assert.strictEqual(gk.gkSegurarDur, GoalkeeperPose.segurarDur,
        'o prazo voltou a ser sorteado: os 8 s da regra nunca aconteciam');
});

test('quem decidiu chutar não fica os 8 s parado', () => {
    montar(true, 'chuteFrente');
    const t = ateLargar(true);
    assert.ok(t < GoalkeeperPose.segurarDur - 1.0,
        `esperou ${t.toFixed(1)} s para chutar na mesma — é tempo morto`);
    assert.ok(t >= GoalkeeperPose.segurarDirecto - 0.5,
        `chutou aos ${t.toFixed(1)} s, antes de a equipa sair da área`);
});

test('o gatilho é a opção BOA, e não qualquer linha de passe', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'js/player.js'), 'utf8');
    const i = src.indexOf('const opcaoBoa');
    assert.ok(i > 0, 'a opção boa desapareceu do ramo `segurando`');
    const bloco = src.slice(i, i + 700);
    assert.ok(/gkPodeLancar\(t, opcaoBoa\)/.test(bloco),
        'o relançamento antecipado voltou a aceitar qualquer linha (`gkTemLinha`)');
});
