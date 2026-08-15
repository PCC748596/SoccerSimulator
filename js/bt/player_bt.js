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
        this.skillSpeed = 80;
        this.skillTec = 80;
        this.underPressure = false;
        this.distToBall = 0;
        this.trace = [];
    }

    prepare(dt) {
        const p = this.p;
        this.dt = dt;
        // Skills individuais (data/player_skills.js) por contexto — SPEED
        // pras fórmulas de velocidade, TEC pra cadência de decisão/leitura
        // de jogo. skillFor() cai no genérico (médias do painel) se o
        // jogador ainda não tiver skills carregados.
        this.skillSpeed = p.skillFor('SPEED');
        this.skillTec = p.skillFor('TEC');
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

        /*
        Playing style: ligar ou não NESTE frame.

        O estilo não é um traço permanentemente ligado — é uma forma de jogar
        que só interessa em certas alturas. Um Goal Poacher colado ao último
        defensor com a bola na nossa área é um jogador a menos; um Cross
        Specialist encostado à linha com a bola do lado contrário também.

        Fica aqui, no nível 3, e não numa folha da árvore, porque tem de
        correr todos os frames independentemente do ramo que venha a ganhar:
        o estilo comanda o POSICIONAMENTO (nível 2, via estiloAtivoDe no
        commit) tanto quanto a decisão.
        */
        if (typeof avaliarEstilo === 'function' && this.bb) {
            avaliarEstilo(p, this.bb, dt);
        }

        // Eventos de posse — disparam na transição sem bola -> com bola.
        if (p.hasBall && !p._hadBallPrev && typeof EventBus !== 'undefined') {
            if (p.pos === 'CB') EventBus.emit('CB_HAS_BALL', { p: p });
            else if (p.pos === 'CM') EventBus.emit('CM_HAS_BALL', { p: p });
        }
        p._hadBallPrev = p.hasBall;

        /*
        Tempo seguido perto do portador adversário — Defensive Pressure não
        manda só a DISTÂNCIA de marcação (MarkingModel.distancia: 4/3/2m),
        manda também quanto tempo aguenta essa distância antes de tentar
        roubar (DefensivePressureModel: 6/4/2s, Low/Bal/High). Carrinho e
        Desarme só entravam a rolar dado por segundo sem olhar há quanto
        tempo estava perto — tentavam a bola assim que chegavam.
        */
        const cAdv = Match.ballCarrier;
        if (cAdv && cAdv.team !== p.team && p.model.position.distanceTo(cAdv.model.position) < 4.5) {
            p.tempoPertoDoPortador = (p.tempoPertoDoPortador || 0) + dt;
        } else {
            p.tempoPertoDoPortador = 0;
        }

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
    // Blackboard da própria equipa — usado por actHoldPosition para escolher
    // entre MARKING/BLOCKING/SUPPORT.
    get bb() { return TeamAI.get(this.p.team); }
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
        // Lançamento é bola longa: abaixo de distMinLonga é passe normal.
        if (dist < PassModel.distMinLonga || dist > PassModel.throughBallMaxDist) continue;

        // Espaço livre à frente dele. Com a grid espacial, em vez de só
        // testar "está livre?" num ponto fixo (mateAlvo.x*0.85), procura o
        // centro do espaço mais livre ali perto e mira nesse ponto — o
        // lançamento passa a ir para o espaço de verdade, não uma
        // aproximação. Sem a grid, cai no loop antigo sobre os adversários.
        let alvoZ = (linhaNoNosso + PassModel.throughBallDepth) * p.dirZ;
        let alvoX = mateAlvo.x * 0.85;
        const oppTeamKey = (p.team === 'TeamA') ? 'TeamB' : 'TeamA';

        if (typeof SpatialGrid !== 'undefined' && SpatialGrid.cells) {
            const livreSpot = SpatialGrid.findFreeSpace(alvoX, alvoZ, 6, oppTeamKey);
            if (!livreSpot) continue;
            if (SpatialGrid.occupancy(livreSpot.x, livreSpot.z, 1, oppTeamKey) > 0) continue;
            alvoX = livreSpot.x; alvoZ = livreSpot.z;
        } else {
            _v1.set(alvoX, 0, alvoZ);
            let livre = true;
            for (const opp of ctx.opponents) {
                if (opp.role === 'gk') continue;
                if (opp.model.position.distanceTo(_v1) < 6.0) { livre = false; break; }
            }
            if (!livre) continue;
        }

        let nota = 100 - dist * 0.5 + (linhaNoNosso - mateZ) * 2.0;
        if (typeof SpatialGrid !== 'undefined' && SpatialGrid.cells) {
            nota += SpatialGrid.layerValueAt('lancamento', alvoX, alvoZ, p.team) * 0.5;
        }
        if (nota > melhorNota) { melhorNota = nota; melhor = { mate: mate, alvoX: alvoX, alvoZ: alvoZ }; }
    }

    /*
    Rasteiro ou pelo alto? Um lançamento rasteiro por entre a linha adversária
    é bola entregue ao primeiro que corte. Se há alguém no corredor do passe,
    levanta-se a bola por cima deles — continua a cair no mesmo sítio, o
    espaço à frente do companheiro.
    */
    if (melhor) {
        _v1.set(p.model.position.x, 0, p.model.position.z);
        _v2.set(melhor.alvoX, 0, melhor.alvoZ);
        _line1.set(_v1, _v2);
        let naLinha = 0;
        for (const opp of ctx.opponents) {
            if (opp.role === 'gk') continue;
            _line1.closestPointToPoint(opp.model.position, true, _v3);
            _v3.y = 0;
            if (_v3.distanceTo(opp.model.position.clone().setY(0)) < PassModel.corredorBloqueio) naLinha++;
        }
        melhor.alto = naLinha > 0;
    }

    return melhor;
}

/*
Passe pelo algoritmo de pontos candidatos (PassCandidates), experimental —
liga/desliga em window.usarPasseGrid, lógica antiga (bestPassTarget) intacta
por baixo. Gera o leque à volta de cada companheiro, filtra os intercetáveis
(ver pass_candidates.js) e elege o ponto sobrevivente mais perto do centro da
baliza adversária. Quem "recebe" é o dono do ponto — mira o ESPAÇO, não a
posição actual dele (mesmo padrão do lançamento).
*/
function findGridPassTarget(ctx) {
    if (typeof PassCandidates === 'undefined') return null;
    const p = ctx.p;
    const cands = PassCandidates.gerarCandidatos(p);
    if (cands.length === 0) return null;

    const golZ = p.targetGoalZ;
    let melhor = null, melhorD = Infinity;
    for (const c of cands) {
        const d = Math.hypot(c.x, c.z - golZ);
        if (d < melhorD) { melhorD = d; melhor = c; }
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

    /*
    Preso sob pressão há mais de 1s sem achar passe nenhum (defensor em cima
    da linha de qualquer opção): passe de pânico, ignora a linha, só olha se
    o colega está livre no destino. Sem isto caía sempre no fallback
    actCarry — corta, retoma, corta, retoma, nunca alcançava quem estava
    livre.
    */
    if (!melhor && ctx.underPressure && p.decisionTimer > 1.0) melhor = p.findPassTargetDesperate();

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
        // Perto de mais para cruzamento pelo ar — é um passe curto, não uma
        // bola lançada por cima de todos (ver CrossModel.distMin).
        if (m.model.position.distanceTo(p.model.position) < C.distMin) continue;
        alvos++;
        if (mx < melhorX) { melhorX = mx; alvo = m; }
    }
    if (!alvo) return null;

    const largura = THREE.MathUtils.clamp((meuX - C.alaX) / (28.0 - C.alaX), 0, 1);
    const fundo = THREE.MathUtils.clamp((ctx.zoneAhead - C.zonaZ) / (C.fundoZ - C.zonaZ), 0, 1);

    let chance = C.chanceBase + C.chancePorAlvo * (alvos - 1) +
        C.bonusLargura * largura + C.bonusFundo * fundo;
    if (ctx.underPressure) chance -= C.penalPressao;

    // Grid espacial (camada CRUZAMENTO): soma o valor autorado da célula do cruzador.
    if (typeof SpatialGrid !== 'undefined' && SpatialGrid.cells) {
        const crossVal = SpatialGrid.layerValueAt('cruzamento', p.model.position.x, p.model.position.z, p.team);
        chance += (crossVal / 100) * C.pesoGrid;
    }

    /*
    Alto ou rasteiro?

    Rasteiro é o cruzamento que corta a linha da defesa junto ao chão — melhor
    quando NÃO há ninguém no caminho e o alvo está perto do primeiro poste,
    porque chega mais depressa e não dá tempo ao guarda-redes de sair.

    Alto é o que passa POR CIMA de quem está entre a bola e o alvo. Se há
    gente na linha do cruzamento, rasteiro é bola entregue ao primeiro
    defensor. Também se prefere alto quando o alvo é longe (segundo poste) ou
    quando ele ganha bem de cabeça (FORÇA).
    */
    _line1.set(p.model.position, alvo.model.position);
    let bloqueadores = 0;
    for (const opp of ctx.opponents) {
        if (opp.role === 'gk') continue;
        _line1.closestPointToPoint(opp.model.position, true, _v1);
        if (_v1.distanceTo(opp.model.position) < 1.6) bloqueadores++;
    }

    const distAlvo = p.model.position.distanceTo(alvo.model.position);
    // Pontuação do ALTO: quem estiver no caminho pesa muito, distância e jogo
    // aéreo do alvo pesam menos.
    let notaAlto = bloqueadores * 0.45
        + THREE.MathUtils.clamp((distAlvo - 14) / 20, 0, 1) * 0.35
        + ((alvo.skillFor('STRENGTH') - 50) / 100) * 0.30;

    return {
        alvo: alvo,
        chance: THREE.MathUtils.clamp(chance, 0, C.chanceMax),
        alto: notaAlto >= 0.5,
        bloqueadores: bloqueadores
    };
}

function actCross(ctx) {
    const p = ctx.p;
    p.isCross = true;
    // Consumido em executePassGameplay (fsm.js) para escolher a altura.
    p.crossAlto = ctx.cross.alto;
    p.initiatePass(ctx.cross.alvo);
}

function actThroughBall(ctx) {
    const lance = ctx.throughBall;
    ctx.p.isThroughBall = true;
    // Consumido em executePassGameplay: rasteiro por entre a defesa, ou pelo
    // alto por cima dela (ver findThroughBall).
    ctx.p.throughBallAlto = !!lance.alto;
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
    p.speedMult = 8.0 * 1.25 * 0.9; // +25% depois -10% pedidos: velocidade máxima SEM bola
    p.dynamicTarget.copy(Match.ballCarrier.model.position);
    p.fsm.changeState('TACKLE');
}

function actChaseBall(ctx) {
    const p = ctx.p;
    p.speedMult = (5.8 + ((ctx.skillSpeed - 50) / 50) * 1.5) * 1.25 * 0.9;
    if (Match.counterAttackTeam === p.team) p.speedMult *= 1.25;
    p.dynamicTarget.copy(Match.ball.position);
    p.fsm.changeState('MOVE_TO_POS');
}

/*
Vale a pena eu ir a esta bola solta, mesmo não sendo o chaser?

Três perguntas, por esta ordem (a mais barata primeiro):
    1. há bola solta e eu consigo mesmo chegar-lhe? (percepção)
    2. chego lá depressa? (janelaIntercetar)
    3. chego antes de quem já vai lá? (chaser e destinatário do passe)

A terceira é o que impede a equipa toda de largar a posição e correr atrás da
mesma bola: só reage quem tem vantagem real sobre quem já está encarregue dela.
*/
function podeIntercetar(ctx) {
    const p = ctx.p;
    if (Match.ballCarrier) return false;                 // bola já tem dono
    if (Match.state !== 'PLAY') return false;

    const bola = p.blackboard && p.blackboard.ball;
    if (!bola || !bola.interceptable || !bola.interceptionPoint) return false;
    if (bola.timeToIntercept > PerceptionModel.janelaIntercetar) return false;

    // O chaser e o destinatário já têm folha própria — não duplicar.
    if (Match.chaserA === p || Match.chaserB === p) return false;
    if (Match.intendedReceiver === p) return false;

    const meu = bola.timeToIntercept;
    const margem = PerceptionModel.margemMelhor;

    // Melhor do que quem já vai lá? Compara com o tempo de interceptação
    // deles, não com a distância — é a bola que se move, não o alvo.
    //
    // `bb.intercetorFrame` cobre o caso que chaser/intendedReceiver não
    // cobriam: DOIS jogadores que não são nem chaser nem destinatário,
    // ambos elegíveis no MESMO frame — cada um só se comparava contra
    // chaser/receiver, nunca um contra o outro, e os dois passavam
    // (ver bug reportado: 2 jogadores em INTERCEPT ao mesmo tempo). Como o
    // nível 3 corre em sequência por jogador dentro do mesmo frame, quem já
    // reivindicou fica visível para os próximos da equipa.
    const bb = ctx.bb;
    const jaVaoLa = [Match.chaserA, Match.chaserB, Match.intendedReceiver, bb && bb.intercetorFrame];
    for (const outro of jaVaoLa) {
        if (!outro || outro === p) continue;
        const bOutro = outro.blackboard && outro.blackboard.ball;
        // Sem dados do outro, assume-se que ele trata disto.
        const tOutro = (bOutro && bOutro.interceptable) ? bOutro.timeToIntercept : Infinity;
        if (tOutro <= meu + margem) return false;
    }

    ctx.pontoIntercepcao = bola.interceptionPoint;
    if (bb) bb.intercetorFrame = p;
    return true;
}

/*
Corre para onde a bola VAI ESTAR, não para onde ela está.

É esta a diferença entre interceptar e perseguir: o actChaseBall aponta para
`Match.ball.position` (e por isso corre sempre atrás dela), enquanto aqui o
alvo é o `interceptionPoint` que a percepção já calculou — o primeiro ponto da
trajectória a que este jogador consegue chegar a tempo.
*/
function actIntercept(ctx) {
    const p = ctx.p;
    const ponto = ctx.pontoIntercepcao || Match.ball.position;
    p.speedMult = (5.8 + ((ctx.skillSpeed - 50) / 50) * 1.5) * 1.25 * 0.9;
    if (Match.counterAttackTeam === p.team) p.speedMult *= 1.25;
    p.dynamicTarget.set(ponto.x, ALTURA_BASE_Y, ponto.z);
    p.fsm.changeState('INTERCEPT');
}

/*
Receber o passe.

Corria para `Match.ball.position` — a posição ACTUAL da bola. Num passe pelo
alto isso é um ponto a 3-4 m de altura que se desloca a cada frame: o
receptor perseguia-a, passava-lhe por baixo e ficava atrás dela. Se vinha de
frente, então, cruzavam-se a meio caminho.

Agora vai para onde ela vai CAIR (preverQuedaDaBola) e espera lá. O
steerArrive trava sozinho ao chegar, por isso "parar e esperar" não precisa
de estado próprio — precisa é de um alvo que não fuja.

Bola rasteira mantém o comportamento antigo: aí a posição actual é o alvo
certo, e ir para onde ela pára seria deixá-la morrer sozinha.
*/
function actReceivePass(ctx) {
    const p = ctx.p;
    p.speedMult = 5.8 * 1.25 * 0.9;

    const bola = Match.ball.position;
    const noAr = bola.y > BallPhysics.raio + 0.35 && Match.ballVel.lengthSq() > 1.0;

    if (noAr) {
        /*
        Bola que ainda vem alta: o ponto de encontro é onde ela DESCE pela
        altura da testa, não onde aterra. Ir para o ponto de queda deixava-o
        parado à espera que ela lhe caísse aos pés — e o salto de cabeceio
        (SaltoCabeceio) disparava no último instante, com a bola já quase no
        chão. Só vale a pena se lá chegar a tempo; senão, ponto de queda.
        */
        const cabeca = preverBolaEmAltura(ALTURA_BASE_Y + ALTURA_CABECA);
        if (cabeca) {
            const dCab = Math.hypot(p.model.position.x - cabeca.x, p.model.position.z - cabeca.z);
            if (dCab <= p.speedMult * cabeca.tempo * 0.95) {
                p.dynamicTarget.set(cabeca.x, ALTURA_BASE_Y, cabeca.z);
                p.fsm.changeState('MOVE_TO_POS');
                return;
            }
        }

        const queda = preverQuedaDaBola();
        p.dynamicTarget.set(queda.x, ALTURA_BASE_Y, queda.z);

        /*
        Já está no ponto de queda e a bola ainda vem no ar: fica quieto. Sem
        isto o steerArrive continua a corrigir centímetros e ele fica a
        oscilar por baixo da bola no momento em que ela chega.
        */
        const distQueda = Math.hypot(p.model.position.x - queda.x, p.model.position.z - queda.z);
        if (distQueda < 1.0) {
            p.velocity.set(0, 0, 0);
            p.fsm.changeState('IDLE');
            lookAtBola(p.model, bola);
            return;
        }
    } else {
        p.dynamicTarget.copy(bola);
    }

    p.fsm.changeState('MOVE_TO_POS');
}

// Ocupa a posição que o nível 2 lhe deu.
function actHoldPosition(ctx) {
    const p = ctx.p;
    const dist = p.model.position.distanceTo(p.dynamicTarget);

    // Longe da posição (a recuperar/marcar): velocidade máxima até uns 2m
    // do alvo. Dentro disso (já posicionado, só a ajustar): ritmo moderado
    // — o steerArrive já trava sozinho perto do alvo, isto é só sobre a
    // velocidade de cruzeiro. +25% pedido: velocidade máxima SEM bola.
    if (dist > 2.0) {
        p.speedMult = (6.6 + ((ctx.skillSpeed - 50) / 50) * 1.4) * 1.25 * 0.9;
    } else {
        p.speedMult = (4.2 + ((ctx.skillSpeed - 50) / 50) * 1.2) * 1.25 * 0.9;
    }
    if (Match.counterAttackTeam === p.team) p.speedMult *= 1.25;

    /*
    O nível 2 (defendZonal/marcar em position_bt.js) já decidiu O ALVO
    (p.dynamicTarget) — aqui só se rotula o que está a acontecer, pra não
    ficar tudo escondido atrás de "MOVE_TO_POS":
        marcando um adversário específico  -> MARKING
        sem par, a fechar a linha da bola  -> BLOCKING (p.isCovering)
        equipa tem a bola, à frente dela    -> FWR_SUPPORT
        equipa tem a bola, atrás dela       -> AFT_SUPPORT
        resto (posição genérica, fora de fase de bola) -> MOVE_TO_POS
    */
    if (ctx.bb && ctx.bb.isAttacking) {
        // zoneAhead/ballZ já no referencial de ataque — comparação directa.
        p.fsm.changeState(ctx.zoneAhead > ctx.bb.ballZ ? 'FWR_SUPPORT' : 'AFT_SUPPORT');
    } else if (p.markingTarget) {
        p.fsm.changeState('MARKING');
    } else if (p.isCovering) {
        p.fsm.changeState('BLOCKING');
    } else {
        p.fsm.changeState('MOVE_TO_POS');
    }
}

function actGoalkeeperPosition(ctx) {
    const p = ctx.p;
    p.speedMult = (4.2 + ((ctx.skillSpeed - 50) / 50) * 1.2) * 1.25 * 0.9;
    const targetX = Math.max(-10, Math.min(10, Match.ball.position.x * 0.5));
    const style = GoalkeeperStyle[p.gkStyle] || GoalkeeperStyle.defensive;
    const targetZ = (p.ownGoalZ + 5 * p.dirZ) +
        Math.max(0, Math.min(style.maxOut, (Match.ball.position.z - p.ownGoalZ) * 0.1 * p.dirZ));
    p.dynamicTarget.set(targetX, ALTURA_BASE_Y, targetZ);
    p.fsm.changeState('MOVE_TO_POS');
}

/* =========================================================================
   A ÁRVORE
   ========================================================================= */

// carryTouchGrace cobre a janela entre o toque à frente na condução e o
// jogador retomar o toque — sem isto, o instante em que hasBall fica false
// (touchLock, para ninguém tocar de novo cedo demais) já bastava para o BT
// achar que ele "perdeu a bola" e mandá-lo para SemBola/MOVE_TO_POS,
// abandonando a bola que ele mesmo tinha acabado de tocar à frente.
const temBola = (ctx) => ctx.p.hasBall || ctx.p.carryTouchGrace > 0;
const ehGK = (ctx) => ctx.p.role === 'gk';

// Zona/ângulo de finalizar — usado por Rematar E por Dominar (para não fazer
// o jogador "pensar" 3s com o guarda-redes já batido à sua frente).
function emZonaDeRemate(ctx) {
    if (ctx.zoneAhead <= 15) return false;
    const p = ctx.p;
    _v1.set(0, 0, p.targetGoalZ);
    const dist = p.model.position.distanceTo(_v1);
    if (!(dist < p.shootingRange() && Math.abs(p.model.position.x) < ShootingModel.maxOffsetX)) return false;

    // Grid espacial (camada CHUTE): fora das zonas autoradas (valor 0) não remata.
    if (typeof SpatialGrid !== 'undefined' && SpatialGrid.cells) {
        const chuteVal = SpatialGrid.layerValueAt('chute', p.model.position.x, p.model.position.z, p.team);
        if (chuteVal <= 0) return false;
    }
    return true;
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
            } else if (Match.state === 'GOAL_KICK') {
                /*
                GOAL_KICK deixa MOVE_TO_POS sobreviver: quem bate posiciona-se
                "como no chute do goleiro", um pouco mais adiantado (ver
                setupSetPiece), e esta folha só decidiria de novo se voltasse
                a chamar changeState — o que apagaria o dynamicTarget calculado
                no setup. Chegando ao alvo, match.js muda para SET_PIECE_WAIT.
                */
                if (fsm.currentState !== 'SET_PIECE_TAKER' &&
                    fsm.currentState !== 'SET_PIECE_WAIT' &&
                    fsm.currentState !== 'MOVE_TO_POS') {
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
            // CUT é o gesto do corte diagonal (DRIBBLE_CUT_30): dura ~0.75s e
            // não pode ser interrompido a meio, senão o corpo fica a meio da
            // rotação e a bola já foi tocada para a diagonal.
            return s === 'PASS' || s === 'SHOOT' || s === 'TACKLE' || s === 'SLIDE_TACKLE' ||
                s === 'CUT' || s === 'CHEST_CONTROL';
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
                    settling *= 1.0 - (ctx.skillTec / 100) * 0.25;
                    // Cadência do estilo: Target Man aguenta a bola (1.6),
                    // Fox in the Box resolve num toque (0.6).
                    settling *= estiloAtivoDe(ctx.p).cadencia;
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
            // O peso `cruzar` do playing style entra aqui (Cross Specialist
            // 1.6, Fox in the Box quase nunca cruza).
            seq('Cruzar',
                cond('valeCruzar', (ctx) => {
                    ctx.cross = findCross(ctx);
                    if (!ctx.cross) return false;
                    const mult = estiloAtivoDe(ctx.p).cruzar;
                    return Math.random() < Math.min(CrossModel.chanceMax, ctx.cross.chance * mult);
                }),
                act('cruzar', actCross)
            ),

            /*
            Passe pra frente, dentro do campo de visão (mesmo cone de ângulos
            da condução, CarryModel.leque — até ±57° do eixo de ataque).

            Vem ANTES de ConduzirEmEspaco: só conduz sozinho se não houver
            colega bem posicionado à frente dentro desse cone. Passe lateral/
            para trás fica de fora daqui (ver bestPassTarget mais abaixo, que
            cobre isso sob pressão).
            */
            seq('PassarEmFrente',
                cond('haPasseEmFrente', (ctx) => {
                    const p = ctx.p;
                    const alvo = p.findPassTarget();
                    if (!alvo) return false;
                    const optPos = alvoDePasse(alvo);
                    const dz = (optPos.z - p.model.position.z) * p.dirZ;
                    if (dz <= 0) return false;
                    const dx = Math.abs(optPos.x - p.model.position.x);
                    const ang = Math.atan2(dx, dz);
                    const anguloMax = CarryModel.leque[CarryModel.leque.length - 1];
                    if (ang > anguloMax) return false;
                    ctx.passTarget = alvo;
                    return true;
                }),
                act('passar', actPass)
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
                    // Peso `lancar` do estilo: Orchestrator/Creative lançam
                    // muito, Anchor Man quase nunca.
                    const mult = estiloAtivoDe(ctx.p).lancar;
                    if (mult !== 1.0 && Math.random() > mult) return false;
                    ctx.throughBall = findThroughBall(ctx);
                    return ctx.throughBall !== null;
                }),
                act('lancar', actThroughBall)
            ),

            // Passe pelo algoritmo de pontos candidatos — experimental, só corre
            // se window.usarPasseGrid estiver ligado (ver toggle no painel).
            seq('PassarGrid',
                cond('usarPasseGrid', (ctx) => {
                    if (!window.usarPasseGrid) return false;
                    ctx.gridPassPonto = findGridPassTarget(ctx);
                    return ctx.gridPassPonto !== null;
                }),
                act('passarGrid', (ctx) => {
                    const c = ctx.gridPassPonto;
                    ctx.p.isThroughBall = true;
                    ctx.p.throughBallTarget = { x: c.x, z: c.z };
                    ctx.p.initiatePass(c.mate);
                })
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
                    if (!c || c.team === p.team || c.role === 'gk' || ctx.distToBall >= 12) return false;
                    const d = p.model.position.distanceTo(c.model.position);
                    const alcanceDesarme = (p.pos === 'CB') ? 2.8 : 2.5;
                    if (d < alcanceDesarme || d >= 4.5) return false;

                    const esperaMin = DefensivePressureModel[Tatics.pressaoDefensiva] || DefensivePressureModel.balanced;
                    if ((p.tempoPertoDoPortador || 0) < esperaMin) return false;

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
                    // Peso `pressao` do estilo: The Destroyer entra muito mais.
                    taxa *= estiloAtivoDe(p).pressao;
                    return chancePorSegundo(taxa, ctx.dt);
                }),
                act('carrinho', actSlideTackle)
            ),

            // Desarme de pé.
            seq('Desarme',
                cond('vale desarme', (ctx) => {
                    const p = ctx.p, c = Match.ballCarrier;
                    if (!c || c.team === p.team || c.role === 'gk' || ctx.distToBall >= 12) return false;
                    const d = p.model.position.distanceTo(c.model.position);
                    const alcance = (p.pos === 'CB') ? 2.8 : 2.5;
                    if (d >= alcance) return false;

                    const esperaMin = DefensivePressureModel[Tatics.pressaoDefensiva] || DefensivePressureModel.balanced;
                    if ((p.tempoPertoDoPortador || 0) < esperaMin) return false;

                    // Peso `pressao` do estilo, tal como no carrinho.
                    const taxaDes = ((p.pos === 'CB') ? 9.0 : 4.8) * estiloAtivoDe(p).pressao;
                    return chancePorSegundo(taxaDes, ctx.dt);
                }),
                act('desarmar', actTackle)
            ),

            /*
            Intercetar: a bola vem na minha direcção e eu chego-lhe primeiro.

            Vem ANTES do IrABola de propósito. O chaser é UM por equipa,
            escolhido pelo nível 1 — quem não fosse chaser nem destinatário do
            passe não tinha nenhuma folha que reagisse a uma bola a passar-lhe
            ao lado, e ficava parado a vê-la passar. Os dados já existiam na
            percepção (interceptable/timeToIntercept/interceptionPoint); não
            havia era ninguém a lê-los.

            Não é "toda a gente corre para a bola": só entra quem lá chega
            dentro de PerceptionModel.janelaIntercetar E com vantagem sobre
            quem já vai lá (ver melhorQueOsOutros).
            */
            seq('Intercetar',
                cond('bolaPassaPorMim', podeIntercetar),
                act('intercetar', actIntercept)
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
                    p.speedMult = (5.5 + ((ctx.skillSpeed - 50) / 50) * 1.2) * 1.25 * 0.9;
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
