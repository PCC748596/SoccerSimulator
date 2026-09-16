/*
A PAUSA TEM DE CALAR O SOM.

Pedido: "ajusta para o pause para o som tb".

O `AmbienteSonoro.update` -- que e quem faz a rampa de volume do estadio --
vive dentro do `Match.update`, e esse nao corre com o jogo em pausa. O volume
congelava no valor em que ia e o elemento <audio> continuava a tocar o loop da
multidao com o jogo parado. O mesmo para um apito ou um chute disparado no
frame anterior a pausa.

Corre com: node --test tests/pausa_cala_o_som.test.js
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('../tools/headless/harness.js');

// Os dois ficheiros de som nao entram no harness (o jogo headless nao toca
// nada); carregam-se aqui, no mesmo contexto, para o teste os poder ver.
for (const f of ['js/efeitos_sonoros.js', 'js/ambiente_sonoro.js']) {
    vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), { filename: f });
}

// Um <audio> de mentira que regista o que lhe fazem.
const fingirAudio = () => ({
    paused: false, volume: 0.3, currentTime: 0, ended: false,
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; }
});

test('a pausa pára o loop do estádio, e o retomar volta a tocá-lo', () => {
    AmbienteSonoro._audio = fingirAudio();
    AmbienteSonoro._grito = fingirAudio();
    AmbienteSonoro._ligado = true;
    AmbienteSonoro._tentouTocar = true;

    AmbienteSonoro.setPausa(true);
    assert.strictEqual(AmbienteSonoro._audio.paused, true, 'o estádio continuou a tocar em pausa');
    assert.strictEqual(AmbienteSonoro._grito.paused, true, 'o grito continuou a tocar em pausa');

    AmbienteSonoro.setPausa(false);
    assert.strictEqual(AmbienteSonoro._audio.paused, false, 'o estádio não voltou ao sair da pausa');
});

test('com o som desligado no painel, sair da pausa não o liga', () => {
    AmbienteSonoro._audio = fingirAudio();
    AmbienteSonoro._grito = fingirAudio();
    AmbienteSonoro._ligado = false;
    AmbienteSonoro._audio.paused = true;

    AmbienteSonoro.setPausa(true);
    AmbienteSonoro.setPausa(false);
    assert.strictEqual(AmbienteSonoro._audio.paused, true,
        'a pausa ligou o som que o utilizador tinha desligado');
});

test('os efeitos no ar calam-se', () => {
    EfeitosSonoros._sons = { apito: { vozes: [fingirAudio(), fingirAudio()], volume: 1, proxima: 0, ultimo: 0 } };
    EfeitosSonoros.pararTudo();
    for (const a of EfeitosSonoros._sons.apito.vozes) {
        assert.strictEqual(a.paused, true, 'ficou um apito a tocar depois da pausa');
    }
});

test('o botão de pausa é quem manda nisto', () => {
    AmbienteSonoro._audio = fingirAudio();
    AmbienteSonoro._grito = fingirAudio();
    AmbienteSonoro._ligado = true;
    AmbienteSonoro._tentouTocar = true;
    window.isPaused = false;

    Match.togglePause();
    assert.strictEqual(window.isPaused, true, 'o teste não chegou a pausar');
    assert.strictEqual(AmbienteSonoro._audio.paused, true,
        'o botão de pausa não fala com o som');

    Match.togglePause();
    assert.strictEqual(AmbienteSonoro._audio.paused, false, 'o som não voltou ao continuar');
});
