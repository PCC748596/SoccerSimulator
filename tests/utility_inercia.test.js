const test = require('node:test');
const assert = require('node:assert');
const { jogador, carregarActions, contexto } = require('./helpers/stubs.js');
carregarActions();
const { UtilityAI, bonusDeInercia } = require('../js/utility/player_utility.js');

test('accao diferente da actual nao recebe bonus', () => {
    const p = jogador({});
    p.utilityAccao = 'PASS';
    p.utilityTempoNaAccao = 0.1;
    assert.strictEqual(bonusDeInercia(p, 'SHOOT', contexto(p)), 1.0);
});

test('accao sem historico nao recebe bonus', () => {
    const p = jogador({});
    assert.strictEqual(bonusDeInercia(p, 'PASS', contexto(p)), 1.0);
});

test('accao recem-escolhida recebe quase todo o bonus', () => {
    const p = jogador({});
    p.utilityAccao = 'CARRY';
    p.utilityTempoNaAccao = 0;
    const b = bonusDeInercia(p, 'CARRY', contexto(p));
    assert.ok(Math.abs(b - 1.45) < 0.01, 'bonus=' + b);
});

test('o bonus decai com o tempo', () => {
    const p = jogador({});
    p.utilityAccao = 'CARRY';
    p.utilityTempoNaAccao = 0;
    const cedo = bonusDeInercia(p, 'CARRY', contexto(p));
    p.utilityTempoNaAccao = 2.5;
    const tarde = bonusDeInercia(p, 'CARRY', contexto(p));
    assert.ok(cedo > tarde, 'cedo=' + cedo + ' tarde=' + tarde);
    assert.ok(tarde < 1.05, 'ao fim de 2.5s o bonus devia ser residual: ' + tarde);
});

test('o bonus nunca desce abaixo de 1.0', () => {
    const p = jogador({});
    p.utilityAccao = 'CARRY';
    p.utilityTempoNaAccao = 60;
    assert.ok(bonusDeInercia(p, 'CARRY', contexto(p)) >= 1.0);
});

test('sob pressao o bonus decai mais depressa', () => {
    const p = jogador({});
    p.utilityAccao = 'CARRY';
    p.utilityTempoNaAccao = 0.5;
    const livre = bonusDeInercia(p, 'CARRY', contexto(p));
    const sob = bonusDeInercia(p, 'CARRY', contexto(p, { underPressure: true }));
    assert.ok(livre > sob, 'livre=' + livre + ' sob=' + sob);
});

test('a cadencia do estilo escala o decaimento', () => {
    const lento = jogador({});           // Target Man: cadencia 1.6
    lento._estilo = { cadencia: 1.6 };
    lento.utilityAccao = 'CARRY';
    lento.utilityTempoNaAccao = 0.8;

    const rapido = jogador({});          // Fox in the Box: cadencia 0.6
    rapido._estilo = { cadencia: 0.6 };
    rapido.utilityAccao = 'CARRY';
    rapido.utilityTempoNaAccao = 0.8;

    assert.ok(bonusDeInercia(lento, 'CARRY', contexto(lento)) >
              bonusDeInercia(rapido, 'CARRY', contexto(rapido)),
        'quem segura a bola devia manter o bonus mais tempo');
});

/*
UtilityAI.tick — relogio de inercia avanca mesmo em frames gateados.

Simula o cenario da Finding 3: um remate (estado SHOOT) ocupa a FSM durante
1.5s reais. Durante esses frames o tick chega a gatesDuros (estadoBloqueante)
e devolve sem pontuar nada — mas player.utilityTempoNaAccao tem de continuar
a avancar, senao bonusDeInercia devolve o bonus inteiro outra vez quando a
accao volta a ser avaliada, como se nenhum tempo tivesse passado.
*/
test('tick: o relogio de inercia avanca mesmo num frame gateado (estado bloqueante)', () => {
    const p = jogador({ hasBall: true });
    p.utilityAccao = 'SHOOT';
    p.utilityTempoNaAccao = 0;
    p.fsm.currentState = 'SHOOT';           // AccaoEmCurso -> gatesDuros devolve true
    p.btCtx = { prepare: (dt) => contexto(p, { dt: dt }) };

    globalThis.Match.state = 'PLAY';

    const dt = 1 / 60;
    UtilityAI.tick(p, dt);

    assert.ok(Math.abs(p.utilityTempoNaAccao - dt) < 1e-9,
        'esperava o relogio avancado em dt mesmo com o frame gateado, ficou em ' +
        p.utilityTempoNaAccao);
    // A accao gravada nao muda so por ter gateado o frame.
    assert.strictEqual(p.utilityAccao, 'SHOOT');
});

test('tick: varios frames gateados seguidos acumulam o tempo real decorrido', () => {
    const p = jogador({ hasBall: true });
    p.utilityAccao = 'TACKLE';
    p.utilityTempoNaAccao = 0;
    p.fsm.currentState = 'TACKLE';
    p.btCtx = { prepare: (dt) => contexto(p, { dt: dt }) };
    globalThis.Match.state = 'PLAY';

    const dt = 1 / 60;
    for (let i = 0; i < 90; i++) UtilityAI.tick(p, dt); // 1.5s de animacao bloqueante

    assert.ok(Math.abs(p.utilityTempoNaAccao - 90 * dt) < 1e-6,
        'esperava ~1.5s acumulados, ficou em ' + p.utilityTempoNaAccao);
});
