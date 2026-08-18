/*
=============================================================================
UTILITY AI — CATÁLOGO DE ACÇÕES
=============================================================================
Cada acção é declarada como DADOS: uma pré-condição dura, um mapa de
considerandos, a chave do peso de estilo, e a função que a executa.

A função de execução vem, sem alterações, do Behavior Tree que este sistema
substitui (js/bt/player_bt.js). O que muda não é o QUE se faz — é COMO se
escolhe: o BT testava os ramos por ordem e executava o primeiro que passasse;
aqui todos são pontuados e comparados.

Regra dos considerandos: cada um devolve 0..1 e lê o mundo SEMPRE dentro da
função, nunca no topo do ficheiro. É isso que permite testá-los em Node com
globais falsos (ver tests/helpers/stubs.js).
=============================================================================
*/

/* --- Auxiliares partilhados --------------------------------------------- */

// Distância do portador à baliza que ataca.
function _distAoGolo(p) {
    const dx = p.model.position.x;
    const dz = p.model.position.z - p.targetGoalZ;
    return Math.hypot(dx, dz);
}

/*
Perigo da zona onde o jogador está, no referencial DEFENSIVO: 1 junto à própria
baliza, 0 no meio-campo adversário. Serve para penalizar risco (driblar, entrar
em carrinho) perto da própria área, e para valorizar recuperar a bola lá.
*/
function _perigoDaZona(p) {
    const recuo = -(p.model.position.z * p.dirZ);   // metros atrás do meio-campo
    return Math.max(0, Math.min(1, recuo / 40));
}

/*
Adversário mais próximo no cone frontal, dentro da faixa em que driblar faz
sentido. Abaixo de 1.5 m já não há espaço para o toque lateral; acima de
DribbleModel.triggerDist não há ninguém a passar.
*/
function _adversarioParaDriblar(ctx) {
    const p = ctx.p;
    let melhor = null, melhorD = Infinity;
    for (const o of ctx.opponents) {
        if (o.role === 'gk') continue;
        const dz = (o.model.position.z - p.model.position.z) * p.dirZ;
        if (dz <= 0) continue;                        // está atrás
        const d = p.model.position.distanceTo(o.model.position);
        if (d < 1.5 || d > DribbleModel.triggerDist) continue;
        if (d < melhorD) { melhorD = d; melhor = o; }
    }
    return melhor;
}

/*
Quantos adversários há num raio de 6 m (folgado em relação aos 5 m do
DribbleModel.triggerDist de propósito — inclui quem está prestes a fechar o
espaço, não só quem já está no cone de drible). Conta também quem está atrás
do portador: não bloqueia o 1v1, mas ainda é gente que pode ajudar a fechar
depois do primeiro toque.
*/
function _adversariosPerto(ctx, raio) {
    let n = 0;
    for (const o of ctx.opponents) {
        if (o.role === 'gk') continue;
        if (ctx.p.model.position.distanceTo(o.model.position) <= raio) n++;
    }
    return n;
}

/* --- Acções com bola ----------------------------------------------------- */

const AccoesComBola = [
    {
        nome: 'SHOOT',
        estilo: 'remate',
        // A zona de remate continua a ser um gate duro: a camada CHUTE do
        // SpatialGrid é autoria do utilizador e um 0 lá significa "daqui não".
        pre: (ctx) => emZonaDeRemate(ctx),
        considerandos: {
            distancia: (ctx) => Curvas.inv(_distAoGolo(ctx.p) / ctx.p.shootingRange()),
            angulo: (ctx) => Curvas.inv(
                Math.abs(ctx.p.model.position.x) / ShootingModel.maxOffsetX),
            pressao: (ctx) => ctx.underPressure ? 0.45 : 1.0,
            skill: (ctx) => Curvas.linear(ctx.p.skillFor('TEC') / 100, 0.7, 0.3)
        },
        executar: (ctx) => actShoot(ctx)
    },

    {
        nome: 'DRIBBLE',
        estilo: 'driblar',
        /*
        Até esta versão o drible NÃO era uma decisão: o changeState('DRIBBLE')
        vivia dentro do case 'CARRY' da FSM (js/fsm.js) e disparava sempre que
        houvesse um adversário no cone frontal a menos de triggerDist. Não era
        comparado com passar nem rematar, e o estilo do jogador não lhe tocava
        — um Anchor Man driblava tanto como um Prolific Winger.

        O DribbleModel.cooldown também era letra morta: dribbleCooldownTimer era
        posto a zero mas nunca incrementado nem lido. Agora é ambas as coisas
        (ver PlayerContext.prepare).
        */
        pre: (ctx) => {
            // Sem bola não há drible a decidir — a FSM só entra em DRIBBLE a
            // partir de CARRY, e o toque de condução tem uma janela de graça
            // (carryTouchGrace) em que hasBall já é false mas o jogador ainda
            // não voltou a tocar. Sem este gate, a acção podia vencer nessa
            // janela: incrementava dribles.tentados, zerava o cooldown e
            // mandava para DRIBBLE, que devolvia logo a CARRY por falta de
            // bola (js/fsm.js) — tentativa fantasma, cooldown desperdiçado.
            if (!ctx.p.hasBall) return false;
            if ((ctx.p.dribbleCooldownTimer || 0) < DribbleModel.cooldown) return false;
            ctx.adversarioAFrente = _adversarioParaDriblar(ctx);
            return ctx.adversarioAFrente !== null;
        },
        considerandos: {
            // O duelo TEC x MARKING que a FSM já resolve DEPOIS do gesto,
            // antecipado para a decisão: um jogador fraco deixa de tentar
            // aquilo que ia falhar.
            duelo: (ctx) => Curvas.logistica(
                (ctx.p.skillFor('TEC') - ctx.adversarioAFrente.skillFor('MARKING') + 50) / 100,
                6, 0.5),
            // Driblar à entrada da própria área é como se perde jogos.
            risco: (ctx) => Curvas.inv(_perigoDaZona(ctx.p), 0.85, 1.0),
            // 1v1 sim; rodeado, não. `/3` satura o INPUT em 4 adversários
            // dentro do raio (n=4 -> (4-1)/3=1, e o Math.min trava ali): a
            // partir daí já não é 1v1 nem 1v2, é cerco, e mais um corpo à
            // volta não piora nada que já não estivesse mau — sem o
            // Math.min, n=5+ dava um x>1 e o `inv` (que faz k - m*x)
            // resultava negativo, e clamp01 cortava isso a exactamente 0,
            // reabrindo o mesmo buraco que o piso está aqui a fechar. Piso de
            // 0.1 (o `k`/`m` do inv) para não matar a acção por produto
            // quando o portador está mesmo cercado — a área costuma ter 4+
            // adversários num raio de 6m, e isso não deve por si só ser um
            // "nunca", só um "vale bem menos".
            isolamento: (ctx) => Curvas.inv(
                Math.min((_adversariosPerto(ctx, 6.0) - 1) / 3, 1), 0.9, 1.0)
        },
        executar: (ctx) => {
            const p = ctx.p;
            p.dribbleOpponent = ctx.adversarioAFrente;
            p.dribbleCooldownTimer = 0;
            if (typeof MatchStats !== 'undefined') MatchStats[p.team].dribles.tentados++;
            p.fsm.changeState('DRIBBLE');
        }
    },

    {
        nome: 'CROSS',
        estilo: 'cruzar',
        // findCross já filtra ala + profundidade + existência de alvo na área.
        pre: (ctx) => {
            ctx.cross = findCross(ctx);
            return ctx.cross !== null && ctx.cross !== undefined;
        },
        considerandos: {
            // Satura a 3 alvos: o quarto homem na área não melhora nada.
            alvos: (ctx) => Curvas.linear((ctx.cross.alvos || 1) / 3, 1, 0),
            // `largura` e `fundo` já vêm normalizados 0..1 do findCross —
            // um piso de 0.25 impede que estar a meio da ala mate a acção.
            largura: (ctx) => Curvas.linear(ctx.cross.largura || 0, 0.75, 0.25),
            fundo: (ctx) => Curvas.linear(ctx.cross.fundo || 0, 0.75, 0.25),
            pressao: (ctx) => ctx.underPressure ? 0.4 : 1.0
        },
        executar: (ctx) => actCross(ctx)
    },

    {
        nome: 'THROUGH_BALL',
        estilo: 'lancar',
        pre: (ctx) => {
            if (ctx.underPressure) return false;
            ctx.throughBall = findThroughBall(ctx);
            return ctx.throughBall !== null && ctx.throughBall !== undefined;
        },
        considerandos: {
            // `nota` é a pontuação do espaço encontrado (js/bt/player_bt.js:222),
            // tipicamente 0-150, mas `melhorNota` arranca de -Infinity lá
            // dentro e pode sair negativa. Cortamos em 0 antes de normalizar
            // (evita o `/150` empurrar um valor muito negativo para bem
            // longe do intervalo) e damos um piso de 0.1 com o `k` da recta:
            // findThroughBall já validou o espaço como jogável
            qualidade: (ctx) => Curvas.linear(Math.max(0, ctx.throughBall.nota) / 150, 0.8, 0.2),
            // Se for passe alto (com oponentes na frente), cai o score (reduz o chutão cego)
            seguranca: (ctx) => ctx.throughBall.alto ? 0.45 : 1.0,
            skill: (ctx) => Curvas.linear(ctx.p.skillFor('PASS') / 100, 0.7, 0.3)
        },
        executar: (ctx) => actThroughBall(ctx)
    },

    {
        nome: 'PASS',
        estilo: 'passe',
        pre: (ctx) => {
            const preferida = (ctx.p.role === 'def') ? 'mid' : 'atk';
            ctx.passTarget = bestPassTarget(ctx, preferida);
            if (!ctx.passTarget) return false;
            /*
            bestPassTarget devolve o JOGADOR. As métricas do passe escolhido
            ficam em p.ultimoAlvoPasse (escrito pelo findPassTarget). Pode não
            existir quando o alvo veio do caminho Relaxed/Desperate — daí os
            valores neutros.
            */
            ctx.passeInfo = ctx.p.ultimoAlvoPasse || { nota: 100, progressao: 0, folga: 2 };
            return true;
        },
        considerandos: {
            // A nota de findPassTarget vai tipicamente até ~260 (100 de base
            // + bónus de estar livre, de sector e de progressão), mas pode
            // sair negativa num passe muito para trás e muito marcado
            // (js/player.js). Cortamos em 0 antes de normalizar e damos um
            // Cortamos em 0 antes de normalizar e damos um piso: bestPassTarget 
            // já validou este alvo.
            alvo: (ctx) => Curvas.linear(Math.max(0, ctx.passeInfo.nota) / 260, 0.8, 0.2),
            // Abrandar a penalização para passes para trás para não destruir a posse:
            progressao: (ctx) => Curvas.linear(
                Math.max(0, ctx.passeInfo.progressao + 15) / 40, 0.6, 0.4),
            // Folga: menos punição extrema para passes um pouco apertados
            seguranca: (ctx) => Curvas.linear(ctx.passeInfo.folga / 6, 0.7, 0.3),
            // Ao contrário de todas as outras, esta SOBE sob pressão
            pressao: (ctx) => ctx.underPressure ? 1.0 : 0.8
        },
        executar: (ctx) => actPass(ctx)
    },

    {
        nome: 'CARRY',
        estilo: 'conduzir',
        pre: (ctx) => ctx.p.role !== 'gk',
        considerandos: {
            espaco: (ctx) => Curvas.logistica(
                Math.min(ctx.espacoAFrente, 40) / CarryModel.espacoLivre, 6, 0.7),
            // Orçamento de condução: sem isto o portador conduz enquanto houver
            // espaço, e como é ele que abre espaço ao correr, isso é sempre.
            // Piso de 0.1 (mesmo idioma do `risco` do TACKLE acima): ao chegar
            // ao limite isto não pode zerar CARRY por inteiro, senão HOLD (que
            // executa a MESMA actCarry sem nenhuma das restantes considerações
            // de espaço/pressão/skill) assume sem esforço e o orçamento não tem
            // efeito nenhum — exactamente o cenário que ele existe para evitar.
            // Math.min(1, ...) garante que o piso se mantém mesmo bem além do
            // limite (carryDist não é limitado a distanciaMax).
            orcamento: (ctx) => Curvas.inv(
                Math.min(1, (ctx.p.carryDist || 0) / CarryModel.distanciaMax), 0.9, 1.0),
            pressao: (ctx) => ctx.underPressure ? 0.35 : 1.0,
            skill: (ctx) => Curvas.linear(ctx.skillTec / 100, 0.6, 0.4)
        },
        executar: (ctx) => actCarry(ctx)
    },

    {
        nome: 'HOLD',
        estilo: null,
        // Fallback: garante que o portador nunca fica sem acção escolhida.
        // Score fixo baixo — qualquer opção real ganha disto.
        pre: () => true,
        considerandos: { base: () => 0.15 },
        executar: (ctx) => actCarry(ctx)
    }
];

/* --- Acções sem bola ----------------------------------------------------- */

/*
Alcance de desarme de pé. Um central chega mais longe — braços e passada
maiores, e é a função dele. Valores herdados do BT (js/bt/player_bt.js:868).
*/
function _alcanceDesarme(p) {
    return (p.pos === 'CB') ? 2.8 : 2.5;
}

/*
Gate do Defensive Pressure: o jogador tem de estar perto do portador há pelo
menos este tempo antes de tentar roubar. É regra táctica do painel (Low 6s /
Balanced 4s / High 2s), não ruído — por isso continua a ser pré-condição dura
e não considerando.
*/
function _esperouOSuficiente(p) {
    const esperaMin = DefensivePressureModel[Tatics.pressaoDefensiva] ||
                      DefensivePressureModel.balanced;
    return (p.tempoPertoDoPortador || 0) >= esperaMin;
}

// Portador adversário válido, ou null.
function _portadorAdversario(p) {
    const c = Match.ballCarrier;
    if (!c || c.team === p.team || c.role === 'gk') return null;
    return c;
}

/*
Direcção de movimento do portador, em plano XZ. Sem velocidade suficiente
para ter direcção fiável, cai-se na direcção de ataque dele (dirZ) — uma
aproximação ao fallback do BT (quaternion do modelo), sem acoplar este
ficheiro a THREE (ver nota em core.js: nada aqui refere THREE).
*/
function _direcaoDoPortador(c) {
    const v = c.velocity;
    const vx = v ? v.x : 0, vz = v ? v.z : 0;
    if (vx * vx + vz * vz > 0.1) {
        const len = Math.hypot(vx, vz);
        return { x: vx / len, z: vz / len };
    }
    return { x: 0, z: c.dirZ };
}

/*
Carrinho só de frente (0-90°) em relação ao movimento do portador — carrinho
por trás não vale (js/bt/player_bt.js:884-895: "ficava dando de costas, longe
da bola").
*/
function _porFrente(p, c) {
    const dir = _direcaoDoPortador(c);
    let tx = p.model.position.x - c.model.position.x;
    let tz = p.model.position.z - c.model.position.z;
    const lenSq = tx * tx + tz * tz;
    if (lenSq < 0.0001) return false;
    const len = Math.sqrt(lenSq);
    tx /= len; tz /= len;
    return (dir.x * tx + dir.z * tz) >= 0;   // cos(ângulo) >= 0  <=>  ângulo <= 90°
}

/*
Elegibilidade de carrinho: no BT (js/bt/player_bt.js:897-901) `taxa` era 0 —
e portanto a acção impossível — para quem não fosse CB/LB/RB/DM nem
role def/mid. Essa metade de `taxa` era eligibilidade, não ritmo; a
eligibilidade continua a ser pré-condição dura, só o ritmo passou a scoring.
*/
function _elegivelParaCarrinho(p) {
    if (p.pos === 'CB' || p.pos === 'LB' || p.pos === 'RB' || p.pos === 'DM') return true;
    return p.role === 'def' || p.role === 'mid';
}

const AccoesSemBola = [
    {
        nome: 'SLIDE_TACKLE',
        estilo: 'pressao',
        pre: (ctx) => {
            const p = ctx.p;
            // Interruptor do carrinho (UtilityModel.carrinhoAtivo na config).
            // typeof: em Node os testes não carregam a config.
            if (typeof UtilityModel !== 'undefined' && UtilityModel.carrinhoAtivo === false) return false;
            if (!_elegivelParaCarrinho(p)) return false;
            const c = _portadorAdversario(p);
            if (!c || ctx.distToBall >= 12) return false;
            const d = p.model.position.distanceTo(c.model.position);
            if (d < _alcanceDesarme(p) || d >= 4.5) return false;
            if (!_esperouOSuficiente(p)) return false;
            if (!_porFrente(p, c)) return false;
            ctx.alvoDefensivo = c;
            ctx.distAoPortador = d;
            return true;
        },
        considerandos: {
            distancia: (ctx) => Curvas.inv((ctx.distAoPortador - 2.5) / 2.0),
            // Entrar em carrinho perto da própria baliza vale mais: falhar ali
            // já era golo na mesma.
            perigo: (ctx) => Curvas.quad(_perigoDaZona(ctx.p), 0.7, 0.3),
            duelo: (ctx) => Curvas.logistica(
                (ctx.p.skillFor('MARKING') - ctx.alvoDefensivo.skillFor('TEC') + 50) / 100, 6, 0.5)
        },
        executar: (ctx) => actSlideTackle(ctx)
    },

    {
        nome: 'TACKLE',
        estilo: 'pressao',
        pre: (ctx) => {
            const p = ctx.p;
            const c = _portadorAdversario(p);
            if (!c || ctx.distToBall >= 12) return false;
            const d = p.model.position.distanceTo(c.model.position);
            if (d >= _alcanceDesarme(p)) return false;
            if (!_esperouOSuficiente(p)) return false;
            ctx.alvoDefensivo = c;
            ctx.distAoPortador = d;
            return true;
        },
        considerandos: {
            distancia: (ctx) => Curvas.inv(ctx.distAoPortador / _alcanceDesarme(ctx.p)),
            perigo: (ctx) => Curvas.quad(_perigoDaZona(ctx.p), 0.7, 0.3),
            // O duelo real é (VELOCIDADE+FORÇA) contra (VELOCIDADE+FORÇA); aqui
            // antecipa-se para a DECISÃO, não só para o resultado.
            duelo: (ctx) => {
                const meu = ctx.p.skillFor('SPEED') + ctx.p.skillFor('STRENGTH');
                const dele = ctx.alvoDefensivo.skillFor('SPEED') + ctx.alvoDefensivo.skillFor('STRENGTH');
                return Curvas.logistica((meu - dele + 100) / 200, 6, 0.5);
            }
        },
        executar: (ctx) => actTackle(ctx)
    },

    {
        nome: 'INTERCEPT',
        estilo: 'intercetar',
        pre: (ctx) => podeIntercetar(ctx),
        considerandos: {
            // O valor real é o da percepção (js/perception.js), lido pela
            // mesma via que o podeIntercetar já usa — não um campo próprio
            // do jogador, que nunca é escrito.
            tempo: (ctx) => {
                const bola = ctx.p.blackboard && ctx.p.blackboard.ball;
                const tti = (bola && typeof bola.timeToIntercept === 'number')
                    ? bola.timeToIntercept : 0.5;
                return Curvas.inv(tti / PerceptionModel.janelaIntercetar);
            },
            distancia: (ctx) => Curvas.inv(ctx.distToBall / 25)
        },
        executar: (ctx) => actIntercept(ctx)
    },

    {
        nome: 'CHASE_BALL',
        estilo: null,
        pre: (ctx) => ctx.distToBall < 12,
        considerandos: {
            // O chaser é UM por equipa, escolhido pelo nível 1. Quem não for
            // só pode disputar a bola se estiver mesmo em cima dela — senão
            // isto supera HOLD_POSITION (que carrega o peso `marcar`) e a
            // equipa toda larga a posição atrás da bola (ver ruling do dono
            // do produto: bug reportado em revisão).
            designado: (ctx) => {
                if (Match.chaserA === ctx.p || Match.chaserB === ctx.p) return 1.0;
                return 0; // Se não for o chaser, não vai à bola (evita enxame de jogadores)
            },
            distancia: (ctx) => Curvas.inv(ctx.distToBall / 12)
        },
        executar: (ctx) => actChaseBall(ctx)
    },

    {
        nome: 'RECEIVE_PASS',
        estilo: null,
        pre: (ctx) => Match.intendedReceiver === ctx.p,
        // Praticamente incondicional: se o passe vem para mim, vou buscá-lo.
        considerandos: { destinatario: () => 0.95 },
        executar: (ctx) => actReceivePass(ctx)
    },

    {
        nome: 'ATTACK_BOX',
        estilo: 'apoiar',
        pre: (ctx) => {
            const p = ctx.p;
            if (p.role === 'def' || p.role === 'gk') return false;
            const c = Match.ballCarrier;
            if (!c || c.team !== p.team || c === p) return false;
            // Mesmos limiares do findCross: sem isto o cruzamento nunca teria
            // ninguém na área para mirar.
            const carrierX = Math.abs(c.model.position.x);
            const carrierZ = c.model.position.z * c.dirZ;
            if (carrierX < CrossModel.alaX || carrierZ < CrossModel.zonaZ) return false;
            ctx.cruzador = c;
            return true;
        },
        considerandos: {
            // Quem já está perto da área tem mais hipótese de lá chegar a
            // tempo. Piso de 0.15 (o `k` do inv): sem ele, qualquer jogador a
            // mais de 30 m da área (por ex. a meio-campo) dava exactamente 0
            // e matava a acção por produto — mesmo com um colega já em
            // posição perfeita de cruzar.
            proximidade: (ctx) => Curvas.inv(
                Math.min(Math.abs(CrossModel.areaZ - ctx.zoneAhead), 30) / 30, 0.85, 1.0),
            avancado: (ctx) => (ctx.p.role === 'atk') ? 1.0 : 0.6
        },
        executar: (ctx) => {
            const p = ctx.p;
            const c = ctx.cruzador;
            const side = Math.sign(c.model.position.x) || 1;
            // Metade ataca o 1º poste, a outra metade o 2º.
            const targetX = (p.id % 2 === 0) ? -side * 5.0 : side * 9.0;
            const targetZ = (CrossModel.areaZ + 6.0) * p.dirZ;
            p.dynamicTarget.set(targetX, ALTURA_BASE_Y, targetZ);
            p.speedMult = (5.5 + ((ctx.skillSpeed - 50) / 50) * 1.2) * 1.25 * 0.9;
            p.fsm.changeState('MOVE_TO_POS');
        }
    },

    {
        nome: 'HOLD_POSITION',
        estilo: 'marcar',
        // Fallback. actHoldPosition mantém-se intacto: é lá dentro que se
        // escolhe entre MARKING / BLOCKING / FWR_SUPPORT / AFT_SUPPORT /
        // MOVE_TO_POS, com o dynamicTarget que o nível 2 já calculou.
        pre: () => true,
        considerandos: { base: () => 0.2 },
        executar: (ctx) => actHoldPosition(ctx)
    }
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AccoesComBola, AccoesSemBola, _distAoGolo, _perigoDaZona };
}
