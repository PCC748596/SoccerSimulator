/*
O UM-DOIS: quem acabou de passar e arranca livre para a frente vale mais como
opção de passe.

Pedido: *"se o jogador que tocou a bola para um companheiro correr para frente e
estiver sem nenhum jogador a sua frente a uma distância de 5 metros ele vai
ganhar mais 100 pontos para receber passe no vazio ou em profundidade"*.

As três condições (é ele quem passou, está a correr para a frente, e não tem
ninguém à frente dentro do raio) são testadas uma a uma, porque falhar qualquer
uma tem de valer zero — e porque o cone é para a FRENTE: um adversário ao lado
não lhe fecha caminho nenhum.

Corre com: node --test tests/toca_e_corre.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const src = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

// O PassModel real, para o teste andar com os números de produção.
function extrairObjecto(s, nome) {
    const ini = s.indexOf('const ' + nome + ' = {');
    assert.ok(ini > 0, nome + ' não encontrado');
    const fim = s.indexOf(LF + '};', ini);
    return new Function('ALTURA_CABECA', 'Math',
        s.slice(ini, fim + 3) + '; return ' + nome + ';')(1.72, Math);
}
const PassModel = extrairObjecto(src('js/config/passing.js'), 'PassModel');

/*
E o método real, extraído da classe. Não se monta o jogo: o que se mede é a
conta, e ela só lê `Match`, `PassModel` e o jogador.
*/
function extrairMetodo(s, nome) {
    const ini = s.indexOf('    ' + nome + '(opt) {');
    assert.ok(ini > 0, nome + ' não encontrado em js/player.js');
    const fim = s.indexOf(LF + '    }' + LF, ini);
    return s.slice(ini, fim + 7);
}
const corpo = extrairMetodo(src('js/player.js'), 'bonusDoTocaECorre');

const Match = { ultimoPassador: null, ultimoPassadorTimer: 0, players: [], opponents: [] };
const bonusDoTocaECorre = new Function('Match', 'PassModel',
    'return ({ ' + corpo.replace(/^    /, '') + ' }).bonusDoTocaECorre;')(Match, PassModel);

const jogador = (team, x, z, vz) => ({
    team: team, role: 'mid', dirZ: (team === 'TeamA') ? 1 : -1,
    model: { position: { x: x, z: z } },
    velocity: { x: 0, z: vz === undefined ? 0 : vz }
});

// Cenário base: o passador arrancou 2 m/s para a frente, campo limpo.
function cenario() {
    const passador = jogador('TeamA', 0, 10, 2.0);
    Match.players = [passador];
    Match.opponents = [];
    Match.ultimoPassador = passador;
    Match.ultimoPassadorTimer = 2.0;
    return passador;
}

test('livre à frente e a correr: leva o bónus', () => {
    const p = cenario();
    assert.strictEqual(bonusDoTocaECorre(p), PassModel.bonusTocaECorre);
    assert.strictEqual(PassModel.bonusTocaECorre, 100, 'o pedido são 100 pontos');
});

test('não foi ele que passou: não leva nada', () => {
    const p = cenario();
    Match.ultimoPassador = jogador('TeamA', 5, 5);
    assert.strictEqual(bonusDoTocaECorre(p), 0);
});

test('passou mas o prazo do um-dois acabou: não leva nada', () => {
    const p = cenario();
    Match.ultimoPassadorTimer = 0;
    assert.strictEqual(bonusDoTocaECorre(p), 0);
    assert.ok(PassModel.tocaECorreDuracao > 0, 'o prazo tem de existir');
});

test('parado ou a recuar não é arrancar', () => {
    const p = cenario();
    p.velocity.z = 0;
    assert.strictEqual(bonusDoTocaECorre(p), 0, 'parado não conta');

    p.velocity.z = -3.0;      // a recuar, no referencial dele
    assert.strictEqual(bonusDoTocaECorre(p), 0, 'a recuar não conta');

    p.velocity.z = PassModel.tocaECorreAvancoMin + 0.1;
    assert.strictEqual(bonusDoTocaECorre(p), PassModel.bonusTocaECorre,
        'acima do mínimo de avanço conta');
});

test('adversário À FRENTE dentro do raio mata o bónus', () => {
    const p = cenario();
    const raio = PassModel.tocaECorreRaio;
    assert.strictEqual(raio, 5.0, 'o pedido são 5 metros');

    // 4 m à frente: fecha o caminho.
    Match.opponents = [jogador('TeamB', 0, 10 + 4)];
    assert.strictEqual(bonusDoTocaECorre(p), 0);

    // 6 m à frente: já não.
    Match.opponents = [jogador('TeamB', 0, 10 + 6)];
    assert.strictEqual(bonusDoTocaECorre(p), PassModel.bonusTocaECorre);
});

test('adversário ATRÁS, ou ao LADO fora do raio, não fecha nada', () => {
    const p = cenario();

    // Colado às costas dele: o caminho à frente continua livre.
    Match.opponents = [jogador('TeamB', 0, 10 - 1)];
    assert.strictEqual(bonusDoTocaECorre(p), PassModel.bonusTocaECorre,
        'quem está atrás não fecha o caminho para a frente');

    // Ao lado, à mesma altura: também não (o cone é para a frente).
    Match.opponents = [jogador('TeamB', 3, 10)];
    assert.strictEqual(bonusDoTocaECorre(p), PassModel.bonusTocaECorre,
        'quem está a par dele não fecha o caminho');

    // Mas em diagonal à frente, dentro do raio, fecha.
    Match.opponents = [jogador('TeamB', 2, 10 + 2)];
    assert.strictEqual(bonusDoTocaECorre(p), 0);
});

test('vale para as duas equipas: a direcção de ataque é a de quem corre', () => {
    // TeamB ataca em -z: "para a frente" para ele é z a diminuir.
    const p = jogador('TeamB', 0, -10, -2.0);
    Match.players = [];
    Match.opponents = [p];
    Match.ultimoPassador = p;
    Match.ultimoPassadorTimer = 2.0;
    assert.strictEqual(bonusDoTocaECorre(p), PassModel.bonusTocaECorre);

    // E o adversário à frente DELE está em z menor.
    Match.players = [jogador('TeamA', 0, -13)];
    assert.strictEqual(bonusDoTocaECorre(p), 0);
});

test('o guarda-redes adversário não conta como quem fecha o caminho', () => {
    const p = cenario();
    const gk = jogador('TeamB', 0, 12);
    gk.role = 'gk';
    Match.opponents = [gk];
    assert.strictEqual(bonusDoTocaECorre(p), PassModel.bonusTocaECorre);
});
