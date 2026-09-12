/*
OS PLANTEIS REAIS — `data/squads.js`, gerado de `assets/players.json` e
`assets/teams.json` por `tools/gen_squads.js`.

O que este teste guarda não é o conteúdo (que muda quando os dados de origem
mudarem) mas as INVARIANTES de que o motor depende:

  - toda a equipa da lista dá um onze montável, com guarda-redes;
  - as nove skills do `skillFor` existem e estão em 1..100 — uma skill em
    falta cai no genérico em silêncio (ver player.skillFor) e o jogador fica
    a jogar com um valor que ninguém escolheu;
  - todo o `estilo` gravado existe mesmo no catálogo `PlayingStyles`, senão
    o `aplicarPlayingStyle` deita-o fora sem dizer nada;
  - o `escolherOnze` devolve onze jogadores DIFERENTES pela ordem da
    formação, para as três formações.

Corre com: node tests/planteis_reais.test.js
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const semCR = (s) => s.replace(/\r/g, '');

// Os ficheiros são scripts clássicos (`const X = {...}`), não módulos — o
// mesmo molde do tests/tendencia_por_posicao_e_jogador.test.js.
const ler = (rel, nome) => {
    const src = semCR(fs.readFileSync(path.join(raiz, rel), 'utf8'));
    return new Function(src + '; return ' + nome + ';')();
};

const SquadsData = ler('data/squads.js', 'SquadsData');

/*
O `tactics.js` corrido inteiro mexe no `window` (escreve o modo de câmara por
omissão), que num teste não existe. Tira-se só o objecto pedido do texto, que
é o que os outros testes de config já fazem.
*/
const tacticsSrc = semCR(fs.readFileSync(path.join(raiz, 'js/config/tactics.js'), 'utf8'));
function extrairObjecto(nome) {
    const ini = tacticsSrc.indexOf('const ' + nome + ' = {');
    assert.ok(ini > 0, nome + ' não encontrado em tactics.js');
    const fim = tacticsSrc.indexOf(String.fromCharCode(10) + '};', ini);
    return new Function('return ' + tacticsSrc.slice(ini + ('const ' + nome + ' = ').length, fim + 2) + ';')();
}
const PlayingStyles = extrairObjecto('PlayingStyles');
const FormationsData = extrairObjecto('FormationsData');
const { PosicaoPorIndice, PbPorPos, EstiloJsonParaMotor, skillDeAtributos,
    escolherOnzeDaFormacao, SkillCalib, estiloDeAtributos, regrasDeEstilo } =
    require(path.join(raiz, 'js/config/skill_map.js'));

const SKILLS = ['gk', 'tec', 'marking', 'intercept', 'pass', 'speed',
    'strength', 'tacticknow', 'stamina', 'fitness'];

const equipas = SquadsData.equipas;
const todos = equipas.flatMap(e => e.plantel);

test('há planteis, e todos dão um onze', () => {
    assert.ok(equipas.length >= 20, `só ${equipas.length} equipas — o conversor filtrou de mais`);
    for (const e of equipas) {
        assert.ok(e.plantel.length >= 11, `${e.nome}: plantel de ${e.plantel.length}`);
        assert.ok(e.plantel.some(j => j.pos === 'GK'), `${e.nome}: nenhum guarda-redes`);
        assert.ok(e.nome && e.nome.length > 0, `equipa ${e.id} sem nome`);
    }
});

test('as nove skills existem e estão em 1..100', () => {
    for (const j of todos) {
        for (const s of SKILLS) {
            assert.ok(typeof j[s] === 'number',
                `${j.nome}: skill ${s} em falta — o skillFor cairia no genérico`);
            assert.ok(j[s] >= 1 && j[s] <= 100, `${j.nome}: ${s} = ${j[s]}`);
        }
        assert.ok(PbPorPos[j.pos], `${j.nome}: posição ${j.pos} não é do motor`);
    }
});

test('todo o playing style gravado existe no catálogo', () => {
    const semCatalogo = todos.filter(j => j.estilo && !PlayingStyles[j.estilo]);
    assert.equal(semCatalogo.length, 0,
        `estilos que o motor não tem: ${[...new Set(semCatalogo.map(j => j.estilo))].join(', ')}`);

    // E o mapa não pode apontar para chaves inventadas.
    for (const chave of Object.values(EstiloJsonParaMotor)) {
        assert.ok(PlayingStyles[chave], `EstiloJsonParaMotor aponta para ${chave}, que não existe`);
    }
});

test('o mapa de posições cobre o que as formações pedem', () => {
    assert.equal(PosicaoPorIndice.length, 13,
        'o firstPosition é um índice 1..13 nas colunas pb* — a lista tem de ter 13 entradas');
    for (const chave in FormationsData) {
        for (const slot of FormationsData[chave]) {
            assert.ok(PbPorPos[slot.pos],
                `a formação ${chave} pede ${slot.pos} e não há coluna pb* para essa posição`);
        }
    }
});

/*
O ONZE sai de `escolherOnzeDaFormacao` — a MESMA função que o jogo
(`Match.escolherOnze`) e o conversor usam. O teste não repete a regra: se a
repetisse, passava a guardar a cópia dele e não o que o jogo faz.
*/
test('cada equipa monta as três formações sem repetir jogadores', () => {
    for (const chave in FormationsData) {
        const fData = FormationsData[chave];
        for (const e of equipas) {
            const onze = escolherOnzeDaFormacao(e.plantel, fData.map(f => f.pos));
            assert.ok(onze && onze.every(x => x), `${e.nome} / ${chave}: lugar por preencher`);
            assert.equal(new Set(onze.map(j => j.id)).size, 11,
                `${e.nome} / ${chave}: jogador repetido no onze`);
            assert.equal(onze[0].pos, 'GK',
                `${e.nome} / ${chave}: à baliza foi parar um ${onze[0].pos}`);
        }
    }
});

/*
A TRADUÇÃO DE ATRIBUTOS é uma média pesada e tem de se comportar como tal:
pesos relativos, campos em falta fora da conta (e não a valer zero, que
baixava a skill toda), e o resultado preso a 1..100.
*/
test('skillDeAtributos: média pesada, campos em falta fora da conta', () => {
    assert.equal(skillDeAtributos({ a: 80, b: 40 }, { a: 1, b: 1 }), 60);
    assert.equal(skillDeAtributos({ a: 80, b: 40 }, { a: 3, b: 1 }), 70);
    // `b` não existe no registo: a skill é o `a` e não a média com zero.
    assert.equal(skillDeAtributos({ a: 80 }, { a: 1, b: 1 }), 80);
    assert.equal(skillDeAtributos({ a: 500 }, { a: 1 }), 100);
    assert.equal(skillDeAtributos({ a: -5 }, { a: 1 }), 1);
    assert.equal(skillDeAtributos(null, { a: 1 }), null);
});

/*
A ESCALA. O que joga são os titulares, e é a média DELES que tem de cair na
banda para que o motor está calibrado (ver SkillCalib em skill_map.js, com a
medição que o motivou: calibrar pelo plantel inteiro punha o onze quatro
pontos acima e dava 3.85 golos por 90 em vez de 2.52).
*/
test('a escala dos titulares cai na banda do motor', () => {
    const ONZE_442 = ['GK', 'RB', 'CB', 'CB', 'LB', 'RM', 'CM', 'CM', 'LM', 'CF', 'CF'];
    const titulares = [];
    for (const e of equipas) {
        const onze = escolherOnzeDaFormacao(e.plantel, ONZE_442);
        if (onze) titulares.push(...onze);
    }
    assert.ok(titulares.length > 300, `só ${titulares.length} titulares medidos`);

    for (const chave in SkillCalib.alvo) {
        const alvo = SkillCalib.alvo[chave];
        const amostra = (chave === 'gk') ? titulares.filter(j => j.pos === 'GK') : titulares;
        const v = amostra.map(j => j[chave]).filter(x => typeof x === 'number');
        const media = v.reduce((a, b) => a + b, 0) / v.length;
        // Dois pontos de folga: o corte em 1..100 apara as pontas e desloca a
        // média um pouco, sobretudo no `gk`, que vive junto ao tecto.
        assert.ok(Math.abs(media - alvo.media) <= 2.5,
            `${chave}: titulares a ${media.toFixed(1)}, alvo ${alvo.media}`);
    }
});

/*
OS PLAYING STYLES. O ficheiro de origem só traz o campo em 91 dos 3 124
registos — os outros 97% ficam com um estilo DERIVADO dos atributos (ver
EstiloDerivado em skill_map.js). O que este teste guarda:

  - ninguém fica sem estilo, senão volta-se ao estilo por omissão da posição
    e os atributos do ficheiro deixam de ter consequência;
  - o estilo derivado é LEGAL para a posição natural do jogador, senão o
    `aplicarPlayingStyle` deita-o fora em silêncio;
  - nenhuma posição fica dominada por um estilo só. Foi o defeito da primeira
    versão: comparava notas em bruto e dava 322 `the_destroyer` contra 18
    `build_up` nos centrais, porque neste ficheiro os centrais desarmam
    melhor do que passam.
*/
test('todo o jogador tem estilo, legal para a posição dele', () => {
    const semEstilo = todos.filter(j => !j.estilo);
    assert.equal(semEstilo.length, 0, `${semEstilo.length} jogadores sem playing style`);

    const derivados = todos.filter(j => j.estiloOrigem === 'derivado');
    assert.ok(derivados.length > todos.length / 2,
        `só ${derivados.length} estilos derivados — a derivação não está a correr`);

    for (const j of derivados) {
        const def = PlayingStyles[j.estilo];
        assert.ok(def, `${j.nome}: estilo ${j.estilo} não existe no catálogo`);
        assert.ok(def.posicoes.indexOf(j.pos) >= 0,
            `${j.nome} (${j.pos}): estilo derivado ${j.estilo} não é legal nessa posição`);
    }
});

test('nenhuma posição fica dominada por um estilo só', () => {
    const porPos = {};
    for (const j of todos) {
        if (j.estiloOrigem !== 'derivado') continue;
        (porPos[j.pos] = porPos[j.pos] || {});
        porPos[j.pos][j.estilo] = (porPos[j.pos][j.estilo] || 0) + 1;
    }
    for (const pos in porPos) {
        const contagens = Object.values(porPos[pos]);
        const total = contagens.reduce((a, b) => a + b, 0);
        // Posições com pouca gente (o ficheiro quase não tem LM/RM de origem)
        // não dizem nada sobre distribuição.
        if (total < 30) continue;
        const maior = Math.max(...contagens);
        const quantos = regrasDeEstilo(pos) ? regrasDeEstilo(pos).length : 1;
        assert.ok(maior / total <= 0.7,
            `${pos}: ${(100 * maior / total).toFixed(0)}% num estilo só, de ${quantos} candidaturas`);
    }
});

/*
A derivação sem população compara notas em bruto; com população compara o
z-score. As duas têm de continuar a funcionar — a primeira é o que serve um
registo sozinho, a segunda é o que o conversor usa.
*/
test('estiloDeAtributos: bruto sem população, relativo com ela', () => {
    // Um central que passa muito melhor do que desarma.
    const passador = { passing: 95, longPassing: 92, composure: 90,
        headAccurancy: 40, strength: 45, jumping: 40,
        tackleStanding: 50, aggression: 45, manMarking: 48 };
    assert.equal(estiloDeAtributos(passador, 'CB'), 'build_up');

    // O mesmo jogador entre centrais que passam ainda melhor: deixa de ser o
    // que se destaca a passar.
    const pop = {
        build_up: { media: 300, desvio: 5 },
        extra_frontman: { media: 100, desvio: 5 },
        the_destroyer: { media: 100, desvio: 5 }
    };
    assert.notEqual(estiloDeAtributos(passador, 'CB', pop), 'build_up');

    // Posição sem candidaturas não inventa estilo.
    assert.equal(estiloDeAtributos(passador, 'SS'), null);
});
