/*
QUEM VEM ATRÁS NÃO DISPUTA UMA BOLA ADIANTADA.

Relato: "quando o jogador tem a bola dominada no meio campo ele dá pequenas
adiantadas no meio de um monte de adversários; mas quando recebe a bola na
frente ou tem alguém atrás dele, não adianta para poder ter mais velocidade".

O `maiorToqueSeguro` (utils.js) validava o tamanho do toque pela corrida ao
ponto onde a bola vai ficar — e media a distância em LINHA RECTA, para todos os
adversários. Um defesa colado às costas, que para lá chegar teria de passar por
cima do portador e correr mais depressa do que ele, ganhava sempre essa corrida.

Medido em 74 min (`tools/headless/toque_conducao.js`):

    decisões de toque cortadas a zero          76%
    com alguém atrás (<6 m) e campo aberto     1245 de 1280 cortadas

Depois: 17% no total, e ZERO no caso do relato.

Corre com: node tests/toque_com_marcador_atras.test.js
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
const srcConfig = ler('js/config/player_behavior.js');

/*
A função de produção, com o CarryModel e a física reais. O config é carregado
pelo harness (jsdom + scripts clássicos) porque o `CarryModel` referencia o
`GaitModel` — extrair só o literal deixava-o a faltar.
*/
require('../tools/headless/harness.js');

const i = srcUtils.indexOf('function maiorToqueSeguro');
if (i < 0) throw new Error('maiorToqueSeguro não encontrada em utils.js');
const maiorToqueSeguro = (new Function('CarryModel', 'BallPhysics',
    srcUtils.slice(i, srcUtils.indexOf(LF + '}', i) + 2) + '; return maiorToqueSeguro;'
))(CarryModel, BallPhysics);

/*
Portador em (0,0) a correr no sentido +z, a 5 m/s, a pedir o toque longo.
*/
const correr = (advs, lead) => maiorToqueSeguro(0, 0, 0, 1, 5.0, lead || CarryModel.touchLong, advs);

console.log('1 — o marcador nas costas não corta o toque');
{
    const atras2m = correr([{ x: 0, z: -2 }]);
    if (atras2m !== CarryModel.touchLong) {
        erro(`com um defesa 2 m ATRÁS o toque devia ser o pedido (${CarryModel.touchLong}), deu ${atras2m}`);
    } else ok('defesa 2 m atrás: toque longo na mesma');

    const ombro = correr([{ x: 1.0, z: -0.5 }]);
    if (ombro !== CarryModel.touchLong) {
        erro('defesa ao ombro, meio metro atrás: devia continuar a deixar tocar');
    } else ok('defesa ao ombro (meio metro atrás): toque longo');
}

console.log('');
console.log('2 — quem está À FRENTE continua a cortar');
{
    const frente3m = correr([{ x: 0, z: 3 }]);
    if (frente3m >= CarryModel.touchLong) {
        erro('um defesa 3 m à FRENTE tem de encurtar (ou matar) o toque');
    } else ok(`defesa 3 m à frente: toque reduzido para ${frente3m}`);

    const frente6m = correr([{ x: 0, z: 6 }]);
    if (frente6m >= CarryModel.touchLong) {
        erro('um defesa 6 m à frente ainda ganha a bola adiantada 2.8 m');
    } else ok(`defesa 6 m à frente: toque reduzido para ${frente6m}`);

    // Campo limpo: o toque pedido passa inteiro.
    if (correr([{ x: 0, z: 40 }]) !== CarryModel.touchLong) {
        erro('sem ninguém por perto o toque tinha de sair inteiro');
    } else ok('campo limpo: toque inteiro');
}

console.log('');
console.log('3 — a regra é do config e tem um número');
{
    if (typeof CarryModel.disputaProjMin !== 'number') {
        erro('CarryModel.disputaProjMin desapareceu');
    } else ok('disputaProjMin = ' + CarryModel.disputaProjMin);
    if (!/proj\s*<\s*\(?C\.disputaProjMin/.test(srcUtils)) {
        erro('o maiorToqueSeguro voltou a meter toda a gente na disputa');
    } else ok('a projecção na direcção da corrida é lida');
}

console.log('');
if (falhas) {
    console.log(`toque_com_marcador_atras: ${falhas} falha(s).`);
    process.exit(1);
}
console.log('OK: o marcador nas costas já não trava a adiantada.');
