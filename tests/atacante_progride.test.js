/*
O ATACANTE PROGRIDE: conduz quando tem caminho, e cabeceia à baliza quando
está sozinho na área.

Dois relatos, duas causas diferentes, e as duas eram MEDIDAS erradas — não
decisões erradas:

  1. *"Os atacantes não estão adiantando a bola quando tem espaço livre a
     frente, sem marcação pela frente."*

     A decisão estava boa: medido, quando o espaço existia (3 a 10 m) ele
     conduzia em 83 a 96% das posses. O que nunca acontecia era o espaço
     EXISTIR. O corredor que conta quem está à frente abria com o cone de
     VISÃO do jogador, e a meia-largura a 10 m de distância dava:

         técnica 50    14.0 m
         técnica 70    23.6 m
         técnica 80    34.8 m

     O campo tem 34 m de meia-largura: à técnica 80 o corredor a dez metros
     cobria o campo inteiro. Em 15 minutos de jogo, ZERO posses de atacante
     com mais de 10 m de espaço à frente.

  2. *"O Atacante pula sozinho para cabecear dentro da área e cabeceia para
     fora da área para dar um passe."*

     O corte era só a distância ao centro da baliza (11 m) e não olhava nem à
     área nem à marcação. Medido com 400 cabeceios de um atacante sozinho em
     pontos sorteados da grande área, só 28% iam à baliza; os outros iam para
     `findPassTarget('mid')` — um médio, que está atrás.

O que este teste prende é a forma das duas regras, não os números de um lote:
a simulação é caótica e um número por semente não prende nada. As medições
estão em `tools/lab/adiantar_a_bola.js` e `tools/lab/cabeceio_na_area.js`.

Corre com: node tests/atacante_progride.test.js
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
console.log(LF + '1 — o corredor da conducao nao abre com a tecnica');
{
    const cfg = ler('js/config/player_behavior.js');
    const bt = ler('js/bt/player_bt.js');

    const m = cfg.match(/aberturaCorredor:\s*([\d.]+)/);
    if (!m) erro('o CarryModel ficou sem `aberturaCorredor`');
    else {
        const ab = Number(m[1]);
        ok(`CarryModel.aberturaCorredor = ${ab}`);

        /*
        O NUMERO QUE IMPORTA e a largura do corredor a 10 m, e tem de caber no
        campo com folga. `corredor` e a meia-largura na origem.
        */
        const c = Number((cfg.match(/corredor:\s*([\d.]+)/) || [])[1]);
        if (!isFinite(c)) erro('o CarryModel ficou sem `corredor`');
        else {
            const a10 = c + 10 * ab;
            if (a10 > 10) erro(`a 10 m o corredor tem ${a10.toFixed(1)} m de meia-largura — ` +
                'e um sector, nao um caminho; volta a apanhar adversarios que estao ao lado');
            else ok(`a 10 m o corredor tem ${a10.toFixed(1)} m de meia-largura (era 34.8 a tecnica 80)`);
        }
    }

    // E o cone de visao nao pode voltar a decidir a largura do corredor.
    const i = bt.indexOf('const maxVisionDist = alcanceVisao');
    const bloco = (i < 0) ? '' : bt.slice(i, i + 400);
    if (!/aberturaCorredor\s*=\s*\(typeof CarryModel\.aberturaCorredor/.test(bloco))
        erro('o `PlayerContext` voltou a tirar a abertura do corredor do cone de visao');
    else ok('o PlayerContext le a abertura do CarryModel, nao do cone de visao');

    /*
    O ALCANCE, esse, CONTINUA a vir da visao: ate onde o jogador le o campo e
    uma questao de visao; quem esta no caminho nao e.
    */
    if (!/maxVisionDist = alcanceVisao\(tec/.test(bloco))
        erro('o alcance deixou de depender da visao do jogador');
    else ok('o alcance continua a vir da visao');
}

/* ------------------------------------------------------------------ */
console.log(LF + '2 — o cabeceio na area: livre remata, marcado escora');
{
    const cfg = ler('js/config/shooting.js');
    const pl = ler('js/player.js');

    const geral = Number((cfg.match(/raioRemateCabeca:\s*([\d.]+)/) || [])[1]);
    const naArea = Number((cfg.match(/raioRemateNaArea:\s*([\d.]+)/) || [])[1]);

    if (!isFinite(geral)) erro('o HeaderModel ficou sem `raioRemateCabeca`');
    else ok(`raioRemateCabeca = ${geral} m (o raio geral, fora da area)`);

    if (!isFinite(naArea)) erro('o HeaderModel ficou sem `raioRemateNaArea`');
    else {
        ok(`raioRemateNaArea = ${naArea} m`);
        if (naArea <= geral)
            erro('o raio dentro da area nao e maior que o geral — a regra nao muda nada');
        else ok('o raio dentro da area e maior que o geral');

        /*
        A ESQUINA DA GRANDE AREA esta a ~26 m do centro da baliza. Um raio que
        a alcance devolve os cabeceios ao golo de 20+ metros, que foi o defeito
        que deu origem ao `raioRemateCabeca`.
        */
        if (naArea >= 20)
            erro(`${naArea} m alcanca a esquina da grande area — voltam os golos de cabeca de 20+ m`);
        else ok('e nao alcanca a esquina da area (onde cabecear ao golo nao existe)');
    }

    // A regra tem de exigir as TRES condicoes juntas.
    const i = pl.indexOf('const livreNaArea');
    const bloco = (i < 0) ? '' : pl.slice(i, i + 200);
    if (!bloco) erro('o `executeHeader` ficou sem `livreNaArea`');
    else {
        if (!/naGrandeArea/.test(bloco)) erro('`livreNaArea` nao exige estar dentro da grande area');
        else ok('exige estar dentro da grande area');
        if (!/!marcador/.test(bloco)) erro('`livreNaArea` nao exige estar sem marcador — com um defesa colado, escorar e o certo');
        else ok('exige estar sem marcador');
        if (!/distToGoal < raioNaArea/.test(bloco)) erro('`livreNaArea` nao poe tecto na distancia');
        else ok('poe tecto na distancia');
    }

    const j = pl.indexOf('const inShootingRange');
    const decisao = (j < 0) ? '' : pl.slice(j, j + 160);
    if (!/viradoParaLa/.test(decisao))
        erro('a decisao deixou de exigir estar virado para a baliza');
    else ok('continua a exigir estar virado para a baliza');
    if (!/livreNaArea/.test(decisao))
        erro('o `inShootingRange` nao usa o `livreNaArea` — a regra nao chega a decidir nada');
    else ok('o inShootingRange soma o caso da area ao raio geral');

    /*
    O MARCADOR TEM DE SER CALCULADO ANTES da decisao. Estava dentro do ramo do
    remate, onde so servia para a disputa da cabecada; se la voltar, o
    `livreNaArea` le `marcador` antes de existir.
    */
    if (pl.indexOf('let marcador = null, distMarc = 999;') > i)
        erro('o marcador voltou a ser calculado DEPOIS do `livreNaArea` que o le');
    else ok('o marcador e calculado antes da decisao que o usa');
}

console.log(LF + (falhas
    ? 'FALHOU: ' + falhas + ' problema(s)'
    : 'OK: o corredor mede o caminho, e quem esta livre na area cabeceia a baliza.'));
process.exit(falhas ? 1 : 0);
