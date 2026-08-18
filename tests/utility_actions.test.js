const test = require('node:test');
const assert = require('node:assert');
const { jogador, carregarActions, contexto, accao } = require('./helpers/stubs.js');
const { AccoesComBola } = carregarActions();
const { avaliarAccao } = require('../js/utility/core.js');

function score(nome, p, extra) {
    return avaliarAccao(accao(AccoesComBola, nome), contexto(p, extra)).score;
}

test('o catalogo com bola tem as sete accoes', () => {
    const nomes = AccoesComBola.map(a => a.nome);
    assert.deepStrictEqual(nomes.sort(),
        ['CARRY', 'CROSS', 'DRIBBLE', 'HOLD', 'PASS', 'SHOOT', 'THROUGH_BALL'].sort());
});

test('SHOOT vale 0 fora da zona de remate', () => {
    globalThis._emZona = false;
    assert.strictEqual(score('SHOOT', jogador({ z: 45, hasBall: true })), 0);
});

test('SHOOT vale mais perto do que longe', () => {
    globalThis._emZona = true;
    const perto = score('SHOOT', jogador({ z: 44, hasBall: true }));
    const longe = score('SHOOT', jogador({ z: 30, hasBall: true }));
    assert.ok(perto > longe, 'perto=' + perto + ' longe=' + longe);
});

test('SHOOT desce com o angulo mau', () => {
    globalThis._emZona = true;
    const central = score('SHOOT', jogador({ x: 0, z: 44, hasBall: true }));
    const lateral = score('SHOOT', jogador({ x: 20, z: 44, hasBall: true }));
    assert.ok(central > lateral, 'central=' + central + ' lateral=' + lateral);
});

test('SHOOT desce sob pressao', () => {
    globalThis._emZona = true;
    const livre = score('SHOOT', jogador({ z: 44, hasBall: true }));
    const sob = score('SHOOT', jogador({ z: 44, hasBall: true }), { underPressure: true });
    assert.ok(livre > sob);
});

test('CROSS vale 0 sem alvo na area', () => {
    globalThis._cross = null;
    assert.strictEqual(score('CROSS', jogador({ x: 18, z: 30, hasBall: true })), 0);
});

test('CROSS sobe com o numero de alvos na area', () => {
    globalThis._cross = { alvo: {}, alvos: 1, largura: 0.5, fundo: 0.5 };
    const um = score('CROSS', jogador({ x: 18, z: 30, hasBall: true }));
    globalThis._cross = { alvo: {}, alvos: 3, largura: 0.5, fundo: 0.5 };
    const tres = score('CROSS', jogador({ x: 18, z: 30, hasBall: true }));
    assert.ok(tres > um, 'um=' + um + ' tres=' + tres);
});

test('CROSS sobe junto a linha lateral', () => {
    globalThis._cross = { alvo: {}, alvos: 2, largura: 0.1, fundo: 0.5 };
    const dentro = score('CROSS', jogador({ x: 16, z: 30, hasBall: true }));
    globalThis._cross = { alvo: {}, alvos: 2, largura: 0.9, fundo: 0.5 };
    const naLinha = score('CROSS', jogador({ x: 26, z: 30, hasBall: true }));
    assert.ok(naLinha > dentro, 'dentro=' + dentro + ' naLinha=' + naLinha);
});

test('THROUGH_BALL vale 0 sem espaco encontrado', () => {
    globalThis._through = null;
    assert.strictEqual(score('THROUGH_BALL', jogador({ z: 10, hasBall: true })), 0);
});

test('THROUGH_BALL sobe com a nota do espaco encontrado', () => {
    const p = jogador({ z: 10, hasBall: true });
    globalThis._through = { mate: {}, alvoX: 0, alvoZ: 40, nota: 140 };
    const bom = score('THROUGH_BALL', p);
    globalThis._through = { mate: {}, alvoX: 0, alvoZ: 40, nota: 30 };
    const mau = score('THROUGH_BALL', p);
    assert.ok(bom > mau, 'bom=' + bom + ' mau=' + mau);
});

test('THROUGH_BALL com nota negativa nao fica a 0 (piso positivo)', () => {
    const p = jogador({ z: 10, hasBall: true });
    globalThis._through = { mate: {}, alvoX: 0, alvoZ: 40, nota: -40 };
    const s = score('THROUGH_BALL', p);
    assert.ok(s > 0, 'nota negativa devia dar score > 0, deu ' + s);
});

test('THROUGH_BALL com nota negativa continua abaixo de uma nota boa', () => {
    const p = jogador({ z: 10, hasBall: true });
    globalThis._through = { mate: {}, alvoX: 0, alvoZ: 40, nota: 140 };
    const bom = score('THROUGH_BALL', p);
    globalThis._through = { mate: {}, alvoX: 0, alvoZ: 40, nota: -40 };
    const negativo = score('THROUGH_BALL', p);
    assert.ok(bom > negativo, 'bom=' + bom + ' negativo=' + negativo);
});

test('THROUGH_BALL vale 0 sob pressao', () => {
    globalThis._through = { mate: {}, alvoX: 0, alvoZ: 40, nota: 140 };
    const p = jogador({ z: 10, hasBall: true });
    assert.strictEqual(score('THROUGH_BALL', p, { underPressure: true }), 0);
});

test('PASS vale 0 sem alvo', () => {
    globalThis._pass = null;
    globalThis._passInfo = null;
    assert.strictEqual(score('PASS', jogador({ z: 10, hasBall: true })), 0);
});

test('PASS sobe com a qualidade do alvo', () => {
    const p = jogador({ z: 10, hasBall: true });
    globalThis._pass = jogador({ id: 7, z: 25 });
    globalThis._passInfo = { nota: 260, progressao: 20, folga: 6 };
    const bom = score('PASS', p);
    globalThis._passInfo = { nota: 90, progressao: 2, folga: 0.5 };
    const mau = score('PASS', p);
    assert.ok(bom > mau, 'bom=' + bom + ' mau=' + mau);
});

test('PASS sobe sob pressao (descarregar e melhor do que segurar)', () => {
    const p = jogador({ z: 10, hasBall: true });
    globalThis._pass = jogador({ id: 7, z: 25 });
    globalThis._passInfo = { nota: 180, progressao: 10, folga: 3 };
    const livre = score('PASS', p);
    const sob = score('PASS', p, { underPressure: true });
    assert.ok(sob > livre, 'livre=' + livre + ' sob=' + sob);
});

test('PASS com nota negativa nao fica a 0 (piso positivo)', () => {
    const p = jogador({ z: 10, hasBall: true });
    globalThis._pass = jogador({ id: 7, z: 25 });
    globalThis._passInfo = { nota: -30, progressao: -5, folga: 1 };
    const s = score('PASS', p);
    assert.ok(s > 0, 'nota negativa devia dar score > 0, deu ' + s);
});

test('PASS com nota negativa continua abaixo de uma nota boa', () => {
    const p = jogador({ z: 10, hasBall: true });
    globalThis._pass = jogador({ id: 7, z: 25 });
    globalThis._passInfo = { nota: 260, progressao: 20, folga: 6 };
    const bom = score('PASS', p);
    globalThis._passInfo = { nota: -30, progressao: -5, folga: 1 };
    const negativo = score('PASS', p);
    assert.ok(bom > negativo, 'bom=' + bom + ' negativo=' + negativo);
});

test('PASS aguenta um alvo sem metricas registadas', () => {
    const p = jogador({ z: 10, hasBall: true });
    globalThis._pass = jogador({ id: 7, z: 25 });
    globalThis._passInfo = null;
    const s = score('PASS', p);
    assert.ok(s > 0 && s <= 1, 'score invalido sem metricas: ' + s);
});

test('PASS para tras alem de -10m nao fica a 0 (piso positivo em progressao)', () => {
    const p = jogador({ z: 30, hasBall: true });
    globalThis._pass = jogador({ id: 7, z: 5 });
    // Central a reciclar para o GR: passe bem longo para tras, mas alvo
    // livre e sem pressao — nota e folga continuam boas.
    globalThis._passInfo = { nota: 200, progressao: -15, folga: 5 };
    const s = score('PASS', p);
    assert.ok(s > 0, 'passe para tras alem de -10m devia dar score > 0, deu ' + s);
    assert.ok(s > 0.02, 'passe para tras devia continuar selecionavel (>0.02), deu ' + s);
});

test('PASS para tras muito longe (-30m) tambem nao colapsa a 0', () => {
    const p = jogador({ z: 30, hasBall: true });
    globalThis._pass = jogador({ id: 7, z: 0 });
    globalThis._passInfo = { nota: 200, progressao: -30, folga: 5 };
    const s = score('PASS', p);
    assert.ok(s > 0, 'progressao muito negativa devia dar score > 0, deu ' + s);
});

test('progressao monotona: menos negativo pontua igual ou melhor', () => {
    const p = jogador({ z: 30, hasBall: true });
    globalThis._pass = jogador({ id: 7, z: 5 });
    globalThis._passInfo = { nota: 200, progressao: -10, folga: 5 };
    const menosNegativo = score('PASS', p);
    globalThis._passInfo = { nota: 200, progressao: -30, folga: 5 };
    const maisNegativo = score('PASS', p);
    assert.ok(menosNegativo >= maisNegativo,
        'menosNegativo=' + menosNegativo + ' maisNegativo=' + maisNegativo);
});

test('CARRY desce quando o orcamento de conducao se esgota', () => {
    const fresco = score('CARRY', jogador({ z: 10, hasBall: true, carryDist: 0 }));
    const gasto = score('CARRY', jogador({ z: 10, hasBall: true, carryDist: 24 }));
    assert.ok(fresco > gasto, 'fresco=' + fresco + ' gasto=' + gasto);
});

test('CARRY no limite exacto do orcamento nao fica a 0 (piso positivo)', () => {
    const p = jogador({ z: 10, hasBall: true, carryDist: 25 }); // CarryModel.distanciaMax
    const s = score('CARRY', p);
    assert.ok(s > 0, 'orcamento esgotado devia dar score > 0, deu ' + s);
});

test('CARRY muito alem do orcamento (carryDist >> distanciaMax) tambem nao colapsa a 0', () => {
    const p = jogador({ z: 10, hasBall: true, carryDist: 60 });
    const s = score('CARRY', p);
    assert.ok(s > 0, 'carryDist muito alem do limite devia dar score > 0, deu ' + s);
});

test('CARRY desce sem espaco a frente', () => {
    const p = jogador({ z: 10, hasBall: true });
    const aberto = score('CARRY', p, { espacoAFrente: 30 });
    const fechado = score('CARRY', p, { espacoAFrente: 2 });
    assert.ok(aberto > fechado);
});

test('CARRY vale 0 para o guarda-redes', () => {
    assert.strictEqual(score('CARRY', jogador({ role: 'gk', hasBall: true })), 0);
});

test('HOLD tem sempre score baixo mas nao nulo', () => {
    const s = score('HOLD', jogador({ hasBall: true }));
    assert.ok(s > 0 && s < 0.3, 'HOLD=' + s);
});

test('cada accao declara a chave de estilo certa', () => {
    const esperado = {
        SHOOT: 'remate', CROSS: 'cruzar', THROUGH_BALL: 'lancar',
        PASS: 'passe', CARRY: 'conduzir', HOLD: null, DRIBBLE: 'driblar'
    };
    for (const a of AccoesComBola) {
        assert.strictEqual(a.estilo, esperado[a.nome], a.nome + ' com estilo errado');
    }
});

test('DRIBBLE existe no catalogo com bola', () => {
    assert.ok(AccoesComBola.some(a => a.nome === 'DRIBBLE'));
    assert.strictEqual(accao(AccoesComBola, 'DRIBBLE').estilo, 'driblar');
});

test('DRIBBLE vale 0 sem adversario a frente', () => {
    const p = jogador({ z: 10, hasBall: true });
    assert.strictEqual(score('DRIBBLE', p, { opponents: [] }), 0);
});

test('DRIBBLE vale 0 com o adversario longe demais', () => {
    const p = jogador({ z: 10, hasBall: true });
    const opp = jogador({ team: 'TeamB', z: 20 });     // 10m > triggerDist 5m
    assert.strictEqual(score('DRIBBLE', p, { opponents: [opp] }), 0);
});

test('DRIBBLE vale 0 com o adversario colado (menos de 1.5m)', () => {
    const p = jogador({ z: 10, hasBall: true });
    const opp = jogador({ team: 'TeamB', z: 11 });
    assert.strictEqual(score('DRIBBLE', p, { opponents: [opp] }), 0);
});

test('DRIBBLE vale 0 durante o cooldown', () => {
    const p = jogador({ z: 10, hasBall: true, dribbleCooldownTimer: 0.5 });
    const opp = jogador({ team: 'TeamB', z: 13 });
    assert.strictEqual(score('DRIBBLE', p, { opponents: [opp] }), 0);
});

test('DRIBBLE pontua com adversario na faixa e cooldown expirado', () => {
    const p = jogador({ z: 10, hasBall: true, dribbleCooldownTimer: 9 });
    const opp = jogador({ team: 'TeamB', z: 13 });
    assert.ok(score('DRIBBLE', p, { opponents: [opp] }) > 0);
});

test('DRIBBLE vale mais para quem tem mais tecnica', () => {
    const opp = jogador({ team: 'TeamB', z: 13, skills: { MARKING: 50 } });
    const craque = jogador({ z: 10, hasBall: true, dribbleCooldownTimer: 9, skills: { TEC: 90 } });
    const perna = jogador({ z: 10, hasBall: true, dribbleCooldownTimer: 9, skills: { TEC: 30 } });
    assert.ok(score('DRIBBLE', craque, { opponents: [opp] }) >
              score('DRIBBLE', perna, { opponents: [opp] }));
});

test('DRIBBLE vale menos perto da propria baliza', () => {
    const seguro = jogador({ z: 20, hasBall: true, dribbleCooldownTimer: 9 });
    const arriscado = jogador({ z: -35, hasBall: true, dribbleCooldownTimer: 9 });
    const oppS = jogador({ team: 'TeamB', z: 23 });
    const oppA = jogador({ team: 'TeamB', z: -32 });
    assert.ok(score('DRIBBLE', seguro, { opponents: [oppS] }) >
              score('DRIBBLE', arriscado, { opponents: [oppA] }));
});

test('DRIBBLE vale menos com varios adversarios por perto', () => {
    const p = jogador({ z: 10, hasBall: true, dribbleCooldownTimer: 9 });
    const um = [jogador({ team: 'TeamB', z: 13 })];
    const tres = [jogador({ team: 'TeamB', z: 13 }),
                  jogador({ team: 'TeamB', x: 3, z: 13 }),
                  jogador({ team: 'TeamB', x: -3, z: 12 })];
    assert.ok(score('DRIBBLE', p, { opponents: um }) >
              score('DRIBBLE', p, { opponents: tres }));
});

// Regressão do finding 1: 4 adversários (limite exacto de saturação do
// isolamento) e 6 adversários (bem acima) não podem zerar a acção.
test('DRIBBLE nao fica a 0 com quatro ou mais adversarios por perto (piso positivo)', () => {
    const base = { team: 'TeamB', z: 13 };
    const p4 = jogador({ z: 10, hasBall: true, dribbleCooldownTimer: 9 });
    const quatro = [
        jogador(Object.assign({}, base, { id: 10 })),
        jogador(Object.assign({}, base, { id: 11, x: 3 })),
        jogador(Object.assign({}, base, { id: 12, x: -3 })),
        jogador(Object.assign({}, base, { id: 13, x: 1.5 }))
    ];
    const s4 = score('DRIBBLE', p4, { opponents: quatro });
    assert.ok(s4 > 0, 'quatro adversarios devia dar score > 0, deu ' + s4);

    const p6 = jogador({ z: 10, hasBall: true, dribbleCooldownTimer: 9 });
    const seis = quatro.concat([
        jogador(Object.assign({}, base, { id: 14, x: -1.5 })),
        jogador(Object.assign({}, base, { id: 15, x: 4.5 }))
    ]);
    const s6 = score('DRIBBLE', p6, { opponents: seis });
    assert.ok(s6 > 0, 'seis adversarios devia dar score > 0, deu ' + s6);
});

test('DRIBBLE cercado (4+) continua estritamente abaixo do 1v1 isolado', () => {
    const p = jogador({ z: 10, hasBall: true, dribbleCooldownTimer: 9 });
    const base = { team: 'TeamB', z: 13 };
    const um = [jogador(Object.assign({}, base, { id: 20 }))];
    const cercado = [
        jogador(Object.assign({}, base, { id: 21 })),
        jogador(Object.assign({}, base, { id: 22, x: 3 })),
        jogador(Object.assign({}, base, { id: 23, x: -3 })),
        jogador(Object.assign({}, base, { id: 24, x: 1.5 }))
    ];
    assert.ok(score('DRIBBLE', p, { opponents: um }) >
              score('DRIBBLE', p, { opponents: cercado }));
});

// Regressão do finding 2: sem bola (mesmo com carryTouchGrace, que
// UtilityAI.tick trata como "com bola" para efeitos de entrar no ciclo de
// decisão) a pre-condicao tem de recusar.
test('DRIBBLE vale 0 sem hasBall mesmo com adversario valido a frente', () => {
    const p = jogador({ z: 10, hasBall: false, dribbleCooldownTimer: 9 });
    const opp = jogador({ team: 'TeamB', z: 13 });
    assert.strictEqual(score('DRIBBLE', p, { opponents: [opp] }), 0);
});

test('a FSM ja nao decide driblar', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const fsmSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'fsm.js'), 'utf8');
    const carry = fsmSrc.slice(fsmSrc.indexOf("case 'CARRY':"),
                               fsmSrc.indexOf("case 'DRIBBLE':"));
    assert.ok(!/changeState\(\s*'DRIBBLE'\s*\)/.test(carry),
        "o case 'CARRY' da FSM ainda decide entrar em DRIBBLE");
});

const { AccoesSemBola } = require('../js/utility/actions.js');

function scoreSem(nome, p, extra) {
    return avaliarAccao(accao(AccoesSemBola, nome), contexto(p, extra)).score;
}

function porPortador(opts) {
    const c = jogador(Object.assign({ team: 'TeamB', id: 99 }, opts));
    globalThis.Match.ballCarrier = c;
    return c;
}

test('o catalogo sem bola tem as sete accoes', () => {
    assert.deepStrictEqual(AccoesSemBola.map(a => a.nome).sort(),
        ['ATTACK_BOX', 'CHASE_BALL', 'HOLD_POSITION', 'INTERCEPT',
         'RECEIVE_PASS', 'SLIDE_TACKLE', 'TACKLE'].sort());
});

test('TACKLE vale 0 sem portador adversario', () => {
    globalThis.Match.ballCarrier = null;
    assert.strictEqual(scoreSem('TACKLE', jogador({ role: 'def' })), 0);
});

test('TACKLE vale 0 contra um colega de equipa', () => {
    globalThis.Match.ballCarrier = jogador({ team: 'TeamA', x: 1, z: 0 });
    const p = jogador({ team: 'TeamA', role: 'def', tempoPertoDoPortador: 9 });
    assert.strictEqual(scoreSem('TACKLE', p), 0);
});

test('TACKLE vale 0 antes do tempo do Defensive Pressure', () => {
    porPortador({ x: 1, z: 0 });
    const cedo = jogador({ role: 'def', tempoPertoDoPortador: 0.2 });
    assert.strictEqual(scoreSem('TACKLE', cedo, { distToBall: 1 }), 0);
});

test('TACKLE pontua depois do tempo do Defensive Pressure', () => {
    porPortador({ x: 1, z: 0 });
    const tarde = jogador({ role: 'def', tempoPertoDoPortador: 9 });
    assert.ok(scoreSem('TACKLE', tarde, { distToBall: 1 }) > 0);
});

test('TACKLE vale 0 fora do alcance', () => {
    porPortador({ x: 6, z: 0 });
    const p = jogador({ role: 'def', tempoPertoDoPortador: 9 });
    assert.strictEqual(scoreSem('TACKLE', p, { distToBall: 6 }), 0);
});

test('SLIDE_TACKLE so na faixa 2.5-4.5m', () => {
    const p = jogador({ role: 'def', tempoPertoDoPortador: 9 });
    porPortador({ x: 1.0, z: 0 });     // demasiado perto: e' TACKLE
    assert.strictEqual(scoreSem('SLIDE_TACKLE', p, { distToBall: 1 }), 0);
    porPortador({ x: 3.5, z: 0 });     // na faixa
    assert.ok(scoreSem('SLIDE_TACKLE', p, { distToBall: 3.5 }) > 0);
    porPortador({ x: 8.0, z: 0 });     // longe demais
    assert.strictEqual(scoreSem('SLIDE_TACKLE', p, { distToBall: 8 }), 0);
});

test('SLIDE_TACKLE vale 0 por tras do portador em movimento', () => {
    // Portador a mover-se em +z; defensor colocado atras dele (-z) fica a
    // mais de 90 graus do movimento — "carrinho por tras nao vale".
    const p = jogador({ role: 'def', tempoPertoDoPortador: 9, z: -3.5 });
    const c = porPortador({ x: 0, z: 0 });
    c.velocity = { x: 0, y: 0, z: 5, lengthSq: () => 25 };
    assert.strictEqual(scoreSem('SLIDE_TACKLE', p, { distToBall: 3.5 }), 0);
});

test('SLIDE_TACKLE vale mais que 0 de frente para o portador em movimento', () => {
    const p = jogador({ role: 'def', tempoPertoDoPortador: 9, z: 3.5 });
    const c = porPortador({ x: 0, z: 0 });
    c.velocity = { x: 0, y: 0, z: 5, lengthSq: () => 25 };
    assert.ok(scoreSem('SLIDE_TACKLE', p, { distToBall: 3.5 }) > 0);
});

test('SLIDE_TACKLE vale 0 para um avancado (posicao nao elegivel)', () => {
    const p = jogador({ role: 'atk', pos: 'CF', tempoPertoDoPortador: 9, z: 3.5 });
    porPortador({ x: 0, z: 0 });
    assert.strictEqual(scoreSem('SLIDE_TACKLE', p, { distToBall: 3.5 }), 0);
});

test('desarmar vale mais perto da propria baliza', () => {
    const p = jogador({ role: 'def', tempoPertoDoPortador: 9, z: -35 });
    porPortador({ x: 1, z: -35 });
    const perigo = scoreSem('TACKLE', p, { distToBall: 1 });

    const q = jogador({ role: 'def', tempoPertoDoPortador: 9, z: 20 });
    porPortador({ x: 1, z: 20 });
    const seguro = scoreSem('TACKLE', q, { distToBall: 1 });

    assert.ok(perigo > seguro, 'perigo=' + perigo + ' seguro=' + seguro);
});

test('INTERCEPT vale 0 quando podeIntercetar recusa', () => {
    globalThis.podeIntercetar = () => false;
    assert.strictEqual(scoreSem('INTERCEPT', jogador({})), 0);
});

test('INTERCEPT vale mais quando se chega mais depressa', () => {
    globalThis.podeIntercetar = () => true;
    // O valor real vem da percepção (js/player.js:106), não de um campo
    // solto no jogador — timeToIntercept nunca é escrito fora do blackboard.
    const rapido = jogador({}); rapido.blackboard.ball.timeToIntercept = 0.2;
    const lento = jogador({}); lento.blackboard.ball.timeToIntercept = 1.1;
    assert.ok(scoreSem('INTERCEPT', rapido) > scoreSem('INTERCEPT', lento));
});

test('CHASE_BALL vale muito mais para o chaser designado', () => {
    const p = jogador({});
    globalThis.Match.chaserA = p;
    const designado = scoreSem('CHASE_BALL', p, { distToBall: 6 });
    globalThis.Match.chaserA = null;
    const qualquer = scoreSem('CHASE_BALL', p, { distToBall: 6 });
    assert.ok(designado > qualquer * 2, 'designado=' + designado + ' qualquer=' + qualquer);
});

test('CHASE_BALL vale 0 a mais de 12m', () => {
    const p = jogador({});
    globalThis.Match.chaserA = p;
    assert.strictEqual(scoreSem('CHASE_BALL', p, { distToBall: 15 }), 0);
});

test('CHASE_BALL nao designado vale 0 fora do alcance de disputa', () => {
    const p = jogador({});
    globalThis.Match.chaserA = null;
    globalThis.Match.chaserB = null;
    assert.strictEqual(scoreSem('CHASE_BALL', p, { distToBall: 6 }), 0);
});

test('CHASE_BALL nao designado pontua dentro do alcance de disputa', () => {
    const p = jogador({});
    globalThis.Match.chaserA = null;
    globalThis.Match.chaserB = null;
    assert.ok(scoreSem('CHASE_BALL', p, { distToBall: 3 }) > 0);
});

test('CHASE_BALL do designado nao muda com o alcance de disputa', () => {
    const p = jogador({});
    globalThis.Match.chaserA = p;
    const perto = scoreSem('CHASE_BALL', p, { distToBall: 3 });
    const longe = scoreSem('CHASE_BALL', p, { distToBall: 8 });
    assert.ok(perto > 0 && longe > 0, 'perto=' + perto + ' longe=' + longe);
});

test('RECEIVE_PASS domina quando o passe vem para mim', () => {
    const p = jogador({});
    globalThis.Match.intendedReceiver = p;
    assert.ok(scoreSem('RECEIVE_PASS', p) > 0.9);
    globalThis.Match.intendedReceiver = null;
    assert.strictEqual(scoreSem('RECEIVE_PASS', p), 0);
});

test('ATTACK_BOX vale 0 para defesas', () => {
    const c = jogador({ team: 'TeamA', x: 18, z: 30 });
    globalThis.Match.ballCarrier = c;
    assert.strictEqual(scoreSem('ATTACK_BOX', jogador({ role: 'def' })), 0);
});

test('ATTACK_BOX vale 0 se o colega nao esta em posicao de cruzar', () => {
    globalThis.Match.ballCarrier = jogador({ team: 'TeamA', x: 2, z: 5 });
    assert.strictEqual(scoreSem('ATTACK_BOX', jogador({ role: 'atk' })), 0);
});

test('ATTACK_BOX pontua positivo para quem esta perto da area', () => {
    globalThis.Match.ballCarrier = jogador({ team: 'TeamA', x: 18, z: 30 });
    const p = jogador({ team: 'TeamA', role: 'atk', id: 2, z: 32 });
    assert.ok(scoreSem('ATTACK_BOX', p) > 0);
});

test('ATTACK_BOX nao fica a 0 para quem esta longe da area (piso positivo)', () => {
    globalThis.Match.ballCarrier = jogador({ team: 'TeamA', x: 18, z: 30 });
    const perto = jogador({ team: 'TeamA', role: 'atk', id: 2, z: 32 });
    const longe = jogador({ team: 'TeamA', role: 'mid', id: 3, z: 0 });
    const sPerto = scoreSem('ATTACK_BOX', perto);
    const sLonge = scoreSem('ATTACK_BOX', longe);
    assert.ok(sLonge > 0, 'longe deveria ser > 0, deu ' + sLonge);
    assert.ok(sPerto > sLonge, 'perto=' + sPerto + ' longe=' + sLonge);
});

test('HOLD_POSITION tem sempre score baixo mas nao nulo', () => {
    const s = scoreSem('HOLD_POSITION', jogador({}));
    assert.ok(s > 0 && s < 0.35, 'HOLD_POSITION=' + s);
});

test('cada accao sem bola declara a chave de estilo certa', () => {
    const esperado = {
        SLIDE_TACKLE: 'pressao', TACKLE: 'pressao', INTERCEPT: 'intercetar',
        CHASE_BALL: null, RECEIVE_PASS: null, ATTACK_BOX: 'apoiar',
        HOLD_POSITION: 'marcar'
    };
    for (const a of AccoesSemBola) {
        assert.strictEqual(a.estilo, esperado[a.nome], a.nome + ' com estilo errado');
    }
});
