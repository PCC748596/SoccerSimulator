/*
=============================================================================
FUNCTION & OBJECT INDEX
=============================================================================
- SimpleOrbitControls: Class handling mouse/touch inputs for free camera rotation and zoom.
    * onMouseDown, onMouseMove, onMouseUp: Mouse interactions.
    * onWheel: Zoom interaction via scroll wheel.
    * onTouchStart, onTouchMove: Mobile touch & pinch-to-zoom support.
    * updateCameraPosition: Calculates cartesian coordinates from spherical angles.

- mergeNonIndexedGeometries: Utility to combine multiple Three.js geometries into one to improve rendering performance.
- createSpectatorGeometry: Builds the basic modular shape of a crowd spectator (head, chest, limbs).
- getRunPose: Returns rotation values for limbs based on the current animation cycle time.

- Tatics: Global object managing formation, play style, passing style, and field sectors.
    * toggleSector: Adds/removes focused attacking sectors for AI behavior.
    * getWeightedSectorX: Returns an X coordinate favoring the chosen tactical sectors.
    * update, updateSkills: Refreshes tactics and stats based on UI changes.

- Match: Main game loop and state manager.
    * init: Sets up scene, field, ball, UI bindings, and teams.
    * setupKeyboardListeners: Binds UI/Camera controls to keyboard keys.
    * setSpeed, setCameraMode: Updates time scale and view type globally.
    * updateCamera: Follows the ball using the selected broadcast view using smooth interpolation.
    * createField: Generates the 3D stadium, grass, lines, goals, and instanced crowd.
    * createTeams: Instantiates FootballPlayer objects for both teams and sets their colors.
    * assignFormations: Positions players based on the selected tactic array (FormationsData).
    * resetPlay: Restores players and ball to starting positions (kick-off).
    * update: Main tick function (physics, AI, rendering).
    * updateCrowd: Animates the instanced spectators based on match excitement and ball position.
    * runTeamAI: Core logic for positioning, marking, covering, and attacking phase transitions.
    * updateBall: Physics for ball movement, friction, gravity, and goal/out detection.
    * setupSetPiece: Arranges players dynamically for corners or goal kicks.
    
- FootballPlayer: Class representing an individual athlete on the field.
    * getSkill: Retrieves the overall stat for the player's specific role from TeamSkills.
    * resetBonesToDefault: Resets the 3D skeleton to T-pose/idle to prevent animation glitches.
    * findPassTargetRelaxed, findPassTarget: Logic to identify the best teammate to receive a pass based on distance and pressure.
    * runBehaviorTree: High-level AI for decision making (pass, shoot, cross, carry, dribble, tackle).
    * initiatePass, initiateShoot, executeHeader: Triggers explicit action states in the FSM.
    * update: Per-frame update for player logic and bone animation.
    * steerArrive: Calculates velocity to smoothly reach a target coordinate using steering behaviors.
    * animateBones: Procedural animation for running, jumping, and resting poses.
    * buildBody: Constructs the hierarchical 3D mesh and skeleton structure.
    * updateShirt: Generates a canvas texture to draw the player's number and position on their back.
    * updateGK: Specialized AI and physics specifically for Goalkeepers (diving, saving, positioning).
    
- PlayerFSM: Finite State Machine (FSM) for player actions.
    * changeState: Transitions safely between IDLE, MOVE_TO_POS, CARRY, DRIBBLE, PASS, TACKLE, SET_PIECE, etc.
    * update: Executes state-specific logic over time (e.g. performing a sliding tackle over 1.5 seconds).
    
- lerp, lerpTo: Mathematical utility functions for smooth interpolation between values.
- applyKeyframeAnimation: Applies pre-baked animation data (from OptimizedAnimations object) to a player's rig.
- ownGoalZCenter: Helper to get the Z position of a team's defending goal.
- animate: The browser's main requestAnimationFrame loop running the simulation.
=============================================================================
*/

const LARGURA_BALIZA = 7.32; const ALTURA_BALIZA = 2.44; const ALTURA_BASE_Y = 0.0;

/*
Altura da TESTA acima da base do modelo.

`model.position` está nos PÉS (y = ALTURA_BASE_Y). O rig, à escala 1.8/5.5,
põe o centro da cabeça a ~1.64 m e a testa a ~1.75 m. Este valor é o ponto de
contacto de um cabeceio — ver distanciaAoCorpo() em utils.js.
*/
const ALTURA_CABECA = 1.72;
const CAMPO_LARG = 68; const CAMPO_COMP = 106;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
const _line1 = new THREE.Line3();
const _vUp = new THREE.Vector3(0, 1, 0);   // eixo vertical, para rodar direcções no plano do campo

/*
=============================================================================
FÍSICA DA BOLA — valores reais, não afinados à mão
=============================================================================
O que estava antes em updateBall(), e porque estava errado:

    gravidade   15.0 m/s²        53% acima da real; a bola caía como pedra
    raio        0.15 m           circunferência 94 cm (regulamento: 68-70)
    arrasto     pow(0.85, dt)    decaimento EXPONENCIAL, proporcional a v e
                                 só em x/z. O arrasto real é quadrático (∝v²)
                                 e trava as três componentes: com o modelo
                                 antigo uma bola lenta perdia 15%/s (a mais)
                                 e uma bola a 30 m/s quase não travava (a
                                 menos). Daí o voo "esquisito".
    chão        pow(0.55, dt)    45% da velocidade por segundo a rolar. Uma
                                 bola a rolar perde ~1 m/s por segundo, e
                                 essa perda é constante (μ·g), não uma
                                 fracção da velocidade.

Valores agora:
    massa 430 g          FIFA Lei 2 (410-450 g)
    circunferência 69 cm FIFA Lei 2 (68-70 cm) → raio 0.11 m
    ρ = 1.225 kg/m³      ar seco, 1 atm (101 325 Pa), nível do mar, 15 °C
    Cd = 0.25            bola de futebol em regime turbulento
    g = 9.81 m/s²

    arrasto:    a = ½·ρ·Cd·A/m · v²  =  0.0135·v²
                (0.34 m/s² a 5 m/s; 12.2 m/s² a 30 m/s)
    rolamento:  a = μ·g = 0.98 m/s², constante
=============================================================================
*/
const BallPhysics = {
    massa: 0.430,           // kg
    raio: 0.11,             // m (circunferência 69 cm)
    gravidade: 9.81,        // m/s²
    densidadeAr: 1.225,     // kg/m³ — 1 atm, nível do mar, 15 °C
    cd: 0.25,               // coeficiente de arrasto
    restituicao: 0.60,      // ressalto vertical em relva
    atritoRessalto: 0.75,   // perda horizontal em cada ressalto
    atritoRolamento: 0.10,  // μ de rolamento em relva
    vMinRessalto: 0.6,      // abaixo disto não ressalta, assenta
    vMinRolar: 0.25,        // abaixo disto pára de vez

    /*
    Só a MALHA é aumentada, não a física: a bola regulamentar (raio 0.11 m)
    fica pequena de mais para se ver bem à distância da câmara. O raio de
    colisão, o ressalto e a rotação continuam a usar o valor real.
    */
    escalaVisual: 1.30
};

/*
=============================================================================
BARREIRA DO CAMPO — muro de contenção à frente da bancada
=============================================================================
Sem isto, uma bola forte para fora saía do estádio e ia rolar por baixo das
bancadas até parar sozinha (a física real tem pouco atrito de rolamento e o
`resetPlay` só acontece depois de ela parar).

As bancadas laterais começam em |x| = 38.5 e as de fundo em |z| = 58.5 (ver
createField). A barreira fica logo à frente delas, com a folga do degrau.

A contenção aplica-se a QUALQUER altura da bola, embora o painel só suba
`alturaPainel`: acima disso é a rede de protecção (a parte translúcida), que
existe pela mesma razão nos estádios a sério.
=============================================================================
*/
const BarreiraCampo = {
    x: 37.0,
    z: 57.0,
    alturaPainel: 1.1,      // muro de publicidade, opaco
    alturaRede: 4.5,        // rede de protecção por cima, translúcida
    restituicao: 0.35,      // ressalto seco: a bola morre ali, não volta ao meio
    atrito: 0.6             // perda na componente paralela ao embate
};
BallPhysics.area = Math.PI * BallPhysics.raio * BallPhysics.raio;
// ½·ρ·Cd·A/m — multiplicar por v² dá a desaceleração em m/s².
BallPhysics.kArrasto = 0.5 * BallPhysics.densidadeAr * BallPhysics.cd *
    BallPhysics.area / BallPhysics.massa;

/*
Sincronização gameplay↔animação (ActionState, ver js/bt/action_state.js).
contactTime é a fracção (0..1) da duração do gesto em que o efeito real
(bola sai do pé, etc.) dispara — não no instante em que o BT decide.
Começa só pelo PASS; os valores replicam exactamente o timing antigo
(this.timer<0.08 / >=0.2) para não mudar o "feel" ao migrar de arquitectura.
*/
const ActionAnimClips = {
    pass: { duration: 0.2, contactTime: 0.4 },
    // Chutão do guarda-redes (ver GoalkeeperKickClip). O contactTime cai
    // exactamente no keyframe 9 (t = 8/11), o frame do contacto pé-bola.
    gkPunt: { duration: 0.85, contactTime: 8 / 11 }
};

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
DRIBBLE_CUT_30 — corte lateral em diagonal de 30°, 12 keyframes
=============================================================================
Três camadas independentes, aplicadas POR CIMA do ciclo de corrida
(animateBones já pôs as pernas a correr; isto é um aditivo, não uma pose
que substitui tudo):

    CORPO    inclinação lateral (pelvis.z) + rotação do quadril (pelvis.y)
    PERNAS   viés diagonal na perna externa, sobre a passada normal
    BOLA     dois toques laterais curtos, nos frames 6 e 9

O detalhe que faz parecer natural: o jogador NÃO roda 30° de uma vez. O
quadril (`quadrilY`) antecipa a mudança e o tronco contra-roda
(`troncoY`, sinal oposto), por isso o peito continua parcialmente virado
para a frente enquanto o centro de massa já foi para a diagonal. A rotação
efectiva do corpo vem da direcção de deslocamento, que roda suavemente.

Frames pedidos:
     1  corrida normal, bola perto do pé   7  ponto máximo da mudança
     2  começa a inclinar o corpo          8  corpo acompanha os 30°
     3  pé externo planta no chão          9  pé externo toca outra vez
     4  quadril muda de direcção          10  recupera velocidade
     5  perna interna cruza lateralmente  11  volta à posição de corrida
     6  bola conduzida para o lado        12  corrida estabilizada

Sinais são para um corte à DIREITA; ao aplicar multiplica-se por `lado`.
=============================================================================
*/
const DribbleCutClip = {
    angulo: Math.PI / 6,     // 30°
    duracao: 0.75,           // s do gesto completo
    toques: [5 / 11, 8 / 11],// frames 6 e 9 — toques laterais alternados
    // Fracção da passada usada em cada toque lateral (curto, bola perto).
    forcaToque: 0.55,

    frames: [
        { leanZ: 0.00, quadrilY: 0.00, troncoY: 0.00, coxaExt: 0.00, joelhoExt: 0.00, bracoZ: 0.00 },
        { leanZ: 0.08, quadrilY: 0.03, troncoY: -0.02, coxaExt: 0.00, joelhoExt: 0.00, bracoZ: 0.05 },
        { leanZ: 0.16, quadrilY: 0.06, troncoY: -0.04, coxaExt: 0.25, joelhoExt: 0.15, bracoZ: 0.12 },
        { leanZ: 0.22, quadrilY: 0.14, troncoY: -0.09, coxaExt: 0.15, joelhoExt: 0.25, bracoZ: 0.18 },
        { leanZ: 0.26, quadrilY: 0.22, troncoY: -0.14, coxaExt: -0.20, joelhoExt: 0.35, bracoZ: 0.22 },
        { leanZ: 0.30, quadrilY: 0.28, troncoY: -0.17, coxaExt: -0.10, joelhoExt: 0.20, bracoZ: 0.25 },
        { leanZ: 0.32, quadrilY: 0.34, troncoY: -0.18, coxaExt: 0.00, joelhoExt: 0.10, bracoZ: 0.26 },
        { leanZ: 0.26, quadrilY: 0.34, troncoY: -0.12, coxaExt: 0.10, joelhoExt: 0.10, bracoZ: 0.22 },
        { leanZ: 0.18, quadrilY: 0.30, troncoY: -0.06, coxaExt: 0.20, joelhoExt: 0.18, bracoZ: 0.16 },
        { leanZ: 0.10, quadrilY: 0.22, troncoY: -0.02, coxaExt: 0.08, joelhoExt: 0.08, bracoZ: 0.10 },
        { leanZ: 0.04, quadrilY: 0.12, troncoY: 0.00, coxaExt: 0.00, joelhoExt: 0.00, bracoZ: 0.04 },
        { leanZ: 0.00, quadrilY: 0.00, troncoY: 0.00, coxaExt: 0.00, joelhoExt: 0.00, bracoZ: 0.00 }
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

    1.00  ritmo original
    0.90  -10% (pedido)
*/
const GAME_SPEED = 0.90;

window.cameraMode = 'center';
window.cameraZoom = 1.0;
window.isPaused = false;

const TeamSkills = {
    TeamA: { def: 80, mid: 80, ata: 80, gk: 80 },
    TeamB: { def: 80, mid: 80, ata: 80, gk: 80 }
};

/*
=============================================================================
ANDAMENTOS — andar, trotar, correr
=============================================================================
Havia UMA animação só. O `getRunPose` devolvia sempre a mesma amplitude
(anca ±1.1 rad = 63°, braços ±1.0), e a velocidade do jogador só mudava a
rapidez do ciclo: andar era correr em câmara lenta, com o mesmo passo enorme e
o mesmo tronco inclinado 17° para a frente.

Os três andamentos diferem em quase tudo, não só na cadência:

    a andar   passo curto, joelho quase direito, braços praticamente parados,
              tronco a prumo, sem fase de voo
    a trotar  passo médio, joelho a subir, braços dobrados a oscilar
    a correr  passo longo, calcanhar quase ao rabo, braços a bombear, tronco
              inclinado para a frente

`passada` é o avanço em metros por CICLO COMPLETO (dois passos) e é o que dá a
cadência: cadência = velocidade / passada. Antes o divisor era 3.0 fixo, o que
equivale a dizer que se dá o mesmo tamanho de passo a andar e a sprintar.

Os valores intermédios são interpolados, por isso a transição entre andamentos
não tem degraus.
=============================================================================
*/
const GaitModel = {
    andar: {
        vel: 1.8,             // velocidade típica deste andamento (m/s)
        passada: 1.55,        // metros por ciclo completo
        anca: 0.40,           // amplitude da coxa (rad)
        joelhoBase: 0.06,     // flexão mínima, mesmo na perna de apoio
        joelhoOscila: 0.55,   // flexão adicional na fase de balanço
        pe: 0.18,
        braco: 0.16,          // a andar os braços quase não se mexem
        cotovelo: -0.22,      // e vão quase esticados
        tronco: 0.05,         // a prumo
        ressalto: 0.015       // meia-amplitude da subida/descida da anca (m)
    },
    trote: {
        vel: 4.5,
        passada: 2.90,
        anca: 0.78,
        joelhoBase: 0.12,
        joelhoOscila: 1.15,
        pe: 0.30,
        braco: 0.52,
        cotovelo: -0.95,
        tronco: 0.15,
        ressalto: 0.028
    },
    correr: {
        vel: 8.0,
        passada: 4.40,
        anca: 1.20,
        joelhoBase: 0.20,
        joelhoOscila: 1.95,   // calcanhar quase ao rabo
        pe: 0.45,
        braco: 1.00,
        cotovelo: -1.55,      // braços bem dobrados a bombear
        tronco: 0.30,         // inclinado para a frente
        ressalto: 0.045       // ~9 cm de oscilação total, como numa corrida a sério
    }
};

/*
Forma do bloco. Todos os valores estão no REFERENCIAL DE ATAQUE da equipa:
    -53 = linha de baliza própria      -36.5 = linha da própria grande área
      0 = linha central                +53 = linha de baliza adversária
Para converter para o mundo, multiplicar por p.dirZ.
*/
const TeamShape = {
    // Altura MÁXIMA da linha defensiva (a linha do fora-de-jogo).
    // A linha acompanha a bola, mas nunca sobe acima deste tecto.
    linhaDefensiva: {
        low: -32.5,     // 4 m à frente da linha da grande área
        medium: -18.25, // a meio caminho entre a grande área e a linha central
        high: -2.0      // 2 m atrás da linha central
    },

    lineFloor: -43.0,     // a linha nunca recua mais do que isto (10 m da baliza)

    /*
    Tecto ABSOLUTO de avanço sem bola, por Defensive Pressure (painel
    esquerdo) — em metros no referencial de ataque (0 = meio-campo, +53 =
    baliza adversária). Substitui/limita o antigo comportamento de o bloco
    seguir literalmente `ballZ*dir`: numa reposição do GR adversário (bola
    lá no fundo do campo dele) o bloco tentava ficar "à frente da bola" e
    saltava quase até ao ataque, mesmo em Balanced.
    */
    pressaoLineCap: {
        low: 0.0,                      // nunca passa do meio-campo
        balanced: (CAMPO_COMP / 2) / 3,       // 1/3 do campo de ataque (~17.7)
        high: (CAMPO_COMP / 2) * 2 / 3         // 2/3 do campo de ataque (~35.3)
    },

    blockDepthDef: 36.0,  // profundidade do bloco sem bola (último defesa → avançado)
    blockDepthAtk: 44.0,  // profundidade do bloco com bola

    atkAnchorLag: 26.0,   // no ataque, a última linha fica esta distância atrás da bola
    atkAnchorMax: 14.0,   // e não sobe acima disto

    // Construção: com a bola aquém deste Z, um médio desce a dar linha de passe.
    supportBallZ: -6.0,
    supportAhead: 9.0,    // quantos metros à frente da bola se oferece
    supportWide: 8.0      // e quanto abre para o lado, para abrir o corredor
};

/*
=============================================================================
O BLOCO — camada 1
=============================================================================
O nível 1 produz um RECTÂNGULO e mais nada. O nível 2 coloca cada jogador
dentro dele por percentagem, e o nível 3 decide o que ele faz.

Porquê um rectângulo em vez das fórmulas por posição que existiam:

    Todas as compressões eram `clamp(alvo, minimo, maximo)`. Um clamp PROJECTA
    toda a gente que está fora sobre o MESMO valor de fronteira — quatro
    jogadores acima do tecto saíam com z idêntico ao centímetro, e 10% dos
    alvos ficavam exactamente em x=28. Era isso que produzia os montes de
    jogadores no mesmo sítio.

    Com percentagens não há clamps: comprimir o bloco é encolher o rectângulo,
    e toda a gente encolhe junta mantendo a forma. A compacidade e a amplitude
    passam a ser um número cada, e não uma cascata de limites.

Tudo aqui em fracções, no REFERENCIAL DE ATAQUE:
    profundidade e recuo    fracção do comprimento do campo (106 m)
    largura e desvio        fracção da largura do campo (68 m)
=============================================================================
*/
// Rapidez com que o alvo de posicionamento persegue o valor calculado, em 1/s.
// 3.0 => ~0.33 s de constante de tempo.
const PositionSmoothing = 3.0;

const BlockShape = {
    /*
    Profundidade do bloco (da última linha ao jogador mais avançado), por
    definição de compacidade do painel. 0.34 × 106 = 36 m, que é o valor que
    o blockDepthDef tinha afinado.
    */
    profundidade: {
        short: 20 / 106,      // 20 m — bloco curto
        median: 30 / 106,     // 30 m — bloco médio
        large: 40 / 106       // 40 m — bloco longo
    },

    // Com bola o bloco estica: há que dar profundidade para jogar.
    profundidadeComBola: 1.22,

    /*
    Largura do bloco. É a amplitude da equipa — a manípula que o senhor pediu:
    um número só, e todas as posições abrem ou fecham em proporção.
    */
    amplitude: {
        short: 0.50,          // 50%
        median: 0.60,         // 60%
        large: 0.70           // 70%
    },

    // Com bola a equipa abre para esticar o adversário.
    amplitudeComBola: 1.15,

    /*
    Quanto o bloco acompanha a bola lateralmente (basculação).

    Substitui os degraus `if (ballX > 10) targetX = min(-18, targetX+12)` do
    commit: em vez de empurrar cada jogador contra um limite fixo, desloca-se o
    rectângulo inteiro. Ninguém se sobrepõe a ninguém porque a forma não muda.
    */
    bascular: 0.22,       // sem bola: o bloco desliza 22% do desvio da bola
    bascularComBola: 0.10,

    /*
    Frente do bloco quando a equipa ataca: pelo menos esta fracção do campo À
    FRENTE da bola — quem ataca corre para além dela. O limite de fora-de-jogo
    trava-a, e esse é regra e não preferência.
    */
    avancoAlemDaBola: 0.14,

    // Margem para o rectângulo não sair do campo.
    margemLateral: 0.94,
    margemFundo: 0.94,

    /*
    A pedido do utilizador: o bloco nunca recua para trás da marca do
    penalty própria (11 m da linha de baliza). Antes só havia o `margemFundo`
    (94% do meio-campo, ~49.8 m — quase a linha de fundo), e com bola
    encostada à própria área o bloco inteiro (avançados incluídos) colapsava
    num canto minúsculo do campo. Com o PositionBT já a corrigir marcação e
    cobertura por cima do slot (ver MarkingModel.biasMax), o TeamBT não
    precisa de recuar tanto para "ir buscar" a jogada.
    */
    recuoMax: -(CAMPO_COMP / 2 - 11)   // -42
};

/*
=============================================================================
AJUSTE POR LINHA — camada 2
=============================================================================
Depois de o rectângulo estar posto, cada linha desloca-se dentro dele.

`v` é a profundidade dentro do bloco: 0 = última linha, 1 = frente do bloco.
A posição de base normalizada da formação dá o v de partida; estes valores
puxam-no para a frente ou para trás conforme a linha e conforme a equipa tem
ou não a bola.

    empurrar   quanto o v é puxado na direcção de `alvo` (0 = ignora)
    alvo       para onde é puxado

Com bola os médios sobem mas não tanto como os avançados — era o problema de
o meio-campo ficar vazio. Sem bola toda a gente recua e a equipa junta-se.
=============================================================================
*/
const LineShape = {
    def: { comBola: { alvo: 0.14, empurrar: 0.55 }, semBola: { alvo: 0.02, empurrar: 0.80 } },
    mid: { comBola: { alvo: 0.52, empurrar: 0.45 }, semBola: { alvo: 0.38, empurrar: 0.55 } },
    atk: { comBola: { alvo: 0.94, empurrar: 0.60 }, semBola: { alvo: 0.72, empurrar: 0.45 } },

    /*
    Estreitamento lateral por linha (multiplica o u em torno do eixo).

    Uma última linha fecha mais do que um meio-campo quando não tem a bola: é a
    diferença entre tapar o caminho da baliza e cobrir a largura toda.
    */
    fecho: {
        def: { comBola: 0.92, semBola: 0.78 },
        mid: { comBola: 1.00, semBola: 0.88 },
        atk: { comBola: 1.00, semBola: 0.80 }
    }
};

/*
Ajuste fino por POSIÇÃO ESPECÍFICA, por cima do LineShape (que só
diferencia por linha: def/mid/atk). Sem isto, um lateral e um central
usam exactamente o mesmo alvo de profundidade — não há razão nenhuma no
código para o lateral ficar mais avançado, o que é estruturalmente errado
(o lateral deve estar sempre um pouco à frente do central). Da mesma
forma, um médio de ponta deve subir mais do que um médio central quando a
equipa tem bola, para dar opção de passe na construção final.

Valor em fracção de v (0..1 da última linha à frente do bloco).
*/
const PositionDepthNudge = {
    LB: { comBola: 0.04, semBola: 0.04 },
    RB: { comBola: 0.04, semBola: 0.04 },
    RM: { comBola: 0.08, semBola: 0.0 },
    LM: { comBola: 0.08, semBola: 0.0 }
};

/*
Playing style do lateral (LB/RB) — só actua com bola: sem bola ambos os
estilos ficam na mesma linha defensiva (ver slotNoBloco em team_bt.js).

    defensive  fica atrás, quase não sobe mesmo com a equipa a atacar.
    offensive  sobe pelo corredor a dar apoio quando a equipa tem bola.

    comBolaMult  multiplica o PositionDepthNudge.comBola do lateral (ajuste
                 fino da profundidade dentro do bloco).
    avancoMax    metros à frente do alvo do PositionBT que ele pode ganhar
                 quando o corredor está livre (ver attackFullBack). É este
                 que manda: o comBolaMult sozinho valia ~1-3 m e não dava
                 subida nenhuma que se visse.
    recuo        metros que recua quando o corredor está tapado.
*/
const FullBackStyle = {
    defensive: { comBolaMult: 0.3, avancoMax: 2.0, recuo: 3.0 },
    offensive: { comBolaMult: 1.8, avancoMax: 15.0, recuo: 3.0 },
    // Full-back Finisher: sobe como o offensive, mas fecha para o eixo em vez
    // de ficar colado à linha — "joining the attack in high central areas".
    finisher: { comBolaMult: 1.8, avancoMax: 15.0, recuo: 3.0 }
};

/*
=============================================================================
PLAYING STYLES — traços por jogador
=============================================================================
Cada estilo é um conjunto de MODIFICADORES numéricos, não um ramo de código
próprio. Isso é de propósito: 20 estilos com 20 caminhos especiais seriam
impossíveis de afinar e de manter coerentes entre si. As folhas do PositionBT
e do PlayerBT lêem sempre os mesmos campos; o estilo só muda os números.

Campos (todos opcionais, `EstiloBase` dá os valores neutros):

  POSICIONAMENTO (metros, no referencial de ataque)
    avanco        + sobe / − recua em relação ao slot do bloco
    largura       + abre para a linha lateral / − fecha para o eixo
    avancoComBola avanço EXTRA só quando a equipa tem a bola
    amplitudeZ    quanto o jogador se estica em profundidade (box-to-box)

  COMPORTAMENTO (multiplicadores, 1.0 = neutro)
    passe         peso dele como alvo de passe (findPassTarget)
    remate        peso da decisão de rematar
    cruzar        peso da decisão de cruzar
    lancar        peso da decisão de lançar
    conduzir      peso da decisão de conduzir em vez de passar
    pressao       agressividade no desarme/carrinho e aderência na marcação
    cadencia      multiplica o tempo de domínio antes de decidir

  BANDEIRAS
    ombroDefesa   posiciona-se na linha do último defensor (fora-de-jogo no limite)
    dentroArea    não sai da grande área adversária
    seguraBola    aguenta a bola de costas em vez de decidir depressa
    atraiDefesa   corre PARA LONGE da bola a puxar marcação
    cortaParaDentro  vindo da ala, fecha para o eixo ao receber
    colaNaLinha   fica encostado à linha lateral
    juntaSeAoAtaque  defesa que sobe ao ataque

  posicoes      onde o estilo pode ser escolhido (validação/UI)
=============================================================================
*/
const EstiloBase = {
    avanco: 0, largura: 0, avancoComBola: 0, amplitudeZ: 1.0,
    passe: 1.0, remate: 1.0, cruzar: 1.0, lancar: 1.0, conduzir: 1.0,
    pressao: 1.0, cadencia: 1.0,
    ombroDefesa: false, dentroArea: false, seguraBola: false,
    atraiDefesa: false, cortaParaDentro: false, colaNaLinha: false,
    juntaSeAoAtaque: false
};

const PlayingStyles = {
    /* --- Avançados ------------------------------------------------------- */
    goal_poacher: {
        nome: 'Goal Poacher', posicoes: ['CF', 'SS'],
        avancoComBola: 4, remate: 1.35, conduzir: 0.7, cadencia: 0.7,
        ombroDefesa: true
    },
    dummy_runner: {
        nome: 'Dummy Runner', posicoes: ['CF', 'SS', 'AM'],
        largura: 5, passe: 0.75, remate: 0.9,
        atraiDefesa: true
    },
    fox_in_the_box: {
        nome: 'Fox in the Box', posicoes: ['CF'],
        avancoComBola: 6, remate: 1.5, conduzir: 0.5, lancar: 0.6, cadencia: 0.6,
        dentroArea: true
    },
    target_man: {
        nome: 'Target Man', posicoes: ['CF'],
        passe: 1.25, conduzir: 0.6, cadencia: 1.6,
        seguraBola: true
    },

    /* --- Criativos ------------------------------------------------------- */
    creative_playmaker: {
        nome: 'Creative Playmaker', posicoes: ['SS', 'LW', 'RW', 'AM', 'LM', 'RM'],
        passe: 1.3, lancar: 1.5, conduzir: 1.15, cadencia: 0.85
    },
    classic_no10: {
        nome: 'Classic No. 10', posicoes: ['SS', 'AM', 'CM'],
        avanco: -3, passe: 1.4, lancar: 1.35, conduzir: 0.55, cadencia: 1.3,
        amplitudeZ: 0.7
    },
    hole_player: {
        nome: 'Hole Player', posicoes: ['SS', 'AM', 'LM', 'RM', 'CM'],
        avancoComBola: 9, remate: 1.2, amplitudeZ: 1.3
    },

    /* --- Alas ------------------------------------------------------------ */
    prolific_winger: {
        nome: 'Prolific Winger', posicoes: ['LW', 'RW'],
        largura: 4, remate: 1.2, cruzar: 1.1,
        cortaParaDentro: true
    },
    roaming_flank: {
        nome: 'Roaming Flank', posicoes: ['LW', 'RW', 'LM', 'RM'],
        largura: -4, passe: 1.15, conduzir: 1.2,
        cortaParaDentro: true
    },
    cross_specialist: {
        nome: 'Cross Specialist', posicoes: ['LW', 'RW', 'LM', 'RM'],
        largura: 7, cruzar: 1.6, conduzir: 0.9, remate: 0.7,
        colaNaLinha: true
    },

    /* --- Meio-campo ------------------------------------------------------ */
    box_to_box: {
        nome: 'Box-to-Box', posicoes: ['AM', 'LM', 'RM', 'CM', 'DM'],
        amplitudeZ: 1.5, avancoComBola: 5, pressao: 1.2
    },
    the_destroyer: {
        nome: 'The Destroyer', posicoes: ['CM', 'DM', 'CB'],
        avanco: -2, pressao: 1.6, conduzir: 0.6, lancar: 0.7, amplitudeZ: 0.85
    },
    orchestrator: {
        nome: 'Orchestrator', posicoes: ['CM', 'DM'],
        avanco: -5, passe: 1.35, lancar: 1.4, conduzir: 0.7, cadencia: 1.2
    },
    anchor_man: {
        nome: 'Anchor Man', posicoes: ['DM'],
        avanco: -7, pressao: 1.25, lancar: 0.5, conduzir: 0.5, amplitudeZ: 0.6
    },

    /* --- Defesas --------------------------------------------------------- */
    build_up: {
        nome: 'Build Up', posicoes: ['CB'],
        avanco: -4, passe: 1.3, lancar: 1.2, cadencia: 1.25
    },
    extra_frontman: {
        nome: 'Extra Frontman', posicoes: ['CB'],
        amplitudeZ: 1.4, remate: 1.2,
        juntaSeAoAtaque: true
    },
    offensive_fullback: {
        nome: 'Offensive Full-back', posicoes: ['LB', 'RB'],
        cruzar: 1.25, colaNaLinha: true
    },
    fullback_finisher: {
        nome: 'Full-back Finisher', posicoes: ['LB', 'RB'],
        largura: -5, remate: 1.2, cruzar: 0.8,
        cortaParaDentro: true
    },
    defensive_fullback: {
        nome: 'Defensive Full-back', posicoes: ['LB', 'RB'],
        avanco: -2, pressao: 1.2, cruzar: 0.7
    },

    /* --- Guarda-redes ---------------------------------------------------- */
    offensive_gk: { nome: 'Offensive Goalkeeper', posicoes: ['GK'] },
    defensive_gk: { nome: 'Defensive Goalkeeper', posicoes: ['GK'] }
};

/*
Estilo por omissão de cada posição, usado no arranque (ver assignFormations).
São escolhas neutras: o estilo "normal" daquela posição, não o mais exótico.
*/
const EstiloPorOmissao = {
    GK: 'defensive_gk',
    CB: 'build_up', LB: 'offensive_fullback', RB: 'offensive_fullback',
    DM: 'anchor_man', CM: 'box_to_box', AM: 'classic_no10',
    LM: 'roaming_flank', RM: 'roaming_flank',
    LW: 'prolific_winger', RW: 'prolific_winger',
    CF: 'goal_poacher', SS: 'creative_playmaker'
};

/*
Modelo de remate.

A regra antiga era `distToGoal < max(18, ata/100*22)`: entre skill 50 e 81 o
resultado era sempre 18 m, ou seja o slider ATACANTES não fazia nada. Isto é
monótono e, a skill 80 (o valor por omissão), dá os mesmos 18 m de antes.

O ângulo passa a contar: rematar de 15 m junto à linha lateral não é o mesmo
que de 15 m em frente à baliza.
*/
const ShootingModel = {
    // +20% pedido explicitamente: jogadores rematavam pouco (zona/ângulo
    // curtos demais mandavam a decisão pro Passar/Cruzar antes de chegar
    // perto o suficiente).
    baseRange: 12.0,     // alcance a skill 0
    skillRange: 12.0,    // metros adicionais a skill 100
    maxOffsetX: 24.0,    // além disto o ângulo é mau demais para rematar
    angleFloor: 0.66,    // fracção do alcance que sobra no pior ângulo

    // Um defesa que suba não remata como um avançado: só de muito perto.
    // Antes o central caía no ramo genérico e rematava em 10.4% das vezes
    // em que aparecia no último terço.
    defenderFactor: 0.55
};

/*
Modelo de passe e condução.

`carryChance*` é a probabilidade de conduzir em vez de passar quando há um
alvo disponível — sob pressão desce 0.15.

O lançamento (passe para o espaço nas costas da linha adversária) não existia:
todos os passes miravam a posição actual de um colega. Estes valores dizem onde
se põe a bola em relação à linha que o nível 1 do adversário já calcula.
*/
const PassModel = {
    carryChance: 0.20,
    carryChanceShort: 0.10,
    carryChanceLong: 0.30,

    preferenceBonus: 8.0,       // empurrão para a função preferida da posição

    throughBallGap: 14.0,       // quão atrás da linha o colega pode estar
    throughBallDepth: 9.0,      // metros além da linha onde se põe a bola
    throughBallMaxDist: 45.0,
    // Nem sempre que há espaço se lança: senão o jogo torna-se todo directo.
    throughBallChance: 0.675, // 0.30 -> 0.45 -> 0.675 (+50% duas vezes)

    /*
    Conversão de distância em força — OBSOLETA. Vinha do modelo de arrasto
    antigo ("a bola perde 0.22 × 0.85 da velocidade por segundo"), que já não
    existe. A força é agora resolvida a partir do alcance pretendido, em
    velocidadeParaAlcance/velocidadeRasteiraPara (utils.js). Mantida só para
    não partir quem ainda lhe chame.
    */
    forceForDistance: 1.68,

    /*
    --- Balística do passe (ver executePassGameplay em fsm.js) --------------

    Acima de `distAereo` o passe vai pelo ar e ATERRA no alvo. A elevação
    desce com a distância: um passe de 25 m sobe mais para passar por cima de
    quem está no meio; um de 60 m vai mais raso para chegar depressa.
    */
    /*
    Passe/lançamento longo só para alvos a MAIS de 20 m (pedido). Abaixo
    disso é passe rasteiro normal — uma bola pelo ar para um colega a 12 m
    só complica a recepção sem ganhar nada.
    */
    distMinLonga: 20.0,
    distAereo: 20.0,
    elevacaoCurta: 26 * Math.PI / 180,
    elevacaoLonga: 18 * Math.PI / 180,
    elevacaoCruzamento: 24 * Math.PI / 180,

    /*
    Com que velocidade a bola CHEGA ao alvo num passe rasteiro. Tem de chegar
    jogável: acima de BallControl.easySpeed (7.75) o receptor arrisca falhar o
    domínio, e a zero morre antes de lá chegar.
    */
    vChegadaRasteira: 6.5,
    vChegadaCruzamento: 8.0,   // cruzamento rasteiro vai mais forte, de propósito
    vChegadaLancamento: 5.0,   // lançamento é para correr atrás, não para receber parado

    /*
    Erro máximo no PESO da bola, para skill de passe 0. Escala com
    (1 - PASS/100): a 80 de PASS o erro é ±3.6%, a 40 é ±10.8%. Substitui o
    antigo `passBoost`, que aumentava a força em vez da precisão — e com a
    balística resolvida isso só voltava a pôr a bola longe do alvo.
    */
    erroPesoMax: 0.18
};

/*
Carrinho (SLIDE_TACKLE).

A animação era `applyKeyframeAnimation("Soccer Tackle")` — dados pré-gravados de
outro esqueleto, com as pernas a ±3.0 rad de rotação.z (172°, praticamente
invertidas). Foi substituída por uma pose procedural: deslizar sobre uma anca,
uma perna esticada para a bola, a outra dobrada por baixo, tronco erguido e
apoiado no braço de trás.

Fases, em segundos desde o início:
    0 → lancamento   atira-se ao chão
      → deslize      desliza; a velocidade cai a zero no fim desta fase
      → paragem      fica caído (é o preço de ter feito o carrinho)
      → levantar     põe-se de pé e volta ao MOVE_TO_POS
*/
const SlideTackleModel = {
    lancamento: 0.15,
    deslize: 0.95,
    paragem: 1.45,
    levantar: 1.95,

    velocidade: 9.0,        // velocidade inicial do deslize, m/s
    alturaAnca: -0.55,      // quanto o corpo desce ao sentar no relvado

    janelaToqueIni: 0.10,   // quando o pé pode começar a tocar na bola
    janelaToqueFim: 1.00,
    alcanceToque: 2.2,
    empurraoBola: 4.5,      // metros que a bola percorre depois do toque
    alturaBola: 1.0,        // ressalto vertical do toque
    bloqueioAposToque: 0.9, // segundos sem poder tocar outra vez (está no chão)

    // A pose, em radianos. `lado` = +1 estica a perna direita, -1 a esquerda.
    pose: {
        ancaRolar: 0.85,    // deita-se sobre a anca do lado oposto ao pé que estica
        ancaTras: -0.25,
        peito: -0.15,
        peitoRolar: 0.15,

        coxaEstendida: -0.95,
        joelhoEstendido: 0.10,
        peEstendido: -0.20,

        coxaDobrada: -0.10,
        joelhoDobrado: 1.55,

        bracoApoioZ: 1.35,  // braço de trás, aberto e no chão a apoiar
        bracoApoioX: 0.70,
        cotoveloApoio: -0.30,

        bracoLivreZ: 0.50,  // braço da frente, para equilíbrio
        bracoLivreX: -0.50,
        cotoveloLivre: -0.60
    }
};

/*
Playing style do GK (ver updateGkStyle em team_bt.js).

    defensive  padrão — fica perto da baliza, no máximo até à marca de
               grande penalidade (~11 m da linha de fundo: 5 + maxOut).
    offensive  sweeper-keeper — sai para cobrir o espaço atrás da defesa
               quando o adversário ataca pelo corredor central sem oposição.
*/
const GoalkeeperStyle = {
    defensive: { maxOut: 6 },
    offensive: { maxOut: 20 }
};

/*
Postura do guarda-redes.

Rotações em radianos. Convenção do esqueleto (ver resetBonesToDefault):
    perna  rotation.x > 0  →  coxa para TRÁS        (< 0 é para a frente, o chuto)
    joelho rotation.x > 0  →  perna dobra para trás (calcanhar sobe)
    peito  rotation.x > 0  →  tronco inclina para a FRENTE
    perna  rotation.z      →  abre as pernas para os lados

Ele tem três posturas, e antes tinha só uma — a de espera, exagerada e ligada a
toda a hora: peito a 0.45 (26° para a frente), joelhos a 0.9 (52°) e o corpo
descido 0.2 m. Ficava quase de joelhos, inclinado, mesmo a andar.
*/
const GoalkeeperPose = {
    // A que distância da própria baliza um adversário com bola o põe em alerta.
    alertaDist: 25.0,

    /*
    Só se atira ao chão se a bola passar a MAIS de tantos metros ao lado dele.
    Abaixo disto não há mergulho nenhum: fica de pé e leva as mãos à bola
    (estado 'maos'), dentro dos limites das juntas. Antes o limiar era 1.2 m e
    quase toda a defesa virava mergulho lateral — daí o guarda-redes aparecer
    sempre deitado/torcido de lado mesmo em bolas à altura do peito.
    */
    mergulhoLateralMin: 2.0,
    // Duração (s) do estado 'maos' antes de voltar ao idle.
    maosDur: 1.0,

    /*
    --- Tiro de meta -------------------------------------------------------
    A bola é colocada na quina da PEQUENA ÁREA do lado por onde saiu, o GR
    caminha até à linha de fundo atrás dela, faz a corrida e chuta.
    */
    // Meia-largura da pequena área: 5.5 m para cada lado de cada poste.
    pequenaAreaX: LARGURA_BALIZA / 2 + 5.5,   // ~9.16
    pequenaAreaZ: 5.5,                        // profundidade a partir da linha
    tiroMetaAndar: 2.2,      // m/s a caminhar até à linha de fundo
    tiroMetaCorrer: 5.5,     // m/s na corrida para a bola
    tiroMetaRecuo: 2.5,      // quanto atrás da bola fica antes de arrancar
    tiroMetaDistChuto: 1.1,  // distância à bola em que dispara o gesto
    tiroMetaTimeout: 6.0,    // segurança: se algo correr mal, chuta na mesma

    // Duração (s) do agachar-e-apanhar quando a bola chega mansa/rolando.
    apanharDur: 0.35,
    // Quanto tempo o GR fica a segurar a bola (agachado a levantar-se) antes
    // de poder relançar o jogo — dá tempo às equipas para se reorganizarem.
    segurarDur: 8.0,

    // A andar ao longo da baliza a acompanhar o lance: de pé, passada curta.
    andar: {
        chest: 0.10,
        kneeBase: 0.18,     // dobra mínima, somada ao ciclo da passada
        passada: 0.55,      // fracção da amplitude de corrida de um jogador
        passadaJoelho: 0.32,// o joelho dobra menos do que a anca abre: é marcha, não corrida
        bracos: 0.55,       // abertura lateral dos braços
        altura: 0.0
    },

    // Adversário com bola perto da área: de pé, joelhos ligeiramente dobrados,
    // pernas afastadas e mãos prontas. À espera do remate.
    espera: {
        chest: 0.16,
        joelho: 0.32,
        coxa: 0.14,
        abertura: 0.13,
        bracoZ: 0.75,
        bracoX: -0.35,
        cotovelo: -0.35,
        altura: -0.05
    },

    // Sem perigo: descontraído, praticamente direito.
    repouso: {
        chest: 0.05,
        joelho: 0.12,
        coxa: 0.05,
        abertura: 0.07,
        bracoZ: 0.45,
        bracoX: -0.10,
        cotovelo: -0.15,
        altura: 0.0
    },

    // Agachado a apanhar bola mansa/rolando (estado 'apanhar').
    apanhar: {
        chest: 0.55,
        joelho: 1.1,
        coxa: 0.75,
        abertura: 0.10,
        bracoZ: 0.30,
        bracoX: -0.9,
        cotovelo: -0.9,
        altura: -0.35
    },

    /*
    Bola agarrada junto ao PEITO, à espera de relançar (estado 'segurando').

    Tronco e pernas são os do `repouso` — de pé, direito, descontraído: já não
    fica meio agachado depois de apanhar a bola. Só os braços diferem: braços
    junto ao corpo (bracoZ baixo), para a frente/baixo (bracoX) e antebraços
    bem fechados PRA CIMA contra o peito (cotovelo muito dobrado) — é isso que
    "fecha a guarda" em cima da bola.
    */
    segurar: {
        chest: 0.05,
        joelho: 0.12,
        coxa: 0.05,
        abertura: 0.07,
        bracoZ: 0.05,
        bracoX: -0.9,
        cotovelo: -2.0,
        altura: 0.0
    }
};

/*
Condução (CARRY) — carregar a bola em frente com toques curtos.

O portador testa `leque` direcções à sua frente (em radianos, 0 = a direito
para a baliza adversária) e escolhe a de melhor nota. Quanto mais espaço livre,
maior é o toque à frente.
*/
const CarryModel = {
    leque: [-1.0, -0.7, -0.45, -0.22, 0, 0.22, 0.45, 0.7, 1.0],
    lookAhead: 10.0,      // a que distância se avalia cada direcção
    spaceCap: 12.0,       // espaço acima disto já não conta mais
    spaceWeight: 1.6,     // quanto vale ter espaço
    progressWeight: 3.2,  // quanto vale progredir para a baliza
    // Era 0.18 — no pior caso (tx a ~29m do alvo) só penalizava ~5 pontos,
    // contra até ~32 do progressWeight. Na prática o progresso pra frente
    // ganhava sempre e o sector do painel (Left/Center/Right) não tinha
    // efeito visível: o jogo conduzia sempre pelo meio. Subido para pesar
    // tanto quanto o progresso no pior caso (~29 * 1.0 ≈ 29).
    sectorWeight: 4.5,    // quanto pesa manter o sector táctico do painel (1.0 -> 1.5 -> 2.25 -> 4.5, +100%)

    /*
    Espaço livre à frente. Medido num corredor que abre para longe (`corredor`
    metros de meia-largura à altura do jogador, mais `abertura` por cada metro
    de profundidade), até ao adversário mais próximo lá dentro.
    */
    corredor: 4.0,
    abertura: 0.35,
    espacoLivre: 12.0,

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
    distanciaMax: 12.0,

    // Toques de condução — distância do toque depende do espaço à frente
    touchLong: 7.0,       // toque longo (campo aberto, adversário > 15m)
    touchMedium: 4.0,     // toque médio (adversário entre 8-15m)
    touchShort: 2.4,      // toque curto (adversário perto < 8m)
    touchPower: 8.0,      // força base do toque (m/s)
    touchCooldown: 0.4,   // tempo mínimo entre toques (seg)
    touchMaxWait: 0.18,   // espera máx. pela janela da passada antes de forçar o toque (seg)
    recoverRadius: 0.8,   // distância para re-capturar a bola após toque

    /*
    Faixa junto à linha de fundo onde NÃO se adianta a bola. Dentro dela o
    portador continua a correr, mas com a bola no pé: um toque à frente ali
    põe-na fora pela linha de fundo, e o resultado era pontapé de baliza para
    o adversário só por conduzir até ao fundo.

    Vale para o toque do CARRY e para os toques laterais do corte (CUT). O
    leque de direcções também deixa de apontar para dentro da faixa, senão o
    jogador continuava a correr contra a linha sem nunca poder tocar.
    */
    margemLinhaFundo: 6.0
};

/*
Drible (DRIBBLE) — ultrapassar um adversário 1v1.

O portador detecta de que lado o defensor está vindo e toca a bola para o lado
oposto (30-45°). Se tentar ir reto, probabilidade de perda é muito maior.

`successBase` é a chance base de sucesso no drible. Modificada pela skill do
jogador e pela proximidade do adversário.
*/
const DribbleModel = {
    triggerDist: 5.0,     // distância para activar drible 1v1 (adversário à frente)
    angleSide: 0.6,       // ângulo lateral do toque (~35°, entre 30 e 45)
    touchPower: 11.0,     // força do toque lateral
    successBase: 0.55,    // chance base de sucesso
    successSideBonus: 0.20, // bónus por ir para o lado (vs reto)
    failLossBall: 0.70,   // prob. de perder a bola se falhar
    sprintBoost: 6.0,     // boost de velocidade após toque lateral
    cooldown: 1.5         // tempo antes de poder driblar novamente
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
const MarkingModel = {
    /*
    distancia agora depende do Defensive Pressure (painel esquerdo) — Low
    marca mais solto (4m), High mais colado (2m). Antes era um valor fixo
    (2.2) que ignorava esse ajuste por completo.
    */
    distanciaPorPressao: { low: 4.0, balanced: 3.0, high: 2.0 },
    get distancia() {
        return this.distanciaPorPressao[Tatics.pressaoDefensiva] ?? this.distanciaPorPressao.balanced;
    },

    /*
    biasMax / coberturaBiasMax — o quanto a marcação pode desviar o jogador
    do seu SLOT no bloco, em metros. Substituem o antigo `aderencia`
    (fracção 0..1 da distância TOTAL ao ponto de marcação).

    O problema do `aderencia`: cada frame recomeça do slot fresco (bind()),
    por isso `lerp(slot, alvo, 0.88)` não é um bias que se acumula devagar —
    é ir 88% do caminho até ao alvo NUM SÓ FRAME. Se o alvo estava a 40m do
    slot (um adversário do outro lado do campo), o jogador saltava para a
    marca a ~35m do sítio onde o TeamBT o tinha posto. Media-se isso como
    "posições muito longe do TeamBT" — dois CFs a aparecerem no meio-campo,
    só um CB a ficar atrás.

    Agora a marcação é sempre um DESVIO limitado a estes metros, tal como
    `desviar()` nas folhas ofensivas — o TeamBT continua a mandar, a
    marcação só o inclina. Só que com um tecto fixo de 5m, quando o SLOT
    zonal (bloco/linha) ainda não tinha alcançado o atacante que acabou de
    receber um passe — o que demora, a linha tem tecto e lag próprios — a
    correcção nunca fechava a distância: o marcador ficava sempre uns
    metros curto, e se o slot recuava (bloco a reorganizar) o alvo parecia
    "fugir" mesmo com marcingTarget correcto. Sob pressão mais alta o
    marcador pode quebrar mais forma pra ficar colado; sob Low, menos.
    */
    biasMaxPorPressao: { low: 5.0, balanced: 7.0, high: 10.0 },
    get biasMax() {
        return this.biasMaxPorPressao[Tatics.pressaoDefensiva] ?? this.biasMaxPorPressao.balanced;
    },

    coberturaBiasMax: 6.0, // cair para cobertura/eixo (mais folga: é reposicionamento, não marcação)

    larguraCentro: 0.35,  // factor de largura da última linha com a bola no eixo
    larguraAla: 0.75,     // e com a bola no corredor
    fechoRaioX: 18.0,     // "eixo" = |ballX| abaixo disto
    fechoZ: 10.0,         // e o fecho só conta com a bola no nosso meio-campo

    /*
    Corredor lateral máximo para marcar: fora disto, um jogador nunca é
    candidato a marcar aquele adversário, por muito bem que pontue nos
    outros critérios. Sem este corte duro, um médio central podia acabar a
    marcar quem devia ser tarefa de um lateral (e vice-versa) só porque
    estava mais perto da baliza — o resultado observado foi troca de linha
    inteira (o LM a aparecer na posição do CF e vice-versa) sem tendência
    nenhuma a voltar à forma depois de a marcação acabar.
    */
    corredorMax: 16.0
};

/*
Cruzamento.

Antes: `|x| > 17 && zona > 18` → cruzava SEMPRE (medido 100% em toda essa zona,
e 0% fora dela). Um extremo a x=16 nunca cruzava; a x=20 nunca fazia outra coisa.

Agora a decisão é pontuada: só existe cruzamento se houver alguém na área, e a
probabilidade sobe com o número de alvos lá dentro, com a largura e com a
profundidade de quem cruza. Junto à linha de fundo continua quase garantido.
Valores no referencial de ataque.
*/
const CrossModel = {
    alaX: 15.0,           // a partir daqui conta como estar na ala
    zonaZ: 14.0,          // e daqui para a frente vale a pena olhar para a área

    areaZ: 34.0,          // linha da grande área
    areaX: 20.5,          // meia-largura da grande área
    fundoZ: 50.0,         // linha de fundo

    // +20% pedido explicitamente: cruzamentos pouco frequentes.
    chanceBase: 0.54,     // com um alvo na área
    chancePorAlvo: 0.264, // por cada alvo além do primeiro
    // +100% pedido: cruzar DAS LATERAIS DA ÁREA. Os dois termos que dependem
    // de estar lá (largura junto à linha, e o peso da camada CRUZAMENTO do
    // SpatialGrid — ver pesoGrid abaixo) dobraram; a chanceBase não, senão
    // subia também o cruzamento de qualquer sítio.
    bonusLargura: 0.72,   // acumulado junto à linha lateral
    bonusFundo: 0.42,     // acumulado junto à linha de fundo
    // Quanto vale a célula da camada CRUZAMENTO (0-100) do SpatialGrid, que é
    // exactamente a faixa das laterais da área. 0.30 -> 0.60.
    pesoGrid: 0.60,
    penalPressao: 0.30,   // sob pressão o cruzamento sai mal
    chanceMax: 0.97
};

/*
Domínio de bola: recepção, intercepção e desvio.

A regra antiga era uma só: a bola só podia ser apanhada a menos de 1.2 m E com
velocidade² < 60 (ou seja, abaixo de 7.75 m/s). Como todos os passes saem entre
16 e 25 m/s, isso significava que ninguém podia tocar num passe em movimento —
não havia intercepções no jogo, e o destinatário tinha de esperar meio segundo
que a bola abrandasse.

Agora qualquer jogador ao alcance disputa a bola. Quanto mais rápida ela vem e
menor a skill dele, menor a hipótese de a dominar; falhando, desvia-a. Quem
espera o passe tem uma vantagem (`receiverBonus`), porque já vinha a preparar-se.

O guarda-redes não entra por aqui a alta velocidade: as defesas dele são
tratadas em FootballPlayer.updateGK().
*/
const BallControl = {
    reach: 1.3,           // raio de contacto com a bola, em metros
    easySpeed: 7.75,      // abaixo disto domina-se sempre (a regra antiga)
    hardSpeed: 30.0,      // acima disto é praticamente impossível dominar
    receiverBonus: 0.35,  // vantagem de quem é o destinatário do passe
    touchLock: 0.35,      // segundos sem poder tocar depois de largar a bola
    retryLock: 0.25,      // segundos até nova tentativa depois de falhar uma
    deflectKeep: 0.45,    // fracção da velocidade que sobra num desvio
    deflectSpread: 0.6,   // quanto o desvio abre a direcção

    /*
    --- Domínio no peito ---------------------------------------------------
    Bola à altura do peito não se domina com o pé: o jogador inclina a
    cintura para trás e deixa-a bater no peito.

    O sorteio decide só a QUALIDADE do amortecimento, não a posse: em
    qualquer dos casos a bola fica à frente dele e ele sai a jogar. Ganhou,
    morre-lhe aos pés (0.5 m); perdeu, repica mais longe (1.5 m) e fica
    disputável.
    */
    // Alturas medidas a partir dos PÉS do jogador (ver distanciaAoCorpo).
    peitoYMin: 0.85,      // altura mínima do contacto para contar como peito
    peitoYMax: 1.35,      // acima disto é cabeça (ver ALTURA_CABECA), não peito
    peitoBase: 0.45,      // probabilidade base de amortecer bem
    peitoDur: 0.55,       // duração (s) do gesto
    peitoQueda: 0.5,      // metros à frente quando domina bem
    peitoRepique: 1.5,    // metros à frente quando falha
    peitoInclinacao: -0.35 // rotação da cintura (negativo = para trás)
};

/*
Cadência: leva tempo real ao jogo. Sem isto, quem ganha a bola decide
(passar/rematar/lançar) no mesmo frame, e a equipa adversária reage à posse
instantaneamente — o jogo inteiro corre em ritmo de "últimos 5 minutos de
final perdida". Na vida real o portador domina, olha as opções, e só depois
executa; o marcador espera o domínio, avalia bloquear/pressionar, e só
executa a decisão dele passado um tempo — controlado no painel por
Defensive Pressure.
*/
const CadenceModel = {
    // Quanto tempo o portador leva a decidir (passar/rematar/lançar) depois
    // de dominar a bola. Sob pressão pesada, o toque de primeira é mais
    // provável — a decisão sai bem mais rápido.
    posseBase: 3.0,
    posseSobPressao: 0.6
};

/*
Uso dos dados da percepção (ver perception.js) na DECISÃO.

A percepção já calculava `interceptable`/`timeToIntercept`/`interceptionPoint`
por jogador, mas nada na árvore os lia: o único consumidor era o `claimScore`
do `pickChaser`, que escolhe UM jogador por equipa. Resultado: uma bola a
passar rente a um jogador que não fosse nem o chaser nem o destinatário do
passe era ignorada por ele — ficava parado a ver.
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
    passePerdidoDist: 4.0
};

// Segundos que a equipa SEM bola espera, depois de a perder, antes de
// reavaliar chaser/marcação — ligado ao selector "Defensive Pressure".
const DefensivePressureModel = {
    low: 6.0,
    balanced: 4.0,
    high: 2.0
};

const Tatics = {
    formacao: '442',
    estilo: 'balanceado',
    passe: 'balanceado',
    linhaDefensiva: 'medium',
    compactness: 'median',
    lengthCompactness: 'median',
    pressaoDefensiva: 'balanced',
    setores: ['esq', 'dir'],

    // Cada sector liga/desliga independentemente agora (antes era sempre
    // exactamente 2 de 3, um forçava o outro a sair) — nunca deixa ficar
    // com zero activos.
    toggleSector: function (sector) {
        const idx = this.setores.indexOf(sector);
        if (idx >= 0) {
            if (this.setores.length <= 1) return;
            this.setores.splice(idx, 1);
        } else {
            this.setores.push(sector);
        }
        const el = document.getElementById('sec-' + sector);
        if (el) el.classList.toggle('active', this.setores.includes(sector));
        // O contador do rótulo era estático no HTML ("Setor do campo (2)") e
        // nunca acompanhava os botões.
        const lbl = document.getElementById('lbl-setores');
        if (lbl) lbl.textContent = 'Setor do campo (' + this.setores.length + ')';
        Match.assignFormations();
    },

    /*
    Sector activado tem 80% de chance contra um desactivado; entre dois
    activados é 50/50 (é só escolher ao calhas dentro do grupo activo).
    Se o centro estiver desactivado, ele só aparece nos 20% "desactivados"
    — na prática vira passagem de troca de lado, não destino, porque o
    carryTargetX é re-sorteado a cada ~1s (ver CARRY em fsm.js) e volta a
    puxar para esq/dir quase de seguida.
    */
    getWeightedSectorX: function (teamDir = 1) {
        const todos = ['esq', 'cen', 'dir'];
        const activos = todos.filter(s => this.setores.includes(s));
        const inactivos = todos.filter(s => !this.setores.includes(s));

        let pool = activos.length ? activos : todos;
        // 20% -> 10% -> 5% de fuga para sector desactivado.
        if (inactivos.length > 0 && Math.random() > 0.95) pool = inactivos;

        const chosenSector = pool[Math.floor(Math.random() * pool.length)];

        if (chosenSector === 'esq') {
            return -19 * teamDir + (Math.random() - 0.5) * 8;
        } else if (chosenSector === 'dir') {
            return 19 * teamDir + (Math.random() - 0.5) * 8;
        } else {
            return (Math.random() - 0.5) * 10;
        }
    },

    update: function () {
        this.formacao = document.getElementById('t-formacao').value;
        this.estilo = document.getElementById('t-estilo').value;
        this.passe = document.getElementById('t-passe').value;
        this.linhaDefensiva = document.getElementById('t-linha').value;
        this.compactness = document.getElementById('t-compactness').value;
        this.lengthCompactness = document.getElementById('t-length-compactness').value;
        this.pressaoDefensiva = document.getElementById('t-pressao-def').value;
        Match.assignFormations();
    },

    updateSkills: function () {
        TeamSkills.TeamA.def = parseInt(document.getElementById('skill-def-a').value);
        TeamSkills.TeamA.mid = parseInt(document.getElementById('skill-mid-a').value);
        TeamSkills.TeamA.ata = parseInt(document.getElementById('skill-ata-a').value);
        TeamSkills.TeamA.gk = parseInt(document.getElementById('skill-gk-a').value);

        TeamSkills.TeamB.def = parseInt(document.getElementById('skill-def-b').value);
        TeamSkills.TeamB.mid = parseInt(document.getElementById('skill-mid-b').value);
        TeamSkills.TeamB.ata = parseInt(document.getElementById('skill-ata-b').value);
        TeamSkills.TeamB.gk = parseInt(document.getElementById('skill-gk-b').value);

        document.getElementById('val-def-a').innerText = TeamSkills.TeamA.def;
        document.getElementById('val-mid-a').innerText = TeamSkills.TeamA.mid;
        document.getElementById('val-ata-a').innerText = TeamSkills.TeamA.ata;
        document.getElementById('val-gk-a').innerText = TeamSkills.TeamA.gk;

        document.getElementById('val-def-b').innerText = TeamSkills.TeamB.def;
        document.getElementById('val-mid-b').innerText = TeamSkills.TeamB.mid;
        document.getElementById('val-ata-b').innerText = TeamSkills.TeamB.ata;
        document.getElementById('val-gk-b').innerText = TeamSkills.TeamB.gk;
    }
};

const FormationsData = {
    '442': [
        { x: 0, z: -0.95, role: 'gk', pos: 'GK', num: 1 },
        { x: -0.7, z: -0.6, role: 'def', pos: 'RB', num: 2 },
        { x: -0.3, z: -0.7, role: 'def', pos: 'CB', num: 4 },
        { x: 0.3, z: -0.7, role: 'def', pos: 'CB', num: 3 },
        { x: 0.7, z: -0.6, role: 'def', pos: 'LB', num: 6 },
        { x: -0.7, z: -0.1, role: 'mid', pos: 'RM', num: 7 },
        { x: -0.3, z: -0.2, role: 'mid', pos: 'CM', num: 8 },
        { x: 0.3, z: -0.2, role: 'mid', pos: 'CM', num: 10 },
        { x: 0.7, z: -0.1, role: 'mid', pos: 'LM', num: 11 },
        { x: -0.25, z: 0.4, role: 'atk', pos: 'CF', num: 9 },
        { x: 0.25, z: 0.4, role: 'atk', pos: 'CF', num: 19 }
    ],
    '433': [
        { x: 0, z: -0.95, role: 'gk', pos: 'GK', num: 1 },
        { x: -0.7, z: -0.6, role: 'def', pos: 'RB', num: 2 },
        { x: -0.3, z: -0.7, role: 'def', pos: 'CB', num: 4 },
        { x: 0.3, z: -0.7, role: 'def', pos: 'CB', num: 3 },
        { x: 0.7, z: -0.6, role: 'def', pos: 'LB', num: 6 },
        { x: -0.4, z: -0.2, role: 'mid', pos: 'RM', num: 7 },
        { x: 0, z: -0.3, role: 'mid', pos: 'CM', num: 8 },
        { x: 0.4, z: -0.2, role: 'mid', pos: 'LM', num: 11 },
        { x: -0.6, z: 0.5, role: 'atk', pos: 'RW', num: 17 },
        { x: 0, z: 0.6, role: 'atk', pos: 'CF', num: 9 },
        { x: 0.6, z: 0.5, role: 'atk', pos: 'LW', num: 21 }
    ],
    '4231': [
        { x: 0, z: -0.95, role: 'gk', pos: 'GK', num: 1 },
        { x: -0.7, z: -0.6, role: 'def', pos: 'RB', num: 2 },
        { x: -0.3, z: -0.7, role: 'def', pos: 'CB', num: 4 },
        { x: 0.3, z: -0.7, role: 'def', pos: 'CB', num: 3 },
        { x: 0.7, z: -0.6, role: 'def', pos: 'LB', num: 6 },
        { x: -0.3, z: -0.3, role: 'mid', pos: 'DM', num: 5 },
        { x: 0.3, z: -0.3, role: 'mid', pos: 'DM', num: 15 },
        { x: -0.6, z: 0.1, role: 'mid', pos: 'RM', num: 7 },
        { x: 0, z: 0.2, role: 'mid', pos: 'AM', num: 10 },
        { x: 0.6, z: 0.1, role: 'mid', pos: 'LM', num: 11 },
        { x: 0, z: 0.6, role: 'atk', pos: 'CF', num: 9 }
    ]
};

