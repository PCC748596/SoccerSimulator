/*
=============================================================================
UTILITY AI — PONTO DE ENTRADA DO NÍVEL 3
=============================================================================
Substitui o PlayerAI (js/bt/player_bt.js) enquanto window.usarUtilityAI estiver
ligado. Reutiliza o PlayerContext do BT — o contexto por jogador já calculava
tudo o que é preciso (pressão, espaço à frente, skills, orçamento de condução).

Três gates duros correm ANTES de qualquer pontuação. Não são questões de
utilidade, são regras do jogo, e metê-las na pontuação abriria a porta a uma
acção em curso ser interrompida por um score marginal:

    1. jogo parado           -> comportamento de bola parada
    2. acção em curso na FSM -> deixa terminar
    3. guarda-redes          -> conjunto de acções próprio

O resto é: pontuar todas as candidatas, multiplicar pelo peso do estilo,
escolher, executar.
=============================================================================
*/

/*
Bónus de permanência da acção actual.

Substitui o ramo `Dominar` do Behavior Tree, que bloqueava o portador durante
CadenceModel.posseBase (3 s) a "pensar": nesse tempo ele só conduzia e não
avaliava nada, e por isso entrava na área com o guarda-redes batido a contar os
segundos (havia uma excepção só para o remate, precisamente por isso).

Agora ele avalia todos os frames. O que impede a oscilação é este bónus: a
acção que já escolheu vale mais 45% enquanto for recente, e só perde para outra
que seja claramente melhor. Ao fim de ~2 s o bónus é residual e ele reavalia de
livre vontade.

O decaimento escala com a cadência: sob pressão encurta (decide mais depressa,
como o CadenceModel.posseSobPressao fazia), e o estilo estica ou encolhe
(Target Man 1.6 segura a bola, Fox in the Box 0.6 resolve num toque).
*/
function bonusDeInercia(p, nome, ctx) {
    if (p.utilityAccao !== nome) return 1.0;

    const ritmo = ctx.underPressure
        ? (CadenceModel.posseSobPressao / CadenceModel.posseBase)
        : 1.0;
    const cadencia = (typeof estiloAtivoDe === 'function')
        ? (estiloAtivoDe(p).cadencia || 1.0) : 1.0;

    const decaimento = Math.max(0.05, UtilityModel.inerciaDecai * ritmo * cadencia);
    const t = p.utilityTempoNaAccao || 0;

    return 1 + UtilityModel.inerciaBase * Math.exp(-t / decaimento);
}

const UtilityAI = {

    tick: function (player, dt) {
        if (!player.btCtx) player.btCtx = new PlayerContext(player);
        const ctx = player.btCtx.prepare(dt);

        /*
        O relógio de inércia avança AQUI, antes dos gates duros — não depois
        de chegar ao loop de pontuação. Um remate ou um desarme ocupam a FSM
        durante ~1-1.5s através de gatesDuros (estadoBloqueante), e nesses
        frames o nome da acção em curso (player.utilityAccao) não muda —
        continua a ser a mesma acção que a bloqueou. Se o acumulador só corre
        depois do gate, esses frames "desaparecem" do relógio e a próxima
        vez que a acção chegar à pontuação, bonusDeInercia vê t≈0 e devolve o
        bónus de permanência inteiro outra vez, como se nenhum tempo tivesse
        passado — o oposto do decaimento calibrado em segundos reais.
        */
        player.utilityTempoNaAccao = (player.utilityTempoNaAccao || 0) + dt;

        if (this.gatesDuros(ctx)) return;

        const comBola = player.hasBall || player.carryTouchGrace > 0;
        const lista = comBola ? AccoesComBola : AccoesSemBola;

        const candidatas = [];
        for (const accao of lista) {
            const r = avaliarAccao(accao, ctx);
            if (r.score <= 0) continue;
            r.score *= this.pesoDoEstilo(player, accao);
            r.score *= bonusDeInercia(player, accao.nome, ctx);
            candidatas.push(r);
        }

        if (window.showPlayerPoints) {
            player.utilityTrace = candidatas.slice().sort((a, b) => b.score - a.score);
        }

        const escolhida = escolherAccao(
            candidatas, UtilityModel.margemTopN, UtilityModel.tamanhoPool);
        if (!escolhida) return;

        // Contador de permanência: já foi acumulado no topo do tick (mesmo em
        // frames gateados). Só zera aqui, na troca de acção.
        if (player.utilityAccao !== escolhida.nome) {
            player.utilityTempoNaAccao = 0;
        }
        player.utilityAccao = escolhida.nome;

        escolhida.accao.executar(ctx);
    },

    /*
    Devolve true se um gate tratou o frame e não há nada a pontuar.
    O comportamento de cada gate é o mesmo dos ramos homónimos do BT.
    */
    gatesDuros: function (ctx) {
        const p = ctx.p;

        if (Match.state !== 'PLAY') {
            const fsm = p.fsm;
            if (Match.state === 'CORNER_KICK') {
                if (fsm.currentState !== 'SET_PIECE_TAKER' && fsm.currentState !== 'SET_PIECE_WAIT') {
                    fsm.changeState('SET_PIECE_WAIT');
                }
            } else if (Match.state === 'GOAL_KICK') {
                if (fsm.currentState !== 'SET_PIECE_TAKER' &&
                    fsm.currentState !== 'SET_PIECE_WAIT' &&
                    fsm.currentState !== 'MOVE_TO_POS') {
                    fsm.changeState('SET_PIECE_WAIT');
                }
            } else {
                fsm.changeState('IDLE');
            }
            return true;
        }

        const s = p.fsm.currentState;
        if (s === 'PASS' || s === 'SHOOT' || s === 'TACKLE' || s === 'SLIDE_TACKLE' ||
            s === 'CHEST_CONTROL' || s === 'DRIBBLE') {
            return true;
        }

        // Guarda-redes: mantém a lógica do BT, que é um caso à parte e não
        // beneficia de pontuação (as opções dele são mutuamente exclusivas).
        if (p.role === 'gk') {
            if (p.hasBall || p.carryTouchGrace > 0) {
                ctx.passTarget = p.findPassTarget('def') || p.findPassTarget('mid') ||
                    (ctx.underPressure ? p.findPassTargetRelaxed() : null);
                if (ctx.passTarget) actPass(ctx);
                else if (p.decisionTimer > 1.2) p.puntBall();
                else actCarry(ctx);
            } else {
                actGoalkeeperPosition(ctx);
            }
            return true;
        }

        return false;
    },

    pesoDoEstilo: function (p, accao) {
        if (!accao.estilo) return 1.0;
        const est = estiloAtivoDe(p);
        const w = est[accao.estilo];
        return (w === undefined) ? 1.0 : w;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UtilityAI, bonusDeInercia };
}
