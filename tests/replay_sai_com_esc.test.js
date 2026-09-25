/*
O ESC SAI DA REPETICAO.

BUG, com relato: *"nao esta saindo do replay quando aperto ESC"*.

Nao estava mesmo, e a razao era simples: o ESC nao estava ligado a nada. Nao
havia um unico `Escape` em todo o codigo do jogo. Quem entrava numa repeticao
so saia voltando a carregar no botao do painel — e numa repeticao AUTOMATICA de
golo, que comeca sozinha, nem esse botao e a coisa obvia a procurar.

O que este teste prende:

  . com uma repeticao a correr, o ESC chama o `stopReplay`;
  . SEM repeticao, o ESC nao faz nada e nao engole a tecla — engoli-la seria
    tirar ao utilizador o ESC do navegador (sair do ecra inteiro) a troco de
    nada;
  . e serve as duas repeticoes, a manual e a automatica do golo.

Corre com: node tests/replay_sai_com_esc.test.js
*/
const fs = require('fs');
const path = require('path');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { console.log('  X ' + m); falhas++; };

require('../tools/headless/harness.js');

/*
O QUE O TESTE MONTA: o ouvinte de teclado real (`Match.setupKeyboardListeners`,
match_ui.js) contra um `MatchReplay` de mentira que so conta chamadas. O
`stopReplay` verdadeiro mexe em 25 corpos e num buffer de milhares de frames —
o que aqui se quer saber e se a tecla LA CHEGA.
*/
const cena = new THREE.Scene();
Match.init(cena);

/*
Duas coisas que o ouvinte toca e que so existem na pagina: o painel lateral e
a camara. Sem elas, carregar no 'x' ou no '4' atira um erro para a consola no
meio de um teste que passa — ruido que faz um teste verde parecer partido.
*/
global.togglePainel = () => {};
Match.setCameraMode = () => {};   // a de verdade precisa da camara da pagina

let paragens = 0;
const replay = { isReplaying: false, stopReplay() { paragens++; this.isReplaying = false; } };
window.MatchReplay = replay;

Match.setupKeyboardListeners();

const carregar = (tecla) => {
    const ev = new window.KeyboardEvent('keydown', { key: tecla, cancelable: true });
    window.dispatchEvent(ev);
    return ev;
};

/* ------------------------------------------------------------------ */
console.log('1 — com a repeticao a correr, o ESC sai dela');
{
    replay.isReplaying = true;
    paragens = 0;
    const ev = carregar('Escape');

    if (paragens !== 1) erro(`o ESC nao parou a repeticao (${paragens} paragens)`);
    else ok('o ESC chama o stopReplay');

    if (replay.isReplaying) erro('continuou em repeticao depois do ESC');
    else ok('sai mesmo da repeticao');

    /*
    E CONSOME A TECLA, mas so neste caso: houve algo para fechar, e o
    navegador nao tem de fazer mais nada com ela.
    */
    if (!ev.defaultPrevented) erro('o ESC nao foi consumido quando havia repeticao para fechar');
    else ok('consome a tecla quando ha o que fechar');
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('2 — sem repeticao, o ESC nao mexe em nada');
{
    replay.isReplaying = false;
    paragens = 0;
    const ev = carregar('Escape');

    if (paragens !== 0) erro('chamou o stopReplay sem haver repeticao nenhuma');
    else ok('nao chama o stopReplay');

    /*
    E NAO ENGOLE A TECLA. O ESC do navegador (sair do ecra inteiro, cancelar
    um carregamento) tem de continuar a funcionar quando nao ha nada do jogo
    para fechar.
    */
    if (ev.defaultPrevented) erro('engoliu o ESC sem ter nada para fechar');
    else ok('deixa o ESC passar para o navegador');
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('3 — serve a repeticao AUTOMATICA do golo');
{
    /*
    A automatica e a que mais precisa disto: comeca sozinha depois do golo e o
    utilizador quer corta-la a meio. Para o ouvinte de teclado ela e igual —
    `isReplaying` de pe —, e e o proprio `stopReplay` que devolve a camara que
    a automatica pediu emprestada (ver `eraAutomatico`, match_replay.js).
    */
    replay.isReplaying = true;
    replay.eraAutomatico = true;
    paragens = 0;
    carregar('Escape');

    if (paragens !== 1) erro('o ESC nao corta a repeticao automatica');
    else ok('corta a repeticao automatica do golo');

    const src = ler('js/match/match_replay.js');
    const i = src.indexOf('stopReplay() {');
    const corpo = src.slice(i, src.indexOf(LF + '    }', i + 10));
    if (!/eraAutomatico/.test(corpo)) {
        erro('o `stopReplay` deixou de devolver a camara da repeticao automatica');
    } else ok('e o stopReplay devolve a camara emprestada');
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('4 — outras teclas nao passam a parar a repeticao');
{
    /*
    A guarda contra o remedio ficar largo de mais: o ouvinte tem muitas teclas
    (velocidades, camaras, pausa) e nenhuma delas tem nada que ver com sair da
    repeticao.
    */
    replay.isReplaying = true;
    paragens = 0;
    for (const t of ['1', '4', 'o', 'x', 'Enter', 'Tab']) carregar(t);

    if (paragens !== 0) erro(`${paragens} outras teclas pararam a repeticao`);
    else ok('so o ESC e que sai');
    replay.isReplaying = false;
}

console.log('');
console.log(falhas ? 'FALHOU: ' + falhas : 'OK: o ESC sai da repeticao.');
process.exit(falhas ? 1 : 0);
