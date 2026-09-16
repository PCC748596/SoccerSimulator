/*
O DEFESA SEM PRESSÃO PREFERE O TOQUE CURTO.

Segunda metade do relato dos "lançamentos longos dos zagueiros". A regra
`saidaDeTras` (PassTypeModel) corrigiu o COMO — a bola passou a ir ao pé em vez
de ao espaço, medido em 60 minutos: 65% -> 44% no central. Não corrigiu o
QUANTO LONGE: a distância real média dos defesas ficou em 20.2 m e os passes
acima de 25 m em 31%, iguais aos de antes.

O COMO e o QUEM são decisões separadas, e quem ganhava a votação continuava a
ser o companheiro distante. O pódio de uma delas, capturado no instante da
decisão:

    LB escolheu CF a 24.9 m
    CF 1274 (24.9 m) | CB 1224 (15.7 m) | LM 1048 (8.7 m) | CB 998 (26 m)

50 pontos em 1224, 4%. O `SaidaDeJogo` (js/config/passing.js) é o termo que
falta: função + zona + ausência de pressão.

Corre com: node tests/saida_a_jogar_curto.test.js
*/
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(RAIZ, 'js', 'config', 'passing.js'), 'utf8');

const i = src.indexOf('const SaidaDeJogo');
if (i < 0) throw new Error('SaidaDeJogo não existe em js/config/passing.js');
const fim = src.indexOf('\n};', i);
if (fim < 0) throw new Error('SaidaDeJogo sem fecho');
const SaidaDeJogo = new Function(src.slice(i, fim + 3) + '; return SaidaDeJogo;')();

let falhas = 0;
function exigir(cond, msg) {
    if (!cond) { console.log('FALHA: ' + msg); falhas++; }
    else console.log('ok: ' + msg);
}

const EQUILIBRADA = 0.50, MUITO_OFENSIVA = 0.80, MUITO_DEFENSIVA = 0.20;

// 1. NÃO SE APLICANDO, não mexe em nada. É a garantia de que isto não toca no
//    médio nem no avançado nem no defesa já lá à frente.
{
    for (const d of [5, 15, 25, 40]) {
        if (SaidaDeJogo.factor(false, d, EQUILIBRADA) !== 1.0) {
            console.log('FALHA: mexeu na nota a ' + d + ' m sem se aplicar');
            falhas++;
        }
    }
    exigir(true, 'fora da saída de jogo a nota fica intacta em todas as distâncias');
}

// 2. O CASO MEDIDO: 50 pontos em 1224 separavam o CB a 15.7 m do CF a 24.9 m.
//    Com o termo aplicado, o curto tem de passar à frente.
{
    const notaCB = 1224, notaCF = 1274;
    const cb = notaCB * SaidaDeJogo.factor(true, 15.7, EQUILIBRADA);
    const cf = notaCF * SaidaDeJogo.factor(true, 24.9, EQUILIBRADA);
    exigir(cb > cf,
        'o CB a 15.7 m passa o CF a 24.9 m (' + cb.toFixed(0) + ' vs ' + cf.toFixed(0) + ')');
}

// 3. Monotonia: nunca premeia mais um passe mais longo do que um mais curto.
{
    let monotono = true;
    let anterior = Infinity;
    for (let d = 2; d <= 45; d += 0.5) {
        const f = SaidaDeJogo.factor(true, d, EQUILIBRADA);
        if (f > anterior + 1e-12) { monotono = false; break; }
        anterior = f;
    }
    exigir(monotono, 'o factor nunca sobe com a distância');
}

// 4. EM RAMPA e não em degrau: entre o curto e o longo não há salto. Com um
//    corte seco o portador muda de ideias ao atravessar a fronteira.
{
    let maiorSalto = 0;
    let ant = SaidaDeJogo.factor(true, 2, EQUILIBRADA);
    for (let d = 2.1; d <= 45; d += 0.1) {
        const f = SaidaDeJogo.factor(true, d, EQUILIBRADA);
        maiorSalto = Math.max(maiorSalto, Math.abs(f - ant));
        ant = f;
    }
    exigir(maiorSalto < 0.01, 'sem degraus na rampa (maior salto ' + maiorSalto.toFixed(4) + ')');
}

// 5. A MENTALIDADE tempera: quem ataca aceita mais risco na saída.
{
    const ofeLongo = SaidaDeJogo.factor(true, 30, MUITO_OFENSIVA);
    const eqLongo = SaidaDeJogo.factor(true, 30, EQUILIBRADA);
    const defLongo = SaidaDeJogo.factor(true, 30, MUITO_DEFENSIVA);
    exigir(ofeLongo > eqLongo && eqLongo > defLongo,
        'a bola comprida é menos castigada em Muito Ofensiva (' +
        ofeLongo.toFixed(3) + ' > ' + eqLongo.toFixed(3) + ' > ' + defLongo.toFixed(3) + ')');
    exigir(Math.abs(eqLongo - (1 - SaidaDeJogo.penalLongo)) < 1e-9,
        'Equilibrada é exactamente a penalização de tabela');
}

// 6. O efeito é um empurrão, não uma proibição: um passe longo continua a
//    valer a maior parte da sua nota, e ganha quando não há nada melhor.
{
    const pior = Math.min(
        SaidaDeJogo.factor(true, 45, MUITO_DEFENSIVA),
        SaidaDeJogo.factor(true, 45, EQUILIBRADA));
    exigir(pior > 0.75, 'no pior caso o passe longo guarda mais de 75% da nota (' + pior.toFixed(3) + ')');
}

// 7. Agressão fora da escala não pode inverter o sinal do termo.
{
    exigir(SaidaDeJogo.factor(true, 30, 5.0) <= 1.0 && SaidaDeJogo.factor(true, 30, 5.0) >= 0,
        'agressão absurda não transforma a penalização em bónus');
}

console.log(falhas === 0 ? 'PASSOU' : 'FALHOU (' + falhas + ')');
process.exit(falhas === 0 ? 0 : 1);
