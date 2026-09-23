/*
=============================================================================
CONFIG: ANIMAÇÕES E CLIPS DE AÇÃO
=============================================================================
Clips de keyframes para remates, reposições, laterais, guarda-redes e controlo.
=============================================================================
*/

const ActionAnimClips = {
    /*
    O PASSE, com gesto (ver PassClip mais abaixo).

    Era `{ 0.2, 0.4 }` — 0.2 s de estado e nenhuma animação: a bola saía 0.08 s
    depois da decisão e o `case 'PASS'` da FSM lia o tempo normalizado sem
    posar o esqueleto. Para se ver o pé de apoio plantar ao lado da bola antes
    da batida é preciso tempo: 0.35 s de gesto com o contacto no keyframe 5
    (t = 4/7) põe o plantar 0.11 s ANTES do contacto, que é o que se lê.

    O PREÇO é real e está medido: a bola sai 0.12 s mais tarde do que saía, e
    nesse tempo um adversário anda ~0.9 m. Ver a tabela de passes certos e
    cortados em `docs/filesSummary.md`.
    */
    pass: { duration: 0.35, contactTime: 4 / 7 },
    // Chutão do guarda-redes (ver GoalkeeperKickClip). O contactTime cai
    // exactamente no keyframe 9 (t = 8/11), o frame do contacto pé-bola.
    gkPunt: { duration: 0.85, contactTime: 8 / 11 },
    /*
    Tiro de meta do chão, com corrida de aproximação (ver
    GoalkeeperGroundKickClip). Contacto no frame do impacto (t = 9/15 = 0.60) do clip
    de 16 frames com maior densidade de amostragem.

    Duração ultra-rápida e direta ajustada para 0.25s.
    */
    gkPuntChao: { duration: 0.25, contactTime: 9 / 15 },
    // Lançamento com as mãos do guarda-redes
    /*
    O contacto e no frame 8 de 12, e nao no 9.

    Era `8 / 11`. O `amostrarClipLancamentoGR` faz `pos = norm * (n - 1)`,
    portanto 8/11 da `pos = 8` — o INDICE 8, que e o frame 9, o
    "Follow-through". O GoalkeeperThrowClip anota o contacto no frame 8 ("bola
    sai da mao"), com o braco na extensao maxima; um frame depois ele ja vem a
    descer (`bracoRx` 1.10 -> 0.60) e a bola largava de la.

    O 8/11 veio do `gkPunt`, onde esta certo porque la o contacto E o keyframe
    9. Para o frame 8 de 12 o valor e `7 / 11` — o mesmo que o `shot`, que tem
    a mesma contagem.
    */
    gkThrow: { duration: 0.70, contactTime: 7 / 11 },
    // O rolamento e mais lento e o contacto e no ponto mais baixo da mao
    // (frame 7 de 10) — ver GoalkeeperUnderarmThrowClip.
    gkThrowBaixo: { duration: 0.85, contactTime: 6 / 9 },
    // Arremesso lateral (ver ThrowInClip): a bola sai no frame 6 de 10.
    throwIn: { duration: 0.90, contactTime: 5 / 9 },
    /*
    REMATE (ver ShotClip). Contacto no frame 7 de 12 (t = 6/11 ≈ 0.545), ou
    seja ~0.27 s depois de o BT decidir rematar — tempo real de armar a perna.

    ERA O FRAME 8, E A BOLA SAÍA TARDE. Relato: *"na hora do chute, quando o
    pé pega na bola a bola não sai chutada; a bola sai depois que o pé está
    mais na frente"*. Medido com `tools/scratch/remate_pe_chute.js` (600 s de
    jogo) e com `tools/scratch/remate_pe_estatico.js` (pose a pose), no
    referencial do jogador e em metros — `peZ - bolaZ`, positivo = o pé já
    passou a bola:

        frame 6 (norm 0.455)   -0.49
        frame 7 (norm 0.545)   -0.05   <- o pé está NA bola
        frame 8 (norm 0.636)   +0.39   <- era aqui que ela saía

    Em jogo dava +0.43 m em 9 remates de 9: quase meio metro de pé passado
    pela bola antes de ela arrancar. O cruzamento real é em norm ≈ 0.56, e o
    `ActionState` dispara no primeiro frame em que `norm` passa o
    `contactTime` — portanto 6/11 (0.545) cai em cima dele com a margem de um
    frame a favor.
    */
    shot: { duration: 0.50, contactTime: 6 / 11 },
    // Domínio de bola orientado pela direita (ver BallControlRightClip)
    // Contacto e toque de saída no frame 5 de 8 (t = 4/7 ≈ 0.57)
    ballControlRight: { duration: 0.36, contactTime: 4 / 7 },
    ball_control_right: { duration: 0.36, contactTime: 4 / 7 },
    /*
    CHUTE DE BOLA PARADA (ver PlayerKickClip) — tiro de meta, falta e penálti.

    O contacto é o ÚLTIMO keyframe, portanto `contactTime` é 1: são 4 frames e
    o quarto é a batida. Não há follow-through, a bola sai quando o gesto
    acaba. O ActionState aceita-o — o `norm < contactTime` do update falha
    quando `norm` chega a 1 e o contacto dispara nesse frame.

    A DURAÇÃO É UM TECTO MEDIDO, e não um gosto. Era 0.25 s no clip antigo do
    guarda-redes; quanto mais longo, melhor se lê a armação, mas cada tiro de
    meta atrasa o jogo todo. Varrido contra os dois testes de medição que
    apanham isso — `saida_de_bola_ritmo` (tecto 12% de leituras abaixo de
    3 m/s enquanto o guarda-redes segura) e `gk_agarra_com_a_mao` (mínimo 5
    agarradas em 20 min de jogo):

        duracao   abaixo de 3 m/s   agarradas
        0.25 s          5%             10
        0.35 s          8%              9
        0.45 s         10%              7
        0.55 s          8%             10     <- escolhido
        0.70 s         14%  REPROVA     4  REPROVA

    NÃO É MONÓTONO: 0.55 mede melhor que 0.45. A simulação é caótica e uma
    leitura por semente vale pouco sozinha — é a mesma fragilidade que está
    escrita no cabeçalho desses dois testes. O que não é ruído é o 0.70 falhar
    os DOIS ao mesmo tempo, e por larga margem.

    0.55 s dá aos 4 keyframes 0.183 s entre cada um. Quem quiser o gesto mais
    lento mexe aqui, e volta a correr os dois testes.
    */
    playerKick: { duration: 0.55, contactTime: 1 },
    /*
    TIRO DE META (ver GoalKickClip) — gesto PRÓPRIO, separado do `playerKick`.

    Era o `playerKick` a servir os três lances de bola parada (tiro de meta,
    falta e penálti) com um clip só. Partilhar era garantir que afinar o tiro
    de meta mexia na falta e no penálti — e os três não são o mesmo gesto: o
    tiro de meta tem a corrida de aproximação mais longa e o batedor levanta a
    bola, a falta e o penálti batem-na rasa a poucos passos.

    Mesma contagem e mesmo contacto do `playerKick` porque o gesto ARRANCA daí:
    4 keyframes (as imagens GoalKick1 a 4) e o contacto no último, portanto
    `contactTime` 1 e nenhum follow-through. Os números divergem a partir daqui
    conforme se afinam no editor de animação, e é isso que se queria.
    */
    goalKick: { duration: 0.55, contactTime: 1 }
};

/*
=============================================================================
SHOT_CLIP — remate em movimento, 12 keyframes
=============================================================================
Mesma convenção do GoalkeeperGroundKickClip:
    coxaChute   > 0  perna para TRÁS   (< 0 é para a FRENTE)
    joelhoChute > 0  joelho dobra, calcanhar sobe
    chest       > 0  tronco para a FRENTE
    leanZ       < 0  corpo inclina sobre o pé de apoio
    pelvisY          rotação da bacia (o "abrir e fechar" da anca no remate)

O que distingue isto do tiro de meta: aqui vem-se em CORRIDA, portanto há menos
inclinação lateral e muito mais ROTAÇÃO — a bacia abre na armação e fecha no
impacto, e é daí que vem a força. O braço contrário à perna de remate abre para
fora a contrabalançar (é o gesto mais visível na referência).

A REFERÊNCIA são as três fases clássicas do remate, lidas da direita para a
esquerda numa prancha de biomecânica: *toma de impulso* (a corrida), *fase
principal* (armação e contacto) e *fase final* (o acompanhamento).

Três coisas vieram de lá e não estavam no clip:

  - o BRAÇO CONTRÁRIO abre quase à horizontal na armação (`bracoLz` 1.85 no
    frame 4, era 1.35). É o gesto mais visível da prancha, e é o que
    contrabalança a perna que vai atrás;
  - na FASE FINAL o TRONCO INCLINA PARA TRÁS (`chest` negativo nos frames 10 e
    11). O clip punha-o a prumo, e o remate acabava com o corpo direito como
    quem pára de andar;
  - a INCLINAÇÃO LATERAL mantém-se até ao fim (`leanZ` -0.14 no frame 10, era
    -0.06): na prancha o corpo ainda está claramente inclinado sobre o pé de
    apoio depois de a bola sair.

     1  perna de remate começa a recuar, apoio a descer
     2  pé de apoio planta ao lado da bola, tronco inclina
     3  armação: joelho a ~100°, bacia abre
     4  armação máxima, braço contrário bem aberto
     5  bacia inicia a rotação para a frente
     6  chicote: a coxa acelera, o joelho ainda flectido
     7  CONTACTO — perna esticada, tornozelo travado, corpo por cima da bola
     8  pós-impacto imediato, a perna varre para a frente
     9  a perna continua pela inércia
    10  follow-through alto, bacia fechada
    11  desaceleração, o pé desce
    12  recuperação, de novo em postura de jogo
=============================================================================
*/
const ShotClip = {
    pernaChute: 'r',
    /*
    O CONTACTO É NO FRAME 7, e não no 8 — é onde o pé está mesmo em cima da
    bola. A medição está na entrada `shot` do ActionAnimClips, aqui ao lado.
    Tem de andar a par do `contactTime` de lá: um manda a bola sair, o outro
    desenha o pé na bola.
    */
    contactFrame: 7,

    /*
    A ÚLTIMA PASSADA — o pé de apoio planta-se AO LADO da bola.

    Relato, com fotografia de referência: *"a animação do chute está errada; o
    pé de apoio está atrás da bola; para chutar o jogador tem de colocar o pé
    de apoio ao lado da bola"*.

    Medido com `tools/scratch/remate_pe_apoio.js`, no instante do contacto e em
    metros: a bola estava 0.59 m À FRENTE do corpo e o pé de apoio 0.70 m
    ATRÁS dela, com 4 cm de afastamento lateral. Em 19 remates, 19 assim. O
    gesto é só rotação de articulações — nada punha o corpo no sítio —, e o
    `case 'SHOOT'` travava a velocidade a 0.95 por frame: ele parava onde
    estava e balançava a perna a meio metro da bola.

    Agora, enquanto arma, o corpo faz a passada que falta: vai para ao lado da
    bola. São ~0.7 m em 0.29 s (o contacto cai a 7/11 do clip), ou seja 2.4
    m/s — uma passada, não um deslize.

    `lateral` é o quanto o CORPO se desvia para o lado do pé de apoio: com ele
    a 0.13 m do eixo no rig, isto põe o pé a ~0.28 m da bola, que é a medida
    da fotografia. `avanco` é o quanto o corpo passa da bola, para o pé ficar
    ao lado dela e não atrás.
    */
    plantar: {
        lateral: 0.15,
        avanco: 0.10,
        velMax: 8.5
    },
    frames: [
        // 1  TOMA DE IMPULSO: a corrida ainda manda, a perna começa a recuar
        { leanZ: -0.05, pelvisY: 0.12, chest: 0.20, chestY: -0.12, coxaChute: 0.45, joelhoChute: 0.85, coxaApoio: -0.25, joelhoApoio: 0.32, bracoLx: -0.42, bracoLz: 0.70, bracoRx: 0.30, bracoRz: -0.35, cotoveloL: -0.55, cotoveloR: -0.70, altura: 0.00 },
        // 2  pé de apoio planta ao lado da bola, tronco inclina
        { leanZ: -0.11, pelvisY: 0.20, chest: 0.28, chestY: -0.20, coxaChute: 0.72, joelhoChute: 1.35, coxaApoio: -0.12, joelhoApoio: 0.36, bracoLx: -0.62, bracoLz: 1.05, bracoRx: 0.44, bracoRz: -0.42, cotoveloL: -0.42, cotoveloR: -0.80, altura: -0.01 },
        // 3  FASE PRINCIPAL: joelho a ~100°, bacia abre, braço contrário sobe
        { leanZ: -0.18, pelvisY: 0.28, chest: 0.34, chestY: -0.28, coxaChute: 0.92, joelhoChute: 1.80, coxaApoio: 0.00, joelhoApoio: 0.40, bracoLx: -0.78, bracoLz: 1.45, bracoRx: 0.54, bracoRz: -0.52, cotoveloL: -0.28, cotoveloR: -0.86, altura: -0.02 },
        // 4  armação máxima — braço contrário quase à HORIZONTAL (referência)
        { leanZ: -0.24, pelvisY: 0.34, chest: 0.36, chestY: -0.34, coxaChute: 1.05, joelhoChute: 2.05, coxaApoio: 0.04, joelhoApoio: 0.42, bracoLx: -0.88, bracoLz: 1.85, bracoRx: 0.62, bracoRz: -0.60, cotoveloL: -0.18, cotoveloR: -0.92, altura: -0.03 },
        // 5  a bacia inicia a rotação para a frente
        { leanZ: -0.24, pelvisY: 0.24, chest: 0.33, chestY: -0.24, coxaChute: 0.75, joelhoChute: 1.92, coxaApoio: 0.05, joelhoApoio: 0.40, bracoLx: -0.80, bracoLz: 1.72, bracoRx: 0.50, bracoRz: -0.58, cotoveloL: -0.20, cotoveloR: -0.84, altura: -0.02 },
        // 6  chicote: a coxa acelera, o joelho ainda flectido
        { leanZ: -0.22, pelvisY: 0.08, chest: 0.28, chestY: -0.10, coxaChute: 0.22, joelhoChute: 1.55, coxaApoio: 0.05, joelhoApoio: 0.34, bracoLx: -0.55, bracoLz: 1.45, bracoRx: 0.26, bracoRz: -0.62, cotoveloL: -0.24, cotoveloR: -0.70, altura: -0.01 },
        /*
        7  CONTACTO — perna esticada, tornozelo travado, corpo por cima da bola.

        Era a "extensão rápida da tíbia, pé quase na bola", com o joelho ainda
        a 0.75 rad. Como o contacto passou para aqui (ver a nota do `shot` no
        ActionAnimClips), este keyframe tem de ser a batida: joelho quase
        estendido — o `pose_partilhada` exige < 0.5 rad — e a coxa recuada o
        suficiente para o pé ficar EM CIMA da bola e não à frente dela.

        Varrido com `tools/scratch/remate_frame7_varrer.js`, com a bola em
        z = 0.10 (ShotClip.plantar.avanco); `peZ - bolaZ` em metros:

            coxa -0.35  joelho 0.75   -0.05   (o que estava, joelho dobrado)
            coxa -0.25  joelho 0.30   +0.00   <- escolhido, pé na bola
            coxa -0.25  joelho 0.10   +0.06
            coxa -0.15  joelho 0.10   -0.02   (coxa recuada de mais)
        */
        { leanZ: -0.18, pelvisY: -0.06, chest: 0.20, chestY: 0.04, coxaChute: -0.25, joelhoChute: 0.30, coxaApoio: 0.06, joelhoApoio: 0.28, bracoLx: -0.22, bracoLz: 1.20, bracoRx: -0.05, bracoRz: -0.64, cotoveloL: -0.26, cotoveloR: -0.52, altura: 0.00 },
        // 8  pós-impacto imediato: a perna varre para a frente
        { leanZ: -0.16, pelvisY: -0.16, chest: 0.12, chestY: 0.14, coxaChute: -0.72, joelhoChute: 0.10, coxaApoio: 0.06, joelhoApoio: 0.24, bracoLx: 0.05, bracoLz: 1.10, bracoRx: -0.28, bracoRz: -0.66, cotoveloL: -0.26, cotoveloR: -0.42, altura: 0.02 },
        // 9  a perna continua pela inércia e o tronco começa a abrir
        { leanZ: -0.15, pelvisY: -0.24, chest: 0.00, chestY: 0.22, coxaChute: -1.30, joelhoChute: 0.08, coxaApoio: 0.07, joelhoApoio: 0.18, bracoLx: 0.24, bracoLz: 1.00, bracoRx: 0.06, bracoRz: -0.70, cotoveloL: -0.24, cotoveloR: -0.34, altura: 0.08 },
        // 10 FASE FINAL: perna alta e TRONCO PARA TRÁS (chest < 0), ainda inclinado
        { leanZ: -0.14, pelvisY: -0.30, chest: -0.12, chestY: 0.28, coxaChute: -1.85, joelhoChute: 0.05, coxaApoio: 0.09, joelhoApoio: 0.14, bracoLx: 0.40, bracoLz: 0.95, bracoRx: 0.36, bracoRz: -0.74, cotoveloL: -0.20, cotoveloR: -0.26, altura: 0.15 },
        // 11 desaceleração, o pé desce e o tronco volta ao prumo
        { leanZ: -0.08, pelvisY: -0.18, chest: -0.04, chestY: 0.16, coxaChute: -0.95, joelhoChute: 0.22, coxaApoio: 0.05, joelhoApoio: 0.18, bracoLx: 0.22, bracoLz: 0.60, bracoRx: 0.18, bracoRz: -0.48, cotoveloL: -0.15, cotoveloR: -0.18, altura: 0.06 },
        // 12 recuperação, de novo em postura de jogo
        { leanZ: 0.00, pelvisY: 0.00, chest: 0.00, chestY: 0.00, coxaChute: 0.00, joelhoChute: 0.10, coxaApoio: 0.00, joelhoApoio: 0.10, bracoLx: 0.00, bracoLz: Math.PI / 16, bracoRx: 0.00, bracoRz: -Math.PI / 16, cotoveloL: 0.00, cotoveloR: 0.00, altura: 0.00 }
    ]
};

/*
=============================================================================
PASS_CLIP — o passe, 8 keyframes
=============================================================================
Pedido, com uma referência: *"o jogador coloca o pé de apoio ao lado da bola e
depois dá o passe"*.

O passe era o ÚNICO gesto sem animação nenhuma. O `case 'PASS'` (fsm.js) lia o
tempo normalizado do ActionState — e descartava-o: as pernas ficavam na pose
que a passada tinha deixado, e não havia pé de apoio nenhum para se ver.

Mesma convenção do ShotClip, e de propósito: o `aplicarPoseRemate` (pose.js) é
reaproveitado tal como está, e por isso os nomes dos campos têm de ser os
mesmos.

    coxaChute   > 0  perna para TRÁS   (< 0 é para a FRENTE)
    joelhoChute > 0  joelho dobra, calcanhar sobe
    chest       > 0  tronco para a FRENTE
    leanZ       < 0  corpo inclina sobre o pé de apoio
    pelvisY          rotação da bacia

O QUE O DISTINGUE DO REMATE, e é o ponto: um passe não é um remate fraco. A
armação vai a metade (`coxaChute` até 0.55 contra os 1.05 do remate), a
inclinação a metade, e o gesto tem 8 keyframes em vez de 12 — o
acompanhamento é curto, o pé não sobe à altura da anca.

     1  arranca, a perna de apoio avança para o lado da bola
     2  PÉ DE APOIO PLANTA ao lado da bola, tronco inclina   <- o pedido
     3  arma: o joelho dobra, a perna de passe vai atrás
     4  armação máxima, braço contrário abre a contrabalançar
     5  CONTACTO — o pé fecha na bola, corpo por cima dela
     6  pós-impacto, a perna continua pela inércia
     7  acompanhamento curto, o pé desce
     8  recuperação, de novo em postura de jogo

O contacto cai EM CIMA do keyframe 5 (t = 4/7), como nos outros clips: é o
frame que desenha o pé na bola, e a bola tem de sair aí.
=============================================================================
*/
/*
ONDE FICA A BOLA NO INSTANTE DE BATER — ver a nota do `hasBall` em player.js.

Em condução ela vai 0.6 m à frente do corpo. No gesto de rematar ou passar
desliza para estes valores, no referencial do jogador: `lateral` para o lado do
pé que bate e `avanco` até quase à linha do corpo. É assim que o pé de apoio,
que está a 0.13 m do eixo do lado contrário, fica AO LADO da bola em vez de
atrás dela.
*/
const PlantarBola = {
    lateral: 0.30,
    avanco: 0.12
};
if (typeof window !== 'undefined') window.PlantarBola = PlantarBola;

/*
=============================================================================
O SEGUIMENTO DA PERNA ACOMPANHA A FORCA DO PASSE
=============================================================================
Relato: *"a perna esta a levantar muito depois do passe curto. Parece um passe
longo ou um chute que nao deu certo"*.

O `PassClip` e UM so, e o seguimento dele -- os keyframes 6 e 7, com a coxa a
-0.62 e -0.32 -- foi desenhado para um passe a serio. Num toque de tres metros
esse mesmo seguimento levanta a perna como se tivesse batido com tudo, e e
isso que se ve: o gesto nao diz a mesma coisa que a bola.

`PassFollowThrough` escala os canais da perna que bate DEPOIS do contacto, em
funcao da distancia do passe: `curto` para um toque, 1.0 para um passe longo.
Antes do contacto nada muda -- a armacao e a mesma, porque a preparacao de um
passe curto tambem e curta e ja vem do proprio clip.
=============================================================================
*/
const PassFollowThrough = {
    distCurta: 8.0,     // ate aqui e toque: seguimento minimo
    distLonga: 25.0,    // daqui para cima, o seguimento inteiro
    fraccaoCurta: 0.35  // quanto sobra do seguimento num toque
};
if (typeof window !== 'undefined') window.PassFollowThrough = PassFollowThrough;

const PassClip = {
    /*
    A perna é a direita, como no remate. Não é escolha: o `aplicarPoseRemate`
    lê o `ShotClip.pernaChute` para saber qual perna é a de passe, portanto as
    duas TÊM de coincidir — e há um teste que o exige, para não divergirem em
    silêncio (tests/passe_planta_o_pe.test.js).
    */
    pernaChute: 'r',
    contactFrame: 5,

    /*
    BATE-SE COM O LADO DO PÉ, e não de bico. Relato: *"a animação de passe está
    ruim; o passe está sendo dado de bico e não com o lado do pé"*.

    Faltavam dois canais, agora nos keyframes: `coxaChuteY` abre a anca (a perna
    roda para fora) e `peChuteY` roda o pé por cima da abertura de repouso. Com
    os dois a zero — que era o caso — a perna balança no plano do corpo e quem
    chega à bola é a ponta do pé.

    A abertura CRESCE com o gesto e chega ao máximo no contacto: 0.80 rad de
    anca (46 graus) mais 1.00 de pé (57). Os valores não são palpite — saem da
    varredura em `tools/scratch/passe_pe_varre.js`, que mede o ângulo entre a
    FACE INTERNA do pé e a direcção do passe no instante do contacto:

        anca/pé   0.00/0.00 → face interna a 106 graus, ponta a 19  (bico)
                  0.40/1.50 → 10 graus, mas 86 graus só de tornozelo
                  0.80/1.00 → 12 graus, com a abertura repartida  <-- este
                  1.20/0.50 → 17 graus, e a anca aberta a mais

    O 0.80/1.00 é o que reparte a abertura como um corpo a reparte. Abre cedo
    (já se vê na armação, como num jogador a sério) e desfaz-se no
    acompanhamento.

    O remate não tem estes campos e continua a bater com o peito do pé: o
    amostrador dá-lhes zero quando o clip não os traz.

    E OS PÉS, do keyframe 2 ao 7 (`peLx`/`peLy` no pé de APOIO, `peRx`/`peRy` no
    que bate). Valores dados pelo utilizador a partir do editor de animação. O
    1 e o 8 não os trazem de propósito: aí os pés valem o repouso (±PI/16), e é
    o `mixPe` do amostrador (js/pose.js) que faz a passagem de um para o outro
    sem salto — para os pés, "ausente" quer dizer repouso e não zero.
    */
    frames: [
        // 1  arranca: a perna de apoio avança, a de passe começa a recuar
        { leanZ: -0.03, pelvisY: 0.06, chest: 0.12, chestY: -0.06, coxaChute: 0.20, joelhoChute: 0.45, coxaApoio: -0.18, joelhoApoio: 0.28, bracoLx: -0.25, bracoLz: 0.60, bracoRx: 0.18, bracoRz: -0.30, cotoveloL: -0.45, cotoveloR: -0.55, coxaChuteY: 0.18, peChuteY: 0.22, altura: 0.00 },
        // 2  PÉ DE APOIO PLANTA ao lado da bola, tronco inclina sobre ele
        { leanZ: -0.08, pelvisY: 0.11, chest: 0.18, chestY: -0.11, coxaChute: 0.38, joelhoChute: 0.75, coxaApoio: -0.06, joelhoApoio: 0.30, bracoLx: -0.36, bracoLz: 0.85, bracoRx: 0.26, bracoRz: -0.34, cotoveloL: -0.36, cotoveloR: -0.60, coxaChuteY: 0.38, peChuteY: 0.48, peLx: -0.28, altura: -0.01 },
        // 3  arma: o joelho dobra, a perna de passe vai atrás
        { leanZ: -0.12, pelvisY: 0.16, chest: 0.22, chestY: -0.16, coxaChute: 0.52, joelhoChute: 1.05, coxaApoio: 0.00, joelhoApoio: 0.32, bracoLx: -0.46, bracoLz: 1.05, bracoRx: 0.32, bracoRz: -0.38, cotoveloL: -0.28, cotoveloR: -0.64, coxaChuteY: 0.62, peChuteY: 0.78, peLx: -0.38, peLy: 0.14, altura: -0.02 },
        // 4  armação máxima — metade da do remate, que isto é um passe
        { leanZ: -0.14, pelvisY: 0.18, chest: 0.22, chestY: -0.18, coxaChute: 0.55, joelhoChute: 1.12, coxaApoio: 0.03, joelhoApoio: 0.32, bracoLx: -0.50, bracoLz: 1.15, bracoRx: 0.35, bracoRz: -0.40, cotoveloL: -0.24, cotoveloR: -0.66, coxaChuteY: 0.74, peChuteY: 0.92, peLx: -0.36, peLy: 0.13, altura: -0.02 },
        // 5  CONTACTO — o pé fecha na bola, o corpo por cima dela
        { leanZ: -0.10, pelvisY: -0.08, chest: 0.10, chestY: 0.08, coxaChute: -0.30, joelhoChute: 0.12, coxaApoio: 0.04, joelhoApoio: 0.24, bracoLx: 0.02, bracoLz: 0.80, bracoRx: -0.14, bracoRz: -0.44, cotoveloL: -0.22, cotoveloR: -0.34, coxaChuteY: 0.80, peChuteY: 1.00, peLx: -0.27, peLy: 0.17, peRx: 0.22, peRy: 0.08, altura: 0.01 },
        // 6  pós-impacto, a perna continua pela inércia
        { leanZ: -0.08, pelvisY: -0.14, chest: 0.02, chestY: 0.14, coxaChute: -0.62, joelhoChute: 0.08, coxaApoio: 0.05, joelhoApoio: 0.18, bracoLx: 0.16, bracoLz: 0.70, bracoRx: 0.04, bracoRz: -0.46, cotoveloL: -0.18, cotoveloR: -0.26, coxaChuteY: 0.72, peChuteY: 0.90, peLx: -0.10, peLy: 0.19, peRx: 0.54, peRy: -0.07, altura: 0.03 },
        // 7  acompanhamento CURTO, o pé desce
        { leanZ: -0.04, pelvisY: -0.08, chest: -0.02, chestY: 0.08, coxaChute: -0.32, joelhoChute: 0.16, coxaApoio: 0.03, joelhoApoio: 0.14, bracoLx: 0.10, bracoLz: 0.45, bracoRx: 0.08, bracoRz: -0.30, cotoveloL: -0.12, cotoveloR: -0.14, coxaChuteY: 0.40, peChuteY: 0.52, peLx: -0.14, peLy: 0.19, peRx: 0.07, peRy: 0.19, altura: 0.01 },
        // 8  recuperação, de novo em postura de jogo
        { leanZ: 0.00, pelvisY: 0.00, chest: 0.00, chestY: 0.00, coxaChute: 0.00, joelhoChute: 0.10, coxaApoio: 0.00, joelhoApoio: 0.10, bracoLx: 0.00, bracoLz: Math.PI / 16, bracoRx: 0.00, bracoRz: -Math.PI / 16, cotoveloL: 0.00, cotoveloR: 0.00, coxaChuteY: 0.00, peChuteY: 0.00, altura: 0.00 }
    ]
};

/*
Janela de mistura (segundos) entre a corrida de aproximação do tiro de meta e
o primeiro keyframe do clip de chute do chão. Sem ela, a pose das pernas, a
rotação/translação da bacia (o pivô no pé de apoio vale ~0.26 m de deslocação
lateral logo no frame 1), a posição do corpo no ponto de apoio e a orientação
mudavam todas no mesmo frame — lia-se como um corte entre duas animações.

Encurtada para manter proporção adequada com o tempo de 0.25s.
*/
const GK_GROUND_KICK_BLEND = 0.04;

/*
=============================================================================
GOALKEEPER_KICK_FORWARD_HIGH — chutão do guarda-redes, 12 keyframes
=============================================================================
Convenção do esqueleto (a mesma do GoalkeeperPose):
    coxa   rotation.x > 0  →  perna para TRÁS   (< 0 é para a FRENTE, o chuto)
    joelho rotation.x > 0  →  dobra para trás   (calcanhar sobe)
    peito  rotation.x > 0  →  tronco para a FRENTE (< 0 inclina para TRÁS)

Os 12 frames pedidos, distribuídos por igual no tempo normalizado (0..1),
t = (frame - 1) / 11:

     1  parado com a bola                   7  perna acelera para a frente
     2  corpo inclina levemente para trás   8  pé desce e avança para a bola
     3  perna de apoio avança               9  CONTACTO (pé na bola)
     4  perna de chute começa a recuar     10  pé continua a subir e avançar
     5  joelho dobra, pé sobe para trás    11  perna termina alta, corpo segue
     6  máxima preparação                  12  recuperação/equilíbrio

`chute` é a perna que bate (rLeg/rKnee), `apoio` a que fica no chão.
`bracoX`/`cotovelo` largam a bola a partir do frame 6 e passam a equilibrar.
=============================================================================
*/
/*
Multiplicador da FORÇA do chutão do guarda-redes (ver puntBall em player.js).
Multiplica a velocidade de saída, não o alcance: como o alcance vai com o
quadrado da velocidade, 1.15 de força dá cerca de 1.32 de distância.
*/
const GoalkeeperKickPower = 1.15;

const GoalkeeperKickClip = {
    pernaChute: 'r',    // qual das pernas bate; a outra é a de apoio
    frames: [
        // t,      chest, coxaChute, joelhoChute, coxaApoio, joelhoApoio, bracoX, cotovelo, altura
        { chest: 0.05, coxaChute: 0.05, joelhoChute: 0.12, coxaApoio: 0.05, joelhoApoio: 0.12, bracoX: -0.90, cotovelo: -2.00, altura: 0.00 },
        { chest: -0.18, coxaChute: 0.08, joelhoChute: 0.15, coxaApoio: 0.02, joelhoApoio: 0.14, bracoX: -0.90, cotovelo: -2.00, altura: 0.00 },
        { chest: -0.20, coxaChute: 0.12, joelhoChute: 0.20, coxaApoio: -0.35, joelhoApoio: 0.28, bracoX: -0.85, cotovelo: -1.90, altura: 0.00 },
        { chest: -0.25, coxaChute: 0.35, joelhoChute: 0.55, coxaApoio: -0.20, joelhoApoio: 0.20, bracoX: -0.80, cotovelo: -1.85, altura: -0.02 },
        { chest: -0.28, coxaChute: 0.60, joelhoChute: 1.30, coxaApoio: -0.10, joelhoApoio: 0.22, bracoX: -0.70, cotovelo: -1.70, altura: -0.03 },
        { chest: -0.30, coxaChute: 0.75, joelhoChute: 1.70, coxaApoio: -0.05, joelhoApoio: 0.25, bracoX: -0.50, cotovelo: -1.20, altura: -0.04 },
        { chest: -0.20, coxaChute: 0.20, joelhoChute: 1.20, coxaApoio: 0.00, joelhoApoio: 0.28, bracoX: -0.20, cotovelo: -0.80, altura: -0.02 },
        { chest: -0.08, coxaChute: -0.40, joelhoChute: 0.60, coxaApoio: 0.02, joelhoApoio: 0.30, bracoX: 0.10, cotovelo: -0.50, altura: 0.00 },
        { chest: 0.05, coxaChute: -0.85, joelhoChute: 0.15, coxaApoio: 0.04, joelhoApoio: 0.32, bracoX: 0.35, cotovelo: -0.40, altura: 0.02 },
        { chest: 0.18, coxaChute: -1.25, joelhoChute: 0.05, coxaApoio: 0.06, joelhoApoio: 0.30, bracoX: 0.50, cotovelo: -0.40, altura: 0.06 },
        { chest: 0.28, coxaChute: -1.50, joelhoChute: 0.00, coxaApoio: 0.08, joelhoApoio: 0.26, bracoX: 0.60, cotovelo: -0.50, altura: 0.08 },
        { chest: 0.05, coxaChute: -0.10, joelhoChute: 0.14, coxaApoio: 0.05, joelhoApoio: 0.14, bracoX: -0.10, cotovelo: -0.15, altura: 0.00 }
    ],

    /*
    A bola desce das mãos até ao pé entre a máxima preparação (frame 6) e o
    contacto (frame 9) — sem isto ficava agarrada à altura do peito e o pé
    batia no vazio.
    */
    largaBolaEm: 5 / 11,
    alturaMao: 1.15,
    alturaPe: 0.25
};

/*
=============================================================================
GROUND_KICK_CLIP / SET_PIECE_KICK_CLIP — 16 Keyframes (Chute de Bola Parada de Alta Resolução)
Servindo para: Tiro de Meta, Faltas, Escanteios e Pênaltis.
Biomecânica com PIVÔ NO PÉ DE APOIO:
  - O corpo todo inclina em bloco com pivô no pé de apoio cravado na relva,
    sem quebrar a cintura ou dobrar a coluna de lado.
  - Frames 1-5: Pé de apoio cravado ao lado da bola, inclinação contínua
          sobre o pé esquerdo, armação máxima da perna direita (~110° no joelho).
  - Frames 6-9: Aceleração balística, chicote pélvico e contato pé-bola (impacto no frame 10, t = 9/15 = 0.60).
  - Frames 10-14: Follow-through alto da perna de remate e elevação na ponta do pé.
  - Frames 15-16: Pouso e amortecimento neutro.
=============================================================================
*/
const GoalkeeperGroundKickClip = {
    pernaChute: 'r',
    contactFrame: 10, // frame 10 (índice 9, t = 9/15 = 0.60)
    frames: [
        // 1 (t = 0/15): Chegada e fixação do pé de apoio ao lado da bola, início da armação
        { leanZ: -0.08, pitchX: -0.06, chest: 0.00, coxaChute: 0.28, joelhoChute: 0.65, coxaChuteZ: -0.04, coxaApoio: -0.08, joelhoApoio: 0.22, bracoLx: -0.25, bracoLz: 0.40, bracoRx: 0.15, bracoRz: -0.22, cotoveloL: -0.5, cotoveloR: -0.7, altura: 0.00 },
        // 2 (t = 1/15): Inclinação sobre o apoio, perna de remate recua progressivamente
        { leanZ: -0.18, pitchX: -0.14, chest: -0.01, coxaChute: 0.52, joelhoChute: 1.15, coxaChuteZ: -0.08, coxaApoio: -0.05, joelhoApoio: 0.27, bracoLx: -0.38, bracoLz: 0.58, bracoRx: 0.28, bracoRz: -0.28, cotoveloL: -0.45, cotoveloR: -0.75, altura: -0.01 },
        // 3 (t = 2/15): Inclinação acentuando, elevação da coxa de remate
        { leanZ: -0.28, pitchX: -0.22, chest: -0.03, coxaChute: 0.78, joelhoChute: 1.65, coxaChuteZ: -0.12, coxaApoio: -0.01, joelhoApoio: 0.32, bracoLx: -0.48, bracoLz: 0.74, bracoRx: 0.38, bracoRz: -0.34, cotoveloL: -0.38, cotoveloR: -0.85, altura: -0.01 },
        // 4 (t = 3/15): FIGURA 2 - Fase de Suporte e Armação Máxima: pivô total no pé esquerdo, corpo inclinado em bloco
        { leanZ: -0.36, pitchX: -0.28, chest: -0.04, coxaChute: 0.96, joelhoChute: 1.95, coxaChuteZ: -0.15, coxaApoio: 0.02, joelhoApoio: 0.35, bracoLx: -0.55, bracoLz: 0.85, bracoRx: 0.45, bracoRz: -0.38, cotoveloL: -0.3, cotoveloR: -0.9, altura: -0.02 },
        // 5 (t = 4/15): Início do avanço pélvico acumulando energia na perna de trás
        { leanZ: -0.34, pitchX: -0.24, chest: -0.03, coxaChute: 0.82, joelhoChute: 1.80, coxaChuteZ: -0.13, coxaApoio: 0.03, joelhoApoio: 0.33, bracoLx: -0.50, bracoLz: 0.80, bracoRx: 0.38, bracoRz: -0.40, cotoveloL: -0.34, cotoveloR: -0.82, altura: -0.01 },
        // 6 (t = 5/15): Transição rápida: a coxa inicia o chicote para a frente
        { leanZ: -0.30, pitchX: -0.18, chest: -0.01, coxaChute: 0.58, joelhoChute: 1.52, coxaChuteZ: -0.10, coxaApoio: 0.04, joelhoApoio: 0.30, bracoLx: -0.42, bracoLz: 0.74, bracoRx: 0.28, bracoRz: -0.43, cotoveloL: -0.35, cotoveloR: -0.75, altura: 0.00 },
        // 7 (t = 6/15): Efeito chicote: a coxa avança acelerando e a tíbia começa a abrir
        { leanZ: -0.24, pitchX: -0.10, chest: 0.01, coxaChute: 0.28, joelhoChute: 1.20, coxaChuteZ: -0.07, coxaApoio: 0.04, joelhoApoio: 0.27, bracoLx: -0.28, bracoLz: 0.67, bracoRx: 0.12, bracoRz: -0.46, cotoveloL: -0.32, cotoveloR: -0.65, altura: 0.01 },
        // 8 (t = 7/15): Perna de remate ultrapassa a vertical da perna de apoio em alta velocidade
        { leanZ: -0.19, pitchX: -0.03, chest: 0.03, coxaChute: -0.08, joelhoChute: 0.85, coxaChuteZ: -0.04, coxaApoio: 0.05, joelhoApoio: 0.24, bracoLx: -0.10, bracoLz: 0.61, bracoRx: -0.08, bracoRz: -0.49, cotoveloL: -0.3, cotoveloR: -0.58, altura: 0.01 },
        // 9 (t = 8/15): Aproximação milimétrica final ao ponto da bola, perna esticando no ápice da velocidade
        { leanZ: -0.16, pitchX: 0.02, chest: 0.04, coxaChute: -0.48, joelhoChute: 0.42, coxaChuteZ: -0.02, coxaApoio: 0.05, joelhoApoio: 0.22, bracoLx: 0.02, bracoLz: 0.57, bracoRx: -0.22, bracoRz: -0.51, cotoveloL: -0.3, cotoveloR: -0.50, altura: 0.02 },
        // 10 (t = 9/15): FIGURA 3 - Fase de Contato (IMPACTO): pé no centro da bola, perna esticada, corpo apoiado no pé de suporte
        { leanZ: -0.14, pitchX: 0.06, chest: 0.06, coxaChute: -0.80, joelhoChute: 0.12, coxaChuteZ: 0.00, coxaApoio: 0.05, joelhoApoio: 0.20, bracoLx: 0.12, bracoLz: 0.55, bracoRx: -0.35, bracoRz: -0.52, cotoveloL: -0.3, cotoveloR: -0.45, altura: 0.03 },
        // 11 (t = 10/15): Pós-impacto imediato: perna segue subindo pela inércia balística
        { leanZ: -0.11, pitchX: 0.13, chest: 0.07, coxaChute: -1.18, joelhoChute: 0.09, coxaChuteZ: 0.00, coxaApoio: 0.06, joelhoApoio: 0.17, bracoLx: 0.22, bracoLz: 0.59, bracoRx: 0.00, bracoRz: -0.56, cotoveloL: -0.3, cotoveloR: -0.42, altura: 0.06 },
        // 12 (t = 11/15): Subida potente da perna acima da bacia
        { leanZ: -0.08, pitchX: 0.20, chest: 0.09, coxaChute: -1.48, joelhoChute: 0.06, coxaChuteZ: 0.00, coxaApoio: 0.07, joelhoApoio: 0.14, bracoLx: 0.32, bracoLz: 0.63, bracoRx: 0.25, bracoRz: -0.61, cotoveloL: -0.3, cotoveloR: -0.35, altura: 0.11 },
        // 13 (t = 12/15): FIGURA 4 - Fase de Finalização (Follow-Through Alto): perna no ápice acima da cintura, corpo elevado na ponta do pé de apoio
        { leanZ: -0.06, pitchX: 0.24, chest: 0.10, coxaChute: -1.60, joelhoChute: 0.05, coxaChuteZ: 0.00, coxaApoio: 0.08, joelhoApoio: 0.12, bracoLx: 0.38, bracoLz: 0.65, bracoRx: 0.42, bracoRz: -0.65, cotoveloL: -0.3, cotoveloR: -0.3, altura: 0.15 },
        // 14 (t = 13/15): Desaceleração suave da perna alta e descida do corpo
        { leanZ: -0.03, pitchX: 0.16, chest: 0.07, coxaChute: -1.05, joelhoChute: 0.18, coxaChuteZ: 0.00, coxaApoio: 0.05, joelhoApoio: 0.15, bracoLx: 0.26, bracoLz: 0.48, bracoRx: 0.28, bracoRz: -0.48, cotoveloL: -0.25, cotoveloR: -0.25, altura: 0.08 },
        // 15 (t = 14/15): Retorno da perna para o chão
        { leanZ: -0.01, pitchX: 0.06, chest: 0.02, coxaChute: -0.45, joelhoChute: 0.14, coxaChuteZ: 0.00, coxaApoio: 0.02, joelhoApoio: 0.12, bracoLx: 0.10, bracoLz: 0.28, bracoRx: 0.10, bracoRz: -0.28, cotoveloL: -0.1, cotoveloR: -0.1, altura: 0.02 },
        // 16 (t = 15/15): Pouso equilibrado com retorno à postura neutra de jogo
        { leanZ: 0.00, pitchX: 0.00, chest: 0.00, coxaChute: 0.00, joelhoChute: 0.10, coxaChuteZ: 0.00, coxaApoio: 0.00, joelhoApoio: 0.10, bracoLx: 0.00, bracoLz: 0.15, bracoRx: 0.00, bracoRz: -0.15, cotoveloL: 0.00, cotoveloR: 0.00, altura: 0.00 }
    ]
};



/*
=============================================================================
PLAYER_KICK_CLIP — chute de bola parada, 4 keyframes
=============================================================================
UMA animação para todos os chutes de bola parada. Não partilha nada com o
ShotClip (o remate de jogo corrido) nem com o GoalkeeperGroundKickClip: tem
keyframes próprios, função de pose própria e amostrador próprio.

Os 4 keyframes SÃO as 4 imagens de referência, uma a uma, sem frames
intermédios inventados:

    0  GoalKick1   aproximação: corpo baixo e inclinado sobre o apoio,
                   cabeça na bola, perna de chute a começar a recuar
    1  GoalKick2   passada: perna de chute atrás e levantada, joelho a
                   ~85°, braços abertos a equilibrar
    2  GoalKick3   armação máxima: coxa atrás, joelho fechado com o
                   calcanhar junto ao glúteo, tronco à frente
    3  GoalKick4   CONTACTO: perna de chute à frente e BAIXA (o pé está à
                   altura da bola, não no ar), perna de apoio atrás e no ar,
                   braços na horizontal, corpo projectado

A PERNA DE CHUTE É SEMPRE A MESMA — a direita, nos quatro keyframes. O
`coxaChute` faz 0.45 -> 0.65 -> 0.95 -> -0.70: recua de forma monótona e
depois vem à frente uma vez só. Nada nesta tabela troca de perna, e é de
propósito: o que se via antes era o ciclo de corrida a escrever as pernas por
cima do clip, com a passada a alternar por baixo do gesto.

CONTACTO NO ÚLTIMO KEYFRAME (`contactFrame: 4`, t = 1.0). São 4 frames e o
quarto é o contacto, portanto não há follow-through nenhum — a bola sai no
instante em que o gesto acaba.

Convenção de sinais (factos do rig, ver buildBody em player.js):
    coxaChute   > 0  perna para TRÁS      < 0  para a FRENTE
    joelhoChute > 0  joelho dobra, calcanhar sobe
    chest       > 0  tronco para a FRENTE
    leanZ       < 0  corpo inclina sobre o pé de apoio
    bracoLz     > 0  abre o braço esquerdo   bracoRz < 0  abre o direito
    altura           deslocação vertical do corpo, em metros
=============================================================================
*/
const PlayerKickClip = {
    pernaChute: 'r',
    contactFrame: 4,
    frames: [
        // 0 — GoalKick1. Corpo baixo (`altura` -0.08) e muito inclinado sobre
        // o apoio, joelho de apoio dobrado, cabeça a olhar a bola no chão.
        { avanco: 0.00, leanZ: -0.30, pitchX: -0.10, chest: 0.35, coxaChute: 0.45, joelhoChute: 0.80, coxaChuteZ: -0.05, coxaApoio: -0.25, joelhoApoio: 0.40, bracoLx: -0.30, bracoLz: 0.70, bracoRx: 0.20, bracoRz: -0.60, cotoveloL: -0.60, cotoveloR: -0.50, peRx: -0.10, peLx: 0.10, cabecaX: -0.45, altura: -0.08 },
        // 1 — GoalKick2. A passada: o corpo levanta-se do agachamento, a perna
        // de chute sobe atrás com o joelho a fechar, os braços abrem.
        { avanco: 0.50, leanZ: -0.15, pitchX: -0.05, chest: 0.18, coxaChute: 0.65, joelhoChute: 1.45, coxaChuteZ: -0.10, coxaApoio: -0.30, joelhoApoio: 0.25, bracoLx: -0.50, bracoLz: 1.15, bracoRx: 0.40, bracoRz: -1.05, cotoveloL: -0.40, cotoveloR: -0.35, peRx: -0.25, peLx: 0.05, cabecaX: -0.35, altura: -0.02 },
        // 2 — GoalKick3. Armação máxima. `joelhoChute` 2.20 são 126°, o
        // calcanhar junto ao glúteo que a imagem mostra; o tecto anatómico do
        // joelho são 145° (JointLimits.knee.x).
        { avanco: 0.90, leanZ: -0.20, pitchX: -0.22, chest: 0.40, coxaChute: 0.95, joelhoChute: 2.20, coxaChuteZ: -0.18, coxaApoio: -0.05, joelhoApoio: 0.15, bracoLx: -0.65, bracoLz: 1.30, bracoRx: 0.55, bracoRz: -1.20, cotoveloL: -0.30, cotoveloR: -0.25, peRx: -0.40, peLx: 0.00, cabecaX: -0.40, altura: 0.00 },
        // 3 — GoalKick4. CONTACTO. A abertura das pernas é `coxaChute` -0.70
        // (40° à frente) contra `coxaApoio` 0.75 (43° atrás), 83° no total — é
        // a abertura grande da imagem. O tronco ABRE para trás (`chest`
        // negativo) e o corpo sobe 0.18 m: na imagem os dois pés estão no ar.
        { avanco: 1.00, leanZ: -0.10, pitchX: 0.15, chest: -0.10, coxaChute: -0.70, joelhoChute: 0.05, coxaChuteZ: 0.05, coxaApoio: 0.75, joelhoApoio: 0.45, bracoLx: 0.00, bracoLz: 1.55, bracoRx: -0.10, bracoRz: -1.55, cotoveloL: -0.05, cotoveloR: -0.05, peRx: -0.25, peLx: -0.35, cabecaX: -0.20, altura: 0.18 }
    ]
};

/*
=============================================================================
GOAL_KICK_CLIP — TIRO DE META, 13 keyframes
=============================================================================
O gesto do tiro de meta, e só dele. Vive à parte do PlayerKickClip (a falta e
o penálti) de propósito: afinar um não pode mexer no outro.

=============================================================================
DE ONDE VÊM ESTES NÚMEROS
=============================================================================
Do TRAÇADO das quatro imagens de referência, e não de leitura a olho. Cada
imagem levou um esqueleto por cima — linhas rectas por segmento (coxa, canela,
pé, tronco, braço, antebraço, cabeça) e um círculo em cada junção — e os
ângulos saíram medidos daí. Ver `tools/anim/` , que guarda as fichas com as
coordenadas das junções e o traçado de cada imagem.

ANTES DISSO FORAM TRÊS VERSÕES ERRADAS, todas escritas a adivinhar a pose a
partir das imagens e a validá-la com números que não mostram o que se vê:
uma pôs o jogador a flutuar meio metro no ar, outra deitou-o de bruços a 77
graus, e a terceira deixou o frame do contacto com as pernas a 22 graus uma da
outra — um homem parado. Relato: *"Vc não consegue identificar os frames
corretamente."* Estava certo.

A ORDEM É A DAS IMAGENS COMO CHEGARAM: GoalKick1, 2, 3 e 4 nos principais 1,
5, 9 e 13. Dada pelo autor, e repetida depois de eu a ter trocado.

COMO EU A TROQUEI, para não se repetir: comparei a distância do jogador à
bola em PÍXEIS — ~50 px numa imagem, ~85 px na outra — e concluí que a mais
longe vinha primeiro. A conta não vale nada, porque as imagens têm ZOOMS
DIFERENTES: uma tem 153 px de largura e a outra 199. Distâncias em píxeis só
se comparam DENTRO da mesma imagem.

    1  GoalKick1   o arranque do passo, VISTA DE COSTAS: tronco à frente,
                   pé de apoio no chão, perna de chute atrás e no ar
    5  GoalKick2   o fim do passo: pé de apoio PLANTADO AO LADO DA BOLA, 55
                   graus à frente; perna de chute 88 graus atrás, esticada;
                   braço esquerdo atrás e direito à frente
    9  GoalKick3   armação, VISTA DE COSTAS: perna de chute 77 graus atrás e
                   ESTICADA (não é o calcanhar no glúteo — medido, o joelho
                   tem 10 graus de flexão), braços abertos PARA OS LADOS
   13  GoalKick4   CONTACTO — DEDUZIDO, não há imagem deste instante

=============================================================================
É UM PASSO, E O PÉ DE APOIO FICA AO LADO DA BOLA
=============================================================================
Pedido: *"O modelo vai dar um passo antes do chute. Um passo; pé de apoio ao
lado da bola."* O `avanco` traduz isso: 0.00 no principal 1 e 1.00 nos
principais 5, 9 e 13 — o corpo anda o passo todo até plantar o pé, e a partir
daí não anda mais. Quem chama multiplica essa fracção pela distância real (ver
a nota do `avanco` no amostrador).

É também o que obriga a coxa de apoio a nunca mais ficar atrás da anca depois
do principal 5: o pé está cravado, e o corpo é que passa por cima dele.

DUAS ARMADILHAS DA LEITURA, que já me apanharam as duas:

  . A VISTA MUDA DE IMAGEM PARA IMAGEM. Nas 23, 24 e 26 o jogador vai para a
    ESQUERDA; na 25 está de costas. Um braço que se estende para o lado da
    imagem é `bracoLx` numa vista de lado e `bracoLz` numa vista de costas —
    são canais diferentes e dão poses diferentes.
  . QUAL DAS DUAS PERNAS É A DE CHUTE NÃO SE ADIVINHA PELA BOLA. Na imagem
    do principal 5 há uma perna junto à bola e outra no ar atrás, e eu tomei
    a primeira pela que vai BATER. É o contrário: a que se planta AO LADO da
    bola é a de APOIO, e a de chute é a que está atrás, ainda a vir. Esse
    engano pôs a pose do meio no fim do gesto.
  . NÃO HÁ UM PÉ QUE SEJA SEMPRE O QUE ASSENTA, portanto o `altura`
    resolve-se pelo pé MAIS BAIXO e não por um escolhido à mão. Quando era
    escolhido à mão, um keyframe acabou com o pé de chute 0.135 m DENTRO do
    relvado.

=============================================================================
O `altura` RESOLVE-SE, NÃO SE ESCOLHE
=============================================================================
Desloca o corpo 1:1 em y, e os ângulos das pernas já mudaram a distância da
anca ao pé — portanto o valor sai de uma conta: `altura -= (y_do_pé_mais_baixo
- ALTURA_BASE_Y)`. Escolhido a olho, punha o jogador 0.646 m no ar no frame do
contacto (*"o jogador aparece flutuando"*).

Varrido o gesto em 41 amostras da interpolação, o pé de baixo afunda no
máximo 0.021 m — 2 cm, invisível.

Ângulos face à vertical, POSITIVO = para TRÁS do jogador. A conversão para o
rig é `coxa_rig = ângulo_medido - pitchX`, porque o `pitchX` roda a anca e
leva as coxas com ela (medido: `pitchX` +0.5 leva o pé 0.426 m para trás).

O `maoRx` E O `peLy` VÊM DO EDITOR, e são canais opcionais: o amostrador só
os devolve quando algum keyframe os traz, senão deixa o osso no repouso. Isso
importa no `peLy`, cujo repouso NÃO é zero — os pés nascem virados para fora
(`peG.rotation.y = +-PI/16 = 0.196`, ver `criarPerna` em pose.js). Estão nos
TREZE keyframes de propósito: postos só num, o pé e o pulso voltavam ao
repouso a meio do gesto e viam-se a rodar sozinhos.

=============================================================================
TREZE KEYFRAMES, QUATRO DELES PRINCIPAIS
=============================================================================
Os PRINCIPAIS são o 1, o 5, o 9 e o 13. Os nove do meio têm os ÂNGULOS
interpolados linearmente entre eles, mas o `altura` de cada um é RESOLVIDO à
parte, como o dos principais.

Interpolar também o `altura` não serve, e mede-se: com o passo do principal 1
para o 5 o corpo desce 0.38 m, e a linha recta entre os dois enterrava o pé de
apoio 0.104 m no relvado a meio caminho. Com o `altura` resolvido keyframe a
keyframe, o pé fica entre -0.007 e +0.015 m do chão durante o gesto inteiro.

Não são enchimento. Existem para se poderem afinar à mão no editor um a um,
que é o que a interpolação linear não sabe fazer — uma perna que acelera, um
braço que trava, o tronco que roda mais depressa a meio do que no fim. Enquanto
ninguém lhes tocar, não mudam nada; a partir do momento em que se mexe num, é
esse keyframe que manda no seu instante.

QUEM AFINAR UM PRINCIPAL tem de repensar os interpolados à volta dele, que já
não estarão na linha entre os dois. O `tools/anim/README.md` tem o caminho.

CONTACTO NO ÚLTIMO KEYFRAME (`contactFrame: 13`, t = 1.0): não há
follow-through, a bola sai no instante em que o gesto acaba.
=============================================================================
*/
const GoalKickClip = {
    pernaChute: 'r',
    contactFrame: 13,
    frames: [
        // ===== PRINCIPAL 1 — GoalKick1 =====
        // O arranque do passo, VISTA DE COSTAS: tronco 19 graus à frente, pé
        // de apoio no chão, perna de chute 33 graus atrás com o pé a 0.24 m.
        //
        // ESTA IMAGEM É A MENOS LEGÍVEL DAS QUATRO — 32 KB contra os 47 KB
        // das outras, mais pequena e mais escura — e a ANCA não se distingue
        // nela. Foi construída só do que a imagem mostra sem dúvida: corpo à
        // frente, apoio no chão, chute atrás e no ar, braços baixos junto ao
        // corpo — e conferida na vista de costas, que é a da fotografia.
        { avanco: 0.00, leanZ: -0.14, pitchX: 0.28, chest: 0.06, coxaChute: 0.30, joelhoChute: 0.50, coxaChuteZ: -0.08, coxaApoio: -0.30, joelhoApoio: 0.45, bracoLx: 0.20, bracoLz: 0.28, bracoRx: 0.20, bracoRz: -0.28, cotoveloL: -0.75, cotoveloR: -0.75, peRx: -0.25, peLx: -0.15, cabecaX: -0.25, altura: -0.00, maoRx: 0.19, maoRy: 0.00, maoRz: 0.00, peLy: 0.17 },
        // 2 — interpolado entre os principais 1 e 5.
        { avanco: 0.25, leanZ: -0.13, pitchX: 0.21, chest: 0.05, coxaChute: 0.61, joelhoChute: 0.43, coxaChuteZ: -0.05, coxaApoio: -0.47, joelhoApoio: 0.43, bracoLx: 0.53, bracoLz: 0.30, bracoRx: -0.26, bracoRz: -0.30, cotoveloL: -0.59, cotoveloR: -0.59, peRx: -0.24, peLx: -0.17, cabecaX: -0.19, altura: -0.02, maoRx: 0.19, maoRy: 0.00, maoRz: 0.00, peLy: 0.17 },
        // 3 — interpolado entre os principais 1 e 5.
        { avanco: 0.50, leanZ: -0.11, pitchX: 0.14, chest: 0.04, coxaChute: 0.92, joelhoChute: 0.36, coxaChuteZ: -0.01, coxaApoio: -0.63, joelhoApoio: 0.41, bracoLx: 0.85, bracoLz: 0.32, bracoRx: -0.72, bracoRz: -0.32, cotoveloL: -0.42, cotoveloR: -0.42, peRx: -0.23, peLx: -0.20, cabecaX: -0.13, altura: -0.09, maoRx: 0.19, maoRy: 0.00, maoRz: 0.00, peLy: 0.17 },
        // 4 — interpolado entre os principais 1 e 5.
        { avanco: 0.75, leanZ: -0.10, pitchX: 0.07, chest: 0.04, coxaChute: 1.23, joelhoChute: 0.30, coxaChuteZ: 0.02, coxaApoio: -0.80, joelhoApoio: 0.39, bracoLx: 1.18, bracoLz: 0.33, bracoRx: -1.18, bracoRz: -0.33, cotoveloL: -0.26, cotoveloR: -0.26, peRx: -0.21, peLx: -0.23, cabecaX: -0.06, altura: -0.21, maoRx: 0.19, maoRy: 0.00, maoRz: 0.00, peLy: 0.17 },
        // ===== PRINCIPAL 5 — GoalKick2 — O PÉ DE APOIO AO LADO DA BOLA =====
        // O fim do passo: `coxaApoio` -0.96 põe a perna de apoio 55 graus à
        // FRENTE, a plantar-se ao lado da bola, e `coxaChute` 1.54 põe a de
        // chute 88 graus ATRÁS, esticada e a 0.53 m do chão. Tronco a prumo.
        // Braço esquerdo ATRÁS (o oposto à perna de chute) e direito à
        // FRENTE (o oposto ao pé de apoio).
        //
        // EU TINHA ESTA IMAGEM LIDA AO CONTRÁRIO, e era esse o erro de fundo:
        // tomei a perna que está junto à bola pela perna que vai BATER nela,
        // e a que está no ar atrás pela de apoio. É o inverso — a perna que
        // se planta AO LADO da bola é a de apoio, e a que está atrás e alta é
        // a de chute, ainda a vir. Com os papéis trocados eu punha esta pose
        // no fim do gesto, como se fosse o contacto; ela é o MEIO.
        { avanco: 1.00, leanZ: -0.08, pitchX: 0.00, chest: 0.03, coxaChute: 1.54, joelhoChute: 0.23, coxaChuteZ: 0.05, coxaApoio: -0.96, joelhoApoio: 0.37, bracoLx: 1.50, bracoLz: 0.35, bracoRx: -1.64, bracoRz: -0.35, cotoveloL: -0.10, cotoveloR: -0.10, peRx: -0.20, peLx: -0.25, cabecaX: 0.00, altura: -0.38, maoRx: 0.19, maoRy: 0.00, maoRz: 0.00, peLy: 0.17 },
        // 6 — interpolado entre os principais 5 e 9.
        { avanco: 1.00, leanZ: -0.10, pitchX: 0.03, chest: 0.03, coxaChute: 1.49, joelhoChute: 0.22, coxaChuteZ: 0.00, coxaApoio: -0.86, joelhoApoio: 0.35, bracoLx: 1.07, bracoLz: 0.53, bracoRx: -1.18, bracoRz: -0.53, cotoveloL: -0.16, cotoveloR: -0.17, peRx: -0.24, peLx: -0.19, cabecaX: -0.03, altura: -0.28, maoRx: 0.19, maoRy: 0.00, maoRz: 0.00, peLy: 0.17 },
        // 7 — interpolado entre os principais 5 e 9.
        { avanco: 1.00, leanZ: -0.12, pitchX: 0.06, chest: 0.03, coxaChute: 1.45, joelhoChute: 0.20, coxaChuteZ: -0.05, coxaApoio: -0.76, joelhoApoio: 0.34, bracoLx: 0.65, bracoLz: 0.70, bracoRx: -0.72, bracoRz: -0.70, cotoveloL: -0.23, cotoveloR: -0.25, peRx: -0.28, peLx: -0.13, cabecaX: -0.05, altura: -0.19, maoRx: 0.19, maoRy: 0.00, maoRz: 0.00, peLy: 0.17 },
        // 8 — interpolado entre os principais 5 e 9.
        { avanco: 1.00, leanZ: -0.14, pitchX: 0.09, chest: 0.03, coxaChute: 1.40, joelhoChute: 0.19, coxaChuteZ: -0.10, coxaApoio: -0.65, joelhoApoio: 0.32, bracoLx: 0.23, bracoLz: 0.88, bracoRx: -0.26, bracoRz: -0.88, cotoveloL: -0.29, cotoveloR: -0.33, peRx: -0.31, peLx: -0.06, cabecaX: -0.07, altura: -0.12, maoRx: 0.19, maoRy: 0.00, maoRz: 0.00, peLy: 0.17 },
        // ===== PRINCIPAL 9 — GoalKick3 =====
        // Armação, VISTA DE COSTAS: perna de chute 77 graus atrás e ESTICADA
        // (medido no traçado, o joelho tem 10 graus de flexão — não é o
        // calcanhar no glúteo). Braços abertos PARA OS LADOS: numa vista de
        // costas, um braço estendido para o lado da imagem é abertura
        // lateral e não recuo.
        //
        // `coxaApoio` desceu de +0.19 para -0.55: o pé de apoio está cravado
        // ao lado da bola desde o principal 5, portanto a coxa não pode estar
        // ATRÁS da anca — vem da -0.96 na direcção da vertical.
        { avanco: 1.00, leanZ: -0.16, pitchX: 0.12, chest: 0.03, coxaChute: 1.35, joelhoChute: 0.18, coxaChuteZ: -0.15, coxaApoio: -0.55, joelhoApoio: 0.30, bracoLx: -0.20, bracoLz: 1.05, bracoRx: 0.20, bracoRz: -1.05, cotoveloL: -0.35, cotoveloR: -0.40, peRx: -0.35, peLx: 0.00, cabecaX: -0.10, altura: -0.06, maoRx: 0.19, maoRy: 0.00, maoRz: 0.00, peLy: 0.17 },
        // 10 — interpolado entre os principais 9 e 13.
        { avanco: 1.00, leanZ: -0.14, pitchX: 0.08, chest: 0.01, coxaChute: 0.86, joelhoChute: 0.17, coxaChuteZ: -0.10, coxaApoio: -0.50, joelhoApoio: 0.30, bracoLx: 0.03, bracoLz: 0.90, bracoRx: -0.03, bracoRz: -0.90, cotoveloL: -0.31, cotoveloR: -0.35, peRx: -0.30, peLx: -0.05, cabecaX: -0.10, altura: -0.06, maoRx: 0.19, maoRy: 0.00, maoRz: 0.00, peLy: 0.17 },
        // 11 — interpolado entre os principais 9 e 13.
        { avanco: 1.00, leanZ: -0.13, pitchX: 0.04, chest: -0.01, coxaChute: 0.38, joelhoChute: 0.17, coxaChuteZ: -0.05, coxaApoio: -0.45, joelhoApoio: 0.30, bracoLx: 0.25, bracoLz: 0.75, bracoRx: -0.25, bracoRz: -0.75, cotoveloL: -0.28, cotoveloR: -0.30, peRx: -0.25, peLx: -0.10, cabecaX: -0.10, altura: -0.07, maoRx: 0.19, maoRy: 0.00, maoRz: 0.00, peLy: 0.17 },
        // 12 — interpolado entre os principais 9 e 13.
        { avanco: 1.00, leanZ: -0.12, pitchX: -0.01, chest: -0.03, coxaChute: -0.11, joelhoChute: 0.16, coxaChuteZ: 0.00, coxaApoio: -0.40, joelhoApoio: 0.30, bracoLx: 0.47, bracoLz: 0.60, bracoRx: -0.47, bracoRz: -0.60, cotoveloL: -0.24, cotoveloR: -0.25, peRx: -0.20, peLx: -0.15, cabecaX: -0.10, altura: -0.05, maoRx: 0.19, maoRy: 0.00, maoRz: 0.00, peLy: 0.17 },
        // ===== PRINCIPAL 13 — GoalKick4 — CONTACTO =====
        // DEDUZIDO, e não medido: não há imagem de referência para este
        // instante. É a continuação do que os outros três mostram — o pé de
        // apoio fica onde se plantou e a perna de chute vem de trás (1.54)
        // para a frente (-0.60), com o joelho a esticar; os braços, que
        // estavam esticados um à frente e outro atrás, fecham para metade.
        //
        // MANDA A IMAGEM DESTE INSTANTE e ele passa a ser medido como os
        // outros, com o traçado de `tools/anim/`.
        { avanco: 1.00, leanZ: -0.10, pitchX: -0.05, chest: -0.05, coxaChute: -0.60, joelhoChute: 0.15, coxaChuteZ: 0.05, coxaApoio: -0.35, joelhoApoio: 0.30, bracoLx: 0.70, bracoLz: 0.45, bracoRx: -0.70, bracoRz: -0.45, cotoveloL: -0.20, cotoveloR: -0.20, peRx: -0.15, peLx: -0.20, cabecaX: -0.10, altura: -0.07, maoRx: 0.19, maoRy: 0.00, maoRz: 0.00, peLy: 0.17 }
    ]
};


/*
=============================================================================
LATERAL (throw-in) — a pose de quem vai repor a bola
=============================================================================
Só a POSE de espera, com a bola nas duas mãos por cima e por trás da cabeça —
a reposição em si (estado de jogo, alvo, força) ainda não existe neste
simulador, ver Match.state.

Convenção do rig (ver criarBraco/resetBonesToDefault em player.js): o braço
pende para -Y, portanto `rotation.x` mais NEGATIVO levanta-o para a frente e
por cima; a -π ficaria a apontar a direito para cima. -2.75 rad (~158°) deixa-o
um pouco atrás da vertical, que é onde o braço está no lateral.

`cotovelo` negativo dobra o antebraço para a frente do braço: com o braço já
por cima, é isso que traz as mãos para cima da testa em vez de as deixar
esticadas no ar.

`bracoZ` fecha os dois braços para dentro, para as mãos se encontrarem na bola
em vez de ficarem à largura dos ombros.
=============================================================================
*/
/*
=============================================================================
TIPOGRAFIA DAS COSTAS DA CAMISOLA
=============================================================================
Separado do desenho (player.js -> setBackTexture) para se experimentar uma
fonte sem mexer no código que a escreve.

`Bauhaus 93` é uma fonte do SISTEMA, não vem com o projecto: onde não estiver
instalada o browser cai calado no fallback seguinte, sem erro nenhum. Por isso
a cadeia acaba sempre num genérico.

O `pesoNumero` é vazio de propósito para a Bauhaus: ela já é pesada, e pedir
`bold` a uma fonte que não tem variante negra faz o browser sintetizar uma —
engorda os traços e fecha os contra-formas dos algarismos.
=============================================================================
*/
/*
=============================================================================
A MÃO — palma, quatro dedos e polegar
=============================================================================
Era uma caixa só (`0.35 x 0.4 x 0.2`), uma laje na ponta do antebraço. Passa a
ter dedos, a partir da referência dada.

O QUE NÃO PODE MUDAR é o pivô. O grupo da mão (`handG`) fica onde estava, a
`y = -0.8` do cotovelo, porque é dele que meio motor lê a posição da mão:
o alcance do IK dos braços (ik.js diz `L2 = 0.8`), o `colarBolaAsMaos` e o
`fecharMaosNaBola` (player.js), o teste de contacto do mergulho (gk_dive.js) e
o do `resolveBallContact` (match_physics.js). Acrescentar geometria por baixo
dele não mexe na origem do grupo, portanto nada disso se move.

A mão fica 0.06 mais comprida do que a laje (0.26 de palma + 0.20 de dedo
contra os 0.40 de antes). É de propósito: uma mão é mais comprida do que larga,
e a laje não era.

`aberturaPolegar` em radianos: 0 deixa o polegar paralelo aos dedos, mais afasta-o
da palma. O lado dele é espelhado pelo braço, para as duas mãos não ficarem
ambas com o polegar do mesmo lado.
=============================================================================
*/
const MaoDetalhada = {
    activo: true,
    /*
    O PUNHO, e ele é MAIS FINO DO QUE O ANTEBRAÇO — pedido.

    O antebraço é `0.30 x 0.30` de secção (ver `low` no criarBraco). Antes não
    havia punho nenhum: a palma encaixava direita na ponta do antebraço, e como
    a palma tem 0.35 de largura contra os 0.30 dele, o contorno ALARGAVA no
    pulso em vez de afunilar.

    0.24 é 80% da secção do antebraço: o pulso estreita visivelmente e a mão
    volta a abrir depois dele — antebraço, pulso fino, mão larga.

    `punhoComp` é a ALTURA da faixa, e esteve em 0.09: *"o punho está muito
    grande, reduz pela metade"*, e era na altura. 0.045 é a metade, 1.5 cm no
    boneco — uma faixa de pulso, não um segmento de braço.

    (Reduzi primeiro a SECÇÃO, de 0.24 para 0.12, e era o eixo errado.)

    `punhoComp` empurra a palma e tudo o que lhe está preso para baixo, e é de
    propósito: o pivô da mão (`handG`) fica no PULSO, onde a articulação
    realmente está, e não pode mover-se — meio motor lê a posição da mão dali.
    */
    punhoLarg: 0.24, punhoComp: 0.045, punhoEsp: 0.24,
    /*
    A JUNTA DO PUNHO — a esfera que faz a ligação girar sem abrir folga.

    O cotovelo e o joelho já têm a deles (`smallJointGeo`, raio 0.15). O punho
    não tinha nenhuma: o antebraço acabava numa face plana e a mão começava
    noutra, e ao rodar o pulso as duas faces afastavam-se e via-se por dentro.

    0.12 de raio dá 0.24 de diâmetro, exactamente a secção do punho — o mesmo
    padrão do cotovelo, cuja esfera (0.15) bate com a secção do antebraço
    (0.30). Uma esfera que bate com a secção lê-se como articulação; uma maior
    lê-se como bola.

    Ela é mais ALTA do que a faixa do punho (0.24 contra 0.045) e isso é
    normal: a do cotovelo também atravessa o braço e o antebraço. É o que fecha
    a ligação quando o pulso roda.

    É ESTA A LIGAÇÃO que permite animar o pulso nas defesas do guarda-redes. O
    nó é o `rig.lHand`/`rig.rHand`, e os canais já existem e já estão ligados:
    `maoLx`/`maoLy`/`maoLz` e `maoRx`/`maoRy`/`maoRz`, amostrados pelo
    `amostrarClipDefesaGK` e escritos pelo `aplicarPesECabeca`. Os clips
    GkLowClip/GkJump3Clip/GkJumpClip podem usá-los sem mais nada — só lhes
    faltam os valores nos keyframes.
    */
    juntaRaio: 0.12,
    // Palma
    palmaLarg: 0.35, palmaComp: 0.26, palmaEsp: 0.18,
    /*
    Dedos ao longo da largura da palma, SEM contar o polegar. Três, portanto
    quatro dedos ao todo — pedido. Eram quatro mais o polegar, cinco.

    A largura de cada um sai da divisão da palma, não de um número escrito à
    mão: mudar `dedos` ou `palmaLarg` reajusta-os sozinho e a palma continua
    cheia de ponta a ponta.
    */
    dedos: 3,
    dedoComp: 0.20, dedoEsp: 0.15,
    folgaEntreDedos: 0.015,
    /*
    OS DEDOS ENCURTAM A PARTIR DO POLEGAR — pedido: o primeiro a seguir ao
    dedão um pouquinho maior do que o do meio, e esse um pouquinho maior do que
    o último.

    Uma taxa e não uma lista de comprimentos: com `dedoDecaimento` a 0.08 cada
    dedo fica 8% mais curto do que o anterior, e a regra continua a valer se
    mudarem `dedos` de 3 para 4 ou 5. Uma lista escrita à mão ficaria curta no
    dia em que alguém acrescentasse um dedo.

    O dedo 0 é o mais próximo do polegar — os dois ficam do mesmo lado da palma
    (ver o cálculo da posição em criarBraco).

        dedo 0   0.200   (o do polegar)
        dedo 1   0.184
        dedo 2   0.169
    */
    dedoDecaimento: 0.08,
    /*
    E A PONTA É MAIS FINA DO QUE A BASE — pedido.

    `dedoAfunil` é quanto da secção da base sobra na ponta: 0.78 deixa a ponta
    com 78% da largura e da espessura junto à palma. Vale para os dedos e para
    o polegar.

    Não se faz com um cilindro: a geometria continua a ser uma CAIXA, com os
    quatro vértices da ponta puxados para dentro (ver `caixaAfunilada` no
    pose.js). Um cilindro arredondava o dedo e o modelo é todo de faces planas.
    */
    dedoAfunil: 0.78,
    // Polegar
    polegarLarg: 0.09, polegarComp: 0.17, polegarEsp: 0.15,
    aberturaPolegar: 0.55
};
if (typeof window !== 'undefined') window.MaoDetalhada = MaoDetalhada;

const CamisolaTipografia = {
    fonteNumero: '"Bauhaus 93", "Segoe UI", Arial, sans-serif',
    pesoNumero: '',
    fonteNome: '"Segoe UI", Arial, sans-serif',
    pesoNome: 'bold'
};

/*
=============================================================================
CANTO DO CAMPO — o quarto de circulo e a bandeirinha
=============================================================================
Faltavam os dois. O arco de canto tem 1 m de raio por regulamento, e a
bandeirinha e obrigatoria em campo oficial.

A bandeira e um plano com `DoubleSide`: de um lado so, desaparecia consoante
a camara — e a camara deste jogo anda a toda a volta.
*/

const LateralPose = {
    chest: -0.22,        // tronco em arco para trás, a armar o lançamento
    pelvisX: -0.06,

    bracoX: -2.75,       // os dois braços por cima, ligeiramente atrás
    /*
    `bracoZ` é ABDUÇÃO — abre o braço para FORA do corpo, e é aplicado antes da
    subida (ordem de Euler XYZ: o z roda primeiro, o x levanta depois). Esteve
    em 0.22 (V aberto) e depois em 0.05, e mesmo a 0.05 as mãos ficavam à
    largura dos ombros, com a bola a flutuar no meio delas sem lhes tocar.

    NEGATIVO é ADUÇÃO: fecha os braços para dentro. É só o ponto de partida —
    quem manda no valor final é o `fecharMaosNaBola` (player.js), que mede a
    distância entre as mãos e ajusta até elas encostarem mesmo na bola.
    */
    bracoZ: -0.16,
    cotovelo: -0.72,     // mais flectido: traz as mãos para trás da cabeça, não para cima dela

    /*
    FECHO DAS MÃOS NA BOLA. O `bracoZ` dos keyframes é um palpite: a distância
    entre as mãos depende da largura dos ombros, do comprimento do braço e do
    ângulo do cotovelo, tudo junto. Em vez de a adivinhar, mede-se e corrige-se
    (ver fecharMaosNaBola em player.js) — bissecção sobre o `bracoZ` até a
    distância entre os punhos bater no diâmetro da bola.

    `fechoIteracoes` é quantos passos de bissecção; 4 chegam para ficar abaixo
    de um centímetro. `fechoLimite` é o quanto o `bracoZ` pode andar do valor do
    keyframe, para a correcção nunca cruzar os braços.
    */
    fechoIteracoes: 4,
    fechoLimite: 0.55,
    fechoTolerancia: 0.01,   // metros

    /*
    GIRO DA CINTURA para o lado do arremesso, em radianos.

    Aplicado no `chest` e não na pélvis: rodar a bacia levava as pernas atrás
    dela e o jogador ficava de pés torcidos. A cintura é o que roda num lateral
    — o tronco, os ombros e os braços acompanham, os pés ficam plantados.

    `giroMax` é o tecto: mesmo com o alvo a 90° do corpo, a cintura não passa
    disto. O sinal e a fracção por keyframe vêm do `giro` do ThrowInClip —
    negativo na armação (roda ao contrário, a carregar) e positivo no chicote.
    */
    giroMax: 0.55,

    /*
    O QUE A CINTURA NÃO ALCANÇA, O CORPO DÁ (ver giroDoCorpoNoLateral em
    utils.js e o case LATERAL na fsm.js). Só o EXCESSO acima de `giroMax`:
    dentro do alcance da cintura o corpo continua de frente para o campo,
    exactamente como estava. Sem isto, atirar para trás deixava o jogador de
    lado para o alvo o gesto inteiro.

    `velGiroCorpo` é a velocidade dessa rotação, em rad/s. O corpo tem os
    ESPERA_APOS_REPOSICAO da espera mais a subida do clip até ao contacto para
    lá chegar; rodar de uma vez lia-se como um salto na imagem.
    */
    velGiroCorpo: 2.2,

    coxaFrente: -0.18,   // pé da frente adiantado
    joelhoFrente: 0.20,
    coxaTras: 0.22,      // e o outro atrás, a apoiar
    joelhoTras: 0.35,

    /*
    Quanto a bola fica ACIMA do ponto médio das mãos, em metros.

    As mãos seguram-na por baixo e pelos lados, portanto o centro dela não está
    à altura dos punhos — está acima deles. Sem este offset a bola ficava
    encaixada entre os punhos, meia enterrada nas mãos.

    A posição em si já não vem de constantes: a bola é colada ao ponto médio dos
    punhos lidos da matriz do mundo (ver colarBolaAsMaos em player.js), tanto na
    espera como em cada frame do gesto. As antigas `bolaAltura`/`bolaRecuo`, que
    fixavam a bola numa altura absoluta, foram removidas — era o que a punha a
    flutuar fora das mãos na pose de espera.
    */
    bolaAcimaDasMaos: 0.10,

    // Qual o pé que vai à frente ('r' ou 'l').
    peFrente: 'r'
};

/*
=============================================================================
THROW_IN_CLIP — arremesso lateral, 10 keyframes
=============================================================================
Parte da LateralPose (a pose de espera, já validada no ecrã) e leva-a pelo
gesto todo. Convenção do braço igual à da pose: `bracoX` MAIS negativo inclina
os braços para TRÁS por cima da cabeça, menos negativo traz-nos para a frente.

     1-2  espera, com a bola nas mãos por trás da cabeça
     3-4  arco para trás: tronco arqueia, braços passam por cima
     5    armação máxima
     6    LARGA A BOLA (contactFrame), braços a passar a vertical
     7-8  chicote para a frente, tronco fecha
     9-10 recuperação e regresso à postura de jogo

O pé de trás sobe na ponta no fim do gesto (`altura`), como quem se projecta —
sem isso o arremesso lê-se como um empurrão só de braços.
=============================================================================
*/
const ThrowInClip = {
    contactFrame: 6,   // índice 5, t = 5/9
    frames: [
        // 1: pose de espera
        { chest: -0.22, pelvisX: -0.06, bracoX: -2.75, bracoZ: -0.16, cotovelo: -0.72, giro: 0.00, coxaFrente: -0.18, joelhoFrente: 0.20, coxaTras: 0.22, joelhoTras: 0.35, altura: 0.00 },
        // 2: carrega o peso na perna de trás
        { chest: -0.30, pelvisX: -0.09, bracoX: -2.85, bracoZ: -0.17, cotovelo: -0.78, giro: -0.20, coxaFrente: -0.22, joelhoFrente: 0.24, coxaTras: 0.30, joelhoTras: 0.42, altura: -0.02 },
        // 3: arco para trás
        { chest: -0.42, pelvisX: -0.14, bracoX: -3.00, bracoZ: -0.18, cotovelo: -0.92, giro: -0.45, coxaFrente: -0.26, joelhoFrente: 0.26, coxaTras: 0.38, joelhoTras: 0.50, altura: -0.03 },
        // 4: quase no limite do arco
        { chest: -0.50, pelvisX: -0.17, bracoX: -3.12, bracoZ: -0.19, cotovelo: -1.00, giro: -0.60, coxaFrente: -0.28, joelhoFrente: 0.28, coxaTras: 0.42, joelhoTras: 0.55, altura: -0.04 },
        // 5: armação máxima, tudo carregado para trás
        { chest: -0.52, pelvisX: -0.18, bracoX: -3.18, bracoZ: -0.19, cotovelo: -1.02, giro: -0.65, coxaFrente: -0.26, joelhoFrente: 0.26, coxaTras: 0.40, joelhoTras: 0.52, altura: -0.04 },
        // 6: LARGA A BOLA — braços a passar a vertical, tronco já a fechar
        { chest: -0.05, pelvisX: -0.02, bracoX: -2.80, bracoZ: -0.16, cotovelo: -0.45, giro: 0.25, coxaFrente: -0.20, joelhoFrente: 0.20, coxaTras: 0.26, joelhoTras: 0.34, altura: 0.02 },
        // 7: chicote para a frente
        { chest: 0.26, pelvisX: 0.06, bracoX: -2.10, bracoZ: -0.10, cotovelo: -0.24, giro: 0.75, coxaFrente: -0.12, joelhoFrente: 0.16, coxaTras: 0.16, joelhoTras: 0.24, altura: 0.05 },
        // 8: braços à frente, corpo projectado
        { chest: 0.34, pelvisX: 0.08, bracoX: -1.30, bracoZ: 0.02, cotovelo: -0.12, giro: 1.00, coxaFrente: -0.06, joelhoFrente: 0.12, coxaTras: 0.08, joelhoTras: 0.18, altura: 0.06 },
        // 9: braços a cair, peso a passar para a frente
        { chest: 0.18, pelvisX: 0.04, bracoX: -0.60, bracoZ: 0.08, cotovelo: -0.10, giro: 0.70, coxaFrente: -0.02, joelhoFrente: 0.10, coxaTras: 0.04, joelhoTras: 0.14, altura: 0.02 },
        // 10: postura de jogo
        { chest: 0.00, pelvisX: 0.00, bracoX: 0.00, bracoZ: Math.PI / 16, cotovelo: 0.00, giro: 0.00, coxaFrente: 0.00, joelhoFrente: 0.00, coxaTras: 0.00, joelhoTras: 0.00, altura: 0.00 }
    ]
};

/*
Arremesso lateral: a que distância a bola cai e com que elevação. A potência
sai da balística (v = sqrt(R*g / sin2θ)), como no chutão do guarda-redes — não
de um número à mão.

O alcance é curto de propósito: um lateral não é um passe longo, e o
regulamento não deixa correr para o ganhar. O tecto escala com o atributo
STRENGTH de quem repõe — ver `alcanceMaxFraco`/`alcanceMaxForte` mais abaixo.
*/



/*
=============================================================================
GOALKEEPER_THROW_CLIP — lançamento com a mão do guarda-redes, 12 keyframes
=============================================================================
Lançamento overhand com o braço direito. A sequência segue as fases da
fotografia de referência:

    1-2  Pose de espera, bola na mão direita, braço ligeiramente para trás
    3-4  Armação: braço direito recua, cotovelo dobra, tronco inclina para trás
    5-6  Transição: braço sobe por cima da cabeça, cotovelo começa a estender
    7-8  Contacto: braço direito esticado para a frente/cima, bola sai
    9-12 Follow-through e recuperação

Convenção dos braços:
    bracoX  > 0  braço para a FRENTE   (< 0 é para TRÁS)
    bracoZ  > 0  braço para FORA do corpo (esquerdo) / < 0 para fora (direito)
    cotovelo  0  braço esticado, valores negativos dobram

O braço esquerdo contrabalança: começa à frente e sai para trás quando o
direito acelera para a frente.
=============================================================================
*/
/*
=============================================================================
AS TRÊS DEFESAS DO GUARDA-REDES — por altura da bola
=============================================================================
Pedido, com doze fotogramas de referência e os nomes dos keyframes:

    Defesa BAIXA   (até 1/3 da altura da baliza)   GK_Low(1..3)
    Defesa MÉDIA   (de 1/3 a 2/3)                  GK_Jump3(1..4)
    Defesa ALTA    (de 2/3 para cima)              GK_Jump(1..5)

    "Todas para bolas a mais de 4 metros lateralmente do goleiro."

O QUE ISTO SUBSTITUI, e porquê. O mergulho era PROCEDIMENTAL: três poses de
destino (`poseImpulso`/`poseVoo`/`poseChao`, js/gk_dive.js) perseguidas com
`lerpTo` em fases cronometradas. Cada pose era um alvo, não um desenho, e o que
se via era o relato: *"depois do pulo coloca os braços para trás antes da bola
chegar; quando a bola toca vai instantaneamente para o chão e coloca os braços
para baixo; começa a girar com a bola parada; fica apoiado na mão uns 2 ou 3
segundos; começa a girar para o lado oposto flutuando"*. Poses perseguidas por
interpolação não têm ordem — só destino — e por isso o gesto não conta uma
história.

Keyframes contam. O vocabulário é o dos outros clips do guarda-redes (ver
GoalkeeperThrowClip aqui em baixo), portanto o desenhador é o mesmo e estes
clips aparecem no editor de animação como qualquer outro.

O QUE OS CLIPS **NÃO** CONTROLAM: a trajectória do corpo e o tombo para o lado.
Esses são física — a parábola do salto e o eixo de queda — e continuam no
`GkDive`. Aqui só vivem os MEMBROS e o tronco, que é onde estão todos os
defeitos do relato.

Os ângulos são uma primeira passagem lida das fotografias, para o gesto ter a
forma certa; afinam-se no editor (animEditor.html), que é onde estes números se
vêem a mexer. Convenção do ombro, que é contra-intuitiva e está medida no
js/joint_limits.js: `bracoX` NEGATIVO é o braço para a FRENTE (-1.57 ≈ braço na
horizontal à frente, -2.4 ≈ por cima da cabeça); positivo manda-o para trás.
=============================================================================
*/

/*
DEFESA BAIXA — a bola rasteira, até 1/3 da baliza (0.81 m).

Três fotogramas: a saída baixa com o corpo já inclinado, o voo rente ao chão
com os dois braços esticados para a bola, e a chegada com o corpo a travar em
cima dela. As pernas ficam atrás e não se recolhem: numa defesa baixa não há
altura para recolher nada.
*/
const GkLowClip = {
    contactFrame: 2,
    frames: [
        // GK_Low(1) — impulso baixo: agacha, o tronco já vai à frente e os
        // braços partem de baixo, à frente do corpo.
        { chest: 0.30, coxaL: -0.35, joelhoL: 0.95, coxaR: -0.20, joelhoR: 0.75,
          bracoLx: -0.95, bracoLz: 0.55, bracoRx: -0.95, bracoRz: -0.55,
          cotoveloL: -0.55, cotoveloR: -0.55, altura: 0.00 },
        // GK_Low(2) — CONTACTO: corpo esticado rente ao chão, os dois braços
        // à frente, cotovelos quase direitos. É a fotografia da mão na bola.
        { chest: 0.18, coxaL: -0.55, joelhoL: 0.55, coxaR: -0.45, joelhoR: 0.40,
          bracoLx: -1.45, bracoLz: 0.30, bracoRx: -1.45, bracoRz: -0.30,
          cotoveloL: -0.12, cotoveloR: -0.12, altura: 0.00 },
        // GK_Low(3) — chegada: o corpo assenta de lado, os braços fecham
        // sobre a bola e as pernas dobram atrás.
        { chest: 0.35, coxaL: -0.30, joelhoL: 1.10, coxaR: -0.25, joelhoR: 0.95,
          bracoLx: -1.25, bracoLz: 0.20, bracoRx: -1.25, bracoRz: -0.20,
          cotoveloL: -0.45, cotoveloR: -0.45, altura: 0.00 }
    ]
};

/*
DEFESA A MEIA-ALTURA — de 1/3 a 2/3 (0.81 a 1.63 m).

Quatro fotogramas: o agachamento, a saída com o corpo a subir, o voo na
horizontal com os braços à frente do peito, e a chegada. É o mergulho clássico
de perfil.
*/
const GkJump3Clip = {
    contactFrame: 3,
    frames: [
        // GK_Jump3(1) — agacha e carrega o peso na perna do lado da bola.
        { chest: 0.22, coxaL: -0.25, joelhoL: 1.05, coxaR: -0.10, joelhoR: 0.85,
          bracoLx: -0.70, bracoLz: 0.70, bracoRx: -0.70, bracoRz: -0.70,
          cotoveloL: -0.70, cotoveloR: -0.70, altura: -0.05 },
        // GK_Jump3(2) — sai do chão: o tronco alinha e os braços sobem à
        // frente, ainda com o cotovelo dobrado.
        { chest: 0.10, coxaL: -0.50, joelhoL: 0.80, coxaR: -0.30, joelhoR: 0.60,
          bracoLx: -1.25, bracoLz: 0.45, bracoRx: -1.25, bracoRz: -0.45,
          cotoveloL: -0.40, cotoveloR: -0.40, altura: 0.00 },
        // GK_Jump3(3) — CONTACTO: extensão máxima, corpo na horizontal, os
        // dois braços esticados à altura do peito e as pernas atrás.
        { chest: -0.05, coxaL: -0.75, joelhoL: 0.45, coxaR: -0.60, joelhoR: 0.30,
          bracoLx: -1.70, bracoLz: 0.25, bracoRx: -1.70, bracoRz: -0.25,
          cotoveloL: -0.05, cotoveloR: -0.05, altura: 0.00 },
        // GK_Jump3(4) — chegada ao chão: os braços seguram à frente e as
        // pernas recolhem.
        { chest: 0.25, coxaL: -0.35, joelhoL: 1.00, coxaR: -0.30, joelhoR: 0.85,
          bracoLx: -1.35, bracoLz: 0.20, bracoRx: -1.35, bracoRz: -0.20,
          cotoveloL: -0.35, cotoveloR: -0.35, altura: 0.00 }
    ]
};

/*
DEFESA ALTA — de 2/3 da baliza para cima (1.63 m e acima).

Cinco fotogramas: agacha, sai, sobe com os braços a passar dos ombros,
extensão máxima com os dois braços por cima da cabeça (a bola no ângulo), e a
queda. É o gesto mais longo dos três, e por isso tem mais um keyframe do que os
outros — o tempo entre sair do chão e chegar ao ângulo é o que se vê.
*/
const GkJumpClip = {
    contactFrame: 4,
    frames: [
        // GK_Jump(1) — agachamento profundo: é daqui que sai a altura.
        { chest: 0.28, coxaL: -0.20, joelhoL: 1.25, coxaR: -0.05, joelhoR: 1.05,
          bracoLx: -0.55, bracoLz: 0.75, bracoRx: -0.55, bracoRz: -0.75,
          cotoveloL: -0.85, cotoveloR: -0.85, altura: -0.08 },
        // GK_Jump(2) — a impulsão: pernas a estender, braços a arrancar para
        // cima à frente do corpo.
        { chest: 0.12, coxaL: -0.45, joelhoL: 0.85, coxaR: -0.20, joelhoR: 0.60,
          bracoLx: -1.30, bracoLz: 0.55, bracoRx: -1.30, bracoRz: -0.55,
          cotoveloL: -0.50, cotoveloR: -0.50, altura: 0.02 },
        // GK_Jump(3) — no ar, os braços passam a linha dos ombros e o corpo
        // estica.
        { chest: -0.02, coxaL: -0.70, joelhoL: 0.55, coxaR: -0.45, joelhoR: 0.40,
          bracoLx: -1.95, bracoLz: 0.35, bracoRx: -1.95, bracoRz: -0.35,
          cotoveloL: -0.20, cotoveloR: -0.20, altura: 0.00 },
        // GK_Jump(4) — CONTACTO: os dois braços por cima da cabeça, cotovelos
        // direitos, corpo em linha. É a fotografia do ângulo.
        { chest: -0.12, coxaL: -0.85, joelhoL: 0.35, coxaR: -0.70, joelhoR: 0.25,
          bracoLx: -2.35, bracoLz: 0.22, bracoRx: -2.35, bracoRz: -0.22,
          cotoveloL: 0.00, cotoveloR: 0.00, altura: 0.00 },
        // GK_Jump(5) — a queda: os braços descem com a bola e as pernas
        // recolhem para a aterragem.
        { chest: 0.20, coxaL: -0.40, joelhoL: 1.05, coxaR: -0.35, joelhoR: 0.90,
          bracoLx: -1.55, bracoLz: 0.18, bracoRx: -1.55, bracoRz: -0.18,
          cotoveloL: -0.40, cotoveloR: -0.40, altura: 0.00 }
    ]
};

if (typeof window !== 'undefined') {
    window.GkLowClip = GkLowClip;
    window.GkJump3Clip = GkJump3Clip;
    window.GkJumpClip = GkJumpClip;
}

const GoalkeeperThrowClip = {
    bracoLancamento: 'r', // Braço que lança a bola
    frames: [
        // 1  Pose de espera com a bola na mão direita
        { chest: 0.05, coxaL: 0.05, joelhoL: 0.12, coxaR: 0.05, joelhoR: 0.12, bracoLx: -0.35, bracoLz: 0.35, bracoRx: -0.65, bracoRz: -0.15, cotoveloL: -0.45, cotoveloR: -1.35, altura: 0.00 },
        // 2  Início do recuo do braço direito
        { chest: -0.05, coxaL: -0.05, joelhoL: 0.15, coxaR: 0.15, joelhoR: 0.15, bracoLx: -0.45, bracoLz: 0.40, bracoRx: -0.90, bracoRz: -0.25, cotoveloL: -0.50, cotoveloR: -1.45, altura: 0.00 },
        // 3  Armação máxima — braço direito bem atrás, tronco para trás
        { chest: -0.15, coxaL: -0.10, joelhoL: 0.18, coxaR: 0.30, joelhoR: 0.20, bracoLx: -0.55, bracoLz: 0.45, bracoRx: -1.25, bracoRz: -0.40, cotoveloL: -0.55, cotoveloR: -1.30, altura: -0.02 },
        // 4  Cintura descarrega, braço direito inicia aceleração para a frente
        { chest: -0.10, coxaL: -0.15, joelhoL: 0.20, coxaR: 0.45, joelhoR: 0.28, bracoLx: -0.30, bracoLz: 0.35, bracoRx: -0.70, bracoRz: -0.30, cotoveloL: -0.60, cotoveloR: -1.10, altura: -0.02 },
        // 5  Braço sobe por cima da cabeça, cotovelo a estender
        { chest: 0.00, coxaL: -0.20, joelhoL: 0.22, coxaR: 0.55, joelhoR: 0.35, bracoLx: 0.10, bracoLz: 0.30, bracoRx: -0.20, bracoRz: -0.15, cotoveloL: -0.50, cotoveloR: -0.85, altura: 0.00 },
        // 6  Aceleração balística — braço direito quase vertical
        { chest: 0.10, coxaL: -0.25, joelhoL: 0.20, coxaR: 0.40, joelhoR: 0.30, bracoLx: 0.40, bracoLz: 0.25, bracoRx: 0.30, bracoRz: -0.05, cotoveloL: -0.40, cotoveloR: -0.55, altura: 0.00 },
        // 7  Extensão máxima antes do contacto
        { chest: 0.20, coxaL: -0.30, joelhoL: 0.15, coxaR: 0.20, joelhoR: 0.20, bracoLx: 0.65, bracoLz: 0.20, bracoRx: 0.85, bracoRz: 0.00, cotoveloL: -0.30, cotoveloR: -0.25, altura: 0.02 },
        // 8  CONTACTO — bola sai da mão, braço esticado para a frente/cima
        { chest: 0.25, coxaL: -0.35, joelhoL: 0.10, coxaR: 0.00, joelhoR: 0.12, bracoLx: 0.75, bracoLz: 0.15, bracoRx: 1.10, bracoRz: 0.05, cotoveloL: -0.25, cotoveloR: -0.10, altura: 0.03 },
        // 9  Follow-through
        { chest: 0.20, coxaL: -0.25, joelhoL: 0.10, coxaR: -0.10, joelhoR: 0.12, bracoLx: 0.50, bracoLz: 0.15, bracoRx: 0.60, bracoRz: 0.10, cotoveloL: -0.35, cotoveloR: -0.35, altura: 0.02 },
        // 10 Follow-through continua, braço direito desce
        { chest: 0.10, coxaL: -0.15, joelhoL: 0.12, coxaR: -0.05, joelhoR: 0.12, bracoLx: 0.25, bracoLz: 0.15, bracoRx: 0.20, bracoRz: 0.10, cotoveloL: -0.45, cotoveloR: -0.60, altura: 0.01 },
        // 11 Desaceleração
        { chest: 0.05, coxaL: -0.05, joelhoL: 0.12, coxaR: 0.00, joelhoR: 0.12, bracoLx: 0.00, bracoLz: 0.15, bracoRx: -0.20, bracoRz: 0.05, cotoveloL: -0.55, cotoveloR: -0.85, altura: 0.00 },
        // 12 Recuperação para postura de jogo
        { chest: 0.05, coxaL: 0.05, joelhoL: 0.12, coxaR: 0.05, joelhoR: 0.12, bracoLx: -0.20, bracoLz: 0.15, bracoRx: -0.25, bracoRz: -0.05, cotoveloL: -0.70, cotoveloR: -1.00, altura: 0.00 }
    ]
};

/*
=============================================================================
LANÇAMENTO COM A MÃO POR BAIXO — o rolamento
=============================================================================
Relato, com fotografias: *"quando o goleiro vai lançar a bola com a mão, a bola
fica nas costas dele e quando chega perto do corpo é teletransportada para o
lado do pé"*, e a seguir *"lançamento de mão por cima, para alvos a mais de 30
metros"*.

Havia UM gesto só, o de cima (`GoalkeeperThrowClip`): o braço vai atrás, sobe
por cima da cabeça e larga a bola no alto. Para a bola ROLADA — que é o que ele
faz na maioria das entregas curtas — o código largava-a lá em cima e depois
punha `Match.ball.position.y = BallPhysics.raio` (fsm.js): a bola saltava de
1.1 m para o relvado num frame, ao lado do pé. Era isso que se via.

Este é o gesto que a fotografia mostra: o corpo desce, o braço passa RENTE ao
chão e a bola é largada ao lado do pé, já no relvado. Com ele, a linha do
`raio` deixa de ser um teletransporte e passa a ser o que sempre devia ter
sido — a bola está mesmo lá.

O contacto é no frame 7 de 10 (ver ActionAnimClips.gkThrowBaixo), que é o ponto
mais baixo da mão.
=============================================================================
*/
const GoalkeeperUnderarmThrowClip = {
    bracoLancamento: 'r',
    frames: [
        // 1  Espera, bola nas duas mãos à frente do peito
        { chest: 0.05, coxaL: 0.05, joelhoL: 0.12, coxaR: 0.05, joelhoR: 0.12, bracoLx: -0.35, bracoLz: 0.35, bracoRx: -0.35, bracoRz: -0.30, cotoveloL: -0.90, cotoveloR: -0.90, altura: 0.00 },
        // 2  Passa a bola para a mão de lançamento e começa a agachar
        { chest: 0.12, coxaL: 0.10, joelhoL: 0.25, coxaR: 0.10, joelhoR: 0.25, bracoLx: -0.30, bracoLz: 0.30, bracoRx: -0.55, bracoRz: -0.20, cotoveloL: -0.70, cotoveloR: -0.60, altura: -0.04 },
        // 3  Braço recua, RENTE AO CORPO — nunca por cima do ombro
        { chest: 0.20, coxaL: 0.18, joelhoL: 0.40, coxaR: 0.20, joelhoR: 0.40, bracoLx: -0.20, bracoLz: 0.25, bracoRx: -0.95, bracoRz: -0.10, cotoveloL: -0.55, cotoveloR: -0.25, altura: -0.10 },
        // 4  Armação: braço atrás e em baixo, perna da frente a avançar
        { chest: 0.28, coxaL: -0.20, joelhoL: 0.45, coxaR: 0.45, joelhoR: 0.50, bracoLx: -0.10, bracoLz: 0.20, bracoRx: -1.15, bracoRz: -0.05, cotoveloL: -0.45, cotoveloR: -0.10, altura: -0.16 },
        // 5  Passada larga, corpo desce, braço começa a vir
        { chest: 0.38, coxaL: -0.55, joelhoL: 0.35, coxaR: 0.70, joelhoR: 0.60, bracoLx: 0.05, bracoLz: 0.18, bracoRx: -0.80, bracoRz: 0.00, cotoveloL: -0.40, cotoveloR: -0.05, altura: -0.24 },
        // 6  Quase no chão, braço a passar pela vertical do corpo
        { chest: 0.48, coxaL: -0.80, joelhoL: 0.30, coxaR: 0.85, joelhoR: 0.70, bracoLx: 0.15, bracoLz: 0.15, bracoRx: -0.35, bracoRz: 0.02, cotoveloL: -0.35, cotoveloR: 0.00, altura: -0.32 },
        // 7  CONTACTO — mão no relvado, ao lado do pé da frente
        { chest: 0.55, coxaL: -0.95, joelhoL: 0.28, coxaR: 0.90, joelhoR: 0.75, bracoLx: 0.20, bracoLz: 0.12, bracoRx: -0.05, bracoRz: 0.03, cotoveloL: -0.30, cotoveloR: 0.00, altura: -0.36 },
        // 8  Follow-through: a mão continua para a frente, rente
        { chest: 0.50, coxaL: -0.85, joelhoL: 0.30, coxaR: 0.75, joelhoR: 0.65, bracoLx: 0.25, bracoLz: 0.12, bracoRx: 0.35, bracoRz: 0.05, cotoveloL: -0.35, cotoveloR: -0.10, altura: -0.30 },
        // 9  Começa a levantar
        { chest: 0.30, coxaL: -0.45, joelhoL: 0.25, coxaR: 0.40, joelhoR: 0.40, bracoLx: 0.15, bracoLz: 0.15, bracoRx: 0.20, bracoRz: 0.05, cotoveloL: -0.50, cotoveloR: -0.45, altura: -0.16 },
        // 10 De pé, postura de jogo
        { chest: 0.05, coxaL: 0.05, joelhoL: 0.12, coxaR: 0.05, joelhoR: 0.12, bracoLx: -0.20, bracoLz: 0.15, bracoRx: -0.25, bracoRz: -0.05, cotoveloL: -0.70, cotoveloR: -1.00, altura: 0.00 }
    ]
};


/*
=============================================================================
BALL_CONTROL_RIGHT — Domínio orientado de bola pelo lado direito, 8 keyframes
=============================================================================
Quando a bola é recebida de frente pelo lado direito do jogador:
- Perna esquerda (apoio) vai um pouco para trás e flete ligeiramente o joelho
- Perna direita (domínio) vai um pouco à frente e abre para amortecer com a chapa/pé direito
- Tronco inclina ligeiramente à frente para amortecer o impacto
- Braços abrem em contrabalanço
- No frame de contacto, dá o toque orientado na direcção de saída do lance

     1  preparação: peso assenta no apoio, perna esquerda recua ligeiramente
     2  perna direita avança e abre ligeiramente para receber a bola
     3  aproximação máxima do pé à trajectória da bola
     4  amortecimento inicial: o pé direito recebe a bola
     5  CONTACTO / TOQUE ORIENTADO: toque de saída para onde vai jogar
     6  continuação do toque e transferência de peso para a frente
     7  recuperação postural: perna esquerda avança para arrancar
     8  transição fluida para a corrida / condução
=============================================================================
*/
const BallControlRightClip = {
    pernaControlo: 'r',
    contactFrame: 5,
    frames: [
        // 1  preparação: peso assenta no apoio, perna esquerda recua ligeiramente
        { chest: 0.12, chestY: -0.08, pelvisY: 0.08, leanZ: -0.05, coxaL: 0.18, joelhoL: 0.22, coxaR: -0.15, joelhoR: 0.35, coxaRz: -0.10, bracoLx: -0.25, bracoLz: 0.35, bracoRx: 0.20, bracoRz: -0.35, cotoveloL: -0.50, cotoveloR: -0.50, altura: 0.00 },
        // 2  perna direita avança e abre ligeiramente para receber a bola
        { chest: 0.18, chestY: -0.15, pelvisY: 0.14, leanZ: -0.08, coxaL: 0.28, joelhoL: 0.32, coxaR: -0.32, joelhoR: 0.42, coxaRz: -0.18, bracoLx: -0.35, bracoLz: 0.42, bracoRx: 0.28, bracoRz: -0.42, cotoveloL: -0.55, cotoveloR: -0.55, altura: -0.01 },
        // 3  aproximação máxima do pé à trajectória da bola
        { chest: 0.22, chestY: -0.18, pelvisY: 0.18, leanZ: -0.10, coxaL: 0.34, joelhoL: 0.38, coxaR: -0.45, joelhoR: 0.38, coxaRz: -0.22, bracoLx: -0.40, bracoLz: 0.45, bracoRx: 0.32, bracoRz: -0.45, cotoveloL: -0.58, cotoveloR: -0.58, altura: -0.02 },
        // 4  amortecimento inicial: o pé direito recebe a bola
        { chest: 0.20, chestY: -0.16, pelvisY: 0.16, leanZ: -0.08, coxaL: 0.30, joelhoL: 0.34, coxaR: -0.50, joelhoR: 0.28, coxaRz: -0.20, bracoLx: -0.36, bracoLz: 0.40, bracoRx: 0.26, bracoRz: -0.40, cotoveloL: -0.55, cotoveloR: -0.55, altura: -0.01 },
        // 5  CONTACTO / TOQUE ORIENTADO: toque de saída para onde vai jogar
        { chest: 0.16, chestY: -0.10, pelvisY: 0.12, leanZ: -0.05, coxaL: 0.22, joelhoL: 0.26, coxaR: -0.55, joelhoR: 0.18, coxaRz: -0.15, bracoLx: -0.28, bracoLz: 0.32, bracoRx: 0.18, bracoRz: -0.32, cotoveloL: -0.48, cotoveloR: -0.48, altura: 0.00 },
        // 6  continuação do toque e transferência de peso para a frente
        { chest: 0.12, chestY: -0.05, pelvisY: 0.06, leanZ: -0.02, coxaL: 0.12, joelhoL: 0.18, coxaR: -0.40, joelhoR: 0.12, coxaRz: -0.08, bracoLx: -0.18, bracoLz: 0.25, bracoRx: 0.10, bracoRz: -0.25, cotoveloL: -0.40, cotoveloR: -0.40, altura: 0.00 },
        // 7  recuperação postural: perna esquerda avança para arrancar
        { chest: 0.08, chestY: 0.00, pelvisY: 0.02, leanZ: 0.00, coxaL: 0.05, joelhoL: 0.12, coxaR: -0.20, joelhoR: 0.10, coxaRz: -0.03, bracoLx: -0.08, bracoLz: 0.20, bracoRx: 0.04, bracoRz: -0.20, cotoveloL: -0.30, cotoveloR: -0.30, altura: 0.00 },
        // 8  transição fluida para a corrida / condução
        { chest: 0.04, chestY: 0.00, pelvisY: 0.00, leanZ: 0.00, coxaL: 0.00, joelhoL: 0.10, coxaR: 0.00, joelhoR: 0.10, coxaRz: 0.00, bracoLx: 0.00, bracoLz: Math.PI / 16, bracoRx: 0.00, bracoRz: -Math.PI / 16, cotoveloL: 0.00, cotoveloR: 0.00, altura: 0.00 }
    ]
};

// window.goleiroEstado, window.goleiroReagiu e window.delayReacaoCalculado
// foram movidos para propriedades de instância de FootballPlayer (gkEstado,
// gkReagiu, gkDelayReacao). Cada GK tem o seu próprio estado independente.
window.bolaChutada = false;

window.speedMultiplier = 1.0;

/*
Ritmo base da simulação, à parte do `speedMultiplier`.

O `speedMultiplier` é o controlo do painel (0.5x / 1.0x / 1.3x) — mexer nele
faria o botão "1.0x" deixar de significar velocidade normal. Este é o ritmo
do JOGO em si: multiplica o passo de tempo de tudo (jogadores, bola, timers,
cadências), por isso abranda a partida inteira de forma coerente em vez de
travar só quem corre.

    1.00   ritmo original
    0.90   -10% (pedido)
    0.81   -10% de novo, sobre o 0.90 (pedido)
    0.891  +10% sobre o 0.81 (pedido)
    0.8019 -10% sobre o 0.891 (pedido)
    0.88209 +10% sobre o 0.8019 (pedido)
    0.793881 -10% sobre o 0.88209 (pedido)
    0.912963 +15% sobre o 0.793881 (pedido)
    1.00     de volta ao ritmo original (pedido)
    0.90     -10% sobre o ritmo original (pedido)
    0.90     definido para 0.9 no PC (pedido)
*/

/*
=============================================================================
PEDIR A BOLA — o braço levantado de quem ataca as costas da defesa
=============================================================================
Pedido: "o jogador sai correndo uns 3 ou 4 metros antes do zagueiro com o
braço levantado pedindo bola".

Não é um clip: é uma sobreposição de UM braço por cima da passada, porque o
jogador continua a correr enquanto pede. O outro braço mantém o balanço, que é
o que se vê num jogo — ninguém corre com os dois braços no ar.

`z` é a abdução no rig (o braço afasta-se do tronco; a passada neutra usa
PI/16 ≈ 0.20). 1.75 rad são ~100°, o braço acima do ombro, apontado para o
espaço. `x` puxa-o um pouco à frente do plano do tronco, que é como se aponta
para onde se quer a bola. Dentro do limite do ombro (JointLimits.shoulder,
180° nos dois eixos) e longe do tecto, onde o `clampOmbro` começa a ceder.

`duracao` é quanto o pedido sobrevive ao frame em que foi marcado: o ramo do
cara a cara reavalia a cada decisão de passe do portador, e sem esta memória o
braço piscava. Meio segundo cobre a folga entre duas decisões.
=============================================================================
*/
const PedidoDeBola = {
    duracao: 0.6,
    z: 1.75,
    x: 0.35,
    cotovelo: -0.25,
    // Suavização por frame, para o braço subir em vez de saltar.
    suavizacao: 0.35
};
if (typeof window !== 'undefined') window.PedidoDeBola = PedidoDeBola;
