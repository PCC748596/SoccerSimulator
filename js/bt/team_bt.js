/*
=============================================================================
NÍVEL 1 — TEAM BEHAVIOR TREE
=============================================================================
Corre uma vez por equipa por frame, ANTES de qualquer jogador decidir.
Não mexe em nenhum jogador individualmente: produz o *plano colectivo* num
blackboard (TeamBlackboard) que o nível 2 (PositionBT) consome.

O que sai daqui:
    posture            a intenção colectiva (ver TeamPosture)
    pushMultiplier     quanto a equipa sobe no campo quando ataca
    styleDefenseZShift deslocamento da linha defensiva pelo estilo de jogo
    advanceFactor      0..1, quão avançada está a manobra ofensiva
    chaser             quem vai à bola
    flankAlert         'left' | 'right' | null — flanco em perigo
    markingTarget/isCovering  escritos nos jogadores (marcação é decisão colectiva)

Nada aqui deve saber desenhar, animar ou mover — só decidir.
=============================================================================
*/

/* --- Vocabulário de posturas -------------------------------------------- */

const TeamPosture = {
    SET_PIECE: 'SET_PIECE',              // bola parada, o plano normal está suspenso
    BUILD_UP: 'BUILD_UP',                // posse acabada de ganhar, a construir
    ATTACK_SUSTAINED: 'ATTACK_SUSTAINED',// posse prolongada, equipa instalada
    FINAL_THIRD: 'FINAL_THIRD',          // bola no último terço adversário
    COUNTER: 'COUNTER',                  // transição rápida após recuperação
    HIGH_PRESS: 'HIGH_PRESS',            // pressão no meio-campo adversário
    MID_BLOCK: 'MID_BLOCK',              // bloco a meio campo
    LOW_BLOCK: 'LOW_BLOCK',              // bloco baixo, defesa do último terço
    FLANK_SHIFT: 'FLANK_SHIFT'           // basculação para um flanco em perigo
};

/*
Manípulas por postura. Os valores estão NEUTROS de propósito: com push=1.0 e
lineShift=0.0 o comportamento é exactamente o que estava afinado antes desta
refactorização. Sobe/desce estes números para dar personalidade a cada postura
sem tocar na matemática das posições.

    push       multiplica o avanço colectivo no ataque (1.0 = neutro)
    lineShift  desloca a linha defensiva em metros na direcção de ataque
               (positivo = linha mais alta, negativo = linha mais recuada)
*/
const TeamPostureTuning = {
    SET_PIECE: { push: 1.0, lineShift: 0.0 },
    BUILD_UP: { push: 1.0, lineShift: 0.0 },
    ATTACK_SUSTAINED: { push: 1.0, lineShift: 0.0 },
    FINAL_THIRD: { push: 1.0, lineShift: 0.0 },
    COUNTER: { push: 1.0, lineShift: 0.0 },
    HIGH_PRESS: { push: 1.0, lineShift: 0.0 },
    MID_BLOCK: { push: 1.0, lineShift: 0.0 },
    LOW_BLOCK: { push: 1.0, lineShift: 0.0 },
    FLANK_SHIFT: { push: 1.0, lineShift: 0.0 }
};

/* --- Blackboard --------------------------------------------------------- */

class TeamBlackboard {
    constructor(team) {
        this.team = team;
        this.own = [];
        this.opp = [];
        this.outfield = [];

        this.dir = (team === 'TeamA') ? 1 : -1;
        this.ownGoalZ = ownGoalZCenter(team);
        this.atkGoalZ = -this.ownGoalZ;

        this.posture = TeamPosture.MID_BLOCK;
        this.isAttacking = false;
        this.isCounter = false;
        this.phase = 1;

        this.pushMultiplier = 1.0;
        this.styleDefenseZShift = 0.0;
        this.advanceFactor = 0.0;

        this.chaser = null;
        this.carrier = null;      // portador da bola desta equipa
        this.oppCarrier = null;   // portador adversário
        this.flankAlert = null;

        this.ballX = 0;
        this.ballZ = 0;

        this.trace = [];
    }

    // Recolhe o contexto cru do Match. Sem decisões — só factos.
    gather(match) {
        this.own = (this.team === 'TeamA') ? match.players : match.opponents;
        this.opp = (this.team === 'TeamA') ? match.opponents : match.players;
        this.outfield = this.own.filter(p => p.role !== 'gk');

        this.ballX = match.ball.position.x;
        this.ballZ = match.ball.position.z;

        const carrier = match.ballCarrier;
        this.carrier = (carrier && carrier.team === this.team) ? carrier : null;
        this.oppCarrier = (carrier && carrier.team !== this.team) ? carrier : null;

        this.isAttacking = (match.possessionTeam === this.team);
        this.isCounter = (match.counterAttackTeam === this.team);
        this.phase = match.possessionTimer < 3 ? 1 : (match.possessionTimer < 6 ? 2 : 3);

        // Reivindicação de "vou intercetar" desta equipa neste frame — ver
        // podeIntercetar em player_bt.js. Limpa aqui (nível 1, antes do nível
        // 3 correr para todos os jogadores da equipa).
        this.intercetorFrame = null;

        /*
        Histerese de zona morta para o alerta de flanco: guarda o valor deste
        frame antes de o limpar, para detectFlankThreat decidir com memória
        do frame anterior (entra a um limiar, só sai a um limiar maior). Sem
        isto o alerta ligava/desligava a cada frame perto da fronteira, e com
        ele a postura FLANK_SHIFT e os alvos que dependem dela.
        */
        this.prevFlankAlert = this.flankAlert;

        // Limpo aqui e não só em detectFlankThreat: esse nó só corre no ramo
        // defensivo, e um alerta antigo não pode sobreviver a uma recuperação.
        this.flankAlert = null;

        this.trace.length = 0;
    }
}

/* --- Acções do nível de equipa ------------------------------------------ */

/*
Quem persegue a bola: o jogador de campo mais próximo. É decisão colectiva
(só um vai) e não individual, por isso vive aqui.

Histerese por "top-3": recalcular o argmax do zero todos os frames faz o
chaser alternar entre dois jogadores com pontuações quase empatadas — um
salta para a bola, o outro para trás, o alvo de posicionamento de ambos
salta com eles. Em vez disso, quem já é chaser só perde o papel se cair
para fora das 3 melhores opções deste frame.
*/
function pickChaser(bb) {
    /*
    Só a equipa que NÃO tem a bola persegue. Sem isto, pickChaser corria
    igual para as duas equipas (só o caso do GK estava tratado abaixo) — se
    um companheiro do próprio portador calhasse ser o mais perto da bola
    (fora o portador), virava chaser da PRÓPRIA equipa e o IrABola (nível 3)
    mandava-o direito ao portador, por cima do que o PositionBT já lhe tinha
    dado (ex.: um RB "colava" no colega com a bola em vez de subir no
    corredor via attackFullBack).
    */
    if (bb.isAttacking) { bb.chaser = null; return; }

    /*
    Guarda-redes adversário já agarrou a bola com as mãos: ninguém pressiona
    — ele não pode ser desarmado (ver resolveBallContact/FSM), então correr
    até ele só amontoa gente na área. A equipa larga a marcação individual e
    volta ao bloco/forma (defendZonal continua a reorganizar sozinho).
    */
    if (bb.oppCarrier && bb.oppCarrier.role === 'gk') {
        bb.chaser = null;
        return;
    }
    // Mesma lógica para o PRÓPRIO GK: com a bola já segura em casa, ninguém
    // de campo precisa "correr atrás dela" — isso era exactamente o que
    // mandava o CB mais próximo (chaser) por cima dele via IrABola.
    if (bb.carrier && bb.carrier.role === 'gk') {
        bb.chaser = null;
        return;
    }

    const prevChaser = bb.chaser;

    /*
    Reação defensiva: quem perdeu a bola não decide pressionar/bloquear no
    mesmo frame — observa primeiro. Espera controlada por Defensive Pressure
    (painel esquerdo): Low 6s, Balanced 4s, High 2s. Match.possessionTimer
    conta desde a última troca de equipa na posse (ver updatePossession).
    */
    const reactionDelay = DefensivePressureModel[Tatics.pressaoDefensiva] || DefensivePressureModel.balanced;
    if (!bb.isAttacking && prevChaser && Match.possessionTimer < reactionDelay) {
        bb.chaser = prevChaser;
        return;
    }

    const ballPos = Match.ball.position;

    /*
    Ball Claim (Perception System, secção 16): com bola solta, usa o
    claimScore da percepção (timeToIntercept/confiança), mais realista do
    que "100 - distância" — considera se o jogador REALMENTE alcança a
    bola, não só quem está mais perto dela agora. Com bola já na posse de
    alguém (perseguir o portador, não uma bola solta) a percepção de
    interceptação não se aplica (ver Perception.computeInterception) — cai
    de volta na distância bruta, como sempre foi.
    */
    const bolaSolta = !Match.ballCarrier;
    const candidatos = bb.outfield.map(p => {
        let score;
        if (bolaSolta && typeof Perception !== 'undefined' && p.blackboard) {
            score = Perception.claimScore(p);
            if (score === -Infinity) score = 100 - p.model.position.distanceTo(ballPos) - 50;
        } else {
            score = 100 - p.model.position.distanceTo(ballPos);
        }

        // Atacantes não devem recuar para perseguir a bola no seu próprio meio-campo
        if (p.role === 'atk' && ballPos.z * p.dirZ < 5.0) {
            score -= 100;
        }
        return { p, score };
    });
    candidatos.sort((a, b) => b.score - a.score);

    const prevIdx = prevChaser ? candidatos.findIndex(c => c.p === prevChaser) : -1;
    if (prevIdx >= 0 && prevIdx < 3) {
        bb.chaser = prevChaser;
    } else {
        bb.chaser = candidatos.length ? candidatos[0].p : null;
        if (typeof MatchStats !== 'undefined' && prevChaser && bb.chaser !== prevChaser) {
            MatchStats[bb.team].trocasChaser++;
        }
    }
}

/*
Marcação individual + cobertura. Cada defensor escolhe o adversário que
melhor pontua por proximidade e perigo (distância à própria baliza).
Nenhum adversário é marcado por mais de 2 jogadores.

Histerese por "top-3", como no pickChaser: sem isto, dois adversários com
pontuação parecida faziam o alvo de marcação trocar de um frame para o
outro, e com ele o alvo de posicionamento do defensor (o salto reportado).
Quem já marcava um adversário continua a marcá-lo se ele ainda estiver
entre as 3 melhores opções deste frame.

Nota: p.markingTarget é limpo globalmente TODOS os frames antes deste tick
correr (ver Match.runTeamAI), por isso não dá para comparar contra ele
directamente — o valor "do frame anterior" tem de viver num campo à parte
que sobrevive a esse reset (p.prevMarkingTarget).
*/
function assignMarking(bb) {
    // Mesma janela de reação do pickChaser: mantém a marcação de antes da
    // perda de bola em vez de recalcular tudo no mesmo frame.
    const reactionDelay = DefensivePressureModel[Tatics.pressaoDefensiva] || DefensivePressureModel.balanced;
    if (!bb.isAttacking && Match.possessionTimer < reactionDelay) {
        bb.outfield.forEach(def => {
            const alvo = def.prevMarkingTarget;
            if (alvo) {
                def.markingTarget = alvo;
                alvo.markCount = (alvo.markCount || 0) + 1;
            } else {
                def.isCovering = true;
            }
        });
        return;
    }

    const defenders = bb.outfield;
    const attackers = bb.opp.filter(p => p.role !== 'gk');
    const ballCarrier = bb.oppCarrier;
    const primaryChaser = bb.chaser;

    if (primaryChaser && ballCarrier) {
        primaryChaser.markingTarget = ballCarrier;
        // Definir markCount = 2 impede que outros jogadores (na iteração abaixo) decidam marcar o mesmo portador
        ballCarrier.markCount = 2;
        primaryChaser.prevMarkingTarget = ballCarrier;
    }

    defenders.forEach(def => {
        if (def === primaryChaser) return;

        const candidatos = [];
        attackers.forEach(att => {
            if (att.markCount >= 1) return;

            const dist = def.model.position.distanceTo(att.model.position);
            if (dist > 25) return;

            // Fora do corredor natural do jogador: nunca é candidato, por
            // muito perto ou perigoso que esteja — ver MarkingModel.corredorMax.
            const xDiff = Math.abs(def.baseTarget.x - att.model.position.x);
            if (xDiff > MarkingModel.corredorMax) return;

            const distToGoal = Math.abs(def.ownGoalZ - att.model.position.z);
            let score = (100 - dist) + (100 - distToGoal) * 1.5;
            score -= (xDiff * 4.0);

            // Penaliza atacantes que tentem marcar jogadores no seu próprio meio-campo
            if (def.role === 'atk' && att.model.position.z * def.dirZ < 5.0) {
                score -= 100;
            }

            if (att === ballCarrier) score += 50;

            candidatos.push({ att, score });
        });
        candidatos.sort((a, b) => b.score - a.score);

        const prevAlvo = def.prevMarkingTarget;
        const prevIdx = prevAlvo ? candidatos.findIndex(c => c.att === prevAlvo) : -1;
        const escolhido = (prevIdx >= 0 && prevIdx < 3)
            ? prevAlvo
            : (candidatos.length ? candidatos[0].att : null);

        if (typeof MatchStats !== 'undefined' && prevAlvo && escolhido !== prevAlvo) {
            MatchStats[bb.team].trocasMarcacao++;
        }

        if (escolhido) {
            def.markingTarget = escolhido;
            escolhido.markCount++;
        } else {
            def.isCovering = true;
        }
        def.prevMarkingTarget = escolhido;
    });
}

/*
Detecta se o portador adversário está a atacar por um flanco dentro do
nosso terço — dispara a basculação colectiva (postura FLANK_SHIFT).

Zona morta assimétrica: entra em alerta a 8m do eixo, só sai acima de 11m.
Com um único limiar, o portador a rondar os 8m ligava e desligava o alerta
a cada frame, e com ele a postura e os alvos de vários jogadores
(defendFlankShift). bb.prevFlankAlert é guardado em gather(), antes do
reset — ver o comentário lá.
*/
function detectFlankThreat(bb) {
    const carrier = bb.oppCarrier;
    if (!carrier) { bb.flankAlert = null; return; }

    const inDefThird = (carrier.model.position.z * bb.dir < -10.0);
    if (!inDefThird) { bb.flankAlert = null; return; }

    const x = carrier.model.position.x * bb.dir;
    const ENTRA = 8.0, SAI = 11.0;
    const limiteEsq = (bb.prevFlankAlert === 'left') ? SAI : ENTRA;
    const limiteDir = (bb.prevFlankAlert === 'right') ? SAI : ENTRA;

    if (x < -limiteEsq) bb.flankAlert = 'left';
    else if (x > limiteDir) bb.flankAlert = 'right';
    else bb.flankAlert = null;
}

/*
Quem desce a dar linha de passe na construção.

Sem isto nenhum médio alguma vez aparecia no nosso terço (medido: 0.0% do
tempo), e a bola tinha de sair da defesa directamente para o ataque. Escolhe o
médio mais perto da bola quando ela está no nosso meio-campo, e o nível 2
manda-o oferecer-se em vez de ocupar a posição normal.
*/
function pickSupportMid(bb) {
    if (!bb.isAttacking || bb.ballZ * bb.dir > TeamShape.supportBallZ) {
        bb.supportMid = null;
        return;
    }

    /*
    Guarda-redes com a bola nas mãos não é construção a sair a jogar: não há
    linha de passe para oferecer enquanto ele a segura, e supportBuildUp() põe
    o médio em `ballZ` — ou seja, dentro da própria área, colado ao GR. Era
    isso que fazia o médio (tipicamente o 8, o mais perto) ignorar o bloco a
    meio-campo que o computeBlock manda formar nesta situação.
    */
    if ((bb.carrier && bb.carrier.role === 'gk') ||
        (typeof Match !== 'undefined' && Match.gkHoldingBall && Match.gkHoldingBall[bb.team])) {
        bb.supportMid = null;
        return;
    }

    // Histerese, como no chaser e na marcação: supportBuildUp() substitui o
    // slot inteiro do médio escolhido, por isso trocar de escolhido a cada
    // frame (dois médios a distâncias parecidas) fazia o alvo saltar entre
    // o slot normal e "ir buscar a bola" de um jogador para o outro.
    const prev = bb.supportMid;
    const candidatos = bb.outfield
        .filter(p => p.role === 'mid')
        .map(p => ({ p, dist: p.model.position.distanceTo(Match.ball.position) }));
    candidatos.sort((a, b) => a.dist - b.dist);

    const prevIdx = prev ? candidatos.findIndex(c => c.p === prev) : -1;
    if (prevIdx >= 0 && prevIdx < 3) {
        bb.supportMid = prev;
    } else {
        bb.supportMid = candidatos.length ? candidatos[0].p : null;
        if (typeof MatchStats !== 'undefined' && prev && bb.supportMid !== prev) {
            MatchStats[bb.team].trocasSupportMid++;
        }
    }
}

// Traduz fase de posse + estilo de jogo nos multiplicadores colectivos.
// Estes valores eram calculados por jogador; são idênticos para toda a equipa,
// por isso passaram a ser calculados uma vez só, aqui.
function computeCollectiveShape(bb) {
    let phaseMultiplier = 1.0;
    if (bb.phase === 2) phaseMultiplier = 1.1;
    else if (bb.phase === 3) phaseMultiplier = 1.3;

    let pushMultiplier = (bb.isCounter ? 1.35 : 1.0) * phaseMultiplier;
    let styleDefenseZShift = 0;

    if (Tatics.estilo === 'ataque') {
        pushMultiplier *= 1.15;
        styleDefenseZShift = 6.0 * bb.dir;
    } else if (Tatics.estilo === 'defesa') {
        pushMultiplier *= 0.85;
        styleDefenseZShift = -8.0 * bb.dir;
    }

    bb.pushMultiplier = pushMultiplier;
    bb.styleDefenseZShift = styleDefenseZShift;
    bb.styleLineShift = styleDefenseZShift * bb.dir;   // o mesmo, em referencial de ataque

    /*
    Quão avançada está a manobra: 0 na nossa linha de fundo, 1 no ataque.

    O clamp tem de ser aplicado DEPOIS do pushMultiplier. Antes era
    `clamp(...) * pushMultiplier`, o que deixava o factor chegar a 2.02 — e como
    ele é usado como `t` num lerp, o lerp extrapolava: médios desenhados para
    parar aos 26.5 m acabavam a 48 m, dentro da área. O meio-campo esvaziava-se
    e a bola saía da defesa directamente para o ataque.
    */
    const ballPushNorm = THREE.MathUtils.clamp((bb.ballZ * bb.dir + 53) / 106, 0, 1);
    bb.advanceFactor = THREE.MathUtils.clamp(ballPushNorm * 1.3 * pushMultiplier, 0, 1);
}

/*
A linha defensiva — a linha do fora-de-jogo da equipa.

Acompanha a bola (8 m atrás dela), é modulada pelo estilo de jogo, e é limitada
em cima pelo ajuste "Linha Defensiva" do painel e em baixo pelo lineFloor.
É este tecto que decide se a equipa faz bloco baixo, médio ou alto.

Devolve no referencial de ataque da equipa; bb.defLineZ guarda a versão mundo.
*/
function computeDefensiveLine(bb) {
    const cap = TeamShape.linhaDefensiva[Tatics.linhaDefensiva];
    let tecto = (cap === undefined) ? TeamShape.linhaDefensiva.medium : cap;

    /*
    Defensive Pressure (painel esquerdo) impõe um tecto ABSOLUTO à linha —
    sem isto, "Balanced"/"Low" só atrasavam a REACÇÃO (pickChaser/
    assignMarking, ver DefensivePressureModel) mas a linha em si podia
    subir tanto quanto "High", bastando Estilo de Jogo=Ataque. Usa o mais
    restritivo entre o tecto do painel "Linha Defensiva" e o de
    TeamShape.pressaoLineCap.
    */
    const pressCap = TeamShape.pressaoLineCap[Tatics.pressaoDefensiva] ?? TeamShape.pressaoLineCap.balanced;
    tecto = Math.min(tecto, pressCap);

    const ballDir = bb.ballZ * bb.dir;
    const follow = ballDir - 8 + bb.styleLineShift;
    let lineDir = THREE.MathUtils.clamp(follow, TeamShape.lineFloor, tecto);

    // O tecto não pode deixar a bola fugir do bloco: se ela está muito à frente
    // (pressão no meio-campo adversário), a linha sobe para o bloco continuar
    // inteiro. Sem isto, os defesas seguravam-se lá atrás enquanto um colega
    // pressionava 60 m à frente — precisamente o que se queria evitar.
    lineDir = Math.max(lineDir, ballDir - TeamShape.blockDepthDef);

    bb.defLineDir = lineDir;
    bb.defLineZ = lineDir * bb.dir;
    return lineDir;
}

/*
Compactação do bloco.

Sem isto a equipa estica: os avançados ficam colados à área adversária enquanto
os defesas seguram a linha lá atrás. Aqui a equipa passa a viver numa faixa de
profundidade limitada, ancorada na linha defensiva (sem bola) ou na bola (com
bola) — é o que faz o bloco subir e descer *inteiro* com a jogada.

Quem vai à bola (chaser) e quem a tem estão isentos: um pressionador tem de
poder sair do bloco, senão ninguém ataca o portador.
*/
/*
O RECTÂNGULO DO BLOCO — o produto principal do nível 1.

Substitui o `enforceCompactness`, que era um `clamp(z, anchor, top)` por
jogador. Um clamp projecta todos os que estão fora sobre o MESMO valor de
fronteira: quatro jogadores acima do tecto saíam com z idêntico ao centímetro,
e o resultado em campo era um monte de gente no mesmo sítio.

Aqui não se toca em ninguém. Calcula-se um rectângulo e o nível 2 coloca cada
jogador dentro dele por percentagem. Comprimir passa a ser encolher o
rectângulo — toda a gente encolhe junta e a forma mantém-se.

Tudo no referencial de ataque (-53 baliza própria, +53 baliza adversária).
*/
function computeBlock(bb) {
    const B = BlockShape;
    const modo = bb.isAttacking ? 'comBola' : 'semBola';
    const compac = B.amplitude[Tatics.compactness] !== undefined
        ? Tatics.compactness : 'median';
    const compacLength = B.profundidade[Tatics.lengthCompactness] !== undefined
        ? Tatics.lengthCompactness : 'median';

    /* --- profundidade --------------------------------------------------- */

    /*
    BUG (auditoria do painel): o `B.profundidadeComBola` (1.22) estava
    definido no config e documentado ("com bola o bloco estica: há que dar
    profundidade para jogar"), mas nunca era lido — o bloco tinha exactamente
    a mesma profundidade a atacar e a defender. O mesmo com
    `B.amplitudeComBola` (ver largura, mais abaixo).
    */
    let profundidade = CAMPO_COMP * B.profundidade[compacLength];
    if (bb.isAttacking) profundidade *= B.profundidadeComBola;

    /*
    GR (de qualquer um dos dois lados) com a bola na mão: ninguém pressiona
    (ver pickChaser) nem precisa fugir pra dentro da própria área — os dois
    blocos reorganizam pro MEIO do campo em vez de seguir `ballZ*dir` cru,
    que arrastava o bloco INTEIRO (incluindo atacantes) até perto do próprio
    GR quando ele segurava a bola bem no fundo. O resto da função (largura,
    fora-de-jogo, etc.) continua igual a partir daqui.
    */
    const gkComABola = (bb.carrier && bb.carrier.role === 'gk') || (bb.oppCarrier && bb.oppCarrier.role === 'gk');

    // O centro do bloco no eixo Z acompanha a bola — excepto com um GR
    // segurando a bola, aí vai pro meio do campo (ver acima).
    let blockCenterZ = gkComABola ? 0 : bb.ballZ * bb.dir;

    // A pedido do utilizador: Puxar o bloco à frente ou atrás consoante a postura
    if (gkComABola) {
        // sem ajustes de postura — bloco fica centrado no meio-campo.
    } else if (bb.isAttacking) {
        if (bb.posture === TeamPosture.COUNTER) {
            blockCenterZ += 10.0;
        } else if (bb.posture === TeamPosture.BUILD_UP || bb.posture === TeamPosture.ATTACK_SUSTAINED || bb.posture === TeamPosture.FINAL_THIRD) {
            blockCenterZ += 5.0;
        }
    } else {
        if (bb.posture === TeamPosture.LOW_BLOCK) {
            blockCenterZ -= 6.0;
        } else if (bb.posture === TeamPosture.MID_BLOCK) {
            blockCenterZ -= 3.0;
        }
        // HIGH_PRESS mantém-se na linha da bola (sem offset)

        /*
        Sem bola, o bloco seguia `ballZ*dir` quase cru — numa reposição do
        GR adversário (bola no fundo do campo DELE, ballZ*dir enorme deste
        lado) o bloco inteiro saltava até perto do ataque tentando "ficar à
        frente da bola", mesmo em Balanced/Low. Defensive Pressure agora
        trava o quanto o bloco avança sem bola: meio-campo (Low), 1/3 do
        campo de ataque (Balanced), 2/3 (High) — ver TeamShape.pressaoLineCap.
        */
        const pressCap = TeamShape.pressaoLineCap[Tatics.pressaoDefensiva] ?? TeamShape.pressaoLineCap.balanced;
        blockCenterZ = Math.min(blockCenterZ, pressCap);
    }

    let z0 = blockCenterZ - (profundidade / 2);
    let z1 = blockCenterZ + (profundidade / 2);

    // O fora-de-jogo trava a frente do bloco (só a atacar)
    if (bb.isAttacking && bb.offsideLimitDir !== null && bb.offsideLimitDir !== undefined) {
        if (z1 > bb.offsideLimitDir) {
            z1 = bb.offsideLimitDir;
            z0 = z1 - profundidade;
        }
    }

    const fundo = (CAMPO_COMP / 2) * B.margemFundo;

    // Deslocar o bloco inteiro caso ultrapasse os limites, sem o achatar
    if (z0 < -fundo) {
        z0 = -fundo;
        z1 = z0 + profundidade;
    }
    if (z1 > fundo) {
        z1 = fundo;
        z0 = z1 - profundidade;
    }

    // Travão à marca do penalty própria — ver BlockShape.recuoMax.
    if (z0 < B.recuoMax) {
        z0 = B.recuoMax;
        z1 = z0 + profundidade;
    }

    /* --- largura -------------------------------------------------------- */

    // Ver a nota da profundidade: o amplitudeComBola também não era lido.
    let largura = CAMPO_LARG * B.amplitude[compac];
    if (bb.isAttacking) largura *= B.amplitudeComBola;
    const meiaLarg = largura / 2;

    // Basculação: o rectângulo desliza para o lado da bola proporcionalmente.
    // Se a bola estiver na linha lateral, o rectângulo vai encostar a essa linha.
    const ballPercentX = bb.ballX / (CAMPO_LARG / 2); // de -1 a 1
    const borda = (CAMPO_LARG / 2) * B.margemLateral;
    const maxCentroX = borda - meiaLarg;

    let centroX = ballPercentX * maxCentroX;
    
    // Basculação extra para postura FLANK_SHIFT (desloca 4 metros para o lado em perigo)
    if (!bb.isAttacking && bb.posture === TeamPosture.FLANK_SHIFT) {
        if (bb.flankAlert === 'left') {
            centroX -= 4.0 * bb.dir;
        } else if (bb.flankAlert === 'right') {
            centroX += 4.0 * bb.dir;
        }
    }

    // Garante que o rectângulo não sai do campo (já coberto pelo maxCentroX, mas por precaução)
    centroX = THREE.MathUtils.clamp(centroX, -maxCentroX, maxCentroX);

    bb.bloco = {
        x0: centroX - meiaLarg,
        x1: centroX + meiaLarg,
        z0: z0,
        z1: z1,
        modo: modo
    };

    // O painel de debug desenha estes: mantidos em sincronia com o que é
    // mesmo aplicado, ao contrário do blockBottom/blockTop antigos, que eram
    // calculados, desenhados e depois ignorados pelo clamp.
    bb.blockBottom = z0;
    bb.blockTop = z1;

    return bb.bloco;
}

/*
Onde este jogador fica dentro do bloco, em metros no mundo.

    p.slot.u   0..1 da esquerda para a direita do bloco
    p.slot.v   0..1 da última linha para a frente do bloco

O LineShape puxa o v conforme a linha (def/mid/atk) e conforme a equipa tem ou
não a bola, e fecha o u lateralmente. É a camada 2 que o senhor pediu: um
ajuste por linha, com e sem bola, por cima da forma da formação.
*/
function slotNoBloco(p, bb) {
    const bloco = bb.bloco;
    if (!bloco || !p.slot) return null;

    const linha = LineShape[p.role] || LineShape.mid;
    const modo = bb.isAttacking ? linha.comBola : linha.semBola;

    // v: puxado para o alvo da linha, com/sem bola.
    let v = lerp(p.slot.v, modo.alvo, modo.empurrar);

    // Ajuste fino por posição específica (lateral à frente do central, médio
    // de ponta sobe mais na construção) — ver PositionDepthNudge.
    const nudge = PositionDepthNudge[p.pos];
    if (nudge) {
        if (bb.isAttacking) {
            const fbStyle = (p.pos === 'LB' || p.pos === 'RB') ? FullBackStyle[p.fbStyle] : null;
            v += nudge.comBola * (fbStyle ? fbStyle.comBolaMult : 1);
        } else {
            v += nudge.semBola;
        }
    }
    v = THREE.MathUtils.clamp(v, 0, 1);

    // u: fecha lateralmente em torno do eixo central do bloco (0.5).
    const fechoLinha = LineShape.fecho[p.role] || LineShape.fecho.mid;
    const fecho = bb.isAttacking ? fechoLinha.comBola : fechoLinha.semBola;
    const u = 0.5 + (p.slot.u - 0.5) * fecho;

    return {
        x: bloco.x0 + u * (bloco.x1 - bloco.x0),
        z: (bloco.z0 + v * (bloco.z1 - bloco.z0)) * bb.dir
    };
}

/*
A última linha segura a linha do fora-de-jogo.

As folhas defensivas puxam o defesa atrás do homem que marca, e as molas do
relaxConstraints esticam-no outra vez; sem este travão a linha derrapa vários
metros e o ajuste "Linha Defensiva" do painel deixa de significar alguma coisa.

Por isso este passo é o ÚLTIMO de todos — corre depois do relax. O defesa pode
recuar abaixo da linha (cobertura), nunca subir acima dela. Quem vai à bola está
isento: tem de poder sair a pressionar.

Como só puxa defesas para trás, nunca pode criar um fora-de-jogo — e a equipa
que defende não é sequer a que o relax limita por fora-de-jogo.
*/
function holdOffsideLine(bb) {
    if (bb.isAttacking) return;

    for (const p of bb.outfield) {
        if (p.role !== 'def') continue;
        if (p === bb.chaser || p.hasBall) continue;

        if (p.dynamicTarget.z * bb.dir > bb.defLineDir) {
            p.dynamicTarget.z = bb.defLineDir * bb.dir;
        }
    }
}

/*
Playing style do GK — Offensive (sweeper, sai da baliza) vs Defensive (fica
perto da linha, padrão). Dispara evento só na mudança, não todo frame.

Offensive: adversário com a bola no corredor central (|x|<8) e sem nenhum
defensor nosso entre ele e a nossa baliza.
Defensive: qualquer outro caso (padrão).
*/
function updateGkStyle(bb) {
    const gk = bb.own.find(pl => pl.role === 'gk');
    if (!gk) return;

    // Traço fixo do jogador (ver createTeams/assignFormations em match.js).
    // Defensive nunca sai da linha — ignora o gatilho de sweeper por completo.
    if (gk.gkStyleBase === 'defensive') {
        if (gk.gkStyle !== 'defensive') {
            gk.gkStyle = 'defensive';
            if (typeof EventBus !== 'undefined') EventBus.emit('GK_STYLE_DEFENSIVE', { gk: gk });
        }
        return;
    }

    let offensive = false;
    const opp = bb.oppCarrier;
    if (opp && Math.abs(opp.model.position.x) < 8) {
        const oppAvanco = opp.model.position.z * bb.dir;
        const temDefensorPelaFrente = bb.outfield.some(d =>
            (d.model.position.z * bb.dir) < oppAvanco - 1 &&
            Math.abs(d.model.position.x - opp.model.position.x) < 10
        );
        offensive = !temDefensorPelaFrente;
    }

    const newStyle = offensive ? 'offensive' : 'defensive';
    if (gk.gkStyle !== newStyle) {
        gk.gkStyle = newStyle;
        if (typeof EventBus !== 'undefined') {
            EventBus.emit(newStyle === 'offensive' ? 'GK_STYLE_OFFENSIVE' : 'GK_STYLE_DEFENSIVE', { gk: gk });
        }
    }
}

// Aplica as manípulas da postura escolhida (neutras por omissão).
function applyPostureTuning(bb) {
    const tune = TeamPostureTuning[bb.posture];
    if (!tune) return;
    bb.pushMultiplier *= tune.push;
    bb.styleDefenseZShift += tune.lineShift * bb.dir;
    bb.advanceFactor = THREE.MathUtils.clamp(bb.advanceFactor * tune.push, 0, 1);
}

const setPosture = (posture) => act('posture:' + posture, (bb) => { bb.posture = posture; });

/* --- A árvore ----------------------------------------------------------- */

const TeamBT = sel('TeamRoot',

    // 1. Bola parada suspende o plano normal.
    seq('BolaParada',
        cond('jogoParado', () => Match.state !== 'PLAY'),
        setPosture(TeamPosture.SET_PIECE)
    ),

    // 2. Com bola: qual a fase da manobra ofensiva?
    seq('ComBola',
        cond('temPosse', (bb) => bb.isAttacking),
        sel('FaseOfensiva',
            seq('Transicao',
                cond('emContraAtaque', (bb) => bb.isCounter),
                setPosture(TeamPosture.COUNTER)
            ),
            seq('UltimoTerco',
                cond('bolaNoUltimoTerco', (bb) => bb.ballZ * bb.dir > 17.0),
                setPosture(TeamPosture.FINAL_THIRD)
            ),
            seq('PosseInstalada',
                cond('posseProlongada', (bb) => bb.phase >= 2),
                setPosture(TeamPosture.ATTACK_SUSTAINED)
            ),
            setPosture(TeamPosture.BUILD_UP)
        )
    ),

    // 3. Sem bola: que bloco defensivo?
    seq('SemBola',
        act('lerAmeacaDeFlanco', detectFlankThreat),
        sel('BlocoDefensivo',
            seq('Basculacao',
                cond('flancoEmPerigo', (bb) => bb.flankAlert !== null),
                setPosture(TeamPosture.FLANK_SHIFT)
            ),
            seq('BlocoBaixo',
                cond('bolaNoNossoTerco', (bb) => bb.ballZ * bb.dir < -17.0),
                setPosture(TeamPosture.LOW_BLOCK)
            ),
            seq('PressaoAlta',
                // Precisa do Estilo=Ataque E do Defensive Pressure em High — só
                // um dos dois (ex: Ataque + Balanced) não basta pra pressionar
                // no campo do adversário o jogo inteiro.
                cond('pressionamosAlto', (bb) =>
                    Tatics.estilo === 'ataque' && Tatics.pressaoDefensiva === 'high' && bb.ballZ * bb.dir > 0),
                setPosture(TeamPosture.HIGH_PRESS)
            ),
            setPosture(TeamPosture.MID_BLOCK)
        )
    )
);

/* --- Ponto de entrada --------------------------------------------------- */

const TeamAI = {
    blackboards: {},

    get: function (team) {
        if (!this.blackboards[team]) this.blackboards[team] = new TeamBlackboard(team);
        return this.blackboards[team];
    },

    // Um tick completo do nível 1 para uma equipa.
    tick: function (team, match) {
        const bb = this.get(team);
        bb.gather(match);

        pickChaser(bb);
        updateGkStyle(bb);
        // Estilos de jogo: avalia condições e emite eventos nas transições.
        if (typeof PlayingStyleEvents !== 'undefined') PlayingStyleEvents.tick(bb);
        TeamBT.tick(bb);
        computeCollectiveShape(bb);
        applyPostureTuning(bb);
        computeDefensiveLine(bb);

        /*
        O bloco é calculado AQUI, antes do nível 2, porque agora é ele que dá a
        posição a toda a gente — deixou de ser uma compressão aplicada no fim.

        Usa o `offsideLimitDir` do frame anterior (o relaxConstraints só o
        publica depois das posições estarem escritas). Um frame de atraso numa
        grandeza que varia devagar é preferível ao nó de ordem que a alternativa
        obrigaria a desatar.
        */
        computeBlock(bb);

        pickSupportMid(bb);
        assignMarking(bb);

        return bb;
    },

    // Já não há um passo de compressão: comprimir passou a ser encolher o
    // rectângulo, no computeBlock. Mantido para não partir quem o chame.
    compact: function () { },

    // Terceiro e último passo: a linha defensiva tem a palavra final, já depois
    // das molas de coesão.
    holdLine: function (bb) {
        holdOffsideLine(bb);
    }
};
