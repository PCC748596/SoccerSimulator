/*
=============================================================================
COMEMORAÇÕES DE GOLO — o autor festeja, e os companheiros correm até ele
=============================================================================
Pedido, com sete fotografias de um jogo clássico: *"tem como usar esses keyframes de 1 a 7 para fazer uma das
comemorações de gol?"*. Os quadros 7-5 são a corrida, o 4 é o joelho a ir ao chão, o 3 e o 2 são o deslize de
joelhos com o tronco para trás, e o 1 é de joelhos com os braços no ar.

A corrida não precisa de clip: o jogador corre pela FSM normal (MOVE_TO_POS) até ao ponto de partida do
deslize. O clip é do que vem a seguir — o estado `COMEMORAR` da FSM (fsm.js), que escreve a pose a partir
destes quadros, e o `ComemoracaoGol` (js/comemoracao.js), que sorteia a comemoração, escolhe o sítio e manda os
companheiros.

Os ângulos são os do rig (ver `PedidoDeBola` e o `SlideTackleModel.pose`): coxa/tronco x negativo vai para a
frente; joelho x positivo dobra o calcanhar para trás; ombro z positivo abre o braço esquerdo para fora (e
negativo o direito); ombro x positivo leva o braço para trás. Foram tirados à vista das fotografias, como o
GoalKickClip — afinam-se aqui.
=============================================================================
*/
const ComemoracaoGol = {
    activo: true,
    // Probabilidade de o golo ter comemoração em corrida. Os restantes seguem como sempre (volta ao meio-campo).
    chance: 0.85,
    // As comemorações a sortear, com pesos. Para juntar outra: um novo `tipo` no ComemoracaoGol.sorteio.
    comemoracoes: [{ tipo: 'joelhos', peso: 1.0 }],
    // O estado do jogo não espera mais do que isto (s), aconteça o que acontecer.
    tempoMax: 12.0,

    // Quem corre até ao autor.
    apoio: {
        max: 3,             // companheiros de campo
        raioMax: 38.0,      // só os que estão a menos disto do ponto de chegada
        velocidade: 7.5,    // m/s, a correr
        chegada: 1.6,       // m: a esta distância do ponto, começam a festejar
        festa: 2.4,         // s a festejar depois de chegar
        espalhar: 2.0       // m de raio à volta do ponto onde o autor pára
    },

    joelhos: {
        // A corrida até ao ponto de partida: para o lado da linha lateral mais perto, um pouco para trás.
        corrida: { min: 5.0, max: 12.0, margemLinha: 5.0, recuoDaBaliza: 0.6, velocidade: 7.5, prazo: 6.0 },
        // O deslize em si.
        velocidadeDeslize: 8.5,   // m/s à entrada; cai ao longo do deslize
        tQueda: 0.60,             // quadro 4: vai-se abaixando a correr
        tDeslize: 1.9,            // quadros 3 e 2: desliza de joelhos
        tBracos: 0.45,            // quadro 1: os braços sobem
        tManter: 2.2,             // fica assim
        tLevantar: 0.8,           // e levanta-se
        limiteLateral: 31.0,      // |x| máximo onde pode parar (a linha lateral é 34)
        // As três poses (quadros 4, 3-2 e 1). `k` mistura-as; zero é a de pé.
        pose: {
            // 4: a descer a correr — corpo a baixar, pernas dobradas, tronco ainda em frente, braços soltos.
            queda: {
                pelvisX: 0.10, peitoX: 0.15, pescocoX: -0.05,
                coxaE: -0.75, joelhoE: 1.35, peE: 0.2,
                coxaD: -0.55, joelhoD: 1.55, peD: 0.3,
                bracoEx: 0.45, bracoEz: 0.20, cotoveloE: -0.30,
                bracoDx: 0.45, bracoDz: 0.20, cotoveloD: -0.30
            },
            // 3 e 2: SENTADO NOS CALCANHARES a deslizar (coxa à frente, canela deitada atrás, joelho muito
            // dobrado), tronco levemente para trás, braços ao lado do corpo.
            deslize: {
                pelvisX: 0.0, peitoX: -0.18, pescocoX: -0.08,
                coxaE: -0.90, joelhoE: 2.45, peE: 0.9,
                coxaD: -0.90, joelhoD: 2.45, peD: 0.9,
                bracoEx: 0.25, bracoEz: 0.30, cotoveloE: -0.15,
                bracoDx: 0.25, bracoDz: 0.30, cotoveloD: -0.15
            },
            // 1: ainda sentado nos calcanhares, tronco levemente para trás, braços levantados para cima.
            bracosAcima: {
                pelvisX: 0.0, peitoX: -0.22, pescocoX: -0.20,
                coxaE: -0.90, joelhoE: 2.45, peE: 0.9,
                coxaD: -0.90, joelhoD: 2.45, peD: 0.9,
                bracoEx: -0.15, bracoEz: 2.85, cotoveloE: -0.05,
                bracoDx: -0.15, bracoDz: 2.85, cotoveloD: -0.05
            }
        }
    },

    // Quem corre até ao autor festeja com os braços no ar e saltinhos.
    abraco: {
        bracoZ: 2.55, bracoX: -0.15, cotovelo: -0.10,
        saltoAltura: 0.16, saltoRitmo: 7.0
    }
};
if (typeof window !== 'undefined') window.ComemoracaoGol = ComemoracaoGol;
