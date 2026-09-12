/*
O CABECEIO NÃO PODE DESLIGAR O GUARDA-REDES.

Medido: 810 minutos de jogo, 33 golos (3.67 por 90, alvo 2.52). O último
contacto antes de cada golo:

    cabeceio      23   70%
    nada em 5 s    6   18%
    remate         3    9%
    passe          1    3%

    estado do guarda-redes no golo: idle 19, mergulho 9, salto alto 3, mãos 2

No futebol a sério os cabeceios valem ~17% dos golos. Aqui valem 70%, e em 19
dos 33 o guarda-redes está parado.

A causa não é ele não saber que a bola vem — o `executeHeader` liga o
`window.bolaChutada`, como o remate. A causa é o que lhe escreve a seguir: o
cabeceio limpo SORTEIA o desfecho antes de a bola sair da testa, e nos que
saem 'GOL' escrevia-lhe `gkDelayReacao = 0.8` com o comentário "GK não chega a
tempo". Ou seja: decidia-se o golo e depois desligava-se quem o podia evitar.

É exactamente o truque que os remates tinham e que já foi removido de lá — ver
a nota do `executeShotGameplay` (js/fsm.js): "Havia aqui um delay forçado que o
sorteio de desfechos escrevia: 1.0 s nos remates marcados como golo e 0 nos
marcados como defesa. Com o desfecho a sair da bola, isso deixou de existir."

O sorteio do cabeceio passa a escolher só a MIRA. Quem decide se entra é a
bola e o guarda-redes, com o tempo de reacção que ele tem sempre.

Corre com: node tests/cabeceio_nao_desliga_o_guarda_redes.test.js
*/
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const player = fs.readFileSync(path.join(RAIZ, 'js', 'player.js'), 'utf8');
const fsmSrc = fs.readFileSync(path.join(RAIZ, 'js', 'utils.js'), 'utf8');

let falhas = 0;
function exigir(cond, msg) {
    if (!cond) { console.log('FALHA: ' + msg); falhas++; }
    else console.log('ok: ' + msg);
}

// O corpo do executeHeader, para se olhar só para ele.
const iH = player.indexOf('    executeHeader()');
if (iH < 0) throw new Error('executeHeader não existe em js/player.js');
let nivel = 0, comecou = false, fimH = -1;
for (let k = iH; k < player.length; k++) {
    if (player[k] === '{') { nivel++; comecou = true; }
    else if (player[k] === '}') { nivel--; if (comecou && nivel === 0) { fimH = k + 1; break; } }
}
const corpo = player.slice(iH, fimH);

// 1. NENHUM desfecho do sorteio pode escrever um atraso ao guarda-redes.
//    Procura-se CÓDIGO, não a palavra: o comentário que explica o defeito tem
//    de poder nomeá-lo, senão a nota que impede a repetição é proibida.
{
    const semComentarios = corpo
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
    exigir(semComentarios.indexOf('forcedGKDelay') < 0,
        'nenhuma linha de código do executeHeader escreve um atraso forçado');
    exigir(!/gkDelayReacao\s*=/.test(semComentarios),
        'e o cabeceio não escreve o gkDelayReacao à mão');
}

// 2. E o atraso que ele recebe tem de ser o tempo de reacção normal, o mesmo
//    do remate — vindo do GoalkeeperDive e não de um número à mão.
{
    exigir(/armarGuardaRedes\s*\(/.test(corpo),
        'o cabeceio arma o guarda-redes pela função partilhada');
}

// 3. A função partilhada existe e sai do GoalkeeperDive.
{
    const iA = fsmSrc.indexOf('function armarGuardaRedes');
    exigir(iA >= 0, 'armarGuardaRedes existe em js/utils.js');
    if (iA >= 0) {
        let n = 0, c = false, fim = -1;
        for (let k = iA; k < fsmSrc.length; k++) {
            if (fsmSrc[k] === '{') { n++; c = true; }
            else if (fsmSrc[k] === '}') { n--; if (c && n === 0) { fim = k + 1; break; } }
        }
        const fn = fsmSrc.slice(iA, fim);
        exigir(/reaccaoBase/.test(fn) && /reaccaoPorSkill/.test(fn),
            'e o tempo de reacção sai do GoalkeeperDive, não de um número à mão');
        exigir(/gkReagiu\s*=\s*false/.test(fn),
            'e rearma o gkReagiu, senão o ramo de defesa não volta a correr');
    }
}

// 4. O remate usa a MESMA função — é o ponto de a ter: as duas não podem
//    voltar a divergir, que foi como isto aconteceu.
{
    const fsmJs = fs.readFileSync(path.join(RAIZ, 'js', 'fsm.js'), 'utf8');
    exigir(/armarGuardaRedes\s*\(/.test(fsmJs),
        'o remate (js/fsm.js) arma o guarda-redes pela mesma função');
}

// 5. A função, exercida: tempo de reacção dentro do humano em toda a escala de
//    skill, e nunca os 0.8 s que o sorteio escrevia.
{
    const iA = fsmSrc.indexOf('function armarGuardaRedes');
    let n = 0, c = false, fim = -1;
    for (let k = iA; k < fsmSrc.length; k++) {
        if (fsmSrc[k] === '{') { n++; c = true; }
        else if (fsmSrc[k] === '}') { n--; if (c && n === 0) { fim = k + 1; break; } }
    }
    const armar = new Function('GoalkeeperDive', 'window',
        fsmSrc.slice(iA, fim) + '; return armarGuardaRedes;')(
        { reaccaoBase: 0.28, reaccaoPorSkill: 0.18 }, {});

    for (const skill of [0, 50, 100]) {
        const gk = { gkDelayReacao: 99, gkReagiu: true };
        armar(gk, skill);
        const ok = gk.gkDelayReacao >= 0.09 && gk.gkDelayReacao <= 0.47 && gk.gkReagiu === false;
        if (!ok) { console.log('FALHA: skill ' + skill + ' deu ' + gk.gkDelayReacao); falhas++; }
    }
    exigir(true, 'reacção entre 0.10 s (GK 100) e 0.46 s (GK 0), nunca 0.8');

    // Guarda-redes em falta não pode rebentar o lance.
    let rebentou = false;
    try { armar(null, 50); } catch (e) { rebentou = true; }
    exigir(!rebentou, 'sem guarda-redes em campo não rebenta');
}

console.log(falhas === 0 ? 'PASSOU' : 'FALHOU (' + falhas + ')');
process.exit(falhas === 0 ? 0 : 1);
