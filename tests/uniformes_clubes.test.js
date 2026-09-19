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
const mod = new Function(`${srcUni}; return { Uniformes, uniformeDe, corDoUniforme, UniformeGuardaRedes };`)();
const { Uniformes, uniformeDe, corDoUniforme, UniformeGuardaRedes } = mod;

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

/*
O calção pode ser uma cor ou uma peça com desenho (ver `pecaCalcao` no
construirCorpo): o Fluminense leva barra verde na bainha, e por isso é peça.
*/
const corDoCalcao = (u) => (typeof u.calcao === 'string')
    ? u.calcao : u.calcao.cores[0];

/*
As barras da bainha são pintadas por cima de tudo, no fim — logo são o ÚLTIMO
rectângulo. Para contar as barras do padrão, tira-se o fundo (o primeiro) e a
barra (o último, se a peça tiver uma).
*/
const barrasDoPadrao = (ctx, peca) => {
    const r = ctx.rects.slice(1);
    return (peca && peca.barra) ? r.slice(0, -1) : r;
};

/* --- A tabela diz o que o pedido diz ---------------------------------- */

test('Flamengo: faixas vermelhas e negras, calção branco com barra vermelho e preto, número branco', () => {
    const u = uniformeDe('Flamengo-RJ');
    assert.ok(u, 'o Flamengo não está na tabela');

    assert.strictEqual(u.camisa.padrao, 'faixas', 'as faixas do Flamengo são horizontais');
    assert.strictEqual(u.camisa.cores.length, 2, 'rubro-negro são duas cores');
    // Pedido: cinco faixas, três da primeira cor e duas da segunda.
    assert.strictEqual(u.camisa.divisoes, 5, 'são cinco faixas, 3 + 2');

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

    // Calção branco com barra vermelho e preto (pedido)
    const canal = (hex, i) => (parseInt(hex.slice(1), 16) >> (8 * (2 - i))) & 255;
    const kc = corDoCalcao(u);
    assert.ok(canal(kc, 0) > 220 && canal(kc, 1) > 220, `calção ${kc} não é branco`);

    assert.ok(u.calcao.barra, 'o calção do Flamengo ficou sem a barra');
    const coresBarra = u.calcao.barra.cores || [u.calcao.barra.cor];
    assert.ok(coresBarra.includes(vermelho) && coresBarra.includes(preto),
        `a barra do calção (${coresBarra}) deve ter vermelho e preto`);
    assert.ok(u.calcao.barra.altura > 0 && u.calcao.barra.altura < 0.3,
        `barra de ${u.calcao.barra.altura} da peça é fita ou é meia perna`);

    // As faixas da camisa são todas do mesmo tamanho (sem barra encurtando a última)
    assert.ok(!u.camisa.barra, 'a camisa do Flamengo não deve ter barra para manter as faixas de mesmo tamanho');

    // Meião preto E vermelho: padrão, não cor lisa.
    assert.strictEqual(u.meiao.padrao, 'faixas');
    assert.strictEqual(u.meiao.cores.length, 2);

    assert.strictEqual(u.numero.toLowerCase(), '#ffffff', 'o número é branco');
    assert.ok(u.contorno, 'sem contorno o número desaparece na faixa da cor dele');
});

test('Fluminense: tricolor em listras, calção verde com barra branca, meião branco, número verde escuro', () => {
    const u = uniformeDe('Fluminense-RJ');
    assert.ok(u, 'o Fluminense não está na tabela');

    assert.strictEqual(u.camisa.padrao, 'listras', 'o tricolor é em listras verticais');
    assert.strictEqual(new Set(u.camisa.cores).size, 3, 'tricolor são TRÊS cores');

    const canal = (hex, i) => (parseInt(hex.slice(1), 16) >> (8 * (2 - i))) & 255;
    const branco = u.camisa.cores.find(c => canal(c, 0) > 220 && canal(c, 1) > 220 && canal(c, 2) > 220);
    const verde = u.camisa.cores.find(c => canal(c, 1) > canal(c, 0) && canal(c, 1) > canal(c, 2));
    const grena = u.camisa.cores.find(c => canal(c, 0) > canal(c, 1) && canal(c, 0) > canal(c, 2));
    assert.ok(branco && verde && grena, `o tricolor não tem as três cores: ${u.camisa.cores}`);

    // Calção verde com barra branca (pedido)
    const kc = corDoCalcao(u);
    assert.ok(canal(kc, 1) > canal(kc, 0) && canal(kc, 1) > canal(kc, 2), `calção ${kc} não é verde`);
    assert.ok(u.calcao.barra, 'o calção ficou sem a barra branca');
    assert.ok(canal(u.calcao.barra.cor, 0) > 220 && canal(u.calcao.barra.cor, 1) > 220,
        `a barra do calção (${u.calcao.barra.cor}) não é branca`);
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

test('a contagem das faixas do Flamengo é 3 + 2, e a maioria é preta', () => {
    const u = uniformeDe('Flamengo-RJ');
    const c = ctxFalso();
    pintar(c, 256, 256, u.camisa, '#000000');
    const barras = barrasDoPadrao(c, u.camisa);
    assert.strictEqual(barras.length, 5);

    const contagem = {};
    for (const b of barras) contagem[b.cor] = (contagem[b.cor] || 0) + 1;
    const valores = Object.values(contagem).sort((a, b) => b - a);
    assert.deepStrictEqual(valores, [3, 2], `a contagem das faixas saiu ${valores}`);

    // A que aparece três vezes é a preta.
    const lum = (hex) => {
        const n = parseInt(hex.slice(1), 16);
        return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    };
    const tresVezes = Object.keys(contagem).find(k => contagem[k] === 3);
    assert.ok(lum(tresVezes) < 0.15, `as três faixas são de ${tresVezes}, que não é preto`);
});

test('a cor que representa o clube não é a primeira da camisa, é a dominante', () => {
    /*
    A ordem das cores serve o DESENHO (é ela que dá três faixas pretas); a cor
    do disco da vista táctica é outra coisa — com a primeira, o disco do
    Flamengo ficava preto com contorno preto.
    */
    const u = uniformeDe('Flamengo-RJ');
    assert.notStrictEqual(u.corPrincipal, u.camisa.cores[0]);
    assert.strictEqual(corDoUniforme(u, '#000000'), u.corPrincipal);
    // E sem corPrincipal escrito, continua a cair na primeira cor.
    assert.strictEqual(corDoUniforme({ camisa: { cores: ['#123456'] } }, '#000'), '#123456');
});

test('Grêmio: o desenho do tricolor, em preto, branco e azul claro', () => {
    /*
    Pedido: *"igual à tricolor do Fluminense mas em preto, branco e azul
    claro. Short preto, meião preto"*. "Igual" é sobre o DESENHO, e é isso que
    se fixa aqui: mesmo padrão, mesmos pesos, mesmo número de listras. Se um
    dia os do Fluminense mudarem, este teste manda mudar os dois.
    */
    const g = uniformeDe('Grêmio-RS');
    const f = uniformeDe('Fluminense-RJ');
    assert.ok(g, 'o Grêmio não está na tabela');

    assert.strictEqual(g.camisa.padrao, f.camisa.padrao);
    assert.deepStrictEqual(g.camisa.pesos, f.camisa.pesos);
    assert.strictEqual(g.camisa.divisoes, f.camisa.divisoes);

    const canal = (hex, i) => (parseInt(hex.slice(1), 16) >> (8 * (2 - i))) & 255;
    const lum = (hex) => (0.2126 * canal(hex, 0) + 0.7152 * canal(hex, 1) + 0.0722 * canal(hex, 2)) / 255;

    const preto = g.camisa.cores.find(c => lum(c) < 0.15);
    const branco = g.camisa.cores.find(c => canal(c, 0) > 220 && canal(c, 1) > 220 && canal(c, 2) > 220);
    /*
    O azul tem de ser AZUL e não um cinzento com um ponto a mais no canal do
    azul: o preto #15151a tem b > r e passaria por um teste ingénuo. Pede-se
    uma diferença real entre o azul e o vermelho.
    */
    const azul = g.camisa.cores.find(c => canal(c, 2) - canal(c, 0) > 40);
    assert.ok(preto && branco && azul, `faltam cores em ${g.camisa.cores}`);
    // Azul CLARO: o azul escuro do outro tricolor não serve.
    assert.ok(lum(azul) > 0.35, `o azul ${azul} não é claro`);

    /*
    As duas LARGAS são o preto e o azul, e o branco é o filete entre elas — o
    mesmo papel que tem na camisola do Fluminense.
    */
    const largas = [g.camisa.cores[0], g.camisa.cores[2]];
    assert.ok(largas.includes(preto) && largas.includes(azul),
        'as listras largas do Grêmio deviam ser o preto e o azul');

    // Calção e meião pretos (pedido).
    const kc = (typeof g.calcao === 'string') ? g.calcao : g.calcao.cores[0];
    assert.ok(lum(kc) < 0.15, `calção ${kc} não é preto`);
    assert.ok(lum(g.meiao.cores[0]) < 0.15, `meião ${g.meiao.cores[0]} não é preto`);

    // E o azul é a cor que o representa no disco da vista táctica.
    assert.strictEqual(corDoUniforme(g, '#000000'), azul);
});

/* --- O padrão pinta na direcção certa --------------------------------- */

test('faixas são horizontais e listras são verticais', () => {
    const faixas = ctxFalso();
    pintar(faixas, 256, 256, Uniformes['Flamengo-RJ'].camisa, '#000000');
    // Fora o fundo, cada barra ocupa a largura toda e uma fatia da altura.
    const barrasH = barrasDoPadrao(faixas, Uniformes['Flamengo-RJ'].camisa);
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
    const barrasV = barrasDoPadrao(listras, Uniformes['Fluminense-RJ'].camisa);
    for (const b of barrasV) {
        assert.strictEqual(b.h, 256, 'uma listra vertical atravessa a camisola de cima a baixo');
        assert.ok(b.w < 256, 'uma listra vertical não pode ocupar a largura toda');
    }
    // Ciclo grená, branco, verde, branco: a quinta listra repete a primeira,
    // e o branco aparece intercalado entre as faixas largas.
    assert.strictEqual(barrasV[0].cor, barrasV[4].cor);
    assert.notStrictEqual(barrasV[0].cor, barrasV[1].cor);
    assert.notStrictEqual(barrasV[1].cor, barrasV[2].cor);
    assert.strictEqual(barrasV[1].cor, barrasV[3].cor);
});

test('no tricolor, o grená e o verde são mais largos que o branco', () => {
    /*
    Pedido. O que se mede é a tinta que cada cor apanha na peça, e não os
    rectângulos pintados: com o padrão centrado o deslocamento é circular e
    uma das listras é desenhada em DUAS metades, uma em cada borda — contar
    rectângulos dava larguras médias falsas (medido: 48 contra 59 na mesma
    camisola).
    */
    const peca = Uniformes['Fluminense-RJ'].camisa;
    const grena = peca.cores[0], branco = peca.cores[1], verde = peca.cores[2];

    const W = 512;
    const px = new Array(W).fill(null);
    const ctx = {
        fillStyle: null,
        fillRect(x, y, w) {
            for (let k = Math.max(0, x); k < Math.min(W, x + w); k++) px[k] = this.fillStyle;
        }
    };
    pintar(ctx, W, W, peca, '#000000');

    const tinta = (cor) => px.filter(v => v === cor).length;
    const lG = tinta(grena), lV = tinta(verde), lB = tinta(branco);

    assert.ok(lG > lB * 2, `grená com ${lG} px contra ${lB} do branco`);
    assert.ok(lV > lB * 2, `verde com ${lV} px contra ${lB} do branco`);
    // As duas cores largas ficam com a mesma tinta.
    assert.ok(Math.abs(lG - lV) <= 4, `grená e verde com áreas diferentes (${lG} / ${lV})`);
    // E a camisola fica toda pintada.
    assert.strictEqual(px.filter(v => v === null).length, 0, 'sobraram píxeis por pintar');
});

test('sem pesos, as barras ficam todas iguais', () => {
    // O caminho antigo tem de continuar a dar o passo constante: é o que as
    // faixas do Flamengo usam.
    const c = ctxFalso();
    pintar(c, 500, 500, { padrao: 'faixas', cores: ['#111111', '#222222'], divisoes: 5 }, '#000');
    const alturas = c.rects.slice(1).map(r => r.h);
    for (const h of alturas) assert.strictEqual(h, 100);
});

test('a gola é redonda e pequena, não um V', () => {
    /*
    Pedido: *"a gola V das camisas está muito grande; transforma em gola
    redonda"*. O V era um triângulo com o bico a y=280 — mais de metade da
    altura do tronco. A gola é desenhada dentro do `construirCorpo`, que precisa
    de THREE e de DOM, por isso o que se verifica é o desenho no código.
    */
    const ini = srcPose.indexOf('const RAIO_GOLA');
    assert.ok(ini > 0, 'a gola redonda desapareceu do pose.js');
    const bloco = srcPose.slice(ini, ini + 400);
    assert.ok(/ctxV\.arc\(256, 0, RAIO_GOLA/.test(bloco), 'a gola deixou de ser um arco');
    assert.ok(!/moveTo\(136, 0\)/.test(srcPose), 'o triângulo do decote em V continua lá');

    const raio = parseInt(srcPose.slice(ini).match(/RAIO_GOLA = (\d+)/)[1], 10);
    // A textura do tronco tem 512 px: uma gola que desça mais de um quarto
    // dela é o V outra vez, com outra forma.
    assert.ok(raio > 40 && raio <= 128, `raio da gola de ${raio} px está fora do razoável`);
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

test('a barra é pintada por cima e NA BAINHA, em fracção da peça', () => {
    const peca = { padrao: 'solido', cores: ['#ffffff'], barra: { cor: '#00ff00', altura: 0.2 } };
    for (const lado of [100, 500]) {
        const c = ctxFalso();
        pintar(c, lado, lado, peca, '#000');
        const barra = c.rects[c.rects.length - 1];
        assert.strictEqual(barra.cor, '#00ff00', 'a barra não é o último rectângulo');
        assert.strictEqual(barra.w, lado, 'a barra atravessa a peça');
        // Em baixo: o topo da textura é o ombro (é lá que a gola é desenhada).
        assert.strictEqual(barra.y + barra.h, lado, 'a barra não está na bainha');
        // Em fracção: 20% da peça, seja o canvas de 100 ou de 500.
        assert.strictEqual(barra.h, Math.round(lado * 0.2));
    }
});

test('o calção com desenho passa a ser uma peça, e sem desenho continua a ser uma cor', () => {
    // Fluminense e Flamengo levam barra: são peça (objeto). Grêmio é preto liso: é string.
    assert.strictEqual(typeof Uniformes['Fluminense-RJ'].calcao, 'object');
    assert.strictEqual(typeof Uniformes['Flamengo-RJ'].calcao, 'object');
    assert.strictEqual(typeof Uniformes['Grêmio-RS'].calcao, 'string');
    // E o construirCorpo trata os dois casos (um calção de uma cor não gasta textura).
    assert.ok(/const pecaCalcao = \(UNI && UNI\.calcao && typeof UNI\.calcao === 'object'\)/.test(srcPose),
        'o construirCorpo deixou de aceitar o calção como peça');
    assert.ok(/pintarPadraoDeEquipamento\(cvsK\.getContext\('2d'\)/.test(srcPose),
        'o calção com desenho não é pintado');
});

test('as tricolores têm 12 listras, com uma LARGA alinhada no meio', () => {
    /*
    Pedido: *"ajusta as camisas tricolores para 12 listras mas com uma grossa
    alinhada no meio da camisa"*. É como uma camisola às riscas se desenha: a
    listra central no eixo do peito, e as outras a crescer para os dois lados.

    Mede-se a PINTURA e não o config: o que interessa é o pixel do meio da
    textura cair dentro de uma barra larga cujo centro é o centro da peça.
    Aqui o ctx falso pinta uma linha de píxeis, que é o que um padrão vertical
    precisa.
    */
    const W = 512;
    const pintarLinha = (peca) => {
        const px = new Array(W).fill(null);
        const ctx = {
            fillStyle: null,
            fillRect(x, y, w) {
                for (let k = Math.max(0, x); k < Math.min(W, x + w); k++) px[k] = this.fillStyle;
            }
        };
        pintar(ctx, W, W, peca, '#000000');
        return px;
    };
    const segmentos = (px) => {
        const out = [];
        let cor = px[0], ini = 0;
        for (let k = 1; k <= W; k++) {
            if (k === W || px[k] !== cor) { out.push({ cor, ini, fim: k, larg: k - ini }); cor = px[k]; ini = k; }
        }
        return out;
    };

    for (const nome of ['Fluminense-RJ', 'Grêmio-RS']) {
        const peca = uniformeDe(nome).camisa;
        assert.strictEqual(peca.divisoes, 12, `${nome}: pediram-se 12 listras`);
        assert.strictEqual(peca.centrada, true, `${nome}: a listra do meio não está centrada`);

        const px = pintarLinha(peca);
        assert.strictEqual(px.filter(v => v === null).length, 0,
            `${nome}: o deslocamento deixou a camisola por pintar`);

        const segs = segmentos(px);
        const central = segs.find(g => g.ini <= W / 2 && g.fim > W / 2);
        assert.ok(central, `${nome}: nada cobre o meio da camisola`);

        // A do meio é uma das LARGAS: mais larga do que a média.
        const maisLarga = Math.max(...segs.map(g => g.larg));
        assert.ok(central.larg >= maisLarga * 0.9,
            `${nome}: a listra do meio tem ${central.larg} px e a mais larga tem ${maisLarga}`);
        // E está mesmo centrada: o meio dela é o meio da peça.
        assert.ok(Math.abs((central.ini + central.fim) / 2 - W / 2) <= 1,
            `${nome}: a listra do meio está em ${(central.ini + central.fim) / 2}, e o meio é ${W / 2}`);

        /*
        O deslocamento é circular, portanto UMA das doze listras fica partida
        entre as duas bordas — as duas metades da mesma. É por isso que se
        contam 13 segmentos e não 12.
        */
        assert.strictEqual(segs.length, 13, `${nome}: ${segs.length} segmentos, esperados 13`);
        assert.strictEqual(segs[0].cor, segs[segs.length - 1].cor,
            `${nome}: as duas bordas deviam ser as metades da mesma listra`);
    }
});

/* --- As ligações existem ---------------------------------------------- */

test('o createTeams vai buscar o uniforme pelo nome da equipa, e poupa o guarda-redes', () => {
    assert.ok(/uniformeDe\(this\.equipaInfoA\.nome\)/.test(srcSetup),
        'o TeamA deixou de ir buscar o uniforme do clube');
    assert.ok(/uniformeDe\(this\.equipaInfoB\.nome\)/.test(srcSetup),
        'o TeamB deixou de ir buscar o uniforme do clube');
    /*
    O guarda-redes veste de outra cor por regra — tem de se distinguir dos dez
    e dos outros onze. Leva o uniforme DELE (manga comprida, sem cores), e não
    o do clube.
    */
    assert.ok(/\(i === 0\) \? uniGK : uniA/.test(srcSetup) &&
        /\(i === 0\) \? uniGK : uniB/.test(srcSetup),
        'o guarda-redes passou a vestir o equipamento de campo');
});

test('o guarda-redes veste manga comprida, e nada mais lhe muda', () => {
    /*
    Pedido: *"ajusta a camisa do goleiro para manga comprida"*. O uniforme dele
    é quase vazio de propósito — sem `camisa` nem `calcao`, as cores continuam
    a ser as que o `createTeams` lhe passa (amarelo de um lado, laranja do
    outro) e o número continua a sair do LADO.
    */
    assert.ok(UniformeGuardaRedes, 'o uniforme do guarda-redes desapareceu');
    assert.strictEqual(UniformeGuardaRedes.mangaComprida, true);
    assert.strictEqual(UniformeGuardaRedes.camisa, undefined,
        'o uniforme do guarda-redes não pode impor cores de camisola');
    assert.strictEqual(UniformeGuardaRedes.calcao, undefined);
    // E a cor que o representa continua a ser a que lhe é passada.
    assert.strictEqual(corDoUniforme(UniformeGuardaRedes, '#f1c40f'), '#f1c40f');
});

test('a manga comprida cobre o braço todo e dobra com o cotovelo', () => {
    /*
    A manga é geometria dentro do `criarBraco` (pose.js), que precisa de THREE
    e de DOM — o que se verifica é o desenho no código. As duas coisas que
    importam: a manga de cima cresce de 0.5 para 1.0 (o braço inteiro), e a de
    baixo é filha do ANTEBRAÇO e não do cotovelo, senão atravessava o braço
    quando ele dobra.
    */
    assert.ok(/const alturaManga = mangaComprida \? 1\.0 : 0\.5;/.test(srcPose),
        'a manga comprida deixou de cobrir o braço de cima inteiro');
    assert.ok(/if \(mangaComprida\) \{[\s\S]{0,400}low\.add\(mangaBaixo\);/.test(srcPose),
        'a manga do antebraço não está pendurada no antebraço');
    assert.ok(/const mangaComprida = !!\(UNI && UNI\.mangaComprida\);/.test(srcPose),
        'o construirCorpo deixou de ler a bandeira da manga');
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
