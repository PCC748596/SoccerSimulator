/*
=============================================================================
CIDADE — 500 m x 500 m à volta do estádio
=============================================================================
Pedido: *"cria uma cidade de 500mx500m em torno do estádio, com casas,
prédios, ruas, avenidas, paradas de ônibus, metrô, passarelas de pedestres,
estacionamentos em torno do estádio, faixas de pedestres, calçadas, postes"*.

A construção está em js/cidade.js; aqui ficam só os números. O estádio é o da
bancada em dois anéis (BancadaAneis), centrado em (0, 0), e a sua pegada
exterior é a de `estadio` — medida nas contas do createField:

    lateral   BANCADA_X (46) + 35 m do segundo anel + 0.6 m de parede  = 81.6
    fundo     BANCADA_Z (65) + 35 m do segundo anel + 0.6 m de parede  = 100.6

A PLANTA (x lateral, z ao longo do campo; todas as medidas em metros):

    - uma esplanada de betão e, por cima, os estacionamentos, até à avenida de
      contorno (|x| < 123, |z| < 133);
    - a avenida de contorno (x = +-135 e z = +-145), de 24 m com canteiro;
    - quarteirões de casas e prédios para lá dela, até aos 250 m;
    - o metro elevado corre pela avenida z = 200, com a estação em x = 0.

Uma `via` corre ao longo de `eixo` ('z': x constante; 'x': z constante), no
centro `c`, de `a` a `b`. Largura 24 = avenida (canteiro central, 4 faixas);
largura 12 = rua. As vias que não atravessam o estádio vêm em duas metades.
=============================================================================
*/
const CidadeConfig = {
    ativa: true,
    semente: 5150,
    meia: 250,                       // 500 m de lado

    estadio: { meiaX: 82.5, meiaZ: 101.5 },
    // Limite interior da avenida de contorno: dentro dele é esplanada.
    esplanada: { meiaX: 123, meiaZ: 133 },

    /*
    FACHADA — a casca metálica que embrulha as bancadas, como na fotografia de
    referência: cantos redondos, bojo a meio da altura, e bandas horizontais
    em dois tons. A cobertura não muda; a casca fecha-se contra a aresta dela.

    O contorno é o das bancadas: rectas entre quatro arcos de centros
    (+-centroX, +-centroZ) — BANCADA_X - RAIO_PRIMEIRA_FILA e BANCADA_Z -
    RAIO_PRIMEIRA_FILA do createField — e raio `raio` (o do fim do segundo
    anel mais a parede). `perfil` é [afastamento da parede (m), altura (m)].
    */
    fachada: {
        ativa: true,
        centroX: 39.5, centroZ: 58.5, raio: 42.2,
        perfil: [[1.3, 5.5], [2.0, 8], [2.6, 12], [2.8, 15], [2.5, 19], [1.7, 24], [0.9, 27], [0.1, 27.8]],
        // A casca NÃO desce ao chão: o vão livre de baixo (m) é por onde passa a torcida; as colunas seguram-na.
        vao: 5.5, passoColunas: 8, portoes: 12, corColuna: 0x4a4f57,
        passoBanda: 0.55, relevo: 0.1,
        corClara: 0xd2dae3, corEscura: 0x8794a6, corBase: 0x5d6673
    },
    // Árvores em canteiros na esplanada, em anel à volta da fachada.
    arvoresEsplanada: { recuo: 5.4, passo: 9 },

    larguraAvenida: 24,
    larguraRua: 12,

    // Níveis (m). O asfalto é o chão da cidade; tudo o resto assenta por cima.
    yTerra: -0.3,
    yAsfalto: -0.12,
    alturaCalcada: 0.15,
    alturaLote: 0.20,
    calcada: 3.0,                    // faixa de passeio de cada quarteirão
    alturaPiso: 3.2,                 // um piso; a textura das janelas conta com isto

    vias: [
        // Vias que correm ao longo de z (x constante)
        { eixo: 'z', c: -195, w: 12, a: -250, b: 250 },
        { eixo: 'z', c: -135, w: 24, a: -250, b: 250 },
        { eixo: 'z', c: -65, w: 12, a: -250, b: -133 },
        { eixo: 'z', c: -65, w: 12, a: 133, b: 250 },
        { eixo: 'z', c: 0, w: 24, a: -250, b: -133 },
        { eixo: 'z', c: 0, w: 24, a: 133, b: 250 },
        { eixo: 'z', c: 65, w: 12, a: -250, b: -133 },
        { eixo: 'z', c: 65, w: 12, a: 133, b: 250 },
        { eixo: 'z', c: 135, w: 24, a: -250, b: 250 },
        { eixo: 'z', c: 195, w: 12, a: -250, b: 250 },
        // Vias que correm ao longo de x (z constante)
        { eixo: 'x', c: -200, w: 12, a: -250, b: 250 },
        { eixo: 'x', c: -145, w: 24, a: -250, b: 250 },
        { eixo: 'x', c: 145, w: 24, a: -250, b: 250 },
        { eixo: 'x', c: 200, w: 24, a: -250, b: 250, metro: true },
        { eixo: 'x', c: -75, w: 12, a: -250, b: -123 },
        { eixo: 'x', c: -75, w: 12, a: 123, b: 250 },
        { eixo: 'x', c: 0, w: 24, a: -250, b: -123 },
        { eixo: 'x', c: 0, w: 24, a: 123, b: 250 },
        { eixo: 'x', c: 75, w: 12, a: -250, b: -123 },
        { eixo: 'x', c: 75, w: 12, a: 123, b: 250 }
    ],

    // Passarelas sobre a avenida de contorno: (x, z) do centro e o eixo que atravessam.
    passarelas: [
        { x: 135, z: 40, ao: 'x' },
        { x: -135, z: -40, ao: 'x' },
        { x: 45, z: 145, ao: 'z' },
        { x: -45, z: -145, ao: 'z' }
    ],
    passarela: {
        altura: 6.0, largura: 3.6, rampa: 18, folgaAteAvenida: 1.8,
        cor: 0xb9bcc0, corParapeito: 0x8e9399
    },

    metro: {
        // O viaduto elevado corre ao longo da via marcada `metro`.
        alturaTopo: 10.2, larguraTabuleiro: 9.6, espessura: 1.2,
        passoPilares: 24, estacaoX: 0, estacaoComp: 72, estacaoLarg: 14,
        trens: 2, carros: 4,
        // O comboio chega a `velocidade` m/s, trava a `freada` m/s2 até parar com o centro na
        // estação, fica `paragem` s de portas abertas e arranca a `aceleracao` m/s2.
        velocidade: 26, freada: 1.8, aceleracao: 1.5, paragem: 10,
        // Bocas de metro subterrâneas na esplanada
        bocas: [
            { x: 86.5, z: 0 }, { x: -86.5, z: 0 },
            { x: 0, z: 106 }, { x: 0, z: -106 }
        ]
    },

    estacionamento: {
        // Faixa de passeio entre o estacionamento e a avenida de contorno.
        margemAvenida: 4.0,
        // Recuo do estacionamento a partir da pegada do estádio.
        recuoEstadio: 7.5,
        profundidadeVaga: 5.0, larguraVaga: 2.6, corredor: 6.0,
        ocupacao: 0.62
    },

    postes: { altura: 8.5, passoRua: 18, passoAvenida: 26, passoEstacionamento: 26, alturaEstac: 9.5 },
    arvores: { passo: 16 },
    // Táxis e ônibus páram nas paradas das avenidas e deixam subir e descer gente.
    transito: {
        carros: 240, taxis: 14, onibus: 18, velMin: 7, velMax: 13, velOnibus: 9,
        freada: 2.2, acel: 1.8, paradaOnibus: 9, paradaTaxi: 7
    },

    // A gente a circular (js/cidade_gente.js).
    gente: {
        ativa: true, total: 500,
        velMin: 1.0, velMax: 1.6,
        filasIniciais: 130,        // quantos já começam nas filas dos portões
        pessoasPorFila: [3, 5],    // comprimento inicial de cada fila
        servicoCatraca: [60, 100],    // s por pessoa a passar
        tempoNoEstadio: [40, 160], // s lá dentro
        tempoNoMetro: [10, 30],
        tempoNoCarro: [25, 70]
    },

    cores: {
        asfalto: 0x3a3e44, terra: 0x6f9152, calcada: 0xb9b8b0, esplanada: 0xcfccc3,
        estacionamento: 0x34383e, relva: 0x5e9a4a, canteiro: 0x9a9a94,
        faixa: 0xf2f2ee, amarela: 0xe8b923, gramaLote: 0x6aa84f, piso: 0xaaa9a3
    },
    paredesCasa: [0xf1e3c3, 0xe9c9a0, 0xd9e4e8, 0xf4efe6, 0xc7d8b4, 0xe8b9a6, 0xf2d58a],
    telhados: [0xb5532f, 0x9a4a30, 0x7a7f86, 0x6b4a3a],
    paredesPredio: [0xd8d4cb, 0xbfc7cf, 0xe3d3b8, 0xa9b6c4, 0xcfd6d0, 0xd9c2b0],
    carros: [0xd8d8d8, 0x202428, 0xb02a2a, 0x2f4f8a, 0x8a8f94, 0xe8e3d4, 0x2f6b4a, 0xd49a1c]
};
if (typeof window !== 'undefined') window.CidadeConfig = CidadeConfig;
