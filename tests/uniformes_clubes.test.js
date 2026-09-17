/*
UNIFORMES DOS CLUBES (js/config/uniformes.js + o padrão em js/pose.js).

Até aqui o equipamento era do LADO do campo e não do clube: o `createTeams`
pintava o TeamA de azul e o TeamB de vermelho, escolhesse-se quem se
escolhesse. Os planteis eram reais e os equipamentos não.

Pedido, com fotografias das camisolas:

    Flamengo-RJ     camisa preta e vermelha, calção preto, meião preto e
                    vermelho, número BRANCO
    Fluminense-RJ   camisa tricolor, calção branco, meião branco, número
                    VERDE ESCURO

O que se mede: a tabela diz o que o pedido diz, o padrão pinta barras na
direcção certa (horizontais no Flamengo, verticais no Fluminense), e as três
ligações existem — o `createTeams` a ir buscar o uniforme pelo nome da equipa,
o corpo a receber o desenho, e o número a sair da cor do clube.

Corre com: node --test tests/uniformes_clubes.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const src = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcUni = src('js/config/uniformes.js');
const srcPose = src('js/pose.js');
const srcSetup = src('js/match/match_setup.js');
const srcPlayer = src('js/player.js');

// O config inteiro: é só a tabela e as duas funções, sem THREE nem DOM.
const mod = new Function(`${srcUni}; return { Uniformes, uniformeDe, corDoUniforme };`)();
const { Uniformes, uniformeDe, corDoUniforme } = mod;

// A função do padrão, extraída do pose.js (o resto do ficheiro precisa de THREE).
const iniP = srcPose.indexOf('function pintarPadraoDeEquipamento(');
assert.ok(iniP > 0, 'pintarPadraoDeEquipamento desapareceu do pose.js');
const fimP = srcPose.indexOf(LF + '}', iniP) + 2;
const pintar = new Function(`${srcPose.slice(iniP, fimP)}; return pintarPadraoDeEquipamento;`)();

/*
Um ctx de canvas de mentira: guarda os rectângulos pintados e com que cor. É o
suficiente para medir a DIRECÇÃO das barras e a sequência das cores, que é o
que define um padrão de camisola.
*/
function ctxFalso() {
    const rects = [];
    return {
        fillStyle: null,
        get rects() { return rects; },
        fillRect(x, y, w, h) { rects.push({ x, y, w, h, cor: this.fillStyle }); }
    };
}

/* --- A tabela diz o que o pedido diz ---------------------------------- */

test('Flamengo: faixas vermelhas e negras, calção preto, número branco', () => {
    const u = uniformeDe('Flamengo-RJ');
    assert.ok(u, 'o Flamengo não está na tabela');

    assert.strictEqual(u.camisa.padrao, 'faixas', 'as faixas do Flamengo são horizontais');
    assert.strictEqual(u.camisa.cores.length, 2, 'rubro-negro são duas cores');

    const lum = (hex) => {
        const n = parseInt(hex.slice(1), 16);
        return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    };
    const vermelho = u.camisa.cores.find(c => {
        const n = parseInt(c.slice(1), 16);
        return ((n >> 16) & 255) > 120 && ((n >> 8) & 255) < 90;
    });
    assert.ok(vermelho, `nenhuma das cores (${u.camisa.cores}) é vermelha`);
    const preto = u.camisa.cores.find(c => lum(c) < 0.15);
    assert.ok(preto, `nenhuma das cores (${u.camisa.cores}) é preta`);

    assert.ok(lum(u.calcao) < 0.15, `calção em ${u.calcao} não é preto`);
    // Meião preto E vermelho: padrão, não cor lisa.
    assert.strictEqual(u.meiao.padrao, 'faixas');
    assert.strictEqual(u.meiao.cores.length, 2);

    assert.strictEqual(u.numero.toLowerCase(), '#ffffff', 'o número é branco');
    assert.ok(u.contorno, 'sem contorno o número desaparece na faixa da cor dele');
});

test('Fluminense: tricolor em listras, calção e meião brancos, número verde escuro', () => {
    const u = uniformeDe('Fluminense-RJ');
    assert.ok(u, 'o Fluminense não está na tabela');

    assert.strictEqual(u.camisa.padrao, 'listras', 'o tricolor é em listras verticais');
    assert.strictEqual(u.camisa.cores.length, 3, 'tricolor são TRÊS cores');

    const canal = (hex, i) => (parseInt(hex.slice(1), 16) >> (8 * (2 - i))) & 255;
    const branco = u.camisa.cores.find(c => canal(c, 0) > 220 && canal(c, 1) > 220 && canal(c, 2) > 220);
    const verde = u.camisa.cores.find(c => canal(c, 1) > canal(c, 0) && canal(c, 1) > canal(c, 2));
    const grena = u.camisa.cores.find(c => canal(c, 0) > canal(c, 1) && canal(c, 0) > canal(c, 2));
    assert.ok(branco && verde && grena, `o tricolor não tem as três cores: ${u.camisa.cores}`);

    assert.ok(canal(u.calcao, 0) > 220 && canal(u.calcao, 1) > 220, `calção ${u.calcao} não é branco`);
    assert.ok(canal(u.meiao.cores[0], 1) > 220, `meião ${u.meiao.cores[0]} não é branco`);

    // Verde escuro: verde dominante e escuro.
    const nv = u.numero;
    assert.ok(canal(nv, 1) > canal(nv, 0) && canal(nv, 1) > canal(nv, 2),
        `o número ${nv} não é verde`);
    assert.ok(canal(nv, 1) < 130, `o número ${nv} é verde, mas não escuro`);
});

test('quem não tem desenho continua como estava', () => {
    assert.strictEqual(uniformeDe('ABC-RN'), null);
    assert.strictEqual(uniformeDe(null), null);
    // E a cor que representa o clube é a dominante da camisa.
    assert.strictEqual(corDoUniforme(uniformeDe('Fluminense-RJ'), '#000000'),
        Uniformes['Fluminense-RJ'].camisa.cores[0]);
    assert.strictEqual(corDoUniforme(null, '#3498db'), '#3498db');
});

/* --- O padrão pinta na direcção certa --------------------------------- */

test('faixas são horizontais e listras são verticais', () => {
    const faixas = ctxFalso();
    pintar(faixas, 256, 256, Uniformes['Flamengo-RJ'].camisa, '#000000');
    // Fora o fundo, cada barra ocupa a largura toda e uma fatia da altura.
    const barrasH = faixas.rects.slice(1);
    assert.strictEqual(barrasH.length, Uniformes['Flamengo-RJ'].camisa.divisoes);
    for (const b of barrasH) {
        assert.strictEqual(b.w, 256, 'uma faixa horizontal atravessa a camisola');
        assert.ok(b.h < 256, 'uma faixa horizontal não pode ocupar a altura toda');
    }
    // E alternam as duas cores.
    assert.notStrictEqual(barrasH[0].cor, barrasH[1].cor);
    assert.strictEqual(barrasH[0].cor, barrasH[2].cor);

    const listras = ctxFalso();
    pintar(listras, 256, 256, Uniformes['Fluminense-RJ'].camisa, '#000000');
    const barrasV = listras.rects.slice(1);
    for (const b of barrasV) {
        assert.strictEqual(b.h, 256, 'uma listra vertical atravessa a camisola de cima a baixo');
        assert.ok(b.w < 256, 'uma listra vertical não pode ocupar a largura toda');
    }
    // Três cores a ciclar: a quarta listra repete a primeira.
    assert.strictEqual(barrasV[0].cor, barrasV[3].cor);
    assert.notStrictEqual(barrasV[0].cor, barrasV[1].cor);
    assert.notStrictEqual(barrasV[1].cor, barrasV[2].cor);
});

test('sem barras não fica um pixel vazio entre elas', () => {
    /*
    As barras são arredondadas para pixels inteiros; desenhadas lado a lado sem
    fundo, sobra uma linha de um pixel entre elas — e um pixel transparente numa
    camisola lê-se como uma risca preta. O primeiro rectângulo é o fundo.
    */
    const c = ctxFalso();
    pintar(c, 100, 100, { padrao: 'faixas', cores: ['#aabbcc', '#112233'], divisoes: 7 }, '#000');
    assert.strictEqual(c.rects[0].w, 100);
    assert.strictEqual(c.rects[0].h, 100);

    // E as barras cobrem a peça de ponta a ponta, sem buracos.
    const barras = c.rects.slice(1).sort((a, b) => a.y - b.y);
    assert.strictEqual(barras[0].y, 0);
    let fim = 0;
    for (const b of barras) {
        assert.ok(b.y <= fim, `buraco entre ${fim} e ${b.y}`);
        fim = Math.max(fim, b.y + b.h);
    }
    assert.strictEqual(fim, 100);
});

test('solido é uma cor só', () => {
    const c = ctxFalso();
    pintar(c, 50, 50, Uniformes['Fluminense-RJ'].meiao, '#ff0000');
    assert.strictEqual(c.rects.length, 1);
    assert.strictEqual(c.rects[0].cor, Uniformes['Fluminense-RJ'].meiao.cores[0]);
});

/* --- As ligações existem ---------------------------------------------- */

test('o createTeams vai buscar o uniforme pelo nome da equipa, e poupa o guarda-redes', () => {
    assert.ok(/uniformeDe\(this\.equipaInfoA\.nome\)/.test(srcSetup),
        'o TeamA deixou de ir buscar o uniforme do clube');
    assert.ok(/uniformeDe\(this\.equipaInfoB\.nome\)/.test(srcSetup),
        'o TeamB deixou de ir buscar o uniforme do clube');
    /*
    O guarda-redes veste de outra cor por regra — tem de se distinguir dos dez
    e dos outros onze. Passa-lhe `null`, não o uniforme do clube.
    */
    assert.ok(/\(i === 0\) \? null : uniA/.test(srcSetup) &&
        /\(i === 0\) \? null : uniB/.test(srcSetup),
        'o guarda-redes passou a vestir o equipamento de campo');
});

test('o corpo recebe o uniforme e o número sai da cor do clube', () => {
    assert.ok(/construirCorpo\(corCamisa, corCalcao,\s*\n?\s*this\.aparencia, this\.uniforme\)/.test(srcPlayer),
        'o buildBody deixou de passar o uniforme ao construirCorpo');
    assert.ok(/function construirCorpo\(corCamisa, corCalcao, aparencia, uniforme\)/.test(srcPose),
        'o construirCorpo deixou de aceitar o uniforme');
    assert.ok(/this\.uniforme && this\.uniforme\.numero/.test(srcPlayer),
        'a cor do número já não sai do uniforme');
    assert.ok(/pintarPadraoDeEquipamento\(ctxBack, 512, 512, pecaCamisa/.test(srcPlayer),
        'as costas deixaram de levar o padrão por baixo do número');
});
