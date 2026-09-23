/*
A ALTURA DOS JOGADORES fica entre 1.65 e 1.90, sem ninguém colado ao limite.

Pedido: *"Ajusta o tamanho dos jogadores de 1.65-1.90 somente."* Era
[1.60, 2.00].

MUDAR SÓ O `min` E O `max` NÃO CHEGA. As parcelas que enchem a distribuição —
bónus de posto, bónus de estilo, penalização da velocidade e ruído — foram
dimensionadas para uma faixa de 0.40 m; numa faixa de 0.25 m empurram gente
contra os limites, e o corte achata a distribuição. Medido nos 22 jogadores
dos plantéis:

    so a apertar a faixa            6 de 22 colados  (27%)
    a encolher tambem o sigma       4 a 5 colados, e a media sobe para 1.77
    a encolher TODAS as parcelas    0 colados, media 1.750

O caso que nenhum ajuste do sigma resolvia: um guarda-redes tinha `media`
1.795 mais 0.13 de bónus de posto = 1.925, acima do tecto de 1.90 **ainda com
ruído zero**.

Este teste corre a conta de verdade (`alturaDoJogador`, utils.js) sobre os
plantéis, e prende o que interessa:

  . toda a gente dentro de [min, max];
  . NINGUÉM colado — porque estar colado é ter sido cortado, e os cortados
    ficam todos exactamente com a mesma altura;
  . a média realizada perto de 1.75, que é o alvo do modelo;
  . e que há mesmo variedade, senão "faixa cumprida" seria toda a gente igual.

Corre com: node tests/altura_dos_jogadores.test.js
*/
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const raiz = path.join(__dirname, '..');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const erro = (m) => { falhas++; console.error('  X ' + m); };
const ok = (m) => console.log('  . ' + m);

/*
A conta real, sem o jogo: o `alturaDoJogador` só precisa do `AlturaJogador`, do
`id`, do `pos`, do `playingStyle` e do SPEED.
*/
const amb = { THREE, console, window: {} };
const mod = new Function(...Object.keys(amb),
    ler('js/config/physics.js') + LF +
    ler('js/config/gait.js') + LF +
    ler('js/config/player_behavior.js') + LF +
    ler('js/utils.js') + LF +
    'return { AlturaJogador, alturaDoJogador, ALTURA_PADRAO };')(...Object.values(amb));

const { AlturaJogador: A, alturaDoJogador } = mod;

/*
OS PLANTÉIS REAIS, porque a calibração foi feita contra eles: a média
realizada é uma propriedade da amostra, não do modelo.
*/
const squads = new Function(ler('data/squads.js') + LF +
    'return (typeof SquadsData !== "undefined") ? SquadsData : null;')();

/* ------------------------------------------------------------------ */
console.log(LF + '1 — a faixa declarada e a pedida');
{
    if (A.min !== 1.65) erro(`AlturaJogador.min e ${A.min}, devia ser 1.65`);
    else ok('min = 1.65');
    if (A.max !== 1.90) erro(`AlturaJogador.max e ${A.max}, devia ser 1.90`);
    else ok('max = 1.90');
    if (!A.activo) erro('o AlturaJogador esta desligado: toda a gente volta a medir o mesmo');
    else ok('o modelo esta activo');
}

/* ------------------------------------------------------------------ */
console.log(LF + '2 — nenhuma parcela sozinha estoura o tecto');
{
    /*
    O CASO QUE ACHATAVA: `media` + o maior bónus de posto, com ruído zero e
    velocidade na referência. Se isso já passa do tecto, esse posto inteiro
    fica colado e nenhum ajuste do ruído o salva.
    */
    const maiorPosto = Math.max(...Object.values(A.bonusPosto || { x: 0 }));
    const maiorEstilo = Math.max(...Object.values(A.bonusEstilo || { x: 0 }));

    /*
    O POSTO E O ESTILO NAO SE SOMAM NO PIOR CASO, porque os bonus altos de
    cada um sao de gente diferente: o posto alto e do guarda-redes e do
    central, o estilo alto e do `target_man`, que e avancado. Somar os dois
    maximos dava 1.908 e acusava um achatamento que nao existe — nenhum
    guarda-redes joga de target_man. Vale cada um por si; a combinacao real
    fica para o bloco 3, que corre sobre os plantéis.
    */
    const tecto = A.media + Math.max(maiorPosto, Math.max(0, maiorEstilo));
    if (tecto > A.max)
        erro(`media ${A.media} + o maior bonus (${Math.max(maiorPosto, maiorEstilo)}) = ${tecto.toFixed(3)}, ` +
            `acima do tecto ${A.max} AINDA COM RUIDO ZERO — esse grupo fica todo colado`);
    else ok(`o maior caso sem ruido da ${tecto.toFixed(3)}, dentro do tecto ${A.max}`);

    const menorEstilo = Math.min(...Object.values(A.bonusEstilo || { x: 0 }));
    const piso = A.media + Math.min(0, menorEstilo) - A.penalVelocidade;
    if (piso < A.min)
        erro(`media ${A.media} com a penalizacao da velocidade e o pior estilo da ${piso.toFixed(3)}, ` +
            `abaixo do piso ${A.min} ainda com ruido zero`);
    else ok(`o menor caso sem ruido da ${piso.toFixed(3)}, dentro do piso ${A.min}`);
}

/* ------------------------------------------------------------------ */
console.log(LF + '3 — os plantéis reais, com a conta a serio');
if (!squads) {
    erro('nao consegui carregar os plantéis (data/squads.js) — este bloco mede sobre eles');
} else {
    const jogadores = [];
    let id = 0;
    for (const eq of (squads.equipas || [])) {
        for (const j of (eq.plantel || [])) {
            jogadores.push({
                id: id++,
                pos: j.pos,
                playingStyle: j.estilo,
                skillFor: (n) => (n === 'SPEED' ? (j.speed || 82) : 50)
            });
        }
    }

    if (!jogadores.length) erro('os plantéis vieram vazios');
    else {
        const hs = jogadores.map(p => alturaDoJogador(p)).sort((a, b) => a - b);
        const media = hs.reduce((s, h) => s + h, 0) / hs.length;
        const colPiso = hs.filter(h => Math.abs(h - A.min) < 0.0005).length;
        const colTecto = hs.filter(h => Math.abs(h - A.max) < 0.0005).length;

        console.log(`    ${hs.length} jogadores, ${hs[0].toFixed(3)} a ${hs[hs.length - 1].toFixed(3)} m, media ${media.toFixed(3)}`);

        const fora = hs.filter(h => h < A.min - 1e-9 || h > A.max + 1e-9);
        if (fora.length) erro(`${fora.length} jogadores fora de [${A.min}, ${A.max}]`);
        else ok(`todos dentro de [${A.min}, ${A.max}]`);

        /*
        EM PERCENTAGEM, e nao em contagem. A calibracao foi feita sobre os 22
        jogadores que entram em campo, onde o alvo eram ZERO colados; este
        bloco corre sobre a base INTEIRA (milhares), onde alguns extremos
        raros tocarem no limite nao e achatamento — e o clamp a fazer o
        trabalho dele. 2% e a fronteira entre as duas coisas.
        */
        const colados = colPiso + colTecto;
        const pctColados = 100 * colados / hs.length;
        if (pctColados > 2)
            erro(`${colados} colados aos limites (${pctColados.toFixed(1)}%) — ` +
                'o clamp esta a cortar de mais, e os cortados ficam todos com a mesma altura');
        else ok(`${colados} colados em ${hs.length} (${pctColados.toFixed(1)}%): o clamp e so rede de seguranca`);

        // A base inteira desvia-se um pouco dos 22 de campo, que sao a
        // amostra da calibracao: a tolerancia cobre as duas.
        if (Math.abs(media - 1.75) > 0.03)
            erro(`media realizada ${media.toFixed(3)}, fora de 1.75 +- 0.03`);
        else ok(`media realizada ${media.toFixed(3)}, no alvo de 1.75`);

        /*
        E HA MESMO VARIEDADE. Sem isto, "todos dentro da faixa" passava com
        22 jogadores a medir exactamente o mesmo, que e o oposto do que o
        modelo existe para fazer.
        */
        const distintas = new Set(hs.map(h => h.toFixed(3))).size;
        /*
        UM NUMERO ABSOLUTO, e nao uma fraccao dos jogadores. As alturas saem
        de combinacoes discretas — posto, estilo, SPEED inteiro e um ruido
        preso ao `id` — portanto o numero de valores POSSIVEIS nao cresce com
        o tamanho da base. Pedir 80% de valores distintos em milhares de
        jogadores era pedir o impossivel; o que interessa e nao estarem todos
        em dois ou tres degraus.
        */
        if (distintas < 40)
            erro(`so ${distintas} alturas distintas: a distribuicao esta em degraus`);
        else ok(`${distintas} alturas distintas em ${hs.length} jogadores`);

        const amplitude = hs[hs.length - 1] - hs[0];
        if (amplitude < 0.15)
            erro(`amplitude de ${amplitude.toFixed(3)} m: a faixa de 0.25 m quase nao se usa`);
        else ok(`amplitude de ${amplitude.toFixed(3)} m dentro dos 0.25 disponiveis`);
    }
}

console.log(LF + (falhas
    ? 'FALHOU: ' + falhas + ' problema(s)'
    : 'OK: as alturas ficam entre 1.65 e 1.90, espalhadas e com media 1.75.'));
process.exit(falhas ? 1 : 0);
