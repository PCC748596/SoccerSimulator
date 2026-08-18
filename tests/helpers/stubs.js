/*
Globais falsos para testar js/utility/actions.js em Node.

O actions.js lê Match, SpatialGrid, os modelos de config e estiloAtivoDe SEMPRE
dentro das funcoes de considerando, nunca no topo do ficheiro. E' isso que
permite montar o mundo aqui antes de o carregar.
*/

function vec(x, y, z) {
    return {
        x: x, y: y, z: z,
        distanceTo: function (o) {
            return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z);
        }
    };
}

function jogador(opts) {
    const o = opts || {};
    return {
        id: o.id === undefined ? 1 : o.id,
        team: o.team || 'TeamA',
        pos: o.pos || 'CF',
        role: o.role || 'atk',
        dirZ: o.dirZ === undefined ? 1 : o.dirZ,
        targetGoalZ: o.targetGoalZ === undefined ? 52 : o.targetGoalZ,
        hasBall: !!o.hasBall,
        carryDist: o.carryDist || 0,
        carryTouchGrace: 0,
        decisionTimer: o.decisionTimer || 0,
        dribbleCooldownTimer: o.dribbleCooldownTimer === undefined ? 99 : o.dribbleCooldownTimer,
        tempoPertoDoPortador: o.tempoPertoDoPortador || 0,
        playingStyle: o.playingStyle || null,
        styleAtivo: o.styleAtivo === undefined ? true : o.styleAtivo,
        model: { position: vec(o.x || 0, 0, o.z || 0) },
        velocity: { x: 0, y: 0, z: 0, lengthSq: () => 0 },
        // Camada de percepção (js/perception.js) — ver js/player.js:106.
        // timeToIntercept por omissão Infinity, tal como o real: sem dados
        // de percepção, "nunca chego lá".
        blackboard: o.blackboard || { ball: { timeToIntercept: Infinity } },
        skills: o.skills || {},
        skillFor: function (campo) { return (o.skills && o.skills[campo]) || 50; },
        shootingRange: function () { return o.shootingRange === undefined ? 24 : o.shootingRange; },
        fsm: { currentState: o.estado || 'CARRY', changeState: function (s) { this.currentState = s; } }
    };
}

/*
Monta o mundo minimo e devolve o modulo actions.js ja carregado.
Chamar UMA vez por ficheiro de teste; usar `montarMundo` para reconfigurar
entre testes.
*/
function carregarActions() {
    globalThis.ShootingModel = { baseRange: 12.0, skillRange: 12.0, maxOffsetX: 24.0, angleFloor: 0.66, defenderFactor: 0.55 };
    globalThis.CrossModel = { alaX: 15.0, zonaZ: 14.0, areaZ: 34.0, areaX: 20.5, fundoZ: 50.0, distMin: 10.0 };
    globalThis.CarryModel = { corredor: 4.0, abertura: 0.35, espacoLivre: 12.0, distanciaMax: 25.0 };
    globalThis.PassModel = { throughBallGap: 14.0, throughBallDepth: 9.0, throughBallMaxDist: 45.0 };
    globalThis.DribbleModel = { triggerDist: 5.0, cooldown: 1.5 };
    globalThis.DefensivePressureModel = { low: 6.0, balanced: 4.0, high: 2.0 };
    globalThis.CadenceModel = { posseBase: 3.0, posseSobPressao: 0.6 };
    globalThis.UtilityModel = { margemTopN: 0.65, tamanhoPool: 3, inerciaBase: 0.45, inerciaDecai: 0.8 };
    globalThis.EstiloBase = {
        passe: 1.0, remate: 1.0, cruzar: 1.0, lancar: 1.0, conduzir: 1.0,
        driblar: 1.0, pressao: 1.0, marcar: 1.0, intercetar: 1.0, apoiar: 1.0,
        cadencia: 1.0
    };
    globalThis.estiloAtivoDe = function (p) {
        return Object.assign({}, globalThis.EstiloBase, (p && p._estilo) || {});
    };

    /*
    Funcoes de procura e de execucao do BT — substituidas por espioes.

    bestPassTarget devolve o JOGADOR alvo (e' esse o contrato real do
    findPassTarget); as metricas do passe vao para p.ultimoAlvoPasse, como no
    codigo verdadeiro.
    */
    globalThis.emZonaDeRemate = () => globalThis._emZona;
    globalThis.findCross = () => globalThis._cross;
    globalThis.findThroughBall = () => globalThis._through;
    globalThis.bestPassTarget = function (ctx) {
        ctx.p.ultimoAlvoPasse = globalThis._passInfo || null;
        return globalThis._pass;
    };
    for (const nome of ['actShoot', 'actCross', 'actThroughBall', 'actPass',
                        'actCarry', 'actSlideTackle', 'actTackle', 'actChaseBall',
                        'actIntercept', 'actReceivePass', 'actHoldPosition',
                        'actDribble']) {
        globalThis[nome] = function () { globalThis._executou = nome; };
    }

    globalThis.SpatialGrid = {
        cells: true,
        layerValueAt: function () { return globalThis._gridVal === undefined ? 50 : globalThis._gridVal; },
        findFreeSpace: function () { return null; }
    };
    globalThis.Match = { ball: { position: vec(0, 0, 0) }, ballCarrier: null,
                         intendedReceiver: null, players: [], opponents: [],
                         chaserA: null, chaserB: null, state: 'PLAY' };

    globalThis.podeIntercetar = () => globalThis._podeIntercetar;
    globalThis.Tatics = { pressaoDefensiva: 'balanced' };
    globalThis.PerceptionModel = { janelaIntercetar: 1.2, margemMelhor: 0.15 };
    globalThis.ALTURA_BASE_Y = 0;

    const core = require('../../js/utility/core.js');
    Object.assign(globalThis, core);

    return require('../../js/utility/actions.js');
}

/* Contexto minimo, no formato que o PlayerContext real produz. */
function contexto(p, extra) {
    return Object.assign({
        p: p,
        dt: 1 / 60,
        underPressure: false,
        espacoAFrente: Infinity,
        distToBall: 0,
        skillTec: 70,
        skillSpeed: 70,
        campoAberto: true,
        zoneAhead: p.model.position.z * p.dirZ,
        opponents: [],
        teammates: []
    }, extra || {});
}

function accao(lista, nome) {
    const a = lista.find(x => x.nome === nome);
    if (!a) throw new Error('accao ' + nome + ' nao existe');
    return a;
}

module.exports = { vec, jogador, carregarActions, contexto, accao };
