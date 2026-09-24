/*
RESPINGOS DE CHUVA — a agua que salta do relvado no quique da bola e na
pisada dos jogadores.

Pedido: *"um efeito de respingos quando a bola bate no chao/quica quando tem
chuva no jogo. E uns respingos tambem nas corridas dos jogadores, mas nao
precisa ser a todo frame — pode ser quando o pe bate no chao."*

O sistema vive no `Weather` (js/weather.js): uma pool fixa de goticulas
partilhada pelos dois disparadores. O que este teste prende:

  . SO COM CHUVA — em campo seco o `respingo` e mudo, senao via-se agua a
    saltar num jogo de sol;
  . A POOL NAO CRESCE — e de tamanho fixo e nunca passa o `splashMax`, mesmo
    com disparos a mais; e o que impede o efeito de comer a cena toda;
  . AS GOTICULAS MORREM — sobem, caem e voltam a ficar estacionadas, senao a
    pool enche-se e nao ha mais respingos nenhuns;
  . A FORCA CONTA — um quique forte levanta mais agua do que um fraco.

E, do lado de quem dispara, que os dois hooks estao no sitio certo e com as
guardas certas (leitura do codigo, que precisaria do jogo inteiro a correr
para ser exercitada).

Corre com: node tests/respingos_de_chuva.test.js
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
O Weather sem o jogo. A `init` mexe em luzes, holofotes e nuvens que aqui nao
existem, por isso chama-se so o que interessa: `_criarRespingos` e uma cena
de mentira que aceita o `add`.
*/
const janela = { isPaused: false };
const amb = { THREE, console, window: janela, document: { getElementById: () => null } };
const Weather = new Function(...Object.keys(amb),
    ler('js/weather.js') + LF + 'return Weather;')(...Object.values(amb));

Weather.scene = { add: () => {} };
Weather._criarRespingos();
Weather.splashParticles.visible = true;

const posArr = () => Weather.splashGeometry.attributes.position.array;
const vivas = () => Weather.splashPool.filter(g => g.vida > 0).length;

/* ------------------------------------------------------------------ */
console.log(LF + '1 — sem chuva nao ha respingo nenhum');
{
    for (const c of ['limpo', 'nublado', 'encoberto']) {
        Weather.condicao = c;
        Weather.respingo(10, 10, 1.0);
        if (vivas() !== 0) erro(`condicao "${c}" deixou sair ${vivas()} goticulas`);
        else ok(`"${c}": mudo`);
    }
}

/* ------------------------------------------------------------------ */
console.log(LF + '2 — com chuva saem goticulas, e mais quanto maior a forca');
{
    Weather.condicao = 'chuva';

    Weather._limparRespingos();
    Weather.respingo(0, 0, 0.0);
    const fraco = vivas();

    Weather._limparRespingos();
    Weather.respingo(0, 0, 1.0);
    const forte = vivas();

    if (fraco <= 0) erro('o quique fraco nao levantou goticula nenhuma');
    else ok(`quique fraco: ${fraco} goticulas`);

    if (forte <= fraco) erro(`o quique forte deu ${forte} goticulas e o fraco ${fraco}`);
    else ok(`quique forte: ${forte} goticulas (> ${fraco})`);
}

/* ------------------------------------------------------------------ */
console.log(LF + '3 — nascem no relvado e no sitio pedido');
{
    Weather._limparRespingos();
    Weather.respingo(-12.5, 7.25, 1.0);

    const pos = posArr();
    let foraDoSitio = 0, foraDoChao = 0;
    Weather.splashPool.forEach((g, i) => {
        if (g.vida <= 0) return;
        const dx = pos[i * 3 + 0] - (-12.5);
        const dz = pos[i * 3 + 2] - 7.25;
        // A coroa de saida e de 5 cm; da folga para 20.
        if (Math.hypot(dx, dz) > 0.20) foraDoSitio++;
        if (pos[i * 3 + 1] < 0 || pos[i * 3 + 1] > 0.10) foraDoChao++;
        if (g.vy <= 0) erro(`goticula ${i} nasceu a descer (vy = ${g.vy})`);
    });

    if (foraDoSitio) erro(`${foraDoSitio} goticulas nasceram longe do ponto do quique`);
    else ok('todas nascem junto ao ponto do quique');
    if (foraDoChao) erro(`${foraDoChao} goticulas nasceram fora do relvado`);
    else ok('todas nascem ao nivel do relvado');
}

/* ------------------------------------------------------------------ */
console.log(LF + '4 — a pool e FIXA: disparar a mais nao a faz crescer');
{
    Weather._limparRespingos();
    const tamanho = Weather.splashPool.length;

    // 300 quiques fortes seguidos, muito acima do que o jogo dispara.
    for (let i = 0; i < 300; i++) Weather.respingo(i % 40, i % 30, 1.0);

    if (Weather.splashPool.length !== tamanho) {
        erro(`a pool passou de ${tamanho} para ${Weather.splashPool.length}`);
    } else ok(`a pool continua com ${tamanho} entradas`);

    if (posArr().length !== tamanho * 3) erro('a geometria deixou de bater certo com a pool');
    else ok('a geometria acompanha a pool');

    if (vivas() > Weather.splashMax) erro(`${vivas()} goticulas vivas, acima do tecto`);
    else ok(`${vivas()} goticulas vivas, dentro do tecto de ${Weather.splashMax}`);
}

/* ------------------------------------------------------------------ */
console.log(LF + '5 — as goticulas caem e MORREM, e a pool volta a estar livre');
{
    Weather._limparRespingos();
    Weather.respingo(0, 0, 1.0);
    const nascidas = vivas();

    // 3 s a 60 fps: muito mais do que a vida maxima de uma goticula.
    for (let f = 0; f < 180; f++) Weather._atualizarRespingos(1 / 60);

    if (vivas() !== 0) erro(`${vivas()} de ${nascidas} goticulas ficaram vivas para sempre`);
    else ok(`as ${nascidas} goticulas morreram todas`);

    const pos = posArr();
    let visiveis = 0;
    for (let i = 0; i < Weather.splashPool.length; i++) {
        if (pos[i * 3 + 1] > -100) visiveis++;
    }
    if (visiveis) erro(`${visiveis} goticulas mortas ficaram a vista`);
    else ok('as mortas ficam estacionadas fora de vista');
}

/* ------------------------------------------------------------------ */
console.log(LF + '6 — em pausa nao nascem goticulas');
{
    Weather._limparRespingos();
    janela.isPaused = true;
    Weather.respingo(0, 0, 1.0);
    janela.isPaused = false;

    if (vivas() !== 0) erro(`em pausa sairam ${vivas()} goticulas`);
    else ok('em pausa o respingo e mudo');
}

/* ------------------------------------------------------------------ */
console.log(LF + '7 — os dois disparadores estao ligados, e com guarda de chuva');
{
    const fisica = ler('js/match/match_physics.js');
    const jogador = ler('js/player.js');

    if (!/Weather\.respingo\(this\.ball\.position\.x/.test(fisica)) {
        erro('o quique da bola (match_physics.js) nao dispara respingo');
    } else ok('o quique da bola dispara respingo');

    if (!/Weather\.aChover\(\)/.test(fisica)) erro('o quique nao tem guarda de chuva');
    else ok('o quique so respinga a chover');

    if (!/Weather\.respingo\(px, pz/.test(jogador)) {
        erro('a passada (player.js) nao dispara respingo');
    } else ok('a passada dispara respingo');

    /*
    A PISADA NAO E TODO O FRAME nem toda a pisada — o pedido explicito. Duas
    coisas prendem isso: a deteccao por PASSAGEM pelos pontos de apoio
    (0.125 e 0.625 do ciclo, o minimo do ressalto da anca) e o sorteio que
    deixa cair a maioria.
    */
    if (!/0\.125 \+ k \* 0\.5/.test(jogador)) {
        erro('a passada deixou de disparar nos pontos de apoio do ciclo');
    } else ok('dispara nos dois apoios do ciclo (0.125 e 0.625)');

    if (!/Math\.random\(\) > 0\.35/.test(jogador)) {
        erro('a passada deixou de ter o sorteio: volta a respingar em todas');
    } else ok('so ~35% das pisadas respingam');

    if (!/speed >= 2\.0/.test(jogador)) erro('a passada perdeu o minimo de velocidade');
    else ok('a andar devagar nao respinga');
}

/* ------------------------------------------------------------------ */
console.log(LF + (falhas === 0
    ? 'TUDO CERTO — os respingos de chuva estao como pedidos.'
    : `${falhas} FALHA(S).`));
process.exit(falhas === 0 ? 0 : 1);
