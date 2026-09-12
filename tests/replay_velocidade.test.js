/*
O REPLAY OBEDECE AO CONTROLO DE VELOCIDADE — 0.6x incluido.

Pedido: *"ajusta para poder alterar tb a velocidade 0.6x no replay"*.

O painel ja tinha os botoes 0.6x / 1.0x / 1.2x / 2x / Frame (index.html, todos
a chamar `Match.setSpeed`), mas o replay ignorava-os: o `playFrame` avancava
sempre exactamente um frame gravado por frame desenhado. E o `startReplay` poe
o jogo em pausa, portanto o bloco de velocidade do `animate` (main.js) nem
chega a correr — a velocidade tinha de ser lida deste lado.

O QUE ESTE TESTE FIXA:

1. A camara lenta e LENTA, nao saltada: a 0.6x, dez frames desenhados fazem
   avancar seis frames gravados, com a fraccao a acumular entre eles.
2. O 2x avanca dois de cada vez, e o 1x continua a ser um por um.
3. O 'frame' so avanca quando o botao pede o passo seguinte, e consome o
   pedido — senao ficava a correr sozinho.

Corre com: node tests/replay_velocidade.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/*
Monta o ficheiro real num ambiente minimo. O `restoreFrame` salta jogadores
sem `model`/`rig`, portanto listas vazias chegam para exercitar o cursor — o
que aqui se mede e a ARITMETICA do avanco, nao a pose.
*/
const vec = () => ({ set: function () { return this; } });
const janela = {};
const Match = {
    ball: { position: vec(), quaternion: vec() },
    players: [], opponents: [],
    stepNextFrame: false,
    togglePause: function () { janela.isPaused = true; }
};
const doc = { getElementById: () => null };

const src = ler('js/match/match_replay.js');
const montar = new Function('window', 'Match', 'document', 'THREE',
    src + LF + 'return { sistema: window.MatchReplay, REPLAY_FRAMES: REPLAY_FRAMES };');
const { sistema, REPLAY_FRAMES } = montar(janela, Match, doc, {});

// Buffer cheio: `count` alto e `head` longe, para o cursor poder correr.
sistema.count = REPLAY_FRAMES;
const arrancar = () => {
    sistema.isReplaying = true;
    sistema.replayCursor = 0;
    sistema.head = REPLAY_FRAMES - 1;   // longe do cursor: nao termina a meio
    sistema._avancoPendente = 0;
};

const correr = (velocidade, frames) => {
    arrancar();
    janela.speedMultiplier = velocidade;
    for (let i = 0; i < frames; i++) sistema.playFrame();
    return sistema.replayCursor;
};

console.log('');
console.log('1 — a camara lenta e lenta, e nao saltada');
{
    const avancou = correr(0.6, 10);
    if (avancou !== 6) {
        erro(`a 0.6x, 10 frames desenhados deviam avancar 6 gravados e avancaram ${avancou}`);
    } else ok('0.6x: 10 frames desenhados -> 6 frames gravados');

    /*
    O mesmo frame tem de ficar no ecra mais do que uma vez — se a fraccao nao
    acumulasse, ou avancava sempre 1 (1x disfarcado) ou sempre 0 (congelado).
    */
    arrancar();
    janela.speedMultiplier = 0.6;
    const vistos = [];
    for (let i = 0; i < 5; i++) { vistos.push(sistema.replayCursor); sistema.playFrame(); }
    const repetidos = vistos.filter((v, i) => i > 0 && v === vistos[i - 1]).length;
    if (repetidos === 0) erro('nenhum frame gravado ficou no ecra dois frames desenhados: isto e 1x');
    else ok(`${repetidos} repeticoes em 5 frames — e camara lenta a serio`);
}

console.log('');
console.log('2 — as outras velocidades');
{
    const um = correr(1.0, 10);
    if (um !== 10) erro(`a 1.0x deviam ser 10 e foram ${um}`);
    else ok('1.0x: um por um, como antes');

    const dois = correr(2, 10);
    if (dois !== 20) erro(`a 2x deviam ser 20 e foram ${dois}`);
    else ok('2x: dois de cada vez');

    // Sem controlo nenhum definido, comporta-se como 1x.
    const semNada = correr(undefined, 10);
    if (semNada !== 10) erro(`sem speedMultiplier devia correr a 1x e deu ${semNada}`);
    else ok('sem controlo definido, 1x');
}

console.log('');
console.log('3 — o passo-a-passo so anda quando lhe pedem');
{
    arrancar();
    janela.speedMultiplier = 'frame';
    Match.stepNextFrame = false;
    for (let i = 0; i < 5; i++) sistema.playFrame();
    if (sistema.replayCursor !== 0) {
        erro(`em 'frame' sem pedido o replay andou ${sistema.replayCursor} frames`);
    } else ok("'frame' parado fica parado");

    Match.stepNextFrame = true;
    sistema.playFrame();
    if (sistema.replayCursor !== 1) erro('o passo pedido nao avancou exactamente um frame');
    else if (Match.stepNextFrame !== false) erro('o pedido de passo nao foi consumido: anda sozinho a seguir');
    else ok('um pedido, um frame, e o pedido consome-se');
}

console.log('');
if (falhas) {
    console.log(`replay_velocidade: ${falhas} falha(s).`);
    process.exit(1);
}
console.log('OK: o replay corre a velocidade que o painel escolher.');
