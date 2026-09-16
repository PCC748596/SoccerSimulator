/*
O REPLAY AUTOMÁTICO DO GOLO.

Pedido: *"adiciona um botão Replay Automático: ON/OFF no painel da direita —
padrão ON. Caso saia um gol, será mostrado um replay na camera Lateral TV(7)
dos últimos 15s antes do gol. A nova saída de bola só será dada após o replay
automático terminar, caso esteja ligado"*.

O que este teste prende:

  . liga por omissão, e o botão do painel troca o estado;
  . a repetição começa 15 s ANTES do frame do golo — não no princípio do
    buffer, que é onde o replay manual começa;
  . corre na Lateral TV e devolve a câmara de onde se estava a ver;
  . acaba pouco depois do golo e não segue pela festa adentro;
  . e segura a saída de bola enquanto dura: é o `isReplaying` que impede o
    `animate` de chamar o `Match.update` (js/main.js), portanto a máquina de
    estados do golo fica onde está. A pausa do painel é outra coisa e fica
    onde o utilizador a deixou.

O rig não entra aqui: o `restoreFrame` é substituído por um contador. O que se
mede é o cursor, a câmara e a pausa.

Corre com: node --test tests/replay_golo.test.js
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const test = require('node:test');

const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'js', 'match', 'match_replay.js'), 'utf8');

const FPS = 60;
const REPLAY_FRAMES = 1200;   // tem de bater certo com o módulo

/*
Um palco mínimo: o módulo só toca em `window`, `document` e `Match`. Devolve o
sistema já construído mais os espiões de câmara e pausa.
*/
function palco() {
    const estado = { camaras: [], pausas: 0 };
    const botoes = {};
    const sandbox = {
        Float32Array, Math, console,
        document: {
            getElementById: (id) => botoes[id] || (botoes[id] = {
                id: id, innerText: '', style: {}, hidden: true,
                classList: { toggle: () => { }, add: () => { }, remove: () => { } }
            })
        },
        Match: {
            ball: null,
            setCameraMode: (m) => { estado.camaras.push(m); sandbox.window.cameraMode = m; },
            togglePause: () => { estado.pausas++; sandbox.window.isPaused = !sandbox.window.isPaused; }
        }
    };
    sandbox.window = {
        isPaused: false, speedMultiplier: 1, cameraMode: 'center'
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);

    const R = sandbox.window.MatchReplay;
    // O buffer não interessa: o que se mede é o cursor.
    estado.frames = [];
    R.restoreFrame = (idx) => { estado.frames.push(idx); };
    return { R, estado, sandbox, botoes };
}

// Põe o gravador como se já tivesse dado a volta ao buffer: tudo cheio, com o
// `head` a meio.
function bufferCheio(R, head) {
    R.count = REPLAY_FRAMES;
    R.head = head;
}

test('o aviso REPLAY acende enquanto a repetição corre, e apaga no fim', () => {
    const { R, botoes } = palco();
    bufferCheio(R, 900);
    R.marcarGolo();
    R.head = 900 + Math.round(4.5 * FPS);

    // Começa apagado: o elemento nasce com `hidden` no index.html.
    R.replayDoGolo();
    assert.strictEqual(botoes['aviso-replay'].hidden, false, 'acende ao arrancar');

    while (R.isReplaying) R.playFrame();
    assert.strictEqual(botoes['aviso-replay'].hidden, true, 'e apaga quando acaba');

    // E a manual acende-o também — é a mesma repetição para quem está a ver.
    R.startReplay();
    assert.strictEqual(botoes['aviso-replay'].hidden, false);
    R.stopReplay();
    assert.strictEqual(botoes['aviso-replay'].hidden, true);
});

test('liga por omissão, e o botão troca o estado', () => {
    const { R, botoes } = palco();
    assert.strictEqual(R.automatico, true, 'o padrão é ON');

    assert.strictEqual(R.toggleAutomatico(), false);
    assert.strictEqual(botoes['btn-replay-auto'].innerText, 'Replay Automático: OFF');

    assert.strictEqual(R.toggleAutomatico(), true);
    assert.strictEqual(botoes['btn-replay-auto'].innerText, 'Replay Automático: ON');
});

test('desligado, o golo não dispara repetição nenhuma', () => {
    const { R, estado, sandbox } = palco();
    bufferCheio(R, 600);
    R.marcarGolo();
    R.automatico = false;

    assert.strictEqual(R.replayDoGolo(), false);
    assert.strictEqual(R.isReplaying, false);
    assert.strictEqual(estado.pausas, 0, 'sem repetição, o jogo não pára');
    assert.strictEqual(sandbox.window.cameraMode, 'center', 'e a câmara não se mexe');
});

test('a repetição começa 15 s antes do golo, na Lateral TV, e segura o jogo', () => {
    const { R, estado, sandbox } = palco();
    bufferCheio(R, 900);
    R.marcarGolo();                       // marca = 900

    assert.strictEqual(R.replayDoGolo(), true);
    assert.strictEqual(R.isReplaying, true);
    assert.strictEqual(R.replayCursor, 900 - 15 * FPS, 'tem de recuar 15 s do golo');
    assert.deepStrictEqual(estado.camaras, ['lateraltv']);
    assert.strictEqual(estado.pausas, 0,
        'a repetição não mexe na pausa do painel — quem segura o jogo é o isReplaying');
});

test('sem 15 s gravados recua o que há, e com menos de um segundo não repete', () => {
    // Golo nos primeiros segundos de jogo: o buffer ainda não deu a volta.
    const a = palco();
    a.R.count = 5 * FPS; a.R.head = 5 * FPS;
    a.R.marcarGolo();
    assert.strictEqual(a.R.replayDoGolo(), true);
    assert.strictEqual(a.R.replayCursor, 5 * FPS - (5 * FPS - 1),
        'recua tudo o que há gravado, e não 15 s de lixo');

    const b = palco();
    b.R.count = 30; b.R.head = 30;        // meio segundo
    b.R.marcarGolo();
    assert.strictEqual(b.R.replayDoGolo(), false, 'meio segundo não é repetição');
    assert.strictEqual(b.R.isReplaying, false);
});

test('acaba pouco depois do golo, devolve a câmara e o andamento', () => {
    const { R, estado, sandbox } = palco();
    bufferCheio(R, 900);
    R.marcarGolo();                       // a bola entrou no frame 900
    // A festa do golo continua a gravar: quando a repetição arranca, o
    // gravador já vai 4.5 s à frente da marca. É o que dá frames depois do
    // golo para mostrar.
    R.head = 900 + Math.round(4.5 * FPS);
    R.replayDoGolo();

    // 15 s antes + 1 s depois = 16 s de repetição, a 1x.
    let frames = 0;
    while (R.isReplaying && frames < 20 * FPS + 10) { R.playFrame(); frames++; }

    assert.strictEqual(R.isReplaying, false, 'tem de parar sozinha');
    assert.ok(Math.abs(frames - 16 * FPS) <= 2,
        'a repetição são os 15 s antes mais 1 s depois, deu ' + (frames / FPS).toFixed(2) + ' s');
    assert.ok(frames < REPLAY_FRAMES,
        'não pode seguir pela festa do golo adentro até ao fim do buffer');

    assert.deepStrictEqual(estado.camaras, ['lateraltv', 'center'],
        'a câmara de onde se estava a ver tem de voltar');
    assert.strictEqual(sandbox.window.isPaused, false,
        'e o jogo segue: acabada a repetição, o animate volta a chamar o update');
});

test('a pausa do painel é do utilizador, e a repetição não lhe toca', () => {
    // Alguém carregou no pause antes do golo: a repetição não a levanta, e
    // enquanto ela durar nem a repetição anda (o pause vale no replay também).
    const { R, estado, sandbox } = palco();
    sandbox.window.isPaused = true;
    bufferCheio(R, 900);
    R.marcarGolo();
    R.replayDoGolo();

    const cursorInicial = R.replayCursor;
    for (let i = 0; i < 30; i++) R.playFrame();
    assert.strictEqual(R.replayCursor, cursorInicial,
        'em pausa a repetição fica no frame onde está');
    assert.strictEqual(sandbox.window.isPaused, true,
        'quem mandou parar é que manda continuar');
    assert.strictEqual(estado.pausas, 0);

    // Continuar devolve o andamento à repetição, e ela acaba sozinha.
    sandbox.window.isPaused = false;
    let frames = 0;
    while (R.isReplaying && frames < 20 * 60 + 10) { R.playFrame(); frames++; }
    assert.strictEqual(R.isReplaying, false);
});

test('o replay MANUAL fica como estava: os 20 s todos, e sem mexer na câmara', () => {
    const { R, estado, sandbox } = palco();
    bufferCheio(R, 900);

    R.startReplay();
    assert.strictEqual(R.replayCursor, 900, 'o manual começa no frame mais antigo (o head)');
    assert.strictEqual(R.replayFim, null, 'e não tem linha de meta antecipada');

    let frames = 0;
    while (R.isReplaying && frames < REPLAY_FRAMES + 10) { R.playFrame(); frames++; }
    assert.ok(Math.abs(frames - REPLAY_FRAMES) <= 2, 'corre o buffer inteiro');

    assert.deepStrictEqual(estado.camaras, [], 'o manual não toca na câmara');
    assert.strictEqual(estado.pausas, 0,
        'e já não carrega no pause por sua conta: era isso que congelava o replay');
});

test('desligar o botão a meio de uma repeticão automática corta-a', () => {
    const { R, sandbox } = palco();
    bufferCheio(R, 900);
    R.marcarGolo();
    R.replayDoGolo();
    R.playFrame();

    R.toggleAutomatico();
    assert.strictEqual(R.isReplaying, false);
    assert.strictEqual(sandbox.window.isPaused, false, 'e o jogo segue');
    assert.strictEqual(sandbox.window.cameraMode, 'center');
});
