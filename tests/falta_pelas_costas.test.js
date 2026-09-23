/*
QUEM VEM PELAS COSTAS É QUE COMETE A FALTA.

Relato: *"Um atacante estava com a bola, quase dentro da área, e na hora que ia
chutar foi marcado falta contra ele. O marcador estava atrás dele, ninguem à
frente. Como pode ter uma falta contra ele?"*

O `Officials._avaliarContactos` escolhia o infractor SÓ pela velocidade —
*"quem entra é quem vai mais depressa"*. Num contacto por trás isso inverte a
culpa: um atacante a arrancar para rematar vai mais depressa do que o defesa
que o persegue, portanto ficava ele o infractor, punido por levar o toque nas
costas.

O ângulo de onde vem o contacto JÁ ERA CALCULADO nessa função — mas só depois
de o infractor estar escolhido, para dosear a gravidade. A informação existia e
não decidia nada.

Medido com `tools/lab/falta_pelas_costas.js`, em 30 minutos de jogo:

    semente    faltas de contacto   portador punido com o outro ATRÁS dele
      1 antes         20                        1
      1 depois        19                        0
      3 antes         29                        2
      3 depois        27                        0

O total não inflacionou: as faltas continuam a ser marcadas, mudou quem as
leva.

Este teste prende a FORMA da regra. Os números de cima vivem no laboratório,
porque numa simulação caótica um lote não prende nada.

Corre com: node tests/falta_pelas_costas.test.js
*/
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const src = fs.readFileSync(path.join(raiz, 'js', 'officials.js'), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const erro = (m) => { falhas++; console.error('  X ' + m); };
const ok = (m) => console.log('  . ' + m);

/* ------------------------------------------------------------------ */
console.log(LF + '1 — o limiar existe e e mesmo "pelas costas"');
{
    const m = src.match(/anguloPelasCostas:\s*([\d.]+)/);
    if (!m) erro('o RefereeModel.faltas.contacto ficou sem `anguloPelasCostas`');
    else {
        const rad = Number(m[1]);
        const graus = rad * 180 / Math.PI;
        ok(`anguloPelasCostas = ${rad} rad (${graus.toFixed(0)} graus)`);

        /*
        DOIS JOGADORES LADO A LADO estao a 90 graus um do outro. Um limiar
        nesse valor ou abaixo faria o ombro a ombro contar como "pelas
        costas", e aí a regra deixava de distinguir o que se propos a
        distinguir.
        */
        if (graus <= 95) erro(`${graus.toFixed(0)} graus apanha o ombro a ombro (que esta a 90) — ` +
            'a regra deixa de separar o contacto lateral do contacto por tras');
        else ok('fica acima dos 90 graus do ombro a ombro');

        if (graus >= 170) erro(`${graus.toFixed(0)} graus so apanha o contacto exactamente de tras — ` +
            'quase nunca dispara');
        else ok('e nao exige o contacto exactamente a 180 graus');
    }
}

/* ------------------------------------------------------------------ */
console.log(LF + '2 — a geometria decide antes da velocidade');
{
    const i = src.indexOf('const infractor = (vA >= vB)');
    if (i >= 0) erro('o infractor voltou a ser `const` escolhido so pela velocidade — ' +
        'a correccao pelas costas nao o pode reatribuir');
    else ok('o infractor nao e mais um `const` fixado pela velocidade');

    const j = src.indexOf('let infractor = (vA >= vB)');
    if (j < 0) erro('nao encontrei a escolha do infractor por velocidade');
    else {
        ok('a velocidade continua a ser o criterio de partida');
        const bloco = src.slice(j, j + 1400);

        if (!/aVemDeTras/.test(bloco) || !/bVemDeTras/.test(bloco))
            erro('a escolha do infractor nao olha a quem vem de tras');
        else ok('olha aos dois lados: quem vem de tras de quem');

        if (!/_anguloDeAtaque\(a, b\)/.test(bloco) || !/_anguloDeAtaque\(b, a\)/.test(bloco))
            erro('o angulo tem de ser medido nos DOIS sentidos — so um nao distingue quem persegue quem');
        else ok('mede o angulo nos dois sentidos');

        /*
        DE FRENTE UM PARA O OUTRO os dois "vêm de trás" pela conta do ângulo,
        e aí não há nada a corrigir: a velocidade fica a decidir. Sem esta
        guarda a regra escolheria sempre o `a`, que é arbitrário.
        */
        if (!/aVemDeTras !== bVemDeTras/.test(bloco))
            erro('falta a guarda do caso em que os dois vem de frente um para o outro — ' +
                'a regra passaria a escolher sempre o primeiro da lista');
        else ok('so corrige quando e UM SO deles que vem de tras');

        if (!/infractor = aVemDeTras \? a : b/.test(bloco))
            erro('quem vem de tras nao fica como infractor');
        else ok('quem vem de tras fica como infractor');

        if (!/vitima = \(infractor === a\) \? b : a/.test(bloco))
            erro('a vitima nao acompanha a troca do infractor — ficariam os dois o mesmo jogador');
        else ok('a vitima acompanha a troca');
    }
}

/* ------------------------------------------------------------------ */
console.log(LF + '3 — a outra fonte de faltas nao foi mexida');
{
    /*
    O DESARME (`marcarFalta(defensor, portador, ...)`) já atribuía a culpa ao
    defensor, que é o correcto. Este teste existe para que uma futura mexida
    na atribuição do contacto não a leve atrás sem querer.
    */
    if (!/this\.marcarFalta\(defensor, portador/.test(src))
        erro('a falta do desarme deixou de ser atribuida ao defensor');
    else ok('a falta do desarme continua a ser do defensor');
}

console.log(LF + (falhas
    ? 'FALHOU: ' + falhas + ' problema(s)'
    : 'OK: quem vem pelas costas leva a falta, e a velocidade decide o resto.'));
process.exit(falhas ? 1 : 0);
