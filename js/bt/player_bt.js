/*
=============================================================================
NÍVEL 3 — PLAYER BEHAVIOR TREE
=============================================================================
Corre uma vez por jogador por frame, DEPOIS dos níveis 1 e 2.

Responde à última pergunta da cadeia: **o que é que este jogador faz agora?**
Passar, rematar, lançar, driblar, conduzir, pressionar, desarmar, cortar.

O BT decide; quem executa ao longo do tempo é sempre a PlayerFSM. Nenhuma folha
aqui deve durar mais do que um frame — muda o estado e devolve SUCCESS.

Ligação com os níveis de cima:
    bb (TeamBlackboard)  postura colectiva, linha defensiva do adversário
    p.dynamicTarget      onde o nível 2 o mandou colocar-se
=============================================================================
*/

/* --- Contexto por jogador ----------------------------------------------- */

class PlayerContext {
    constructor(player) {
        this.p = player;
        this.dt = 1 / 60;
        this.skill = 80;
        this.underPressure = false;
        this.distToBall = 0;
        this.trace = [];
    }

    prepare(dt) {
        const p = this.p;
        this.dt = dt;
        this.skill = p.getSkill();
        this.distToBall = p.model.position.distanceTo(Match.ball.position);
        this.trace.length = 0;

        // Sob pressão: um adversário a menos de 3.5 m.
        // Espaço à frente: adversário mais próximo dentro de um corredor que
        // abre com a distância. Infinity se o caminho estiver limpo.
        this.underPressure = false;
        this.espacoAFrente = Infinity;

        /*
        Metros percorridos com a bola no pé. Zera quando ele a perde.
        É o que trava as conduções infinitas: a condição de espaço aberto não
        tem memória, e sozinha mantinha-se verdadeira enquanto ele corria.
        */
        if (!p.hasBall) {
            p.carryDist = 0;
        } else if (p.ultimaPosCarry) {
            // Passos maiores do que isto não são corrida — são um recomeço, uma
            // bola parada ou um reposicionamento. Contá-los enchia o orçamento
            // de uma vez e desligava o ramo para sempre.
            const passo = p.model.position.distanceTo(p.ultimaPosCarry);
            if (passo < 1.0) p.carryDist = (p.carryDist || 0) + passo;
        }
        if (!p.ultimaPosCarry) p.ultimaPosCarry = new THREE.Vector3();
        p.ultimaPosCarry.copy(p.model.position);

        for (const opp of this.opponents) {
            if (opp.role === 'gk') continue;
            const oPos = opp.model.position;
            if (p.model.position.distanceTo(oPos) < 3.5) this.underPressure = true;

            const dz = (oPos.z - p.model.position.z) * p.dirZ;
            if (dz <= 0) continue;
            const dx = Math.abs(oPos.x - p.model.position.x);
            if (dx > CarryModel.corredor + dz * CarryModel.abertura) continue;
            if (dz < this.espacoAFrente) this.espacoAFrente = dz;
        }
        return this;
    }

    /*
    Campo aberto: há relva que chegue à frente para conduzir em vez de passar,
    E ainda sobra orçamento de condução.

    A segunda metade é essencial. Sem ela o portador conduz enquanto houver
    espaço — e como ele próprio abre espaço ao correr, isso é sempre.
    */
    get campoAberto() {
        if (this.underPressure) return false;
        if (this.espacoAFrente < CarryModel.espacoLivre) return false;
        return (this.p.carryDist || 0) < CarryModel.distanciaMax;
    }

    get opponents() { return (this.p.team === 'TeamA') ? Match.opponents : Match.players; }
    get teammates() { return (this.p.team === 'TeamA') ? Match.players : Match.opponents; }
    get zoneAhead() { return this.p.model.position.z * this.p.dirZ; }
    // Blackboard da equipa adversária: dá-nos a linha que um lançamento tem de bater.
    get oppBB() { return TeamAI.get(this.p.team === 'TeamA' ? 'TeamB' : 'TeamA'); }
}

/* =========================================================================
   COM BOLA
   ========================================================================= */

/*
Lançamento: passe para o espaço nas costas da última linha adversária.

É o único conceito da lista que não existia de todo — todos os passes miravam a
posição actual de um colega. Aqui miramos o ESPAÇO à frente de um colega que
esteja em condições de lá chegar primeiro.

Aproveita o `defLineDir` que o nível 1 do adversário já calcula.
*/
function findThroughBall(ctx) {
    const p = ctx.p;

    // Um defesa a lançar é o jogo directo que se quer evitar: a bola tem de
    // passar pelo meio-campo. O lançamento é arma de médios e avançados.
    if (p.role === 'def' || p.role === 'gk') return null;
    if (Math.random() > PassModel.throughBallChance) return null;

    const linhaAdv = ctx.oppBB.defLineDir;      // no referencial de ataque DELES
    if (linhaAdv === undefined || linhaAdv === null) return null;

    // A mesma linha, no nosso referencial de ataque.
    const linhaNoNosso = -linhaAdv;
    const meuZ = p.model.position.z * p.dirZ;

    // Só faz sentido lançar de trás da linha e com campo para correr.
    if (meuZ > linhaNoNosso - 4) return null;
    if (linhaNoNosso > 44) return null;

    let melhor = null;
    let melhorNota = -Infinity;

    for (const mate of ctx.teammates) {
        if (mate === p || mate.role === 'gk') continue;
        if (mate.role === 'def') continue;              // defesas não fazem desmarcações

        // Alvo do PositionBT, não a posição actual — ver alvoDePasse().
        const mateAlvo = alvoDePasse(mate);
        const mateZ = mateAlvo.z * p.dirZ;
        // Tem de estar aquém da linha (senão já está em fora-de-jogo) mas perto dela.
        if (mateZ > linhaNoNosso) continue;
        if (mateZ < linhaNoNosso - PassModel.throughBallGap) continue;

        const dist = p.model.position.distanceTo(mateAlvo);
        if (dist < 12 || dist > PassModel.throughBallMaxDist) continue;

        // Espaço livre à frente dele: nenhum adversário entre ele e o alvo.
        const alvoZ = (linhaNoNosso + PassModel.throughBallDepth) * p.dirZ;
        const alvoX = mateAlvo.x * 0.85;
        _v1.set(alvoX, 0, alvoZ);

        let livre = true;
        for (const opp of ctx.opponents) {
            if (opp.role === 'gk') continue;
            if (opp.model.position.distanceTo(_v1) < 6.0) { livre = false; break; }
        }
        if (!livre) continue;

        const nota = 100 - dist * 0.5 + (linhaNoNosso - mateZ) * 2.0;
        if (nota > melhorNota) { melhorNota = nota; melhor = { mate: mate, alvoX: alvoX, alvoZ: alvoZ }; }
    }

    return melhor;
}

/*
Escolha de passe por PONTUAÇÃO em vez de por função.

Antes era `findPassTarget('atk') || findPassTarget('mid') || findPassTarget('def')`:
um avançado marcado ganhava sempre a um médio livre, só por ser avançado. Agora
pedimos os candidatos das três funções e ficamos com o melhor de todos, com um
empurrão para a função preferida desta posição.
*/
function bestPassTarget(ctx, preferida) {
    const p = ctx.p;
    let melhor = p.findPassTarget();

    if (!melhor && ctx.underPressure) melhor = p.findPassTargetRelaxed();
    return melhor;
}
// Remate.
function actShoot(ctx) {
    ctx.p.initiateShoot();
}

/*
Cruzamento da ala para a área.

Devolve o alvo e a probabilidade, ou null se não houver ninguém na área — sem
alguém lá dentro um cruzamento é só devolver a bola ao adversário.

A "área" aqui é mesmo a grande área (34 m à frente da linha central, 20.5 m de
meia-largura), e não o `z > 24 && |x| < 14` de antes, que apanhava meio
meio-campo. Entre vários candidatos escolhe o mais central: quem ataca o
primeiro poste tem melhor ângulo do que quem está encostado à linha de fundo.
*/
function findCross(ctx) {
    const p = ctx.p;
    const C = CrossModel;

    const meuX = Math.abs(p.model.position.x);
    if (meuX < C.alaX || ctx.zoneAhead < C.zonaZ) return null;

    let alvo = null;
    let alvos = 0;
    let melhorX = Infinity;

    for (const m of ctx.teammates) {
        if (m === p || m.role === 'gk') continue;
        if (m.model.position.z * p.dirZ < C.areaZ) continue;
        const mx = Math.abs(m.model.position.x);
        if (mx > C.areaX) continue;
        alvos++;
        if (mx < melhorX) { melhorX = mx; alvo = m; }
    }
    if (!alvo) return null;

    const largura = THREE.MathUtils.clamp((meuX - C.alaX) / (28.0 - C.alaX), 0, 1);
    const fundo = THREE.MathUtils.clamp((ctx.zoneAhead - C.zonaZ) / (C.fundoZ - C.zonaZ), 0, 1);

    let chance = C.chanceBase + C.chancePorAlvo * (alvos - 1) +
        C.bonusLargura * largura + C.bonusFundo * fundo;
    if (ctx.underPressure) chance -= C.penalPressao;

    return { alvo: alvo, chance: THREE.MathUtils.clamp(chance, 0, C.chanceMax) };
}

function actCross(ctx) {
    ctx.p.isCross = true;
    ctx.p.initiatePass(ctx.cross.alvo);
}

function actThroughBall(ctx) {
    const lance = ctx.throughBall;
    ctx.p.isThroughBall = true;
    ctx.p.throughBallTarget = { x: lance.alvoX, z: lance.alvoZ };
    ctx.p.initiatePass(lance.mate);
}

function actPass(ctx) {
    ctx.p.initiatePass(ctx.passTarget);
}

function actCarry(ctx) {
    ctx.p.fsm.changeState('CARRY');
}

/* =========================================================================
   SEM BOLA
   ========================================================================= */

function actSlideTackle(ctx) {
    const p = ctx.p;
    if (typeof MatchStats !== 'undefined') MatchStats[p.team].carrinhos.tentados++;
    _v1.copy(Match.ballCarrier.model.position);
    _v1.y = p.model.position.y;
    lookAtBola(p.model, _v1);
    p.fsm.changeState('SLIDE_TACKLE');
}

function actTackle(ctx) {
    const p = ctx.p;
    if (typeof MatchStats !== 'undefined') MatchStats[p.team].desarmes.tentados++;
    p.speedMult = 8.0;
    p.dynamicTarget.copy(Match.ballCarrier.model.position);
    p.fsm.changeState('TACKLE');
}

function actChaseBall(ctx) {
    const p = ctx.p;
    p.speedMult = 5.8 + ((ctx.skill - 50) / 50) * 1.5;
    if (Match.counterAttackTeam === p.team) p.speedMult *= 1.25;
    p.dynamicTarget.copy(Match.ball.position);
    p.fsm.changeState('MOVE_TO_POS');
}

function actReceivePass(ctx) {
    const p = ctx.p;
    p.speedMult = 5.8;
    p.dynamicTarget.copy(Match.ball.position);
    p.fsm.changeState('MOVE_TO_POS');
}

// Ocupa a posição que o nível 2 lhe deu.
function actHoldPosition(ctx) {
    const p = ctx.p;
    const dist = p.model.position.distanceTo(p.dynamicTarget);

    // Longe da posição (a recuperar/marcar): velocidade máxima. Perto (já
    // posicionado, só a ajustar): ritmo moderado — o steerArrive já trava
    // sozinho perto do alvo, isto é só sobre a velocidade de cruzeiro.
    if (dist > 6.0) {
        p.speedMult = 6.6 + ((ctx.skill - 50) / 50) * 1.4;
    } else {
        p.speedMult = 4.2 + ((ctx.skill - 50) / 50) * 1.2;
    }
    if (Match.counterAttackTeam === p.team) p.speedMult *= 1.25;
    p.fsm.changeState('MOVE_TO_POS');
}

function actGoalkeeperPosition(ctx) {
    const p = ctx.p;
    p.speedMult = 4.2 + ((ctx.skill - 50) / 50) * 1.2;
    const targetX = Math.max(-10, Math.min(10, Match.ball.position.x * 0.5));
    const targetZ = (p.ownGoalZ + 5 * p.dirZ) +
        Math.max(0, Math.min(10, (Match.ball.position.z - p.ownGoalZ) * 0.1 * p.dirZ));
    p.dynamicTarget.set(targetX, ALTURA_BASE_Y, targetZ);
    p.fsm.changeState('MOVE_TO_POS');
}

/* =========================================================================
   A ÁRVORE
   ========================================================================= */

const temBola = (ctx) => ctx.p.hasBall;
const ehGK = (ctx) => ctx.p.role === 'gk';

// Zona/ângulo de finalizar — usado por Rematar E por Dominar (para não fazer
// o jogador "pensar" 3s com o guarda-redes já batido à sua frente).
function emZonaDeRemate(ctx) {
    if (ctx.zoneAhead <= 15) return false;
    const p = ctx.p;
    _v1.set(0, 0, p.targetGoalZ);
    const dist = p.model.position.distanceTo(_v1);
    return dist < p.shootingRange() && Math.abs(p.model.position.x) < ShootingModel.maxOffsetX;
}

const PlayerBT = sel('PlayerRoot',

    /* --- Bola parada ---------------------------------------------------- */
    seq('BolaParada',
        cond('jogoParado', () => Match.state !== 'PLAY'),
        act('esperarLance', (ctx) => {
            const fsm = ctx.p.fsm;
            if (Match.state === 'CORNER_KICK') {
                if (fsm.currentState !== 'SET_PIECE_TAKER' && fsm.currentState !== 'SET_PIECE_WAIT') {
                    fsm.changeState('SET_PIECE_WAIT');
                }
            } else {
                fsm.changeState('IDLE');
            }
        })
    ),

    /* --- Acção em curso: não voltar a decidir ---------------------------- */
    seq('AccaoEmCurso',
        cond('estadoBloqueante', (ctx) => {
            const s = ctx.p.fsm.currentState;
            return s === 'PASS' || s === 'SHOOT' || s === 'TACKLE' || s === 'SLIDE_TACKLE';
        }),
        act('deixarTerminar', () => { })
    ),

    /* --- Com bola -------------------------------------------------------- */
    seq('ComBola',
        cond('tenhoABola', temBola),

        sel('DecisaoComBola',
            /*
            Domina antes de decidir. Cadência real: ~3s a avaliar as opções
            (CadenceModel.posseBase), bem menos sob pressão pesada — aí é
            toque de primeira, decisão quase imediata. Skill acelera um
            pouco (jogador melhor lê o jogo mais depressa). Durante a espera
            corre com a bola (actCarry) — não fica estático, só não passa/
            remata/lança enquanto "não decidiu".
            */
            seq('Dominar',
                cond('aindaADominar', (ctx) => {
                    // Cara a cara com o guarda-redes: não "pensa", remata. Sem
                    // isto o jogador entrava na área de frente pro gol e ainda
                    // esperava a janela de cadência inteira antes de chutar.
                    if (emZonaDeRemate(ctx)) return false;
                    let settling = ctx.underPressure ? CadenceModel.posseSobPressao : CadenceModel.posseBase;
                    settling *= 1.0 - (ctx.skill / 100) * 0.25;
                    if (ctx.p.decisionTimer < settling) return true;
                    ctx.p.decisionTimer = settling;
                    return false;
                }),
                act('proteger', actCarry)
            ),

            // Guarda-redes: sair a jogar curto, senão lançamento longo.
            seq('GuardaRedesJoga',
                cond('souGR', ehGK),
                sel('OpcaoGR',
                    seq('passeCurto',
                        cond('haColega', (ctx) => {
                            ctx.passTarget = ctx.p.findPassTarget('def') || ctx.p.findPassTarget('mid') ||
                                (ctx.underPressure ? ctx.p.findPassTargetRelaxed() : null);
                            return ctx.passTarget !== null;
                        }),
                        act('passar', actPass)
                    ),
                    // Sem opção curta segura: já esperou o suficiente a segurar a bola,
                    // lança longo em vez de ficar indefinidamente parado.
                    seq('lancamentoLongo',
                        cond('esperouDemais', (ctx) => ctx.p.decisionTimer > 1.2),
                        act('lancar', (ctx) => ctx.p.puntBall())
                    ),
                    act('segurar', actCarry)
                )
            ),

            // Remate, se estiver em zona e ângulo de finalizar.
            seq('Rematar',
                cond('emZonaDeRemate', emZonaDeRemate),
                act('rematar', actShoot)
            ),

            // Cruzamento da ala, se houver alguém na área para o receber.
            seq('Cruzar',
                cond('valeCruzar', (ctx) => {
                    ctx.cross = findCross(ctx);
                    return ctx.cross !== null && Math.random() < ctx.cross.chance;
                }),
                act('cruzar', actCross)
            ),

            /*
            Campo aberto: conduz.

            Tem de vir ANTES de Passar. A seguir ao passe a árvore já não
            pergunta nada — e havendo sempre um colega ao lado disponível, um
            avançado isolado com 20 m de relva à frente acabava a tocar para
            trás em vez de atacar o espaço.
            */
            seq('ConduzirEmEspaco',
                cond('campoAberto', (ctx) =>
                    ctx.p.role !== 'def' && ctx.p.role !== 'gk' && ctx.campoAberto),
                act('atacarOEspaco', actCarry)
            ),

            // Lançamento nas costas da linha adversária.
            seq('Lancar',
                cond('haEspacoNasCostas', (ctx) => {
                    if (ctx.underPressure) return false;
                    ctx.throughBall = findThroughBall(ctx);
                    return ctx.throughBall !== null;
                }),
                act('lancar', actThroughBall)
            ),

            // Passe normal, por pontuação.
            seq('Passar',
                cond('valeAPenaPassar', (ctx) => {
                    const p = ctx.p;
                    const preferida = (p.role === 'def') ? 'mid' : 'atk';
                    ctx.passTarget = bestPassTarget(ctx, preferida);
                    if (!ctx.passTarget) return false;

                    // Nem sempre passa: às vezes conduz. Sob pressão, passa quase sempre.
                    let limiar = PassModel.carryChance;
                    if (Tatics.passe === 'curto') limiar = PassModel.carryChanceShort;
                    else if (Tatics.passe === 'longo') limiar = PassModel.carryChanceLong;
                    if (ctx.underPressure) limiar = Math.max(0.02, limiar - 0.15);

                    return Math.random() > limiar;
                }),
                act('passar', actPass)
            ),

            act('conduzir', actCarry)
        )
    ),

    /* --- Sem bola -------------------------------------------------------- */
    seq('SemBola',
        sel('DecisaoSemBola',
            // Carrinho: fora do alcance de desarme mas ainda perto.
            seq('Carrinho',
                cond('vale carrinho', (ctx) => {
                    const p = ctx.p, c = Match.ballCarrier;
                    if (!c || c.team === p.team || ctx.distToBall >= 12) return false;
                    const d = p.model.position.distanceTo(c.model.position);
                    const alcanceDesarme = (p.pos === 'CB') ? 2.8 : 2.5;
                    if (d < alcanceDesarme || d >= 4.5) return false;

                    // Só entra de frente (0-45°) ou de lado (45-90°) em relação
                    // à direcção de movimento do portador — carrinho por trás
                    // não vale (ficava dando de costas, longe da bola).
                    const carrierDir = c.velocity.lengthSq() > 0.1
                        ? c.velocity.clone().normalize()
                        : new THREE.Vector3(0, 0, 1).applyQuaternion(c.model.quaternion);
                    const toDefensor = new THREE.Vector3().subVectors(p.model.position, c.model.position);
                    toDefensor.y = 0;
                    if (toDefensor.lengthSq() < 0.0001) return false;
                    toDefensor.normalize();
                    const angulo = carrierDir.angleTo(toDefensor);
                    if (angulo > Math.PI / 2) return false;

                    let taxa = 0;
                    if (p.pos === 'CB') taxa = 8.4;
                    else if (p.pos === 'LB' || p.pos === 'RB') taxa = 6.6;
                    else if (p.pos === 'DM') taxa = 6.0;
                    else if (p.role === 'def' || p.role === 'mid') taxa = 3.0;
                    return chancePorSegundo(taxa, ctx.dt);
                }),
                act('carrinho', actSlideTackle)
            ),

            // Desarme de pé.
            seq('Desarme',
                cond('vale desarme', (ctx) => {
                    const p = ctx.p, c = Match.ballCarrier;
                    if (!c || c.team === p.team || ctx.distToBall >= 12) return false;
                    const d = p.model.position.distanceTo(c.model.position);
                    const alcance = (p.pos === 'CB') ? 2.8 : 2.5;
                    if (d >= alcance) return false;
                    return chancePorSegundo((p.pos === 'CB') ? 9.0 : 4.8, ctx.dt);
                }),
                act('desarmar', actTackle)
            ),

            // Ir à bola: sou o perseguidor designado pela equipa.
            seq('IrABola',
                cond('souEuAIr', (ctx) =>
                    ctx.distToBall < 12 &&
                    (Match.chaserA === ctx.p || Match.chaserB === ctx.p)),
                act('perseguir', actChaseBall)
            ),

            // Sou o destinatário do passe.
            seq('Receber',
                cond('vemParaMim', (ctx) => Match.intendedReceiver === ctx.p),
                act('receber', actReceivePass)
            ),

            seq('GuardaRedes',
                cond('souGR', ehGK),
                act('posicionarGR', actGoalkeeperPosition)
            ),

            /*
            Ataque à área: colega na ala em posição de cruzar (mesmos limiares
            do findCross/CrossModel) e eu sou atacante/médio sem bola — em vez
            do slot genérico do PositionBT, ataco a área a sério (perto/longe
            do 1º poste, alternando por id). Sem isto o findCross nunca tinha
            ninguém lá dentro pra mirar (exige alvo já na área ANTES do
            cruzamento sair) — os cruzamentos morriam sempre por falta de
            gente a atacar a bola.
            */
            seq('AtacarArea',
                cond('colegaVaiCruzar', (ctx) => {
                    const p = ctx.p;
                    if (p.role === 'def' || p.role === 'gk') return false;
                    const c = Match.ballCarrier;
                    if (!c || c.team !== p.team || c === p) return false;
                    const carrierX = Math.abs(c.model.position.x);
                    const carrierZ = c.model.position.z * c.dirZ;
                    return carrierX >= CrossModel.alaX && carrierZ >= CrossModel.zonaZ;
                }),
                act('atacarArea', (ctx) => {
                    const p = ctx.p;
                    const c = Match.ballCarrier;
                    const side = Math.sign(c.model.position.x) || 1;
                    // Metade dos candidatos ataca o 1º poste (lado do cruzamento),
                    // a outra o 2º poste — leque simples, sem coordenação fina.
                    const targetX = (p.id % 2 === 0) ? -side * 5.0 : side * 9.0;
                    const targetZ = (CrossModel.areaZ + 6.0) * p.dirZ;
                    p.dynamicTarget.set(targetX, ALTURA_BASE_Y, targetZ);
                    p.speedMult = 5.5 + ((ctx.skill - 50) / 50) * 1.2;
                    p.fsm.changeState('MOVE_TO_POS');
                })
            ),

            act('ocuparPosicao', actHoldPosition)
        )
    )
);

/* --- Ponto de entrada --------------------------------------------------- */

const PlayerAI = {
    tick: function (player, dt) {
        if (!player.btCtx) player.btCtx = new PlayerContext(player);
        PlayerBT.tick(player.btCtx.prepare(dt));
    }
};
