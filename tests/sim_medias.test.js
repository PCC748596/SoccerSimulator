/*
EQUIPAS DE MEDIAS DIFERENTES NO LOTE — 60x70, 70x80, 65x85.

Ate aqui o lote corria sempre 80 contra 80 e nada no relatorio dizia se a skill
vale alguma coisa. O `opts.medias` gira confrontos pelo lote.

O QUE ESTE TESTE FIXA, e e a parte que se parte sem dar por isso:

1. A media mexe nas SKILLS INDIVIDUAIS, nao so no `TeamSkills`. O
   `player.skillFor()` le primeiro `data/player_skills.js` e so cai no painel
   como fallback: escrever 65 no `TeamSkills` e deixar os onze como estavam
   fazia um lote que PARECIA estar a testar e nao estava.
2. O deslocamento e ADITIVO sobre o ancora do gerador (base 80) e parte sempre
   dos ORIGINAIS. A somar sobre o que ja la estava, 24 jogos acabavam com
   equipas a zero.
3. O resumo conta tudo do lado do MAIS FORTE, e nao do TeamA — com a troca de
   lado a meio do lote, somar por equipa nao diz nada.

Corre com: node tests/sim_medias.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcSim = ler('js/simulate.js');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

function extrairFuncao(src, nome) {
    const i = src.indexOf('function ' + nome + '(');
    if (i < 0) throw new Error(nome + '() nao encontrada em js/simulate.js');
    const f = src.indexOf(LF + '}', i);
    return src.slice(i, f + 2);
}

// O bloco das medias, isolado: as constantes mais as funcoes que lhe pertencem.
const iBase = srcSim.indexOf('const MEDIA_BASE_SKILLS');
const iFimConst = srcSim.indexOf('];', srcSim.indexOf('const CAMPOS_DA_MEDIA')) + 2;
const bloco = [
    srcSim.slice(iBase, iFimConst),
    extrairFuncao(srcSim, 'normalizarMedias'),
    extrairFuncao(srcSim, 'listaDaEquipa'),
    extrairFuncao(srcSim, 'guardarSkillsDaEquipa'),
    extrairFuncao(srcSim, 'reporSkillsDaEquipa'),
    extrairFuncao(srcSim, 'aplicarMediaNaEquipa'),
    extrairFuncao(srcSim, 'resumirConfrontos')
].join(LF + LF);

const ambiente = new Function('Match', 'TeamSkills', 'console', bloco +
    LF + 'return { normalizarMedias, aplicarMediaNaEquipa, guardarSkillsDaEquipa,' +
    ' reporSkillsDaEquipa, resumirConfrontos };');

const jogador = (nome, skills) => ({ nome, skills });
const Match = {
    players: [
        jogador('GK A', { nome: 'GK A', id: 1, role: 'gk', gk: 100, marking: 70, speed: 65, stamina: 71 }),
        jogador('RB A', { nome: 'RB A', id: 2, role: 'def', gk: 76, marking: 99, speed: 85, stamina: 85 })
    ],
    opponents: [
        jogador('GK B', { nome: 'GK B', id: 3, role: 'gk', gk: 98, marking: 72, speed: 60, stamina: 70 })
    ]
};
const TeamSkills = {
    TeamA: { def: 80, mid: 80, ata: 80, gk: 80 },
    TeamB: { def: 80, mid: 80, ata: 80, gk: 80 }
};
const S = ambiente(Match, TeamSkills, console);

/*
A fotografia do ARRANQUE, tirada uma vez. Os testes abaixo deslocam as skills;
tirar a fotografia a meio media o deslocamento contra o deslocamento anterior,
que e o erro que este comentario existe para nao se repetir.
*/
const arranqueA = S.guardarSkillsDaEquipa('TeamA');
const arranqueB = S.guardarSkillsDaEquipa('TeamB');

console.log('');
console.log('1 — os dois formatos de confronto');
{
    const a = S.normalizarMedias([[60, 70], [70, 80]]);
    const b = S.normalizarMedias(['60x70', '65 x 85']);
    if (!a || a.length !== 2 || a[0][0] !== 60 || a[0][1] !== 70) erro('o formato [[60,70]] nao passou');
    else ok('lista de pares');
    if (!b || b.length !== 2 || b[1][0] !== 65 || b[1][1] !== 85) erro('o formato "65 x 85" nao passou');
    else ok('"60x70" e "65 x 85"');
    if (S.normalizarMedias(null) !== null || S.normalizarMedias([]) !== null) {
        erro('sem medias devia dar null — e o lote de sempre, 80 contra 80');
    } else ok('sem medias fica null');
}

console.log('');
console.log('2 — a media mexe nas SKILLS INDIVIDUAIS');
{
    const marcacaoAntes = arranqueA[1].marking;
    S.aplicarMediaNaEquipa('TeamA', 65, arranqueA);

    const rb = Match.players[1].skills;
    if (rb.marking === marcacaoAntes) {
        erro('o `marking` do RB nao mexeu: a media ficou so no TeamSkills e o skillFor nao a ve');
    } else if (rb.marking !== marcacaoAntes - 15) {
        erro('o RB devia levar -15 (ancora 80 -> 65) e levou ' + (rb.marking - marcacaoAntes));
    } else ok('skills individuais deslocadas: marking ' + marcacaoAntes + ' -> ' + rb.marking);

    if (TeamSkills.TeamA.def !== 65) erro('o TeamSkills (fallback) tambem tem de acompanhar');
    else ok('o fallback do painel acompanha');

    if (rb.id !== 2) erro('o `id` foi deslocado como se fosse atributo');
    else ok('id, nome e role intactos');
}

console.log('');
console.log('3 — parte sempre dos ORIGINAIS, nao do jogo anterior');
{
    S.aplicarMediaNaEquipa('TeamB', 60, arranqueB);
    const depoisDe60 = Match.opponents[0].skills.marking;
    S.aplicarMediaNaEquipa('TeamB', 60, arranqueB);
    const outraVez = Match.opponents[0].skills.marking;
    if (depoisDe60 !== outraVez) {
        erro('aplicar a mesma media duas vezes mudou o valor (' + depoisDe60 + ' -> ' + outraVez + '): esta a acumular');
    } else ok('idempotente: 24 jogos nao levam a equipa a zero');

    S.aplicarMediaNaEquipa('TeamB', 85, arranqueB);
    if (Match.opponents[0].skills.marking !== 72 + 5) {
        erro('subir a media depois de a descer nao voltou ao sitio certo');
    } else ok('sobe e desce a partir do mesmo ancora');
}

console.log('');
console.log('4 — o clamp trava em [1, 99] e a efectiva e a que vale');
{
    const efectiva = S.aplicarMediaNaEquipa('TeamA', 10, arranqueA);

    // Numa media muito baixa metade dos atributos bate no chao, e por isso a
    // efectiva fica ACIMA da pedida. E ela que vale para ler o resultado.
    let foraDeEscala = null;
    for (const p of Match.players) {
        for (const campo in p.skills) {
            const v = p.skills[campo];
            if (typeof v !== 'number' || campo === 'id') continue;
            if (v < 1 || v > 99) foraDeEscala = campo + ' = ' + v;
        }
    }
    if (foraDeEscala) erro('atributo fora de [1, 99]: ' + foraDeEscala);
    else ok('nenhum atributo sai de [1, 99]');

    if (!(efectiva >= 10)) {
        erro('com media 10 o clamp sobe a efectiva, e devolveu ' + efectiva);
    } else ok('media pedida 10, efectiva ' + efectiva.toFixed(1));

    S.reporSkillsDaEquipa('TeamA', arranqueA);
    if (Match.players[1].skills.marking !== 99) erro('o repor nao devolveu as skills do arranque');
    else ok('repoe no fim do lote');
}

console.log('');
console.log('5 — o resumo conta do lado do MAIS FORTE');
{
    const resultados = [
        { medias: { TeamA: 65, TeamB: 85 }, TeamA: { golos: 0, remates: 8, rematesNoAlvo: 2, xg: 0.4 }, TeamB: { golos: 3, remates: 16, rematesNoAlvo: 7, xg: 1.6 } },
        { medias: { TeamA: 85, TeamB: 65 }, TeamA: { golos: 2, remates: 14, rematesNoAlvo: 6, xg: 1.2 }, TeamB: { golos: 1, remates: 9, rematesNoAlvo: 3, xg: 0.5 } }
    ];
    const linhas = S.resumirConfrontos(resultados);
    if (linhas.length !== 1) erro('os dois jogos sao o mesmo confronto e deram ' + linhas.length + ' linhas');
    else ok('a troca de lado nao parte o confronto em dois');

    const l = linhas[0];
    if (l.confronto !== '65 vs 85') erro('o rotulo devia ser "65 vs 85" e e "' + l.confronto + '"');
    else ok('rotulo do confronto pelo par de medias');

    if (l.golosForte !== 2.5 || l.golosFraco !== 0.5) {
        erro('o forte fez 3 e 2 (media 2.5) e o fraco 0 e 1 (0.5); veio ' + l.golosForte + ' e ' + l.golosFraco);
    } else ok('golos do forte ' + l.golosForte + ' contra ' + l.golosFraco + ' do fraco');

    if (l.pctVitoriaForte !== 100) erro('o forte ganhou os dois e a vitoria deu ' + l.pctVitoriaForte + '%');
    else ok('vitorias do lado certo');
}

console.log('');
if (falhas) {
    console.log('sim_medias: ' + falhas + ' falha(s).');
    process.exit(1);
}
console.log('OK: o lote sabe correr equipas de medias diferentes.');
