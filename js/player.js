class FootballPlayer {
    constructor(id, color1, color2, team) {
        this.id = id; this.team = team; this.role = 'def';
        this.hasBall = false;
        this.corCamisa = color1;
        this.num = 1;
        this.pos = 'GK';

        this.dirZ = (this.team === 'TeamA') ? 1 : -1;
        this.targetGoalZ = 53 * this.dirZ;
        this.ownGoalZ = -53 * this.dirZ;

        const gerado = this.buildBody(color1, color2);
        this.model = gerado.corpo; this.rig = gerado.rig;

        this.baseTarget = new THREE.Vector3();
        this.dynamicTarget = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.speedMult = 3.5;

        this.fsm = new PlayerFSM(this);
        this.animTimer = 0;
        this.animPhase = 0;
        this.touchWaitTimer = 0;

        this.passTarget = null;
        this.dribbleTargetX = 0;
        this.carryTargetX = 0;
        this.dribbleOpponent = null;
        this.dribbleCooldownTimer = 0;
        this.isCross = false;
        this.isThroughBall = false;
        this.throughBallTarget = null;
        this.decisionTimer = 0;
        this.carryTouchGrace = 0;
        this.actionState = null;

        // Perception System (ver js/perception.js) — camada só de leitura para
        // o BT: percebe, não decide. Fase 1: só bola/interceptação/claim.
        // Estrutura completa (secção 13 do spec) já declarada para as fases
        // seguintes não precisarem de mexer aqui outra vez.
        this.blackboard = {
            ball: {
                visible: false, distance: Infinity, direction: { x: 0, z: 0 },
                velocity: { x: 0, z: 0 }, speed: 0, approaching: false, movingAway: false,
                controllable: false, interceptable: false, interceptionPoint: null,
                timeToIntercept: Infinity, confidence: 0,
                teammatePossession: false, opponentPossession: false
            },
            teammates: [], opponents: [],
            space: { spaceAhead: 0, spaceBehindDefense: 0, spaceLeft: 0, spaceRight: 0 },
            pressure: { level: 0, nearestOpponent: null },
            tactical: { attackingSpaceAvailable: false, passingLaneAvailable: false, supportAvailable: false },
            events: [], currentIntent: null
        };
        // Desfasa os jogadores para não recalcularem percepção todos no
        // mesmo frame (ver Perception.tick, ~15Hz por jogador).
        this.perceptionTimer = Math.random() * 0.07;
        // Segundos em que este jogador não pode tocar na bola (ver BallControl).
        this.touchLock = 0;

        this.markingTarget = null;
        this.isCovering = false;
        this.markCount = 0;

        // Estado interno do guarda-redes — por instância, não global.
        // Antes eram window.goleiroEstado etc., partilhados pelos dois GKs,
        // o que fazia um interferir com o estado do outro.
        this.gkEstado = 'idle';
        this.gkTempoMergulho = 0;
        this.gkDirMergulho = 0;
        this.gkTipoMergulho = 'baixo';
        this.gkReagiu = false;
        this.gkDelayReacao = 0;

        // Sprite para mostrar o PlayerNumber, PlayerBT e PlayerPOS acima da cabeça
        this.labelCanvas = document.createElement('canvas');
        this.labelCanvas.width = 1024;
        this.labelCanvas.height = 128;
        this.labelCtx = this.labelCanvas.getContext('2d');
        this.labelTex = new THREE.CanvasTexture(this.labelCanvas);
        this.labelMat = new THREE.SpriteMaterial({ map: this.labelTex, transparent: true, depthWrite: false });
        this.labelSprite = new THREE.Sprite(this.labelMat);
        // Parent is scaled down, we scale up sprite. Canvas is 1024x128 (8:1).
        this.labelSprite.scale.set(20, 2.5, 1);
        this.labelSprite.position.set(0, 8.5, 0); // Acima da cabeça (unscaled space)
        this.model.add(this.labelSprite);
        this.lastLabelText = '';
        this.labelSprite.visible = false;
    }

    getSkill() {
        if (this.role === 'def') return TeamSkills[this.team].def;
        if (this.role === 'mid') return TeamSkills[this.team].mid;
        if (this.role === 'atk') return TeamSkills[this.team].ata;
        return TeamSkills[this.team].gk;
    }

    resetBonesToDefault() {
        let rig = this.rig;
        if (!rig) return;
        rig.pelvis.rotation.set(0, 0, 0);
        rig.chest.rotation.set(0, 0, 0);
        
        rig.lArm.rotation.set(0, 0, Math.PI / 16);
        rig.rArm.rotation.set(0, 0, -Math.PI / 16);
        
        rig.lElbow.rotation.set(0, 0, 0);
        rig.rElbow.rotation.set(0, 0, 0);
        
        rig.lLeg.rotation.set(0, 0, Math.PI / 32);
        rig.rLeg.rotation.set(0, 0, -Math.PI / 32);
        
        rig.lKnee.rotation.set(0, 0, 0);
        rig.rKnee.rotation.set(0, 0, 0);
        
        rig.lFoot.rotation.set(0, Math.PI / 16, 0);
        rig.rFoot.rotation.set(0, -Math.PI / 16, 0);
        
        this.model.position.y = ALTURA_BASE_Y;
    }

    findPassTargetRelaxed() {
        let teammates = (this.team === 'TeamA') ? Match.players : Match.opponents;
        let ownZ = this.model.position.z;
        let dirZ = this.dirZ;

        // Mira o alvo do PositionBT, não a posição actual — ver alvoDePasse().
        let options = teammates.filter(p =>
            p.id !== this.id &&
            (alvoDePasse(p).z * dirZ > ownZ * dirZ - 15.0)
        );

        if (options.length === 0) return null;

        let safetyLimit = 1.2;
        let opponents = (this.team === 'TeamA') ? Match.opponents : Match.players;
        let ratedCandidates = [];

        for (let opt of options) {
            let optPos = alvoDePasse(opt);
            let dist = this.model.position.distanceTo(optPos);

            if (dist < 3.0 || dist > 50.0) continue;

            _line1.set(this.model.position, optPos);
            let minOppDist = 999;
            for (let i = 0; i < opponents.length; i++) {
                let opp = opponents[i];
                if (opp.role === 'gk') continue;
                _line1.closestPointToPoint(opp.model.position, true, _v1);
                let d = _v1.distanceTo(opp.model.position);
                if (d < minOppDist) {
                    minOppDist = d;
                }
            }

            if (minOppDist < safetyLimit) continue;

            let score = 100;
            score += minOppDist * 10; 

            let progression = (optPos.z - ownZ) * dirZ;
            if (progression > 0) {
                score += 20;
            }

            ratedCandidates.push({ player: opt, score: score });
        }

        if (ratedCandidates.length > 0) {
            ratedCandidates.sort((a, b) => b.score - a.score);
            return ratedCandidates[0].player;
        }

        return null;
    }

    /*
    Nível 3: o cérebro individual. A árvore vive em js/bt/player_bt.js — aqui
    fica só a porta de entrada, para o resto do código continuar a chamar
    player.runBehaviorTree() como sempre.
    */
    runBehaviorTree(dt = 1 / 60) {
        PlayerAI.tick(this, dt);
    }

    findPassTarget() {
        let teammates = (this.team === 'TeamA') ? Match.players : Match.opponents;
        let ownZ = this.model.position.z;
        let ownX = this.model.position.x;
        let dirZ = this.dirZ;

        // Mira o alvo do PositionBT, não a posição actual — ver alvoDePasse().
        let options = teammates.filter(p =>
            p.role !== 'gk' &&
            p.id !== this.id &&
            (alvoDePasse(p).z * dirZ > ownZ * dirZ - 15.0)
        );

        if (options.length === 0) return null;

        const getSectorOfX = (x) => {
            if (x < -10) return 'esq';
            if (x > 10) return 'dir';
            return 'cen';
        };

        let skillVal = this.getSkill();
        let safetyLimit = 1.7 + (1.0 - (skillVal / 100)) * 1.5; 

        let opponents = (this.team === 'TeamA') ? Match.opponents : Match.players;
        let ratedCandidates = [];

        for (let opt of options) {
            let optPos = alvoDePasse(opt);
            let dist = this.model.position.distanceTo(optPos);

            let inStyleRange = false;
            if (Tatics.passe === 'curto') {
                inStyleRange = (dist >= 3.0 && dist <= 28.0);
            } else if (Tatics.passe === 'longo') {
                inStyleRange = (dist >= 20.0 && dist <= 55.0);
            } else {
                inStyleRange = (dist >= 4.0 && dist <= 46.0);
            }
            if (!inStyleRange) continue;

            _line1.set(this.model.position, optPos);
            let minOppDist = 999;
            for (let i = 0; i < opponents.length; i++) {
                let opp = opponents[i];
                if (opp.role === 'gk') continue;
                _line1.closestPointToPoint(opp.model.position, true, _v1);
                let d = _v1.distanceTo(opp.model.position);
                if (d < minOppDist) {
                    minOppDist = d;
                }
            }

            if (minOppDist < safetyLimit) continue;

            let score = 100;

            score += Math.min(50, (minOppDist - safetyLimit) * 15);

            let optSec = getSectorOfX(optPos.x);
            if (Tatics.setores.includes(optSec)) {
                score += 30;
            }

            /*
            O bónus por progressão era fraco (tecto +15) comparado com o de
            estar livre de marcação (até +50, `minOppDist*15`) — um colega
            lateral bem livre ganhava quase sempre a um colega à frente só
            ligeiramente marcado. Medido na simulação em lote: só 13-23% do
            tempo de posse chegava ao terço atacante em 20 min simulados, a
            bola ficava presa a passar de lado no meio-campo (83-90% de
            acerto de passe, quase nenhum remate). Tecto subido para +35
            (total até +55), para um passe bem progressivo poder competir
            com um passe seguro em vez de perder sempre.
            */
            let progression = (optPos.z - ownZ) * dirZ;
            if (progression > 0) {
                score += 20 + Math.min(35, progression * 1.1);
            } else {
                score -= Math.abs(progression) * 1.0;
            }

            if (Tatics.passe === 'curto') {
                score += (28 - dist) * 1.5;
            } else if (Tatics.passe === 'longo') {
                score += dist * 1.2;
            } else {
                let midDiff = Math.abs(dist - 22.0);
                score += (22.0 - midDiff) * 0.8;
            }

            ratedCandidates.push({ player: opt, score: score });
        }

        if (ratedCandidates.length > 0) {
            ratedCandidates.sort((a, b) => b.score - a.score);
            return ratedCandidates[0].player;
        }

        return null;
    }

    /*
    Alcance de remate: cresce sempre com a skill do atacante e encolhe com o
    ângulo. Em frente à baliza vale o alcance todo; junto à linha lateral sobra
    a fracção `angleFloor`.
    */
    shootingRange() {
        const skill = TeamSkills[this.team].ata;
        const base = ShootingModel.baseRange + (skill / 100) * ShootingModel.skillRange;
        const centralidade = 1 - Math.min(1, Math.abs(this.model.position.x) / ShootingModel.maxOffsetX);
        const porFuncao = (this.role === 'def') ? ShootingModel.defenderFactor : 1.0;
        return base * porFuncao * (ShootingModel.angleFloor + (1 - ShootingModel.angleFloor) * centralidade);
    }

    initiatePass(targetPlayer) { 
        this.passTarget = targetPlayer;
        
        let _v1 = new THREE.Vector3();
        if (this.isThroughBall && this.throughBallTarget) {
            _v1.set(this.throughBallTarget.x, 0, this.throughBallTarget.z);
        } else {
            /*
            Mira o alvo do PositionBT (alvoDePasse), não a posição actual do
            colega. Simplificação deliberada — até ao PlayingStylesBT, é mais
            previsível mirar para onde a equipa QUER que ele esteja do que
            tentar antecipar o movimento actual dele.

            Em passes CURTOS isto chega: o tempo de voo é pequeno, o colega
            mal se mexe entretanto. Em passes LONGOS o voo dura bem mais de
            1s — sem lead a bola mira onde ele estava ao passe sair, e como
            ele continua a correr, chega atrás dele ("o jogador passa pela
            bola"). Adiciona lead pela velocidade actual do receptor,
            amortecido (0.6) porque é só uma estimativa — ele pode travar ou
            mudar de direcção durante o voo.
            */
            const alvo = alvoDePasse(this.passTarget);
            _v1.set(alvo.x, 0, alvo.z);

            const distEstimate = _v1.distanceTo(Match.ball.position);
            if (distEstimate > 22 && this.passTarget && this.passTarget.velocity) {
                const travelTime = distEstimate / 20; // velocidade média aprox. de um passe longo
                _v1.x += this.passTarget.velocity.x * travelTime * 0.6;
                _v1.z += this.passTarget.velocity.z * travelTime * 0.6;
            }
        }

        _v1.x = Math.max(-34 + 3.0, Math.min(34 - 3.0, _v1.x));
        _v1.z = Math.max(-53 + 3.0, Math.min(53 - 3.0, _v1.z));
        
        this.passTargetPos = _v1.clone();
        
        if (typeof Match !== 'undefined' && Match.passTargetVisual) {
            Match.passTargetVisual.position.set(_v1.x, 0.05, _v1.z);
            Match.passTargetVisual.visible = (window.teamBTPosState !== 'OFF' || window.positionBTToggleState !== 'OFF');
        }

        // Não executa o passe aqui — só prepara. O efeito real (bola sai do
        // pé) dispara dentro do ActionState, sincronizado com a pose do
        // chute (ver ActionAnimClips.pass e executePassGameplay em fsm.js).
        this.actionState = new ActionState('pass', {
            onContact: () => { if (this.hasBall && this.passTarget) executePassGameplay(this); }
        });
        this.fsm.changeState('PASS');
    }
    // Relançamento longo do GR quando não há opção curta: chuta por cima para a frente.
    puntBall() {
        const alvo = this.findPassTarget('atk') || this.findPassTarget('mid');
        _v1.set(alvo ? alvoDePasse(alvo).x : this.model.position.x * 0.4,
            0, this.ownGoalZ + 40 * this.dirZ);
        const dist = this.model.position.distanceTo(_v1);
        _v2.subVectors(_v1, this.model.position).normalize();
        const power = Math.max(20.0, dist * 1.05);
        Match.ballVel.copy(_v2).multiplyScalar(power);
        Match.ballVel.y = Math.min(9.0, 4.0 + dist * 0.08);
        this.hasBall = false;
        this.touchLock = BallControl.touchLock;
        Match.ballCarrier = null;
        Match.intendedReceiver = alvo || null;
        if (typeof MatchStats !== 'undefined') MatchStats.registarPasseIniciado(this.team, 'lancamento');
    }

    initiateShoot() {
        if (typeof MatchStats !== 'undefined') MatchStats[this.team].remates.tentados++;
        this.fsm.changeState('SHOOT');
    }

    executeHeader() {
        let distToGoal = Math.abs(this.targetGoalZ - this.model.position.z);
        let inShootingRange = (distToGoal < 24 && Math.abs(this.model.position.x) < 16);

        if (inShootingRange) {
            if (typeof MatchStats !== 'undefined') MatchStats[this.team].remates.tentados++;
            let maxC = (LARGURA_BALIZA / 2) - 0.5;
            let targetGoal = new THREE.Vector3((Math.random() > 0.5 ? 1 : -1) * maxC, Math.random() * 1.5 + 0.3, this.targetGoalZ);
            _v3.subVectors(targetGoal, Match.ball.position).normalize();
            let pow = 16.0 + ((TeamSkills[this.team].ata - 50) / 50) * 8.0;
            Match.ballVel.copy(_v3).multiplyScalar(pow);
            this.hasBall = false;
            this.touchLock = BallControl.touchLock;
            Match.ballCarrier = null;
            let defendingTeam = (this.team === 'TeamA') ? 'TeamB' : 'TeamA';
            // Notifica o GK adversário com o seu delay de reacção próprio.
            const gkAdversario = (this.team === 'TeamA') ? Match.opponents[0] : Match.players[0];
            if (gkAdversario) {
                gkAdversario.gkDelayReacao = 0.45 - ((TeamSkills[defendingTeam].gk - 50) / 50) * 0.35;
                gkAdversario.gkReagiu = false;
            }
            window.bolaChutada = true;
        } else {
            let target = this.findPassTarget('mid') || this.findPassTarget('atk') || this.findPassTarget('def');
            if (target) {
                let distToTarget = target.model.position.distanceTo(this.model.position);
                _v1.copy(target.model.position);
                _v2.subVectors(_v1, Match.ball.position).normalize();
                let power = Math.max(12.0, distToTarget * 1.3);
                Match.ballVel.copy(_v2).multiplyScalar(power);
                Match.ballVel.y = (Tatics.passe === 'longo' || distToTarget > 22.0) ? Math.min(6.5, 2.0 + distToTarget * 0.12) : 1.5;
                this.hasBall = false;
                this.touchLock = BallControl.touchLock;
                Match.ballCarrier = null;
                Match.intendedReceiver = target;
            }
        }
    }

    update(dt) {
        if (this.touchLock > 0) this.touchLock = Math.max(0, this.touchLock - dt);

        /*
        decisionTimer só reinicia numa posse NOVA (bola perdida para o
        adversário, ou primeira vez que a apanha) — não a cada toque de
        condução do CARRY. O toque solta hasBall por um instante
        (touchLock) e o próprio jogador recupera-a a seguir; sem esta
        graça, cada recuperação zerava o timer e reactivava o "Dominar"
        (~3s) no meio da corrida — domina/adianta, domina/adianta.
        */
        if (this.hasBall) {
            this.decisionTimer += dt;
            this.carryTouchGrace = 0;
        } else if (this.carryTouchGrace > 0) {
            this.carryTouchGrace -= dt;
            this.decisionTimer += dt;
        } else {
            this.decisionTimer = 0;
        }

        if (this.role === 'gk' && Match.state !== 'GOAL_KICK' && Match.state !== 'CORNER_KICK') {
            this.updateGK(dt);
        } else {
            this.runBehaviorTree(dt);
            this.fsm.update(dt);
            this.model.position.add(this.velocity.clone().multiplyScalar(dt));
        }

        if (this.hasBall) {
            let footOffset = new THREE.Vector3(0, 0, 0.4).applyQuaternion(this.model.quaternion);
            Match.ball.position.lerp(this.model.position.clone().add(footOffset), 0.5);
            Match.ball.position.y = 0.15; Match.ballVel.set(0, 0, 0);
        }
        if (this.role === 'gk' && Match.state !== 'GOAL_KICK' && Match.state !== 'CORNER_KICK') {
        } else {
            this.animateBones(dt);
        }

        // Atualização da UI flutuante (PlayerNumber, PlayerBT e PlayerPOS)
        if (window.showPlayerNumber || window.showPlayerBT || window.showPlayerPOS) {
            this.labelSprite.visible = true;
            let parts = [];
            if (window.showPlayerNumber) parts.push(this.num);
            if (window.showPlayerPOS) parts.push(this.pos);
            if (window.showPlayerBT) parts.push(this.fsm.currentState);
            let text = parts.join(" | ");

            if (text !== this.lastLabelText) {
                this.lastLabelText = text;
                this.labelCtx.clearRect(0, 0, 1024, 128);
                
                // Configura a fonte primeiro para medir corretamente
                this.labelCtx.font = 'bold 36px "Segoe UI"';
                this.labelCtx.textAlign = 'center';
                this.labelCtx.textBaseline = 'middle';
                
                let textWidth = this.labelCtx.measureText(text).width;
                let bgWidth = textWidth + 30; // 15px de padding para cada lado
                let bgHeight = 46; 
                let startX = 512 - (bgWidth / 2);
                let startY = 64 - (bgHeight / 2);

                // Caixa de fundo mais apertada
                this.labelCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                this.labelCtx.beginPath();
                this.labelCtx.roundRect ? this.labelCtx.roundRect(startX, startY, bgWidth, bgHeight, 10) : this.labelCtx.rect(startX, startY, bgWidth, bgHeight);
                this.labelCtx.fill();
                
                // Texto
                this.labelCtx.fillStyle = '#ffffff';
                this.labelCtx.fillText(text, 512, 64);
                this.labelTex.needsUpdate = true;
            }
        } else {
            this.labelSprite.visible = false;
            this.lastLabelText = '';
        }

        // Anel grande = Team BT POS (nível 1, slot puro, sem desvios).
        // Anel pequeno = Position BT (nível 2, já com os desvios). A linha
        // entre os dois só faz sentido com os dois ligados ao mesmo tempo.
        const showForTeam = (window.teamBTPosState === this.team || window.teamBTPosState === 'Both');
        const showForPos = (window.positionBTToggleState === this.team || window.positionBTToggleState === 'Both');
        const teamTarget = this.slotTarget || this.tacticalTarget || this.dynamicTarget;
        const posTarget = this.tacticalTarget || this.dynamicTarget;

        if (this.btTargetGroup) {
            if (showForTeam && teamTarget) {
                this.btTargetGroup.visible = true;
                this.btTargetGroup.position.set(teamTarget.x, 0.05, teamTarget.z);
            } else {
                this.btTargetGroup.visible = false;
            }
        }

        if (this.posTargetGroup) {
            if (showForPos && posTarget) {
                this.posTargetGroup.visible = true;
                this.posTargetGroup.position.set(posTarget.x, 0.06, posTarget.z);
            } else {
                this.posTargetGroup.visible = false;
            }
        }

        if (this.btLine) {
            if (showForTeam && showForPos && teamTarget && posTarget) {
                const arr = this.btLineGeo.attributes.position.array;
                arr[0] = teamTarget.x; arr[1] = 0.055; arr[2] = teamTarget.z;
                arr[3] = posTarget.x; arr[4] = 0.055; arr[5] = posTarget.z;
                this.btLineGeo.attributes.position.needsUpdate = true;
                this.btLine.visible = true;
            } else {
                this.btLine.visible = false;
            }
        }

        if (typeof MatchStats !== 'undefined') {
            MatchStats[this.team].distanciaPercorrida += this.velocity.length() * dt;
        }
    }

    steerArrive(target, maxSpeed) {
        let desired = new THREE.Vector3().subVectors(target, this.model.position);
        desired.y = 0; let d = desired.length();
        if (d < 0.2) return desired.set(0, 0, 0);

        desired.normalize();
        if (d < 2.0) desired.multiplyScalar(maxSpeed * (d / 2.0));
        else desired.multiplyScalar(maxSpeed);

        let isRetreating = false;
        if (this.role === 'def' || this.role === 'mid') {
            if (this.team === 'TeamA' && target.z < this.model.position.z - 2.5) isRetreating = true;
            if (this.team === 'TeamB' && target.z > this.model.position.z + 2.5) isRetreating = true;
        }

        let lookTarget = target;
        if (isRetreating && Match.ball) {
            lookTarget = Match.ball.position;
        }

        _v1.set(this.model.position.x * 2 - lookTarget.x, this.model.position.y, this.model.position.z * 2 - lookTarget.z);
        _m1.lookAt(this.model.position, _v1, this.model.up);
        _q1.setFromRotationMatrix(_m1);
        this.model.quaternion.slerp(_q1, Math.min(1.0, 7.0 * Match.delta));
        this.velocity.lerp(desired, Math.min(1.0, 4.5 * Match.delta));
        return this.velocity;
    }

    /*
    A perna de balanço passa à frente do corpo (posição de toque/chute) perto
    de t=0.25 e t=0.75 do ciclo da passada (getGaitPose: lHip/rHip = sin(c)).
    Toques na bola disparados fora desta janela caem com a perna atrás ou a
    meio da passada — parece que o jogador "puxa" a bola de volta.
    */
    emJanelaDeToque(tol = 0.13) {
        const t = this.animPhase;
        const d1 = Math.abs(t - 0.25);
        const d2 = Math.abs(t - 0.75);
        return Math.min(d1, d2) < tol;
    }

    animateBones(dt) {
        let speed = this.velocity.length(); let rig = this.rig;

        if (this.fsm.currentState !== 'TACKLE' && this.fsm.currentState !== 'SLIDE_TACKLE' && this.fsm.currentState !== 'SHOOT' && this.jumpTimer <= 0 && (this.role !== 'gk' || (this.gkEstado !== 'mergulho' && this.gkEstado !== 'salto_alto'))) {
            rig.pelvis.rotation.x = lerpTo(rig.pelvis.rotation.x, 0, 0.25);
            rig.pelvis.rotation.y = lerpTo(rig.pelvis.rotation.y, 0, 0.25);
            rig.pelvis.rotation.z = lerpTo(rig.pelvis.rotation.z, 0, 0.25);
            
            rig.chest.rotation.y = lerpTo(rig.chest.rotation.y, 0, 0.25);
            rig.chest.rotation.z = lerpTo(rig.chest.rotation.z, 0, 0.25);
            
            rig.lLeg.rotation.y = lerpTo(rig.lLeg.rotation.y, 0, 0.25);
            rig.rLeg.rotation.y = lerpTo(rig.rLeg.rotation.y, 0, 0.25);
            
            rig.lKnee.rotation.y = lerpTo(rig.lKnee.rotation.y, 0, 0.25);
            rig.lKnee.rotation.z = lerpTo(rig.lKnee.rotation.z, 0, 0.25);
            rig.rKnee.rotation.y = lerpTo(rig.rKnee.rotation.y, 0, 0.25);
            rig.rKnee.rotation.z = lerpTo(rig.rKnee.rotation.z, 0, 0.25);
            
            rig.lFoot.rotation.y = lerpTo(rig.lFoot.rotation.y, Math.PI / 16, 0.25);
            rig.lFoot.rotation.z = lerpTo(rig.lFoot.rotation.z, 0, 0.25);
            rig.rFoot.rotation.y = lerpTo(rig.rFoot.rotation.y, -Math.PI / 16, 0.25);
            rig.rFoot.rotation.z = lerpTo(rig.rFoot.rotation.z, 0, 0.25);
            
            rig.lArm.rotation.y = lerpTo(rig.lArm.rotation.y, 0, 0.25);
            rig.rArm.rotation.y = lerpTo(rig.rArm.rotation.y, 0, 0.25);
            
            rig.lElbow.rotation.y = lerpTo(rig.lElbow.rotation.y, 0, 0.25);
            rig.lElbow.rotation.z = lerpTo(rig.lElbow.rotation.z, 0, 0.25);
            rig.rElbow.rotation.y = lerpTo(rig.rElbow.rotation.y, 0, 0.25);
            rig.rElbow.rotation.z = lerpTo(rig.rElbow.rotation.z, 0, 0.25);
            
            if (speed < 0.1) {
                rig.lElbow.rotation.x = lerpTo(rig.lElbow.rotation.x, 0, 0.25);
                rig.rElbow.rotation.x = lerpTo(rig.rElbow.rotation.x, 0, 0.25);
            }
        }

        let distToBallXZ = Math.hypot(this.model.position.x - Match.ball.position.x, this.model.position.z - Match.ball.position.z);
        let ballIsHigh = Match.ball.position.y > 1.2 && Match.ball.position.y < 4.5;
        if (this.jumpCooldown > 0) this.jumpCooldown -= dt;

        if (distToBallXZ < 2.5 && ballIsHigh && !this.hasBall && this.role !== 'gk') {
            if ((!this.jumpTimer || this.jumpTimer <= 0) && (!this.jumpCooldown || this.jumpCooldown <= 0)) {
                this.jumpTimer = 0.4;
                this.jumpCooldown = 10.0; 
            }
        }

        let jumpHeight = 0;
        if (this.jumpTimer > 0) {
            this.jumpTimer -= dt;
            let jt = this.jumpTimer / 0.4; 
            jumpHeight = Math.sin(jt * Math.PI) * 1.8; 
            this.model.position.y = ALTURA_BASE_Y + jumpHeight;
            rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, -0.4, 0.4); 
            rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, 2.0, 0.4); 
            rig.rArm.rotation.z = lerpTo(rig.rArm.rotation.z, -2.0, 0.4);
            rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, 0.5, 0.4); 
            rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, 0.5, 0.4);
        }

        /*
        Cabeça acompanha a bola, dentro de +-80 graus do corpo — dá pra
        correr para um lado olhando para a bola/lateral, em vez de ficar
        sempre a olhar em frente. Antes só o corpo inteiro virava (via
        model.lookAt), sem pescoço independente.
        */
        if (rig.neck && Match.ball && this.fsm.currentState !== 'TACKLE' && this.fsm.currentState !== 'SLIDE_TACKLE') {
            _v1.subVectors(Match.ball.position, this.model.position);
            _v1.y = 0;
            if (_v1.lengthSq() > 0.01) {
                _v1.normalize();
                _v2.set(0, 0, 1).applyQuaternion(this.model.quaternion);
                // Sinal estava trocado (testado: bola à direita dava ângulo
                // negativo = cabeça virava pra esquerda). atan2(cross,dot)
                // com cross = fwd.z*toBall.x - fwd.x*toBall.z acerta o lado.
                const cross = _v2.z * _v1.x - _v2.x * _v1.z;
                const dot = _v2.dot(_v1);
                let angle = Math.atan2(cross, dot);
                const maxHeadAngle = (80 * Math.PI) / 180;
                angle = THREE.MathUtils.clamp(angle, -maxHeadAngle, maxHeadAngle);
                rig.neck.rotation.y = lerpTo(rig.neck.rotation.y, angle, 0.25);
            }
        }

        if (this.fsm.currentState === 'TACKLE' || this.fsm.currentState === 'SLIDE_TACKLE') {
            return;
        }

        if (this.jumpTimer > 0) {
            return; 
        }

        if (speed < 0.1 && this.fsm.currentState !== 'PASS' && this.fsm.currentState !== 'SHOOT') {
            this.model.position.y = lerpTo(this.model.position.y, ALTURA_BASE_Y);
            rig.chest.rotation.y = lerpTo(rig.chest.rotation.y, 0); rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, 0);
            rig.pelvis.rotation.y = lerpTo(rig.pelvis.rotation.y, 0); rig.pelvis.rotation.z = lerpTo(rig.pelvis.rotation.z, 0);
            rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, 0); rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, 0);
            rig.lKnee.rotation.x = lerpTo(rig.lKnee.rotation.x, 0); rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, 0);
            rig.lFoot.rotation.x = lerpTo(rig.lFoot.rotation.x, 0); rig.rFoot.rotation.x = lerpTo(rig.rFoot.rotation.x, 0);
            rig.lArm.rotation.x = lerpTo(rig.lArm.rotation.x, 0); rig.rArm.rotation.x = lerpTo(rig.rArm.rotation.x, 0);
            rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, Math.PI / 12); rig.rArm.rotation.z = lerpTo(rig.rArm.rotation.z, -Math.PI / 12);
            rig.lLeg.rotation.z = lerpTo(rig.lLeg.rotation.z, Math.PI / 32); rig.rLeg.rotation.z = lerpTo(rig.rLeg.rotation.z, -Math.PI / 32);
            return;
        }
        if (speed >= 0.1) {
            let movingBackwards = false;
            let fwd = _v2.set(0, 0, 1).applyQuaternion(this.model.quaternion).normalize();
            let velDir = _v1.copy(this.velocity).normalize();
            if (fwd.dot(velDir) < -0.3) {
                movingBackwards = true;
            }

            /*
            A cadência sai da PASSADA do andamento, não de um divisor fixo.

            Era `animTimer += speed*dt/3.0`, ou seja 3 m por ciclo a qualquer
            velocidade — o mesmo tamanho de passo a andar e a sprintar. Agora
            cada andamento tem a sua passada (1.55 m a andar, 4.40 m a correr) e
            a cadência é velocidade/passada.
            */
            const pose = getGaitPose(0, speed);          // só para ler a passada
            const avanco = (speed * dt) / pose.passada;
            this.animTimer += movingBackwards ? -avanco : avanco;

            const t = ((this.animTimer % 1.0) + 1.0) % 1.0;
            this.animPhase = t;
            const P = getGaitPose(t, speed);

            rig.lLeg.rotation.x = P.lHip; rig.lKnee.rotation.x = P.lKnee; rig.lFoot.rotation.x = P.lFoot;
            rig.rLeg.rotation.x = P.rHip; rig.rKnee.rotation.x = P.rKnee; rig.rFoot.rotation.x = P.rFoot;
            rig.lArm.rotation.x = P.lArm; rig.rArm.rotation.x = P.rArm;

            // O cotovelo abre a andar e fecha a correr — era fixo em -1.2, que
            // é postura de sprint aplicada também a quem está a passear.
            rig.lElbow.rotation.x = P.cotovelo; rig.rElbow.rotation.x = P.cotovelo;

            rig.lLeg.rotation.z = lerpTo(rig.lLeg.rotation.z, 0); rig.rLeg.rotation.z = lerpTo(rig.rLeg.rotation.z, 0);
            rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, Math.PI / 16); rig.rArm.rotation.z = lerpTo(rig.rArm.rotation.z, -Math.PI / 16);

            // Tronco: a prumo a andar, inclinado a correr. Era 0.3 rad sempre.
            const inclinacao = movingBackwards ? P.tronco * 0.4 : P.tronco;
            rig.chest.rotation.x = inclinacao + Math.sin(t * Math.PI * 2) * 0.04;

            this.model.position.y = ALTURA_BASE_Y + P.ressalto;
        }
    }

    buildBody(corCamisa, corCalcao) {
        const blockMat = new THREE.MeshStandardMaterial({ color: 0xdcdde1, roughness: 0.8 }); const jointMat = new THREE.MeshStandardMaterial({ color: 0x7f8fa6, roughness: 0.6 });
        const shirtMat = new THREE.MeshStandardMaterial({ color: corCamisa, roughness: 0.9 }); const shortMat = new THREE.MeshStandardMaterial({ color: corCalcao, roughness: 0.9 });
        const bootMat = new THREE.MeshStandardMaterial({ color: 0xe8ff00, roughness: 0.5 }); const studMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
        const hairMat = new THREE.MeshStandardMaterial({ color: 0x2c1e16, roughness: 0.9 });
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x2f3640, linewidth: 2 }); const lineMat = new THREE.LineBasicMaterial({ color: 0x2f3640 });

        const cvsV = document.createElement('canvas'); cvsV.width = 512; cvsV.height = 512; const ctxV = cvsV.getContext('2d');
        ctxV.fillStyle = corCamisa; ctxV.fillRect(0, 0, 512, 512); ctxV.fillStyle = '#dcdde1'; ctxV.beginPath(); ctxV.moveTo(136, 0); ctxV.lineTo(376, 0); ctxV.lineTo(256, 280); ctxV.fill(); ctxV.strokeStyle = '#2f3640'; ctxV.lineWidth = 12; ctxV.stroke();

        this.backMat = new THREE.MeshStandardMaterial({ color: corCamisa, roughness: 0.9 });
        const chestMats = [shirtMat, shirtMat, shirtMat, shirtMat, new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cvsV) }), this.backMat];

        const cvsS = document.createElement('canvas'); cvsS.width = 256; cvsS.height = 256; const ctxS = cvsS.getContext('2d');
        ctxS.fillStyle = '#ffffff'; ctxS.fillRect(0, 0, 256, 256); ctxS.fillStyle = corCamisa; ctxS.fillRect(0, 20, 256, 30); ctxS.fillRect(0, 70, 256, 15); ctxS.strokeStyle = '#2f3640'; ctxS.lineWidth = 4; ctxS.strokeRect(0, 0, 256, 256);
        const sockTex = new THREE.CanvasTexture(cvsS);
        const sockMats = [new THREE.MeshStandardMaterial({ map: sockTex }), new THREE.MeshStandardMaterial({ map: sockTex }), new THREE.MeshStandardMaterial({ color: 0xffffff }), new THREE.MeshStandardMaterial({ color: 0xffffff }), new THREE.MeshStandardMaterial({ map: sockTex }), new THREE.MeshStandardMaterial({ map: sockTex })];

        const u = 1.0; const corpo = new THREE.Group();
        const rig = { pelvis: null, chest: null, neck: null, lArm: null, rArm: null, lElbow: null, rElbow: null, lHand: null, rHand: null, lLeg: null, rLeg: null, lKnee: null, rKnee: null, lFoot: null, rFoot: null, olhoEsq: null, olhoDir: null };

        function criarPeca(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat)); return m; }

        const pelvis = criarPeca(new THREE.BoxGeometry(u * 1.3, u * 0.6, u * 0.8), blockMat); pelvis.position.y = 2.6; pelvis.add(criarPeca(new THREE.BoxGeometry(u * 1.35, u * 0.65, u * 0.85), shortMat)); corpo.add(pelvis); rig.pelvis = pelvis;
        const belly = criarPeca(new THREE.BoxGeometry(u * 1.1, u * 0.45, u * 0.7), blockMat); belly.position.y = 0.525; belly.add(criarPeca(new THREE.BoxGeometry(u * 1.15, u * 0.5, u * 0.75), shirtMat)); pelvis.add(belly);
        const chest = criarPeca(new THREE.BoxGeometry(u * 1.4, u * 1.0, u * 0.75), blockMat); chest.position.y = 0.725; chest.add(criarPeca(new THREE.BoxGeometry(u * 1.45, u * 1.05, u * 0.8), chestMats)); belly.add(chest); rig.chest = chest;
        const neck = criarPeca(new THREE.BoxGeometry(u * 0.35, u * 0.15, u * 0.35), blockMat); neck.position.y = 0.575; chest.add(neck); rig.neck = neck;
        const head = criarPeca(new THREE.BoxGeometry(u * 0.8, u * 1.0, u * 0.85), blockMat); head.position.y = 0.575;

        const faceGrp = new THREE.Group(); const faceZ = u * 0.426;
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2f3640 });
        rig.olhoEsq = new THREE.Mesh(new THREE.PlaneGeometry(u * 0.08, u * 0.14), eyeMat); rig.olhoEsq.position.set(-u * 0.16, u * 0.15, faceZ);
        rig.olhoDir = new THREE.Mesh(new THREE.PlaneGeometry(u * 0.08, u * 0.14), eyeMat); rig.olhoDir.position.set(u * 0.16, u * 0.15, faceZ);
        const nariz = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, u * 0.05, faceZ), new THREE.Vector3(0, -u * 0.08, faceZ), new THREE.Vector3(u * 0.06, -u * 0.08, faceZ)]), lineMat);
        const boca = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-u * 0.12, -u * 0.22, faceZ), new THREE.Vector3(u * 0.12, -u * 0.22, faceZ)]), lineMat);
        faceGrp.add(rig.olhoEsq, rig.olhoDir, nariz, boca); head.add(faceGrp);

        const hairGrp = new THREE.Group();
        const hT = criarPeca(new THREE.BoxGeometry(u * 0.88, u * 0.25, u * 0.9), hairMat); hT.position.set(0, u * 0.5, 0);
        const hB = criarPeca(new THREE.BoxGeometry(u * 0.88, u * 0.7, u * 0.25), hairMat); hB.position.set(0, u * 0.15, -u * 0.35);
        const hL = criarPeca(new THREE.BoxGeometry(u * 0.15, u * 0.6, u * 0.65), hairMat); hL.position.set(-u * 0.4, u * 0.2, -u * 0.1);
        const hR = criarPeca(new THREE.BoxGeometry(u * 0.15, u * 0.6, u * 0.65), hairMat); hR.position.set(u * 0.4, u * 0.2, -u * 0.1);
        const hF = criarPeca(new THREE.BoxGeometry(u * 0.88, u * 0.15, u * 0.2), hairMat); hF.position.set(0, u * 0.45, u * 0.38);
        hairGrp.add(hT, hB, hL, hR, hF); head.add(hairGrp); neck.add(head);

        const jointGeo = new THREE.SphereGeometry(u * 0.2, 16, 16); const smallJointGeo = new THREE.SphereGeometry(u * 0.15, 16, 16);

        function criarBraco(x) {
            const grp = new THREE.Group(); grp.position.set(x, 0.3, 0); grp.add(criarPeca(jointGeo, jointMat));
            const up = criarPeca(new THREE.BoxGeometry(u * 0.35, u * 1.0, u * 0.35), blockMat); up.position.y = -0.5;
            const manga = criarPeca(new THREE.BoxGeometry(u * 0.4, u * 0.5, u * 0.4), shirtMat); manga.position.y = 0.25; up.add(manga); grp.add(up);
            const elb = new THREE.Group(); elb.position.y = -1.0; grp.add(elb); elb.add(criarPeca(smallJointGeo, jointMat));
            const low = criarPeca(new THREE.BoxGeometry(u * 0.3, u * 0.8, u * 0.3), blockMat); low.position.y = -0.4; elb.add(low);
            const handG = new THREE.Group(); handG.position.y = -0.8; elb.add(handG);
            const mao = criarPeca(new THREE.BoxGeometry(u * 0.35, u * 0.4, u * 0.2), blockMat); mao.position.y = -0.2; mao.rotation.y = Math.PI / 2; handG.add(mao);
            grp.rotation.z = x < 0 ? -Math.PI / 16 : Math.PI / 16; chest.add(grp); return { raiz: grp, cotovelo: elb, mao: handG };
        }

        function criarPerna(x) {
            const grp = new THREE.Group(); grp.position.set(x, -0.3, 0); grp.add(criarPeca(jointGeo, jointMat));
            const coxa = criarPeca(new THREE.BoxGeometry(u * 0.45, u * 1.0, u * 0.45), blockMat); coxa.position.y = -0.5;
            const shortL = criarPeca(new THREE.BoxGeometry(u * 0.5, u * 0.5, u * 0.5), shortMat); shortL.position.y = 0.25; coxa.add(shortL); grp.add(coxa);
            const joelho = new THREE.Group(); joelho.position.y = -1.0; grp.add(joelho); joelho.add(criarPeca(smallJointGeo, jointMat));
            const canela = criarPeca(new THREE.BoxGeometry(u * 0.35, u * 0.9, u * 0.35), blockMat); canela.position.y = -0.45;
            const meiao = criarPeca(new THREE.BoxGeometry(u * 0.4, u * 0.85, u * 0.4), sockMats); meiao.position.y = 0.0; canela.add(meiao); joelho.add(canela);
            const peG = new THREE.Group(); peG.position.y = -0.9; joelho.add(peG);

            const footGeo = new THREE.BoxGeometry(u * 0.45, u * 0.4, u * 1.0); const p = footGeo.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getZ(i) > 0 && p.getY(i) > 0) p.setY(i, p.getY(i) - u * 0.25); } footGeo.computeVertexNormals();
            const chuteira = criarPeca(footGeo, bootMat); chuteira.position.set(0, -0.2, u * 0.25); peG.add(chuteira);

            const studGeo = new THREE.CylinderGeometry(u * 0.03, u * 0.02, u * 0.04, 8);
            const posTravas = [[-u * 0.12, u * 0.25], [u * 0.12, u * 0.25], [-u * 0.12, 0], [u * 0.12, 0], [-u * 0.12, -u * 0.3], [u * 0.12, -u * 0.3]];
            posTravas.forEach(pos => { const t = criarPeca(studGeo, studMat); t.position.set(pos[0], -0.22, pos[1]); chuteira.add(t); });

            grp.rotation.z = x < 0 ? -Math.PI / 32 : Math.PI / 32; peG.rotation.y = x < 0 ? -Math.PI / 16 : Math.PI / 16; pelvis.add(grp); return { raiz: grp, joelho: joelho, pe: peG };
        }

        const bracoEsq = criarBraco(0.8); rig.lArm = bracoEsq.raiz; rig.lElbow = bracoEsq.cotovelo;
        const bracoDir = criarBraco(-0.8); rig.rArm = bracoDir.raiz; rig.rElbow = bracoDir.cotovelo;
        const pernaEsq = criarPerna(0.4); rig.lLeg = pernaEsq.raiz; rig.lKnee = pernaEsq.joelho; rig.lFoot = pernaEsq.pe;
        const pernaDir = criarPerna(-0.4); rig.rLeg = pernaDir.raiz; rig.rKnee = pernaDir.joelho; rig.rFoot = pernaDir.pe;

        corpo.scale.set(1.8 / 5.5, 1.8 / 5.5, 1.8 / 5.5); return { corpo, rig };
    }

    updateShirt(num, pos) {
        if (!this.btTargetGroup) {
            this.btTargetGroup = new THREE.Group();
            this.btTargetGroup.visible = false;
            let ringColorNum = this.team === 'TeamA' ? 0x3498db : 0xe74c3c;

            let ring = new THREE.Mesh(
                new THREE.RingGeometry(0.8, 1.0, 32), 
                new THREE.MeshBasicMaterial({ color: ringColorNum, side: THREE.DoubleSide })
            );
            ring.rotation.x = -Math.PI / 2;
            this.btTargetGroup.add(ring);

            let btCanvas = document.createElement('canvas');
            btCanvas.width = 128; btCanvas.height = 64;
            let btCtx = btCanvas.getContext('2d');
            btCtx.fillStyle = 'rgba(0,0,0,0)'; btCtx.fillRect(0,0,128,64);
            btCtx.fillStyle = '#ffffff';
            btCtx.font = 'bold 36px sans-serif';
            btCtx.textAlign = 'center';
            btCtx.textBaseline = 'middle';
            btCtx.fillText(pos, 64, 32);
            
            let btTex = new THREE.CanvasTexture(btCanvas);
            let btMat = new THREE.MeshBasicMaterial({ map: btTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
            let btPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), btMat);
            btPlane.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
            btPlane.position.set(0, 0.001, 0); 
            this.btTargetGroup.add(btPlane);

            if (typeof Match !== 'undefined' && Match.scene) {
                Match.scene.add(this.btTargetGroup);
            }

            /*
            Anel do "Position BT" — mais pequeno, cor da equipa, sem
            etiqueta — desenhado no alvo do NÍVEL 2 (p.tacticalTarget, já
            com os desvios das folhas). O btTargetGroup acima passa a ser só
            o "Team BT POS": o slot puro do nível 1 (p.slotTarget), sem
            desvios nenhuns. Uma linha liga os centros dos dois — o
            comprimento dela é literalmente o quanto o PositionBT afastou o
            jogador do slot do TeamBT.
            */
            this.posTargetGroup = new THREE.Group();
            this.posTargetGroup.visible = false;
            let posRing = new THREE.Mesh(
                new THREE.RingGeometry(0.28, 0.4, 24),
                new THREE.MeshBasicMaterial({ color: ringColorNum, side: THREE.DoubleSide })
            );
            posRing.rotation.x = -Math.PI / 2;
            this.posTargetGroup.add(posRing);
            if (typeof Match !== 'undefined' && Match.scene) {
                Match.scene.add(this.posTargetGroup);
            }

            this.btLineGeo = new THREE.BufferGeometry();
            this.btLineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
            this.btLine = new THREE.Line(this.btLineGeo, new THREE.LineBasicMaterial({ color: ringColorNum }));
            this.btLine.visible = false;
            if (typeof Match !== 'undefined' && Match.scene) {
                Match.scene.add(this.btLine);
            }
        } else if (this.pos !== pos) {
            let btCtx = this.btTargetGroup.children[1].material.map.image.getContext('2d');
            btCtx.clearRect(0,0,128,64);
            btCtx.fillStyle = '#ffffff';
            btCtx.font = 'bold 36px sans-serif';
            btCtx.textAlign = 'center';
            btCtx.textBaseline = 'middle';
            btCtx.fillText(pos, 64, 32);
            this.btTargetGroup.children[1].material.map.needsUpdate = true;
        }

        if (this.num === num && this.pos === pos && this.backMat.map) return;
        this.num = num;
        this.pos = pos;
        const cvsBack = document.createElement('canvas'); cvsBack.width = 512; cvsBack.height = 512; const ctxBack = cvsBack.getContext('2d');
        ctxBack.fillStyle = this.corCamisa; ctxBack.fillRect(0, 0, 512, 512);

        if (this.team === 'TeamA') {
            ctxBack.fillStyle = '#000000'; 
        } else {
            ctxBack.fillStyle = '#ffffff'; 
        }

        ctxBack.font = 'bold 260px "Segoe UI"'; ctxBack.textAlign = 'center'; ctxBack.textBaseline = 'middle';
        ctxBack.fillText(this.num.toString(), 256, 280);

        ctxBack.font = 'bold 80px "Segoe UI"';
        ctxBack.fillText(this.pos, 256, 100);

        if (this.backMat.map) this.backMat.map.dispose();
        this.backMat.map = new THREE.CanvasTexture(cvsBack);
        // Cor base tingia o mapa (branco em vermelho ficava avermelhado, ilegível). Canvas já tem as cores certas.
        this.backMat.color.set(0xffffff);
        this.backMat.needsUpdate = true;
    }

    updateGK(dt) {
        let gkCorpo = this.model; let gkRig = this.rig;
        let limitGKX = (LARGURA_BALIZA / 2) - 0.5;

        let prevX = gkCorpo.position.x;
        let prevZ = gkCorpo.position.z;

        gkCorpo.position.x = Math.max(-20.16, Math.min(20.16, gkCorpo.position.x));
        let areaMinZ = (this.team === 'TeamA') ? -53 : 36.5;
        let areaMaxZ = (this.team === 'TeamA') ? -36.5 : 53;
        gkCorpo.position.z = Math.max(areaMinZ, Math.min(areaMaxZ, gkCorpo.position.z));

        if (window.bolaChutada && !this.gkReagiu) {
            this.gkDelayReacao -= dt;
            if (this.gkDelayReacao <= 0) {
                this.gkReagiu = true;
            }
        }

        if (this.gkEstado === 'idle') {
            let alvoGkX = gkCorpo.position.x;
            let alvoGkZ = (this.team === 'TeamA') ? -48 : 48;
            let speedLerp = 2.0;

            let gkSkill = TeamSkills[this.team].gk;

            let bolaVindoPraMim = (this.team === 'TeamA') ? (Match.ballVel.z < -5) : (Match.ballVel.z > 5);

            if (bolaVindoPraMim && this.gkReagiu) {
                let tempoAteGolo = Math.abs(gkCorpo.position.z - Match.ball.position.z) / Math.abs(Match.ballVel.z);
                if (tempoAteGolo > 0 && tempoAteGolo < 1.5) {
                    let interX = Match.ball.position.x + (Match.ballVel.x * tempoAteGolo);
                    let interY = Match.ball.position.y + Match.ballVel.y * tempoAteGolo - 0.5 * 15.0 * tempoAteGolo * tempoAteGolo;
                    interX = Math.max(-limitGKX, Math.min(limitGKX, interX)); interY = Math.max(0, Math.min(2.44, interY));

                    this.gkEstado = 'mergulho'; this.gkTempoMergulho = 0;
                    if (Math.abs(interX - gkCorpo.position.x) < 1.2) { this.gkDirMergulho = 0; }
                    else { this.gkDirMergulho = Math.sign(interX - gkCorpo.position.x); }
                    if (interY > 1.6) this.gkTipoMergulho = 'alto'; else if (interY > 0.8) this.gkTipoMergulho = 'meio'; else this.gkTipoMergulho = 'baixo';
                }
                speedLerp = 3.0 + ((gkSkill - 50) / 50) * 6.0;
            } else if (Match.state === 'PLAY') {
                let isAttacking = (Match.possessionTeam === this.team);
                let bolaNaArea = (Math.abs(Match.ball.position.x) < 20.16 && Match.ball.position.z * this.dirZ < -36.5);
                
                let isCross = (Match.ballVel.y > 2.0 && Match.ball.position.y > 1.2 && Math.abs(Match.ball.position.z) > 24 && !Match.ballCarrier);

                if (isCross) {
                    alvoGkZ = ownGoalZCenter(this.team) + (Match.ball.position.z - ownGoalZCenter(this.team)) * 0.55;
                    alvoGkX = Match.ball.position.x * 0.65;
                    speedLerp = 4.0;

                    let distToBall = gkCorpo.position.distanceTo(Match.ball.position);
                    if (distToBall < 2.5 && Match.ball.position.y > 1.2 && Match.ball.position.y < 3.2) {
                        this.gkEstado = 'salto_alto';
                        this.gkTempoMergulho = 0;
                    }
                } 
                else if (!isAttacking) {
                    if (bolaNaArea) {
                        let distToBall = gkCorpo.position.distanceTo(Match.ball.position);
                        let carrier = Match.ballCarrier;
                        let looseBallInBox = (!carrier && Match.ballVel.lengthSq() < 150);

                        if (looseBallInBox || (distToBall < 3.2 && !carrier)) {
                            alvoGkX = Match.ball.position.x;
                            alvoGkZ = Match.ball.position.z;
                            speedLerp = 6.0;

                            // Perto o suficiente: pára de deslizar e agacha para apanhar,
                            // em vez de agarrar instantaneamente a meio da corrida.
                            if (distToBall < 1.2) {
                                this.gkEstado = 'apanhar';
                                this.gkTempoMergulho = 0;
                            }
                        } else {
                            let tempoAteMim = Match.ballVel.lengthSq() > 0 ? (gkCorpo.position.distanceTo(Match.ball.position) / Match.ballVel.length()) : 999;
                            let possoEspalmar = (tempoAteMim < 0.6 && window.bolaChutada);

                            if (possoEspalmar) {
                                this.gkEstado = 'mergulho';
                                this.gkTempoMergulho = 0;
                                this.gkDirMergulho = Math.sign(Match.ball.position.x - gkCorpo.position.x);
                                this.gkTipoMergulho = Match.ball.position.y > 1.2 ? 'alto' : 'baixo';
                            } else {
                                if (carrier && carrier.model.position.distanceTo(gkCorpo.position) < 14.0) {
                                    alvoGkZ = ownGoalZCenter(this.team) + (Match.ball.position.z - ownGoalZCenter(this.team)) * 0.55;
                                    alvoGkX = Match.ball.position.x * 0.6;
                                } else {
                                    alvoGkZ = ownGoalZCenter(this.team) + (Match.ball.position.z - ownGoalZCenter(this.team)) * 0.35;
                                    alvoGkX = Math.max(-limitGKX, Math.min(limitGKX, Match.ball.position.x * 0.7));
                                }
                                speedLerp = 3.5;
                            }
                        }
                    } else {
                        alvoGkZ = ownGoalZCenter(this.team) + (Match.ball.position.z - ownGoalZCenter(this.team)) * 0.15;
                        alvoGkX = Math.max(-limitGKX, Math.min(limitGKX, Match.ball.position.x * 0.5));
                        speedLerp = 2.2;
                    }
                } 
                else {
                    let carrier = Match.ballCarrier;
                    let souOpcao = false;
                    if (carrier && carrier.model.position.z * this.dirZ < -5.0) {
                        _line1.set(gkCorpo.position, carrier.model.position);
                        let opponents = (this.team === 'TeamA') ? Match.opponents : Match.players;
                        let pathClear = true;
                        for (let i = 0; i < opponents.length; i++) {
                            let opp = opponents[i];
                            if (opp.role === 'gk') continue;
                            _line1.closestPointToPoint(opp.model.position, true, _v1);
                            if (_v1.distanceTo(opp.model.position) < 2.5) {
                                pathClear = false;
                                break;
                            }
                        }
                        if (pathClear) souOpcao = true;
                    }

                    if (souOpcao) {
                        alvoGkZ = ownGoalZCenter(this.team) + 8.5 * this.dirZ;
                        alvoGkX = carrier.model.position.x * 0.5 + (this.id % 2 === 0 ? 3.5 : -3.5);
                    } else {
                        alvoGkZ = ownGoalZCenter(this.team) + 4.0 * this.dirZ;
                        alvoGkX = Match.ball.position.x * 0.25;
                    }
                }
            }

            if (this.dynamicTarget) {
                this.dynamicTarget.set(alvoGkX, ALTURA_BASE_Y, alvoGkZ);
            }
            
            /*
            Passo limitado a speedLerp m/s, não lerp exponencial puro. O lerp
            velho (`lerp(pos, alvo, speedLerp*dt)`) anda uma FRACÇÃO da
            distância restante por frame — se o alvo salta longe de repente
            (bola entra na área rápido), isso cobre 6-7m em poucos frames,
            um "deslize" a dezenas de m/s. Isto trava a velocidade real.
            */
            const dxGk = alvoGkX - gkCorpo.position.x;
            const dzGk = alvoGkZ - gkCorpo.position.z;
            const distGk = Math.hypot(dxGk, dzGk);
            const maxStepGk = speedLerp * dt;
            let stepX, stepZ;
            if (distGk > maxStepGk && distGk > 0.0001) {
                stepX = (dxGk / distGk) * maxStepGk;
                stepZ = (dzGk / distGk) * maxStepGk;
            } else {
                stepX = dxGk; stepZ = dzGk;
            }
            gkCorpo.position.x += stepX;
            gkCorpo.position.z += stepZ;

            // Velocidade planar REAL (pós-limite), não a distância bruta ao
            // alvo — senão a animação tentava acompanhar o salto impossível.
            let velX = dt > 0.0001 ? stepX / dt : 0;
            let velZ = dt > 0.0001 ? stepZ / dt : 0;
            let lookPos = Match.ball.position.clone(); lookPos.y = gkCorpo.position.y; lookAtBola(gkCorpo, lookPos);

            gkRig.pelvis.rotation.x = lerpTo(gkRig.pelvis.rotation.x, 0, 0.25);
            gkRig.pelvis.rotation.y = lerpTo(gkRig.pelvis.rotation.y, 0, 0.25);
            gkRig.pelvis.rotation.z = lerpTo(gkRig.pelvis.rotation.z, 0, 0.25);

            /*
            Postura: anda normalmente quando se desloca, e só se agacha (pouco)
            quando há mesmo um adversário com bola perto da área. Ver
            GoalkeeperPose em config.js para os valores.
            */
            const velPlanar = Math.hypot(velX, velZ);
            const andando = velPlanar > 0.5;
            const portador = Match.ballCarrier;
            const distBolaBaliza = Math.abs(Match.ball.position.z - this.ownGoalZ);
            const emAlerta = (window.bolaChutada && !this.gkReagiu) ||
                (portador && portador.team !== this.team && distBolaBaliza < GoalkeeperPose.alertaDist);

            if (andando) {
                const P = GoalkeeperPose.andar;

                // Mesma convenção de ciclo do jogador de campo, com passada curta.
                this.animTimer += (velPlanar * dt) / 3.0;
                const t = ((this.animTimer % 1.0) + 1.0) % 1.0;
                const pose = getRunPose(t);
                const e = P.passada;

                gkRig.lLeg.rotation.x = lerpTo(gkRig.lLeg.rotation.x, pose.lHip * e, 0.4);
                gkRig.rLeg.rotation.x = lerpTo(gkRig.rLeg.rotation.x, pose.rHip * e, 0.4);
                gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, P.kneeBase + pose.lKnee * P.passadaJoelho, 0.4);
                gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, P.kneeBase + pose.rKnee * P.passadaJoelho, 0.4);
                gkRig.lLeg.rotation.z = lerpTo(gkRig.lLeg.rotation.z, 0, 0.3);
                gkRig.rLeg.rotation.z = lerpTo(gkRig.rLeg.rotation.z, 0, 0.3);

                gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, pose.lArm * 0.5, 0.3);
                gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, pose.rArm * 0.5, 0.3);
                gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, P.bracos, 0.2);
                gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -P.bracos, 0.2);
                gkRig.lElbow.rotation.x = lerpTo(gkRig.lElbow.rotation.x, -0.5, 0.2);
                gkRig.rElbow.rotation.x = lerpTo(gkRig.rElbow.rotation.x, -0.5, 0.2);

                gkRig.chest.rotation.x = lerpTo(gkRig.chest.rotation.x, P.chest, 0.2);
                // Ligeiro balanço vertical da passada.
                const balanco = Math.sin(t * Math.PI * 4) * 0.04;
                gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + P.altura + balanco, 0.2);
            } else {
                const P = emAlerta ? GoalkeeperPose.espera : GoalkeeperPose.repouso;

                gkRig.lLeg.rotation.x = lerpTo(gkRig.lLeg.rotation.x, P.coxa, 0.2);
                gkRig.rLeg.rotation.x = lerpTo(gkRig.rLeg.rotation.x, P.coxa, 0.2);
                gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, P.joelho, 0.2);
                gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, P.joelho, 0.2);
                gkRig.lLeg.rotation.z = lerpTo(gkRig.lLeg.rotation.z, P.abertura, 0.2);
                gkRig.rLeg.rotation.z = lerpTo(gkRig.rLeg.rotation.z, -P.abertura, 0.2);

                gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, P.bracoZ, 0.2);
                gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -P.bracoZ, 0.2);
                gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, P.bracoX, 0.2);
                gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, P.bracoX, 0.2);
                gkRig.lElbow.rotation.x = lerpTo(gkRig.lElbow.rotation.x, P.cotovelo, 0.2);
                gkRig.rElbow.rotation.x = lerpTo(gkRig.rElbow.rotation.x, P.cotovelo, 0.2);

                gkRig.chest.rotation.x = lerpTo(gkRig.chest.rotation.x, P.chest, 0.2);
                gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + P.altura, 0.2);
            }

            if (this.hasBall) {
                this.runBehaviorTree(dt);
                this.fsm.update(dt);
            }
        } else if (this.gkEstado === 'mergulho') {
            this.gkTempoMergulho += dt; let t = this.gkTempoMergulho; let dirX = this.gkDirMergulho; let tipo = this.gkTipoMergulho;
            let gkSkill = TeamSkills[this.team].gk;
            let skillSpeed = 4.0 + ((gkSkill - 50) / 50) * 5.0;

            if (t < 0.6) {
                gkCorpo.position.x += dirX * skillSpeed * dt;
                gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, 2.5, 0.2); gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -2.5, 0.2);
                if (dirX !== 0) {
                    gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + (tipo === 'alto' ? 0.6 : 0.1), 0.2);
                    gkRig.pelvis.rotation.z = lerpTo(gkRig.pelvis.rotation.z, dirX * 1.2, 0.2);
                } else {
                    gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + (tipo === 'alto' ? 0.8 : -0.2), 0.2);
                }
            } else if (t < 1.2) {
                if (dirX !== 0) { gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y - 0.15, 0.2); gkRig.pelvis.rotation.z = lerpTo(gkRig.pelvis.rotation.z, dirX * 1.57, 0.2); }
            } else if (t < 1.8) {
                if (dirX !== 0) { gkRig.pelvis.rotation.x = lerpTo(gkRig.pelvis.rotation.x, 1.2, 0.2); gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, 1.8, 0.2); gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, 1.8, 0.2); }
            } else if (t < 2.5) {
                gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y, 0.15); gkRig.pelvis.rotation.x = lerpTo(gkRig.pelvis.rotation.x, 0, 0.15); gkRig.pelvis.rotation.z = lerpTo(gkRig.pelvis.rotation.z, 0, 0.15);
            } else { this.gkEstado = 'idle'; this.resetBonesToDefault(); }

            if (t < 1.2 && gkCorpo.position.distanceTo(Match.ball.position) < 2.0 && Match.ballVel.lengthSq() > 0) {
                let catchChance = 0.35 + (gkSkill - 50) / 100;
                if (Math.random() < catchChance) {
                    this.grabBall();
                } else {
                    Match.ballVel.z *= -0.5; Match.ballVel.x += (Math.random() - 0.5) * 10; Match.ballVel.y += 3;
                }
            }
        } else if (this.gkEstado === 'salto_alto') {
            this.gkTempoMergulho += dt; let t = this.gkTempoMergulho;
            let gkSkill = TeamSkills[this.team].gk;

            if (t < 0.3) {
                let jumpH = 0.8 + ((gkSkill - 50) / 50) * 0.6;
                gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + jumpH, 0.25);
                gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, 2.8, 0.3);
                gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -2.8, 0.3);
                gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, -0.5, 0.3);
                gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, -0.5, 0.3);
                gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, 1.2, 0.3);
                gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, 1.2, 0.3);
            } else if (t < 0.6) {
                gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, 0.6, 0.2);
                gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, 0.6, 0.2);
            } else if (t < 1.2) {
                gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y, 0.2);
                gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, 0.5, 0.15);
                gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -0.5, 0.15);
            } else {
                gkCorpo.position.y = ALTURA_BASE_Y;
                this.gkEstado = 'idle';
                this.resetBonesToDefault();
            }

            if (t < 0.7 && gkCorpo.position.distanceTo(Match.ball.position) < 2.2 && Match.ballVel.lengthSq() > 0) {
                let catchChance = 0.4 + (gkSkill - 50) / 80;
                if (Math.random() < catchChance) {
                    this.grabBall();
                } else {
                    Match.ballVel.z *= -0.4; Match.ballVel.x += (Math.random() - 0.5) * 8; Match.ballVel.y += 2;
                }
            }
        } else if (this.gkEstado === 'apanhar') {
            // Bola mansa/rolando: pára, agacha e apanha — sem deslizar.
            this.gkTempoMergulho += dt;
            const t = this.gkTempoMergulho;
            const P = GoalkeeperPose.apanhar;
            const k = Math.min(1, t / GoalkeeperPose.apanharDur);

            gkRig.lLeg.rotation.x = lerpTo(gkRig.lLeg.rotation.x, P.coxa, 0.5);
            gkRig.rLeg.rotation.x = lerpTo(gkRig.rLeg.rotation.x, P.coxa, 0.5);
            gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, P.joelho, 0.5);
            gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, P.joelho, 0.5);
            gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, P.bracoX, 0.5);
            gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, P.bracoX, 0.5);
            gkRig.lElbow.rotation.x = lerpTo(gkRig.lElbow.rotation.x, P.cotovelo, 0.5);
            gkRig.rElbow.rotation.x = lerpTo(gkRig.rElbow.rotation.x, P.cotovelo, 0.5);
            gkRig.chest.rotation.x = lerpTo(gkRig.chest.rotation.x, P.chest, 0.5);
            gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + P.altura, 0.5);

            // Segue a bola devagar enquanto se agacha, sem voltar a acelerar.
            gkCorpo.position.x = lerpTo(gkCorpo.position.x, Match.ball.position.x, 0.15);
            gkCorpo.position.z = lerpTo(gkCorpo.position.z, Match.ball.position.z, 0.15);

            // Vira-se para a bola enquanto se aproxima — sem isto ficava com a
            // rotação de onde quer que viesse a correr, de lado ou de costas.
            {
                let lookPos = Match.ball.position.clone(); lookPos.y = gkCorpo.position.y;
                lookAtBola(gkCorpo, lookPos);
            }

            if (k >= 1) {
                this.grabBall();
            }
        } else if (this.gkEstado === 'segurando') {
            // Bola já agarrada: segura junto ao peito enquanto as equipas se
            // reorganizam, antes de poder relançar (mão ou pontapé).
            this.gkTempoMergulho += dt;
            const t = this.gkTempoMergulho;
            const meio = GoalkeeperPose.segurarDur * 0.4;
            const P = t < meio ? GoalkeeperPose.apanhar : GoalkeeperPose.segurar;

            gkRig.lLeg.rotation.x = lerpTo(gkRig.lLeg.rotation.x, P.coxa, 0.25);
            gkRig.rLeg.rotation.x = lerpTo(gkRig.rLeg.rotation.x, P.coxa, 0.25);
            gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, P.joelho, 0.25);
            gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, P.joelho, 0.25);
            gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, P.bracoX, 0.25);
            gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, P.bracoX, 0.25);
            gkRig.lElbow.rotation.x = lerpTo(gkRig.lElbow.rotation.x, P.cotovelo, 0.25);
            gkRig.rElbow.rotation.x = lerpTo(gkRig.rElbow.rotation.x, P.cotovelo, 0.25);
            gkRig.chest.rotation.x = lerpTo(gkRig.chest.rotation.x, P.chest, 0.25);
            gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + P.altura, 0.25);

            /*
            Entra nesta fase com a rotação de onde quer que estivesse a
            defesa (mergulho de lado, apanhada de costas) — ninguém a
            corrigia durante os 8s de espera. Assenta a virar devagar para
            o campo (direcção de ataque), pronto a relançar.
            */
            const rotAlvo = (this.dirZ === 1) ? 0 : Math.PI;
            gkCorpo.rotation.y = lerpTo(gkCorpo.rotation.y, rotAlvo, 0.06);

            if (t >= GoalkeeperPose.segurarDur) {
                this.gkEstado = 'idle';
                this.resetBonesToDefault();
            }
        }
        if (dt > 0.0001 && this.gkEstado === 'idle') {
            this.velocity.set(gkCorpo.position.x - prevX, 0, gkCorpo.position.z - prevZ).multiplyScalar(1 / dt);
        } else if (this.gkEstado !== 'idle') {
            this.velocity.set(0, 0, 0);
        }
    }

    /*
    Chamado quando o GR agarra a bola (defesa mansa, mergulho ou salto alto).
    Não larga logo para o BT/FSM decidir — entra em 'segurando' para as
    equipas terem tempo de se reorganizar antes do relançamento.
    */
    grabBall() {
        Match.ballVel.set(0, 0, 0);
        this.hasBall = true;
        Match.ballCarrier = this;
        Match.possessionTeam = this.team;
        Match.possessionTimer = 0;
        window.bolaChutada = false;
        this.gkEstado = 'segurando';
        this.gkTempoMergulho = 0;
    }
}

