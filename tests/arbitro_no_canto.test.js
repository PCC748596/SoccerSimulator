/*
O ÁRBITRO NO CANTO — na posição do penálti, do lado oposto à cobrança.

Pedido: *"no corner, o juiz tem que se posicionar do lado oposto à cobrança, na
mesma posição do penálti"*. É a colocação real: dali ele vê o cruzamento a
chegar de frente, com a baliza e o aglomerado entre ele e o batedor. A diagonal
normal (`RefereeModel.diagonalX`, a coroa dos 20-25 m) punha-o fora da área e
do lado do batedor — a pior das duas coisas.

Corre o `Officials.pontoDoArbitro` a sério, extraído do officials.js, com o
Match num canto de cada lado e de cada baliza.

Corre com: node --test tests/arbitro_no_canto.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');
const THREE = require('three');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const src = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcOf = src('js/officials.js');
const srcSh = src('js/config/shooting.js');

function extrairObjecto(s, nome) {
    const ini = s.indexOf(`const ${nome} = {`);
    assert.ok(ini > 0, `${nome} não encontrado`);
    const fim = s.indexOf(LF + '};', ini);
    return new Function('Area', `${s.slice(ini, fim + 3)}; return ${nome};`)(
        { distanciaPenalti: 11.0, profundidade: 16.5, meiaLargura: 20.16 });
}

const PenaltyModel = extrairObjecto(srcSh, 'PenaltyModel');
const RefereeModel = extrairObjecto(srcOf, 'RefereeModel');

// Só o método, isolado: o resto do officials.js arrasta o FootballPlayer.
const iniM = srcOf.indexOf('    pontoDoArbitro: function (bola) {');
assert.ok(iniM > 0, 'pontoDoArbitro desapareceu');
const fimM = srcOf.indexOf(LF + '    },', iniM) + 7;
const corpo = srcOf.slice(iniM, fimM).replace('pontoDoArbitro: function (bola) {',
    'function pontoDoArbitro(bola) {').replace(/\},\s*$/, '}');

const CAMPO_COMP = 106, CAMPO_LARG = 68;

function correr(estado, { ladoDoCanto = 1, attDir = 1, bola = null } = {}) {
    const pos = bola || { x: ladoDoCanto * (CAMPO_LARG / 2), y: 0.11, z: attDir * (CAMPO_COMP / 2) };
    const amb = {
        THREE, console, CAMPO_COMP, CAMPO_LARG, RefereeModel, PenaltyModel,
        Match: {
            state: estado,
            setPieceTaker: { dirZ: attDir },
            cantoBolaAlvo: (estado === 'CORNER_KICK')
                ? { x: ladoDoCanto * (CAMPO_LARG / 2 - 0.3), y: 0.11, z: attDir * (CAMPO_COMP / 2 - 0.3) }
                : null,
            ball: { position: pos }
        }
    };
    return new Function(...Object.keys(amb), `${corpo}; return pontoDoArbitro;`)
        (...Object.values(amb))(pos);
}

test('no canto ele fica na posição do penálti', () => {
    const canto = correr('CORNER_KICK', { ladoDoCanto: 1, attDir: 1 });
    const penalti = correr('PENALTY', { attDir: 1 });

    // O MESMO z: o alinhamento da marca de penálti.
    assert.ok(Math.abs(canto.z - penalti.z) < 1e-6,
        `canto em z=${canto.z.toFixed(2)} e penálti em z=${penalti.z.toFixed(2)}`);
    // E a mesma distância ao eixo: a lateral da pequena área.
    assert.ok(Math.abs(Math.abs(canto.x) - PenaltyModel.arbitroX) < 1e-6,
        `x=${canto.x.toFixed(2)}, e a posição do penálti é ±${PenaltyModel.arbitroX}`);
});

test('e do lado OPOSTO ao da cobrança, nos dois lados', () => {
    for (const lado of [1, -1]) {
        for (const attDir of [1, -1]) {
            const p = correr('CORNER_KICK', { ladoDoCanto: lado, attDir });
            assert.strictEqual(Math.sign(p.x), -lado,
                `canto do lado ${lado} (baliza ${attDir}) e o árbitro em x=${p.x.toFixed(2)}`);
            // Sempre à frente da baliza que está a ser atacada.
            assert.strictEqual(Math.sign(p.z), attDir,
                `o árbitro ficou na metade errada do campo (z=${p.z.toFixed(2)})`);
        }
    }
});

test('o lado sai da quina onde a bola vai ser reposta, não de onde ela está', () => {
    /*
    No instante em que o canto é marcado a bola ainda rola para fora do campo
    (ver o countdown em match_loop.js), e o x dela pode já estar do outro lado.
    O `cantoBolaAlvo` é a quina onde ela vai ficar, e é isso que define o lado.
    */
    const p = correr('CORNER_KICK', {
        ladoDoCanto: 1, attDir: 1,
        // Bola já a rolar para o lado errado, atrás da baliza.
        bola: { x: -12, y: 0.4, z: 60 }
    });
    assert.ok(p.x < 0, `o árbitro seguiu a bola em vez da quina (x=${p.x.toFixed(2)})`);
});

test('fora do canto e do penálti, continua a ser a diagonal', () => {
    const p = correr('PLAY', { bola: { x: 0, y: 0.11, z: 0 } });
    // A diagonal passa pelo centro: com a bola no meio-campo ele fica lá perto,
    // e não no alinhamento da marca de penálti.
    assert.ok(Math.abs(Math.abs(p.z) - (CAMPO_COMP / 2 - PenaltyModel.marcaZ)) > 1.0,
        'o ramo do canto apanhou o jogo corrido');
});
