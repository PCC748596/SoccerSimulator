/*
=============================================================================
O TUNEL DOS JOGADORES E A ABERTURA DO JOGO
=============================================================================
Pedido: *"vamos criar um tunel no centro da arquibancada que vai dar acesso ao campo. Ao carregar a pagina, os
jogadores vao ingressar no campo pelo tunel. O juiz (com a bola na mao) e os 2 bandeirinhas na frente e os 2
times em 2 filas indianas acompanhando o trio. Vao formar uma fila com um time de um lado, o trio no meio e o
outro time do outro. Fica 10 s depois de todos alinhados; depois vao para as posicoes de inicio de jogo. Se ESC
for premido muda direto para a formacao inicial que temos hoje."*

ONDE: na arquibancada LATERAL do lado -X (a do lado oposto a camara TV Centro, que fica em +X: ve-os sair
de frente), no centro (z = 0), que e onde ja ha o corredor da bancada. O tunel e um corte nos primeiros
`degrausCortados` degraus da bancada (ver createField, match_setup.js) mais uma caixa de paredes, tecto e fundo
escuros (js/tunel.js).

A ABERTURA (js/abertura.js) corre uma so vez, ao carregar a pagina:

    entrada   o trio sai a andar, e depois os dois times em duas filas indianas (um par de cada vez);
    fila      todos de frente para o campo: o trio ao centro e um time de cada lado;
    espera    `esperaAlinhados` s depois de o ultimo chegar ao lugar;
    saida     o jogo volta ao estado 'GOAL' (a mesma caminhada para as posicoes de saida de bola que existe
              depois de um golo) e o pontape de saida acontece quando chegam.

ESC em qualquer altura salta direto para a formacao inicial de sempre.
=============================================================================
*/
const TunelJogadores = {
    activo: true,
    // -1 = bancada do lado -X (oposta a camara TV Centro).
    lado: -1,
    // Largura da boca (m) e quantos degraus sao cortados na altura dela.
    largura: 5.0,
    degrausCortados: 6,
    // Altura livre da passagem (m): o 6.o degrau tem o topo a 3.0 m.
    alturaPassagem: 3.0,
    espessuraParede: 0.35,
    // As placas de publicidade abrem-se `largura / 2 + folgaPlaca`; o pessoal do estadio nao fica a esta distancia.
    folgaPlaca: 0.4,
    folgaStaff: 1.5,
    cores: { parede: 0x7b8594, tecto: 0x4b5563, chao: 0x1c1f26, fundo: 0x0a0c10 },

    // Preenchidos por `definirGeometria` (createField), que e quem sabe onde fica a bancada.
    xBoca: -45.4,
    xFundo: -52.6,

    definirGeometria: function (bancadaX) {
        // A primeira fila da bancada tem 1.2 m de profundidade centrada em bancadaX: a face da frente fica a 0.6 m.
        this.xBoca = this.lado * (bancadaX - 0.6);
        this.xFundo = this.lado * (bancadaX + this.degrausCortados * 1.2 - 0.6);
    },

    // O ponto esta no corredor do tunel (para o pessoal e as placas nao o taparem)?
    bloqueia: function (x, z, folga) {
        if (!this.activo) return false;
        return Math.sign(x) === this.lado && Math.abs(z) < this.largura / 2 + (folga === undefined ? this.folgaStaff : folga);
    }
};
if (typeof window !== 'undefined') window.TunelJogadores = TunelJogadores;

const AberturaModel = {
    activa: true,
    // Velocidade a andar (m/s).
    velocidade: 1.9,
    // Atraso (s) do primeiro par de cada time contado a partir de a abertura comecar, e intervalo entre pares.
    atrasoTimes: 2.4,
    intervaloEntrada: 0.9,
    // Lugares: a fila fica em x = xFila (de frente para +X); a faixa de desvio e anterior a ela.
    xFila: -24.0,
    xDesvio: -30.0,
    // |z| das filas indianas dentro do tunel e dos assistentes.
    zFileira: 1.0,
    zAssistente: 1.7,
    // Primeiro lugar de um time (|z|) e passo entre jogadores.
    zPrimeiroLugar: 3.0,
    passoNaFila: 1.15,
    // O juiz fica (e entra) este tanto a frente dos assistentes (m).
    adiantoJuiz: 1.0,
    // Segundos de espera depois de todos alinhados.
    esperaAlinhados: 10.0,
    // A VOLTA DO INTERVALO: saem do tunel em ordem aleatoria, a trote, direto para os postos (sem fila).
    velocidade2T: 3.2,
    atrasoSegundoTempo: 2.0,
    intervaloSegundoTempo: 0.45,
    // Margem para considerar que chegou a um ponto (m) e rede de seguranca da fase de entrada (s).
    chegada: 0.4,
    prazoEntrada: 70.0,
    // Cameras: [posicao, alvo]. A de entrada olha para o juiz a andar; a da fila enquadra as duas equipas de frente.
    cameraEntrada: { pos: [-20, 3.2, 13], alturaAlvo: 1.3 },
    cameraFila: { pos: [4, 8, 0], alvo: [-24, 1.3, 0] }
};
if (typeof window !== 'undefined') window.AberturaModel = AberturaModel;
