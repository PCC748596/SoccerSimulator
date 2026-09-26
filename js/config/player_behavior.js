/*
=============================================================================
CONFIG: COMPORTAMENTO E CONTROLO DO JOGADOR
=============================================================================
Aparência, visão, condução, drible, recepção/controlo de bola, percepção e lateral.
=============================================================================
*/

const AppearanceModel = {
    tipos: [
        // Castanho claro é o mais comum, como pedido.
        { nome: 'castanhoClaro', peso: 42, cabelo: 0x8b6b45, pele: 0xe8c9a8 },
        { nome: 'loiro', peso: 28, cabelo: 0xd9c37a, pele: 0xf2d7bd },
        { nome: 'negro', peso: 22, cabelo: 0x1a1410, pele: 0x6b4630 },
        // Poucos ruivos, e são os de pele mais clara.
        { nome: 'ruivo', peso: 8, cabelo: 0xb5502a, pele: 0xf6ddc8 }
    ],

    chuteiras: [
        { nome: 'vermelha', peso: 25, cor: 0xd62828 },
        { nome: 'branca', peso: 23, cor: 0xf5f5f5 },
        { nome: 'preta', peso: 20, cor: 0x1c1c1c },
        { nome: 'amarela', peso: 18, cor: 0xe8ff00 },
        { nome: 'rosa', peso: 14, cor: 0xff5fa2 }
    ]
};

if (typeof window !== 'undefined') {
    window.AppearanceModel = AppearanceModel;
}

/*
Funções de aparência (hashAparencia, repartirPorPeso, baralharPorHash, escolherAparencia)
foram movidas para js/utils.js (ver docs/auditoria_config_match.md item 5).
*/

/*
=============================================================================
INQUIETAÇÃO — quem chega ao alvo não fica estátua
=============================================================================
O steerArrive devolve velocidade zero a menos de 0.2 m do alvo, e a partir daí
o jogador não se mexe mais enquanto o bloco não mudar. O campo enchia-se de
estátuas.

Isto desloca o ALVO, não o jogador: a suavização do PosicionamentoAI.tick e o
próprio steerArrive fazem o movimento sair contínuo, não aos saltos.

O deslocamento parte sempre do alvo corrente e NÃO acumula — sem isso a equipa
derivava devagar para fora da forma ao longo de minutos.
=============================================================================
*/
/*
DISPUTA ANTES DA BATIDA (canto). Enquanto se espera pelo cruzamento, ninguém
fica estátua: cada um dá um passo à frente, atrás ou para o lado à volta da
sua âncora, procurando o meio metro de vantagem sobre o par. Como o marcador
está a 1.5-2.5 m do homem (ver defenseSetup/attackSetup em match.js), estes
passos cruzam-se e produzem os embates.

`raio` é pequeno de propósito: é um passo, não um desmarque — o slot do canto
foi desenhado ao metro e não pode ser desfeito à espera da bola.
*/
const SetPieceJostle = {
    raio: 0.85,            // metros à volta da âncora
    intervaloMin: 0.5,     // sorteados por jogador, para não pulsarem em sincronia
    intervaloMax: 1.3,
    velocidade: 1.7        // passo de quem se ajeita, não de quem corre
};

const RestlessModel = {
    raio: 2.0,             // metros à volta do alvo
    limiarChegada: 2.0,    // só mexe quem já lá chegou
    // Sorteados por jogador, para não pulsarem todos em sincronia.
    intervaloMin: 1.5,
    intervaloMax: 3.5
};

/*
offsetInquietacao foi movido para js/utils.js (ver docs/auditoria_config_match.md item 5).
*/

/*
=============================================================================
VISÃO DE JOGO — o que o jogador consegue ler à frente
=============================================================================
A mesma fórmula estava escrita à mão em três sítios (o cone do carry, a
detecção de adversário no toque, e o espaço à frente no BT). Regras duplicadas
divergem: aconteceu já com o sector do passe e com o tecto do bloco.

O ângulo é POR LADO: a `anguloPorTecnica` 0.9, a técnica 80 dá ±72° e a técnica
50 dá ±45°. O piso existe para um jogador de técnica muito baixa não ficar cego.
=============================================================================
*/
const VisionModel = {
    anguloPorTecnica: 0.9,   // graus por ponto de técnica, para CADA lado
    anguloMin: 30.0,         // piso, em graus
    distanciaPorTecnica: 0.5,
    distanciaMin: 12.0
};

/*
coneVisao e alcanceVisao foram movidos para js/utils.js (ver docs/auditoria_config_match.md item 5).
*/

/*
=============================================================================
GIRAR DE COSTAS — quando é que quem recebe pode rodar para o ataque
=============================================================================
O que se via: o jogador domina de costas para o ataque e roda 180 graus para
cima do adversário que o marca por trás. Feito no PRÓPRIO meio-campo, a bola
perdida ali deixa o atacante isolado com o guarda-redes — o erro mais caro que
há, e não uma perda de bola qualquer.

A causa é o cone de condução do estado CARRY ser centrado em `p.dirZ`, a
direcção de ATAQUE, e nunca na direcção para onde o corpo está virado. Quem
recebe de costas aponta logo para a frente — isto é, gira os 180 — e o cone não
sabe nada de quem está lá.

A REGRA:
  - No ÚLTIMO TERÇO gira à vontade. Perder a bola ali não é golo, e travar o
    giro só tirava jogo ofensivo.
  - Aquém disso — incluindo o meio-campo adversário, onde uma perda ainda deixa
    a equipa subida e as costas da defesa à vista — gira apenas se o CONE DE
    SAÍDA estiver limpo: `raio`
    metros, `meiaAberturaGraus` para cada lado da direcção OPOSTA àquela de onde
    a bola vem — que é por onde ele quer sair.
  - Com o cone ocupado não gira: sai em toques de `passoGiroGraus`, para o lado
    livre. Chegar lá em três toques a ver o que tem à volta é melhor do que
    rodar de uma vez para cima do marcador.

A direcção de entrada da bola vem do `p.dirEntradaBola`, escrito no instante do
domínio (match.js). Sem ela, cai-se na direcção de ataque, que é a leitura certa
quando não se sabe de onde veio.
=============================================================================
*/
/*
=============================================================================
ESPERAR PELO POSTO — não correr para trás contra um alvo que se aproxima
=============================================================================
O que se via: um jogador sai da posição para participar na jogada e fica mais
adiantado do que o seu posto. A jogada progride, o posto avança — mas ainda não
passou por cima dele. Ele vira-se para trás para o ir buscar, a inércia leva-o
longe de mais, e quando o passe sai o apoio que devia estar naquele ponto vem a
meio caminho, no sentido errado. A jogada morre por falta de apoio, e o apoio
existia: estava a fazer marcha atrás.

Ninguém lhe dizia que o alvo vinha a caminho. O `tickFinal` escreve um ponto e
o `steerArrive` persegue-o, sem olhar se esse ponto se está a APROXIMAR. Um
jogador real não recua contra um posto que avança na direcção dele — fica, e
deixa-o chegar.

A inércia em si é o `velocity.lerp(desired, 5*dt)` do player.js, um filtro de
0.2 s igual em todas as direcções: inverter o sentido custa quase meio segundo,
e nesse tempo ele percorre 2-3 m no sentido errado. Isto aqui não trata disso —
trata de nunca chegar a haver a inversão, que é a metade barata do problema.

    distanciaMax     até aqui vale a pena esperar; mais longe vai-se ao
                     encontro do posto, senão ficava fora da jogada parado
    velocidadeMin    piso de aproximação, em m/s. Sem ele o ruído do
                     alisamento (PositionSmoothing) passava por aproximação e
                     o jogador ficava colado ao chão a jogada inteira
=============================================================================
*/
const EsperaPeloSlotModel = {
    distanciaMax: 8.0,
    velocidadeMin: 0.5
};

/*
esperarPeloSlot e eixoDeConducao foram movidos para js/utils.js (ver docs/auditoria_config_match.md item 5).
*/

const GiroDeCostasModel = {
    // Distância a que um adversário invalida o giro de 180° (cone de
    // meia-abertura atrás do jogador). Estava em 5.0; a 5 m um marcador nas
    // costas ainda fecha mal, e o jogador acabava a girar em cima dele.
    raio: 7.0,
    meiaAberturaGraus: 45,
    passoGiroGraus: 30,

    /*
    ONDE O GIRO E LIVRE: o ULTIMO TERCO, e nao a metade adversaria.

    A primeira versao abria a excepcao a partir da linha de meio-campo. Mas no
    meio-campo adversario perder a bola ainda doi — o contra-ataque sai com a
    equipa toda subida e as costas da defesa a descoberto. Onde perder a bola
    custa mesmo pouco e la a frente.

    17 m no referencial de ataque, o MESMO numero do `CarryModel.zonaLivre` e do
    `conduzirSoAcimaDe`: e a mesma ideia de "ultimo terco" e nao se inventa uma
    segunda fronteira para ela. Esta escrito aqui em vez de referenciado porque
    o CarryModel so e definido mais abaixo neste ficheiro; o teste
    tests/giro_de_costas.test.js compara os dois e falha se divergirem.
    */
    zonaLivre: 17.0
};

/*
O PE BOM DE CADA JOGADOR.

Nao existia: o `ShotClip.pernaChute` e um 'r' global, com o comentario a dizer
que 'serve um canhoto trocando uma letra'. Foi preciso para o toque de
conducao sair no frame do pe certo (ver `CarryModel.frameToque`).

A escolha e determinista pelo `id` do jogador (ver `pePreferido` em utils.js):
o mesmo jogador e sempre do mesmo pe, sem estado nenhum para guardar.

`fraccaoCanhotos` e a proporcao geral, ~22%, que e a do futebol real; nos
postos da esquerda ela sobe, porque um lateral esquerdo canhoto e a regra e
nao a excepcao.
*/
const FootModel = {
    fraccaoCanhotos: 0.22,
    fraccaoCanhotosNaEsquerda: 0.70,
    postosDaEsquerda: ['LB', 'LM', 'LW']
};

if (typeof window !== 'undefined') window.FootModel = FootModel;

const CarryModel = {
    /*
    =========================================================================
    ABERTURA DO CORREDOR DE CONDUCAO — quem esta NO CAMINHO, e nao quem se ve
    =========================================================================
    O corredor que decide "tenho espaco a frente?" abre `corredor + dz *
    aberturaCorredor` de meia-largura. Esta abertura e FIXA de proposito.

    Era `Math.tan(coneVisao(tec))` — o cone de VISAO do jogador, que cresce com
    a tecnica. Medido, a meia-largura do corredor a 10 m de distancia:

        tecnica 50    14.0 m
        tecnica 70    23.6 m
        tecnica 80    34.8 m

    O campo tem 34 m de meia-largura. A tecnica 80 o corredor a dez metros
    COBRIA O CAMPO INTEIRO: qualquer adversario a frente, mesmo encostado a
    linha lateral oposta, contava como estando no caminho. Com o
    `espacoLivre` a exigir 16 m limpos la dentro, a conducao em espaco aberto
    praticamente nunca disparava. Medido em 15 minutos de jogo: ZERO posses de
    atacante com mais de 10 m de espaco a frente — e quando o espaco existia
    (3 a 10 m), ele conduzia em 83 a 96% dos casos. A decisao estava boa; o que
    estava errado era a medida.

    O cone de visao serve para VER (escolher um passe, ler a linha). Para
    "tenho caminho a frente?" o que interessa e quem esta NO CAMINHO — que e
    exactamente o criterio do `frenteAFrenteComGk` (utils.js), usado a duas
    linhas de distancia no mesmo ramo da arvore.

    0.12 sao ~7 graus por lado: com `corredor` 4.0, da 5.2 m de meia-largura a
    10 m e 5.8 m a 15 m. Um caminho, e nao um sector.

    O ALCANCE continua a depender da visao (`alcanceVisao`): ate ONDE ele ve e
    uma questao de visao, QUEM esta no caminho nao e.

    Medir o efeito: `node tools/lab/adiantar_a_bola.js 900 1`.
    =========================================================================
    */
    aberturaCorredor: 0.12,

    leque: [-1.2, -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2],
    lookAhead: 10.0,      // base de distância (sobrescrita por player.tec * 0.5)
    spaceCap: 16.0,       // espaço acima disto já não conta mais

    /*
    PESOS DA DIRECÇÃO DE CONDUÇÃO. Os três termos chegam normalizados a 0..1
    (ver notaDireccaoCarry em utils.js), por isso estes números são comparáveis
    entre si — antes não eram, e era esse o bug.

    Os antigos spaceWeight/progressWeight/sectorWeight multiplicavam grandezas
    em escalas diferentes: o progresso valia visDist metros (40 m a técnica 80)
    e o espaço no máximo spaceCap (16). Amplitude real: 56 pontos para o
    progresso contra 32 para o espaço — a direcção frontal ganhava sempre, mesmo
    com um adversário colado e a ponta vazia. Subir o sectorWeight de 1.0 para
    4.5 em três tentativas nunca resolveu, porque o problema era a escala.

    pesoProgresso fica em 1.0 de propósito: é a unidade de referência.
    */
    pesoEspacoMin: 1.2,   // técnica <= tecEspacoMin
    pesoEspacoMax: 2.88,  // técnica >= tecEspacoMax
    tecEspacoMin: 40,
    tecEspacoMax: 90,
    pesoProgresso: 1.0,
    pesoSector: 1.6,

    /*
    PERTO DA BALIZA, PROGREDIR É APROXIMAR-SE DELA — e não ganhar profundidade.

    Relato: *"no cara a cara, o jogador em vez de ir na direção do gol vai na
    direção da linha de fundo e tenta chutar sem ângulo"*.

    O progresso era `(tz - pz) * sentido`, ou seja metros ganhos em Z. A 25 m
    da baliza, ir a direito para a linha de fundo pontua tanto como ir para a
    baliza — os dois ganham a mesma profundidade — e o termo do espaço
    desempata para o lado errado, porque quem defende está ao centro e a relva
    livre está na ponta. Medido com `tools/scratch/cara_a_cara_diag.js`, o
    lance montado a 20 e a 30 graus acabava com o avançado a |x| 17-19 m e a
    z 45-52 (a linha está em 53), com 0.0 a 0.2 graus de baliza aberta.

    Dentro de `progressoParaBalizaDist` metros do centro da baliza, o progresso
    passa a ser a DISTÂNCIA ganha à baliza. Ir para a ponta deixa de pontuar
    sozinho: aproxima pouco ou nada, e o ângulo fecha.

    30 m é pouco mais do que a `distanciaIdeal` do frente-a-frente e cobre a
    zona de remate inteira; fora disso continua a valer a profundidade, que é
    o que se quer a meio-campo.
    */
    progressoParaBalizaDist: 30.0,

    /*
    Espaço livre à frente. Medido num corredor que abre para longe (`corredor`
    metros de meia-largura à altura do jogador, mais `abertura` por cada metro
    de profundidade), até ao adversário mais próximo lá dentro.
    */
    corredor: 4.0,
    abertura: 0.35,
    espacoLivre: 16.0,
    espacoLivreDefesa: 35.0,

    /*
    Orçamento de condução: quantos metros o portador pode levar a bola antes de
    o ramo de espaço aberto deixar de o servir.

    Sem isto a condição não tem memória nenhuma — é reavaliada a cada frame, e
    enquanto ele corre para o espaço continua a ser verdadeira. O resultado
    medido foi devastador para o ritmo: em 46% das posses o portador NUNCA
    largava a bola, conduzindo 28 m de média. O jogo passou a ser feito de
    corridas individuais em vez de combinações.

    Gasto o orçamento, ele volta a cair no ramo Passar. Recomeça a zero quando
    a bola muda de pé.
    */
    distanciaMax: 16.0,
    distanciaMaxDefesa: 2.0,

    /*
    EXCEPÇÃO AO ORÇAMENTO: estar livre à frente (`livreAFrente10m20g` — ninguém
    a 10 m num cone de 20°) deixa conduzir para lá do orçamento, mas só no
    ÚLTIMO TERÇO e sem ser em sprint.

    Porquê manter a excepção: com a baliza à frente e o caminho aberto, obrigar
    a passar é o que faz o portador tocar para trás em vez de progredir para a
    zona de remate.

    Porquê limitá-la: sem limite nenhum era a anulação do orçamento — quem
    arranca em velocidade limpa o cone por si próprio, e o portador atravessava
    o campo todo. Fora do último terço, ou a sprintar, manda o orçamento.

    `zonaLivre` no referencial de ataque (17 m ≈ entrada do último terço, mesma
    convenção do bolaNoUltimoTerco do TeamBT). `velMaxLivre` é o topo da corrida
    normal — acima disto é sprint (ver GaitModel.correr.vel).
    */
    /*
    =====================================================================
    O FUTEBOL E FEITO DE MAIS PASSES DO QUE CORRIDAS
    =====================================================================
    A arvore de decisao com bola tinha o `ConduzirEmEspaco` ACIMA do
    `ProcurarPasse`, e o fallback final era conduzir. Resultado: conduzir era
    a opcao por omissao e passar a excepcao — chegava-se ao passe generico so
    se nao houvesse campo aberto, o caminho nao estivesse fechado, nao se
    estivesse na defesa e nao se pudesse driblar. Medido num lote: 7309
    conducoes contra 5604 passes, quase um para um. No futebol e varias vezes
    mais passes.

    `conduzirSoAcimaDe` inverte isso sem desligar a conducao: com um passe bom
    disponivel, conduz-se apenas a partir desta distancia da baliza adversaria
    (no referencial de ataque, `zoneAhead`). Ou seja, no ultimo terco — que e
    onde conduzir decide alguma coisa — e nao a sair da defesa.

    Sem passe nenhum disponivel, conduz-se onde quer que se esteja: o ramo do
    passe falha e a arvore segue para os de baixo, como antes.

    O valor vem do `zonaLivre` logo abaixo, que ja marcava o "ultimo terco"
    para o orcamento de conducao — nao se inventa uma segunda fronteira para
    a mesma ideia.
    =====================================================================
    */
    conduzirSoAcimaDe: 17.0,

    zonaLivre: 17.0,
    velMaxLivre: GaitModel.correr.vel,

    /*
    VELOCIDADE DE CONDUÇÃO — a que faltava.

    O `actCarry` não escrevia `speedMult` nenhum: o portador ficava com o da
    folha que tinha corrido antes. Num jogador que acabou de ganhar a bola isso
    é sempre uma das rápidas — 9.00 m/s do `actTackle` (que o próprio comentário
    chama "velocidade máxima SEM bola"), 7.88 do sprint do `actRunIntoSpace`.
    Saía a conduzir mais depressa do que qualquer sprint sem bola, e o 0.95 do
    estado CARRY não chega perto de compensar.

    Conduzir é mais lento do que correr livre: leva-se a bola no pé, dá-se o
    toque à frente e corre-se atrás dela. Por isso a base fica abaixo dos 6.53
    m/s de quem persegue a bola sem ela.

    O recuo com bola é mais lento ainda — é para segurar a jogada, não para
    arrancar (`recuoMult`). O contra-ataque acelera, como em todas as outras
    folhas.
    */
    velocidadeBase: 5.0,      // m/s a SPEED 50
    velocidadePorSkill: 1.2,  // ± isto entre SPEED 0 e SPEED 100
    recuoMult: 0.75,
    contraAtaqueMult: 1.25,

    /*
    SEGURAR E RECUAR COM A BOLA.

    O portador só sabia ir para a frente. O `carryRecuo` existia mas estava
    escondido atrás de três condições dentro do `actPass` (ter candidato, sem
    adversário a 5 m, sem pressão) e vinha DEPOIS de dois ramos que passam a
    bola — na prática nunca corria. Parar com a bola não existia de todo: não
    havia estado nenhum entre conduzir e passar.

    Agora, quando não há passe bom E não há ninguém em cima dele, sorteia-se o
    que um jogador real faz nesse momento: fica com ela à espera que a linha
    apareça, ou dá meia-volta e recua para reconstruir. O resto do tempo passa,
    como antes.

    As duas percentagens somam menos de 1 de propósito — o que sobra continua a
    ser o caminho antigo (passe de recuo / circulação).
    */
    segurar: {
        distSemPressao: 6.0,   // adversário mais perto tem de estar além disto
        chanceParar: 0.35,     // fica com a bola, de frente para o jogo
        chanceRecuar: 0.30,    // dá meia-volta e leva-a para trás
        duracaoMin: 0.6,       // quanto tempo fica parado, antes de rever
        duracaoMax: 1.6,
        /*
        Corta a paragem no instante em que alguém entra dentro disto — segurar
        a bola com um adversário a chegar é como se perde a bola.
        */
        distCorte: 4.0
    },

    // Toques de condução — distância do toque depende do espaço à frente
    touchLong: 2.8,       // toque longo (campo aberto, adversário > 15m)
    touchMedium: 1.6,     // toque médio (adversário entre 8-15m)
    touchShort: 0.96,     // toque curto (adversário perto < 8m)
    touchPower: 8.0,      // força base do toque (m/s)
    touchCooldown: 0.4,   // tempo mínimo entre toques (seg)

    /*
    DISPUTA DO TOQUE — o toque é validado por quem chega primeiro à bola, e não
    pela distância a que o adversário está AGORA.

    O problema que isto resolve: o toque leva ~0.7 s a fechar (a bola afasta-se
    e volta ao pé), mas o tamanho era escolhido com a distância do instante. Um
    defesa a 11 m a fechar a 6 m/s está a 7 m quando a bola assenta — e o toque
    tinha sido dimensionado para os 11 m. Resultado: tocava para a frente e
    perdia a bola, parecendo que não via ninguém.

    `velAdversario`  a que velocidade se assume que o adversário corre para a
                     bola. É deliberadamente generoso (é o topo da corrida sem
                     bola), porque errar por prudência custa um toque curto e
                     errar por optimismo custa a posse.
    `margem`         quanto tempo o portador tem de ganhar para o toque valer.
    */
    velAdversarioDisputa: 7.0,
    margemDisputa: 0.15,

    /*
    E QUEM ENTRA NA DISPUTA. A conta era a distância em linha recta ao ponto
    onde a bola vai ficar, e por isso o defesa colado às COSTAS ganhava sempre
    a corrida — para lá chegar teria de passar por cima do portador, a correr
    mais depressa do que ele.

    Medido em 74 min: **76% das decisões de toque cortadas a zero**, e no caso
    do relato — alguém atrás a menos de 6 m com o campo aberto à frente — 1245
    de 1280. O portador levava a bola colada ao pé exactamente quando devia
    adiantá-la para ganhar velocidade.

    `disputaProjMin` é a projecção mínima na direcção da corrida para o
    adversário contar: 0 é a linha dos ombros do portador. Quem está atrás dela
    sai da disputa; quem está ao lado ou à frente continua a contar.
    */
    disputaProjMin: 0.0,

    /*
    Até onde um DEFESA conduz a bola, no referencial de ataque. Ele conduz para
    sair a jogar, não para atacar: passada esta linha tem de largar a bola.
    0 = meio-campo. Sem este tecto, um central que recebesse com campo aberto
    à frente — o caso normal — caía no ramo ConduzirEmEspaco do BT e ia com ela
    até à área adversária, driblando pelo caminho.
    */
    limiteConducaoDefesa: 0.0,
    /*
    Era 0.18 s, e chegava quando o toque aceitava as DUAS pernas: havia janela
    duas vezes por ciclo. Com um frame so (ver `frameToque`) a espera pode ir
    a uma passada inteira, e a 0.18 s o toque saia forcado antes do frame —
    medido, 17 de 74 toques. A 0.40 s: **1 em 74**.
    */
    touchMaxWait: 0.40,   // espera máx. pelo frame do pé antes de forçar o toque (seg)

    /*
    EM QUE FRAME DO CICLO SAI O TOQUE DE CONDUCAO (pedido).

    O ciclo da passada tem 60 frames e o codigo ja falava essa lingua: a
    janela antiga era 'R20 (0.333) para uma perna, R40 (0.666) para a outra',
    ou seja aceitava as DUAS pernas, a que calhasse mais perto.

    Agora e uma so, a do PE BOM: **R12 no destro, R41 no canhoto**. Os dois
    frames estao a 29/60 de distancia — meia passada — que e como tem de ser,
    porque sao pernas opostas.

    A fase e `animPhase` (0..1), portanto o alvo e frame/`framesDoCiclo` e a
    distancia mede-se em CIRCULO (R58 esta a 4 frames de R2, nao a 56).

    So o toque de conducao passa por aqui. O passe, o remate e o cruzamento
    continuam a aceitar as duas pernas (ver `aguardarPassada`): com uma so
    janela por ciclo a espera passava a meia passada, que a esta velocidade
    ja e mais do que o `touchMaxWait` — o gesto acabaria forcado na mesma,
    so que mais tarde.
    */
    framesDoCiclo: 60,
    frameToque: { d: 12, e: 41 },
    toleranciaFrameToque: 0.13,   // em fraccao do ciclo (~8 frames para cada lado)
    recoverRadius: 0.8,   // distância para re-capturar a bola após toque

    /*
    Faixa junto à linha de fundo onde NÃO se adianta a bola. Dentro dela o
    portador continua a correr, mas com a bola no pé: um toque à frente ali
    põe-na fora pela linha de fundo, e o resultado era pontapé de baliza para
    o adversário só por conduzir até ao fundo.

    Vale para o toque do CARRY. O leque de direcções também deixa de
    apontar para dentro da faixa, senão o
    jogador continuava a correr contra a linha sem nunca poder tocar.
    */
    /*
    Metros à linha de fundo dentro dos quais NÃO se adianta a bola (ver
    pertoDaLinhaDeFundo em utils.js). Estava em 0.0, o que desligava a trava
    por completo — a função devolvia sempre false e o toque punha a bola fora
    pela linha de fundo, dando pontapé de baliza ao adversário.

    3.5 m cobre um toque curto (0.96) e boa parte de um médio (1.6) a partir
    da linha; o resto é apanhado pelo emZonaDeFinalizacao, que trava o toque
    em toda a zona de remate.
    */
    margemLinhaFundo: 3.5,

    /*
    COM O GUARDA-REDES A ESTA DISTÂNCIA NÃO SE ADIANTA A BOLA.

    Relato: *"o jogador do cara a cara ou chuta antes de entrar na área ou não
    chuta — e nem o guarda-redes pega a bola; fica um a tentar correr de frente
    para o outro"*.

    O toque de condução empurra a bola 1.6 a 2.5 m à frente e o portador vai
    atrás dela. Isso serve em campo aberto; num duelo com o guarda-redes a sair
    é oferecer-lha, porque durante esse tempo todo a bola não está no pé de
    ninguém e ele está mais perto dela. Medido com
    `tools/scratch/cara_a_cara_timeline.js`: o último toque saiu a 20 m da
    baliza e o avançado só voltou a ter a bola ao pé aos 13 m, com o
    guarda-redes já em cima dela.

    Não chega travar o toque dentro da área (que é o que o
    `emZonaDeFinalizacao` faz): o toque que estraga o lance é o de ANTES de
    entrar nela. Com 20 m nada mudava — o toque decisivo saiu a 20.5 m e
    escapava por meio metro. A 25 m o lance passa a ser o que se espera: bola
    no pé pela área dentro, corte para o meio e remate de 10.9 m com 32 graus
    de baliza aberta, contra o remate que antes nunca chegava a existir.
    */
    semToqueComGkA: 25.0
};

/*
Drible (DRIBBLE) — ultrapassar um adversário 1v1.

O portador detecta de que lado o defensor está vindo e toca a bola para o lado
oposto (30-45°). Se tentar ir reto, probabilidade de perda é muito maior.

`successBase` é a chance base de sucesso no drible. Modificada pela skill do
jogador e pela proximidade do adversário.
*/
const DribbleModel = {
    triggerDist: 3.2,     // distância para activar drible 1v1 (adversário à frente)
    angleSide: 0.6,       // ângulo lateral do toque (~35°, entre 30 e 45)

    /*
    =====================================================================
    O 1x1 NO ÚLTIMO TERÇO — a ousadia sobe onde vale a pena arriscar
    =====================================================================
    Pedido: *"tem que aumentar os dribles no último terço em 50%"*.

    O `podeDriblar` (player_bt.js) sempre teve um ramo próprio para o último
    terço — mais permissivo em quatro contas ao mesmo tempo — mas os números
    estavam escritos à mão no meio da função, e não havia como os medir nem
    mexer neles sem os procurar. Estão aqui, e cada um diz o que abre:

        `tecMin`        a barreira técnica para tentar. Fora do terço são 72;
                        aqui é mais baixa, porque perder a bola a 25 m da
                        baliza adversária custa pouco e ganhar o duelo vale
                        uma ocasião.
        `distEngajar`   até que distância um adversário à frente conta como
                        alguém a passar. Mais longe = mais situações contam.
        `espacoAtras`   quanto tem de estar livre ATRÁS do homem que ele
                        passa. É uma tolerância invertida: quanto MENOR, mais
                        fácil é o espaço contar como livre, porque menos
                        fundo se olha.
        `larguraAtras`  o mesmo, na largura.
        `bonus`         multiplica a tendência de drible da posição antes de
                        a comparar com a barreira técnica.

    MEDIDO (tools/headless/dribles_ultimo_terco.js, 3 sementes × 30 min):

        antes   60 / 5.5 / 5.0 / 2.6 / 1.35   ->  32 dribles no terço
        agora   52 / 6.4 / 4.2 / 2.2 / 1.60   ->  48 dribles no terço   (+50%)

    E OS DRIBLES FORA DO TERÇO NÃO SE MEXEM, que é a outra metade do pedido:
    nada disto entra no ramo do resto do campo. Se os dois números subirem
    juntos, o que mudou foi a vontade de driblar em todo o lado e não o que
    foi pedido — por isso a ferramenta imprime os dois.
    =====================================================================
    */
    ultimoTerco: {
        /*
        O GATILHO QUE CONTA — e nao foi o que parecia.

        A conducao vira 1x1 quando o adversario mais proximo entra dentro do
        `triggerDist` (ver o case CARRY na fsm.js). E DAI que saem quase todos
        os dribles do jogo: afinar so o ramo `Driblar` da arvore (as cinco
        constantes abaixo) nao mexeu **um unico drible** em 90 minutos
        medidos — os numeros sairam identicos nas tres sementes.

        3.2 m em todo o campo; aqui e mais, porque no ultimo terco ele encara
        em vez de tocar para tras.
        */
        triggerDist: 4.4,

        tecMin: 52,
        distEngajar: 6.4,
        espacoAtras: 4.2,
        larguraAtras: 2.2,
        bonus: 1.60
    },

    /*
    =====================================================================
    DRIBLAR O GUARDA-REDES — a quarta opção de finalização
    =====================================================================
    Pedido: *"dribrar o goleiro se tiver mais de 15 metros atrás do goleiro:
    vai tocar para o lado num ângulo de uns 30 graus, uns 3 metros de
    distância do goleiro, ultrapassar o goleiro e chutar direto para o
    gol"*.

    Das quatro finalizações pedidas, três já existiam e saem do
    `tipoDeRemate` (utils.js): o canto de perto (`rasteiro`/`colocado`), o
    canto de longe (`forca`) e a cobertura (`chapeu`). Esta não existia — e
    não por acaso: o `podeDriblar` SALTA o guarda-redes de propósito
    (`if (opp.role === 'gk') continue`), portanto ele nunca era alvo de
    drible em nenhuma circunstância.

    O GESTO não precisou de nada novo: o estado DRIBBLE já toca a bola para
    o lado a `angleSide` (0.6 rad = 34°, dentro dos "uns 30 graus"),
    acelera para lá e volta a CARRY — e é do CARRY que o remate à baliza
    vazia sai. O que faltava era a DECISÃO.

    `espacoAtras` é o que o pedido nomeia: quantos metros o guarda-redes
    tem de ter deixado atrás de si — ou seja, a que distância está da
    própria linha. Com 15 m, a baliza atrás dele está aberta e passá-lo vale
    mais do que rematar; com ele na linha, driblá-lo é dar-lhe a bola.

    `tecMin` é o "de acordo com a técnica": driblar o guarda-redes é a mais
    difícil das quatro, e um jogador sem pé não a tenta — remata.
    */
    aoGuardaRedes: {
        espacoAtras: 15.0,    // metros entre o guarda-redes e a própria linha
        /*
        A que distância se toca a bola para o lado. O pedido diz "uns 3
        metros" e ficou em 4.0 por medição: com o tecto em 3.0 o lance nunca
        disparava — o avançado aproxima-se até 3.4 m, o `actCarry` afasta-o
        outra vez e ele acaba a rematar de 8.9 m. A janela tem de conter a
        aproximação real, senão a regra existe e não acontece.
        */
        distEngajar: 4.0,     // toca-se para o lado a esta distância dele
        distMinima: 1.0,      // mais perto do que isto já é tarde
        larguraEngajar: 5.0,  // corredor lateral: ele à minha frente, não ao lado
        bolaAoPe: 1.8,        // a bola tem de estar a este alcance para se empurrar
        tecMin: 70,           // abaixo disto remata em vez de driblar
        folgaAtras: 4.0       // nenhum defesa a menos disto atrás dele
    },
    touchPower: 8.5,      // força do toque lateral
    successBase: 0.65,    // chance base de sucesso
    successSideBonus: 0.20, // bónus por ir para o lado (vs reto)
    failLossBall: 0.65,   // prob. de perder a bola se falhar
    sprintBoost: 6.5,     // boost de velocidade após toque lateral
    cooldown: 0.9,        // tempo antes de poder driblar novamente

    /*
    O DRIBLE TEM DE DURAR O SUFICIENTE PARA SE VER.

    O estado DRIBBLE resolvia o 1x1 inteiro no PRIMEIRO frame — decidia,
    largava a bola de lado e voltava a CARRY. Medido em 25 minutos de jogo:
    sete entradas no estado, todas com 0.02 s de duracao. O lance existia nas
    estatisticas e nao existia no ecra.

    `duracaoGesto` e o tempo em que ele leva a bola no pe, ja virado para o
    lado de fuga e em aceleracao, antes de a tocar para la do adversario;
    `alcanceGesto` e a que distancia a frente lhe fica o alvo de movimento
    durante esse tempo. A decisao continua a ser tomada no primeiro frame — o
    que mudou foi o tempo entre decidir e executar.
    */
    duracaoGesto: 0.55,   // segundos de gesto antes do toque
    alcanceGesto: 6.0     // metros a frente, no lado de fuga
};

/*
Marcação e largura da última linha.

`distancia`/`aderencia`: o ponto de marcação fica sobre a recta que liga o
atacante à nossa baliza, e não a N metros atrás dele em Z. Com o desvio só em Z,
um atacante aberto no corredor era marcado pelo LADO — o defensor não estava
entre ele e a baliza. Medido: 46.7° de desvio médio em relação à direcção da
baliza, com só 62.7% das marcações dentro de 45°.

`largura*`: com a bola pelo eixo, centrais e laterais não têm corredores para
cobrir — têm de tapar o caminho da baliza. A linha fechava 30.3 m com a bola ao
centro contra 31.6 m com ela na ala, ou seja praticamente nada.
*/

const BallControl = {
    /*
    Raio de contacto com a bola, medido ao CORPO (ver distanciaAoCorpo), não
    à origem do modelo. Era 1.3 m: a bola podia estar a mais de um metro do
    corpo e mesmo assim contar como dominada, o que a fazia parecer solta ao
    lado do jogador em vez de no pé dele. -0.4 m aperta o domínio.
    */
    reach: 0.9,           // raio de contacto com a bola, em metros
    /*
    Abaixo disto domina-se sempre. Subiu proporcionalmente com o `PassModel.vChegadaRasteira`
    (7.75 -> 9.69 -> 10.66), mantendo os passes curtos e médios domináveis ao primeiro toque.
    Acelerar o passe sem acelerar o controlo não faz o jogo mais rápido, faz os
    receptores mais incompetentes.
    */
    /*
    10.66 -> 8.5, a acompanhar o `PassModel.vChegadaRasteira` (8.25 -> 6.5).
    Ele tinha subido "na mesma proporcao" que a forca do passe; com a bola a
    chegar a ~7.5 m/s nos passes curtos, um limiar de 10.66 dava dominio
    garantido a tudo o que e rasteiro e tirava a dificuldade as bolas altas,
    que chegam a 11-16 m/s. Os dois numeros andam juntos.
    */
    easySpeed: 8.5,       // abaixo disto domina-se sempre (a regra antiga)
    hardSpeed: 30.0,      // acima disto é praticamente impossível dominar

    /*
    BOLA QUE CAI NAO SE TRAVA, AMORTECE-SE.

    O limiar acima media a velocidade 3D, e uma bola alta de 20 m chega a
    16 m/s por balistica pura — nao por estar a ser chutada com forca. Medido
    em lote: nos passes de 15-25 m pelo alto, 30% dos dominios falhavam contra
    7% nos rasteiros da mesma faixa, e a bola ainda ressaltava para o
    adversario. Um jogador de verdade mata essa bola no peito ou na coxa quase
    sempre: o contacto e amortecido, e a componente que ele tem de travar e a
    horizontal, nao a queda.

    Por isso, com a bola A DESCER e acima de `alturaQueda` (medida aos pes, ver
    distanciaAoCorpo), o limiar do dominio facil sobe para `easySpeedQueda`. O
    `hardSpeed` nao muda: uma bomba continua a ser uma bomba.
    */
    easySpeedQueda: 16.0,
    alturaQueda: 0.8,
    receiverBonus: 0.35,  // vantagem de quem é o destinatário do passe
    touchLock: 0.35,      // segundos sem poder tocar depois de largar a bola
    retryLock: 0.25,      // segundos até nova tentativa depois de falhar uma
    deflectKeep: 0.45,    // fracção da velocidade que sobra num desvio
    deflectSpread: 0.6,   // quanto o desvio abre a direcção

    /*
    --- Domínio no peito ---------------------------------------------------
    Bola à altura do peito não se domina com o pé: o jogador inclina a
    cintura para trás e deixa-a bater no peito.

    Onde a bola cai sai da TÉCNICA, numa curva contínua (ver quedaNoPeito em
    utils.js): técnico alto encosta-a ao pé, técnico fraco larga-a longe e
    disputável. Em qualquer dos casos ela fica à frente dele e ele sai a jogar.

    Era um binário — o `venceuDuelo` sorteava bom/mau e a distância saía de duas
    constantes fixas, 0.5 m ou 1.5 m. A TEC só mexia na probabilidade do
    sorteio, e mesmo o caso bom largava a bola a meio metro, que não é "no pé".
    O sorteio continua a existir, mas só para a animação, as estatísticas e o
    evento CHEST_CONTROL — deixou de decidir onde a bola cai.
    */
    // Alturas medidas a partir dos PÉS do jogador (ver distanciaAoCorpo).
    // peitoYMin tem de ser >= peitoAltura (1.20, mais abaixo): bola abaixo do
    // peito de verdade não faz sentido matar no peito, é toque de pé normal.
    /*
    A FAIXA DO PEITO TINHA 20 CM (1.15 a 1.35) e a bola quase nunca lá chega:
    medido em 74 min, das ~1200 bolas que chegam ao corpo de alguém, 850 vêm
    rasteiras (0.1 m) e 500 acima da cabeça — na faixa do peito passavam 30, e
    saíam 3 a 7 matadas por jogo. O que fica entre a coxa e o peito era tratado
    como bola no chão: um domínio falhado a 1.1 m manda-a para longe, que é o
    relato ("normalmente a bola vai pra longe").

    O piso desce à COXA. A bola já não é colada a uma altura fixa — segue a
    altura do contacto (ver peitoAlturaMinCola/MaxCola e colarBolaAoPeito) —, e
    por isso o piso pode descer sem a bola dar um salto no frame do toque.
    */
    /*
    =====================================================================
    NÃO SE TIRA A BOLA A QUEM A TEM VINDO POR TRÁS
    =====================================================================
    Relato: *"os jogadores ainda estão roubando a bola por trás do jogador que
    está carregando a bola"*.

    O nó do desarme (`tentarDesarme`, js/bt/player_bt.js) já recusava o
    carrinho pelas costas — mas não era por aí que a bola mudava de dono. O
    `resolveBallContact` dá a bola a QUEM TIVER O CORPO MAIS PERTO dela, e mais
    nada: não olha a quem a tem, nem de que lado vem o outro. Um adversário
    colado às costas do portador fica a 0.9 m da bola e ganha-a sem gesto
    nenhum.

    Medido em 20 min (`tools/scratch/roubo_angulo.js`), contando só as perdas
    para um adversário que estava a menos de 3 m: 37 roubos, dos quais **12
    (32%) por trás** — a 90 cm de distância e com o ladrão em MOVE_TO_POS,
    CARRY ou BALL_CONTROL_RIGHT, ou seja sem sequer tentar desarmar.

    O QUE ISTO RESOLVEU, E O QUE NÃO: medido em A/B com a mesma semente,
    ligando e desligando esta guarda (`anguloCos: -2` nunca dispara),

        com a guarda    30 roubos, 9 por trás (30%)
        sem a guarda    42 roubos, 14 por trás (33%)

    ou seja **corta um roubo em cada quatro** no total, e a FRACÇÃO por trás
    quase não se mexe. Com n ~ 30 por corrida a dispersão entre corridas (30% a
    38% em duas) é maior do que o efeito na fracção, portanto o número honesto é
    o dos totais.

    A razão de sobrarem: esta guarda mede o ângulo no frame do CONTACTO, e o
    medidor mede-o no frame em que o dono perdeu a bola. Entre os dois o ladrão
    já vem a passar para o lado — chega ao contacto dentro dos 120° e a guarda
    deixa-o passar, com razão. O que falta é a outra metade do problema, que não
    é geometria: o portador não protege a bola com o corpo. Ver os problemas
    conhecidos em docs/filesSummary.md.

    `anguloCos` é o cosseno do ângulo entre a FRENTE do portador e a direcção
    de onde vem o adversário: -0.5 são 120 graus, ou seja o terço de trás. Daí
    para trás ele não tira a bola por proximidade — tem de a ir buscar pelo
    lado, ou tentar o desarme e arriscar a falta, que é o que a regra do jogo
    manda.

    `bolaSolta` é a saída que impede isto de virar posse eterna: se a bola já
    se afastou mais do que isto do portador, deixou de ser dele e volta a ser
    de quem lá chegar primeiro, venha de onde vier. Sem esta saída, um
    adversário atrás ficava impedido de a recolher mesmo depois de ela lhe
    sobrar.
    */
    rouboPorTras: {
        /*
        =================================================================
        DE QUE ÂNGULO SE PODE TIRAR A BOLA A QUEM A TEM
        =================================================================
        Pedido: *"Só é possivel roubar a bola em uma marcação normal se o
        jogador adversário estiver num angulo de até 45 de frente com o
        jogador que tem a bola e de 46-80 graus utilizando o carrinho. Fora
        isso tem que ser impossível roubar a bola do adversário."* O relato que
        o motivou: *"O Atacante está roubando a bola do goleiro por trás do
        goleiro. Com o corpo do goleiro entre ele e a bola."*

        Era `anguloCos: -0.5` — cos(120°), ou seja tirava-se a bola de tudo
        menos do terço de trás. Medido em 15 min (`tools/lab/roubo_angulo.js`),
        76 roubos a menos de 3 m:

            0 a 45 graus (de frente)     46
            46 a 80 (de lado)             9
            81 a 120                      9
            121 a 180 (de tras)          12

            sem carrinho acima de 45 graus    22  (29%)

        Quase um terço dos roubos vinha de onde a regra do pedido não permite.

        SÃO DOIS LIMITES, e não um: sem carrinho até 45 graus, com carrinho até
        80. O `resolveBallContact` aplica o que for, conforme o ladrão esteja
        ou não em `TACKLE`/`SLIDE_TACKLE` — porque o carrinho também chega à
        bola por ali, e um limite só bloqueava o gesto que a regra permite.

        Os 121 a 180 graus da tabela acima existiam APESAR da guarda dos 120,
        e a razão é o `bolaSolta` logo abaixo: com a bola lançada à frente do
        portador a guarda desliga-se, e aí ela é de quem chegar. Isso
        mantém-se — é a diferença entre tirar a bola do pé de alguém e recolher
        uma bola que já lhe sobrou.
        =================================================================
        */
        anguloCos: 0.7071,          // cos(45°): sem carrinho, só daqui para a frente
        anguloCosCarrinho: 0.1736,  // cos(80°): com carrinho, abre até aos 80
        bolaSolta: 1.6     // com a bola a mais disto do portador, ela é de quem chegar
    },

    peitoYMin: 0.95,       // altura mínima do contacto para contar como peito
    peitoAlturaMinCola: 0.90,  // limites de corpo para a bola colada
    peitoAlturaMaxCola: 1.75,
    peitoYMax: 1.35,      // acima disto é cabeça (ver ALTURA_CABECA), não peito
    peitoBase: 0.45,      // probabilidade base de amortecer bem (só animação/stats)
    peitoDur: 0.55,       // duração (s) do gesto

    /*
    QUANTAS MATADAS NO PEITO SEGUIDAS, sem a bola assentar no chão.

    O anti ping-pong aéreo já existia para a CABEÇA (HeaderModel.
    maxHeadersSeguidos) e não contava os peitos — e era pelo peito que o jogo
    encravava. O retrato de um encrave: bola parada NO AR a 1.35 m (o próprio
    `peitoYMax`) com velocidade zero, entre dois jogadores a 1.2 m dela, ambos
    a meio do gesto.

    O mecanismo: o `colarBolaAoPeito` fixa a bola e zera-lhe a velocidade
    enquanto o `peitoCola` durar; ao largar, ela sai a `peitoVelYBoa`, que a
    TEC 63 são -0.19 m/s — cai tão devagar que não sai da faixa 1.15-1.35
    antes de o outro jogador a matar no peito outra vez. Ninguém a domina e
    ninguém a vai buscar, porque enquanto o gesto dura o BT trata-os como
    ocupados.

    Ao fim destes, ninguém mais mata no peito até a bola tocar o relvado.
    Mesmo número do cabeceio, e pela mesma razão: dois toques seguidos é uma
    disputa, três é um ciclo.
    */
    maxPeitosSeguidos: 2,

    /*
    =====================================================================
    PEITO OU CABEÇA? DEPENDE DE QUEM VEM A CHEGAR
    =====================================================================
    A decisão era só de ALTURA: bola entre `peitoYMin` e `peitoYMax` ia ao
    peito, mais alta ia à cabeça, e mais nada contava.

    Falta a pressão. Sem ninguém por perto, matar no peito e ficar com a bola
    é sempre melhor do que a cabecear para longe; com um adversário a chegar,
    o peito é lento demais e o que serve é a cabeça — para aliviar ou para
    atacar a bola antes dele.

    `peitoSemPressao` é a distância ao adversário mais próximo a partir da
    qual não há pressão. `peitoAlturaLivre` é até que altura ele aceita a bola
    no peito quando está livre: acima da faixa normal, porque um jogador sem
    ninguém em cima tem tempo de a ajeitar com o peito alto.

    O limite de peitos seguidos continua a valer — isto não abre a porta ao
    ping-pong que ele fecha.
    */
    peitoSemPressao: 7.0,      // metros ao adversário mais próximo
    /*
    1.38, E NÃO 1.75: ACIMA DISTO É CABEÇA.

    O valor antigo deixava o jogador livre "matar no peito" bolas até 1.75 m —
    treze centímetros acima da TESTA (1.62) e acima do próprio topo do crânio
    (1.72). Na prática isso apagava o cabeceio: toda a bola que vinha à altura
    da cabeça era desviada para o ramo do peito antes de chegar ao teste do
    cabeceio, e só sobravam para cabecear as bolas que passavam BEM ACIMA da
    cabeça — que era o relato, *"cabeceiam de ombro"*, medido como zero
    contactos reais em 47 cabeceios.

    A janela do cabeceio começa em `ALTURA_TESTA - janelaAbaixo` = 1.40. O
    tecto do peito fica dois centímetros abaixo disso: cada bola tem um dono.
    */
    peitoAlturaLivre: 1.38,    // sem pressão, aceita a bola até esta altura

    /*
    Distância a que a bola fica ADIANTADA depois da matada, por TEC. O máximo
    (TEC 0) é o pior amortecimento que ainda conta como matada — acima disto
    seria um ressalto, não uma recepção.
    */
    /*
    APERTADO (0.35/1.6 -> 0.25/1.0), a pedido: "não vi nenhuma matada no peito
    em que a bola cai no pé do jogador que matou a bola".

    Medido antes (tools/headless/peito_queda.js, 68 min): a bola tocava o
    relvado a **0.84 m** do peito — que é o que o modelo mandava, porque à TEC
    real dos jogadores (~63) a conta dava 0.81 m. Oitenta centímetros é a bola
    à frente dos pés, não NO pé, e num lance disputado é quem chegar primeiro
    que fica com ela: das cinco matadas do jogo, duas acabaram no adversário.

    O máximo é o pior amortecimento que ainda conta como matada — acima disto
    seria um ressalto, não uma recepção — e é ele que manda no caso médio.
    */
    peitoQuedaMin: 0.25,  // metros à frente a TEC 100 — no pé
    peitoQuedaMax: 1.0,   // e a TEC 0
    sigmaQueda: 0.25,     // dispersão relativa em torno dessa distância
    /*
    Só a CINTURA para trás — `chest.rotation.x`, aplicado em
    player.aplicarCamadaPeito(). A pelvis não se toca: rodá-la deitava o
    jogador inteiro, pernas incluídas. Ele fica de pé e a prumo, o tronco
    acima da cintura vai levemente para trás e os braços abrem um pouco.
    */
    peitoInclinacao: -0.20, // rotação da cintura (negativo = para trás) — só o tronco, reduzido pra não ler como o corpo inteiro a tombar
    peitoBracos: 0.35,      // abertura dos braços (rotation.z, somado à pose)

    /*
    A bola COLA ao peito antes de cair.

    Antes era teleportada no frame do contacto para a distância de queda, já à
    altura do chão — nunca se via a bola encostada ao corpo, só a aparecer
    longe dele. Agora fica presa ao tronco durante
    `peitoCola` segundos (acompanhando-o se ele ainda estiver a andar) e só
    depois é largada com velocidade, caindo sozinha à distância pedida.
    */
    peitoCola: 0.16,      // segundos com a bola encostada ao peito
    peitoDistCorpo: 0.26, // distância do centro da bola ao eixo do corpo (m)
    peitoAltura: 1.20,    // altura do ponto de contacto no peito, dos pés (m)
    peitoVelYBoa: -1.0,   // velocidade vertical ao largar, domínio bom
    peitoVelYMa: 1.2,     // ... e quando falha (repica para cima)

    /*
    Pequeno salto opcional na matada no peito. Só para bolas que chegam mais
    altas dentro da faixa de peito — perto do chão não há razão para saltar.

    O salto é 1/3 do salto de cabeceio (SaltoCabeceio.alturaMax=0.80/3≈0.27):
    como a bola fica COLADA ao tronco (colarBolaAoPeito usa
    model.position.y + peitoAltura todos os frames enquanto `peitoCola`
    corre), ela sobe e desce com o corpo — nunca ultrapassa esse 1/3, que é
    a "altura máxima do pulo" pedida.
    */
    peitoPuloLimiar: 0.98, // altura de contacto (dos pés) acima da qual salta
    peitoPuloMax: 0.27     // pico do salto (m) — 1/3 de SaltoCabeceio.alturaMax
};

/*
Salto para cabecear.

O salto tinha pontaria nenhuma: disparava assim que a bola estivesse entre
1.2 m e 4.5 m de altura e a menos de 2.5 m em planta, com um pico fixo de
1.8 m. Como quem vai receber uma bola alta se posiciona no PONTO DE QUEDA, a
bola só passava por 1.2 m no último instante antes de aterrar — ele saltava
para uma bola quase no chão, e no topo do salto já não havia bola nenhuma.

Agora o salto é planeado no tempo: prevê-se onde a bola está daqui a
`duracao/2` (o instante do pico, ver `Math.sin(jt·π)`) e só se salta se nesse
momento ela estiver ao alcance e ACIMA da cabeça. A altura do salto passa a
ser a que falta para lhe chegar, não um valor fixo — o contacto acontece no
ponto mais alto.

Abaixo de `subidaMin` acima da cabeça não se salta: cabeceia-se de pé.
*/
/*
Cabeçada — alcance.

Uma cabeçada não é um pontapé: a bola leva a velocidade da testa e do tronco,
não de uma perna a rodar. Dez metros é o que um jogador tira de uma cabeçada
normal; um alívio bem batido de um central chega aos 15-20, mas isso é o topo
absoluto e não o caso comum.

Isto existe porque a cabeçada FORA da zona de remate era resolvida como um
passe: pedia-se a `velocidadeParaAlcance` a força para chegar ao companheiro
escolhido — a 30 ou 40 m, se fosse esse o colega. Saíam cabeçadas de meio
campo. Agora a direcção continua a ser a do colega, mas o alcance é o que uma
cabeçada dá; se ele estiver mais longe, a bola fica pelo caminho, como na
vida real.
*/

/*
TIRO DE META: A FAIXA DE CADA EQUIPA.

Relato: "esse é o ajuste do tiro de meta, completamente sem sentido — um time
deveria estar no meio campo e o time do batedor um pouco antes".

Medido antes (`tools/headless/tiro_de_meta.js`), a profundidade no referencial
de ataque de quem bate, onde 0 é o meio-campo e -35.5 o risco da grande área
dele:

    equipa que bate     média -10.1   (do -29.7 ao +17.2)
    equipa que recebe   média +11.7   (do -17.9 ao +35.1)

Quem RECEBIA estava dentro da própria área, a 60 m da bola: o nível 2 continuava
ligado no GOAL_KICK e o bloco de quem não tem a bola está ancorado à própria
baliza. Ver `nivel2Activo` em match_loop.js.

Os quatro números são os EXTREMOS da faixa em que cada equipa é distribuída,
sempre no referencial de ataque de QUEM BATE. A forma da formação não se perde:
mantém-se a ordem em profundidade e o x, só se re-escala a profundidade.

    bateDe/bateAte      dos defesas à saída da área até aos avançados na
                        linha do meio-campo
    recebeDe/recebeAte  do primeiro homem à entrada da área dele (fora da
                        grande área, que é regra do lance) até à linha de trás
                        uns metros atrás do meio-campo, que é onde a bola
                        longa vai cair
*/
/*
=============================================================================
O TIRO DE META — as linhas, e a distância a que o outro marca
=============================================================================
Relato, com captura: *"a posição dos jogadores no tiro de meta não está boa.
Sem linhas definidas do time batedor. Marcação muito alta do time adversário."*

Isto eram quatro números (`bateDe: -34, bateAte: 2, recebeDe: -28,
recebeAte: 18`) e uma distribuição CONTÍNUA: cada jogador ia parar a um ponto
proporcional à ordem do posto dele na formação, entre os dois extremos. Dez
pontos diferentes ao longo de 36 metros não são linhas nenhumas. Medido
(`tools/headless/tiro_de_meta.js`, 8 lances):

    equipa que bate     média -11.0 m, de -28.4 a +9.5   (0 = meio-campo)
    equipa que recebe   média  +5.0 m, o mais recuado a -16.5

E o mais adiantado de quem recebe saía do `recebeDe: -28`, ou seja **25 m da
linha de fundo de quem bate**: a marcar em cima da área.

Agora é o mesmo desenho da cobrança do impedimento — três linhas pelo `role`
da formação (def/mid/atk), com as profundidades em metros da PRÓPRIA linha de
fundo — e quem recebe tem uma linha da frente própria, medida da mesma origem.
=============================================================================
*/
const GoalKickShape = {
    // Quem bate, em metros da própria linha de fundo. A grande área acaba aos
    // 16.5: os defesas ficam à saída dela, que é onde se recebe curto.
    linhaDefesa: 19.0,
    espacoParaOsMedios: 16.0,   // -> 35 m da linha, 18 antes do meio-campo
    avancadosAlemDoMeio: 0.0,   // na linha do meio-campo, onde a bola longa cai

    /*
    E A LINHA DA FRENTE DE QUEM RECEBE, na mesma origem: metros da linha de
    fundo de quem bate. Eram 25 (o `recebeDe: -28`), colada à área; passa a 38,
    que são 15 m antes do meio-campo. Continua a ser uma equipa a marcar a
    saída de bola — só não em cima da área.

    A Lei 16 (ninguém dentro da grande área até a bola estar em jogo) continua
    a ser garantida à parte, e é ela que manda em último lugar.
    */
    frenteDoBloco: 38.0,
    blocoAdversario: 26.0,      // profundidade do bloco, dessa linha para trás

    /*
    =====================================================================
    E ELE ESPERA QUE A EQUIPA CHEGUE ANTES DE BATER
    =====================================================================
    Relato, com captura: *"os jogadores do time com a bola ainda não estão se
    posicionando corretamente no tiro de meta"*.

    O desenho estava certo e nunca chegava a acontecer. Medido em 6 tiros de
    meta (`tools/headless/tiro_de_meta.js`), no instante em que o guarda-redes
    bate: o alvo médio da equipa dele era -20.8 m, e faltavam-lhe andar **17 a
    23 metros**, com metade dela ainda em MOVE_TO_POS. Aonde a bola caía,
    caía num campo a meio de uma mudança de posições — que é a captura.

    A causa: a cobrança era disparada só pelo relógio (`golKickAtrasoInicio`,
    3 s, em js/match/match_loop.js). O `golKickProntos` — a bandeira que o
    `updateGoalKickWait` levanta quando a equipa toda chegou ao lugar — não era
    LIDA por ninguém: calculava-se e morria ali.

    Agora o relógio só começa a andar depois de ela chegar, e este é o tecto
    para o caso de alguém ficar preso: ao fim dele bate-se de qualquer maneira.
    Oito segundos cabem com folga no prazo de segurança do lance
    (`SetPiecePrazos.tiroDeMeta`, 20 s), que é o que repõe o jogo se nada disto
    acontecer.
    */
    esperaMaxPelaEquipa: 8.0
};

/*
=============================================================================
A EQUIPA QUE DEFENDE UM LIVRE — a metade que ninguém colocava
=============================================================================
Relato, com captura de campo inteiro: "o posicionamento dos jogadores na batida
do impedimento tá bem ruim. Uns de um lado do campo e outros do outro."

O `setupSetPiece` do FREE_KICK escreve a posição do batedor, arruma os dez
companheiros dele em `lugares`, e da equipa que defende coloca **só a
barreira** — o resto leva um empurrão para fora dos 9.15 m e mais nada. Com a
falta longe da baliza a barreira é UM jogador, portanto nove ficavam onde a
jogada anterior os tinha deixado. Medido em 6 livres
(`tools/headless/livre_impedimento.js`):

    equipa            colocados pelo setup   a mais de meio campo da bola
    que bate                10.0 / 10                  3.0 / 10
    que recebe               1.0 / 10                  2.0 / 10

E o FREE_KICK está fora do `nivel2Activo()` de propósito (as posições são
impostas pelo lance), portanto ninguém os vinha arrumar no frame seguinte: o
que o setup não escrever fica escrito para o lance inteiro.

A faixa é medida A PARTIR DA BOLA, na direcção em que ela vai ser batida — e
não da linha de fundo, como no tiro de meta. Quem defende um livre põe-se entre
a bola e a própria baliza, começando na distância regulamentar.

`de` é 9.15 porque é a Lei 13 e não uma escolha: mais perto do que isso o
árbitro manda recuar. `ate` é a profundidade do bloco.
=============================================================================
*/
const FreeKickShape = {
    de: 9.15,     // distância regulamentar — o primeiro homem não pode estar antes
    ate: 34.0,    // o mais recuado do bloco, medido da bola
    /*
    E A FAIXA ENCOLHE QUANDO NÃO HÁ CAMPO. Com o livre perto da baliza que eles
    defendem, os 34 m caem atrás da linha de fundo e o clamp encostava o bloco
    todo lá. Medido: o lance seguinte apanhava-os fora do sítio — no tiro de
    meta a seguir ainda tinham 7.6 m para andar quando a bola foi batida.

    Esta margem é o espaço que fica para o guarda-redes atrás do bloco.
    */
    margemDaPropriaBaliza: 8.0
};

/*
=============================================================================
A MONTAGEM DA COBRANÇA DO IMPEDIMENTO
=============================================================================
Um livre por fora-de-jogo não é uma falta perto da baliza: não há barreira que
faça sentido, e o que ele é na prática é um RECOMEÇO — as duas equipas voltam
à forma antes de a bola andar outra vez.

O que havia media assim (`tools/headless/livre_impedimento.js` e um lote de 12
impedimentos reais): em três deles as DUAS equipas ficavam a 52-56 m da bola,
que é a captura do relato ("uns de um lado do campo e os outros do outro").
A razão é de construção: do lado de quem bate só o batedor era colocado — os
outros nove ficavam onde a jogada os tinha deixado — e a `formaDaDefesaNoLivre`
arruma a outra equipa a 9.15-34 m da bola *na direcção da baliza que ela
defende*, que num fora-de-jogo está no outro extremo do campo.

Os números são o pedido, à letra, num 4-4-2:

    "primeira linha de 4, com os 2 laterais a 5 metros à frente da grande área"
        a grande área acaba aos 16.5 da linha de fundo -> 21.5
    "segunda linha de 4, com os 2 meias laterais a 15 metros da linha de defesa"
    "terceira linha de 2, 5 metros depois da linha de meio-campo"
    "time adversário marcando a partir da linha de meio-campo"

As linhas saem do `role` da formação (def/mid/atk), portanto isto não é um
4-4-2 escrito à mão: numa formação com três centrais ou três avançados as
mesmas três profundidades continuam a valer.
=============================================================================
*/
/*
=============================================================================
A COBRANÇA DO IMPEDIMENTO — AS TRÊS LINHAS ANCORADAS NA BOLA
=============================================================================
TUDO AQUI SE MEDE A PARTIR DA BOLA, e é a correção de fundo desta montagem.

As linhas eram ABSOLUTAS: a de trás a 21.5 m da própria linha de fundo, os
médios 15 m à frente dela, os avançados 5 m para lá do meio-campo; e o bloco
de quem marca ancorado no meio-campo. Nenhum dos números olhava para onde a
bola estava — portanto a montagem só fazia sentido quando o impedimento
calhava perto dessas linhas.

Relato, com captura de ecrã: *"o posicionamento dos jogadores na cobrança de
impedimento ainda não faz sentido; tem BUG, uns jogadores de um lado do campo
e outros do outro"*. Medido com `tools/scratch/impedimento_sintetico.js`, que
provoca a cobrança em vários pontos e lê a distância à bola (média de cada
equipa, e quantos ficam na metade do campo oposta à da bola):

        bola z    quem COBRA          quem MARCA
         -40      54 m,  7/10         36 m,  2/10
         -20      37 m,  7/10         20 m,  2/10
           0      22 m,  0/10         17 m,  0/10
         +20      17 m,  2/10         30 m,  8/10
         +40      26 m,  2/10         49 m,  8/10

Ou seja: o defeito nunca foi corrigido, só mudou de sítio. No centro do campo
a montagem lia-se bem — e era exatamente esse o único caso que o teste
`impedimento_montagem` exercitava, com a bola sempre em z = -attDir * 30.

Agora as três linhas de quem cobra saem da BOLA, e o bloco de quem marca
também: a sua linha da frente nasce aos 9.15 m regulamentares da bola, do lado
da própria baliza, e o bloco estende-se para trás a partir daí.
=============================================================================
*/
/*
=============================================================================
O DRIBLE DE DEIXAR PASSAR
=============================================================================
Pedido, com a descricao do gesto: *"esse deixar passar e um tipo de drible em
que o jogador que esta pra receber a bola abre as pernas e deixa a bola passar
enquanto ja gira para correr atras dela. Ou seja, o marcador espera que o
adversario domine, mas ele gira quando a bola esta praticamente no seu pe de
dominio e engana o marcador"*.

O QUE ELE RESOLVE: *"quando um jogador recebe um passe, mesmo tendo muito
espaco a frente, ele mata a bola e meio que atrasa a jogada"*. O dominio custa
o tempo do gesto mais a re-aceleracao a partir de zero; deixar correr guarda o
embalo que a bola ja trazia.

AS QUATRO CONDICOES, e nenhuma delas e enfeite:

  1. A BOLA VEM DE TRAS e segue no sentido do ataque dele. Uma bola que vem
     de frente, deixada passar, e uma bola entregue.

  2. O DESTINO ESTA LIVRE. Pedido explicito: *"nao faz sentido deixar passar
     uma bola que vai para uma posicao onde tem adversario"*. Olha-se para
     onde ela VAI parar, nao para onde ela esta.

  3. HA UM MARCADOR PERTO. Sem ninguem a quem enganar isto nao e um drible, e
     so nao tocar na bola — e ai o dominio normal e melhor, porque deixa a
     bola controlada.

  4. A BOLA VEM DEPRESSA. Tambem pedido: *"a velocidade da bola tem que ser
     mais alta que a normal. Senao o jogador vai girar e a bola nao vai
     conseguir passar para ele pegar ela mais na frente"*. E a condicao mais
     dura das quatro, e e fisica: ele parte PARADO, gasta o tempo do giro e
     ainda tem de acelerar ate aos 8.0 m/s da corrida (GaitModel.correr.vel).
     Uma bola a 8 m/s nunca lhe fica a frente — afasta-se ao mesmo ritmo a que
     ele corre, com o atraso do giro a mais.

O RISCO NAO E INVENTADO. Nao ha sorteio de "falhou o drible": o que acontece e
que a bola fica SOLTA, e quem chegar primeiro a ela fica com ela — a disputa
normal do `resolveBallContact`. Se o marcador for mais rapido ou estiver melhor
colocado, a bola e dele, e isso e o castigo de ter tentado o gesto na altura
errada. E por isso que a condicao 3 existe: o gesto so se tenta quando ha
alguem por perto, ou seja, exactamente quando ha algo a perder.
=============================================================================
*/
const DribleDeixarPassar = {
    activo: true,

    /*
    Velocidade minima da bola. A corrida sao 8.0 m/s; abaixo de ~11 ele nao
    chega a ver a bola a frente dele. Ver a condicao 4 na nota acima.
    */
    velMin: 11.0,

    /*
    Quanto a bola tem de vir no SENTIDO do ataque dele, em m/s. Nao chega ir
    para a frente: tem de ir com intencao, senao um passe quase lateral
    qualificava-se.
    */
    vFrenteMin: 4.0,

    /*
    Onde ela vai parar: projecta-se a bola `tempoProjeccao` segundos a frente.
    Nao e a trajectoria fina — e a triagem de "para que lado e que isto vai".
    */
    /*
    MEDIDO, e foi o que baixou este numero de 1.2 para 0.5:

    a 1.2 s e com a bola a ~15 m/s, o destino ficava a ~18 m dele. Ele parte
    PARADO e a corrida sao 8.0 m/s; a mediana ate alguem tocar na bola e
    1.3 s. Nem lancado ele la chegava. Resultado em 29 gestos medidos: o autor
    do drible recuperou a bola em ZERO, e o adversario ficou com ela em 48%.
    O gesto estava a mandar a bola para um sitio que era de ninguem.

    Meio segundo sao ~7 m — a distancia que ele cobre de facto antes de a bola
    ser disputada.
    */
    tempoProjeccao: 0.5,

    /*
    Nenhum adversario a menos disto do ponto de chegada. Seis metros sao o
    espaco que ele precisa para chegar la primeiro tendo partido parado.
    */
    raioDestinoLivre: 6.0,

    /*
    E tem de haver um marcador a menos disto dele. Sem isto nao ha drible.
    */
    raioMarcador: 4.0,

    /*
    A FRACCAO DE VEZES QUE ELE TENTA, com a tecnica dele a mandar.

    Nao e a probabilidade de "acertar" o gesto — acertar ou falhar decide-se
    sozinho, na corrida atras da bola. E a frequencia com que ele SE LEMBRA de
    o fazer: um jogador de tecnica 100 ve a jogada quase sempre, um de 50 ve-a
    de vez em quando. Sem isto, toda a gente faria o gesto sempre que as
    quatro condicoes batessem, e um drible que sai sempre deixa de ser drible.
    */
    fraccaoBase: 0.35,      // a tecnica 50
    fraccaoPorTecnica: 0.45, // +- isto entre tecnica 0 e 100

    /*
    QUANTO TEMPO ELE FICA PROIBIDO DE TOCAR NA BOLA — e a trava que impede o
    gesto de morrer no frame seguinte, com o dominio normal a apanha-lo outra
    vez como o mais perto da bola.

    ESTEVE EM 1.2 s E ERA O QUE MATAVA O GESTO. Medido em 6 jogos com esse
    valor:

        tentativas                        29
        proximo toque e DELE               0   (zero)
        proximo toque e de um colega      48%
        proximo toque e do ADVERSARIO     45%
        tempo ate alguem tocar           1.3 s

    Ou seja: a carencia calava-o durante exactamente o tempo em que a bola era
    disputada, e quando expirava ela ja era de outro. O gesto existia na
    animacao e nunca na jogada.

    Agora e so o tempo do GIRO. Ele deixa de poder dominar no mesmo instante,
    que era o problema a resolver, e fica livre para ir buscar a bola antes de
    a disputa acabar — que e o ponto do drible.
    */
    carencia: 0.45,

    /*
    QUANTO TEMPO ELE CORRE ATRAS DA BOLA que deixou passar.

    O RUN_INTO_SPACE desconta isto a cada frame e desiste quando chega a zero.
    Estava por pôr — e sem ele a corrida abortava no primeiro frame, com o
    autor do drible a recuperar a bola em 0 de 29 gestos medidos.

    Tres segundos: o destino fica a ~18 m e ele parte parado, a acelerar ate
    aos 8.0 m/s da corrida. Perder a posse continua a abortar a corrida antes
    disto, portanto nao e um jogador amarrado a perseguir uma bola perdida.
    */
    duracaoCorrida: 3.0
};

if (typeof window !== 'undefined') window.DribleDeixarPassar = DribleDeixarPassar;

/*
=============================================================================
LER O PERCURSO DA BOLA — as faixas de alcance de cada gesto
=============================================================================
Pedido: *"os jogadores tem que saber reconhecer o percurso da bola. Seja ele
rasteiro ou no ar (parabola) para que eles tenham condicoes de programar a
cabecada (para os jogadores) ou o pulo com os bracos pra cima para os
goleiros. Os goleiros assim vao poder optar por segurar a bola ou dar um soco
na bola para longe. Sem isso fica impossivel para o goleiro e para a animacao
procedural esticar os bracos tentando alcancar o deslocamento da bola. Ou para
a perna do jogador tentar bloquear um passe ate uns 50 cms na altura. Ou para
um jogador tentar fazer um gol de peixinho"*.

O QUE JA HAVIA E O QUE FALTAVA. A fisica da previsao ja existe e e fiel —
`preverBolaEm`, `preverQuedaDaBola` e `preverBolaEmAltura` (utils.js) simulam
arrasto, quique e rolamento com as mesmas constantes do `updateBall`. O que
nao existia era a LEITURA: dado um jogador, em que instante do voo e que ele
consegue la estar, e a que altura estara a bola nesse instante — que e o que
decide se o gesto e perna, pe, peito, cabeca, peixinho, maos ou soco.

Cada gesto tem uma faixa de alturas. Algumas sao numeros do corpo humano e
estao aqui; outras SAO O PROPRIO CORPO do jogador e por isso nao podem ser
constantes — a testa de um central de 1.95 nao esta a mesma altura que a de um
lateral de 1.62. Essas derivam-se de `alturaTestaDe(p)` e da altura dele, e o
que aqui fica e so a folga a volta.

POR ORDEM DE ALTURA:

    perna/bloqueio    ate 0.50      a perna estendida a cortar um passe
    pe/rasteiro       0 a 0.35      bola no chao, dominio normal
    peixinho          0.80 a 1.20   cabeca em mergulho, o golo de peixinho
    peito             1.20 a 1.50   a matada no peito
    cabeca de pe      a testa       +/- `folgaTesta`
    cabeca com salto  ate a testa + `SaltoCabeceio.alturaMax`
    GK maos de pe     1.20 a 1.90   as maos a frente do corpo, sem saltar
    GK maos no alto   ate 2.07 acima da base + o salto dele
    GK soco           o mesmo alcance, menos `descidaDoSoco`

O SOCO E O AGARRAR PARTILHAM A ALTURA de propósito. O punho fechado nao chega
mais alto do que a mao aberta — chega com os bracos um pouco mais dobrados,
que e o que `descidaDoSoco` desconta. O que separa os dois gestos nao e a
altura, e a PRESSAO: agarra-se quando ha espaco, soca-se quando ha gente em
cima (ver GkSaidaCruzamento.raioSemMarcacao, que ja decide isso).
=============================================================================
*/
const AlcanceDaBola = {
    /*
    As faixas fixas, em metros acima do relvado. Sao do corpo humano medio e
    nao escalam com o jogador — a diferenca entre o peito de um homem de 1.62
    e o de um de 1.95 e menor do que a folga que estas faixas ja tem.
    */
    pernaMax: 0.50,          // bloqueio com a perna estendida
    peMax: 0.35,             // bola rasteira, dominio com o pe
    peitoMin: 1.20,
    peitoMax: 1.50,
    peixinhoMin: 0.80,
    peixinhoMax: 1.20,
    gkMaosMin: 1.20,
    gkMaosMax: 1.90,

    /*
    A FOLGA A VOLTA DA TESTA para o cabeceio de pe. A testa e um ponto, e um
    ponto nunca apanha uma bola: 20 cm para cada lado sao a bola a passar pela
    cabeca, e nao pelo pescoco (1.45) nem por cima do cranio (1.79).
    */
    folgaTesta: 0.20,

    /*
    Quanto o punho fica ABAIXO da mao aberta no mesmo salto. O soco da-se com
    os bracos um pouco dobrados — ver a nota acima sobre porque e que o soco e
    o agarrar nao se distinguem pela altura.
    */
    descidaDoSoco: 0.15,

    /*
    O ALCANCE HORIZONTAL de cada familia de gestos: a que distancia do ponto
    de encontro ele ainda toca na bola. Nao e o mesmo para todos — um peixinho
    cobre muito mais chao do que um pe parado, e e para isso que serve.
    */
    alcancePe: 0.80,
    alcanceCabeca: 0.80,     // = SaltoCabeceio.alcanceXZ
    alcancePeixinho: 1.80,   // o corpo estendido no ar
    alcanceGkMaos: 1.60,     // = GkSaidaCruzamento.alcanceSaida

    /*
    QUANTO TEMPO ELE PERDE ANTES DE ARRANCAR. Sem isto a leitura seria a de um
    jogador que ja sabia para onde ia a bola antes de ela sair — e todos
    chegariam a tudo.

    0.25 s e a reaccao simples de um atleta. Nao se confunde com o
    `gkDelayReacao`, que e o tempo de decisao do guarda-redes num remate e ja
    tem a skill dele dentro.
    */
    atrasoReaccao: 0.25,

    /*
    ATE QUE TEMPO SE OLHA PARA A FRENTE. Quatro segundos sao o voo mais longo
    que ha (um pontape de baliza); mais do que isso e a previsao ja nao vale
    nada, porque alguem toca na bola pelo caminho.
    */
    horizonte: 4.0,

    /*
    O PASSO da leitura. 1/60 e um frame: mais fino do que isto nao muda o
    gesto escolhido e custa o dobro das contas.
    */
    passo: 1 / 60
};

if (typeof window !== 'undefined') window.AlcanceDaBola = AlcanceDaBola;

const OffsideRestartShape = {
    /*
    QUEM COBRA — três linhas, no referencial de ataque dele e medidas da bola.
    A de trás fica ATRÁS da bola (há sempre a opção de recomeçar para trás),
    as outras duas à frente. Os espaçamentos são os de antes — 18 m da linha
    de trás aos médios, 16 dos médios aos avançados —, o que muda é o ponto
    de onde se contam.
    */
    defesaAtrasDaBola: 8.0,
    mediosAFrenteDaBola: 10.0,
    avancadosAFrenteDaBola: 26.0,

    /*
    QUANTOS FICAM ATRAS DA BOLA — pedido: *"na cobranca do impedimento eu quero
    somente 2 jogadores atras da linha da bola, entre a bola e o gol defendido,
    se o impedimento for marcado ate a linha da grande area. Se for dentro da
    linha da grande area para tras, todos os jogadores a frente da linha da
    bola."*

    Antes ficava atras da bola a LINHA DE DEFESA INTEIRA — os quatro, porque a
    profundidade saia so do posto (`porRole`). Um livre por impedimento e um
    recomeco: quer-se apoio atras para sair a jogar, nao meia equipa entre a
    bola e a propria baliza.

    Sao DOIS pontos da linha de fundo dele para fora, e ZERO da linha da grande
    area para tras — ai a bola ja esta em cima da propria baliza e nao ha nada
    de util atras dela; toda a gente sobe.

    NAO CONTAM PARA OS DOIS:
      . o guarda-redes, que fica na baliza e nao e colocado por esta montagem;
      . o BATEDOR, que espera 3 m atras da bola alinhado com a cobranca
        (`FreeKickModel.recuoBatedor`) porque e de la que vem bate-la — se
        contasse, a regra dava um unico jogador de apoio e a saida a jogar
        morria ali.
    */
    atrasDaBola: 2,
    atrasDaBolaNaArea: 0,

    /*
    Quem e empurrado para a frente da bola por causa da regra acima nao fica em
    cima dela: sobe pelo menos isto. A frente dos medios (`mediosAFrenteDaBola`)
    ninguem passa por este caminho — e um minimo, nao uma linha.
    */
    margemAFrenteDaBola: 4.0,

    /*
    QUEM MARCA. Era "do meio-campo para trás", à letra do primeiro pedido, e a
    resposta a ver o resultado foi *"na cobrança do impedimento o time
    adversário pode avançar um pouco mais. Tá muito recuado."* — depois disso
    passou a ancorar no meio-campo, que é o que esta correção tira.

    `blocoAdversario` é a profundidade do bloco, medida da linha da frente
    para trás. Essa linha já não é o meio-campo: é a distância regulamentar à
    bola (`FreeKickModel.afastaAdversarios`, 9.15 m), portanto o bloco fica
    sempre entre a bola e a própria baliza e à distancia da Lei 13, esteja a
    bola onde estiver. O empurrão dos 9.15 m no fim da montagem (ver
    `formaDoLivreDeImpedimento`) fica como rede de segurança.
    */
    blocoAdversario: 26.0,

    // Quanto do x do posto se mantém. 1.0 = a largura da formação, tal e qual.
    largura: 1.0
};

const ThrowInModel = {
    alcanceMin: 9.0,

    /*
    ELEVAÇÃO SEM DESTINATÁRIO — o lançamento para o espaço, que só quer
    distância. Sobe, e é suposto subir.
    */
    elevMin: 16 * Math.PI / 180,
    elevMax: 26 * Math.PI / 180,

    /*
    ELEVAÇÃO COM DESTINATÁRIO — quase rasante, e pode ser NEGATIVA.

    A bola sai das mãos a 1.82 m do chão. Com os 16°-26° do lançamento para o
    espaço ela SOBE primeiro, e é geometricamente impossível chegar ao peito
    (1.20 m) ou ao pé de alguém que a venha buscar: quem se aproxima encontra-a
    a caminho do apex. Medido, com a balística já a acertar no ponto pedido:

        altura de chegada ao receptor   1.85 m de média
        17 de 19 lançamentos acima da cabeça (>1.7 m)

    Um lateral para os pés é atirado a DESCER desde as mãos. Daí a faixa
    negativa: o `velocidadeParaAlturaNoAlvo` resolve a velocidade para a bola
    passar à altura pedida à distância pedida, e com a bola a descer desde a
    saída ela está sempre abaixo da cabeça de toda a gente.
    */
    elevAlvoMin: -8 * Math.PI / 180,
    elevAlvoMax: 4 * Math.PI / 180,

    /*
    MAS A FAIXA RASANTE SÓ VALE PARA O LATERAL AOS PÉS.

    Relato: *"tem cobranças de lateral com jogadores próximos muito fortes"*.
    Medido em 60 min, velocidade de saída por distância ao colega:

        0-5 m     6.0 m/s
        5-8 m     8.2 m/s
        8-12 m   24.2 m/s   (máximo 54.1)

    A fronteira é o `distanciaAosPes` (9 m): abaixo dele a bola vai aos PÉS
    (0.11 m) e cai 1.7 m desde as mãos, o que dá voo e velocidade baixa. Acima
    vai ao PEITO (1.20 m) e a queda passa a 0.62 m — a rasar, o voo encurta
    para ~0.4 s e cobrir 10 m exige 24 m/s. A física está certa; o que não
    está é atirar raso a um alvo ALTO.

    Um lateral ao peito é atirado com ARCO. Com o
    `velocidadeParaAlturaNoAlvo` a resolver a velocidade para a bola passar à
    altura pedida na distância pedida, o arco não traz de volta o defeito que
    a nota acima descreve (chegar por cima da cabeça): a bola chega na mesma a
    1.20 m, só que a descer de mais alto e muito mais devagar.

        elevação    velocidade para 10 m ao peito
          0 graus         26.5 m/s
          4 graus         18.8 m/s
         15 graus         12.5 m/s
         20 graus         11.3 m/s
    */
    elevPeitoMin: 14 * Math.PI / 180,
    elevPeitoMax: 22 * Math.PI / 180,

    /*
    E UM TECTO NA VELOCIDADE DE SAÍDA, que não havia.

    Os 54.1 m/s medidos não saem de nenhuma faixa de elevação: saem do ramo de
    recurso (`velocidadeDeLancamento`, e depois
    `sqrt(alcance·g / sin(2·elev))`) quando o solucionador falha. Com a
    elevação perto de zero esse `sin(2·elev)` vai a zero e a raiz explode.

    18 m/s é o braço humano no limite — um lateral longo de recorde anda pelos
    17. O tecto é a última linha de defesa contra uma conta que corre mal, e
    não o mecanismo normal: em uso, as faixas acima já entregam 6 a 13 m/s.
    */
    velocidadeMaxSaida: 18.0,

    /*
    ATÉ ONDE CHEGA UM LATERAL, POR STRENGTH — os dois extremos, escritos.

    Era `alcanceMax * (1 +/- forcaBraco)`, um multiplicador de +/-25% sobre 18
    m: o mais forte do plantel atirava a 22.5 m e o número que interessa (o
    alcance de quem tem STRENGTH 100) só se sabia fazendo a conta. Agora
    lê-se directamente, e é interpolação linear entre os dois.

    Ver alcanceMaximoDoLateral em utils.js.
    */
    alcanceMaxFraco: 12.0,   // STRENGTH 0
    alcanceMaxForte: 20.0,   // STRENGTH 100
    recuoDaLinha: 0.7,       // metros para lá da linha onde o batedor se põe

    /*
    QUEM COBRA, E POR QUE ORDEM — ver escolherBatedorDoLateral em match.js.

    Era o jogador de campo mais PERTO do ponto da linha, e num lateral no nosso
    meio-campo isso dá quase sempre o CENTRAL: o homem que menos devia estar a
    pôr a bola em jogo é o que fica com ela nas mãos, e a linha defensiva abre
    ao meio enquanto ele lá vai.

    A ordem é a do futebol: o LATERAL do lado, depois o MÉDIO DA ALA, depois o
    CM. Sem nenhum dos três — pode acontecer com expulsões ou formações sem
    médios de ala — cobra o mais perto, como sempre: um lance parado à espera
    de um batedor que não existe é pior do que um batedor imperfeito.

    `distanciaMaxBatedor` impede a outra ponta: chamar um lateral que está a 45
    m dali é o lance todo parado à espera dele. Além disso, passa-se ao
    seguinte da ordem.
    */
    ordemBatedor: {
        esquerda: ['LB', 'LM', 'CM'],
        direita: ['RB', 'RM', 'CM']
    },
    distanciaMaxBatedor: 25.0,

    /*
    QUEM SE APROXIMA, E QUANTO — distância mínima à bola, por posição, enquanto
    o lance decorre.

    O nível 2 fica ligado no THROW_IN e a mola de coesão puxa o bloco inteiro
    para a bola: o central sai da posição, o CM cola-se à linha, e num lance que
    precisa de duas ou três opções curtas aparecem seis — todas em cima umas das
    outras, todas marcadas pelo mesmo adversário.

    O central mantém a posição (por isso o número dele é grande: na prática
    nunca é puxado). O CM oferece-se, mas de longe. O médio da ala e o outro
    lateral são as opções curtas do lance e ficam DENTRO do `alcanceMin` — se
    também tivessem de ficar longe, trocava-se "toda a gente em cima" por
    "ninguém a quem jogar".
    */
    distanciaMinimaPorPos: {
        CB: 18.0, DC: 18.0,
        CM: 12.0, DM: 12.0,
        GK: 25.0
    },
    distanciaMinimaOmissao: 0.0,
    afastaAdversarios: 2.5,  // ninguém do outro lado a menos disto da bola

    /*
    QUANTO A EQUIPA QUE MARCA SOBE NO LATERAL (pedido: "para o time marcador
    pode avançar um pouco mais, está recuando muito").

    Sem isto ela usa o bloco defensivo de sempre, com o centro
    `BlockShape.recuoDoCentroSemBola` (5 m) atrás da linha da bola: o batedor
    ficava com toda a gente longe. A bola está PARADA na linha e há tempo de
    subir, portanto o rectângulo inteiro avança isto enquanto o estado for
    THROW_IN.

    Metros, no referencial de ataque da equipa que marca. Some-se ao
    `avancoNoMeioCampo` em computeBlock (team_bt.js) — é o mesmo mecanismo, um
    avanço rígido do bloco, e sobe também o tecto da última linha.

    A equipa que repõe não é tocada: o lugar do batedor é escrito à mão no
    setupSetPiece e os companheiros dela já são puxados pelo `apoio*`.
    */
    avancoDosMarcadores: 6.0,

    /*
    ALVO EM ALTURA. O lateral é cobrado nos PÉS do receptor ou no PEITO dele, e
    a escolha é a distância: curto põe-se no pé, para ele sair a jogar já; mais
    longo procura o peito, que é o alvo grande e o que se protege de costas.

    A altura do peito NÃO tem constante própria — é a `BallControl.peitoAltura`
    que a recepção usa. Se fossem duas, podiam divergir e a bola chegaria fora
    da faixa `peitoYMin`/`peitoYMax` que dispara o `controlarNoPeito`: mirava-se
    o peito e ele dominava com o pé.

    Ver velocidadeDeLancamento em utils.js — a balística passou a resolver um
    ponto (distância, altura), em vez da fórmula de alcance, que só vale com a
    altura de chegada igual à de saída e portanto nunca mirou nada.
    */
    distanciaAosPes: 9.0,

    /*
    ANTECIPAÇÃO DO RECEPTOR — ver lancarLateral (player.js).

    `velocidadeTipica` é a velocidade horizontal média de um lateral, usada só
    para estimar o TEMPO de voo antes de se saber a velocidade real (que
    depende do alcance, que depende do ponto, que depende do tempo). Medida:
    um lateral de 9 m sai a ~11 m/s e leva ~0.85 s, ou seja ~10.5 m/s de média
    horizontal.

    `antecipacaoMax` é o tecto do tempo projectado: sem ele, um receptor a
    correr e um lançamento longo mandavam a bola para um ponto onde ele nunca
    chegaria.
    */
    velocidadeTipica: 10.5,
    antecipacaoMax: 1.2,

    /*
    O APOIO QUE NÃO RECEBEU, E O JOGO FOI PARA O OUTRO LADO.

    Quem sobe a dar apoio no lateral fica adiantado. Se a bola sair dali e
    atravessar o corredor central para a outra banda, ele ficou à frente da
    jogada com a equipa a defender do lado oposto — é o buraco por onde entra o
    contra-ataque. Pedido: recua um pouco, para estar pronto se a bola se
    perder.

    `recuoAposApoio`  metros atrás do posto dele, no referencial de ataque.
    `recuoDuracao`    quanto tempo a regra vale depois do lance. Não é para
                      sempre: passado isto o lance acabou e o posicionamento
                      normal já o pôs onde tem de estar.
    `recuoGatilhoX`   o "meio do corredor central" — a bola tem de passar daqui
                      para o outro lado. É zero: o eixo do campo.
    */
    recuoAposApoio: 6.0,
    recuoDuracao: 12.0,
    recuoGatilhoX: 0.0,

    /*
    APOIO AO BATEDOR. Os companheiros ficavam nos slots do bloco, a vinte e
    tal metros, e o lateral saia para ninguem — via-se no ecra o batedor
    sozinho com meio campo a frente.

    `apoioQuantos` mais proximos sao puxados para a faixa `apoioMin`..
    `apoioMax` em volta dele.

    DOIS, e nao tres. A tres via-se meia equipa a convergir para a mesma linha
    lateral — o batedor com tres companheiros a cinco metros e o resto do campo
    vazio. Dois chegam para dar as duas opcoes que um lateral tem: o apoio
    curto e a linha de fuga.

    A faixa e a distancia util de um lateral curto: abaixo de `apoioMin` estao
    em cima do batedor e nao abrem linha nenhuma; acima de `apoioMax` ja e um
    lancamento longo, que tem os seus proprios problemas de precisao.
    */
    apoioQuantos: 2,
    apoioMin: 5.0,
    apoioMax: 10.0,

    /*
    ERRO DE EXECUÇÃO, por TEC de quem repõe. Não havia nenhum: a direcção saía
    exacta para o alvo e a única variação era o sorteio uniforme da elevação,
    que muda a trajectória mas não a pontaria. Um jogador de TEC 20 repunha tão
    bem como um de TEC 90.

    `sigmaMax` fica um pouco abaixo dos ~9° do passe (PassErrorModel): o lateral
    é curto e feito com as duas mãos, de pé parado. `sigmaMin` existe porque nem
    o melhor executante é exacto.

    O peso é um erro à parte, sobre a DISTÂNCIA alvo — cai curta ou passa o
    receptor. Ver sigmaDeLateral em utils.js.
    */
    sigmaMax: 0.117,         // rad (~6.7°) a TEC 0 (reduzido 10%)
    sigmaMin: 0.018,         // rad (~1.0°) a TEC 100 (reduzido 10%)
    sigmaPeso: 0.09,         // desvio relativo no alcance a TEC 0 (reduzido 10%)
    pesoMin: 0.6,            // cortes do erro de peso, para não sair absurdo
    pesoMax: 1.4
};

/*
distanciaMinimaNoLateral foi movida para js/utils.js (ver docs/auditoria_config_match.md item 5).
*/

const PerceptionModel = {
    // Só reage quem lá chega depressa. Acima disto é bola para o chaser, não
    // para toda a gente — senão a equipa inteira colapsa sobre a bola.
    janelaIntercetar: 1.2,
    // E só se for claramente melhor do que quem já vai lá (chaser/destinatário),
    // em segundos de vantagem.
    margemMelhor: 0.15,
    // Distância a partir da qual se considera que a bola JÁ passou o
    // destinatário do passe e ele deixa de ser dono da jogada.
    passePerdidoDist: 4.0,

    /*
    PRAZO DA BOLA PARADA JUNTO AO DESTINATÁRIO.

    O `passeMorreuParaODestinatario` (utils.js) começa por desistir quando a
    bola está a menos de `passePerdidoDist` dele: perto do destinatário o passe
    conta como entregue, e o resto do teste nem corre. Só que "perto dele" não
    é "no pé dele" — a bola pode parar a três metros e ele não lhe tocar (ficou
    à espera da queda, o alvo dele era outro ponto, um adversário meteu-se pelo
    meio).

    E aí ninguém a vai buscar: `bolaSolta` exige `!intendedReceiver`
    (deveMandarChaser, team_bt.js), portanto a equipa não designa perseguidor —
    e o destinatário, esse, já parou. Bola quieta no relvado com gente à volta,
    que é o que se via junto à linha lateral.

    Passado este prazo com a bola parada e sem ninguém lhe tocar, o passe
    caduca e ela volta a ser uma bola solta como outra qualquer.
    */
    prazoBolaParada: 1.2
};

// Segundos que a equipa SEM bola espera, depois de a perder, antes de
// reavaliar chaser/marcação — ligado ao selector "Defensive Pressure".

/*
=============================================================================
RITMO DE REPOSICIONAMENTO — quanto se corre SEM bola
=============================================================================
O `actHoldPosition` (ocuparPosicao + marcar: 66% do tempo de jogo medido em
lote) pedia 7.43 m/s a mais de 2 m do alvo e 4.73 m/s dentro desses 2 m. Ou
seja o PISO era 4.7 m/s: ninguém andava nunca. O lote de 20 jogos dava 50 km
por equipa em 18 minutos — 22.7 km por jogador por 90 minutos, o dobro dos
10-12 km de um jogo a sério, e isso arrasta tudo o resto para cima (mais
passes, mais faltas, mais duelos por minuto).

Um jogador de futebol passa a maior parte do jogo a andar e a trotar, e
sprinta em rajadas curtas. O ritmo tem de sair da DISTÂNCIA que falta:
recuperar 30 m é um sprint, ajustar 2 m é andar. Os valores são a velocidade
de cruzeiro em m/s — o `steerArrive` trava sozinho à chegada.

`ganhoSkill` é quanto a velocidade (SPD 0-100) mexe no cruzeiro, em fracção:
±20% entre um jogador lentíssimo e um rapidíssimo.
=============================================================================
*/
const RepositionPace = {
    // [distância mínima ao alvo, m/s de cruzeiro], da mais longe para a mais perto.
    /*
    +15% sobre a tabela calibrada — foi +30% e MEDIU-SE MAL.

    O +30% (com o GAME_SPEED a 1.035 ao mesmo tempo) deu o relato "o jogo tá
    estranho, meio sem objetivo, os times ficam trocando bola sem saber o que
    querem fazer". Medido em lotes de 300 s, 4 corridas por versão:

        versão                        trocas de posse/90   passes por posse
        antes da sessão                       101                3.27
        +30% e GAME_SPEED 1.035               141                2.70
        +15% e GAME_SPEED 0.9                 101                3.14

    Toda a gente a chegar 30% mais depressa é o defensor a chegar 30% mais
    depressa: mais interceptações, posses de 2.7 passes, e a bola a saltar de
    equipa para equipa sem jogada nenhuma. Não é um defeito de decisão — as
    árvores estão iguais — é ritmo a mais para as distâncias do campo.

    Valores da calibração original: 6.8 / 4.4 / 2.6 / 1.5 e um GK a 2.6.
    */
    /*
    [distância mínima ao alvo, m/s de cruzeiro], da mais longe para a mais perto.

    O escalão do ANDAR era o de baixo dos 3 m e passou a ser o de baixo dos
    2 m (pedido: "velocidade de andar só a <= 2 metros"). O metro que sobrou
    ficou para o trote curto — a faixa dos 2 aos 10 m é onde se acerta a
    posição dentro do bloco, e a andar isso levava 1.7 s por metro.
    */
    escaloes: [
        [25.0, 7.82],  // fora de posição: sprint de recuperação
        [10.0, 5.06],  // trote
        [2.0, 2.99],   // trote curto
        [0.0, 1.73]    // já posicionado: andar
    ],
    ganhoSkill: 0.20,
    // Contra-ataque: a transição é a rajada, aqui sim.
    bonusContraAtaque: 1.25,

    /*
    E SAIR A JOGAR DE TRÁS. Com a bola nas mãos do guarda-redes a equipa tem
    oito segundos para lhe dar opções — medido, andava a 3.6 m/s de média com
    18% dos companheiros parados, e 46% das leituras tinham alguém atrás dele.
    Quem lê a marca é o `actReposition` (player_bt.js); quem a escreve é o
    `tickFinal` (team_bt.js), no mesmo sítio onde põe o piso à frente dele.
    */
    bonusSaidaDeBola: 1.25,

    /*
    E UM PISO, porque a pressa multiplicativa nao chega ao fim do percurso.

    Relato, segunda passagem: "quando o goleiro pega a bola os jogadores tem
    que se posicionar mais rapido... tem jogadores andando em campo." A marca
    da pressa chega a toda a gente (medido: 100% das leituras), mas o ritmo sai
    da DISTANCIA ao alvo, e abaixo dos 2 m o escalao e o de andar — 1.73 m/s,
    ou 2.16 com o bonus. Medido em 74 min: 25% das leituras abaixo de 3 m/s, e
    94% desses ja estavam a menos de 5 m do proprio alvo. Quem estava longe
    corria (5.71 m/s de media): os que se veem a andar sao os que estao a
    acabar de se oferecer.

    O piso vale enquanto ele segura a bola e enquanto ainda faltar mais do que
    `pisoSaidaDeBolaDist` — chegado ao sitio, anda-se, senao ele oscila em cima
    do alvo.
    */
    pisoSaidaDeBola: 4.6,
    pisoSaidaDeBolaDist: 1.2,

    /*
    RECUAR É UMA RAJADA TAMBÉM — o contrário do contra-ataque, e faltava.

    Relato: "a defesa está recuando muito devagar e está se embolando com o
    meio campo". O ritmo saía só da distância ao alvo, sem olhar para o
    SENTIDO: um central com o alvo 12 m atrás dele ia a 5.06 m/s, o mesmo
    trote com que um médio faz um ajuste lateral de 12 m. Só que o médio tem
    tempo e ele não — enquanto ele trota, o bloco já passou por cima dele, e é
    isso que o embola com a linha da frente.

    `bonusRecuo` só se aplica quando o alvo está atrás dele NO SEU
    REFERENCIAL DE ATAQUE (ou seja, na direcção da própria baliza) e a mais
    de `recuoMinimo` — perto do alvo o `steerArrive` trava sozinho e acelerar
    ali só produz o vaivém que já se corrigiu noutros sítios.
    */
    bonusRecuo: 1.35,
    recuoMinimo: 4.0,

    /*
    =====================================================================
    E FECHAR A LINHA DA BOLA COM A BALIZA É PRESSA
    =====================================================================
    Relato: *"o jogador do block tem que ir mais rápido para fechar a linha da
    bola com o gol, está muito lento"*.

    E está. Medido em 30 min de jogo, 1292 amostras de quem está em BLOCKING:

        distância ao alvo    speedMult   velocidade real
            0-2 m              1.97         1.63 m/s
            2-5 m              3.05         2.74 m/s
            5-10 m             3.40         3.30 m/s
           10+  m             6.11         5.14 m/s

        desvio da linha bola-baliza   4.49 m de média
        amostras a mais de 3 m fora   768 de 1292

    A 5-10 m do sítio onde tem de estar ele vai a 3.3 m/s, que é trote. A
    razão é o ritmo sair do `cruzeiro` genérico, e para o cruzeiro genérico
    5-10 m é um ajuste sem urgência — é a distribuição certa para quem se está
    a recolocar, e a errada para quem está a deixar a baliza aberta.

    `pisoBloqueio` é um CHÃO, como o `pisoSaidaDeBola`: não impede o cruzeiro
    de pedir mais em distâncias grandes, só impede que peça menos. 6.8 m/s é o
    escalão do sprint de recuperação, que é o que fechar a linha é.

    `pisoBloqueioDist` existe pela mesma razão que o do `pisoSaidaDeBola`:
    chegado ao sítio, o `steerArrive` tem de poder travar, senão ele oscila
    em cima do alvo a 6.8 m/s.
    */
    pisoBloqueio: 6.8,
    pisoBloqueioDist: 1.5,
    // O guarda-redes anda quase sempre — reposiciona-se, não corre o campo.
    velocidadeGK: 2.99,

    cruzeiro: function (dist, skillSpeed) {
        let base = this.escaloes[this.escaloes.length - 1][1];
        for (const [d, v] of this.escaloes) {
            if (dist >= d) { base = v; break; }
        }
        const f = 1 + ((skillSpeed - 50) / 50) * this.ganhoSkill;
        return base * f;
    }
};

/*
=============================================================================
STAMINA — o cansaco, que ate aqui era so um numero no HUD
=============================================================================
A `stamina` e a `fitness` vinham de `data/player_skills.js` desde sempre e
NINGUEM as lia: o unico sitio do codigo que lhes tocava era o HUD
(`main.js`, a barra de cinco segmentos). Um atributo que se mostra e nao faz
nada e pior do que nao existir — le-se como se estivesse a contar.

O MODELO, em tres pecas:

1. GASTA-SE COM O QUADRADO DA VELOCIDADE. O custo metabolico da corrida nao e
   linear: andar quase nao pesa, sprintar pesa muito. `expoente` manda nisso e
   `vRef` e a corrida contra a qual o custo se mede.
2. RECUPERA-SE EM BAIXO DE `limiarDescanso`, que e a parte do jogo que se
   passa a andar ou parado. A `fitness` entra aqui: quem esta em forma
   recupera mais depressa entre esforcos.
3. CUSTA VELOCIDADE E CUSTA SKILL. `quedaVelocidade` e quanto a velocidade
   maxima cai com o deposito vazio; `quedaSkill` sao os pontos de atributo
   que se perdem (so nos campos fisicos e tecnicos — ver CAMPOS_CANSAVEIS em
   player.js). Um jogador cansado nao fica so mais lento: erra mais.

O RELOGIO E O DO JOGO, nao o real. O `update` do jogador corre em segundos
reais e o `MatchDuration.timeScale` comprime 90 minutos de relogio em ~18 de
movimento; se o gasto corresse no relogio real, mexer no `GAME_SPEED` mudava o
cansaco sem ninguem pedir. Aqui multiplica-se por `timeScale`, portanto um
jogo sao sempre 5400 segundos de desgaste.

MEDIDO com estes valores, um jogo de 90 minutos (1188 s a GAME_SPEED 0.99):

    25% do jogo   deposito medio 0.911   min 0.804   no chao 0/22
    50% do jogo                  0.837       0.654             0/22
    75% do jogo                  0.785       0.509             0/22
    fim                          0.729       0.503             0/22

O `max` fica em 1.000 o jogo todo, e esta certo: e o guarda-redes, que quase
nao corre. O `min` e quem corre por todos — e, pelo que ja se mediu noutra
frente, o CM, que faz 47% das disputas do jogo.

COMO CALIBRAR: o lote (`Sim.run`) traz `energiaFinal` por equipa em cada jogo.
O que NAO pode acontecer e alguem encostar ao `minimo` — dali para a frente o
deposito e uma constante e o modelo deixa de ter efeito. Se o `no chao` sair
de zero, sobe-se a `recuperaPorSegundo` antes de mexer no `custoPorSegundo`:
o que falha nesse caso e a recuperacao entre esforcos, nao o custo deles.
=============================================================================
*/
const StaminaModel = {
    ligada: true,

    vRef: 6.5,                  // m/s: a corrida contra a qual o custo se mede
    expoente: 2.0,              // custo ~ (v/vRef)^expoente
    custoPorSegundo: 0.00042,    // fraccao de deposito por segundo de JOGO a vRef, com stamina 50
    sensibilidadeStamina: 0.5,  // stamina 100 gasta metade; stamina 0, metade a mais

    limiarDescanso: 2.0,        // m/s abaixo do qual recupera
    recuperaPorSegundo: 0.00016,
    sensibilidadeFitness: 0.5,

    minimo: 0.50,               // chao do deposito: ninguem anda a metade do passo
    quedaVelocidade: 0.15,      // -15% de velocidade maxima com o deposito vazio
    quedaSkill: 8               // pontos de atributo perdidos com o deposito vazio
};
