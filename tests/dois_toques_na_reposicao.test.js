/*
A REGRA DOS DOIS TOQUES: quem repõe a bola não lhe volta a tocar antes de
outro jogador o fazer.

Relato: *"BUG: No corner o batedor saiu jogando. Bateu para ele mesmo. Isso
Não é permitido. Tem que passar a bola para outro jogador."*

E podia mesmo: nada no jogo o impedia. O batedor punha a bola em jogo e, com
ela a cair-lhe perto — num canto curto ou batido para o primeiro poste —, era
quem tinha o corpo mais próximo dela. A disputa do `resolveBallContact` é
ganha por proximidade e mais nada, portanto ele ganhava-a como qualquer outro
e saía a conduzir.

A regra vale para as CINCO reposições com batedor (canto, lateral, falta,
penálti e tiro de meta), e por isso o teste cobre-as a todas em vez de só o
canto: o defeito era a ausência da regra, não uma particularidade do canto.

A correcção está em três sítios, e o teste separa-os porque falham por razões
diferentes:

  1. `Match.marcarRepositor` no instante da reposição — a marca nasce;
  2. `resolveBallContact` salta o repositor — a garantia dura, e a que
     realmente impede o segundo toque;
  3. `elegeChaser` (team_bt.js) não o elege perseguidor — sem isto ele corre
     atrás da bola e fica colado a ela sem a poder jogar, que se vê pior do
     que o defeito original.

Corre com: node tests/dois_toques_na_reposicao.test.js
*/
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const erro = (m) => { falhas++; console.error('  X ' + m); };
const ok = (m) => console.log('  . ' + m);

/* ------------------------------------------------------------------ */
console.log(LF + '1 — o estado: a marca nasce, morre, e um lance novo limpa-a');
{
    // O match_state.js é um objecto literal, mas instancia alguns tipos do
    // THREE nos campos. Usa-se o THREE a sério, que já é dependência dos testes.
    const THREE = require('three');
    const amb = { THREE, console, window: {}, document: { getElementById: () => null } };
    let Match;
    try {
        Match = new Function(...Object.keys(amb),
            ler('js/match/match_state.js') + LF + 'return Match;')(...Object.values(amb));
    } catch (e) {
        erro('não consegui carregar o match_state.js isolado: ' + e.message);
    }

    if (Match) {
        for (const n of ['repositor', 'repositorLance'])
            if (!(n in Match)) erro(`o Match não declara \`${n}\``);
        if ('repositor' in Match && 'repositorLance' in Match) ok('o Match declara `repositor` e `repositorLance`');

        for (const n of ['marcarRepositor', 'libertarRepositor'])
            if (typeof Match[n] !== 'function') erro(`o Match não tem \`${n}()\``);
        if (typeof Match.marcarRepositor === 'function' && typeof Match.libertarRepositor === 'function')
            ok('o Match tem marcarRepositor() e libertarRepositor()');

        if (Match.repositor !== null) erro('nasce com repositor preenchido');
        else ok('nasce sem repositor');

        const zeca = { nome: 'zeca' };
        Match.marcarRepositor(zeca, 'canto');
        if (Match.repositor !== zeca) erro('marcarRepositor não guardou o jogador');
        else ok('marcarRepositor guarda o jogador e o lance');

        Match.libertarRepositor();
        if (Match.repositor !== null) erro('libertarRepositor não limpou a marca');
        else ok('libertarRepositor limpa a marca');

        /*
        UM LANCE NOVO LIMPA. Sem isto, um batedor que repusesse e visse a bola
        sair logo para outra reposição ficava marcado para sempre — nunca mais
        lhe tocava em todo o jogo.
        */
        Match.marcarRepositor(zeca, 'canto');
        Match.mudarEstado('THROW_IN', 'teste');
        if (Match.repositor !== null) erro('entrar numa bola parada não limpou a marca do lance anterior');
        else ok('entrar numa bola parada limpa a marca do lance anterior');

        // Mas o PLAY não limpa: é nele que a reposição acaba de marcar.
        Match.marcarRepositor(zeca, 'canto');
        Match.mudarEstado('PLAY', 'canto_batido');
        if (Match.repositor !== zeca) erro('o PLAY apagou a marca que a própria reposição acabou de pôr');
        else ok('o PLAY não apaga a marca — é nele que a reposição a põe');
    }
}

/* ------------------------------------------------------------------ */
console.log(LF + '2 — as CINCO reposições marcam o batedor');
{
    const fontes = { 'js/player.js': ler('js/player.js'), 'js/fsm.js': ler('js/fsm.js') };
    const esperado = [
        ['canto', 'js/fsm.js'],
        ['lateral', 'js/player.js'],
        ['falta', 'js/player.js'],
        ['penalti', 'js/player.js'],
        ['tiro_de_meta', 'js/player.js'],
    ];
    for (const [lance, ficheiro] of esperado) {
        const re = new RegExp("marcarRepositor\\([^)]*'" + lance + "'\\)");
        if (!re.test(fontes[ficheiro])) erro(`a reposição '${lance}' não marca o batedor em ${ficheiro}`);
        else ok(`'${lance}' marca o batedor`);
    }
}

/* ------------------------------------------------------------------ */
console.log(LF + '3 — a física: o repositor não ganha a disputa da bola');
{
    const src = ler('js/match/match_physics.js');

    // A guarda tem de estar DENTRO do `considerar`, que é quem elege o dono.
    const i = src.indexOf('const considerar = (p) => {');
    const fim = src.indexOf(LF + '        };', i);
    const considerar = (i < 0) ? '' : src.slice(i, fim);
    if (!/this\.repositor === p/.test(considerar))
        erro('o `considerar` não salta o repositor — é aqui que o segundo toque acontece');
    else ok('o `considerar` salta o repositor');

    if (!/this\.repositor === gk/.test(src))
        erro('o ramo do guarda-redes não salta o repositor (o tiro de meta é batido por ele)');
    else ok('o ramo do guarda-redes também salta o repositor');

    /*
    E A MARCA TEM DE MORRER quando outro toca, senão o batedor fica impedido
    para o resto do jogo.
    */
    if (!/libertarRepositor\(\)/.test(src))
        erro('a física nunca liberta a marca — o batedor ficaria impedido para sempre');
    else ok('a física liberta a marca quando outro jogador toca');
}

/* ------------------------------------------------------------------ */
console.log(LF + '4 — o Behaviour Tree: o repositor não é eleito perseguidor');
{
    const src = ler('js/bt/team_bt.js');
    if (!/Match\.repositor/.test(src))
        erro('o team_bt.js não conhece o repositor — ele vai correr atrás da bola que não pode jogar');
    else ok('o team_bt.js exclui o repositor dos candidatos a perseguidor');

    // O atalho do destinatário do passe salta a eleição toda: tem de conhecer
    // a regra também, senão o batedor volta a entrar por ali.
    const i = src.indexOf('Match.intendedReceiver && Match.intendedReceiver.team === bb.team');
    const bloco = (i < 0) ? '' : src.slice(i, i + 260);
    if (!/Match\.intendedReceiver !== Match\.repositor/.test(bloco))
        erro('o atalho do destinatário do passe pode eleger o repositor e salta a filtragem');
    else ok('o atalho do destinatário do passe também exclui o repositor');
}

/* ------------------------------------------------------------------ */
console.log(LF + '5 — o canto: o alvo do cruzamento nunca é o próprio batedor');
{
    const src = ler('js/fsm.js');
    const i = src.indexOf('const atkInBox =');
    const linha = (i < 0) ? '' : src.slice(i, src.indexOf(LF, i));
    if (!/pl !== p/.test(linha))
        erro('os candidatos a receber o canto incluem o batedor');
    else ok('os candidatos a receber o canto excluem o batedor');
}

console.log(LF + (falhas
    ? 'FALHOU: ' + falhas + ' problema(s)'
    : 'OK: quem repõe a bola não lhe volta a tocar antes de outro jogador.'));
process.exit(falhas ? 1 : 0);
