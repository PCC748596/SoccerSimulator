function ownGoalZCenter(team) {
    return (team === 'TeamA') ? -48 : 48;
}

/*
Efeito real do passe: bola sai do pé. Chamado UMA vez por ActionState.onContact
(ver initiatePass em player.js), no frame em que a pose de chute atinge o
tempo de contacto — não no frame em que o BT decidiu passar. Corpo idêntico
ao antigo bloco `if (p.hasBall && p.passTarget)` do case 'PASS', só movido
para fora do timer bruto.
*/
function executePassGameplay(p) {
    // Lançamento: a bola vai para o ESPAÇO, não para o colega. A força é
    // calibrada para lá chegar mesmo (ver PassModel).
    let ehLancamento = false;
    let lancamentoAlto = false;
    if (p.isThroughBall && p.throughBallTarget) {
        p.isThroughBall = false;
        p.throughBallTarget = null;
        ehLancamento = true;
        lancamentoAlto = !!p.throughBallAlto;
        p.throughBallAlto = false;
    }
    // Capturado antes de p.isCross ser limpo mais abaixo.
    const tipoPasseStats = ehLancamento ? 'lancamento' : (p.isCross ? 'cruzamento' : 'passe');

    _v1.copy(p.passTargetPos);

    /*
    Direcção e distância no PLANO. Antes usava-se a distância 3D e a direcção
    normalizada em 3D — e depois `ballVel.copy(_v2).multiplyScalar(forca)`
    escrevia as TRÊS componentes.

    Isso apagava, no mesmo instante, todos os `Match.ballVel.y = ...` que os
    ramos acima tinham acabado de definir: o `6.8` do cruzamento, o
    `2 + dist*0.12` do passe longo, tudo. A altura da bola vinha só de
    `_v2.y`, ou seja da diferença de alturas entre a bola e o alvo — quase
    zero. Nenhum passe longo nem cruzamento subia alguma vez do chão.
    */
    const dxAlvo = _v1.x - Match.ball.position.x;
    const dzAlvo = _v1.z - Match.ball.position.z;
    let distToTarget = Math.hypot(dxAlvo, dzAlvo);
    const dirX = distToTarget > 0.001 ? dxAlvo / distToTarget : 0;
    const dirZ = distToTarget > 0.001 ? dzAlvo / distToTarget : 1;

    /*
    A força do passe sai da BALÍSTICA, não de uma heurística.

    Era `forca = dist * 0.85` com `vy = min(6.5, 2 + dist*0.12)` — números
    calibrados contra a física antiga (g = 15, arrasto exponencial). Medido
    com a física real: o primeiro toque caía 4 m antes do alvo num passe de
    25 m e 17 m antes num de 70 m, e a bola nunca chegava a quem devia. Agora
    pede-se o ALCANCE e resolve-se a velocidade (ver utils.js).

    Elevação por distância: mais alto no passe curto-longo (para passar por
    cima de quem está no meio), mais raso no passe muito longo (chega antes).
    */
    let forcaPasse = 18.0;
    let usouBalistica = false;

    if (ehLancamento) {
        /*
        TIPO 2 — LANÇAMENTO. A bola vai para o ESPAÇO à frente do companheiro,
        nunca para cima dele: o alvo (`throughBallTarget`) já é esse ponto.

        Pelo alto quando há marcadores no corredor (decidido em
        findThroughBall): passa por cima deles e aterra no mesmo sítio.
        Rasteiro quando o caminho está limpo — chega mais depressa e ele
        recebe-a a correr.
        */
        if (lancamentoAlto) {
            const elevL = PassModel.elevacaoLancamento;
            const vL = velocidadeParaAlcance(distToTarget, elevL);
            Match.ballVel.y = vL * Math.sin(elevL);
            forcaPasse = vL * Math.cos(elevL);
        } else {
            forcaPasse = velocidadeRasteiraPara(distToTarget, PassModel.vChegadaLancamento);
            Match.ballVel.y = 0;
        }
        usouBalistica = true;
    } else if (p.isCross) {
        /*
        Alto ou rasteiro — decidido no findCross (player_bt.js) conforme haja
        alguém na linha do cruzamento, a distância ao alvo e o jogo aéreo dele.

        Rasteiro sai mais forte e junto ao chão: chega antes e não dá tempo ao
        guarda-redes de sair. Alto passa por cima de quem está no caminho.
        */
        if (p.crossAlto === false) {
            forcaPasse = velocidadeRasteiraPara(distToTarget, PassModel.vChegadaCruzamento);
            Match.ballVel.y = 0;
        } else {
            /*
            TIPO 3 — CRUZAMENTO ALTO. Tem de chegar à altura da CABEÇA dele,
            ainda no ar, para poder cabecear à baliza.

            `velocidadeParaAlcance` punha a bola no CHÃO no ponto do alvo —
            chegava sempre baixa de mais para cabecear. Aqui pede-se a
            velocidade que a põe a `alturaCruzamento` quando lá chega.
            */
            const elevC = PassModel.elevacaoCruzamento;
            let vC = velocidadeParaAlturaEm(distToTarget, PassModel.alturaCruzamento, elevC);
            // Longe de mais para chegar à cabeça: manda o melhor que consegue.
            if (vC === null) vC = velocidadeParaAlcance(distToTarget, elevC);
            Match.ballVel.y = vC * Math.sin(elevC);
            forcaPasse = vC * Math.cos(elevC);
        }
        usouBalistica = true;
        p.isCross = false;
        p.crossAlto = undefined;
    } else if (Tatics.passe === 'longo' || distToTarget > PassModel.distAereo) {
        /*
        TIPO 1 — PASSE PELO ALTO. Passa por cima dos marcadores e cai um pouco
        ANTES do companheiro (`recuoPasseAlto`), para lhe morrer à frente ou
        no peito, em vez de nas costas.

        Aterrar exactamente em cima dele obrigava-o a recuar para a apanhar; e
        como o alvo já vem adiantado do `alvoDePasse` (que antecipa o
        movimento dele), somavam-se dois avanços e a bola caía longe.
        */
        const alcancePasse = Math.max(PassModel.distAereo * 0.6,
            distToTarget - PassModel.recuoPasseAlto);
        const t = THREE.MathUtils.clamp(
            (distToTarget - PassModel.distAereo) / (60 - PassModel.distAereo), 0, 1);
        const elev = PassModel.elevacaoCurta + (PassModel.elevacaoLonga - PassModel.elevacaoCurta) * t;
        const v = velocidadeParaAlcance(alcancePasse, elev);
        Match.ballVel.y = v * Math.sin(elev);
        forcaPasse = v * Math.cos(elev);
        usouBalistica = true;
    } else {
        // Passe rasteiro: chega jogável, não morto nem a queimar.
        forcaPasse = velocidadeRasteiraPara(distToTarget, PassModel.vChegadaRasteira);
        Match.ballVel.y = 0;
        usouBalistica = true;
    }

    /*
    Skill do passador entra como PRECISÃO no peso da bola, não como um bónus
    de força: com a balística resolvida, multiplicar a força por um "boost"
    só voltava a pôr a bola longe do alvo. Um bom passador acerta o peso;
    um mau passa curto ou longo.
    */
    if (usouBalistica) {
        const passSkill = p.skillFor ? p.skillFor('PASS') : 50;
        const erro = 1 + (Math.random() * 2 - 1) * PassModel.erroPesoMax * (1 - passSkill / 100);
        forcaPasse *= erro;
        Match.ballVel.y *= erro;
    } else {
        forcaPasse *= 1.0 + ((TeamSkills[p.team].mid - 50) / 100) * 0.4;
    }

    // `forcaPasse` é a componente HORIZONTAL; o y já foi posto acima.
    Match.ballVel.set(dirX * forcaPasse, Match.ballVel.y, dirZ * forcaPasse);
    p.hasBall = false;
    p.touchLock = BallControl.touchLock;
    Match.ballCarrier = null;
    Match.intendedReceiver = p.passTarget;
    Match.lastTouchedTeam = p.team;
    Match.lastTouchedPlayer = p;
    if (typeof MatchStats !== 'undefined') MatchStats.registarPasseIniciado(p.team, tipoPasseStats);
}

class PlayerFSM {
    constructor(player) {
        this.p = player; this.currentState = 'IDLE'; this.timer = 0;
    }
    changeState(newState) {
        if (this.currentState === newState) return;
        if (this.currentState === 'SLIDE_TACKLE' || this.currentState === 'TACKLE' || this.currentState === 'SHOOT' || this.currentState === 'PASS') {
            this.p.resetBonesToDefault();
        }
        // Sair do CUT por qualquer via (perdeu a bola, desarme, bola parada)
        // tem de desligar a camada aditiva, senão fica com o corpo torto.
        if (this.currentState === 'CUT' && newState !== 'CUT') this.p.cutAtivo = false;

        this.currentState = newState; this.timer = 0;

        if (newState === 'SLIDE_TACKLE') this.enterSlideTackle();
        if (newState === 'TACKLE') this.p.tackleResolvido = false;
    }

    /*
    Entrada no carrinho: decide sobre que anca desliza e qual o pé que estica.
    Estica o pé do lado da bola; se ela estiver mesmo em frente, escolhe ao
    acaso, porque os dois lados ficam bem.
    */
    enterSlideTackle() {
        const p = this.p;
        p.slideTouched = false;

        _v1.subVectors(Match.ball.position, p.model.position);
        _v2.set(0, 0, 1).applyQuaternion(p.model.quaternion);
        const lateral = _v2.z * _v1.x - _v2.x * _v1.z;

        if (Math.abs(lateral) < 0.3) p.slideSide = (Math.random() < 0.5) ? -1 : 1;
        else p.slideSide = (lateral > 0) ? 1 : -1;
    }

    /*
    Pose do carrinho, construida a mao a partir da foto de referencia: desliza
    sobre uma anca, uma perna esticada para a bola, a outra dobrada por baixo,
    tronco erguido e apoiado no braco de tras.

    `intens` vai de 0 (de pe) a 1 (pose completa), o que da a entrada e a saida
    suaves sem precisar de keyframes.
    */
    applySlidePose(intens) {
        const p = this.p;
        const rig = p.rig;
        if (!rig) return;

        const P = SlideTackleModel.pose;
        const s = p.slideSide || 1;
        const k = intens;

        // A perna que estica e a do lado `s`; deita-se sobre a anca oposta.
        const coxaEst = (s > 0) ? rig.rLeg : rig.lLeg;
        const joelhoEst = (s > 0) ? rig.rKnee : rig.lKnee;
        const peEst = (s > 0) ? rig.rFoot : rig.lFoot;
        const coxaDob = (s > 0) ? rig.lLeg : rig.rLeg;
        const joelhoDob = (s > 0) ? rig.lKnee : rig.rKnee;

        // O braco de apoio e o do lado em que esta deitado.
        const bracoApoio = (s > 0) ? rig.lArm : rig.rArm;
        const cotoveloApoio = (s > 0) ? rig.lElbow : rig.rElbow;
        const bracoLivre = (s > 0) ? rig.rArm : rig.lArm;
        const cotoveloLivre = (s > 0) ? rig.rElbow : rig.lElbow;

        rig.pelvis.rotation.z = -s * P.ancaRolar * k;
        rig.pelvis.rotation.x = P.ancaTras * k;
        rig.chest.rotation.x = P.peito * k;
        rig.chest.rotation.z = -s * P.peitoRolar * k;

        coxaEst.rotation.x = P.coxaEstendida * k;
        coxaEst.rotation.z = 0;
        joelhoEst.rotation.x = P.joelhoEstendido * k;
        if (peEst) peEst.rotation.x = P.peEstendido * k;

        coxaDob.rotation.x = P.coxaDobrada * k;
        coxaDob.rotation.z = 0;
        joelhoDob.rotation.x = P.joelhoDobrado * k;

        // rotation.z "para fora" e positivo no braco esquerdo, negativo no direito.
        bracoApoio.rotation.z = s * P.bracoApoioZ * k;
        bracoApoio.rotation.x = P.bracoApoioX * k;
        cotoveloApoio.rotation.x = P.cotoveloApoio * k;

        bracoLivre.rotation.z = -s * P.bracoLivreZ * k;
        bracoLivre.rotation.x = P.bracoLivreX * k;
        cotoveloLivre.rotation.x = P.cotoveloLivre * k;

        p.model.position.y = ALTURA_BASE_Y + SlideTackleModel.alturaAnca * k;
    }

    update(dt) {
        this.timer += dt;
        let p = this.p; let rig = p.rig;

        switch (this.currentState) {
            case 'SET_PIECE_WAIT':
                p.velocity.set(0, 0, 0);
                if (Match.ball) {
                    let lookPos = Match.ball.position.clone();
                    lookPos.y = p.model.position.y;
                    lookAtBola(p.model, lookPos);
                }
                break;
            case 'SET_PIECE_TAKER':
                p.velocity.set(0, 0, 0);
                if (Match.ball) {
                    let lookPos = Match.ball.position.clone();
                    lookPos.y = p.model.position.y;
                    lookAtBola(p.model, lookPos);
                }
                if (Match.setPieceTimer > 1.5) {
                    if (Match.state === 'CORNER_KICK') {
                        let targetZ = p.ownGoalZ * -1.0 - p.dirZ * 12.0;
                        let targetX = (Math.random() - 0.5) * 10;
                        _v1.set(targetX, 0, targetZ);
                        _v2.subVectors(_v1, Match.ball.position).normalize();
                        Match.ballVel.copy(_v2).multiplyScalar(19.0);
                        Match.ballVel.y = 7.5;
                        Match.state = 'PLAY';
                        Match.ballCarrier = null;
                        Match.possessionTeam = p.team;
                        Match.possessionTimer = 0;
                        Match.lastTouchedTeam = p.team;
                        Match.lastTouchedPlayer = p;
                        Match.players.forEach(pl => {
                            if (pl.fsm.currentState === 'SET_PIECE_WAIT' || pl.fsm.currentState === 'SET_PIECE_TAKER') {
                                pl.fsm.changeState('MOVE_TO_POS');
                            }
                        });
                        Match.opponents.forEach(pl => {
                            if (pl.fsm.currentState === 'SET_PIECE_WAIT' || pl.fsm.currentState === 'SET_PIECE_TAKER') {
                                pl.fsm.changeState('MOVE_TO_POS');
                            }
                        });
                    }
                }
                break;
            case 'IDLE':
                p.velocity.set(0, 0, 0);
                break;
            case 'MOVE_TO_POS':
                p.velocity = p.steerArrive(p.dynamicTarget, p.speedMult);
                break;
            /*
            MARKING / BLOCKING / FWR_SUPPORT / AFT_SUPPORT — mesma locomoção
            do MOVE_TO_POS (o alvo já vem calculado do nível 2: marcar(),
            cobertura ou posicionamento de apoio). Estados próprios só para
            aparecerem como tal no debug/labels — antes tudo isto ficava
            disfarçado de "MOVE_TO_POS" e parecia que só 3 estados existiam.
            FWR_SUPPORT/AFT_SUPPORT distinguem o apoio à frente da bola do
            apoio atrás (opção de recuo) — ver actHoldPosition.
            */
            case 'MARKING':
            case 'BLOCKING':
            case 'FWR_SUPPORT':
            case 'AFT_SUPPORT':
            // INTERCEPT: mesma locomoção, estado próprio só para aparecer como
            // tal no debug. O alvo é o ponto de interceptação calculado pela
            // percepção (ver actIntercept), não a posição actual da bola.
            case 'INTERCEPT':
                p.velocity = p.steerArrive(p.dynamicTarget, p.speedMult);
                break;
            /* =============================================================
               CARRY — Condução: carregar a bola com toques à frente.
               O jogador solta a bola num toque curto/médio/longo conforme
               o espaço e corre atrás dela. Não tem a bola grudada ao pé.
               ============================================================= */
            case 'CARRY':
                if (p.pos === 'LB' || p.pos === 'RB') {
                    p.carryTargetX = p.baseTarget.x * 1.05;
                } else if (!p.carryTargetX || chancePorSegundo(1.2, dt)) {
                    p.carryTargetX = Tatics.getWeightedSectorX(p.dirZ);
                }

                // Escolhe a melhor direcção de condução (leque de ângulos)
                {
                    const oppsCond = (p.team === 'TeamA') ? Match.opponents : Match.players;
                    const px = p.model.position.x, pz = p.model.position.z;
                    let melhorNota = -Infinity;
                    let alvoX = p.carryTargetX, alvoZ = pz + 10 * p.dirZ;

                    // Ponto mais avançado que vale a pena mirar: a faixa junto
                    // à linha de fundo está fora, senão ele corre contra a
                    // linha sem nunca poder adiantar a bola.
                    const avancoMax = CAMPO_COMP / 2 - CarryModel.margemLinhaFundo;

                    for (const ang of CarryModel.leque) {
                        const tx = px + Math.sin(ang) * CarryModel.lookAhead;
                        let tz = pz + Math.cos(ang) * p.dirZ * CarryModel.lookAhead;
                        if (tz * p.dirZ > avancoMax) tz = avancoMax * p.dirZ;
                        if (Math.abs(tx) > 31 || Math.abs(tz) > 51) continue;

                        let maisPerto = 999;
                        for (const opp of oppsCond) {
                            if (opp.role === 'gk') continue;
                            const d = Math.hypot(opp.model.position.x - tx, opp.model.position.z - tz);
                            if (d < maisPerto) maisPerto = d;
                        }

                        let nota = Math.min(maisPerto, CarryModel.spaceCap) * CarryModel.spaceWeight;
                        nota += (tz - pz) * p.dirZ * CarryModel.progressWeight;
                        nota -= Math.abs(tx - p.carryTargetX) * CarryModel.sectorWeight;

                        if (nota > melhorNota) { melhorNota = nota; alvoX = tx; alvoZ = tz; }
                    }

                    p.dynamicTarget.set(alvoX, ALTURA_BASE_Y, alvoZ);
                }

                if (p.role === 'gk') {
                    p.dynamicTarget.z = Math.max(-53, Math.min(-38, p.dynamicTarget.z));
                    p.dynamicTarget.x = Math.max(-18, Math.min(18, p.dynamicTarget.x));
                    if (p.model.position.z >= -39) {
                        let clearTarget = p.findPassTarget();
                        if (clearTarget) p.initiatePass(clearTarget);
                    }
                }
                p.velocity = p.steerArrive(p.dynamicTarget, p.speedMult * 0.85);

                /*
                Toques de condução — soltar a bola à frente e correr atrás.
                Perto da linha de fundo não se adianta nada: o toque punha a
                bola fora e dava pontapé de baliza ao adversário. Continua a
                correr, mas com a bola no pé (ver pertoDaLinhaDeFundo).
                */
                if (p.hasBall && p.velocity.lengthSq() > 2.0 && this.timer > CarryModel.touchCooldown
                    && !pertoDaLinhaDeFundo(p)) {
                    let forward = p.velocity.clone().normalize();
                    let allOpps = (p.team === 'TeamA') ? Match.opponents : Match.players;

                    // Encontrar adversário mais perto no cone frontal
                    let nearestOppDist = 999;
                    let nearestOpp = null;
                    for (let opp of allOpps) {
                        if (opp.role === 'gk') continue;
                        let dist = p.model.position.distanceTo(opp.model.position);
                        let dirToOpp = new THREE.Vector3().subVectors(opp.model.position, p.model.position).normalize();
                        let dotFwd = dirToOpp.dot(forward);
                        if (dotFwd > 0.2 && dist < nearestOppDist) {
                            nearestOppDist = dist;
                            nearestOpp = opp;
                        }
                    }

                    // Toque = velocidade actual do jogador + impulso extra à frente.
                    // O impulso é calibrado em passadas (getGaitPose/misturarAndamento)
                    // para a bola cair 1-2 passadas à frente do próximo apoio, não em
                    // metros fixos — mas é SOMADO à velocidade, não a distância a dividir
                    // por tempo (isso dava velocidades absurdas: 8-9m / 0.4s).
                    const passada = misturarAndamento(p.velocity.length()).passada;
                    let touchPow;
                    if (nearestOppDist > 15) {
                        // Campo aberto: toque longo, ~1.5 passo de impulso
                        touchPow = p.velocity.length() + passada * 1.5;
                    } else if (nearestOppDist > 8) {
                        // Espaço razoável: ~1.1 passo de impulso
                        touchPow = p.velocity.length() + passada * 1.125;
                    } else if (nearestOppDist > DribbleModel.triggerDist) {
                        // Adversário a aproximar-se: ~0.75 passo, toque curto
                        touchPow = p.velocity.length() + passada * 0.75;
                    } else {
                        // Adversário muito perto — transição para DRIBBLE 1v1
                        if (nearestOpp && nearestOppDist > 1.5) {
                            p.dribbleOpponent = nearestOpp;
                            p.dribbleCooldownTimer = 0;
                            if (typeof MatchStats !== 'undefined') MatchStats[p.team].dribles.tentados++;
                            this.changeState('DRIBBLE');
                        }
                        break;
                    }

                    // Só solta a bola quando a perna de balanço está à frente do
                    // corpo (janela de toque da passada) — senão o toque sai com
                    // a perna atrás e parece que a bola volta para o jogador.
                    // Espera no máximo CarryModel.touchMaxWait antes de forçar.
                    if (!p.emJanelaDeToque() && p.touchWaitTimer < CarryModel.touchMaxWait) {
                        p.touchWaitTimer += dt;
                        break;
                    }
                    p.touchWaitTimer = 0;

                    // Executar o toque à frente. touchLock curto (0.10) deixava o
                    // próprio jogador readquirir a bola quase no frame seguinte —
                    // ela nunca ganhava distância real, só vibrava para a frente e
                    // para trás ("elástico"). Mesmo valor usado no passe/tackle.
                    p.hasBall = false;
                    p.touchLock = BallControl.touchLock;
                    // Cobre o hiato até o próprio jogador recuperar o toque — evita
                    // que decisionTimer zere e reactive o "Dominar" a meio da corrida.
                    p.carryTouchGrace = BallControl.touchLock + 0.15;
                    Match.ballCarrier = null;
                    Match.ballVel.copy(forward).multiplyScalar(touchPow);
                    Match.ballVel.y = 0;
                    // Empurrão extra fixo, à parte da velocidade — a bola cai
                    // uns 0.5m mais à frente do jogador logo no toque, e não
                    // só depende do quanto ela desliza depois pela física.
                    Match.ball.position.add(forward.clone().multiplyScalar(0.5));
                    Match.lastTouchedTeam = p.team;
                    Match.lastTouchedPlayer = p;
                    window.bolaChutada = false;
                    this.timer = 0;
                }
                break;

            /* =============================================================
               DRIBBLE — Drible 1v1: ultrapassar um adversário directo.
               Detecta de que lado o defensor vem e toca a bola para o lado
               oposto (~35°). Se tentar ir reto, probabilidade de perda
               é muito maior.
               ============================================================= */
            case 'DRIBBLE':
                {
                    const opp = p.dribbleOpponent;
                    // Se perdeu a bola ou o adversário desapareceu, volta a CARRY
                    if (!p.hasBall || !opp) {
                        this.changeState('CARRY');
                        break;
                    }

                    let forward = p.velocity.lengthSq() > 0.1
                        ? p.velocity.clone().normalize()
                        : new THREE.Vector3(0, 0, p.dirZ);

                    // Calcular de que lado o adversário está
                    let toOpp = new THREE.Vector3().subVectors(opp.model.position, p.model.position);
                    toOpp.y = 0;
                    // Produto cruzado: positivo = adversário à direita, negativo = à esquerda
                    let cross = forward.x * toOpp.z - forward.z * toOpp.x;
                    // Ir para o lado OPOSTO ao adversário
                    let escapeSide = (cross >= 0) ? -1 : 1;

                    // Toque lateral (30-45°) para o lado oposto
                    let angle = DribbleModel.angleSide * escapeSide;
                    let cosA = Math.cos(angle), sinA = Math.sin(angle);
                    let pushDir = new THREE.Vector3(
                        forward.x * cosA - forward.z * sinA,
                        0,
                        forward.x * sinA + forward.z * cosA
                    ).normalize();

                    // Chance de sucesso: ir para o lado dá bónus
                    let successChance = DribbleModel.successBase + DribbleModel.successSideBonus;
                    // Skill do jogador modifica (+10% para skill > 70, -10% para skill < 40)
                    let skill = p.skillFor ? p.skillFor('TEC') : 50;
                    successChance += (skill - 50) * 0.003;

                    if (Math.random() < successChance) {
                        /*
                        SUCESSO — em vez de um empurrão único e volta imediata
                        ao CARRY, entra no gesto DRIBBLE_CUT_30: o corte de 30°
                        acontece ao longo de ~0.75 s, com dois toques laterais
                        curtos e o corpo a rodar gradualmente (ver DribbleCutClip).
                        */
                        if (typeof MatchStats !== 'undefined') MatchStats[p.team].dribles.sucesso++;
                        p.speedMult = DribbleModel.sprintBoost;
                        window.bolaChutada = false;

                        p.cutAtivo = true;
                        p.cutNorm = 0;
                        p.cutTimer = 0;
                        p.cutToquesFeitos = 0;
                        p.cutLado = escapeSide;
                        p.cutDirIni = forward.clone();
                        p.cutVel = Math.max(4.0, p.velocity.length());
                        this.changeState('CUT');
                        break;
                    } else {
                        // FALHOU — bola fica solta, adversário pode roubar
                        p.hasBall = false;
                        p.touchLock = 0.5;
                        Match.ballCarrier = null;
                        // Bola para frente fraca, fácil para o defensor
                        Match.ballVel.copy(forward).multiplyScalar(3.0 + Math.random() * 3.0);
                        Match.ballVel.y = 0;
                        Match.lastTouchedTeam = p.team;
                        Match.lastTouchedPlayer = p;
                        window.bolaChutada = false;
                    }

                    // Volta a CARRY após o toque (o BT decidirá o próximo passo)
                    this.changeState('CARRY');
                }
                break;

            /* =============================================================
               CUT — DRIBBLE_CUT_30: corte lateral em diagonal de 30°.

               O deslocamento roda gradualmente da direcção inicial até aos
               30°, com dois toques laterais curtos pelo caminho. A pose
               (inclinação, quadril, perna externa) é a camada aditiva
               aplicada em player.aplicarCamadaCorte() — aqui só vive o
               movimento e os toques na bola.
               ============================================================= */
            case 'CUT':
                {
                    const K = DribbleCutClip;
                    p.cutTimer += dt;
                    const norm = Math.min(1, p.cutTimer / K.duracao);
                    p.cutNorm = norm;

                    /*
                    Suavização em S (smoothstep): o jogador não roda os 30° de
                    uma vez. Arranca devagar, gira mais depressa a meio do
                    gesto (frames 5-8) e assenta na nova direcção no fim.
                    */
                    const s = norm * norm * (3 - 2 * norm);
                    const dir = p.cutDirIni.clone().applyAxisAngle(_vUp, K.angulo * p.cutLado * s);

                    // Perde um pouco de velocidade no plantar do pé e recupera
                    // no fim (frames 3-6 travam, 10-12 aceleram outra vez).
                    const fatorVel = 0.78 + 0.22 * Math.abs(2 * norm - 1);
                    p.velocity.copy(dir).multiplyScalar(p.cutVel * fatorVel);

                    // Toques laterais alternados nos frames 6 e 9.
                    const toque = K.toques[p.cutToquesFeitos];
                    if (p.hasBall && toque !== undefined && norm >= toque && !pertoDaLinhaDeFundo(p)) {
                        p.cutToquesFeitos++;
                        const passada = misturarAndamento(p.velocity.length()).passada;
                        // Alterna a abertura do toque: o primeiro leva a bola
                        // mais para fora, o segundo já a alinha com a corrida.
                        const abertura = (p.cutToquesFeitos === 1) ? 0.55 : 0.20;
                        const dirToque = dir.clone()
                            .applyAxisAngle(_vUp, K.angulo * p.cutLado * abertura)
                            .normalize();

                        p.hasBall = false;
                        p.touchLock = BallControl.touchLock;
                        p.carryTouchGrace = BallControl.touchLock + 0.15;
                        Match.ballCarrier = null;
                        Match.ballVel.copy(dirToque).multiplyScalar(p.velocity.length() + passada * K.forcaToque);
                        Match.ballVel.y = 0;
                        Match.lastTouchedTeam = p.team;
                        Match.lastTouchedPlayer = p;
                        window.bolaChutada = false;
                    }

                    if (norm >= 1) {
                        p.cutAtivo = false;
                        p.dribbleOpponent = null;
                        this.changeState('CARRY');
                    }
                }
                break;

            /* =============================================================
               CHEST_CONTROL — matar no peito.

               A bola já foi colocada por controlarNoPeito() (player.js); o
               que vive aqui é só o gesto: trava, inclina a cintura para trás
               para a bola bater no peito, e volta ao normal.
               ============================================================= */
            case 'CHEST_CONTROL':
                {
                    p.peitoTimer = (p.peitoTimer || 0) + dt;
                    const nP = Math.min(1, p.peitoTimer / BallControl.peitoDur);
                    p.velocity.multiplyScalar(0.75);

                    /*
                    Inclina depressa e desfaz devagar: a bola bate no peito no
                    início do gesto, não no fim. `sin(π·n)` daria o pico a
                    meio — tarde de mais.
                    */
                    const intens = (nP < 0.3) ? (nP / 0.3) : (1 - (nP - 0.3) / 0.7);
                    rig.pelvis.rotation.x = lerpTo(rig.pelvis.rotation.x,
                        BallControl.peitoInclinacao * intens, 0.35);
                    rig.chest.rotation.x = lerpTo(rig.chest.rotation.x,
                        BallControl.peitoInclinacao * 0.6 * intens, 0.35);
                    // Braços abrem um pouco para equilibrar o tronco atrás.
                    rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, 0.5 * intens, 0.3);
                    rig.rArm.rotation.z = lerpTo(rig.rArm.rotation.z, -0.5 * intens, 0.3);

                    if (nP >= 1) {
                        rig.pelvis.rotation.x = 0;
                        this.changeState('IDLE');
                    }
                }
                break;

            case 'PASS':
                p.velocity.multiplyScalar(0.85);
                if (p.passTarget) {
                    let targetPos = p.passTarget.model.position;
                    _v1.set(p.model.position.x * 2 - targetPos.x, p.model.position.y, p.model.position.z * 2 - targetPos.z);
                    _m1.lookAt(p.model.position, _v1, p.model.up);
                    _q1.setFromRotationMatrix(_m1);
                    p.model.quaternion.slerp(_q1, Math.min(1.0, 25.0 * dt));
                }

                {
                    // p.actionState foi criado em initiatePass() (player.js) e já
                    // sabe o contactTime do clip 'pass' — este case só lê o tempo
                    // normalizado para posar o rig; o efeito real (bola sai do pé)
                    // dispara dentro do próprio ActionState, via onContact.
                    const norm = p.actionState.update(dt, p);
                    if (norm < p.actionState.contactTime) {
                        rig.pelvis.rotation.z = lerpTo(rig.pelvis.rotation.z, 0.1, 0.25);
                        rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, 0.2, 0.25);
                        rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, 0.8, 0.3);
                        rig.lArm.rotation.x = lerpTo(rig.lArm.rotation.x, -0.3, 0.3);
                        rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, Math.PI / 6.0, 0.25);
                        rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, Math.PI / 4.0, 0.25);
                    } else {
                        rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, -Math.PI / 6.0, 0.3);
                        rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, 0, 0.3);
                    }

                    if (p.actionState.isDone()) {
                        p.actionState = null;
                        this.changeState('IDLE');
                    }
                }
                break;

            case 'TACKLE':
                p.velocity.multiplyScalar(0.95);
                let tTackle = this.timer / 0.8;
                if (tTackle < 0.2) {
                    rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, 0.8, 0.3);
                    p.model.position.y = lerpTo(p.model.position.y, ALTURA_BASE_Y - 0.4, 0.3);
                    rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, -Math.PI / 2.5, 0.3);
                    rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, Math.PI / 4, 0.3);
                } else if (tTackle < 0.8) {
                    if (p.hasBall === false && Match.ballCarrier && Match.ballCarrier.team !== p.team && Match.ballCarrier.role !== 'gk') {
                        let distToBall = Match.ball.position.distanceTo(p.model.position);
                        if (distToBall < 1.4 && !p.tackleResolvido) {
                            p.tackleResolvido = true;
                            const carrier = Match.ballCarrier;
                            /*
                            Desarme de pé é físico — carga de ombro: Velocidade
                            x Força de cada lado (média dos dois skills),
                            não Técnica. Base 0.5: disputa justa a skills
                            iguais.
                            */
                            const forcaDef = (p.skillFor('SPEED') + p.skillFor('STRENGTH')) / 2;
                            const forcaAtk = (carrier.skillFor('SPEED') + carrier.skillFor('STRENGTH')) / 2;
                            if (venceuDuelo(forcaDef, forcaAtk, 0.5)) {
                                carrier.hasBall = false;
                                carrier.touchLock = BallControl.touchLock;
                                Match.ballCarrier = null;
                                Match.ballVel.x = (Math.random() - 0.5) * 15;
                                Match.ballVel.z = p.dirZ * 15;
                                Match.ballVel.y = 2.0;
                                Match.lastTouchedTeam = p.team;
                                Match.lastTouchedPlayer = p;
                                if (typeof MatchStats !== 'undefined') MatchStats[p.team].desarmes.sucesso++;
                            }
                        }
                    }
                } else {
                    p.model.position.y = ALTURA_BASE_Y;
                    this.changeState('MOVE_TO_POS');
                }
                break;

            case 'SLIDE_TACKLE':
                {
                    const S = SlideTackleModel;
                    const tSlide = this.timer;

                    // Desliza; a velocidade cai a zero no fim da fase de deslize.
                    // Depois disso fica caido, sem se arrastar pelo relvado.
                    _v2.set(0, 0, 1).applyQuaternion(p.model.quaternion).normalize();
                    if (tSlide < S.deslize) {
                        p.velocity.copy(_v2).multiplyScalar(S.velocidade * Math.max(0, 1.0 - tSlide / S.deslize));
                    } else {
                        p.velocity.multiplyScalar(0.8);
                    }

                    // Intensidade da pose: entra no lancamento, sai no levantar.
                    let intens = 1.0;
                    if (tSlide < S.lancamento) {
                        intens = tSlide / S.lancamento;
                    } else if (tSlide > S.paragem) {
                        intens = Math.max(0, 1.0 - (tSlide - S.paragem) / (S.levantar - S.paragem));
                    }

                    this.applySlidePose(intens);

                    // Toque na bola: uma unica vez por carrinho.
                    if (!p.slideTouched && !p.hasBall &&
                        tSlide > S.janelaToqueIni && tSlide < S.janelaToqueFim &&
                        Match.ball.position.distanceTo(p.model.position) < S.alcanceToque) {
                        p.slideTouched = true;

                        const carrierSlide = Match.ballCarrier;
                        const alvoValido = carrierSlide && carrierSlide.team !== p.team && carrierSlide.role !== 'gk';
                        /*
                        Carrinho é Técnica (drible do portador) x Marcação (do
                        defensor) — quem lê melhor o corpo do outro. Base 0.45:
                        um carrinho é um lance arriscado, o portador começa
                        ligeiramente favorito mesmo a skills iguais.
                        */
                        const venceu = alvoValido && venceuDuelo(p.skillFor('MARKING'), carrierSlide.skillFor('TEC'), 0.45);

                        if (venceu) {
                            carrierSlide.hasBall = false;
                            carrierSlide.touchLock = BallControl.touchLock;
                            Match.ballCarrier = null;
                            if (typeof MatchStats !== 'undefined') MatchStats[p.team].carrinhos.sucesso++;
                        }

                        if (venceu || !alvoValido) {
                            // A bola sai na direccao do toque (para onde o pe ia)
                            // com forca para percorrer `empurraoBola` metros.
                            _v1.copy(_v2);
                            _v1.x += (Math.random() - 0.5) * 0.35;
                            _v1.y = 0;
                            _v1.normalize();
                            /*
                            `forceForDistance` (1.68) vinha do modelo de
                            arrasto antigo. Com a física real a bola percorria
                            muito mais do que os `empurraoBola` metros
                            pretendidos — pede-se agora a velocidade que a põe
                            a parar ali.
                            */
                            const vEmp = velocidadeRasteiraPara(S.empurraoBola, 0);
                            Match.ballVel.copy(_v1).multiplyScalar(vEmp);
                            Match.ballVel.y = S.alturaBola;
                            Match.intendedReceiver = null;
                            Match.lastTouchedTeam = p.team;
                            Match.lastTouchedPlayer = p;
                            window.bolaChutada = false;
                        }
                        // Perdeu o duelo: o portador passa por cima do carrinho
                        // e segue com a bola, sem ela ser tocada.

                        // Esta no chao: nao pode ser ele a recolher a bola.
                        p.touchLock = S.bloqueioAposToque;
                    }

                    if (tSlide >= S.levantar) {
                        p.model.position.y = ALTURA_BASE_Y;
                        this.changeState('MOVE_TO_POS');
                    }
                }
                break;

            case 'SHOOT':
                p.velocity.multiplyScalar(0.85);
                {
                    _v1.set(0, 0, p.targetGoalZ);
                    _v2.set(p.model.position.x * 2 - _v1.x, p.model.position.y, p.model.position.z * 2 - _v1.z);
                    _m1.lookAt(p.model.position, _v2, p.model.up);
                    _q1.setFromRotationMatrix(_m1);
                    p.model.quaternion.slerp(_q1, Math.min(1.0, 15.0 * dt));
                }

                if (this.timer < 0.08) {
                    rig.pelvis.rotation.z = lerpTo(rig.pelvis.rotation.z, 0.2, 0.25); rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, 0.4, 0.25);
                    rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, 1.2, 0.3); rig.lArm.rotation.x = lerpTo(rig.lArm.rotation.x, -0.5, 0.3);
                    rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, Math.PI / 3.5, 0.25); rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, Math.PI / 2.0, 0.25);
                } else {
                    rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, -Math.PI / 4, 0.3); rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, 0, 0.3);
                    if (p.hasBall) {
                        const opponentsShoot = (p.team === 'TeamA') ? Match.opponents : Match.players;
                        let bloqueador = null, distBloqueio = 999;
                        for (const opp of opponentsShoot) {
                            if (opp.role === 'gk') continue;
                            const d = opp.model.position.distanceTo(p.model.position);
                            if (d < 2.2 && d < distBloqueio) { distBloqueio = d; bloqueador = opp; }
                        }
                        // Bloqueado: Técnica (chutador) x Marcação (quem está em cima
                        // dele) — base 0.6, favorece o chutador (defensor tem de
                        // acertar o corte no timing certo).
                        const bloqueado = bloqueador && !venceuDuelo(p.skillFor('TEC'), bloqueador.skillFor('MARKING'), 0.6);

                        let maxC = (LARGURA_BALIZA / 2) - 0.5;
                        let pow, alvoX, alvoY;

                        if (bloqueado) {
                            // Bola desviada, curta e fraca — não mira a baliza.
                            pow = 5.0 + Math.random() * 3.0;
                            alvoX = p.model.position.x + (Math.random() - 0.5) * 4.0;
                            alvoY = 0.3;
                        } else {
                            const gkDef = (p.team === 'TeamA') ? Match.opponents[0] : Match.players[0];
                            // Na baliza: Técnica (chutador) x GK — vencer põe a bola
                            // perto do poste (ângulo difícil); perder deixa mais central.
                            const venceuGK = gkDef ? venceuDuelo(p.skillFor('TEC'), gkDef.skillFor('GK'), 0.5) : true;
                            const cantoC = venceuGK ? maxC * 0.9 : maxC * 0.5;
                            pow = 22.0 + ((p.skillFor('TEC') - 50) / 50) * 16.0;
                            alvoX = (Math.random() > 0.5 ? 1 : -1) * cantoC;
                            alvoY = Math.random() > 0.5 ? 2.0 : 0.4;
                        }

                        /*
                        Mira: resolve a ELEVAÇÃO que põe a bola no ponto
                        visado à velocidade `pow` (ver elevacaoParaAlvo).

                        A conta antiga compensava a gravidade com
                        `t = dZ / pow; cY = ½·g·t²` — usava a velocidade 3D
                        como se fosse horizontal e ignorava o arrasto (12-22
                        m/s² a esta velocidade), por isso subestimava o tempo
                        de voo duas vezes e o remate saía sempre por baixo.
                        */
                        _v1.set(alvoX, alvoY, bloqueado ? Match.ball.position.z + p.dirZ * 3 : p.targetGoalZ);
                        const dxR = _v1.x - Match.ball.position.x;
                        const dzR = _v1.z - Match.ball.position.z;
                        const distHR = Math.hypot(dxR, dzR);
                        const elevR = elevacaoParaAlvo(distHR, _v1.y, pow);
                        // Sem solução (longe demais para esta potência): sai no
                        // ângulo de alcance máximo em vez de rasteiro ao chão.
                        const eR = (elevR === null) ? Math.PI / 5 : elevR;
                        const vhR = pow * Math.cos(eR);
                        Match.ballVel.set(
                            (distHR > 0.001 ? dxR / distHR : 0) * vhR,
                            pow * Math.sin(eR),
                            (distHR > 0.001 ? dzR / distHR : p.dirZ) * vhR
                        );
                        p.hasBall = false; p.touchLock = BallControl.touchLock;
                        Match.ballCarrier = null;
                        Match.lastTouchedTeam = p.team;
                        Match.lastTouchedPlayer = p;

                        if (!bloqueado) {
                            let defendingTeam = (p.team === 'TeamA') ? 'TeamB' : 'TeamA';
                            // Notifica o GK adversário via propriedade de instância.
                            const gkDef = (p.team === 'TeamA') ? Match.opponents[0] : Match.players[0];
                            if (gkDef) {
                                gkDef.gkDelayReacao = 0.45 - ((TeamSkills[defendingTeam].gk - 50) / 50) * 0.35;
                                gkDef.gkReagiu = false;
                            }
                            window.bolaChutada = true;
                        }
                    }
                }
                if (this.timer >= 0.2) {
                    this.changeState('IDLE');
                }
                break;
        }
    }
}

