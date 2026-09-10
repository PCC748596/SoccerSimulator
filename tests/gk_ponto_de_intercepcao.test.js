/*
O GUARDA-REDES MERGULHA PARA ONDE A BOLA VAI, E NÃO PARA ONDE ELA ESTÁ.

O lote de 60 jogos deu 4.89 golos por jogo (194% do alvo) com 25.67 remates
(98% — o volume está certo) e um xG de 1.56 calculado pelo próprio jogo. Ou
seja: **67% dos remates enquadrados acabavam em golo**, contra os ~30% reais.

A causa, no rasto frame a frame: há dois ramos que disparam o mergulho. O
principal projecta a bola até ao plano do guarda-redes. O segundo — a espalmada
de curta distância (`possoEspalmar`) — mandava-o para `Match.ball.position.x`,
o x do INSTANTE. E é esse que dispara na maioria dos remates, porque o
principal exige `gkReagiu`, ainda falso nos primeiros frames do voo.

Medido num remate: bola em x = -16.2 com vx = +27 m/s (a fechar para o meio),
`gkAlvoX = -15.8` — doze metros para FORA do poste. Ele mergulhava para a
bandeirola enquanto a bola entrava pelo meio da baliza. A mão passava a 8.5 m
da bola no instante em que ela cruzava a linha.

Corre com: node tests/gk_ponto_de_intercepcao.test.js
*/
const fs = require('fs');
const path = require('path');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { console.log('  X ' + m); falhas++; };

const srcUtils = ler('js/utils.js');
const i = srcUtils.indexOf('function pontoDeIntercepcaoGK');
if (i < 0) throw new Error('pontoDeIntercepcaoGK não encontrada em utils.js');
const pontoDeIntercepcaoGK = (new Function(
    srcUtils.slice(i, srcUtils.indexOf(LF + '}', i) + 2) + '; return pontoDeIntercepcaoGK;'))();

console.log('1 — a projecção até ao plano do guarda-redes');
{
    /*
    O lance medido: bola em (-16.2, 1.0, -39.8) a (27.2, 0, -25.4), guarda-redes
    na linha dos -49.5. Tempo até lá: 9.7 / 25.4 = 0.38 s, e nesse tempo a bola
    anda +10.4 m em x — entra perto do eixo, não a 16 m dele.
    */
    const r = pontoDeIntercepcaoGK(-16.2, 1.0, -39.8, 27.2, 0, -25.4, -49.5, 9.81);
    if (!r) { erro('devolveu null com a bola a andar'); }
    else {
        if (Math.abs(r.t - 0.382) > 0.02) erro(`tempo até ao plano = ${r.t.toFixed(3)} s (esperado ~0.38)`);
        else ok(`tempo até ao plano ${r.t.toFixed(2)} s`);
        if (r.x < -8 || r.x > 0) erro(`x previsto = ${r.x.toFixed(2)}: fora da moldura, é o defeito que isto corrige`);
        else ok(`x previsto ${r.x.toFixed(2)} m (a bola estava a -16.2)`);
        // A gravidade conta: a bola desce no caminho.
        if (!(r.y < 1.0)) erro('a altura prevista ignora a gravidade');
        else ok(`altura prevista ${r.y.toFixed(2)} m (saiu a 1.00)`);
    }

    // Bola parada em z: não há intercepção nenhuma para prever.
    if (pontoDeIntercepcaoGK(0, 1, -30, 0, 0, 0, -49.5, 9.81) !== null) {
        erro('bola sem velocidade em z devia devolver null');
    } else ok('bola parada em z: null');
}

console.log('');
console.log('2 — os DOIS ramos do mergulho usam a mesma conta');
{
    const srcPlayer = ler('js/player.js');
    /*
    A projecção passou a viver num sítio só — `alvoLidoGK`, que junta o
    `pontoDeIntercepcaoGK` ao erro de leitura. O que este teste guarda é que os
    DOIS ramos a usam.
    */
    const usos = (srcPlayer.match(/this\.alvoLidoGK\(/g) || []).length;
    if (usos < 2) {
        erro(`só ${usos} ramo(s) usam a projecção — o outro voltou a mergulhar para onde a bola está`);
    } else ok(`os ${usos} ramos usam a projecção`);

    /*
    O ramo da espalmada é o que disparava na maioria dos remates. Se voltar a
    escrever o x do instante no alvo, o defeito volta inteiro.
    */
    const iEsp = srcPlayer.indexOf('possoEspalmar');
    const bloco = srcPlayer.slice(iEsp, iEsp + 2600);
    if (/gkAlvoX = Match\.ball\.position\.x/.test(bloco)) {
        erro('o ramo da espalmada voltou a mergulhar para o x do INSTANTE');
    } else ok('a espalmada mergulha para o ponto previsto');
}

console.log('');
if (falhas) {
    console.log(`gk_ponto_de_intercepcao: ${falhas} falha(s).`);
    process.exit(1);
}
console.log('OK: o mergulho vai ao encontro da bola.');
