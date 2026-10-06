/*
O ESTILO DA EQUIPA DEPENDE DE QUEM JOGA, E CADA EQUIPA TEM O SEU.

Pedido de 5 de Outubro de 2026: cada estilo com as suas caracteristicas, para o
tecnico variar conforme os jogadores em campo — contra-ataque com velozes (Dummy
Runner, Goal Poacher), jogo de alas com Cross Specialist e Prolific Winger,
posse com Classic No.10, Creative Playmaker, Orchestrator, Target Man e Fox in
the Box, e jogo directo com passes rapidos ao ataque.

Este teste fixa a CONFIGURACAO (os efeitos medem-se em jogos, ver
docs/filesSummary.md): que cada estilo traz o que o pedido diz, que as
afinidades apontam para Playing Styles que existem, e que `estiloDaEquipaDe`
deixa a equipa B ter o seu estilo sem mexer na A.

Corre com: node --test tests/estilo_da_equipa.test.js
*/
const test = require('node:test');
const assert = require('node:assert');
require('../tools/headless/harness.js');

test('todos os estilos de equipa existem e os campos novos sao coerentes', () => {
    for (const k of ['positional', 'possession', 'direct', 'counter_attack', 'wing_play']) {
        assert.ok(TeamPlayStyles[k], `falta o estilo ${k}`);
        const afin = TeamPlayStyles[k].afinidade || {};
        for (const ps of Object.keys(afin)) {
            assert.ok(PlayingStyles[ps], `${k}: a afinidade ${ps} nao e um Playing Style`);
            assert.ok(afin[ps] > 0 && afin[ps] <= 800, `${k}: afinidade ${ps} = ${afin[ps]} fora de escala`);
        }
    }
});

test('Counter Attack procura os veloces e abre uma janela maior', () => {
    const C = TeamPlayStyles.counter_attack;
    assert.ok(C.afinidade.dummy_runner > 0 && C.afinidade.goal_poacher > 0);
    assert.ok(C.contra.janela > 4.0, 'a janela do contra-ataque tem de ser maior do que a de sempre (4 s)');
    assert.ok(C.contra.zRecuperacao > -10, 'abre-se mais perto da baliza adversaria');
    assert.ok(C.contra.velocidade > 1.25, 'o sprint e mais rapido do que o de sempre');
    assert.ok(C.velocidade > 0 && C.corridas > 1 && C.corridasContra > 1);
    // Os outros estilos nao tem `contra`: ficam com a janela de sempre.
    for (const k of ['positional', 'possession', 'direct', 'wing_play']) assert.ok(!TeamPlayStyles[k].contra, `${k}`);
});

test('Wing Play: pontas, cruzamento e area cheia', () => {
    const W = TeamPlayStyles.wing_play;
    assert.ok(W.afinidade.prolific_winger > 0 && W.afinidade.cross_specialist > 0);
    assert.ok(W.cruzamento >= 1.4);
    assert.ok(W.alas.bonusReceptor > 0 && W.alas.conducaoAlas > 1);
    assert.ok(W.cruzamentoZona.alaX < CrossModel.alaX, 'cruza-se de mais cedo na ala');
    assert.ok(W.areaComBolaNaAla.zArea > 34 - 1, 'os atacantes ocupam a grande area');
});

test('Possession e Direct: afinidades e decisao', () => {
    const P = TeamPlayStyles.possession, D = TeamPlayStyles.direct;
    for (const k of ['classic_no10', 'creative_playmaker', 'orchestrator', 'target_man', 'fox_in_the_box']) {
        assert.ok(P.afinidade[k] > 0, `Possession: ${k}`);
    }
    assert.ok(P.seguranca > 0 && P.riscoLinha > 1);
    assert.ok(D.cadenciaPosse < P.cadenciaPosse + 1 && D.cadenciaPosse < 1, 'o Direct decide depressa');
    assert.ok(D.passeRapido > 1 && D.bonusAtaque > 0 && D.lancamento > 1);
    assert.ok(D.verticalidade > TeamPlayStyles.positional.verticalidade);
});

test('estiloDaEquipaDe: a B segue o painel ate ter o seu', () => {
    const antes = { a: Tatics.teamPlayStyle, b: Tatics.teamPlayStyleB };
    try {
        Tatics.teamPlayStyle = 'direct'; Tatics.teamPlayStyleB = null;
        assert.strictEqual(estiloDaEquipaDe('TeamA'), TeamPlayStyles.direct);
        assert.strictEqual(estiloDaEquipaDe('TeamB'), TeamPlayStyles.direct, 'sem estilo proprio a B segue o painel');
        Tatics.teamPlayStyleB = 'wing_play';
        assert.strictEqual(estiloDaEquipaDe('TeamA'), TeamPlayStyles.direct, 'a A nao muda');
        assert.strictEqual(estiloDaEquipaDe('TeamB'), TeamPlayStyles.wing_play);
        Tatics.teamPlayStyle = 'estilo_que_nao_existe';
        assert.strictEqual(estiloDaEquipaDe('TeamA'), TeamPlayStyles.positional, 'um estilo desconhecido cai no Positional');
    } finally {
        Tatics.teamPlayStyle = antes.a; Tatics.teamPlayStyleB = antes.b;
    }
});
