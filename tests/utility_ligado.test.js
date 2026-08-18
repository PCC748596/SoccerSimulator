/*
O Utility AI corre mesmo quando o botão o liga.

Isto não testa a QUALIDADE das decisões (disso tratam os outros ficheiros de
utility_*) — testa que o caminho existe de ponta a ponta: o interruptor
despacha para o UtilityAI, o tick escolhe uma acção e executa-a.

Motivo: o módulo esteve escrito e testado durante todo este tempo sem sequer
estar carregado no index.html. Nenhum teste dava por isso, porque todos
chamavam as funções por dentro em vez de passar pelo interruptor.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { jogador, carregarActions, contexto } = require('./helpers/stubs.js');
const { AccoesComBola, AccoesSemBola } = carregarActions();
const { avaliarAccao, escolherAccao, Curvas } = require('../js/utility/core.js');

const raiz = path.join(__dirname, '..');

/* ------------------------------------------------------------------
   O index.html tem mesmo de carregar os três ficheiros: sem isto o
   interruptor liga uma coisa que não existe na página.
   ------------------------------------------------------------------ */
test('o index.html carrega os três ficheiros do Utility', () => {
    const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    for (const f of ['js/utility/core.js', 'js/utility/actions.js',
                     'js/utility/player_utility.js']) {
        assert.ok(html.includes(f), 'index.html nao carrega ' + f);
    }
});

test('o Utility é carregado depois do player_bt (precisa do PlayerContext)', () => {
    const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    assert.ok(html.indexOf('js/bt/player_bt.js') < html.indexOf('js/utility/player_utility.js'));
});

test('o PlayerAI despacha para o UtilityAI quando a flag está ligada', () => {
    const bt = fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8');
    assert.ok(/window\.usarUtilityAI[\s\S]{0,120}UtilityAI\.tick/.test(bt),
        'PlayerAI.tick nao chama UtilityAI.tick sob a flag');
});

test('a flag arranca desligada', () => {
    const cfg = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
    assert.ok(/window\.usarUtilityAI\s*=\s*false/.test(cfg));
});

test('o botão do painel existe e chama o toggle', () => {
    const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    assert.ok(html.includes('id="btn-utility-ai"'));
    assert.ok(html.includes('toggleUtilityAI()'));
    const main = fs.readFileSync(path.join(raiz, 'js', 'main.js'), 'utf8');
    assert.ok(/function toggleUtilityAI\(\)/.test(main));
});

/* ------------------------------------------------------------------
   Execução real do tick.
   ------------------------------------------------------------------ */

function montarGlobais() {
    // O player_utility.js lê window.showPlayerPoints (existe no browser).
    globalThis.window = globalThis.window || {};
    globalThis.avaliarAccao = avaliarAccao;
    globalThis.escolherAccao = escolherAccao;
    globalThis.Curvas = Curvas;
    globalThis.AccoesComBola = AccoesComBola;
    globalThis.AccoesSemBola = AccoesSemBola;

    // O UtilityAI monta o contexto por um PlayerContext; aqui basta que
    // prepare() devolva um contexto com a forma que as acções lêem.
    globalThis.PlayerContext = class {
        constructor(p) { this.p = p; }
        prepare() { return contexto(this.p); }
    };

    /*
    Comportamentos partilhados: no browser são globais de player_bt.js. Aqui
    são extraídos do ficheiro real, não reescritos — se a implementação
    mudar, este teste passa a exercitar a nova.
    */
    const btSrc = fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8');
    const recortar = (nome) => {
        const i = btSrc.indexOf('function ' + nome + '(');
        assert.ok(i >= 0, 'function ' + nome + ' nao encontrada em player_bt.js');
        let nivel = 0;
        for (let k = btSrc.indexOf('{', i); k < btSrc.length; k++) {
            if (btSrc[k] === '{') nivel++;
            else if (btSrc[k] === '}' && --nivel === 0) return btSrc.slice(i, k + 1);
        }
        assert.fail('chavetas desequilibradas em ' + nome);
    };
    (0, eval)(recortar('tratarBolaParada') +
        ';globalThis.tratarBolaParada = tratarBolaParada;');
    (0, eval)(recortar('souODestinatario') +
        ';globalThis.souODestinatario = souODestinatario;');
    // O guarda-redes tem cadeia própria (ver tests/gk_saida.test.js).
    globalThis.tratarGuardaRedes = function () { globalThis._executou = 'tratarGuardaRedes'; };

    globalThis.Match = {
        state: 'PLAY',
        intendedReceiver: null,
        ballCarrier: null,
        ball: { position: { x: 0, y: 0, z: 0 } },
        players: [], opponents: []
    };
}

test('UtilityAI.tick escolhe e executa uma acção, sem rebentar', () => {
    montarGlobais();
    const { UtilityAI } = require('../js/utility/player_utility.js');

    const p = jogador({ z: 10, hasBall: true, estado: 'CARRY' });
    p.role = 'mid';
    globalThis._emZona = false;

    assert.doesNotThrow(() => UtilityAI.tick(p, 1 / 60));
    assert.ok(p.utilityAccao, 'nenhuma accao foi escolhida');
    assert.ok(AccoesComBola.some(a => a.nome === p.utilityAccao),
        'accao escolhida fora do catalogo com bola: ' + p.utilityAccao);
});

test('sem bola escolhe do catálogo sem bola', () => {
    montarGlobais();
    const { UtilityAI } = require('../js/utility/player_utility.js');

    const p = jogador({ z: 10, hasBall: false, estado: 'MOVE_TO_POS' });
    p.role = 'mid';

    UtilityAI.tick(p, 1 / 60);
    assert.ok(p.utilityAccao, 'nenhuma accao foi escolhida');
    assert.ok(AccoesSemBola.some(a => a.nome === p.utilityAccao),
        'accao escolhida fora do catalogo sem bola: ' + p.utilityAccao);
});

test('o relógio de inércia avança a cada tick', () => {
    montarGlobais();
    const { UtilityAI } = require('../js/utility/player_utility.js');

    const p = jogador({ z: 10, hasBall: true, estado: 'CARRY' });
    p.role = 'mid';
    globalThis._emZona = false;

    UtilityAI.tick(p, 0.1);
    const t1 = p.utilityTempoNaAccao;
    UtilityAI.tick(p, 0.1);
    assert.ok(p.utilityTempoNaAccao >= t1, 'o relogio nao avancou');
});

test('fora de PLAY o gate trata o frame e não pontua nada', () => {
    montarGlobais();
    const { UtilityAI } = require('../js/utility/player_utility.js');
    globalThis.Match.state = 'GOAL';

    const p = jogador({ z: 10, hasBall: true, estado: 'CARRY' });
    p.role = 'mid';
    p.utilityAccao = null;

    UtilityAI.tick(p, 1 / 60);
    assert.strictEqual(p.utilityAccao, null, 'nao devia escolher accao fora de PLAY');
    assert.strictEqual(p.fsm.currentState, 'IDLE');
});

/* ------------------------------------------------------------------
   Continuidade: com espaço e sem pressão o portador CONDUZ.

   Os valores do UtilityModel são afinação, mas há uma gama em que deixam
   de ser afinação e viram bug: se o corte do sorteio for baixo, quase tudo
   entra no pool e a escolha passa a ser aleatória ponderada. Como o Utility
   reavalia a 60 fps, uma probabilidade de passe de 27% por frame significa
   passar quase de certeza no primeiro décimo de segundo — o portador nunca
   chega a conduzir. Foi exactamente o que aconteceu com margemTopN 0.15.
   ------------------------------------------------------------------ */

const { escolherAccao: escolher } = require('../js/utility/core.js');

function lerUtilityModel() {
    const cfg = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
    const i = cfg.indexOf('const UtilityModel = {');
    assert.ok(i >= 0);
    const corpo = cfg.slice(i, cfg.indexOf('};', i));
    const num = (chave) => {
        const m = corpo.match(new RegExp(chave + '\\s*:\\s*([0-9.]+)'));
        assert.ok(m, 'UtilityModel sem ' + chave);
        return parseFloat(m[1]);
    };
    return {
        margemTopN: num('margemTopN'),
        tamanhoPool: num('tamanhoPool'),
        inerciaBase: num('inerciaBase'),
        inerciaDecai: num('inerciaDecai')
    };
}

// Scores medidos com o catálogo real (espaço 20m, sem pressão).
const COM_ESPACO = [
    { nome: 'CARRY', score: 0.929 },
    { nome: 'PASS', score: 0.399 },
    { nome: 'HOLD', score: 0.15 }
];

function fraccaoDe(nome, cands, M, tentativas) {
    let n = 0;
    for (let i = 0; i < tentativas; i++) {
        const escolha = escolher(cands.map(c => Object.assign({}, c)),
            M.margemTopN, M.tamanhoPool);
        if (escolha.nome === nome) n++;
    }
    return n / tentativas;
}

test('com espaço livre, o CARRY é escolhido de forma estável', () => {
    const M = lerUtilityModel();
    const f = fraccaoDe('CARRY', COM_ESPACO, M, 5000);
    assert.ok(f > 0.95,
        'CARRY escolhido so ' + (100 * f).toFixed(0) + '% das vezes com 0.93 contra 0.40');
});

test('o portador não larga a bola no primeiro meio segundo', () => {
    const M = lerUtilityModel();
    const porFrame = fraccaoDe('CARRY', COM_ESPACO, M, 5000);
    // 30 frames a 60fps, ignorando a inércia (que só reforça a continuidade)
    const aindaConduz = Math.pow(porFrame, 30);
    assert.ok(aindaConduz > 0.5,
        'apenas ' + (100 * aindaConduz).toFixed(1) + '% de hipotese de ainda conduzir apos 0.5s');
});

test('uma acção muito melhor que as outras não vai a sorteio', () => {
    const M = lerUtilityModel();
    const cands = [{ nome: 'SHOOT', score: 0.9 }, { nome: 'PASS', score: 0.3 }];
    for (let i = 0; i < 200; i++) {
        assert.strictEqual(
            escolher(cands.map(c => Object.assign({}, c)), M.margemTopN, M.tamanhoPool).nome,
            'SHOOT');
    }
});

test('opções realmente parecidas continuam a alternar', () => {
    const M = lerUtilityModel();
    const cands = [{ nome: 'PASS', score: 0.80 }, { nome: 'CARRY', score: 0.78 }];
    const f = fraccaoDe('CARRY', cands, M, 5000);
    assert.ok(f > 0.2 && f < 0.8,
        'com scores quase iguais devia alternar, deu ' + (100 * f).toFixed(0) + '%');
});

test('a inércia dá um bónus positivo que decai com o tempo', () => {
    const M = lerUtilityModel();
    const bonus = (t) => 1 + M.inerciaBase * Math.exp(-t / M.inerciaDecai);
    assert.ok(bonus(0) > 1.0, 'sem bonus inicial nao ha continuidade');
    assert.ok(bonus(0) < 2.0, 'bonus inicial exagerado prende o jogador na accao');
    assert.ok(bonus(3) < 1.05, 'ao fim de 3s o bonus devia ser residual');
    assert.ok(bonus(0) > bonus(1) && bonus(1) > bonus(3), 'devia decair');
});
