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

SEGUNDA PASSAGEM, e os dois pedidos que a motivaram: *"coloca um pouco mais de
respingos durante a chuva"* e *"vamos fazer a chuva aumentar e diminuir durante
o jogo tambem"*. Dai os blocos 8 a 11:

  . a chuva respinga SOZINHA, a volta da bola, sem ser precisa uma pisada nem
    um quique;
  . a taxa disso e por segundo e nao por frame;
  . a intensidade da chuva passeia dentro de uma faixa, devagar, e e ela que
    manda nos fios desenhados;
  . e a agua que salta do chao acompanha-a.

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
const amb = {
    THREE, console, window: janela,
    document: { getElementById: () => null },
    // Os respingos da propria chuva nascem a volta da BOLA (e para onde a
    // camara olha). Sem Match nenhum eles cairiam no meio do campo, que e o
    // ramo de seguranca — aqui da-se-lhe uma bola para se medir o sitio.
    Match: { ball: { position: { x: 0, y: 0, z: 0 } } }
};
const Weather = new Function(...Object.keys(amb),
    ler('js/weather.js') + LF + 'return Weather;')(...Object.values(amb));

Weather.scene = { add: () => {} };
Weather._criarChuva();
Weather._criarRespingos();
Weather.rainParticles.visible = true;
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
/* ------------------------------------------------------------------ */
console.log(LF + '8 — a chuva respinga sozinha, a volta da bola');
{
    /*
    Pedido: *"coloca um pouco mais de respingos durante a chuva"*. Os respingos
    que havia eram todos de EVENTOS (o quique da bola, a pisada). Falta o chao
    a fervilhar com a propria chuva.
    */
    Weather.condicao = 'chuva';
    Weather.intensidadeChuva = 1.0;
    Weather._ambienteAcc = 0;
    Weather._limparRespingos();

    // Um segundo de chuva, sem quique nenhum e sem ninguem a correr.
    for (let f = 0; f < 60; f++) Weather._respingosDeChuva(1 / 60);

    const nascidas = vivas();
    const esperadas = Weather.ambienteTaxa * Weather.ambienteGoticulas;
    console.log(`  1 s de chuva: ${nascidas} goticulas (taxa ${Weather.ambienteTaxa}/s ` +
        `x ${Weather.ambienteGoticulas} = ${esperadas})`);

    if (nascidas <= 0) erro('a chuva nao respinga sozinha');
    else ok(`${nascidas} goticulas so da chuva`);

    // Dentro do raio, a volta da bola (que este ambiente poe na origem).
    const pos = posArr();
    let fora = 0;
    Weather.splashPool.forEach((g, i) => {
        if (g.vida <= 0) return;
        if (Math.hypot(pos[i * 3 + 0], pos[i * 3 + 2]) > Weather.ambienteRaio + 0.5) fora++;
    });
    if (fora) erro(`${fora} goticulas nasceram fora do raio de ${Weather.ambienteRaio} m da bola`);
    else ok(`todas dentro dos ${Weather.ambienteRaio} m a volta da bola`);

    // E sem chuva nao ha nenhuma — a mesma guarda do resto do sistema.
    Weather.condicao = 'limpo';
    Weather._limparRespingos();
    Weather._ambienteAcc = 0;
    for (let f = 0; f < 60; f++) Weather._respingosDeChuva(1 / 60);
    if (vivas() !== 0) erro('respinga sozinha com o campo seco');
    else ok('com o campo seco nao respinga nada');
    Weather.condicao = 'chuva';
}

/* ------------------------------------------------------------------ */
console.log(LF + '9 — a taxa e por SEGUNDO, e nao por frame');
{
    /*
    Sem o acumulador, a 144 Hz sairiam duas vezes e meia mais respingos do que
    a 60 Hz e a chuva mudava de aspecto com o hardware. Um segundo de jogo tem
    de dar o mesmo em qualquer cadencia.
    */
    const num = (passo) => {
        Weather._limparRespingos();
        Weather._ambienteAcc = 0;
        const frames = Math.round(1 / passo);
        for (let f = 0; f < frames; f++) Weather._respingosDeChuva(passo);
        return vivas();
    };
    const a60 = num(1 / 60), a144 = num(1 / 144), a30 = num(1 / 30);
    console.log(`  1 s a 30 Hz: ${a30} | a 60 Hz: ${a60} | a 144 Hz: ${a144}`);
    const pior = Math.max(a30, a60, a144), melhor = Math.min(a30, a60, a144);
    if (pior - melhor > 0.15 * pior) {
        erro(`a cadencia muda a chuva: de ${melhor} a ${pior} goticulas no mesmo segundo`);
    } else ok('o mesmo segundo da o mesmo, em qualquer cadencia');
}

/* ------------------------------------------------------------------ */
console.log(LF + '10 — a chuva aperta e alivia durante o jogo');
{
    /*
    Pedido: *"vamos fazer a chuva aumentar e diminuir durante o jogo tambem"*.

    Tres minutos de chuva, a ler a intensidade: tem de MEXER-SE, tem de ficar
    dentro da faixa configurada, e tem de mexer-se DEVAGAR — um aguaceiro que
    aparece e desaparece num segundo nao e um aguaceiro, e um interruptor.
    */
    const A = Weather.chuvaAguaceiro;
    Weather.condicao = 'chuva';
    Weather.intensidadeChuva = 1.0;
    Weather._chuvaTimer = 0;

    let min = 9, max = -9, maiorSalto = 0, ant = Weather.intensidadeChuva;
    const fios = [];
    for (let f = 0; f < 60 * 180; f++) {
        Weather._atualizarIntensidadeDaChuva(1 / 60);
        const i = Weather.intensidadeChuva;
        min = Math.min(min, i); max = Math.max(max, i);
        maiorSalto = Math.max(maiorSalto, Math.abs(i - ant));
        ant = i;
        if (f % (60 * 30) === 0) fios.push(Weather.rainGeometry.drawRange.count / 2);
    }
    console.log(`  3 min: intensidade de ${min.toFixed(2)} a ${max.toFixed(2)} | ` +
        `fios desenhados de 30 em 30 s: ${fios.join(', ')}`);

    if (max - min < 0.15) erro(`a chuva mal variou: de ${min.toFixed(2)} a ${max.toFixed(2)}`);
    else ok(`variou de ${min.toFixed(2)} a ${max.toFixed(2)}`);

    if (min < A.min - 0.01 || max > A.max + 0.01) {
        erro(`saiu da faixa [${A.min}, ${A.max}]`);
    } else ok(`dentro da faixa [${A.min}, ${A.max}]`);

    // Por frame nao pode andar mais do que a velocidade configurada.
    const tecto = A.velocidade / 60 + 1e-6;
    if (maiorSalto > tecto) {
        erro(`saltou ${maiorSalto.toFixed(4)} num frame (tecto ${tecto.toFixed(4)}): nao e um aguaceiro, e um interruptor`);
    } else ok('a mudanca e gradual, nunca aos saltos');

    // E e a intensidade que manda nos fios desenhados.
    const esperados = Math.max(1, Math.round(Weather.rainCount * Weather.intensidadeChuva));
    if (Weather.rainGeometry.drawRange.count !== esperados * 2) {
        erro('os fios desenhados deixaram de acompanhar a intensidade');
    } else ok('os fios desenhados seguem a intensidade');
}

/* ------------------------------------------------------------------ */
console.log(LF + '11 — chuva fraca respinga menos do que chuva forte');
{
    Weather.condicao = 'chuva';

    const medir = (intensidade) => {
        Weather.intensidadeChuva = intensidade;
        Weather._limparRespingos();
        Weather.respingo(0, 0, 1.0);
        return vivas();
    };
    const forte = medir(1.0), fraca = medir(Weather.chuvaAguaceiro.min);
    console.log(`  mesmo quique: ${forte} goticulas com chuva forte, ${fraca} com chuva fraca`);
    if (fraca >= forte) erro(`chuva fraca deu ${fraca} e forte ${forte}: a intensidade nao conta`);
    else ok('o mesmo quique levanta menos agua com a chuva a aliviar');
    Weather.intensidadeChuva = 1.0;
}

console.log(LF + (falhas === 0
    ? 'TUDO CERTO — os respingos de chuva estao como pedidos.'
    : `${falhas} FALHA(S).`));
process.exit(falhas === 0 ? 0 : 1);
