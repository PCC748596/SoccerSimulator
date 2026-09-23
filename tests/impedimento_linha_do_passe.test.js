/*
AS LINHAS DO MOMENTO DO PASSE, no impedimento.

Relato: *"A marcação de impedimento está errada. Foi marcado impedimento nesse
lance. Mas o jogador do Grêmio não está à frente do último marcador. O último é
o lateral esquerdo lá em cima. Está bem longe dele."*

A MARCAÇÃO NÃO ESTAVA ERRADA. Medido com `tools/lab/impedimento.js`, seis
sementes de 30 minutos e 26 impedimentos assinalados:

    errados pela Lei 11, com tudo congelado no instante do passe      0
    que, quando o apito chega, ja nao estao a frente da linha         9  (35%)

A posição congela-se no passe, como manda a regra, mas o apito só vem quando
alguém toca na bola ou ela sai — mediana ~1 s, até 3,4 s depois. Nesse tempo a
defesa sobe e o atacante recua, e o que fica no ecrã não é a situação que foi
julgada: uma decisão certa parece errada.

Por isso se desenham as duas linhas do instante do passe. Não muda regra
nenhuma — a decisão já estava tomada; passa a ser conferível a olho.

Este teste prende:

  . que a linha do penúltimo adversário é GUARDADA no instante do passe (sem
    isso não há o que desenhar, e era esse o estado anterior);
  . que o desenho acontece ANTES do `limparImpedimento`, que deita fora
    justamente essa linha;
  . que as linhas se apagam sozinhas, e que o prazo é configurável.

Corre com: node tests/impedimento_linha_do_passe.test.js
*/
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);
const src = ler('js/officials.js');
const cfg = ler('js/config/defense.js');

let falhas = 0;
const erro = (m) => { falhas++; console.error('  X ' + m); };
const ok = (m) => console.log('  . ' + m);

/* ------------------------------------------------------------------ */
console.log(LF + '1 — a linha e guardada no instante do passe');
{
    const i = src.indexOf('marcarPosicoesDeImpedimento: function');
    const fim = src.indexOf(LF + '    limparImpedimento', i);
    const corpo = (i < 0) ? '' : src.slice(i, fim);

    if (!/this\._linhaNoPasse\s*=/.test(corpo))
        erro('o `marcarPosicoesDeImpedimento` nao guarda a linha do penultimo adversario — ' +
            'sem ela nao ha o que desenhar quando o apito chegar');
    else ok('guarda a linha do penultimo adversario');

    /*
    EM Z DO MUNDO, e nao no referencial de ataque: o desenho poe uma malha na
    cena, e a cena so conhece z do mundo. Guardar `linhaDir` a seco punha a
    linha do lado errado do campo em metade dos lances.
    */
    if (!/_linhaNoPasse = linhaDir \* dir/.test(corpo))
        erro('a linha nao e convertida de volta para z do MUNDO (linhaDir * dir)');
    else ok('guarda-a em z do mundo, que e o que a cena entende');
}

/* ------------------------------------------------------------------ */
console.log(LF + '2 — desenha ANTES de limpar');
{
    const i = src.indexOf('assinalarImpedimento: function');
    const corpo = (i < 0) ? '' : src.slice(i, i + 900);
    /*
    AS CHAMADAS, com o `this.` e o parentese — e nao a palavra. O comentario
    que explica a ordem menciona o `limparImpedimento` por extenso, e procurar
    a palavra encontrava-o no comentario, antes da chamada real: o teste
    acusava uma ordem errada que nao existia.
    */
    const iDesenho = corpo.indexOf('this.mostrarLinhaDoPasse(');
    const iLimpa = corpo.indexOf('this.limparImpedimento(');

    if (iDesenho < 0) erro('o `assinalarImpedimento` nao desenha as linhas');
    else if (iLimpa < 0) erro('nao encontrei o `limparImpedimento` no assinalar');
    else if (iDesenho > iLimpa)
        erro('desenha DEPOIS de limpar — o `limparImpedimento` deita fora a linha do passe, ' +
            'e o desenho sairia vazio ou no sitio errado');
    else ok('desenha antes de limpar');
}

/* ------------------------------------------------------------------ */
console.log(LF + '3 — as linhas apagam-se sozinhas, e o prazo configura-se');
{
    if (!/mostrarLinhaDoPasse: function/.test(src)) erro('falta o `mostrarLinhaDoPasse`');
    else ok('existe o `mostrarLinhaDoPasse`');

    if (!/tickLinhaDoPasse: function/.test(src)) erro('falta o `tickLinhaDoPasse` que as apaga');
    else ok('existe o `tickLinhaDoPasse`');

    // E tem de ser CHAMADO do update, senao ficam no relvado para sempre.
    const i = src.indexOf('update: function (dt)');
    const corpo = (i < 0) ? '' : src.slice(i, i + 1200);
    if (!/this\.tickLinhaDoPasse\(dt\)/.test(corpo))
        erro('o `tickLinhaDoPasse` nunca e chamado do update — as linhas ficavam no relvado o jogo todo');
    else ok('o update chama o tickLinhaDoPasse');

    const m = cfg.match(/segundosLinhaVar:\s*([\d.]+)/);
    if (!m) erro('o OffsideModel ficou sem `segundosLinhaVar`');
    else {
        const seg = Number(m[1]);
        ok(`segundosLinhaVar = ${seg} s`);
        if (seg <= 0) erro('o prazo e zero ou negativo: as linhas nunca aparecem');
        else if (seg > 15) erro(`${seg} s deixa as linhas no relvado muito depois de o jogo recomecar`);
        else ok('o prazo cobre a paragem sem invadir o recomeco');
    }

    // E a zero tem de DESLIGAR, nao de deixar linhas eternas.
    const j = src.indexOf('mostrarLinhaDoPasse: function');
    const desenho = (j < 0) ? '' : src.slice(j, j + 1200);
    if (!/segundos <= 0\) return/.test(desenho))
        erro('pôr `segundosLinhaVar` a 0 nao desliga o desenho');
    else ok('segundosLinhaVar a 0 desliga o desenho');
}

/* ------------------------------------------------------------------ */
console.log(LF + '4 — a regra em si nao foi mexida');
{
    /*
    O desenho e so apresentacao. As tres condicoes da Lei 11 tem de continuar
    onde estavam — a medicao que motivou este trabalho diz que elas estao
    CERTAS, e o risco aqui era "arranjar" o que nao estava partido.
    */
    const i = src.indexOf('marcarPosicoesDeImpedimento: function');
    const fim = src.indexOf(LF + '    limparImpedimento', i);
    const corpo = (i < 0) ? '' : src.slice(i, fim);

    for (const [re, nome] of [
        [/if \(zDir <= 0\) continue;/, 'na propria metade nao ha impedimento'],
        [/if \(zDir <= bolaDir \+ tol\) continue;/, 'tem de estar a frente da bola'],
        [/if \(zDir <= linhaDir \+ tol\) continue;/, 'tem de estar a frente do penultimo adversario'],
    ]) {
        if (!re.test(corpo)) erro('a condicao da Lei 11 desapareceu: ' + nome);
        else ok(nome);
    }

    if (!/linhaDeImpedimento\(advs, -dir\)/.test(corpo))
        erro('a linha deixou de ser calculada no referencial de quem DEFENDE (-dir)');
    else ok('a linha continua no referencial de quem defende');
}

console.log(LF + (falhas
    ? 'FALHOU: ' + falhas + ' problema(s)'
    : 'OK: a decisao continua a mesma, e agora ve-se de onde veio.'));
process.exit(falhas ? 1 : 0);
