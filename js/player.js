/*
Amostra o clip do chutão do guarda-redes (GoalkeeperKickClip) num tempo
normalizado 0..1, interpolando linearmente entre os dois keyframes vizinhos.
Devolve um objecto com os mesmos campos de um keyframe.
*/
function amostrarClipChuteGR(norm) {
    const fr = GoalkeeperKickClip.frames;
    const n = fr.length;
    const pos = THREE.MathUtils.clamp(norm, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(pos));
    const u = pos - i;
    const a = fr[i], b = fr[i + 1];
    const mix = (k) => a[k] + (b[k] - a[k]) * u;
    return {
        chest: mix('chest'),
        coxaChute: mix('coxaChute'),
        joelhoChute: mix('joelhoChute'),
        coxaApoio: mix('coxaApoio'),
        joelhoApoio: mix('joelhoApoio'),
        bracoX: mix('bracoX'),
        cotovelo: mix('cotovelo'),
        altura: mix('altura')
    };
}

/*
Amostra o clip do corte diagonal (DribbleCutClip) num tempo normalizado 0..1.
Mesmo esquema do clip do guarda-redes: interpolação linear entre vizinhos.
*/
function amostrarClipCorte(norm) {
    const fr = DribbleCutClip.frames;
    const n = fr.length;
    const pos = THREE.MathUtils.clamp(norm, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(pos));
    const u = pos - i;
    const a = fr[i], b = fr[i + 1];
    const mix = (k) => a[k] + (b[k] - a[k]) * u;
    return {
        leanZ: mix('leanZ'),
        quadrilY: mix('quadrilY'),
        troncoY: mix('troncoY'),
        coxaExt: mix('coxaExt'),
        joelhoExt: mix('joelhoExt'),
        bracoZ: mix('bracoZ')
    };
}

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

        // Corte diagonal de 30° (DRIBBLE_CUT_30) — ver estado CUT em fsm.js.
        this.cutAtivo = false;
        this.cutNorm = 0;
        this.cutLado = 1;
        this.cutTimer = 0;
        this.cutToquesFeitos = 0;
        this.cutDirIni = new THREE.Vector3(0, 0, 1);
        this.cutVel = 0;
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
        this.gkStyle = 'defensive';     // estado actual (dinâmico) — ver updateGkStyle em team_bt.js
        this.gkStyleBase = 'defensive'; // traço fixo do jogador, atribuído em match.js
        this.fbStyle = 'defensive';     // espelho do playing style, lido por attackFullBack

        // Playing style (ver PlayingStyles em config.js e playing_styles.js).
        // `playingStyleFixo` é a escolha explícita e sobrevive a mudanças de
        // formação; `playingStyle` é a chave em vigor depois da validação.
        this.playingStyle = null;
        this.playingStyleFixo = null;
        this.styleFlags = {};
        this.gkTempoMergulho = 0;
        this.gkDirMergulho = 0;
        this.gkTipoMergulho = 'baixo';
        this.gkAlvoX = 0;      // x previsto da bola, usado pelo estado 'maos'
        this.gkKickAction = null;  // ActionState do chutão (estado 'chutando')
        this.gkKickNorm = 0;
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

    /*
    Genérico (médias do painel esquerdo, por função) — só serve de FALLBACK
    quando o jogador não tem `skills` individuais (ex.: antes do
    data/player_skills.js carregar) e como referência pra gerar um time novo
    no .json (ver tools/gen_player_skills.js). Decisões em jogo usam
    skillFor(campo), que lê o skill individual real dele.
    */
    getSkill() {
        if (this.role === 'def') return TeamSkills[this.team].def;
        if (this.role === 'mid') return TeamSkills[this.team].mid;
        if (this.role === 'atk') return TeamSkills[this.team].ata;
        return TeamSkills[this.team].gk;
    }

    /*
    Skill individual (data/player_skills.js) por campo — gk/tec/marking/
    speed/strength/pass/intercept. Sem skills carregados, cai no genérico.
    As chaves em p.skills são MINÚSCULAS (gerado por tools/gen_player_skills.js)
    — normaliza aqui pra chamar com 'TEC', 'tec' ou qualquer caixa e não
    depender de quem chama acertar a grafia exacta.
    */
    skillFor(campo) {
        if (this.skills) {
            const v = this.skills[String(campo).toLowerCase()];
            if (typeof v === 'number') return v;
        }
        return this.getSkill();
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
    Passe de pânico: findPassTarget/findPassTargetRelaxed exigem a LINHA
    inteira até ao colega livre de adversários (minOppDist >= safetyLimit).
    Se houver um adversário deitado nessa linha — típico de pressão vinda de
    trás, o marcador fica exactamente entre o portador e o apoio atrás — todo
    e qualquer candidato falha ali, mesmo com o colega completamente livre no
    destino. Sem alternativa o jogador cai no fallback (`actCarry`), tenta
    driblar, é cortado, recupera, tenta outra vez — o ciclo "corta, retoma"
    reportado. Este ignora a linha por completo e olha só se o PRÓPRIO
    colega está livre no ponto de chegada — arrisca mais, mas tira a bola de
    perto em vez de ficar preso.
    */
    findPassTargetDesperate() {
        let teammates = (this.team === 'TeamA') ? Match.players : Match.opponents;
        let opponents = (this.team === 'TeamA') ? Match.opponents : Match.players;
        let ownZ = this.model.position.z;
        let dirZ = this.dirZ;

        let melhor = null, melhorNota = -Infinity;
        for (const opt of teammates) {
            if (opt.id === this.id || opt.role === 'gk') continue;
            const optPos = alvoDePasse(opt);
            const dist = this.model.position.distanceTo(optPos);
            if (dist < 3.0 || dist > 35.0) continue;

            let distMarcador = 999;
            for (const opp of opponents) {
                if (opp.role === 'gk') continue;
                const d = optPos.distanceTo(opp.model.position);
                if (d < distMarcador) distMarcador = d;
            }
            if (distMarcador < 2.5) continue; // colega também marcado de perto: não vale a pena

            let nota = distMarcador * 5 - dist * 0.5;
            const progression = (optPos.z - ownZ) * dirZ;
            if (progression > 0) nota += 10;

            if (nota > melhorNota) { melhorNota = nota; melhor = opt; }
        }
        return melhor;
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

        /*
        Sector no REFERENCIAL DE ATAQUE (x * dirZ), como o
        Tatics.getWeightedSectorX já fazia (`-19 * teamDir` para 'esq').

        Antes classificava-se o x do MUNDO cru: para a equipa que ataca no
        sentido oposto, 'esq' do painel virava o flanco contrário. Resultado:
        a condução (carryTargetX, mirrored) puxava para um lado e o bónus de
        passe premiava o outro — as duas metades do sistema a anular-se, e
        nenhuma das equipas jogava consistentemente pelas pontas.
        */
        const getSectorOfX = (x) => {
            const xAtk = x * dirZ;
            if (xAtk < -10) return 'esq';
            if (xAtk > 10) return 'dir';
            return 'cen';
        };

        let skillVal = this.skillFor('PASS');
        let safetyLimit = 1.7 + (1.0 - (skillVal / 100)) * 1.5;

        let opponents = (this.team === 'TeamA') ? Match.opponents : Match.players;
        let ratedCandidates = [];

        for (let opt of options) {
            let optPos = alvoDePasse(opt);
            let dist = this.model.position.distanceTo(optPos);

            /*
            Tectos de distância eram curtos demais (46m no balanceado) para
            um campo de 106m — um atacante completamente livre mas longe
            (ex.: CARRY ainda no meio-campo, CF já lançado lá à frente)
            nunca sequer ENTRAVA na lista de candidatos, por mais aberto que
            estivesse. Alargado para cobrir o campo quase todo.
            */
            let inStyleRange = false;
            if (Tatics.passe === 'curto') {
                inStyleRange = (dist >= 3.0 && dist <= 32.0);
            } else if (Tatics.passe === 'longo') {
                inStyleRange = (dist >= 20.0 && dist <= 70.0);
            } else {
                inStyleRange = (dist >= 4.0 && dist <= 60.0);
            }
            if (!inStyleRange) continue;

            _line1.set(this.model.position, optPos);
            let minOppDist = 999, oppMaisPerto = null;
            for (let i = 0; i < opponents.length; i++) {
                let opp = opponents[i];
                if (opp.role === 'gk') continue;
                _line1.closestPointToPoint(opp.model.position, true, _v1);
                let d = _v1.distanceTo(opp.model.position);
                if (d < minOppDist) {
                    minOppDist = d;
                    oppMaisPerto = opp;
                }
            }

            /*
            Passe x Interceptação: o adversário mais perto da linha ameaça
            mais ou menos consoante o INTERCEPT dele contra o PASS de quem
            está a passar — bom interceptador precisa de menos proximidade
            pra ser perigo, bom passador arrisca-se mais perto dele.
            */
            let safetyEff = safetyLimit;
            if (oppMaisPerto) {
                const fatorIntercept = THREE.MathUtils.clamp(
                    1 + (oppMaisPerto.skillFor('INTERCEPT') - skillVal) / 150, 0.6, 1.6);
                safetyEff = safetyLimit * fatorIntercept;
            }
            if (minOppDist < safetyEff) continue;

            let score = 100;

            /*
            Bónus por estar livre de marcação — era Math.min(50, ...), um
            teto que tratava "levemente livre" e "completamente sozinho no
            campo" quase da mesma forma. Pedido explícito: quem está sem
            marcação tem de ter pontuação de passe GRANDE, não só "um pouco
            melhor". Tecto subido para 110 e a inclinação mais acentuada.
            */
            score += Math.min(110, (minOppDist - safetyLimit) * 22);

            // Grid espacial (camada PASSE): soma o valor autorado da célula do alvo.
            if (typeof SpatialGrid !== 'undefined' && SpatialGrid.cells) {
                score += SpatialGrid.layerValueAt('pass', optPos.x, optPos.z, this.team) * 0.4;
            }

            /*
            Playing style do CANDIDATO: um Target Man ou um Creative Playmaker
            é procurado mais vezes como destino de passe; um Dummy Runner (que
            está de propósito a puxar marcação, não a oferecer-se) menos.
            */
            if (typeof estiloAtivoDe === 'function') score *= estiloAtivoDe(opt).passe;

            let optSec = getSectorOfX(optPos.x);
            if (Tatics.setores.includes(optSec)) {
                // 30 -> 45 -> 67.5 -> 135 (+100%). Passa a ser o maior termo
                // isolado da nota, à frente do bónus de estar livre (tecto 110):
                // com menos do que isso o colega central livre ganhava sempre.
                score += 135;
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
        // Peso `remate` do playing style: um Fox in the Box remata de onde um
        // Cross Specialist ainda estaria a procurar quem cruzar.
        const porEstilo = (typeof estiloAtivoDe === 'function') ? estiloAtivoDe(this).remate : 1.0;
        return base * porFuncao * porEstilo * (ShootingModel.angleFloor + (1 - ShootingModel.angleFloor) * centralidade);
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
    /*
    Relançamento do GR: chutão para a frente, com os ângulos sorteados a cada
    execução (pedido do utilizador).

        elevação   25° a 50° acima da horizontal
        direcção   até 20° para cada lado do "a direito para a frente"

    A potência sai da balística e não de um número à mão: escolhida a
    distância de queda, `v = sqrt(R*g / sin(2θ))` dá a velocidade que põe a
    bola lá com a elevação sorteada. `g` é 15 aqui (ver updateBall).
    */
    puntBall() {
        const gGrav = BallPhysics.gravidade;
        const elev = THREE.MathUtils.degToRad(25 + Math.random() * 25);
        const desvio = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * 20);

        // Alcance pretendido: chutão de meio-campo, com alguma variação.
        const alcance = 38 + Math.random() * 16;
        const v = Math.min(42, Math.sqrt((alcance * gGrav) / Math.sin(2 * elev)));

        // Frente da equipa (dirZ), rodada pelo desvio lateral sorteado.
        const horiz = v * Math.cos(elev);
        _v2.set(0, 0, this.dirZ).applyAxisAngle(_vUp, desvio);
        Match.ballVel.set(_v2.x * horiz, v * Math.sin(elev), _v2.z * horiz);

        this.hasBall = false;
        this.touchLock = BallControl.touchLock;
        Match.ballCarrier = null;
        // Ninguém é destinatário nomeado de um chutão — a bola vai para o
        // espaço, quem lá chegar disputa (ver resolveBallContact).
        Match.intendedReceiver = null;
        // Sem isto o próprio GK falhava o filtro anti-falso-positivo de
        // isCross (lastTouchedPlayer !== this) e saltava logo a seguir ao
        // seu próprio relançamento, achando que era um cruzamento a chegar.
        Match.lastTouchedTeam = this.team;
        Match.lastTouchedPlayer = this;
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

            // Conectar bem a cabeçada é Técnica x Marcação (marcador mais
            // perto dele) — base 0.55, favorece quem salta pra bola.
            const opponentsHead = (this.team === 'TeamA') ? Match.opponents : Match.players;
            let marcador = null, distMarc = 999;
            for (const opp of opponentsHead) {
                if (opp.role === 'gk') continue;
                const d = opp.model.position.distanceTo(this.model.position);
                if (d < 2.0 && d < distMarc) { distMarc = d; marcador = opp; }
            }
            const cabeceadaLimpa = !marcador || venceuDuelo(this.skillFor('TEC'), marcador.skillFor('MARKING'), 0.55);

            let maxC = (LARGURA_BALIZA / 2) - 0.5;
            let alvoX, alvoY, pow;
            if (!cabeceadaLimpa) {
                // Marcador ganhou o salto: cabeçada sai fraca e desviada.
                alvoX = this.model.position.x + (Math.random() - 0.5) * 5.0;
                alvoY = 0.3;
                pow = 5.0 + Math.random() * 3.0;
            } else {
                const gkAdversario0 = (this.team === 'TeamA') ? Match.opponents[0] : Match.players[0];
                // Técnica x GK decide o canto: vencer aponta perto do poste.
                const venceuGK = gkAdversario0 ? venceuDuelo(this.skillFor('TEC'), gkAdversario0.skillFor('GK'), 0.5) : true;
                const cantoC = venceuGK ? maxC * 0.88 : maxC * 0.5;
                alvoX = (Math.random() > 0.5 ? 1 : -1) * cantoC;
                alvoY = Math.random() * 1.5 + 0.3;
                pow = 16.0 + ((this.skillFor('TEC') - 50) / 50) * 8.0;
            }

            /*
            Mesma correcção do remate: mira pela elevação resolvida, e não
            apontando a direcção 3D ao alvo. Apontar direito ao ponto ignora
            a queda durante o voo — a bola passava sempre por baixo dele.
            */
            const alvoZc = cabeceadaLimpa ? this.targetGoalZ : Match.ball.position.z + this.dirZ * 3;
            const dxC = alvoX - Match.ball.position.x;
            const dzC = alvoZc - Match.ball.position.z;
            const distHC = Math.hypot(dxC, dzC);
            const elevC = elevacaoParaAlvo(distHC, alvoY, pow);
            const eC = (elevC === null) ? Math.PI / 5 : elevC;
            const vhC = pow * Math.cos(eC);
            Match.ballVel.set(
                (distHC > 0.001 ? dxC / distHC : 0) * vhC,
                pow * Math.sin(eC),
                (distHC > 0.001 ? dzC / distHC : this.dirZ) * vhC
            );
            this.hasBall = false;
            this.touchLock = BallControl.touchLock;
            Match.ballCarrier = null;

            if (cabeceadaLimpa) {
                let defendingTeam = (this.team === 'TeamA') ? 'TeamB' : 'TeamA';
                // Notifica o GK adversário com o seu delay de reacção próprio.
                const gkAdversario = (this.team === 'TeamA') ? Match.opponents[0] : Match.players[0];
                if (gkAdversario) {
                    gkAdversario.gkDelayReacao = 0.45 - ((TeamSkills[defendingTeam].gk - 50) / 50) * 0.35;
                    gkAdversario.gkReagiu = false;
                }
                window.bolaChutada = true;
            }
        } else {
            let target = this.findPassTarget('mid') || this.findPassTarget('atk') || this.findPassTarget('def');
            if (target) {
                // Passe de recurso — mesma balística do passe normal (ver
                // executePassGameplay em fsm.js), não a heurística antiga.
                const dxP = target.model.position.x - Match.ball.position.x;
                const dzP = target.model.position.z - Match.ball.position.z;
                const distToTarget = Math.hypot(dxP, dzP);
                const uxP = distToTarget > 0.001 ? dxP / distToTarget : 0;
                const uzP = distToTarget > 0.001 ? dzP / distToTarget : this.dirZ;

                if (distToTarget > PassModel.distAereo) {
                    const eP = PassModel.elevacaoCurta;
                    const vP = velocidadeParaAlcance(distToTarget, eP);
                    Match.ballVel.set(uxP * vP * Math.cos(eP), vP * Math.sin(eP), uzP * vP * Math.cos(eP));
                } else {
                    const vP = velocidadeRasteiraPara(distToTarget, PassModel.vChegadaRasteira);
                    Match.ballVel.set(uxP * vP, 0, uzP * vP);
                }
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
        Freeze do kickoff: runBehaviorTree/fsm ficavam a correr por jogador
        mesmo com o Match.runTeamAI() travado (Match.update trava só o nível
        de equipa), e o PlayerBT sozinho já reposicionava toda a gente —
        incluindo o taker/apoio, que se afastavam da bola antes do toque
        inicial. Aqui pára tudo: sem decisão, sem movimento, só idle.
        */
        if (Match.kickoffActive) {
            this.velocity.set(0, 0, 0);
            // Bola fica presa no centro (não gruda no pé do taker) — ele fica
            // só encostado. O lerp para o pé (usado no jogo normal) ia
            // arrastando a bola do centro pra fora durante os 4s de espera.
            // GK usa pose própria (updateGK), não o animateBones de jogador
            // de campo — chamá-lo aqui deixava o guarda-redes preso na pose
            // de mergulho/salto anterior (ajoelhado, de costas).
            if (this.role === 'gk') this.resetBonesToDefault();
            else this.animateBones(dt);
            return;
        }

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

        if (this.role === 'gk' && Match.state !== 'CORNER_KICK') {
            this.updateGK(dt);
        } else {
            this.runBehaviorTree(dt);
            this.fsm.update(dt);
            this.model.position.add(this.velocity.clone().multiplyScalar(dt));
        }

        if (this.hasBall) {
            if (this.role === 'gk') {
                // GR segura a bola nas mãos, junto ao PEITO (não à cintura) —
                // não ao nível do pé como no dribble de um jogador de campo
                // (senão fica só pousada no chão à frente dele).
                let maoY = this.model.position.y + (this.gkEstado === 'apanhar' ? 0.55 : 1.15);
                let avancoBola = 0.3;
                /*
                Durante o gesto do chutão a bola tem de descer das mãos até ao
                pé, senão o pé bate no vazio e ela sai da altura do peito. Cai
                entre a máxima preparação (largaBolaEm) e o contacto.
                */
                if (this.gkEstado === 'chutando') {
                    const K = GoalkeeperKickClip;
                    const cont = ActionAnimClips.gkPunt.contactTime;
                    const u = THREE.MathUtils.clamp(
                        ((this.gkKickNorm || 0) - K.largaBolaEm) / (cont - K.largaBolaEm), 0, 1);
                    maoY = this.model.position.y + K.alturaMao + (K.alturaPe - K.alturaMao) * u;
                    avancoBola = 0.3 + 0.35 * u;
                }
                let maoOffset = new THREE.Vector3(0, 0, avancoBola).applyQuaternion(this.model.quaternion);
                Match.ball.position.lerp(this.model.position.clone().add(maoOffset).setY(maoY), 0.5);
                Match.ballVel.set(0, 0, 0);
            } else {
                // +0.4m pedido: bola de domínio mais afastada do jogador, à frente.
                let footOffset = new THREE.Vector3(0, 0, 0.8).applyQuaternion(this.model.quaternion);
                Match.ball.position.lerp(this.model.position.clone().add(footOffset), 0.5);
                Match.ball.position.y = BallPhysics.raio; Match.ballVel.set(0, 0, 0);
            }
        }
        if (this.role === 'gk' && Match.state !== 'CORNER_KICK') {
        } else {
            this.animateBones(dt);
            // Camada do corte diagonal POR CIMA do ciclo de corrida — tem de
            // vir depois do animateBones, senão ele reescreve a pelvis e as
            // pernas no mesmo frame e o corte desaparece.
            this.aplicarCamadaCorte();
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

        // Recuar de frente pra bola (backpedal) só faz sentido quando o
        // deslocamento é mesmo predominantemente para trás. Antes bastava o Z
        // mudar >2.5m para forçar o corpo a olhar para a bola, mesmo com um
        // deslocamento em X muito maior (ex.: marcação lateral) — o jogador
        // corria de lado, de frente pra bola, com a animação de corrida à
        // frente a não bater com a direcção real do movimento.
        let isRetreating = false;
        if (this.role === 'def' || this.role === 'mid') {
            const dx = target.x - this.model.position.x;
            const dz = target.z - this.model.position.z;
            let backingUp = false;
            if (this.team === 'TeamA' && target.z < this.model.position.z - 2.5) backingUp = true;
            if (this.team === 'TeamB' && target.z > this.model.position.z + 2.5) backingUp = true;
            if (backingUp && Math.abs(dz) > Math.abs(dx)) isRetreating = true;
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

    /*
    DRIBBLE_CUT_30, camada CORPO + PERNAS (ver DribbleCutClip em config.js).

    Aditiva de propósito: o ciclo de corrida do animateBones continua a mandar
    nas passadas, e isto só acrescenta a inclinação lateral, a rotação do
    quadril e o viés diagonal da perna externa. O tronco contra-roda (troncoY
    tem sinal oposto ao quadrilY), que é o que mantém o peito parcialmente
    virado para a frente enquanto o centro de massa já foi para a diagonal.
    */
    aplicarCamadaCorte() {
        if (!this.cutAtivo || !this.rig) return;

        const C = amostrarClipCorte(this.cutNorm);
        const lado = this.cutLado;
        const rig = this.rig;

        rig.pelvis.rotation.z += C.leanZ * lado;
        rig.pelvis.rotation.y += C.quadrilY * lado;
        rig.chest.rotation.y += C.troncoY * lado;

        // Perna externa é a do lado CONTRÁRIO ao corte: é ela que planta no
        // chão e empurra o corpo para a nova direcção.
        const pernaExt = (lado > 0) ? rig.lLeg : rig.rLeg;
        const joelhoExt = (lado > 0) ? rig.lKnee : rig.rKnee;
        pernaExt.rotation.x += C.coxaExt;
        joelhoExt.rotation.x += C.joelhoExt;

        // Braço contrário abre para equilibrar.
        const bracoOposto = (lado > 0) ? rig.lArm : rig.rArm;
        bracoOposto.rotation.z += C.bracoZ * lado;
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

            let gkSkill = this.skillFor('GK');

            let bolaVindoPraMim = (this.team === 'TeamA') ? (Match.ballVel.z < -5) : (Match.ballVel.z > 5);

            if (bolaVindoPraMim && this.gkReagiu) {
                let tempoAteGolo = Math.abs(gkCorpo.position.z - Match.ball.position.z) / Math.abs(Match.ballVel.z);
                if (tempoAteGolo > 0 && tempoAteGolo < 1.5) {
                    let interX = Match.ball.position.x + (Match.ballVel.x * tempoAteGolo);
                    let interY = Match.ball.position.y + Match.ballVel.y * tempoAteGolo - 0.5 * BallPhysics.gravidade * tempoAteGolo * tempoAteGolo;
                    interX = Math.max(-limitGKX, Math.min(limitGKX, interX)); interY = Math.max(0, Math.min(2.44, interY));

                    /*
                    Bola perto do corpo não é mergulho: fica de pé e leva as
                    mãos até ela (ver estado 'maos'). Só se atira ao chão se
                    ela passar a mais de GoalkeeperPose.mergulhoLateralMin do
                    lado dele.
                    */
                    const lateral = interX - gkCorpo.position.x;
                    this.gkTempoMergulho = 0;
                    this.gkAlvoX = interX;
                    if (Math.abs(lateral) < GoalkeeperPose.mergulhoLateralMin) {
                        this.gkEstado = 'maos';
                    } else {
                        this.gkEstado = 'mergulho';
                        this.gkDirMergulho = Math.sign(lateral);
                        if (interY > 1.6) this.gkTipoMergulho = 'alto'; else if (interY > 0.8) this.gkTipoMergulho = 'meio'; else this.gkTipoMergulho = 'baixo';
                    }
                }
                speedLerp = 3.0 + ((gkSkill - 50) / 50) * 6.0;
            } else if (Match.state === 'PLAY') {
                let isAttacking = (Match.possessionTeam === this.team);
                let bolaNaArea = (Math.abs(Match.ball.position.x) < 20.16 && Match.ball.position.z * this.dirZ < -36.5);
                
                // Exclui a bola que ele mesmo acabou de chutar (relançamento/
                // reposição) — sem isto, um pontapé de baliza contava como
                // cruzamento a entrar na própria área e o GK saltava/mergulhava
                // logo a seguir ao próprio chute.
                let isCross = (Match.ballVel.y > 2.0 && Match.ball.position.y > 1.2 && Math.abs(Match.ball.position.z) > 24 && !Match.ballCarrier && Match.lastTouchedPlayer !== this);

                /*
                Bola solta, lenta, perto dele — passe atrás do próprio time
                ou bola perdida do adversário, tanto faz: ele SEMPRE apanha
                com as mãos, nunca controla com o pé. Antes isto só existia
                dentro do ramo "!isAttacking && bolaNaArea" — um passe atrás
                enquanto o próprio time tinha posse nunca disparava o
                'apanhar', e a bola acabava só grudada ao pé dele (resolvida
                por resolveBallContact() como qualquer jogador de linha).
                */
                const semDono = !Match.ballCarrier;
                const mansinha = Match.ballVel.length() < BallControl.easySpeed;
                const distBolaAgora = gkCorpo.position.distanceTo(Match.ball.position);

                if (semDono && mansinha && distBolaAgora < 10.0) {
                    alvoGkX = Match.ball.position.x;
                    alvoGkZ = Match.ball.position.z;
                    speedLerp = 5.5;
                    if (distBolaAgora < 1.2) {
                        this.gkEstado = 'apanhar';
                        this.gkTempoMergulho = 0;
                    }
                } else if (isCross) {
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
                                // Mesma regra do remate: bola perto do corpo é
                                // defesa de pé com as mãos, não mergulho.
                                const lateralEsp = Match.ball.position.x - gkCorpo.position.x;
                                this.gkTempoMergulho = 0;
                                this.gkAlvoX = Match.ball.position.x;
                                if (Math.abs(lateralEsp) < GoalkeeperPose.mergulhoLateralMin) {
                                    this.gkEstado = 'maos';
                                } else {
                                    this.gkEstado = 'mergulho';
                                    this.gkDirMergulho = Math.sign(lateralEsp);
                                    this.gkTipoMergulho = Match.ball.position.y > 1.2 ? 'alto' : 'baixo';
                                }
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
            let gkSkill = this.skillFor('GK');
            let skillSpeed = 4.0 + ((gkSkill - 50) / 50) * 5.0;

            /*
            Braços proceduais: em vez de pose fixa (rotation.z=±2.5 sempre,
            independente de onde a bola realmente está), aponta pra ela a
            cada frame — sobe mais se ela vier alta, abre mais se estiver
            longe dos ombros. Clampado pelos limites de JointLimits.shoulder
            (ombro é 3DOF acoplado, ver clampOmbro).
            */
            if (t < 1.2) {
                const ombroY = gkCorpo.position.y + 0.35;
                const dyBola = Match.ball.position.y - ombroY;
                const dxBola = Match.ball.position.x - gkCorpo.position.x;

                let elevX = Math.atan2(Math.max(-0.3, dyBola), 1.0) * 1.6;
                let abreZ = 1.3 + Math.min(1.4, Math.abs(dxBola) * 0.12);
                const clamped = (typeof JointLimits !== 'undefined')
                    ? JointLimits.clampOmbro(elevX, 0, abreZ)
                    : { x: elevX, z: abreZ };

                gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, clamped.x, 0.3);
                gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, clamped.x, 0.3);
                gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, clamped.z, 0.3);
                gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -clamped.z, 0.3);
            }

            if (t < 0.6) {
                gkCorpo.position.x += dirX * skillSpeed * dt;
                if (dirX !== 0) {
                    gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + (tipo === 'alto' ? 0.6 : 0.1), 0.2);
                    // Sinal invertido: saltava pro lado certo (position.x
                    // += dirX*v está bem) mas o corpo inclinava/virava pro
                    // lado oposto ao salto.
                    gkRig.pelvis.rotation.z = lerpTo(gkRig.pelvis.rotation.z, -dirX * 1.2, 0.2);
                } else {
                    gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + (tipo === 'alto' ? 0.8 : -0.2), 0.2);
                }
            } else if (t < 1.2) {
                if (dirX !== 0) { gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y - 0.15, 0.2); gkRig.pelvis.rotation.z = lerpTo(gkRig.pelvis.rotation.z, -dirX * 1.57, 0.2); }
            } else if (t < 1.8) {
                /*
                Mergulho de LADO já tem o corpo quase todo rodado no roll
                (pelvis.rotation.z ~1.57, ajustado acima) — somar um pitch
                (rotation.x) tão grande quanto o de uma queda de frente
                (1.2) compunha os dois eixos ao mesmo tempo e deixava o
                boneco "virado"/torcido em vez de deitado de lado. Reduzido
                bastante só pra dive lateral; queda de frente (dirX===0,
                sem chegar aqui) não é afectada.
                */
                if (dirX !== 0) { gkRig.pelvis.rotation.x = lerpTo(gkRig.pelvis.rotation.x, 0.35, 0.2); gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, 1.8, 0.2); gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, 1.8, 0.2); }
            } else if (t < 2.5) {
                gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y, 0.15); gkRig.pelvis.rotation.x = lerpTo(gkRig.pelvis.rotation.x, 0, 0.15); gkRig.pelvis.rotation.z = lerpTo(gkRig.pelvis.rotation.z, 0, 0.15);
            } else { this.gkEstado = 'idle'; this.resetBonesToDefault(); }

            /*
            Ponto de defesa tem de ser a mão, não a barriga — projecta a
            partir do ângulo REAL do braço líder (o do lado do mergulho),
            já procedural (ver bloco acima), em vez de um offset fixo que
            ignorava pra onde o braço estava mesmo a apontar.
            */
            const bracoRefMerg = (dirX >= 0) ? gkRig.rArm : gkRig.lArm;
            const alcanceMerg = 0.9;
            const maoMergX = gkCorpo.position.x + Math.sin(Math.abs(bracoRefMerg.rotation.z)) * alcanceMerg * (dirX || 1);
            const maoMergY = gkCorpo.position.y + 0.35 + Math.sin(bracoRefMerg.rotation.x) * alcanceMerg;
            const distMaoMerg = Math.hypot(maoMergX - Match.ball.position.x, maoMergY - Match.ball.position.y, gkCorpo.position.z - Match.ball.position.z);
            // Bola já lá dentro (atrás da linha): mão nenhuma vai lá buscar —
            // sem isto uma defesa em curso podia "reflectir" o que já é golo.
            const jaEntrou = (Match.state !== 'PLAY');
            if (!jaEntrou && t < 1.2 && distMaoMerg < 1.3 && Match.ballVel.lengthSq() > 0) {
                let catchChance = 0.35 + (gkSkill - 50) / 100;
                if (Math.random() < catchChance) {
                    this.grabBall();
                } else {
                    Match.ballVel.z *= -0.5; Match.ballVel.x += (Math.random() - 0.5) * 10; Match.ballVel.y += 3;
                }
            }
        } else if (this.gkEstado === 'maos') {
            /*
            Defesa de PÉ: a bola vem a menos de mergulhoLateralMin do corpo, e
            atirar-se ao chão para uma bola que passa ao lado do peito é o que
            deixava o guarda-redes sempre deitado/torcido. Aqui o corpo fica
            direito e só os braços vão à bola, dentro dos limites das juntas
            (JointLimits.clampOmbro).

            Braços simétricos de propósito: `rArm`/`lArm` são o lado ESQUERDO/
            DIREITO do modelo, e o modelo está rodado por lookAt conforme a
            equipa — mapear "braço do lado da bola" a partir do x do mundo dá
            o braço errado para uma das equipas. Abrir os dois na mesma
            amplitude é correcto para ambas, e o ponto de contacto abaixo
            escolhe a mão mais perto da bola.
            */
            this.gkTempoMergulho += dt;
            const tM = this.gkTempoMergulho;
            const gkSkillM = this.skillFor('GK');
            const Pm = GoalkeeperPose.espera;

            // Um passo curto para o lado da bola — não é deslocação, é ajuste.
            if (typeof this.gkAlvoX === 'number') {
                gkCorpo.position.x = lerpTo(gkCorpo.position.x, this.gkAlvoX, 0.12);
            }

            gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + Pm.altura, 0.25);
            gkRig.pelvis.rotation.x = lerpTo(gkRig.pelvis.rotation.x, 0, 0.3);
            gkRig.pelvis.rotation.z = lerpTo(gkRig.pelvis.rotation.z, 0, 0.3);
            gkRig.chest.rotation.x = lerpTo(gkRig.chest.rotation.x, Pm.chest, 0.25);
            gkRig.lLeg.rotation.x = lerpTo(gkRig.lLeg.rotation.x, Pm.coxa, 0.25);
            gkRig.rLeg.rotation.x = lerpTo(gkRig.rLeg.rotation.x, Pm.coxa, 0.25);
            gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, Pm.joelho, 0.25);
            gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, Pm.joelho, 0.25);
            gkRig.lLeg.rotation.z = lerpTo(gkRig.lLeg.rotation.z, Pm.abertura, 0.25);
            gkRig.rLeg.rotation.z = lerpTo(gkRig.rLeg.rotation.z, -Pm.abertura, 0.25);

            const ombroYm = gkCorpo.position.y + 0.35;
            const dyM = Match.ball.position.y - ombroYm;
            const dxM = Match.ball.position.x - gkCorpo.position.x;
            const alcanceM = 0.9;

            // Elevação pela altura da bola, abertura pelo afastamento lateral.
            let elevM = Math.atan2(dyM, 0.8) * 1.2;
            let abreM = 0.20 + Math.min(1.3, Math.abs(dxM) * 0.65);
            const clM = (typeof JointLimits !== 'undefined')
                ? JointLimits.clampOmbro(elevM, 0, abreM)
                : { x: elevM, z: abreM };

            gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, clM.x, 0.4);
            gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, clM.x, 0.4);
            gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, clM.z, 0.4);
            gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -clM.z, 0.4);
            gkRig.lElbow.rotation.x = lerpTo(gkRig.lElbow.rotation.x, -0.25, 0.4);
            gkRig.rElbow.rotation.x = lerpTo(gkRig.rElbow.rotation.x, -0.25, 0.4);

            /*
            Ponto de contacto: as duas mãos, projectadas do ângulo REAL do
            ombro. Vale a que estiver mais perto da bola — assim não é preciso
            saber qual dos braços é o do lado dela.
            */
            const espalhoM = Math.sin(Math.abs(gkRig.lArm.rotation.z)) * alcanceM;
            const maoYm = ombroYm + Math.sin(gkRig.lArm.rotation.x) * alcanceM;
            const dxMaoM = Math.min(
                Math.abs((gkCorpo.position.x + espalhoM) - Match.ball.position.x),
                Math.abs((gkCorpo.position.x - espalhoM) - Match.ball.position.x)
            );
            const distMaoM = Math.hypot(dxMaoM, maoYm - Match.ball.position.y, gkCorpo.position.z - Match.ball.position.z);

            const jaEntrouM = (Match.state !== 'PLAY');
            if (!jaEntrouM && distMaoM < 1.3 && Match.ballVel.lengthSq() > 0) {
                // Bola ao alcance do corpo é defesa mais fácil do que um
                // mergulho esticado: agarra com mais frequência.
                const catchChanceM = 0.55 + (gkSkillM - 50) / 100;
                if (Math.random() < catchChanceM) {
                    this.grabBall();
                } else {
                    Match.ballVel.z *= -0.4; Match.ballVel.x += (Math.random() - 0.5) * 6; Match.ballVel.y += 2;
                }
            }

            if (tM >= GoalkeeperPose.maosDur) {
                this.gkEstado = 'idle';
                this.resetBonesToDefault();
            }
        } else if (this.gkEstado === 'salto_alto') {
            this.gkTempoMergulho += dt; let t = this.gkTempoMergulho;
            let gkSkill = this.skillFor('GK');

            if (t < 0.3) {
                let jumpH = 0.8 + ((gkSkill - 50) / 50) * 0.6;
                gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + jumpH, 0.25);

                /*
                Procedural: braços por cima da cabeça, mas inclinam pro lado
                de onde a bola realmente vem em vez de subir sempre no eixo
                central. Clampado por JointLimits.shoulder.
                */
                const dxBolaSalto = Match.ball.position.x - gkCorpo.position.x;
                const alvoZSalto = JointLimits.clamp('shoulder', 'z', 2.8 + THREE.MathUtils.clamp(dxBolaSalto * 0.05, -0.3, 0.3));
                const alvoXSalto = JointLimits.clamp('shoulder', 'x', -0.5);
                gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, alvoZSalto, 0.3);
                gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -alvoZSalto, 0.3);
                gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, alvoXSalto, 0.3);
                gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, alvoXSalto, 0.3);
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

            // Mesma correcção do mergulho: projecta a mão a partir do ângulo
            // REAL do braço (procedural acima), não um offset fixo.
            const alcanceSalto = 0.95;
            const maoSaltoX = gkCorpo.position.x + Math.sin(gkRig.rArm.rotation.z) * alcanceSalto;
            const maoSaltoY = gkCorpo.position.y + 0.35 + Math.cos(gkRig.rArm.rotation.x) * alcanceSalto;
            const distMaoSalto = Math.hypot(maoSaltoX - Match.ball.position.x, maoSaltoY - Match.ball.position.y, gkCorpo.position.z - Match.ball.position.z);
            const jaEntrouSalto = (Match.state !== 'PLAY');
            if (!jaEntrouSalto && t < 0.7 && distMaoSalto < 1.4 && Match.ballVel.lengthSq() > 0) {
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
            /*
            Pose única: `segurar` já É a pose de repouso (de pé, direito,
            pernas descontraídas) com os braços dobrados a fechar a bola no
            peito. Não há fase agachada nenhuma — antes passava os primeiros
            0.4s na pose de 'apanhar', o que desfazia o snap feito em
            grabBall() e voltava a agachá-lo logo depois de agarrar.

            Também se aplicam aqui a abertura das pernas e o bracoZ: sem eles,
            qualquer pose anterior (mergulho de lado, com os braços abertos em
            z) ficava por corrigir e só o snap inicial a tapava.
            */
            const P = GoalkeeperPose.segurar;

            gkRig.lLeg.rotation.x = lerpTo(gkRig.lLeg.rotation.x, P.coxa, 0.25);
            gkRig.rLeg.rotation.x = lerpTo(gkRig.rLeg.rotation.x, P.coxa, 0.25);
            gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, P.joelho, 0.25);
            gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, P.joelho, 0.25);
            gkRig.lLeg.rotation.z = lerpTo(gkRig.lLeg.rotation.z, P.abertura, 0.25);
            gkRig.rLeg.rotation.z = lerpTo(gkRig.rLeg.rotation.z, -P.abertura, 0.25);
            gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, P.bracoX, 0.25);
            gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, P.bracoX, 0.25);
            gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, P.bracoZ, 0.25);
            gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -P.bracoZ, 0.25);
            gkRig.lElbow.rotation.x = lerpTo(gkRig.lElbow.rotation.x, P.cotovelo, 0.25);
            gkRig.rElbow.rotation.x = lerpTo(gkRig.rElbow.rotation.x, P.cotovelo, 0.25);
            gkRig.chest.rotation.x = lerpTo(gkRig.chest.rotation.x, P.chest, 0.25);
            gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + P.altura, 0.25);

            /*
            Entra nesta fase com a rotação de onde quer que estivesse a
            defesa (mergulho de lado, apanhada de costas) — ninguém a
            corrigia durante os 8s de espera, e ficava de costas pro campo.
            Vira já de frente, sempre — usa lookAtBola (o mesmo `.lookAt()`
            usado em todo o resto do jogo para orientar jogadores; um
            `rotation.y = 0/PI` calculado à mão aqui dava exactamente o
            oposto do esperado).
            */
            _v1.set(gkCorpo.position.x, gkCorpo.position.y, gkCorpo.position.z + this.dirZ * 10);
            lookAtBola(gkCorpo, _v1);

            if (t >= (this.gkSegurarDur ?? GoalkeeperPose.segurarDur)) {
                /*
                A bola já não sai no mesmo instante em que o tempo de espera
                acaba: entra o gesto do chuto (GOALKEEPER_KICK_FORWARD_HIGH) e
                é o ActionState que dispara o relançamento no frame do contacto
                pé-bola — mesmo padrão do passe (ver ActionAnimClips.pass).
                */
                this.gkEstado = 'chutando';
                this.gkTempoMergulho = 0;
                this.gkKickNorm = 0;
                this.gkKickAction = new ActionState('gkPunt', {
                    onContact: () => {
                        this.releaseFromHands();
                        if (typeof EventBus !== 'undefined') EventBus.emit('GK_RELEASE_BALL', { team: this.team, gk: this });
                    }
                });
            }
        } else if (this.gkEstado === 'chutando') {
            /*
            GOALKEEPER_KICK_FORWARD_HIGH — 12 keyframes em GoalkeeperKickClip,
            amostrados por tempo normalizado. O ActionState só trata do tempo e
            do instante do contacto; a pose é toda aplicada aqui.
            */
            const normK = this.gkKickAction ? this.gkKickAction.update(dt, this) : 1;
            this.gkKickNorm = normK;
            const K = amostrarClipChuteGR(normK);

            const chuteR = (GoalkeeperKickClip.pernaChute === 'r');
            const pernaC = chuteR ? gkRig.rLeg : gkRig.lLeg;
            const joelhoC = chuteR ? gkRig.rKnee : gkRig.lKnee;
            const pernaA = chuteR ? gkRig.lLeg : gkRig.rLeg;
            const joelhoA = chuteR ? gkRig.lKnee : gkRig.rKnee;

            pernaC.rotation.x = K.coxaChute;
            joelhoC.rotation.x = K.joelhoChute;
            pernaA.rotation.x = K.coxaApoio;
            joelhoA.rotation.x = K.joelhoApoio;
            pernaC.rotation.z = 0;
            pernaA.rotation.z = 0;

            gkRig.chest.rotation.x = K.chest;
            gkRig.lArm.rotation.x = K.bracoX;
            gkRig.rArm.rotation.x = K.bracoX;
            gkRig.lElbow.rotation.x = K.cotovelo;
            gkRig.rElbow.rotation.x = K.cotovelo;
            // Braços vão abrindo do fecho na bola (bracoZ 0.05) para o
            // equilíbrio, à medida que o gesto avança.
            const abreBraco = 0.05 + 0.45 * normK;
            gkRig.lArm.rotation.z = abreBraco;
            gkRig.rArm.rotation.z = -abreBraco;

            gkRig.pelvis.rotation.x = 0;
            gkRig.pelvis.rotation.z = 0;
            gkCorpo.position.y = ALTURA_BASE_Y + K.altura;

            // Continua virado para o campo durante todo o gesto.
            _v1.set(gkCorpo.position.x, gkCorpo.position.y, gkCorpo.position.z + this.dirZ * 10);
            lookAtBola(gkCorpo, _v1);

            if (!this.gkKickAction || this.gkKickAction.isDone()) {
                this.gkKickAction = null;
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
        // Não precisa esperar sempre os 8s fixos — 5-8s, sorteado a cada captura.
        this.gkSegurarDur = 5.0 + Math.random() * 3.0;
        /*
        Sem isto, um companheiro já marcado como intendedReceiver de um
        passe/desvio anterior continuava a correr direito pra
        Match.ball.position (agora nas mãos do GR) via Receber — passa por
        cima de tudo, incluindo o afastamento do commit().
        */
        Match.intendedReceiver = null;
        /*
        Vira já de frente pro campo (mesmo lookAtBola usado no resto do
        jogo — um rotation.y=0/PI calculado à mão dava de costas).
        */
        _v1.set(this.model.position.x, this.model.position.y, this.model.position.z + this.dirZ * 10);
        lookAtBola(this.model, _v1);

        /*
        Fecha os braços na hora. Sem isto, um braço que ainda estava na pose
        do mergulho/salto (esticado bem aberto, rotation.z ~1.5-2.8) só
        convergia pra pose de 'segurar' devagar (lerp 0.25-0.5/frame) —
        durante essa transição ficava com um braço erguido/aberto, o outro
        já fechado na bola, uma pose assimétrica de "um braço no ar".
        */
        if (this.rig) {
            const P = GoalkeeperPose.segurar;
            this.rig.lLeg.rotation.x = P.coxa; this.rig.rLeg.rotation.x = P.coxa;
            this.rig.lKnee.rotation.x = P.joelho; this.rig.rKnee.rotation.x = P.joelho;
            this.rig.lLeg.rotation.z = P.abertura; this.rig.rLeg.rotation.z = -P.abertura;
            this.rig.lArm.rotation.z = P.bracoZ; this.rig.rArm.rotation.z = -P.bracoZ;
            this.rig.lArm.rotation.x = P.bracoX; this.rig.rArm.rotation.x = P.bracoX;
            this.rig.lElbow.rotation.x = P.cotovelo; this.rig.rElbow.rotation.x = P.cotovelo;
            this.rig.chest.rotation.x = P.chest;
        }

        if (typeof EventBus !== 'undefined') EventBus.emit('GK_CATCH_BALL', { team: this.team, gk: this });
    }

    /*
    Fim da espera com a bola na mão: chutão para a frente, sempre.

    Antes havia um ramo de passe curto para um colega sem pressão. Saiu a
    pedido do utilizador — o relançamento é agora sempre o chutão do
    puntBall(), com elevação e direcção sorteadas lá dentro.
    */
    releaseFromHands() {
        this.puntBall();
    }
}

