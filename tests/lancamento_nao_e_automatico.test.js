/*
O LANÇAMENTO DEIXA DE SER A PRIMEIRA ESCOLHA.

Relato: "os zagueiros estão chutando longos lançamentos para frente na
mentalidade equilibrada com vários jogadores de meio, meio pela lateral e
laterais para sair jogando".

O `findBestPassAnywhere` devolvia o lançamento antes sequer de calcular o
passe normal, e só perguntava se o portador estava sob pressão. Medido em 20
minutos de jogo (Equilibrada / Positional): 71 lançamentos, 100% fora de
pressão e 100% com passe curto disponível no mesmo instante.

Este teste exerce a decisão de produção (`LancamentoDecisao.aceita`, em
js/config/passing.js) com os quatro estados que a distinguem.

Corre com: node tests/lancamento_nao_e_automatico.test.js
*/
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(RAIZ, 'js', 'config', 'passing.js'), 'utf8');

const i = src.indexOf('const LancamentoDecisao');
if (i < 0) throw new Error('LancamentoDecisao não existe em js/config/passing.js');
const fim = src.indexOf('\n};', i);
if (fim < 0) throw new Error('LancamentoDecisao sem fecho');
const LancamentoDecisao = new Function(
    src.slice(i, fim + 3) + '; return LancamentoDecisao;')();

let falhas = 0;
function exigir(cond, msg) {
    if (!cond) { console.log('FALHA: ' + msg); falhas++; }
    else console.log('ok: ' + msg);
}

// Mentalidades reais, do MentalidadeModel (js/config/tactics.js).
const MUITO_DEFENSIVA = 0.20, DEFESA = 0.35, EQUILIBRADA = 0.50, ATAQUE = 0.65, MUITO_OFENSIVA = 0.80;

// 1. O CASO DO RELATO: central no próprio terço, sem pressão, com o meio todo
//    disponível para tocar. Nunca lança.
{
    const r = LancamentoDecisao.aceita({
        temPasseCurto: true, receptorEmRuptura: false,
        agressao: EQUILIBRADA, defesaNoProprioTerco: true
    });
    exigir(r === false, 'central no próprio terço com passe curto NÃO lança');
}

// 2. E não lança mesmo que alguém vá em ruptura, nem em mentalidade ofensiva:
//    ali a função dele é sair a jogar.
{
    const comRuptura = LancamentoDecisao.aceita({
        temPasseCurto: true, receptorEmRuptura: true,
        agressao: EQUILIBRADA, defesaNoProprioTerco: true
    });
    const ofensiva = LancamentoDecisao.aceita({
        temPasseCurto: true, receptorEmRuptura: false,
        agressao: MUITO_OFENSIVA, defesaNoProprioTerco: true
    });
    exigir(comRuptura === false, 'nem com o colega em ruptura, se tem passe curto');
    exigir(ofensiva === false, 'nem em Muito Ofensiva, se tem passe curto');
}

// 3. SEM ALTERNATIVA, lança sempre — apertar isto trocava a bola comprida a
//    mais pela bola presa, que é o mesmo defeito ao contrário.
{
    const defesa = LancamentoDecisao.aceita({
        temPasseCurto: false, receptorEmRuptura: false,
        agressao: MUITO_DEFENSIVA, defesaNoProprioTerco: true
    });
    exigir(defesa === true, 'sem passe curto nenhum, lança mesmo sendo defesa em Muito Defensiva');
}

// 4. O LANÇAMENTO VERDADEIRO: colega a romper por trás da linha. Vale em
//    qualquer mentalidade — é para isso que ele corre.
{
    const equilibrada = LancamentoDecisao.aceita({
        temPasseCurto: true, receptorEmRuptura: true,
        agressao: EQUILIBRADA, defesaNoProprioTerco: false
    });
    const defensiva = LancamentoDecisao.aceita({
        temPasseCurto: true, receptorEmRuptura: true,
        agressao: DEFESA, defesaNoProprioTerco: false
    });
    exigir(equilibrada === true, 'médio com colega em ruptura lança em Equilibrada');
    exigir(defensiva === true, 'e também em Defesa');
}

// 5. SEM RUPTURA é bola comprida para o espaço, e aí manda a MENTALIDADE —
//    que antes desta correcção não tinha palavra nenhuma nesta escolha.
{
    const eq = LancamentoDecisao.aceita({
        temPasseCurto: true, receptorEmRuptura: false,
        agressao: EQUILIBRADA, defesaNoProprioTerco: false
    });
    const at = LancamentoDecisao.aceita({
        temPasseCurto: true, receptorEmRuptura: false,
        agressao: ATAQUE, defesaNoProprioTerco: false
    });
    const mo = LancamentoDecisao.aceita({
        temPasseCurto: true, receptorEmRuptura: false,
        agressao: MUITO_OFENSIVA, defesaNoProprioTerco: false
    });
    exigir(eq === false, 'Equilibrada (0.50) não manda bola comprida por gosto');
    exigir(at === true, 'Ataque (0.65) manda');
    exigir(mo === true, 'Muito Ofensiva (0.80) manda');
}

// 6. Estado em falta não pode abrir a porta por acidente.
{
    exigir(LancamentoDecisao.aceita({ temPasseCurto: true }) === false,
        'sem agressão declarada assume o meio da tabela e não lança');
    exigir(LancamentoDecisao.aceita() === true,
        'sem estado nenhum não há passe curto conhecido, portanto lança');
}

console.log(falhas === 0 ? 'PASSOU' : 'FALHOU (' + falhas + ')');
process.exit(falhas === 0 ? 0 : 1);
