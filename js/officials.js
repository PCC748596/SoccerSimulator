/*
=============================================================================
EQUIPA DE ARBITRAGEM — árbitro e dois assistentes
=============================================================================
Ficheiro auto-contido de propósito: os árbitros não entram em `Match.players`
nem em `Match.opponents`, não têm blackboard, não passam pelo BT, não disputam
a bola e não colidem com ninguém. Tudo o que fazem é ir para um ponto e animar
a passada. Metê-los nas listas dos jogadores obrigaria a filtrá-los em cada
ciclo que percorre um plantel — e são dezenas.

POSICIONAMENTO

  Assistentes: cada um cobre METADE de uma linha lateral, e as duas metades
  são diagonalmente opostas. Cada um acompanha a linha de fora-de-jogo da sua
  metade, que é o SEGUNDO ÚLTIMO jogador da equipa que ali defende — a mesma
  definição que o `publicarLinhaDeForaDeJogo` do Match usa, mas calculada aqui
  para não depender do estado de posse (o assistente segue a linha esteja ou
  não a equipa a atacar).

  Árbitro: corre a DIAGONAL contrária, a que o deixa sempre do lado oposto ao
  do assistente daquela metade. Com o assistente 1 em +X na metade -Z e o
  assistente 2 em -X na metade +Z, a diagonal do árbitro vai de (-X, -Z) a
  (+X, +Z).

  A diagonal é a do LATERAL DIREITO ao PONTA ESQUERDA do TeamB — de (+X, +Z) a
  (-X, -Z). O árbitro projecta a bola nela e depois AFASTA-SE ao longo dela até
  ficar na coroa entre `RefereeModel.raioMin` e `raioMax` (20 a 25 m da bola).
=============================================================================
*/
const RefereeModel = {
    /*
    Diagonal do árbitro, em fracção da meia-largura e do meio-campo.

    É a diagonal do LATERAL DIREITO ao PONTA ESQUERDA do TeamB (vermelho): esse
    lado ataca -Z, portanto a sua direita é +X e o lateral direito fica em
    (+X, +Z); o ponta esquerda fica no canto oposto, (-X, -Z). É a mesma recta
    percorrida nos dois sentidos, e é a que deixa o árbitro sempre do lado
    contrário ao do assistente daquela metade.

    Os extremos são LARGOS (0.68 → ±23 m) e não muito FUNDOS (0.75 → ±40 m),
    porque são as posições de um lateral e de um extremo, não das bandeirolas
    de canto.
    */
    diagonalX: 0.68,
    diagonalZ: 0.75,

    /*
    A COROA À VOLTA DA BOLA — entre que dois raios o árbitro vive.

    Pedido: *"vamos criar um circulo de 25 metros de raio ao redor da bola e
    outro de 20 metros. O juiz vai ficar correndo desse espaço entre os 2
    circulos"*.

    Era um número só, `distanciaBola: 15`, e um só número quer dizer uma
    circunferência: qualquer metro a mais ou a menos era erro a corrigir, e ele
    passava o jogo a corrigi-lo. Com dois raios há uma FAIXA, e dentro dela não
    há nada a corrigir — o raio só se mexe quando ele sai dela (ver
    `pontoDoArbitro`). É também o que lhe tira o vaivém: metade dos passos que
    ele dava eram a apertar ou a largar centímetros.

    O RUMO continua a ser a diagonal; a coroa manda só na DISTÂNCIA.
    */
    raioMin: 20.0,           // mais perto do que isto, afasta-se
    raioMax: 25.0,           // mais longe do que isto, aproxima-se
    /*
    Folga até à linha, para o alvo da coroa nunca cair fora do campo: com a bola
    encostada à linha de fundo, 20 m para o lado de lá sairia do relvado.
    */
    margemDoCampo: 1.5,
    /*
    Colocação inicial do árbitro: junto ao círculo central, do lado da sua
    diagonal — entre as duas linhas que se formam para o pontapé de saída. 12 m
    põe-no logo por fora do círculo (raio 9.15) sem ficar longe do lance.
    Depois do arranque passa a mandar a coroa (`raioMin`/`raioMax`).
    */
    distanciaInicial: 12.0,
    raioCirculoCentral: 9.15,
    velocidade: 7.5,         // m/s, ritmo de quem acompanha o jogo

    // Assistentes: quanto ficam PARA FORA da linha lateral.
    margemLinha: 1.4,
    velocidadeAssistente: 8.5,

    /*
    ZONA MORTA COM HISTERESE, e um filtro na velocidade da animacao.

    Sem isto o boneco TREMIA sempre que o alvo estabilizava. A conta: o passo
    de um frame e `min(d, velMax*amp*dt)`, portanto perto do alvo o passo e o
    proprio `d`, e a velocidade que alimenta o ciclo de passada e `d/dt` — com
    dt de 1/60, seis centimetros dao 3.6 m/s. O movimento parava em d <= 0.05 e
    a animacao ligava em vel > 0.1, ou seja a velocidade saltava entre 0 e ~3
    m/s sem nada pelo meio. Alvo a oscilar dois centimetros = correr/parar a
    cada frame, com o ressalto vertical a acompanhar.

    `paragemMax` e onde se considera chegado; `arranqueMin` e o quanto o alvo
    tem de se afastar para valer a pena voltar a andar. Serem DIFERENTES e o
    ponto: com um so limiar volta o mesmo tremor, mais fino.

    MAS A FOLGA TEM DE SER PEQUENA. Esteve em 0.25/0.60 e trocou o tremor por
    SOLAVANCOS nos assistentes: o alvo deles corre ao longo da linha atras da
    bola, portanto afasta-se SEMPRE — com 60 cm de folga o boneco esperava,
    acumulava distancia e arrancava de repente para a recuperar, em ciclo.
    Quem tem um alvo em movimento continuo precisa de sair logo atras dele.

    O tremor nao volta porque quem o resolve nao e esta folga: e o
    `suavizacaoVel`, que filtra a velocidade vista pela ANIMACAO. Era ela que
    saltava entre 0 e ~3 m/s num passo curto e ligava e desligava o ciclo de
    passada a cada frame. A zona morta so evita os micro-passos.

    A MARGEM E ESTREITA, e esta medida (tests/arbitro_passada.test.js):

        0.25 / 0.60   sem tremor, mas 3.0 m/s de solavanco
        0.10 / 0.18   sem tremor, ainda 3.0 m/s de solavanco
        0.06 / 0.10   sem tremor, sem solavanco     <- aqui
        0.04 / 0.07   volta o tremor

    Mexer nestes dois numeros sem correr o teste e reintroduzir um dos dois.
    */
    /*
    EM QUANTO TEMPO ele quer fechar o que falta, em segundos. É isto que dá a
    velocidade de cada frame: `d / tempoDeAjuste`, limitada a `velocidade`.

    Serve duas coisas ao mesmo tempo, e é por isso que é um tempo e não uma
    distância: ele TRAVA a chegar (em vez de ir a sete metros por segundo até
    ao último centímetro e parar de repente) e a fronteira entre correr e dar
    passo de lado passa a ser contínua — ela cai onde `d / tempoDeAjuste` vale
    `LateralGait.velViragem`, ou seja a 3.1 m, e nesse ponto a velocidade é a
    mesma dos dois lados.

    Um corte seco pela distância (`d <= 3`) dava um degrau de 6.9 m/s num
    frame, apanhado por tests/arbitro_passada.test.js — o árbitro arrancava e
    parava de repente a seguir um alvo que anda sempre à mesma velocidade.
    */
    tempoDeAjuste: 0.85,

    /*
    E NUNCA DE COSTAS PARA A BOLA — em graus, o máximo que a frente dele pode
    afastar-se da direcção da bola.

    Relato: *"o juiz ainda está correndo de costas para a bola"*. É o preço da
    correcção anterior: pô-lo a olhar para onde corre resolveu o deslize, e
    trouxe isto — quando o alvo dele está do lado oposto ao do jogo, virar-se
    para o alvo é virar as costas ao lance. Medido em 15 min: **19.5% dos
    frames com a bola a mais de 90 graus da frente dele, e 11.8% a mais de
    135** (de costas).

    Um árbitro corre ABERTO: leva o corpo de lado, atravessado, e não perde a
    bola de vista. 110 graus é esse limite — a bola fica na periferia, nunca
    atrás. O que sobra do caminho faz-se de lado, e a `LateralGait` já trata
    disso (a passada encolhe e a velocidade com ela, que é o que acontece a
    quem corre atravessado).

    Só vale para quem tem um ponto para vigiar (o árbitro, com a bola). Os
    assistentes correm na linha e não recebem `olharPara`.
    */
    anguloMaxDaBola: 110 * Math.PI / 180,
    paragemMax: 0.06,
    arranqueMin: 0.10,
    suavizacaoVel: 0.20,

    /*
    Equipamento, preto por agora. Em texto e não em hexadecimal numérico: o
    `buildBody` dos jogadores pinta as texturas da camisola e dos meiões num
    canvas 2D, e o canvas quer uma cor CSS.
    */
    corCamisa: '#14161a',
    corCalcao: '#14161a',
    corBota: '#0f1114',

    /*
    DISCOS DA VISTA TACTICA. De 40 m de altura o boneco le-se mal, e os
    jogadores ja aparecem como discos da cor da equipa (ver updateShirt em
    player.js) — sem isto os arbitros eram os unicos bonecos no meio de vinte e
    dois discos, e ficavam a parecer o que nao sao.

    Preto com amarelo, que e o equipamento de arbitro. O RAIO E O MESMO dos
    jogadores (ver a CircleGeometry do discoTatico em player.js): de cima, um
    disco mais pequeno lia-se como estando mais longe.

    `R` de arbitro, `A` de assistente — as duas letras que cabem num disco
    deste tamanho sem encolherem ate deixarem de se ler.
    */
    discoRaio: 0.85,
    discoFundo: '#101216',
    discoLinha: '#f2c400',

    /*
    =========================================================================
    FALTAS E CARTÕES
    =========================================================================
    Spec em docs/superpowers/specs/2026-08-25-faltas-e-cartoes-design.md.

    Alvo: 27,63 faltas e 5,22 cartões por jogo de 90 minutos, com 0,08
    vermelhos. Nada disto existia — o `triggerFreeKick` estava escrito mas só
    o botão do painel o chamava.

    DUAS FONTES de falta, e a calibração delas é ACOPLADA: as duas somam para
    a mesma média, portanto subir uma obriga a descer a outra. Por isso existe
    a `escala`, que multiplica ambas e deixa mexer no TOTAL sem tocar no
    equilíbrio entre elas.
    */
    faltas: {
        /*
        Multiplicador global das duas fontes. Sobe ou desce o total de faltas
        por jogo sem mudar a proporcao entre desarme e contacto.

        HISTORICO DA AFINACAO (medido em lotes de 20 jogos de 90 min, com
        1080 s de fisica por jogo — ver GAME_SPEED e MatchDuration):

            1.0   dava 4,65 faltas por jogo
            4.3   pedidas 20 por jogo

        O salto e grande porque o raio de accionamento do chaser
        (MarkingModel.raioDeAccionamento) cortou a perseguicao constante, e com
        ela os duelos de onde saem as faltas. Menos rush, menos contacto: o
        numero de faltas e o preco directo dessa mudanca, e este multiplicador
        e onde se paga.
        */
        escala: 4.3,

        /*
        FONTE A — o duelo perdido. O desfecho já existe (venceuDuelo, em
        utils.js) e hoje não custa nada a quem falha; agora custa.

        O carrinho é muito mais punido do que o desarme de pé porque é o que
        acontece no jogo: o corpo vai no chão, em movimento, e quem falha a
        bola acerta na perna.
        */
        /*
        E O DUELO PERDIDO SO E FALTA SE HOUVER CONTACTO.

        O desfecho do duelo resolve-se no instante em que o carrinho e
        LANCADO, e o corpo ainda vem a caminho: media medida, o apito saia
        com **2.32 m entre os dois** (mediana 2.34, maximo 2.61), contra 0.90
        no desarme e 0.91 no choque. Metade das faltas de um jogo eram assim,
        e o que se via era o arbitro a marcar falta a dois jogadores que nao
        se tocaram — o relato.

        `raioDuelo` e a distancia a que a perna ainda alcanca o adversario:
        mais larga do que o raio do choque (1.0 m), porque num carrinho o
        corpo esta esticado, mas nao tanto que apanhe quem passou ao lado.
        */
        raioDuelo: 1.6,
        /*
        O carrinho esta no tecto: 0.15 x escala 4.3 = 0.645 de probabilidade
        por carrinho falhado dentro do raio. Subir mais (ou subir a `escala`,
        que o multiplica) leva-o para cima de 1 sem ganhar falta nenhuma — a
        margem para mais faltas esta no desarme e no contacto, nao aqui.
        */
        probCarrinhoFalhado: 0.15,
        /*
        0.030 -> 0.075. Medido: 49 desarmes de pe tentados por jogo davam 2.6
        faltas, quando o carrinho (35 tentados) dava 6.1. O desarme de pe
        falhado tem de custar mais do que custava.

        E e por AQUI que se sobe o resto do caminho para as 27.63, e nao pelo
        contacto: o desarme tem gravidade base 0.14 contra os 0.10 do choque,
        portanto rende falta E cartao, que e a metrica que fica para tras
        quando o jogo se enche de contactos.
        */
        probDesarmeFalhado: 0.075,

        /*
        FONTE B — o contacto sem tentativa de desarme: empurrões e choques.

        `raio` é a distância a que dois corpos se tocam; `velRelMin` é a
        velocidade relativa abaixo da qual o encontro é só um roçar. O
        `arrefecimento` impede que o mesmo par marque falta atrás de falta
        enquanto continua encostado — sem ele um único choque dava dezenas.

        `raioDisputa` só deixa o contacto ser falta se a bola estiver perto
        do lance. Sem isto dois jogadores a correr um contra o outro longe da
        bola produziam falta só porque se encostaram — por exemplo após um
        passe para trás em que já não há disputa.
        */
        contacto: {
            raio: 1.0,
            /*
            4.5 -> 3.2 m/s. Este limiar foi calibrado quando o piso da
            velocidade de reposicionamento era 4.73 m/s e toda a gente andava
            sempre a correr; com o `RepositionPace` (player_behavior.js) a
            media por jogador passou de 4.3 para 3.1 m/s, e dois jogadores a
            trote deixaram de chegar aos 4.5 de velocidade relativa. A fonte
            secou por causa disso: 3.9 faltas de contacto por jogo.

            3.2 e o trote contra o trote — um encontro a essa velocidade e um
            choque, nao um rocar.
            */
            velRelMin: 3.2,

            /*
            QUEM VEM PELAS COSTAS E QUE COMETE A FALTA, seja qual for a
            velocidade. Angulo em radianos entre a frente de um e a direccao
            de onde o outro vem: 0 de frente, PI pelas costas.

            O infractor era escolhido SO pela velocidade — "quem entra e quem
            vai mais depressa". Relato: *"Um atacante estava com a bola, quase
            dentro da area, e na hora que ia chutar foi marcado falta contra
            ele. O marcador estava atras dele, ninguem a frente."* E e o que
            acontecia: um atacante a arrancar para rematar vai mais depressa
            do que o defesa que o persegue, portanto ficava ele o infractor —
            a levar o toque nas costas e a ser punido por isso.

            Medido com `tools/lab/falta_pelas_costas.js`, em 30 min de jogo:

                semente 1   20 faltas de contacto, 1 com o portador punido
                            e o adversario ATRAS dele
                semente 3   29 faltas de contacto, 2 do mesmo caso

            A velocidade continua a decidir o ombro a ombro e o encontro de
            frente, onde nenhum dos dois vem de tras. So quando UM deles vem
            claramente pelas costas do outro e que a geometria manda na
            velocidade.

            2.0 rad sao 115 graus: nao e "ligeiramente atras", e mesmo por
            tras do ombro. Dois jogadores lado a lado ficam perto de PI/2
            (90 graus) e nao entram nesta regra.
            */
            anguloPelasCostas: 2.0,
            /*
            0.035 -> 0.075, medido em passos de 207 min de relogio:

                0.035   12.6 faltas por jogo, 3.05 cartoes
                0.075   22.6 faltas por jogo, 3.05 cartoes
                0.095   33.0 faltas por jogo, 1.73 cartoes  <- passou do alvo

            O 0.095 nao foi rejeitado so por passar as 27.63: os CARTOES caem
            quando se empurra tudo para esta fonte. O contacto tem gravidade
            base 0.10 (ver `gravidade.base`) e quase nunca chega a amarelo, ao
            contrario do carrinho (0.35). Encher o jogo de choques da muitas
            faltas e um jogo sem cartoes — e os cartoes ja estao a 58% do alvo.
            */
            prob: 0.075,
            arrefecimento: 3.0,
            raioDisputa: 3.5
        },

        /*
        GRAVIDADE: quatro parcelas somadas. Serve só para decidir o cartão.

        `pesoAngulo` usa 0 de frente e π por trás, portanto entra a dobrar num
        carrinho pelas costas. `travouAtaque` é a falta táctica.
        */
        gravidade: {
            base: { carrinho: 0.35, desarme: 0.14, contacto: 0.10 },
            pesoVelocidade: 0.020,   // por m/s do contacto
            pesoAngulo: 0.30,        // × (angulo / π)
            /*
            travarAtaque SAIU DAQUI (era 0.25).

            Travar um ataque promissor e amarelo pela Lei 12 — nao por o lance
            ser violento, mas por ter tirado um ataque ao adversario. Somado a
            gravidade misturava as duas coisas, e das duas maneiras erradas: um
            carrinho por tras a travar somava 1.08 e escorregava para o pe do
            vermelho, e um empurrao tactico, que e o amarelo mais comum de um
            jogo a serio, nunca chegava la porque a gravidade dele e baixa por
            natureza. Num lote de 30 jogos: 1.42 amarelos contra 5.22, com 68%
            das faltas a serem contactos cujo tecto (0.74) fica abaixo do
            limiar. A regra esta agora no `decidirCartao`.
            */

            /*
            O JOGADOR também conta, não só o lance.

            `pesoMarcacao` DESCE a gravidade: quem marca bem entra com o tempo
            certo e leva mais bola do que perna, portanto a falta que comete
            é mais limpa. `pesoForca` SOBE-a: no mesmo lance, um jogador forte
            magoa mais.

            Os dois entram normalizados a partir de 50 — a skill média — e
            saturam nos extremos: um defensor de marcação 100 tira
            `pesoMarcacao` inteiro à gravidade, um de 0 soma-o.
            */
            pesoMarcacao: 0.14,
            pesoForca: 0.12
        },

        /*
        LIMIARES, calibrados contra uma corrida de 2 jogos de 25 minutos.

        A PRIMEIRA CALIBRAÇÃO FALHOU, e vale a pena saber porquê: dava ~12,6
        vermelhos e ~34 amarelos por 90 minutos, contra 0,08 e 5,22. O erro
        foi tratar o carrinho por trás como caso excepcional quando ele é o
        caso COMUM — o fsm.js garante que um carrinho por trás nunca rouba a
        bola, portanto falha sempre, portanto vira falta sempre. Com o
        `pesoAngulo` a somar e o limiar de vermelho em 1.05, davam-se
        vermelhos DIRECTOS a eito (uma equipa fez 0 amarelos e 3 vermelhos).

        Agora, com o carrinho a deslizar a 9 m/s (SlideTackleModel):

            carrinho de frente       0.35 + 0.18            = 0.53   nada
            carrinho por trás        0.35 + 0.18 + 0.30     = 0.83   nada
            idem, lançado a 11.7     0.35 + 0.234 + 0.30    = 0.88   AMARELO
            idem, de um forte (95)   0.88 + 0.108           = 0.99   VERMELHO

        O limiar do vermelho desceu de 1.10 para 0.95 quando o `travarAtaque`
        saiu da gravidade: sem essa parcela nenhum lance chegava a 1.10 e o
        vermelho directo deixava de existir. Continua a exigir o pior gesto
        possivel — carrinho lançado, pelas costas, de um jogador forte.

        O vermelho DIRECTO fica assim quase inalcançável — como deve ser:
        quase todos os vermelhos reais saem do segundo amarelo.
        */
        limiarAmarelo: 0.85,
        limiarVermelho: 0.95,

        /*
        Ate onde atras e que um ataque ainda conta como promissor, em metros a
        contar do meio-campo para a propria baliza (referencial de quem ataca).
        Uma falta a 40 m da baliza adversaria trava um ataque; a mesma falta a
        cinco metros da propria area trava uma saida a jogar, que nao e o mesmo.
        */
        zMinAtaquePromissor: 15.0,

        /*
        Velocidade minima, em m/s, com que o portador tem de ir para a frente
        para o ataque contar como promissor. E um jogador LANCADO, nao um a
        andar com a bola: 3.0 e trote.

        Calibrado pela FRACCAO de faltas carimbadas, que nao depende de o
        simulador ter menos faltas que um jogo a serio: o real sao 5.22 cartoes
        em 27.63 faltas, ou seja 18.9%. Varrido numa corrida de 148 min:

            velMin 3.0   42.9% das faltas
            velMin 4.0   28.6%
            velMin 4.5   ~19%   <- aqui
            velMin 5.0   11.4%
            velMin 6.0    2.9%
        */
        velMinAtaquePromissor: 4.5
    },

    /*
    =========================================================================
    O GESTO DO BRACO — para que lado e a falta
    =========================================================================
    A etiqueta diz O QUE foi marcado; o braco diz A FAVOR DE QUEM. Na
    arbitragem real e o gesto que segue o apito: braco direito estendido na
    direccao do ataque da equipa que beneficia.

    Duas geometrias diferentes, e por isso dois angulos:

      elevacaoSinal    falta. O braco na HORIZONTAL indica um SENTIDO — a
                       baliza atacada fica longe, e apontar para baixo nao
                       diria nada.
      elevacaoPenalti  penalti. Aqui nao se aponta um sentido, aponta-se um
                       SITIO: a marca, no chao, a poucos metros. O braco desce
                       para a diagonal.

    A convencao do braco e a do THROW_IN_CLIP: rotation.x MAIS NEGATIVO leva o
    braco para cima e para tras; zero e o braco caido ao lado do corpo.
    */
    elevacaoSinal: -Math.PI / 2,   // 90 graus: horizontal
    elevacaoPenalti: -1.0,         // ~57 graus: diagonal para o chao
    duracaoSinal: 2.5,
    /*
    A que distancia do ponto designado o arbitro conta como "no lugar" — usado
    pelo gesto que espera por ele (ver `ateChegar` em sinalizar).
    */
    raioNoLugar: 1.5,
    marcaPenaltiZ: 11.0,           // distancia da marca a linha de fundo
    suavizacaoBraco: 0.25,

    /*
    Com que rapidez o CORPO roda para ficar de perfil para o alvo durante o
    gesto da falta (ver tickSinal). Fracção por frame, como a do braço: a 0.15
    a volta de 90 graus leva pouco mais de meio segundo, dentro dos 2.5 s do
    gesto e sem o arbitro estalar de lado no frame do apito.
    */
    suavizacaoCorpoSinal: 0.15
};

const Officials = {
    arbitro: null,
    assistentes: [],
    _ativo: true,

    /*
    Corpo: o MESMO modelo dos jogadores. Instancia-se um `FootballPlayer` só
    para nos dar `model` + `rig`, com o equipamento todo preto.

    O construtor do FootballPlayer é seguro para isto: não se inscreve em lado
    nenhum, não toca no `Match`, e o que acrescenta à cena são dois sprites
    (etiqueta e banner) que nascem invisíveis dentro do próprio `model`. O
    `discoTatico` do FootballPlayer — esse sim vive na cena — é criado dentro
    do `updateShirt`, que nunca chamamos: um árbitro não leva número nas
    costas. O disco da vista táctica é outro, feito aqui em `criarDisco` com as
    cores e a letra dele.

    Os ossos têm os mesmos nomes (`lLeg`, `rKnee`, `lArm`, `chest`…), por isso o
    `mover()` aqui em baixo não muda nada.
    */
    criarCorpo: function (id) {
        const R = RefereeModel;
        const jogador = new FootballPlayer(id, R.corCamisa, R.corCalcao, 'TeamA');

        /*
        As chuteiras saem do baralho de aparências (`escolherAparencia`) e vêm
        às cores. Aqui pintam-se de preto: recalcula-se a mesma aparência para
        saber QUE cor procurar, e trocam-se só os materiais com essa cor — a
        pele, o cabelo e os olhos ficam intactos.
        */
        if (typeof escolherAparencia === 'function') {
            const ap = escolherAparencia(id, 11, 0);
            const alvoBota = new THREE.Color(ap.corChuteira).getHex();
            jogador.model.traverse(function (o) {
                if (!o.material || !o.material.color) return;
                if (o.material.color.getHex() === alvoBota) {
                    o.material = o.material.clone();
                    o.material.color.set(R.corBota);
                }
            });
        }

        return { corpo: jogador.model, rig: jogador.rig, jogador: jogador };
    },

    /*
    O DISCO DA VISTA TACTICA, com a letra ja rodada.

    Vive na CENA e nao dentro do `model`: assim nao sobe nem roda com o
    boneco, fica sempre pousado no relvado — a mesma razao por que o disco dos
    jogadores tambem vive la fora.

    A letra leva `rotate(-PI/2)` no canvas pela mesma razao que a dos
    jogadores: o disco esta deitado (`rotation.x = -PI/2`) e sem isso a letra
    aparecia de lado para quem olha de cima.
    */
    criarDisco: function (scene, etiqueta) {
        const R = RefereeModel;
        const cv = document.createElement('canvas');
        cv.width = 128; cv.height = 128;
        const c = cv.getContext('2d');

        c.fillStyle = R.discoFundo;
        c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.fill();

        // Duas linhas: o aro de fora e um anel fino por dentro. So o aro
        // ficava a ler como um disco de jogador com outra cor.
        c.strokeStyle = R.discoLinha;
        c.lineWidth = 8;
        c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.stroke();
        c.lineWidth = 3;
        c.beginPath(); c.arc(64, 64, 46, 0, Math.PI * 2); c.stroke();

        c.fillStyle = R.discoLinha;
        c.font = 'bold 54px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.save();
        c.translate(64, 64);
        c.rotate(-Math.PI / 2);
        c.fillText(etiqueta, 0, 0);
        c.restore();

        const disco = new THREE.Mesh(
            new THREE.CircleGeometry(R.discoRaio, 24),
            new THREE.MeshBasicMaterial({
                map: new THREE.CanvasTexture(cv),
                transparent: true,
                depthWrite: false
            })
        );
        disco.rotation.x = -Math.PI / 2;
        disco.visible = false;
        scene.add(disco);
        return disco;
    },

    criarOficial: function (scene, id, etiqueta) {
        const feito = this.criarCorpo(id);
        scene.add(feito.corpo);
        return {
            model: feito.corpo,
            rig: feito.rig,
            animTimer: 0,
            disco: this.criarDisco(scene, etiqueta),
            /*
            A INSTANCIA, e nao so o `model`.

            O corpo do arbitro e um FootballPlayer e vinha a ser deitado fora
            aqui — ficava so o `model`. Mas e na instancia que vive o
            `showActionBanner` e o sprite do banner (que ja e filho do `model`,
            portanto ja esta na cena a ser desenhado). Guarda-la e o que
            permite escrever a marcacao por cima dele; ver `anunciar`.
            */
            jogador: feito.jogador
        };
    },

    init: function (scene) {
        if (this.arbitro) return;
        this.arbitro = this.criarOficial(scene, 0, 'R');
        this.assistentes = [this.criarOficial(scene, 1, 'A'),
                            this.criarOficial(scene, 2, 'A')];
        this.colocarInicial();
    },

    /*
    Coloca os três no sítio LOGO no arranque, em vez de os deixar nascer em
    (0,0) e virem a correr do meio do campo até à posição — que era o que se
    via nos primeiros segundos.

    Assistentes: já sobre a linha de impedimento da metade que cobrem.
    Árbitro: `distanciaInicial` da bola, sobre a sua diagonal e por fora do
    círculo central.
    */
    colocarInicial: function () {
        if (!this.arbitro) return;
        if (typeof Match === 'undefined' || !Match.ball ||
            !Match.players || !Match.players.length) return;

        const R = RefereeModel;
        const meiaLarg = CAMPO_LARG / 2;

        const zA = this.linhaDeImpedimento(Match.players, 1);
        const zB = this.linhaDeImpedimento(Match.opponents, -1);

        this.assistentes[0].model.position.set(
            meiaLarg + R.margemLinha, 0,
            THREE.MathUtils.clamp(zA, -(CAMPO_COMP / 2), 0));
        this.assistentes[1].model.position.set(
            -(meiaLarg + R.margemLinha), 0,
            THREE.MathUtils.clamp(zB, 0, CAMPO_COMP / 2));

        const bola = Match.ball.position;
        const ax = -meiaLarg * R.diagonalX, az = -(CAMPO_COMP / 2) * R.diagonalZ;
        const bx = meiaLarg * R.diagonalX, bz = (CAMPO_COMP / 2) * R.diagonalZ;
        const dx = bx - ax, dz = bz - az;
        const comprimento = Math.hypot(dx, dz);

        // Ponto da diagonal mais perto da bola, recuado `distanciaInicial`.
        let t = ((bola.x - ax) * dx + (bola.z - az) * dz) / (comprimento * comprimento);
        t = THREE.MathUtils.clamp(t - R.distanciaInicial / comprimento, 0, 1);
        let px = ax + dx * t, pz = az + dz * t;

        // Nunca dentro do círculo central.
        const dCentro = Math.hypot(px, pz);
        if (dCentro < R.raioCirculoCentral) {
            const k = (dCentro > 0.001) ? (R.raioCirculoCentral + 1.0) / dCentro : 1;
            px *= k; pz *= k;
        }
        this.arbitro.model.position.set(px, 0, pz);

        // Virados para a bola, para não nascerem de costas.
        const olhar = (o) => {
            o.model.rotation.y = Math.atan2(
                bola.x - o.model.position.x, bola.z - o.model.position.z);
        };
        olhar(this.arbitro);
        olhar(this.assistentes[0]);
        olhar(this.assistentes[1]);
    },

    /*
    SEGUNDO ÚLTIMO jogador de uma equipa, medido a partir da baliza dela: é
    esta a linha que o assistente acompanha. Inclui o guarda-redes, porque a
    regra conta jogadores e não funções — com o GK na baliza, o segundo último
    acaba por ser o defesa mais recuado, que é o que se quer.
    */
    linhaDeImpedimento: function (lista, dirZ) {
        const zs = [];
        for (let i = 0; i < lista.length; i++) {
            const p = lista[i];
            if (p && p.model) zs.push(p.model.position.z * dirZ);
        }
        if (zs.length < 2) return 0;
        zs.sort(function (a, b) { return a - b; });   // do mais recuado ao mais adiantado
        return zs[1] * dirZ;                          // o segundo mais recuado
    },

    /*
    =====================================================================
    FORA-DE-JOGO — os dois tempos da Lei 11
    =====================================================================
    Ver OffsideModel (config/defense.js) para a regra escrita por extenso.
    Aqui ficam as tres pecas:

      marcarPosicoesDeImpedimento  chamada quando a bola SAI do pe de quem
                                   passa: congela quem estava em posicao
      limparImpedimento            apaga as marcas (bola de um adversario,
                                   bola parada, golo)
      verificarImpedimento         chamada no primeiro toque: se quem tocou
                                   estava marcado, e infraccao

    A linha e a `linhaDeImpedimento` que ja existia para posicionar o
    assistente — o segundo adversario mais recuado, com o guarda-redes a
    contar, que e exactamente a definicao da regra.
    =====================================================================
    */
    marcarPosicoesDeImpedimento: function (passador, destinatario) {
        const M = (typeof OffsideModel !== 'undefined') ? OffsideModel : null;
        if (!M || !M.activo || !passador || typeof Match === 'undefined') return;
        // So em jogo corrido: canto, lateral e pontape de baliza nao tem
        // fora-de-jogo, e a bola parada resolve-se noutro sitio.
        if (Match.state !== 'PLAY') return;

        const dir = passador.dirZ;
        const colegas = (passador.team === 'TeamA') ? Match.players : Match.opponents;
        const advs = (passador.team === 'TeamA') ? Match.opponents : Match.players;
        if (!colegas || !advs || advs.length < 2) return;

        /*
        A `linhaDeImpedimento` ordena por `z * dirZ` e devolve o SEGUNDO MAIS
        RECUADO — recuado no referencial de quem DEFENDE. Por isso leva o dirZ
        dos adversarios (`-dir`), e nao o de quem passa.

        Com o sinal trocado ela devolvia o segundo mais ADIANTADO, ou seja uma
        linha la atras, e quase toda a gente aparecia em fora-de-jogo: medido,
        97 impedimentos por jogo contra os 3.2 de um jogo a serio. Com tres
        adversarios em campo os dois calculos coincidem — foi por isso que o
        teste unitario nao apanhou o erro.
        */
        const linhaDir = this.linhaDeImpedimento(advs, -dir) * dir;
        const bolaDir = Match.ball.position.z * dir;
        const tol = M.tolerancia;

        this._impedidos = [];
        this._passeParaImpedido = null;
        for (const p of colegas) {
            if (p === passador || !p.model) continue;
            const zDir = p.model.position.z * dir;
            // Na propria metade nunca ha impedimento; em linha com a bola ou
            // com o penultimo adversario tambem nao (dai a tolerancia).
            if (zDir <= 0) continue;
            if (zDir <= bolaDir + tol) continue;
            if (zDir <= linhaDir + tol) continue;
            const marca = {
                jogador: p,
                x: p.model.position.x,
                z: p.model.position.z,
                team: p.team
            };
            this._impedidos.push(marca);

            /*
            O PASSE DIRIGIDO A QUEM ESTA EM POSICAO JA E A INFRACCAO.

            A posicao fixa-se no lancamento, e o que acontece a seguir nao a
            desfaz: se um central corta, se o guarda-redes agarra, se a bola sai
            pela linha — foi impedimento na mesma, e a cobranca e no sitio onde
            ele estava quando o passe saiu.

            Sem isto era preciso ele TOCAR na bola, e media-se o resultado:
            16 jogadores apanhados em posicao ao longo de 3.3 jogos, e apenas
            **1** chegou a tocar — porque um atacante em fora-de-jogo e, por
            construcao, um mau alvo de passe e quase sempre alguem lhe chega
            primeiro. Contando so os toques, a regra existia e nao se via.
            */
            if (destinatario && p === destinatario) this._passeParaImpedido = marca;
        }
    },

    limparImpedimento: function () {
        this._impedidos = null;
        this._passeParaImpedido = null;
    },

    /*
    O passe ia para alguem em posicao de impedimento? Entao a infraccao esta
    determinada, e quem toca a seguir e irrelevante. Chamado no primeiro toque
    (resolveBallContact) e quando a bola sai de campo.

    Devolve true se marcou.
    */
    resolverPasseParaImpedido: function () {
        const marca = this._passeParaImpedido;
        if (!marca) return false;
        this._passeParaImpedido = null;
        return this.assinalarImpedimento(marca);
    },

    /*
    Devolve true se marcou impedimento (e ja montou o livre). O chamador tem de
    abortar o toque nesse caso: a bola passa a ser da outra equipa.
    */
    verificarImpedimento: function (jogador) {
        /*
        O passe ia para um impedido: a infraccao esta decidida desde o
        lancamento, e nao interessa quem chegou primeiro a bola — um central a
        cortar, o guarda-redes a agarrar, ou a bola a sair.
        */
        if (this._passeParaImpedido) return this.resolverPasseParaImpedido();

        const marcas = this._impedidos;
        if (!marcas || !marcas.length || !jogador) return false;

        // Bola tocada por um adversario de quem passou: a jogada morre aqui e
        // as marcas deixam de valer (a regra so olha para o passe do colega).
        const daEquipaDoPasse = marcas[0].team === jogador.team;
        if (!daEquipaDoPasse) { this.limparImpedimento(); return false; }

        const marca = marcas.find(m => m.jogador === jogador);
        if (!marca) { this.limparImpedimento(); return false; }

        this.limparImpedimento();
        return this.assinalarImpedimento(marca);
    },

    /*
    Marca a infraccao: conta na ficha, poe a bola ONDE ELE ESTAVA no instante
    do passe e monta o livre INDIRECTO para a defesa.
    */
    assinalarImpedimento: function (marca) {
        if (!marca || typeof Match === 'undefined') return false;
        this.limparImpedimento();

        if (typeof MatchStats !== 'undefined' && MatchStats.registarImpedimento) {
            MatchStats.registarImpedimento(marca.team);
        }

        Match.ball.position.set(marca.x, BallPhysics.raio, marca.z);
        Match.ballVel.set(0, 0, 0);
        Match.ballCarrier = null;
        Match.intendedReceiver = null;
        Match.faltaIndirecta = true;

        const contra = (marca.team === 'TeamA') ? 'TeamB' : 'TeamA';
        Match.setupSetPiece('FREE_KICK', contra);
        if (this.anunciar) this.anunciar('OFFSIDE');
        if (typeof EfeitosSonoros !== 'undefined') EfeitosSonoros.apito(1.0);
        return true;
    },

    /*
    Onde o árbitro quer estar: o RUMO sai da diagonal dele, a DISTÂNCIA sai da
    coroa à volta da bola (`raioMin`/`raioMax`). Devolve {x, z}.
    */
    pontoDoArbitro: function (bola) {
        const R = RefereeModel;

        /*
        PENÁLTI: posição fixa, não a diagonal. À esquerda do batedor, no
        cruzamento da lateral da pequena área com o alinhamento da marca
        (ver PenaltyModel.arbitroX).

        Esquerda de quem olha para a baliza: o batedor ataca no sentido
        `dirZ`, e com o Y para cima a mão esquerda aponta para x = +dirZ.
        */
        if (typeof Match !== 'undefined' && Match.state === 'PENALTY' &&
            Match.setPieceTaker && typeof PenaltyModel !== 'undefined') {
            const PM = PenaltyModel;
            const attDir = Match.setPieceTaker.dirZ;
            const linhaGol = attDir * (CAMPO_COMP / 2);
            return { x: PM.arbitroX * attDir, z: linhaGol - attDir * PM.marcaZ };
        }

        /*
        CANTO: a MESMA posição do penálti, do lado OPOSTO à cobrança.

        Pedido: *"no corner, o juiz tem que se posicionar do lado oposto à
        cobrança, na mesma posição do penálti"*. E é a colocação real: dali ele
        vê o cruzamento a chegar de frente, tem a baliza e o aglomerado todo
        entre ele e o batedor, e não fica na trajectória de ninguém. Do lado do
        canto, ficaria atrás da jogada a ver as costas de vinte e dois.

        A diagonal normal (mais abaixo) punha-o a 20-25 m da bola, portanto
        fora da área e do lado do batedor: a pior das duas coisas.

        AS MEDIDAS SÃO AS DO PENÁLTI, e de propósito — o pedido é explícito em
        querer a mesma posição, e escrever aqui um x e um z próprios era ter
        dois sítios a dizer a mesma coisa e a divergir no dia em que um deles
        mudasse. O único acrescento é o SINAL do x, que passa a ser o contrário
        do lado do canto.

        O LADO DO CANTO LÊ-SE DO `cantoBolaAlvo` e não da bola: no instante em
        que o canto é marcado a bola ainda está a rolar para fora do campo (ver
        o countdown em match_loop.js), e o x dela nessa altura pode já estar do
        outro lado. O alvo é a quina onde ela vai ser reposta, que é o que
        define de que lado se bate.
        */
        if (typeof Match !== 'undefined' && Match.state === 'CORNER_KICK' &&
            Match.setPieceTaker && typeof PenaltyModel !== 'undefined') {
            const PM = PenaltyModel;
            const attDir = Match.setPieceTaker.dirZ;
            const linhaGol = attDir * (CAMPO_COMP / 2);
            const xDoCanto = (Match.cantoBolaAlvo && typeof Match.cantoBolaAlvo.x === 'number')
                ? Match.cantoBolaAlvo.x : bola.x;
            const lado = Math.sign(xDoCanto) || 1;
            return { x: -lado * PM.arbitroX, z: linhaGol - attDir * PM.marcaZ };
        }

        const ax = -(CAMPO_LARG / 2) * R.diagonalX, az = -(CAMPO_COMP / 2) * R.diagonalZ;
        const bx = (CAMPO_LARG / 2) * R.diagonalX, bz = (CAMPO_COMP / 2) * R.diagonalZ;

        const dx = bx - ax, dz = bz - az;
        const len2 = dx * dx + dz * dz;

        let t = ((bola.x - ax) * dx + (bola.z - az) * dz) / len2;
        t = THREE.MathUtils.clamp(t, 0, 1);

        const px = ax + dx * t, pz = az + dz * t;

        /*
        =================================================================
        ELE FICA NA DIAGONAL, À DISTÂNCIA DA COROA
        =================================================================
        Pedido: *"vamos criar um circulo de 25 metros de raio ao redor da bola
        e outro de 20 metros. O juiz vai ficar correndo desse espaço entre os 2
        circulos"*.

        A diagonal continua a dizer POR ONDE ele anda — é o sistema de
        arbitragem e é o que o mantém fora do meio do lance. A coroa diz A QUE
        DISTÂNCIA. Cruzam-se resolvendo uma coisa só: qual é o ponto DA
        DIAGONAL que fica a `raio` metros da bola.

        Em contas: com `h` a distância da bola à diagonal (a perpendicular) e
        `raio` a hipotenusa, o cateto que falta é `sqrt(raio² - h²)`, e é esse
        o afastamento ao longo da diagonal a partir do pé da perpendicular.
        Dois pontos servem, um para cada lado; fica o que está mais perto de
        onde ele já está, senão atravessava o campo de cada vez que a bola
        mudasse de metade.

        O CASO SEM SOLUÇÃO é a bola mais longe da diagonal do que o próprio
        raio (bola encostada à linha lateral): aí nenhum ponto da diagonal
        serve, e o que manda é a coroa — ele sai da diagonal e vai direito à
        distância certa. É o que um árbitro faz mesmo quando o jogo se encosta
        à linha.

        Uma tentativa anterior punha o alvo em `bola + direcção_da_diagonal *
        raio`. Não serve: essa direcção é a PERPENDICULAR à diagonal, portanto
        troca de sentido de repente sempre que a bola cruza a diagonal — e o
        árbitro atravessava o campo a correr atrás dela.
        */
        const arb = this.arbitro;
        const distActual = arb && arb.model
            ? Math.hypot(arb.model.position.x - bola.x, arb.model.position.z - bola.z)
            : (R.raioMin + R.raioMax) / 2;

        /*
        O RAIO PEDIDO, e é aqui que a faixa vale alguma coisa:

            dentro da coroa   fica o raio que ele já tem, e o alvo só desliza
                              AO LONGO dela — ele corre à volta do lance em vez
                              de entrar e sair;
            fora da coroa     volta ao MEIO da faixa, e não à borda que
                              atravessou. Encostado à borda, o primeiro metro
                              que a bola andasse na direcção dele punha-o fora
                              outra vez; pelo meio ele tem 2.5 m de folga dos
                              dois lados.
        */
        const raio = (distActual >= R.raioMin && distActual <= R.raioMax)
            ? distActual
            : (R.raioMin + R.raioMax) / 2;

        const h = Math.hypot(px - bola.x, pz - bola.z);
        const comprimento = Math.sqrt(len2) || 1;

        let alvoX, alvoZ;
        if (h >= raio) {
            // Sem ponto na diagonal à distância certa: manda a coroa.
            const k = (h > 0.001) ? raio / h : 0;
            alvoX = bola.x + (px - bola.x) * k;
            alvoZ = bola.z + (pz - bola.z) * k;
        } else {
            const cateto = Math.sqrt(raio * raio - h * h) / comprimento;   // em unidades de t
            const t1 = THREE.MathUtils.clamp(t - cateto, 0, 1);
            const t2 = THREE.MathUtils.clamp(t + cateto, 0, 1);
            const p1x = ax + dx * t1, p1z = az + dz * t1;
            const p2x = ax + dx * t2, p2z = az + dz * t2;

            let usa1 = true;
            if (arb && arb.model) {
                const d1 = Math.hypot(p1x - arb.model.position.x, p1z - arb.model.position.z);
                const d2 = Math.hypot(p2x - arb.model.position.x, p2z - arb.model.position.z);
                usa1 = (d1 <= d2);
            } else {
                // No arranque não há "onde ele está": fica do lado de onde a
                // jogada não está, como era antes.
                usa1 = (bola.z >= 0);
            }
            alvoX = usa1 ? p1x : p2x;
            alvoZ = usa1 ? p1z : p2z;
        }

        const limX = CAMPO_LARG / 2 - R.margemDoCampo;
        const limZ = CAMPO_COMP / 2 - R.margemDoCampo;
        return {
            x: THREE.MathUtils.clamp(alvoX, -limX, limX),
            z: THREE.MathUtils.clamp(alvoZ, -limZ, limZ)
        };
    },

    /*
    Desloca um oficial para o alvo e anima a passada com o ciclo do jogo.

    `olharPara` (opcional, {x, z}) é o ponto que o oficial quer ter debaixo de
    olho — para o árbitro, a bola. Sem isso vira-se para onde anda.

    ORIENTAÇÃO, e porque não é simplesmente "olha sempre para a bola": prender o
    corpo à bola em plena corrida põe o ciclo de passada frontal por cima de uma
    deslocação de lado, e o boneco DESLIZA. Medido em
    tests/arbitro_passada.test.js: com o corpo a 90° do movimento ele percorria
    **2.85×** o chão que as pernas davam.

    Vale a mesma regra dos jogadores (LateralGait, ver animateBones em
    player.js), que existe exactamente para isto:

        acima de `velViragem` (3.6 m/s)  o corpo roda PARA O MOVIMENTO
        abaixo dela                      fica virado para a bola e dá passo
                                         lateral, com a velocidade encolhida

    Ou seja: em corrida aberta corre de frente, como um árbitro a fechar espaço;
    em ritmo de acompanhamento — que é a maior parte do tempo — anda de lado, de
    cara para o jogo.

    A velocidade é encolhida pelo MESMO factor que encolhe a passada. Sem isso o
    passo lateral continuava a deslizar: as pernas dão passos curtos e o corpo
    percorria na mesma o caminho todo. Quem anda de lado anda mais devagar.

    A orientação é escrita mesmo com ele parado — daí não passar pelo corte de
    `d > 0.4` que a viragem para o movimento tem (esse existe para não fazer
    piruetas quando o deslocamento é ruído).
    */
    mover: function (o, alvoX, alvoZ, velMax, dt, olharPara) {
        const dx = alvoX - o.model.position.x;
        const dz = alvoZ - o.model.position.z;
        const d = Math.hypot(dx, dz);

        const L = (typeof LateralGait !== 'undefined') ? LateralGait : null;

        /*
        Decidir ORIENTAÇÃO e LATERALIDADE antes de dar o passo: é a lateralidade
        que limita a velocidade deste frame.
        */
        /*
        CHEGOU OU NAO CHEGOU — com histerese (ver paragemMax/arranqueMin).
        Um limiar unico punha o boneco a correr/parar a cada frame quando o
        alvo estabilizava em cima dele.
        */
        const R = RefereeModel;
        if (o.paradoNoAlvo === undefined) o.paradoNoAlvo = true;
        if (o.paradoNoAlvo) {
            if (d > R.arranqueMin) o.paradoNoAlvo = false;
        } else if (d < R.paragemMax) {
            o.paradoNoAlvo = true;
        }

        let lateralidade = 0, ladoMov = 0;

        /*
        =================================================================
        O CORPO VAI PARA ONDE ELE ANDA MESMO
        =================================================================
        Relato: *"o juiz está correndo para um lado virado para o outro"*.
        Medido em 10 min de jogo: em 21% dos frames em corrida a frente do
        corpo estava a mais de 30° do caminho que ele percorria, e em 7% a mais
        de 90° — de costas para onde ia.

        Eram duas coisas, e as duas estão aqui:

        1. O CORTE ERA NA DISTÂNCIA AO ALVO, e não no movimento. `d > 0.4`
           existia para ele não fazer piruetas com alvo a tremer, mas a zona
           morta do passo é `paragemMax` = 0.06: entre 0.06 e 0.40 ele DAVA
           passo (a passada é `min(d, velMax*dt)` = 12.5 cm, ou seja velocidade
           cheia) com o rumo do frame anterior. Instrumentado: 34% dos frames
           em corrida caiam nessa faixa, e o alvo salta de lado para lado
           dentro dela. Agora o corte é o mesmo do passo — se ele anda, vira-se.

        2. A DECISÃO DE CORRIDA VINHA DE `d / dt`, que é a velocidade que ele
           precisaria para chegar num frame: com dt = 1/60 isso dá 60x a
           distância, portanto o teste era sempre `velMax > velViragem` e, com o
           árbitro a 7.5 m/s, sempre verdadeiro. O passo lateral com a cara para
           a bola — que é o que um árbitro faz a acompanhar — nunca chegava a
           existir. Agora vem da velocidade JÁ FILTRADA (`velAnim`, a mesma que
           alimenta o ciclo de passada), que é o que ele anda mesmo.
        */
        /*
        CORRIDA OU AJUSTE, e o critério é a DISTÂNCIA que falta — não uma
        velocidade.

        Uma pessoa a dois metros do sítio dá passo de lado sem tirar os olhos
        do jogo; a dez metros vira-se e corre. A fronteira sai da velocidade
        que ele vai mesmo usar neste frame — `d / tempoDeAjuste`, limitada ao
        máximo dele —, que é exacta e contínua: no ponto de troca a velocidade
        é a mesma dos dois lados.

        As duas tentativas que não servem, e porquê:

          `d / dt`      a velocidade para lá chegar NUM frame. A 1/60 isso são
                        60x a distância, portanto dava sempre `velMax` e o
                        passo lateral nunca existia — era o que estava.
          `velAnim`     a velocidade filtrada. Atrasa-se uns dez frames, e
                        durante toda a arrancada ele já corria com o corpo
                        ainda virado para a bola: medido, 91% dos frames em que
                        ele ia de costas eram a mais de 3.6 m/s, ou seja em
                        plena corrida.

        E quem anda de lado anda devagar por construção: abaixo da fronteira a
        velocidade JÁ é menor do que `velViragem`, senão ficava o passo lateral
        a deslizar a 7.5 m/s — o defeito que a LateralGait existe para evitar.
        */
        velMax = Math.min(velMax, d / R.tempoDeAjuste);
        const emCorrida = !L || velMax > L.velViragem;
        const anda = !o.paradoNoAlvo && d > R.paragemMax;

        if (olharPara && !emCorrida) {
            const ox = olharPara.x - o.model.position.x;
            const oz = olharPara.z - o.model.position.z;
            if (Math.hypot(ox, oz) > 0.05) o.model.rotation.y = Math.atan2(ox, oz);
        } else if (anda) {
            // Vira-se para onde anda; parado, mantém a orientação.
            o.model.rotation.y = Math.atan2(dx, dz);

            /*
            MAS NUNCA DE COSTAS PARA O QUE TEM DE VIGIAR — ver
            RefereeModel.anguloMaxDaBola. Se o rumo o obrigasse a passar desse
            limite, fica ENCOSTADO a ele, pelo lado por onde ia: corre
            atravessado e mantém a bola na periferia, em vez de a perder de
            vista. A passada de lado que isso implica é a da LateralGait, aqui
            em baixo.
            */
            if (olharPara && typeof R.anguloMaxDaBola === 'number') {
                const ox = olharPara.x - o.model.position.x;
                const oz = olharPara.z - o.model.position.z;
                if (Math.hypot(ox, oz) > 0.05) {
                    const paraBola = Math.atan2(ox, oz);
                    const desvio = Math.atan2(Math.sin(o.model.rotation.y - paraBola),
                        Math.cos(o.model.rotation.y - paraBola));
                    if (Math.abs(desvio) > R.anguloMaxDaBola) {
                        o.model.rotation.y = paraBola +
                            Math.sign(desvio) * R.anguloMaxDaBola;
                    }
                }
            }
        }

        if (L && d > 0.0001) {
            const fx = Math.sin(o.model.rotation.y), fz = Math.cos(o.model.rotation.y);
            const mx = dx / d, mz = dz / d;
            const alinhamento = fx * mx + fz * mz;
            const desvio = Math.acos(THREE.MathUtils.clamp(Math.abs(alinhamento), -1, 1));
            if (desvio > L.anguloMin) {
                lateralidade = Math.min(1, (desvio - L.anguloMin) /
                    (Math.PI / 2 - L.anguloMin));
                // >0 = movimento para a direita do corpo.
                ladoMov = Math.sign(fz * mx - fx * mz) || 1;
            }
        }

        const amp = 1 - lateralidade * (L ? L.reducaoPassada : 0);

        let passo = 0;
        if (!o.paradoNoAlvo && d > 0.0001) {
            passo = Math.min(d, velMax * amp * dt);
            o.model.position.x += (dx / d) * passo;
            o.model.position.z += (dz / d) * passo;
        }
        /*
        A velocidade que a ANIMACAO ve e filtrada. A instantanea (`passo/dt`)
        salta de 0 para varios m/s num unico passo curto, e era ela que ligava
        e desligava o ciclo de passada a cada frame.
        */
        const velInstant = dt > 0.0001 ? passo / dt : 0;
        o.velAnim = lerpTo(o.velAnim || 0, velInstant, R.suavizacaoVel);
        const vel = o.velAnim;

        const rig = o.rig;
        if (vel > 0.1 && typeof getGaitPose === 'function') {
            /*
            A cadência sai da velocidade REAL e da passada JÁ ENCOLHIDA — é esta
            divisão que faz o pé ficar colado ao chão. Usar a passada inteira
            aqui era metade do deslize.
            */
            const P0 = getGaitPose(0, vel);
            o.animTimer += (vel * dt) / (P0.passada * amp);
            const t = ((o.animTimer % 1.0) + 1.0) % 1.0;
            const P = getGaitPose(t, vel);

            rig.lLeg.rotation.x = P.lHip * amp; rig.lKnee.rotation.x = P.lKnee * amp;
            rig.rLeg.rotation.x = P.rHip * amp; rig.rKnee.rotation.x = P.rKnee * amp;
            rig.lArm.rotation.x = P.lArm * amp; rig.rArm.rotation.x = P.rArm * amp;
            rig.lElbow.rotation.x = P.cotovelo; rig.rElbow.rotation.x = P.cotovelo;
            rig.chest.rotation.x = P.tronco * amp;
            o.model.position.y = P.ressalto;

            if (lateralidade > 0.001) {
                const A = LateralGait.abertura * lateralidade;
                const osc = Math.sin(t * Math.PI * 2) * A;
                rig.lLeg.rotation.z = lerpTo(rig.lLeg.rotation.z, ladoMov * A * 0.5 + osc, 0.35);
                rig.rLeg.rotation.z = lerpTo(rig.rLeg.rotation.z, ladoMov * A * 0.5 - osc, 0.35);
            } else {
                rig.lLeg.rotation.z = lerpTo(rig.lLeg.rotation.z, 0);
                rig.rLeg.rotation.z = lerpTo(rig.rLeg.rotation.z, 0);
            }
        } else {
            const ossos = ['lLeg', 'rLeg', 'lKnee', 'rKnee', 'lArm', 'rArm'];
            for (let i = 0; i < ossos.length; i++) {
                rig[ossos[i]].rotation.x = lerpTo(rig[ossos[i]].rotation.x, 0, 0.2);
            }
            rig.lElbow.rotation.x = lerpTo(rig.lElbow.rotation.x, -0.3, 0.2);
            rig.rElbow.rotation.x = lerpTo(rig.rElbow.rotation.x, -0.3, 0.2);
            rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, 0, 0.2);
            // Fecha também a abdução do passo lateral, senão ficava de pernas
            // abertas ao parar.
            rig.lLeg.rotation.z = lerpTo(rig.lLeg.rotation.z, 0, 0.2);
            rig.rLeg.rotation.z = lerpTo(rig.rLeg.rotation.z, 0, 0.2);
            o.model.position.y = lerpTo(o.model.position.y, 0, 0.2);
        }
    },

    /*
    O NOME DA MARCACAO, para escrever por cima do arbitro.

    Havia marcacoes a acontecer sem nada que as anunciasse: a bola muda de
    sitio, os jogadores reorganizam-se, e quem esta a ver tem de deduzir se
    aquilo foi falta, canto ou pontape de baliza.

    Os nomes sao os do jogo em ingles, como o resto dos banners dos jogadores
    (PASS, SHOT, TACKLE...). Um estado que nao e marcacao nenhuma devolve null,
    e o `anunciar` nao acende nada.

    O fora-de-jogo NAO esta nesta tabela, e e de proposito: o estado que ele
    monta e um FREE_KICK como qualquer outro, e o rotulo 'OFFSIDE' e escrito a
    mao pelo `verificarImpedimento` logo a seguir ao setup — se estivesse aqui,
    todas as faltas passavam a dizer OFFSIDE.
    */
    rotulosDeMarcacao: {
        FREE_KICK: 'FOUL',
        PENALTY: 'PENALTY',
        CORNER_KICK: 'CORNER',
        GOAL_KICK: 'GOAL KICK',
        THROW_IN: 'THROW-IN'
    },

    rotuloDaMarcacao: function (tipo) {
        if (!tipo) return null;
        const r = this.rotulosDeMarcacao[tipo];
        return r !== undefined ? r : null;
    },

    /*
    Escreve a etiqueta por cima do arbitro, reaproveitando o banner dos
    jogadores (player.js, showActionBanner).

    Silencioso e sem rebentar quando nao ha arbitro: isto e chamado de dentro
    do `setupSetPiece`, e uma excepcao ali levava o frame inteiro atras. Com os
    arbitros escondidos pelo painel (`_ativo` false) tambem nao escreve — a
    arbitragem continua a existir, o boneco e que nao esta la.
    */
    anunciar: function (texto) {
        if (!texto) return;
        if (!this._ativo) return;
        const arb = this.arbitro;
        if (!arb || !arb.jogador || typeof arb.jogador.showActionBanner !== 'function') return;
        arb.jogador.showActionBanner(texto);
    },

    /*
    Aponta com o braco direito para um ponto do campo, durante
    `RefereeModel.duracaoSinal` segundos.

    Guarda-se o ALVO e nao o angulo do corpo: o arbitro continua a mexer-se
    enquanto sinaliza (o `mover` corre na mesma), e um angulo fixo deixava o
    braco a apontar para o sitio errado assim que ele desse dois passos.
    */
    sinalizar: function (x, z, elevacao, ateChegar) {
        if (!this.arbitro) return;
        this.arbitro.sinal = {
            x: x, z: z,
            elev: elevacao,
            timer: RefereeModel.duracaoSinal,
            /*
            `ateChegar`: o gesto nao morre ao fim dos 2.5 s — fica de pe
            enquanto o arbitro caminha para o lugar dele. E o caso do penalti:
            ele marca a 30 m da marca e leva ~7 s a la chegar, portanto com a
            duracao normal o braco caia a meio do caminho e a marcacao ficava
            sem gesto nenhum durante a montagem do lance.
            */
            ateChegar: !!ateChegar
        };
    },

    /*
    O gesto que corresponde a marcacao, se houver.

    FALTA: a direccao do ataque da equipa que beneficia — a baliza que ela
    ataca, no eixo do campo. O sentido sai do `dirZ` de um jogador dela, que e
    onde essa informacao vive.

    PENALTI: a marca. Nao e uma direccao, e um ponto — e por isso leva o outro
    angulo.

    CANTO, LATERAL e PONTAPE DE BALIZA nao levam este gesto: ali o arbitro
    aponta a BANDEIROLA ou a linha, que sao gestos diferentes e cada um com a
    sua geometria. Melhor nao ter do que ter todos iguais e errados.
    */
    sinalizarMarcacao: function (tipo, team) {
        if (!this._ativo || !this.arbitro) return;
        if (tipo !== 'FREE_KICK' && tipo !== 'PENALTY') return;
        if (typeof Match === 'undefined') return;

        const lista = (team === 'TeamA') ? Match.players : Match.opponents;
        if (!lista || !lista.length) return;
        const dir = lista[0].dirZ;
        if (typeof dir !== 'number') return;

        const fundo = CAMPO_COMP / 2;
        if (tipo === 'PENALTY') {
            // Aponta a MARCA e mantem o braco ate estar no lugar de onde vai
            // ver a cobranca (ver pontoDoArbitro, ramo PENALTY).
            this.sinalizar(0, (fundo - RefereeModel.marcaPenaltiZ) * dir,
                RefereeModel.elevacaoPenalti, true);
        } else {
            this.sinalizar(0, fundo * dir, RefereeModel.elevacaoSinal);
        }
    },

    /*
    Mantem o braco no ar enquanto o gesto dura, e vira o corpo para o alvo.

    Corre DEPOIS do `mover`: e ele que escreve a pose de passada, incluindo os
    bracos, e escrever antes era ver o gesto apagado no mesmo frame.
    */
    tickSinal: function (dt) {
        const arb = this.arbitro;
        if (!arb || !arb.sinal) return;

        /*
        No penalti o cronometro so comeca a correr quando ele chega ao lugar:
        ate la o gesto renova-se. Se o lance sair do estado PENALTY (batido,
        anulado), a espera acaba e o braco desce como em qualquer outro gesto.
        */
        if (arb.sinal.ateChegar) {
            const aindaNoLance = (typeof Match !== 'undefined' && Match.state === 'PENALTY');
            const alvo = this.pontoDoArbitro(Match && Match.ball);
            const chegou = !alvo || Math.hypot(
                alvo.x - arb.model.position.x, alvo.z - arb.model.position.z)
                <= RefereeModel.raioNoLugar;
            if (aindaNoLance && !chegou) arb.sinal.timer = RefereeModel.duracaoSinal;
            else arb.sinal.ateChegar = false;
        }

        arb.sinal.timer -= dt;
        if (arb.sinal.timer <= 0) {
            arb.sinal = null;
            // A guinada do braco tem de ser desfeita, senao a passada seguinte
            // desenha-se com o braco torcido para o lado.
            if (arb.rig && arb.rig.rArm) arb.rig.rArm.rotation.y = 0;
            if (arb.rig && arb.rig.lArm) arb.rig.lArm.rotation.y = 0;
            return;
        }

        const rig = arb.rig;
        if (!rig || !rig.rArm || !rig.lArm) return;

        /*
        O BRACO A 90 GRAUS DO CORPO, e a apontar o ataque — as duas coisas.

        Pedido: "braco a 90 graus com o corpo apontando para o gol do ataque,
        tipo T pose com um braco so". Antes so a segunda metade era verdade: o
        corpo ficava virado para a BOLA e o braco guinava em mundo ate ao alvo,
        portanto com a baliza em frente dele o braco saia quase colado ao
        tronco (a `margem` de 0.35 rad) e nao se lia como gesto nenhum. Medido
        em 67 min: elevacao certa, alvo certo a 1.2 graus, e mesmo assim sem
        gesto visivel.

        Para o braco ficar perpendicular E a apontar o alvo, e o CORPO que tem
        de rodar: fica-se com o alvo a +/-90 graus dele. Das duas
        orientacoes possiveis escolhe-se a que deixa o arbitro mais virado para
        a bola — ele fica de perfil para o lance, que e o que um arbitro faz
        mesmo ao assinalar a direccao, e nunca de costas.

        So na FALTA. No penalti aponta-se um SITIO (a marca, a poucos metros) e
        nao um sentido: ali o braco continua a guinar em mundo, com o corpo
        onde o `mover` o pos.

        `order = 'YXZ'` porque a guinada tem de ser aplicada ANTES da elevacao.
        Na ordem por omissao (XYZ) a elevacao roda primeiro e a guinada passa a
        girar em torno de um eixo ja inclinado — o braco acaba a apontar para
        outro sitio qualquer.

        `order = 'YXZ'` porque a guinada tem de ser aplicada ANTES da elevacao.
        Na ordem por omissao (XYZ) a elevacao roda primeiro e a guinada passa a
        girar em torno de um eixo ja inclinado — o braco acaba a apontar para
        outro sitio qualquer.
        */
        const dx = arb.sinal.x - arb.model.position.x;
        const dz = arb.sinal.z - arb.model.position.z;

        const k = RefereeModel.suavizacaoBraco;
        const ehFalta = Math.abs(arb.sinal.elev - RefereeModel.elevacaoSinal) < 0.01;

        if (ehFalta && Math.hypot(dx, dz) > 0.05) {
            /*
            O CORPO DE PERFIL PARA O ALVO. As duas hipoteses sao o alvo a
            +90 ou a -90 graus do corpo; ganha a que fica mais perto de onde o
            `mover` o tinha posto (virado para a bola), pelo menor dos dois
            caminhos.
            */
            const anguloAlvo = Math.atan2(dx, dz);
            const meiaVolta = Math.PI / 2;
            const curto = (a) => Math.atan2(Math.sin(a), Math.cos(a));
            const op1 = anguloAlvo - meiaVolta;
            const op2 = anguloAlvo + meiaVolta;

            /*
            A VOLTA TEM MEMORIA PROPRIA, e nao parte do que o `mover` escreveu.

            O `mover` corre ANTES disto e poe o arbitro a olhar para a bola
            todos os frames. Suavizar a partir do valor dele era andar 15% do
            caminho e ser puxado de volta no frame seguinte: o corpo ficava
            num compromisso a meio, medido a 76 graus em vez de 90, e o gesto
            continuava a nao se ler como um T.

            Guardado no proprio gesto e nao no arbitro: quando o gesto acaba,
            some com ele e a passada seguinte volta a ser do `mover`.
            */
            if (typeof arb.sinal.corpoY !== 'number') arb.sinal.corpoY = arb.model.rotation.y;
            const alvoCorpo =
                Math.abs(curto(op1 - arb.sinal.corpoY)) <= Math.abs(curto(op2 - arb.sinal.corpoY))
                    ? op1 : op2;

            // Roda pelo caminho curto e devagar, senao o arbitro estala 90
            // graus no frame do apito.
            arb.sinal.corpoY += curto(alvoCorpo - arb.sinal.corpoY) * RefereeModel.suavizacaoCorpoSinal;
            arb.model.rotation.y = arb.sinal.corpoY;
        }

        if (Math.hypot(dx, dz) > 0.05) {
            let guinada = Math.atan2(dx, dz) - arb.model.rotation.y;
            // Ao menor dos dois caminhos: sem isto o braco dava a volta larga
            // quando o angulo passava por +/-PI.
            guinada = Math.atan2(Math.sin(guinada), Math.cos(guinada));

            /*
            Escolhe o braco que fica do lado da baliza apontada, para nao
            cruzar o tronco: direito se o alvo estiver a direita do corpo,
            esquerdo se estiver a esquerda.

            E O SINAL DA GUINADA DIZ ESQUERDA, NAO DIREITA. O modelo olha
            para +Z (ver a nota da elevacao aqui abaixo) com +Y para cima,
            portanto a direita dele e -X: `rArm` nasce em x = -0.8 e `lArm`
            em x = +0.8 (criarBraco, js/pose.js). Uma guinada POSITIVA roda
            de +Z para +X, ou seja para o lado ESQUERDO do arbitro.

            Estava `useRight = guinada >= 0` e via-se o arbitro a marcar a
            falta para a direita com o braco esquerdo atravessado a frente do
            peito — o gesto certo, no braco errado.
            */
            const useRight = guinada < 0;
            const signalArm = useRight ? rig.rArm : rig.lArm;
            const otherArm = useRight ? rig.lArm : rig.rArm;

            // Desfaz a guinada do braco que nao sinaliza.
            otherArm.rotation.y = 0;
            otherArm.rotation.x = lerpTo(otherArm.rotation.x, 0, k);

            signalArm.rotation.order = 'YXZ';
            /*
            Com `rotation.x = -PI/2` e `y = 0` o braco fica na horizontal a
            apontar para a FRENTE do corpo; a guinada roda-o em torno do eixo
            vertical, portanto `y = guinada` aponta-o exactamente para o alvo,
            seja qual for o angulo entre o corpo (virado para a bola) e a
            baliza. Estava fixo em +/-PI/2 — sempre perpendicular ao tronco —
            e por isso o gesto apontava para o lado errado sempre que o alvo
            nao estivesse mesmo de lado.

            `margem` impede o braco de encostar ao tronco quando o alvo esta
            quase em frente, e de o atravessar por tras quando esta atras: e
            para isso que o lado do braco foi escolhido acima.
            */
            const margem = 0.35;
            signalArm.rotation.y = useRight
                ? Math.max(Math.min(guinada, -margem), -Math.PI + margem)
                : Math.min(Math.max(guinada, margem), Math.PI - margem);

            // Infrações (falta livre) ficam paralelas ao chao.
            const ehHorizontal = ehFalta;
            signalArm.rotation.x = ehHorizontal
                ? -Math.PI / 2
                : lerpTo(signalArm.rotation.x, arb.sinal.elev, k);
        }

        // Cotovelo esticado: um braco dobrado nao aponta nada.
        if (rig.rElbow) rig.rElbow.rotation.x = lerpTo(rig.rElbow.rotation.x, 0, k);
        if (rig.lElbow) rig.lElbow.rotation.x = lerpTo(rig.lElbow.rotation.x, 0, k);
    },

    /*
    Desconta o relogio da etiqueta e apaga-a no fim.

    Os jogadores fazem isto dentro do proprio `update` (player.js), que para o
    arbitro nunca corre — o Officials so lhe usa o `model` e move-lhe os ossos
    a mao. Sem isto a primeira marcacao do jogo ficava escrita por cima dele
    ate ao fim.
    */
    tickEtiqueta: function (dt) {
        const arb = this.arbitro;
        if (!arb || !arb.jogador) return;
        const j = arb.jogador;
        if (!(j.actionBannerTimer > 0)) return;
        j.actionBannerTimer -= dt;
        if (j.actionBannerTimer <= 0) {
            j.actionBannerTimer = 0;
            if (j.actionSprite) j.actionSprite.visible = false;
        }
    },

    update: function (dt) {
        if (typeof Match === 'undefined' || !Match.ball) return;

        /*
        As faltas por contacto sao vigiadas SEMPRE, mesmo com os arbitros
        escondidos (`_ativo` false, o botao do painel): esconder os bonecos e
        uma opcao de visualizacao, nao suspender a arbitragem. So o
        posicionamento, daqui para baixo, e que depende deles existirem.
        */
        this.detectarContactos(dt);
        // A etiqueta da ultima marcacao apaga-se sozinha (ver tickEtiqueta).
        this.tickEtiqueta(dt);

        if (!this.arbitro || !this._ativo) return;

        const R = RefereeModel;
        const meiaLarg = CAMPO_LARG / 2;

        /*
        Assistente 1: linha lateral +X, metade z <= 0 — a que o TeamA defende
        (dirZ +1, baliza em -Z), logo segue a linha do TeamA.
        Assistente 2: linha lateral -X, metade z >= 0, linha do TeamB.
        As duas metades são diagonalmente opostas, como na arbitragem real.
        */
        const zA = this.linhaDeImpedimento(Match.players, 1);
        const zB = this.linhaDeImpedimento(Match.opponents, -1);

        this.mover(this.assistentes[0],
            meiaLarg + R.margemLinha,
            THREE.MathUtils.clamp(zA, -(CAMPO_COMP / 2), 0),
            R.velocidadeAssistente, dt);

        this.mover(this.assistentes[1],
            -(meiaLarg + R.margemLinha),
            THREE.MathUtils.clamp(zB, 0, CAMPO_COMP / 2),
            R.velocidadeAssistente, dt);

        const alvoArb = this.pontoDoArbitro(Match.ball.position);
        this.mover(this.arbitro, alvoArb.x, alvoArb.z, R.velocidade, dt,
            Match.ball.position);

        // Depois do mover: e ele que escreve a pose dos bracos, e o gesto
        // tem de ficar por cima dela (ver tickSinal).
        this.tickSinal(dt);

        // Depois de mover, para os discos nao ficarem um frame atras.
        this.atualizarVista();
    },

    setVisivel: function (on) {
        this._ativo = on;
        // A vista corrente e que decide entre boneco e disco; aqui so se
        // guarda o interruptor e se aplica ja, para o botao do painel
        // responder no mesmo frame.
        this.atualizarVista();
    },

    /*
    BONECO OU DISCO, conforme a camara — o mesmo criterio dos jogadores (ver
    `vistaTatica` em player.js). Na vista de cima o boneco le-se mal, e um
    arbitro em boneco no meio de vinte e dois discos lia-se como uma coisa
    diferente do que e.

    Corre todos os frames e nao so na troca de camara: o `cameraMode` e uma
    variavel global que qualquer botao do painel pode mudar sem avisar
    ninguem, e um sinal para aqui era mais uma coisa para esquecer de ligar.
    */
    atualizarVista: function () {
        const tatico = (window.cameraMode === 'topdown');
        const todos = this.arbitro ? [this.arbitro].concat(this.assistentes) : [];
        for (let i = 0; i < todos.length; i++) {
            const o = todos[i];
            if (!o) continue;
            o.model.visible = this._ativo && !tatico;
            if (o.disco) {
                o.disco.visible = this._ativo && tatico;
                // A altura e a mesma do disco dos jogadores: pousado no
                // relvado, e nao ao nivel dele, senao as duas superficies
                // disputam o mesmo pixel e o disco pisca.
                o.disco.position.set(o.model.position.x, 0.04, o.model.position.z);
            }
        }
    },

    /*
    =========================================================================
    AS REGRAS
    =========================================================================
    Daqui para baixo é tudo função PURA — sem Match, sem cena, sem bola. É de
    propósito: as regras são o que se testa (tests/faltas_cartoes.test.js), e
    testá-las obrigando a montar um jogo seria trocar um teste de meio segundo
    por um de meio minuto.
    =========================================================================
    */

    /*
    Gravidade de uma falta, para decidir o cartão.

    `tipo`: 'carrinho' | 'desarme' | 'contacto'
    `velocidade`: m/s do contacto
    `angulo`: radianos entre a frente da vítima e o infractor — 0 de frente,
              π pelas costas
    `travouAtaque`: falta táctica sobre quem ia em progressão
    `marcacao`, `forca`: skills do INFRACTOR, 0..100. Omitidas valem 50 (a
              média), portanto não mexem no resultado — é o que mantém as
              contas do cabeçalho válidas para um jogador mediano.
    */
    gravidadeDaFalta: function (o) {
        const G = RefereeModel.faltas.gravidade;
        const base = G.base[o.tipo];
        // Um tipo desconhecido é um erro de quem chama, não uma falta leve.
        if (base === undefined) {
            console.warn('Officials: tipo de falta desconhecido:', o.tipo);
            return 0;
        }
        let g = base;
        g += Math.max(0, o.velocidade || 0) * G.pesoVelocidade;
        g += (Math.abs(o.angulo || 0) / Math.PI) * G.pesoAngulo;
        // `travouAtaque` NAO entra aqui: e regra a parte, no decidirCartao.

        // O jogador: marcação alivia, força agrava. 50 é a média e não mexe.
        const marcacao = (typeof o.marcacao === 'number') ? o.marcacao : 50;
        const forca = (typeof o.forca === 'number') ? o.forca : 50;
        g -= ((marcacao - 50) / 50) * G.pesoMarcacao;
        g += ((forca - 50) / 50) * G.pesoForca;

        // Uma falta nunca é de gravidade negativa, por muito bom que o
        // defensor seja: continua a ser uma falta.
        return Math.max(0, g);
    },

    /*
    Que cartão sai desta gravidade, para este jogador.

    O SEGUNDO AMARELO é o que produz quase todos os vermelhos: o vermelho
    directo exige uma gravidade que quase nenhum lance atinge.
    */
    decidirCartao: function (gravidade, jogador, travouAtaque) {
        const F = RefereeModel.faltas;
        if (gravidade >= F.limiarVermelho) return 'vermelho';
        /*
        LEI 12: travar um ataque promissor e ADVERTENCIA, por leve que seja o
        lance. E a fonte que faltava — os cartoes reais nao saem quase todos de
        carrinhos violentos, saem de faltas tacticas que param um ataque.
        Nunca e vermelho DIRECTO: quem ja esta advertido e que sai, e sai pelo
        segundo amarelo.
        */
        if (gravidade >= F.limiarAmarelo || travouAtaque) {
            return (jogador && jogador.temAmarelo) ? 'vermelho' : 'amarelo';
        }
        return null;
    },

    /*
    O MEDO DO ADVERTIDO.

    Sem isto o segundo amarelo dava ~46% de jogos com expulsão — problema do
    aniversário, com 5,22 cartões repartidos por 22 jogadores — quando o
    número real é 8%. Quem tem amarelo deixa de fazer carrinhos, e é isso, e
    não uma constante inventada para o efeito, que põe os vermelhos no sítio.

    Lido pelo js/bt/player_bt.js antes de escolher SLIDE_TACKLE.
    */
    podeFazerCarrinho: function (p) {
        return !(p && p.temAmarelo);
    },

    /*
    A falta é penálti? Só quando o infractor é de quem DEFENDE aquela área e
    a falta é dentro dela.

    `zSinal < 0` é a baliza do TeamA (a mesma convenção da detecção de golo em
    match.js), portanto o TeamA defende z negativo.
    */
    ehPenalti: function (x, z, teamInfractor) {
        if (typeof Area !== 'undefined' && typeof Area.contem === 'function') {
            const ladoZ = (teamInfractor === 'TeamA') ? -1 : (teamInfractor === 'TeamB') ? 1 : 0;
            if (!ladoZ) return false;
            return Area.contem(x, z, ladoZ);
        }
        const meiaLargArea = AREA_GRANDE_MEIA_LARG;
        if (Math.abs(x) > meiaLargArea) return false;

        const zLimite = CAMPO_COMP / 2 - AREA_GRANDE_PROF;
        const dentroEmZNegativo = z < -zLimite;
        const dentroEmZPositivo = z > zLimite;

        if (teamInfractor === 'TeamA') return dentroEmZNegativo;
        if (teamInfractor === 'TeamB') return dentroEmZPositivo;
        return false;
    },

    /*
    =========================================================================
    A APLICAÇÃO — daqui para baixo já se mexe no jogo
    =========================================================================
    */

    // Pares que acabaram de chocar, para o mesmo choque não marcar falta
    // atrás de falta enquanto os dois continuam encostados.
    _arrefecimento: null,

    resetFaltas: function () {
        this._arrefecimento = new Map();
    },

    /*
    Marca a falta: contadores, cartão, expulsão e reposição do jogo.

    A falta é no sítio onde o INFRACTOR está, que é onde o contacto foi.
    */
    marcarFalta: function (infractor, vitima, dados) {
        if (!infractor || !vitima || infractor.expulso) return;
        if (typeof Match === 'undefined' || Match.state !== 'PLAY') return;

        const gravidade = this.gravidadeDaFalta(dados);

        if (typeof MatchStats !== 'undefined') {
            MatchStats[infractor.team].faltas.cometidas++;
            MatchStats[vitima.team].faltas.sofridas++;
        }

        const cartao = this.decidirCartao(gravidade, infractor, !!(dados && dados.travouAtaque));
        if (cartao === 'amarelo') {
            infractor.temAmarelo = true;
            if (typeof MatchStats !== 'undefined') MatchStats[infractor.team].cartoes.amarelos++;
        } else if (cartao === 'vermelho') {
            /*
            O segundo amarelo conta como amarelo E como vermelho, que é como
            as estatísticas reais o contam — senão faltava um amarelo aos
            5,22 por jogo sempre que houvesse expulsão.
            */
            if (typeof MatchStats !== 'undefined') {
                if (infractor.temAmarelo) MatchStats[infractor.team].cartoes.amarelos++;
                MatchStats[infractor.team].cartoes.vermelhos++;
            }
            this.expulsar(infractor);
        }

        /*
        DENTRO DA AREA E PENALTI — e "dentro" mede-se no PONTO DA INFRACCAO,
        nao onde calha estar o infractor.

        Era `infractor.model.position`: um defensor com o corpo em cima da
        linha da area a derrubar o atacante ja dentro dela dava livre, e um
        carrinho que comeca fora e acerta no homem dentro tambem. O contacto e
        entre os dois, portanto o ponto e o meio deles — que e o que o arbitro
        marca.
        */
        const pi = infractor.model.position, pv = vitima.model.position;
        const pos = { x: (pi.x + pv.x) / 2, z: (pi.z + pv.z) / 2 };
        if (this.ehPenalti(pos.x, pos.z, infractor.team)) {
            if (typeof MatchStats !== 'undefined') MatchStats[vitima.team].penaltis++;
            Match.triggerPenalty(vitima.team);
        } else {
            Match.triggerFreeKick(vitima.team);
        }

        /*
        O CARTAO POR CIMA DA FALTA, e nesta ordem: o `triggerFreeKick` /
        `triggerPenalty` acima ja anunciou FOUL ou PENALTY, e o cartao e a
        informacao mais forte das duas. Sem cartao fica o que o lance escreveu.
        */
        if (cartao === 'amarelo') this.anunciar('YELLOW CARD');
        else if (cartao === 'vermelho') this.anunciar('RED CARD');

        if (typeof EventBus !== 'undefined') {
            EventBus.emit('FOUL', {
                infractor: infractor, vitima: vitima,
                gravidade: gravidade, cartao: cartao
            });
        }
    },

    /*
    Expulsa: o jogador sai da lista da equipa e vai para `Match.expulsos`.

    Tirar da lista, em vez de lá deixar uma flag para toda a gente filtrar, é
    a mesma escolha que o cabeçalho deste ficheiro explica para os árbitros:
    quem não joga não anda nas listas de quem joga. Os outros dez MANTÊM as
    posições que tinham — não há reorganização para 4-4-1, porque isso exigia
    formações novas no FormationsData para cada posição perdida.
    */
    expulsar: function (p) {
        if (!p || p.expulso) return;
        p.expulso = true;
        p.hasBall = false;
        if (Match.ballCarrier === p) Match.ballCarrier = null;

        const lista = (p.team === 'TeamA') ? Match.players : Match.opponents;
        const i = lista.indexOf(p);
        /*
        Guarda o INDICE, nao so o jogador: ha codigo que indexa a lista por
        posicao (a cobertura de estilos do js/simulate.js), e devolver o
        expulso ao fim da lista trocava os indices de toda a gente a seguir.
        Ver Match.reporExpulsos.
        */
        if (i >= 0) { p.indiceNaFormacao = i; lista.splice(i, 1); }

        Match.expulsos = Match.expulsos || [];
        Match.expulsos.push(p);
        if (p.model) p.model.visible = false;

        console.log('Officials: ' + p.team + ' (' + p.pos + ') EXPULSO, ficam ' +
            lista.length + ' em campo.');
    },

    /*
    FONTE A: o duelo perdido. Chamado pelo js/fsm.js quando um desarme ou um
    carrinho falha — o desfecho já era conhecido ali, só não custava nada.
    */
    avaliarDueloPerdido: function (defensor, portador, tipo) {
        if (typeof Match === 'undefined' || Match.state !== 'PLAY') return;
        if (!defensor || !portador || defensor.expulso) return;

        const F = RefereeModel.faltas;

        /*
        SEM CONTACTO NAO HA FALTA. Ver a nota do `raioDuelo`: o desfecho do
        duelo e conhecido quando o carrinho parte, com o corpo ainda a
        caminho, e apitava-se a 2.3 m de distancia.
        */
        if (defensor.model && portador.model) {
            const dx = defensor.model.position.x - portador.model.position.x;
            const dz = defensor.model.position.z - portador.model.position.z;
            const raio = (typeof F.raioDuelo === 'number') ? F.raioDuelo : 1.6;
            if (dx * dx + dz * dz > raio * raio) return;
        }

        const prob = (tipo === 'carrinho' ? F.probCarrinhoFalhado : F.probDesarmeFalhado) * F.escala;
        if (Math.random() >= prob) return;

        this.marcarFalta(defensor, portador, Object.assign({
            tipo: tipo,
            velocidade: defensor.velocity ? defensor.velocity.length() : 0,
            angulo: this._anguloDeAtaque(defensor, portador),
            travouAtaque: this._ehAtaqueEmProgressao(portador)
        }, this._skillsDe(defensor)));
    },

    /*
    FONTE B: contacto sem tentativa de desarme — empurrões e choques. Corre
    por frame, sobre os pares de adversários que estão perto.
    */
    detectarContactos: function (dt) {
        if (typeof Match === 'undefined' || Match.state !== 'PLAY') return;
        if (!this._arrefecimento) this.resetFaltas();

        const C = RefereeModel.faltas.contacto;
        const prob = C.prob * RefereeModel.faltas.escala * dt;

        for (const [chave, t] of this._arrefecimento) {
            const restante = t - dt;
            if (restante <= 0) this._arrefecimento.delete(chave);
            else this._arrefecimento.set(chave, restante);
        }

        const raio2 = C.raio * C.raio;
        const raioDisputa2 = C.raioDisputa * C.raioDisputa;
        for (const a of Match.players) {
            for (const b of Match.opponents) {
                const dx = a.model.position.x - b.model.position.x;
                const dz = a.model.position.z - b.model.position.z;
                if (dx * dx + dz * dz > raio2) continue;

                // So conta como falta se a bola estiver perto do contacto —
                // senao e um choque longe do lance, nao uma disputa.
                if (Match.ball) {
                    const mx = (a.model.position.x + b.model.position.x) * 0.5;
                    const mz = (a.model.position.z + b.model.position.z) * 0.5;
                    const my = (a.model.position.y + b.model.position.y) * 0.5;
                    const dbx = Match.ball.position.x - mx;
                    const dby = Match.ball.position.y - my;
                    const dbz = Match.ball.position.z - mz;
                    if (dbx * dbx + dby * dby + dbz * dbz > raioDisputa2) continue;
                }

                const chave = a.model.id + ':' + b.model.id;
                if (this._arrefecimento.has(chave)) continue;

                const vrx = (a.velocity ? a.velocity.x : 0) - (b.velocity ? b.velocity.x : 0);
                const vrz = (a.velocity ? a.velocity.z : 0) - (b.velocity ? b.velocity.z : 0);
                const vRel = Math.sqrt(vrx * vrx + vrz * vrz);
                if (vRel < C.velRelMin) continue;

                /*
                CAUTELA NA AREA, tambem no corpo a corpo (ver CautelaNaArea em
                config/defense.js). Quem vai mais depressa e o infractor (ver
                mais abaixo), portanto a area que conta e a que ELE defende.
                */
                let probAqui = prob;
                if (typeof CautelaNaArea !== 'undefined' &&
                    typeof CautelaNaArea.factorContacto === 'number' &&
                    typeof Area !== 'undefined' && typeof Area.contem === 'function') {
                    const vA0 = a.velocity ? a.velocity.length() : 0;
                    const vB0 = b.velocity ? b.velocity.length() : 0;
                    const quemEntra = (vA0 >= vB0) ? a : b;
                    const cx = (a.model.position.x + b.model.position.x) * 0.5;
                    const cz = (a.model.position.z + b.model.position.z) * 0.5;
                    if (Area.contem(cx, cz, -quemEntra.dirZ)) {
                        probAqui *= CautelaNaArea.factorContacto;
                    }
                }
                if (Math.random() >= probAqui) continue;

                /*
                Quem entra é quem vai mais depressa. Não é sempre verdade num
                choque real, mas é o critério que não precisa de saber a
                intenção de ninguém.
                */
                const vA = a.velocity ? a.velocity.length() : 0;
                const vB = b.velocity ? b.velocity.length() : 0;
                let infractor = (vA >= vB) ? a : b;
                let vitima = (infractor === a) ? b : a;

                /*
                MAS A GEOMETRIA GANHA À VELOCIDADE quando um deles vem pelas
                COSTAS do outro — ver `anguloPelasCostas`, que tem o relato e a
                medição. Quem persegue pode ir mais devagar do que quem foge, e
                punir o que vai à frente por levar um toque nas costas é o
                contrário da regra.

                O ângulo já era calculado aqui ao lado, para a gravidade — mas
                SÓ DEPOIS de o infractor estar escolhido, portanto não chegava
                a influenciar a escolha.
                */
                const limiteCostas = (typeof C.anguloPelasCostas === 'number')
                    ? C.anguloPelasCostas : Infinity;
                const aVemDeTras = this._anguloDeAtaque(a, b) > limiteCostas;
                const bVemDeTras = this._anguloDeAtaque(b, a) > limiteCostas;
                // Só quando é um SÓ deles: de frente um para o outro os dois
                // dariam verdade, e aí não há nada a corrigir.
                if (aVemDeTras !== bVemDeTras) {
                    infractor = aVemDeTras ? a : b;
                    vitima = (infractor === a) ? b : a;
                }

                this._arrefecimento.set(chave, C.arrefecimento);
                this.marcarFalta(infractor, vitima, Object.assign({
                    tipo: 'contacto',
                    velocidade: vRel,
                    angulo: this._anguloDeAtaque(infractor, vitima),
                    travouAtaque: this._ehAtaqueEmProgressao(vitima)
                }, this._skillsDe(infractor)));
                return;   // uma falta por frame chega
            }
        }
    },

    // Ângulo entre a frente da vítima e a direcção de onde o infractor vem:
    // 0 de frente, PI pelas costas.
    _anguloDeAtaque: function (infractor, vitima) {
        const vv = vitima.velocity;
        let fx, fz;
        if (vv && (vv.x * vv.x + vv.z * vv.z) > 0.1) {
            const n = Math.sqrt(vv.x * vv.x + vv.z * vv.z);
            fx = vv.x / n; fz = vv.z / n;
        } else {
            _v1.set(0, 0, 1).applyQuaternion(vitima.model.quaternion);
            fx = _v1.x; fz = _v1.z;
        }
        let dx = infractor.model.position.x - vitima.model.position.x;
        let dz = infractor.model.position.z - vitima.model.position.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        dx /= d; dz /= d;
        return Math.acos(THREE.MathUtils.clamp(fx * dx + fz * dz, -1, 1));
    },

    /*
    Skills do infractor que pesam na gravidade. Se o jogador não tiver
    `skillFor` — os árbitros não têm, e um Match de teste pode não ter —
    devolve vazio, e a gravidade usa a média.
    */
    _skillsDe: function (p) {
        if (!p || typeof p.skillFor !== 'function') return {};
        return { marcacao: p.skillFor('MARKING'), forca: p.skillFor('STRENGTH') };
    },

    /*
    O ATAQUE ERA PROMISSOR? — a condicao da Lei 12 para a advertencia.

    Era `velocidade para a frente > 3 m/s` da vitima, e mais nada: qualquer
    jogador a trotar em frente, com a bola do outro lado do campo, contava como
    ataque travado. Medido: 53% de TODAS as faltas, o que e cinco vezes o que
    um jogo a serio tem. Um ataque promissor tem a bola: a vitima e o portador
    (ou o destinatario de um passe em voo), vai para a frente, e vai a caminho
    da baliza adversaria — uma falta na propria area de canto nao para ataque
    nenhum.
    */
    _ehAtaqueEmProgressao: function (vitima) {
        if (!vitima || !vitima.velocity) return false;
        if (typeof Match === 'undefined' || !Match) return false;

        // A bola tem de ser dela: portador, ou destinatario do passe em voo.
        const temABola = (Match.ballCarrier === vitima) || (Match.intendedReceiver === vitima);
        if (!temABola) return false;

        // E tem de ir para a frente, no referencial de quem ataca.
        const vz = vitima.velocity.z * (vitima.dirZ || 1);
        if (vz <= RefereeModel.faltas.velMinAtaquePromissor) return false;

        // E ja na metade de quem ataca ou perto dela: um ataque que ainda vai
        // no proprio meio-campo nao esta a ser travado a caminho do golo.
        const z = vitima.model ? vitima.model.position.z * (vitima.dirZ || 1) : 0;
        return z > -RefereeModel.faltas.zMinAtaquePromissor;
    }
};
