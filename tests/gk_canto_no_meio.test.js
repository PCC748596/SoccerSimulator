/*
O GUARDA-REDES ESPERA O CANTO NO MEIO DA BALIZA.

Relato, com fotografia: *"antes do corner, o goleiro tem que se posicionar
próximo do centro do gol"*. O `setupSetPiece` já o punha no eixo, mas durante o
CORNER_KICK o `player.update` corta o `updateGK` e manda o guarda-redes para a
árvore — e a folha `actGoalkeeperPosition` pedia o ponto ao `gkAnchor(bola)`,
que com a bola na bandeirola satura no limite da baliza: o primeiro poste.

Corre a folha a sério (extraída do player_bt.js) com o Match num canto, e mede
onde ela põe o alvo.

Corre com: node --test tests/gk_canto_no_meio.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const src = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcBt = src('js/bt/player_bt.js');
const srcGk = src('js/config/goalkeeper.js');

function extrairObjecto(s, nome) {
    const ini = s.indexOf(`const ${nome} = {`);
    assert.ok(ini > 0, `${nome} não encontrado`);
    const fim = s.indexOf(LF + '};', ini);
    return new Function(`${s.slice(ini, fim + 3)}; return ${nome};`)();
}

const GkCanto = extrairObjecto(srcGk, 'GkCanto');

// A folha, isolada. O ramo do canto não toca no gkAnchor — o stub serve para
// se ver a diferença entre os dois caminhos.
const iniFolha = srcBt.indexOf('function actGoalkeeperPosition(ctx) {');
assert.ok(iniFolha > 0, 'actGoalkeeperPosition desapareceu da árvore');
const fimFolha = srcBt.indexOf(LF + '}', iniFolha) + 2;
const corpoFolha = srcBt.slice(iniFolha, fimFolha);

const CAMPO_COMP = 106;
const LARGURA_BALIZA = 7.32;

function correr({ estado, equipaDoLance, bolaX, bolaZ }) {
    const alvo = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    let estadoFsm = null;

    const p = {
        team: 'TeamB',
        gkStyle: 'defensive',
        ownGoalZ: -CAMPO_COMP / 2,
        dirZ: 1,
        dynamicTarget: alvo,
        fsm: { changeState: (s) => { estadoFsm = s; } }
    };

    const amb = {
        Match: {
            state: estado,
            setPieceTeam: equipaDoLance,
            ball: { position: { x: bolaX, y: 0.11, z: bolaZ } }
        },
        GkCanto,
        ALTURA_BASE_Y: 0,
        RepositionPace: { velocidadeGK: 4.2 },
        GoalkeeperStyle: { defensive: { depthMin: 1.2, depthMax: 6.0 } },
        // O caminho do jogo corrido: devolve um ponto reconhecível, para se
        // saber qual dos dois ramos correu.
        gkAnchor: () => ({ x: (LARGURA_BALIZA / 2) - 0.5, z: p.ownGoalZ + 6.0 })
    };

    new Function(...Object.keys(amb), `${corpoFolha}; return actGoalkeeperPosition;`)
        (...Object.values(amb))({ p, skillSpeed: 50 });

    return { alvo, estadoFsm, p };
}

test('num canto contra ele, o alvo fica junto ao centro da baliza', () => {
    // Canto do lado direito: bola na quina (+x, na linha de fundo dele).
    const { alvo, estadoFsm, p } = correr({
        estado: 'CORNER_KICK', equipaDoLance: 'TeamA',
        bolaX: 33.5, bolaZ: -CAMPO_COMP / 2
    });

    assert.ok(Math.abs(alvo.x) <= 1.0,
        `o guarda-redes espera o canto em x=${alvo.x.toFixed(2)} — o centro da baliza é 0 e o poste 3.66`);
    // E do lado de onde a bola vem, não do contrário.
    assert.ok(alvo.x >= 0, 'o desvio ficou para o lado oposto ao do canto');

    const avanco = (alvo.z - p.ownGoalZ) * p.dirZ;
    assert.ok(avanco > 0.5 && avanco < 4.0,
        `${avanco.toFixed(2)} m à frente da linha não é esperar um cruzamento`);
    assert.strictEqual(estadoFsm, 'MOVE_TO_POS');
});

test('o canto da PRÓPRIA equipa não o traz para o meio', () => {
    // A equipa dele é que bate: não há nada a defender, e ele segue a âncora
    // do jogo corrido como sempre.
    const { alvo } = correr({
        estado: 'CORNER_KICK', equipaDoLance: 'TeamB',
        bolaX: 33.5, bolaZ: CAMPO_COMP / 2
    });
    assert.ok(Math.abs(alvo.x) > 1.0, 'o ramo do canto apanhou o guarda-redes da equipa que bate');
});

test('fora do canto, a folha continua a delegar no gkAnchor', () => {
    const { alvo } = correr({
        estado: 'PLAY', equipaDoLance: null, bolaX: 20, bolaZ: 0
    });
    assert.ok(Math.abs(alvo.x) > 1.0,
        'a folha deixou de usar o gkAnchor no jogo corrido');
});

test('o config do canto é utilizável', () => {
    assert.ok(GkCanto.avancoDaLinha > 0.5 && GkCanto.avancoDaLinha < 5.0,
        'o avanço da linha saiu do razoável');
    assert.ok(Math.abs(GkCanto.desvioParaOLadoDoCanto) < LARGURA_BALIZA / 4,
        'o desvio para o lado do canto já não é "próximo do centro"');
});
