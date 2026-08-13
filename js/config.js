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
const CAMPO_LARG = 68; const CAMPO_COMP = 106;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
const _line1 = new THREE.Line3();

/*
Sincronização gameplay↔animação (ActionState, ver js/bt/action_state.js).
contactTime é a fracção (0..1) da duração do gesto em que o efeito real
(bola sai do pé, etc.) dispara — não no instante em que o BT decide.
Começa só pelo PASS; os valores replicam exactamente o timing antigo
(this.timer<0.08 / >=0.2) para não mudar o "feel" ao migrar de arquitectura.
*/
const ActionAnimClips = {
    pass: { duration: 0.2, contactTime: 0.4 }
};

// window.goleiroEstado, window.goleiroReagiu e window.delayReacaoCalculado
// foram movidos para propriedades de instância de FootballPlayer (gkEstado,
// gkReagiu, gkDelayReacao). Cada GK tem o seu próprio estado independente.
window.bolaChutada = false;

window.speedMultiplier = 1.0;
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
Modelo de remate.

A regra antiga era `distToGoal < max(18, ata/100*22)`: entre skill 50 e 81 o
resultado era sempre 18 m, ou seja o slider ATACANTES não fazia nada. Isto é
monótono e, a skill 80 (o valor por omissão), dá os mesmos 18 m de antes.

O ângulo passa a contar: rematar de 15 m junto à linha lateral não é o mesmo
que de 15 m em frente à baliza.
*/
const ShootingModel = {
    baseRange: 10.0,     // alcance a skill 0
    skillRange: 10.0,    // metros adicionais a skill 100  (=> 18 m a skill 80)
    maxOffsetX: 20.0,    // além disto o ângulo é mau demais para rematar
    angleFloor: 0.55,    // fracção do alcance que sobra no pior ângulo

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
    throughBallChance: 0.30,

    /*
    Conversão de distância em força. A bola perde 0.22 (chão) × 0.85 (ar) da
    velocidade por segundo, o que dá um alcance de v0/1.677 metros. Logo, para
    percorrer D metros é preciso sair a 1.677·D.
    */
    forceForDistance: 1.68
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

    // Bola agarrada junto ao peito, à espera de relançar (estado 'segurando').
    segurar: {
        chest: 0.22,
        joelho: 0.28,
        coxa: 0.12,
        abertura: 0.08,
        bracoZ: 0.15,
        bracoX: -1.3,
        cotovelo: -1.6,
        altura: -0.05
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
    sectorWeight: 0.18,   // quanto pesa manter o sector táctico do painel

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
    recoverRadius: 0.8    // distância para re-capturar a bola após toque
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
    distancia: 2.2,       // metros do atacante, do lado da baliza

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
    marcação só o inclina.
    */
    biasMax: 5.0,          // marcação directa (defendZonal, defendCB, defendFullBack)
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

    chanceBase: 0.45,     // com um alvo na área
    chancePorAlvo: 0.22,  // por cada alvo além do primeiro
    bonusLargura: 0.30,   // acumulado junto à linha lateral
    bonusFundo: 0.35,     // acumulado junto à linha de fundo
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
    deflectSpread: 0.6    // quanto o desvio abre a direcção
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

    toggleSector: function (sector) {
        if (this.setores.includes(sector)) {
            return;
        }
        const removed = this.setores.shift();
        const removedEl = document.getElementById('sec-' + removed);
        if (removedEl) removedEl.classList.remove('active');

        this.setores.push(sector);
        const activeEl = document.getElementById('sec-' + sector);
        if (activeEl) activeEl.classList.add('active');
        Match.assignFormations();
    },

    getWeightedSectorX: function (teamDir = 1) {
        const r = Math.random();
        let chosenSector = 'cen';

        if (this.setores.includes('esq') && this.setores.includes('dir')) {
            chosenSector = (r < 0.5) ? 'esq' : 'dir';
        } else if (this.setores.includes('esq') && this.setores.includes('cen')) {
            chosenSector = (r < 0.5) ? 'esq' : 'cen';
        } else if (this.setores.includes('dir') && this.setores.includes('cen')) {
            chosenSector = (r < 0.5) ? 'dir' : 'cen';
        }

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

