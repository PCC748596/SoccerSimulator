/*
O QUE É UM "ATAQUE" — a reconciliação do contador com o alvo do relatório.

O lote de 60 jogos dava 63.7 ataques totais (36% do alvo de 176.63) e 37.6
perigosos (48% de 77.84). Parecia o maior defeito de jogo do simulador. Metade
dele era de MEDIÇÃO, e a prova está numa razão:

    perigosos / totais no ALVO ............ 77.84 / 176.63 = 44%
    a mesma razão no jogo, pelo código antigo ............. 59%
    e a contar sequências de posse à parte (headless) ..... 44%

Três defeitos, todos no contador:

 1. a sequência só nascia com um PORTADOR novo (`seguirAtaque` corre apenas com
    `Match.ballCarrier`), e por isso um corte de cabeça, um alívio ou uma
    deflexão do adversário não abriam sequência nenhuma: a posse seguinte ficava
    colada à anterior;
 2. exigia-se que a sequência tivesse passado o meio-campo para contar como
    ataque — o alvo conta todas as posses;
 3. o último terço era marcado pelo PORTADOR, e não pela bola: um cruzamento ou
    um passe longo que lá caem não tornavam a sequência perigosa.

Depois, com sementes fixas: 129-136 totais (73-77% do alvo) e 58-62 perigosos
(75-80%), com a razão em 45% contra os 44% do alvo. O que sobra é jogo a
menos — uniforme nas duas linhas —, e já não é um fantasma de 64%.

Corre com: node tests/ataques_contados.test.js
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

for (let i = 0; i < Math.round(600 / dt); i++) Match.update(dt);

const A = MatchStats.TeamA, B = MatchStats.TeamB;
const min = Match.tempoDeJogo / 60;
const totais = (A.ataques.totais + B.ataques.totais) * 90 / min;
const perigosos = (A.ataques.perigosos + B.ataques.perigosos) * 90 / min;
const razao = 100 * perigosos / Math.max(1, totais);

test('cada posse é uma sequência, e as sequências são muitas', () => {
    /*
    Pelo código antigo dava 63.7 por 90. Um jogo tem mais de cem posses; abaixo
    de 100 é o contador a colar sequências outra vez.
    */
    assert.ok(totais > 100,
        `${totais.toFixed(1)} ataques por 90: as sequências voltaram a colar-se umas às outras`);
    assert.ok(totais < 200,
        `${totais.toFixed(1)} ataques por 90: está a contar ressaltos como posses`);
});

test('a razão perigosos/totais bate com a do alvo', () => {
    // Alvo: 77.84 / 176.63 = 44%. Medido, com sementes fixas: 45-46%.
    assert.ok(razao > 35 && razao < 55,
        `razão perigosos/totais = ${razao.toFixed(0)}% (o alvo é 44%)`);
});

test('o último terço é marcado pela BOLA, e a sequência pela POSSE', () => {
    const fs = require('fs');
    const path = require('path');
    const raiz = path.join(__dirname, '..');
    const stats = fs.readFileSync(path.join(raiz, 'js/stats.js'), 'utf8');
    const loop = fs.readFileSync(path.join(raiz, 'js/match/match_loop.js'), 'utf8');

    assert.ok(stats.includes('seguirBolaNoAtaque'),
        'o último terço voltou a ser marcado só pelo portador');
    assert.ok(stats.includes('seguirToque:'),
        'a sequência voltou a nascer só com um portador novo');

    // A sequência segue a POSSE. Pelo TOQUE contam-se os ressaltos: medido,
    // 172.7 sequências por 90 e a razão a cair para 23%.
    assert.ok(/seguirToque\(this\.possessionTeam\)/.test(loop),
        'a sequência deixou de seguir a posse');

    // E não se exige ter passado o meio-campo para contar como ataque.
    const iFechar = stats.indexOf('fecharAtaque: function');
    const corpo = stats.slice(iFechar, iFechar + 600);
    assert.ok(!/if \(!a\.passouOMeio\) return;/.test(corpo),
        'voltou a exigir-se passar o meio-campo — o alvo conta todas as posses');
});
