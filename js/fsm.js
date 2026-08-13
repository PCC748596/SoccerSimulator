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
    if (p.isThroughBall && p.throughBallTarget) {
        p.isThroughBall = false;
        p.throughBallTarget = null;
        ehLancamento = true;
    }
    // Capturado antes de p.isCross ser limpo mais abaixo.
    const tipoPasseStats = ehLancamento ? 'lancamento' : (p.isCross ? 'cruzamento' : 'passe');

    _v1.copy(p.passTargetPos);

    let distToTarget = _v1.distanceTo(Match.ball.position);
    _v2.subVectors(_v1, Match.ball.position).normalize();

    let forcaPasse = 18.0;
    if (ehLancamento) {
        forcaPasse = distToTarget * PassModel.forceForDistance * 0.55;
        Match.ballVel.y = 0;
    } else if (p.isCross) {
        forcaPasse = Math.max(8.0, distToTarget * 0.95);
        Match.ballVel.y = 6.8;
        p.isCross = false;
    } else if (Tatics.passe === 'longo' || distToTarget > 22.0) {
        forcaPasse = Math.max(7.5, distToTarget * 0.85);
        Match.ballVel.y = Math.min(6.5, 2.0 + distToTarget * 0.12);
    } else if (distToTarget <= 35) {
        forcaPasse = Math.max(7.0, distToTarget * 0.85);
        Match.ballVel.y = 0;
    } else if (distToTarget >= 55) {
        forcaPasse = Math.max(8.5, distToTarget * 0.85);
        Match.ballVel.y = 6.2;
    } else {
        forcaPasse = Math.max(7.5, distToTarget * 0.85);
        Match.ballVel.y = 2.5;
    }

    let passBoost = 1.0 + ((TeamSkills[p.team].mid - 50) / 100) * 0.4;
    forcaPasse *= passBoost;
    forcaPasse *= 1.02;

    Match.ballVel.copy(_v2).multiplyScalar(forcaPasse);
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
        this.currentState = newState; this.timer = 0;

        if (newState === 'SLIDE_TACKLE') this.enterSlideTackle();
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
                    } else if (Match.state === 'GOAL_KICK') {
                        let targetZ = p.model.position.z + p.dirZ * 60.0;
                        let targetX = (Math.random() - 0.5) * 20;
                        _v1.set(targetX, 0, targetZ);
                        _v2.subVectors(_v1, Match.ball.position).normalize();
                        Match.ballVel.copy(_v2).multiplyScalar(22.0);
                        Match.ballVel.y = 8.5;
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

                    for (const ang of CarryModel.leque) {
                        const tx = px + Math.sin(ang) * CarryModel.lookAhead;
                        const tz = pz + Math.cos(ang) * p.dirZ * CarryModel.lookAhead;
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

                // Toques de condução — soltar a bola à frente e correr atrás
                if (p.hasBall && p.velocity.lengthSq() > 2.0 && this.timer > CarryModel.touchCooldown) {
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
                    let skill = p.getSkill ? p.getSkill() : 50;
                    successChance += (skill - 50) * 0.003;

                    if (Math.random() < successChance) {
                        // SUCESSO — toca a bola para o lado e sprinta
                        if (typeof MatchStats !== 'undefined') MatchStats[p.team].dribles.sucesso++;
                        p.hasBall = false;
                        p.touchLock = 0.15;
                        p.carryTouchGrace = 0.15 + 0.15;
                        Match.ballCarrier = null;
                        Match.ballVel.copy(pushDir).multiplyScalar(DribbleModel.touchPower);
                        Match.ballVel.y = 0.3;
                        Match.lastTouchedTeam = p.team;
                        Match.lastTouchedPlayer = p;
                        p.speedMult = DribbleModel.sprintBoost;
                        window.bolaChutada = false;
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
                    if (p.hasBall === false && Match.ballCarrier && Match.ballCarrier.team !== p.team) {
                        let distToBall = Match.ball.position.distanceTo(p.model.position);
                        if (distToBall < 1.4) {
                            Match.ballCarrier.hasBall = false;
                            Match.ballCarrier.touchLock = BallControl.touchLock;
                            Match.ballCarrier = null;
                            Match.ballVel.x = (Math.random() - 0.5) * 15;
                            Match.ballVel.z = p.dirZ * 15;
                            Match.ballVel.y = 2.0;
                            Match.lastTouchedTeam = p.team;
                            Match.lastTouchedPlayer = p;
                            if (typeof MatchStats !== 'undefined') MatchStats[p.team].desarmes.sucesso++;
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

                        if (Match.ballCarrier && Match.ballCarrier.team !== p.team) {
                            Match.ballCarrier.hasBall = false;
                            Match.ballCarrier.touchLock = BallControl.touchLock;
                            Match.ballCarrier = null;
                            if (typeof MatchStats !== 'undefined') MatchStats[p.team].carrinhos.sucesso++;
                        }

                        // A bola sai na direccao do toque (para onde o pe ia) com
                        // forca para percorrer `empurraoBola` metros.
                        _v1.copy(_v2);
                        _v1.x += (Math.random() - 0.5) * 0.35;
                        _v1.y = 0;
                        _v1.normalize();
                        Match.ballVel.copy(_v1).multiplyScalar(S.empurraoBola * PassModel.forceForDistance);
                        Match.ballVel.y = S.alturaBola;

                        // Esta no chao: nao pode ser ele a recolher a bola.
                        p.touchLock = S.bloqueioAposToque;
                        Match.intendedReceiver = null;
                        Match.lastTouchedTeam = p.team;
                        Match.lastTouchedPlayer = p;
                        window.bolaChutada = false;
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
                        let maxC = (LARGURA_BALIZA / 2) - 0.5;
                        _v1.set((Math.random() > 0.5 ? 1 : -1) * maxC, Math.random() > 0.5 ? 2.0 : 0.4, p.targetGoalZ);
                        let dZ = Math.abs(p.targetGoalZ - Match.ball.position.z);

                        let pow = 22.0 + ((TeamSkills[p.team].ata - 50) / 50) * 16.0;
                        let tA = dZ / pow; let cY = 0.5 * 15.0 * tA * tA;
                        _v2.set(_v1.x, _v1.y + cY, p.targetGoalZ);
                        _v3.subVectors(_v2, Match.ball.position).normalize();
                        Match.ballVel.copy(_v3).multiplyScalar(pow);
                        p.hasBall = false; p.touchLock = BallControl.touchLock;
                        Match.ballCarrier = null;
                        Match.lastTouchedTeam = p.team;
                        Match.lastTouchedPlayer = p;

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
                if (this.timer >= 0.2) {
                    this.changeState('IDLE');
                }
                break;
        }
    }
}

