/*
=============================================================================
AS QUATRO ROTINAS DA FALTA QUE NAO E DIRECTA — FK2, FK3, FK5, FK6
=============================================================================
Pedido, com quatro diagramas de treino ("Attacking Free Kick" 2, 3, 5 e 6):
circulo preto = atacante, amarelo = guarda-redes que ataca, azul claro = a
barreira, branco = o guarda-redes que defende, tracejado = o movimento um pouco
antes da cobranca, seta vermelha = a cobranca (trajecto da bola), setas brancas
= passes, circulos verdes = ALVOS para receber o passe ou rematar.

Cada rotina e escrita no referencial do DIAGRAMA, em metros, a partir da leitura
das imagens (a escala sai da area de 6 jardas: 5.9 px/m nos dois eixos):

    x   lateral, positivo para a direita do diagrama; a bola esta sempre do lado
        ESQUERDO (x < 0). O motor espelha tudo quando a falta e do outro lado.
    z   distancia a linha de fundo adversaria, em direccao ao meio-campo.

Um lugar pode ser ABSOLUTO ({ x, z }, o sitio no campo) ou RELATIVO A BOLA
({ rel: true, dx, dz }, `dz` positivo = em direccao a baliza). Quem esta ao lado
da bola (o batedor e os que o ajudam) e relativo, para o desenho se manter
qualquer que seja o ponto da falta; a area e absoluta.

OS NUMEROS 2 A 11 sao os das imagens. O 1 (guarda-redes) nao se mexe. Cada numero
e atribuido ao jogador que melhor lhe serve (`preferencia`: o grupo de posicao
por ordem) e mais perto do lugar. O batedor (`batedor`) e sempre o que o
`batedorDaFalta` ja tinha escolhido.

`opcoes` sao os desfechos sorteados (`peso`). Cada passo diz quem faz o que:

    passe        o `de` joga ao `para` (no ponto `alvo`, que e o lugar da corrida dele)
    cruzamento   o `de` cruza para a area (a balistica do mini-canto, ver
                 cruzamentoDeFalta em utils.js)
    remate       o `de` remata de primeira

`espera` e o tempo (s) que o `de` segura a bola antes do gesto; o primeiro passo
e o do batedor e sai no contacto do gesto de bola parada. `corridas` e o tracejado:
quem corre para onde, a partir do `FaltaRotinas.tempoCorrida` antes da cobranca.
`depois` sao movimentos que arrancam quando o passo `apos` sai.

A defesa (`barreira` homens, `defesa` = faixa do resto) e a outra metade do
pedido: os que sobram da barreira marcam os atacantes da area (ver
Match.marcarAtacantesNaRotina).
=============================================================================
*/
const FaltaRotinas = {
    activo: true,
    // So se sorteia quando a bola esta entre estas distancias da linha de fundo adversaria (m).
    zMin: 15.0,
    zMax: 42.0,
    // Falta pela ala: |x| a partir do qual se usa a rotina "wide".
    alaX: 14.0,
    // Segundos antes da cobranca em que o tracejado arranca.
    tempoCorrida: 1.6,
    // Velocidade das corridas tracejadas (m/s).
    velCorrida: 5.5,
    // Quem marca fica deste lado do atacante, em direccao a baliza (m).
    folgaMarcacao: 1.1,
    // So se marcam os atacantes a menos disto da linha de fundo (m).
    marcaAteZ: 24.0,
    // Prazo de cada passo da cadeia (s): se a bola nao chega, a rotina acaba.
    prazoPasso: 5.0,
    // O grupo de posicao preferido de cada numero (por ordem).
    preferencia: {
        2: ['lat', 'mc'], 3: ['lat', 'ml', 'mc'], 4: ['cb'], 5: ['cb'], 6: ['mc', 'cb'],
        7: ['ml', 'mc'], 8: ['mc', 'ml'], 9: ['ata'], 10: ['ata', 'mc'], 11: ['ml', 'ata', 'mc']
    },
    // Quem se atribui primeiro (os decisivos antes dos que enchem).
    ordemDeAtribuicao: [9, 10, 4, 5, 3, 11, 7, 8, 6, 2],

    rotinas: [
        /*
        FK2 — WIDE. A bola esta na ala, a ~20 m da linha de fundo. Duas opcoes:
        1) o 3 corre cedo e o 7 joga-lhe pela linha para ele cruzar; 2) o 10 corre
        em quadrado e o 7 joga-lhe a bola, para ele rematar ou meter no 3.
        Os 4, 5, 6 e 9 atacam a area ("opposition expecting long deep cross").
        */
        {
            nome: 'fk2_wide',
            tipo: 'wide',
            bola: { x: -21.4, z: 20.3 },
            batedor: 7,
            barreira: 2,
            defesa: { de: 9.15, ate: 22.0 },
            lugares: {
                3: { rel: true, dx: -3.6, dz: -1.0 },
                7: { rel: true, dx: -0.7, dz: -3.1 },
                9: { x: 3.4, z: 13.9 },
                6: { x: 6.9, z: 13.9 },
                5: { x: 10.7, z: 13.9 },
                4: { x: 13.6, z: 12.7 },
                10: { x: 18.6, z: 15.4 },
                11: { rel: true, dx: 17.3, dz: -0.4 },
                8: { rel: true, dx: 16.3, dz: -12.8 },
                2: { rel: true, dx: 25.1, dz: -17.2 }
            },
            opcoes: [
                {
                    peso: 0.6,
                    corridas: {
                        3: { x: -22.4, z: 10.2 },
                        9: { x: 5.0, z: 8.0 }, 6: { x: 9.0, z: 8.5 }, 5: { x: 13.0, z: 8.5 },
                        4: { x: 16.0, z: 9.0 }, 10: { x: 19.0, z: 10.5 }
                    },
                    passos: [
                        { de: 7, tipo: 'passe', para: 3, alvo: { x: -22.4, z: 10.2 } },
                        { de: 3, tipo: 'cruzamento', espera: 0.25 }
                    ]
                },
                {
                    peso: 0.4,
                    corridas: {
                        3: { x: -22.4, z: 10.2 },
                        10: { x: -1.9, z: 14.2 }
                    },
                    passos: [
                        { de: 7, tipo: 'passe', para: 10, alvo: { x: -1.9, z: 14.2 } },
                        { de: 10, tipo: 'remate', espera: 0.3 }
                    ]
                }
            ]
        },

        /*
        FK3 — CENTRAL, "TRIPLE". O 9 joga ao 11, que PARA a bola (o circulo verde
        a direita da bola); o 10 corre por cima dela e finge o remate; o 9 faz o
        lacete a volta e o 11 arrasta a bola para tras para o 9 rematar. O 4 puxa
        a barreira e depois descola ("pulls and leans in the wall and then peels
        off"); 5, 7 e 8 vao ao ressalto ("follow up hard for rebound").
        */
        {
            nome: 'fk3_triple',
            tipo: 'central',
            bola: { x: -5.4, z: 27.3 },
            batedor: 9,
            barreira: 4,
            defesa: { de: 9.15, ate: 20.0 },
            lugares: {
                9: { rel: true, dx: -4.9, dz: 0.0 },
                11: { rel: true, dx: 2.7, dz: 0.0 },
                10: { rel: true, dx: -0.2, dz: -2.9 },
                4: { x: -0.3, z: 17.8 },
                3: { rel: true, dx: -16.1, dz: 0.5 },
                7: { x: 9.5, z: 17.8 },
                5: { x: 12.0, z: 15.3 },
                8: { x: 15.4, z: 15.3 },
                2: { rel: true, dx: 9.4, dz: -10.3 },
                6: { rel: true, dx: 0.8, dz: -21.0 }
            },
            opcoes: [
                {
                    peso: 1.0,
                    corridas: {
                        4: { x: -2.5, z: 12.4 },
                        3: { x: -19.8, z: 13.6 },
                        7: { x: 8.1, z: 8.1 }, 5: { x: 10.0, z: 8.5 }, 8: { x: 12.4, z: 9.0 },
                        11: { rel: true, dx: 6.6, dz: 0.8 }
                    },
                    passos: [
                        { de: 9, tipo: 'passe', para: 11, alvo: { rel: true, dx: 6.6, dz: 0.8 } },
                        { de: 11, tipo: 'passe', para: 9, alvo: { rel: true, dx: 4.4, dz: -3.3 }, espera: 0.35 },
                        { de: 9, tipo: 'remate', espera: 0.2 }
                    ],
                    depois: [
                        // O 10 passa por cima da bola e finge; o 9 faz o lacete a volta e fica atras do 11.
                        { apos: 0, quem: 10, alvo: { rel: true, dx: 1.5, dz: 1.2 } },
                        { apos: 0, quem: 9, alvo: { rel: true, dx: 4.4, dz: -3.3 } }
                    ]
                }
            ]
        },

        /*
        FK5 — CENTRAL, "OVER THE HILL". O 7 ou o 10 pica a bola por cima da
        barreira para o 9 e o 11, que tentam finalizar nos circulos verdes. O 3
        procura a bola por fora ("or to pull someone out"); o 4, 8 e 5 ocupam a
        entrada da area para o ressalto.
        */
        {
            nome: 'fk5_over_the_hill',
            tipo: 'central',
            bola: { x: -5.8, z: 27.5 },
            batedor: 7,
            barreira: 4,
            defesa: { de: 9.15, ate: 18.0 },
            lugares: {
                7: { rel: true, dx: -1.8, dz: -2.0 },
                10: { rel: true, dx: 1.6, dz: -2.7 },
                9: { x: 0.5, z: 18.0 },
                11: { x: -11.0, z: 18.0 },
                4: { x: 7.8, z: 18.0 },
                8: { x: 11.2, z: 16.6 },
                5: { x: 15.3, z: 15.0 },
                3: { rel: true, dx: -16.6, dz: 0.4 },
                2: { rel: true, dx: 8.8, dz: -10.0 },
                6: { rel: true, dx: 0.8, dz: -20.8 }
            },
            opcoes: [
                {
                    peso: 1.0,
                    corridas: {
                        11: { x: -7.3, z: 10.2 },
                        9: { x: -2.5, z: 11.7 },
                        3: { x: -20.5, z: 13.6 },
                        5: { x: 13.5, z: 9.0 }
                    },
                    passos: [
                        { de: 7, tipo: 'passe', para: 9, alvo: { x: -2.5, z: 11.7 }, picado: true }
                    ],
                    depois: []
                }
            ]
        },

        /*
        FK6 — CENTRAL, "CROSSFIRE/KEYHOLE". O 8 finge o remate e roda a bola
        para o lado; o 11 pára-a para o 9 rematar (vem de tras) ou deixa-a rolar
        para o 10, que sobe ao circulo verde e remata. 4 perturba a barreira;
        5 e 7 seguem o remate para o ressalto ("start position is wide to leave
        space for shots").
        */
        {
            nome: 'fk6_crossfire',
            tipo: 'central',
            bola: { x: -7.8, z: 27.6 },
            batedor: 8,
            barreira: 4,
            defesa: { de: 9.15, ate: 20.0 },
            lugares: {
                8: { rel: true, dx: -2.7, dz: 0.0 },
                11: { rel: true, dx: 5.9, dz: 0.0 },
                9: { rel: true, dx: 3.6, dz: -7.6 },
                10: { rel: true, dx: 14.7, dz: -9.3 },
                4: { x: -11.9, z: 17.8 },
                7: { x: 13.2, z: 16.9 },
                5: { x: 16.6, z: 14.6 },
                3: { rel: true, dx: -13.7, dz: 0.8 },
                2: { rel: true, dx: 12.0, dz: -16.5 },
                6: { rel: true, dx: 3.2, dz: -20.7 }
            },
            opcoes: [
                {
                    peso: 0.5,
                    corridas: {
                        9: { rel: true, dx: 3.0, dz: -3.5 },
                        4: { x: -7.0, z: 12.5 }, 7: { x: 10.5, z: 10.0 }, 5: { x: 13.5, z: 9.5 }
                    },
                    passos: [
                        { de: 8, tipo: 'passe', para: 11, alvo: { rel: true, dx: 5.9, dz: 0.0 } },
                        { de: 11, tipo: 'passe', para: 9, alvo: { rel: true, dx: 3.0, dz: -3.5 }, espera: 0.3 },
                        { de: 9, tipo: 'remate', espera: 0.1 }
                    ]
                },
                {
                    peso: 0.5,
                    corridas: {
                        10: { rel: true, dx: 14.7, dz: -0.2 },
                        4: { x: -7.0, z: 12.5 }, 7: { x: 10.5, z: 10.0 }, 5: { x: 13.5, z: 9.5 }
                    },
                    passos: [
                        { de: 8, tipo: 'passe', para: 11, alvo: { rel: true, dx: 5.9, dz: 0.0 } },
                        { de: 11, tipo: 'passe', para: 10, alvo: { rel: true, dx: 14.7, dz: -0.2 }, espera: 0.3 },
                        { de: 10, tipo: 'remate', espera: 0.1 }
                    ]
                }
            ]
        }
    ]
};
if (typeof window !== 'undefined') window.FaltaRotinas = FaltaRotinas;

/*
O PONTO DE UM LUGAR DO DIAGRAMA NO CAMPO. `lado` = 1 se o diagrama fica como esta (bola a x
negativo) e -1 se se espelha; `bola` e a bola real; `attDir` o sentido de ataque (+1/-1).
Puro: serve para medir e testar sem montar um jogo.
*/
function pontoDaRotina(lugar, bola, attDir, lado, campoComp, campoLarg) {
    const meiaComp = campoComp / 2, limX = campoLarg / 2 - 1.5, limZ = meiaComp - 1.5;
    let x, z;
    if (lugar.rel) {
        x = bola.x + lado * lugar.dx;
        z = bola.z + attDir * lugar.dz;
    } else {
        x = lado * lugar.x;
        z = attDir * (meiaComp - lugar.z);
    }
    return {
        x: Math.max(-limX, Math.min(limX, x)),
        z: Math.max(-limZ, Math.min(limZ, z))
    };
}

// O lado do espelho: o diagrama tem a bola a x negativo.
function ladoDaRotina(bolaX) {
    return (bolaX > 0.001) ? -1 : 1;
}

/*
QUEM E CADA NUMERO. `jogadores` sao os que sobram (sem o guarda-redes e sem o batedor, que ja tem o
numero `rotina.batedor`); `pontoDe(n)` devolve o lugar de cada numero. Devolve { numero: jogador }.
Cada numero escolhe, entre os que ficam, o de melhor grupo (por `preferencia`) e depois o mais perto.
*/
function atribuirNumerosDaRotina(rotina, batedor, jogadores, pontoDe, grupoDe, cfg) {
    const livres = jogadores.filter(p => p && p !== batedor);
    const saida = {};
    saida[rotina.batedor] = batedor;
    for (const n of cfg.ordemDeAtribuicao) {
        if (n === rotina.batedor || !rotina.lugares[n] || !livres.length) continue;
        const alvo = pontoDe(n);
        const prefs = cfg.preferencia[n] || [];
        let melhor = -1, melhorNota = Infinity;
        for (let i = 0; i < livres.length; i++) {
            const p = livres[i];
            const g = grupoDe(p);
            const k = prefs.indexOf(g);
            const nota = (k < 0 ? 100 : k * 20) +
                Math.hypot(p.model.position.x - alvo.x, p.model.position.z - alvo.z) * 0.1;
            if (nota < melhorNota) { melhorNota = nota; melhor = i; }
        }
        saida[n] = livres.splice(melhor, 1)[0];
    }
    return saida;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FaltaRotinas, pontoDaRotina, ladoDaRotina, atribuirNumerosDaRotina };
}
