/*
=============================================================================
PLAYING STYLES — resolução e eventos
=============================================================================
O catálogo (`PlayingStyles`, `EstiloBase`, `EstiloPorOmissao`) vive no
config.js: são só dados. Aqui está o que se FAZ com eles.

Duas responsabilidades:

  1. `estiloDe(p)` — devolve o objecto de estilo do jogador, já preenchido
     com os valores neutros do `EstiloBase`. Toda a gente lê por aqui, para
     nenhuma folha ter de saber se o campo existe ou não.

  2. `PlayingStyleEvents.tick(bb)` — avalia, uma vez por equipa por frame, as
     condições de cada estilo e emite um evento quando ela MUDA (nunca todo
     frame). O padrão é o mesmo do `updateGkStyle`: o estado corrente fica no
     jogador (`p.styleFlags`), o evento é só a notificação da transição.

Porquê eventos e não ifs espalhados: o `Match` (ou qualquer outro sistema)
subscreve `POACHER_ON_SHOULDER` e reorganiza quem tem de reorganizar, sem que
o código de posicionamento precise de saber que existe um poacher.
=============================================================================
*/

const PlayingStyleUtils = {
    // Cache para não reconstruir o objecto fundido a cada leitura.
    _cache: {},

    resolve: function (chave) {
        if (!chave) return EstiloBase;
        if (this._cache[chave]) return this._cache[chave];
        const def = PlayingStyles[chave];
        if (!def) return EstiloBase;
        const fundido = Object.assign({}, EstiloBase, def);
        this._cache[chave] = fundido;
        return fundido;
    }
};

/*
O estilo DECLARADO do jogador — o traço dele, esteja ou não a ser exercido
neste momento. Serve para a UI e para os gatilhos.
*/
function estiloDe(p) {
    return PlayingStyleUtils.resolve(p && p.playingStyle);
}

/*
O estilo EM VIGOR neste frame.

É esta a função que as folhas de posicionamento e de decisão devem usar. Um
estilo não está sempre ligado: um Goal Poacher só se cola ao último defensor
quando a equipa ataca no último terço — fora disso ocupa a posição normal
dele, senão passava o jogo inteiro fora do bloco a não fazer nada. O
`avaliarEstilo` (nível 3, ver player_bt.prepare) é quem liga e desliga.
*/
function estiloAtivoDe(p) {
    if (!p || !p.styleAtivo) return EstiloBase;
    return PlayingStyleUtils.resolve(p.playingStyle);
}

/*
Estilo válido para uma posição? Usado na atribuição e na UI: escolher
"Anchor Man" para um avançado não faz sentido nenhum e seria um erro
silencioso (os modificadores aplicavam-se na mesma).
*/
function estiloValidoPara(chave, pos) {
    const def = PlayingStyles[chave];
    if (!def || !def.posicoes) return false;
    return def.posicoes.indexOf(pos) >= 0;
}

/*
=============================================================================
GATILHOS — quando é que vale a pena exercer o estilo
=============================================================================
Cada função responde a uma pergunta só: "AGORA interessa?". Recebe:

    p     o jogador
    bb    o TeamBlackboard da equipa dele
    s     atalhos já calculados (ver avaliarEstilo), para nenhuma função ter
          de repetir a mesma conta:
            s.avanco       profundidade DELE no referencial de ataque
            s.bolaAvanco   profundidade da BOLA no mesmo referencial
            s.atacando     a equipa tem a bola
            s.ultimoTerco  a bola já está no último terço (> 17 m)
            s.meuLado      a bola está do lado do campo dele
            s.distBola     distância dele à bola

Devolver `true` liga o estilo; `false` desliga (com histerese e tempo mínimo,
ver avaliarEstilo). Um estilo sem gatilho fica sempre ligado — é o caso dos
traços puramente defensivos, que não fazem sentido "desligar".
=============================================================================
*/
const PlayingStyleTriggers = {
    // Corre na linha do último defensor — só quando há ataque para atacar.
    goal_poacher: (p, bb, s) => s.atacando && s.bolaAvanco > 5,

    // Puxa marcação para abrir espaço a outro: precisa de outro com a bola.
    dummy_runner: (p, bb, s) => s.atacando && bb.carrier && bb.carrier !== p && s.bolaAvanco > 0,

    // Espreita na área: só a partir do momento em que a bola pode lá chegar.
    fox_in_the_box: (p, bb, s) => s.atacando && s.bolaAvanco > 12,

    // Ponto de apoio: interessa na CONSTRUÇÃO (bola atrás), para dar saída.
    // Com a bola já lá à frente ele não tem de segurar nada.
    target_man: (p, bb, s) => s.atacando && s.bolaAvanco < 15,

    // Procura o espaço entre linhas: meio-campo em diante.
    creative_playmaker: (p, bb, s) => s.atacando && s.bolaAvanco > -10,

    // Playmaker estático: posse instalada, não em transição — o estilo é
    // exactamente o contrário de um contra-ataque.
    classic_no10: (p, bb, s) => s.atacando && !bb.isCounter && bb.phase >= 2,

    // Rompe para a área: último terço.
    hole_player: (p, bb, s) => s.atacando && s.ultimoTerco,

    // Ala: interessa com a bola do lado dele ou já adiantada.
    prolific_winger: (p, bb, s) => s.atacando && (s.meuLado || s.ultimoTerco),

    // Fecha para dentro: quando a bola está do lado CONTRÁRIO é que há espaço
    // no eixo para ele aparecer.
    roaming_flank: (p, bb, s) => s.atacando && !s.meuLado && s.bolaAvanco > 0,

    // Espera na linha para cruzar: precisa da bola do lado dele e avançada.
    cross_specialist: (p, bb, s) => s.atacando && s.meuLado && s.bolaAvanco > 5,

    // Cobre o campo todo: nas transições, que é quando falta gente.
    box_to_box: (p, bb, s) => bb.isCounter || s.distBola > 18,

    // Batalhador: só faz sentido a defender e com o portador ao alcance.
    the_destroyer: (p, bb, s) => !s.atacando && bb.oppCarrier &&
        p.model.position.distanceTo(bb.oppCarrier.model.position) < 18,

    // Inicia de trás: fase de construção.
    orchestrator: (p, bb, s) => s.atacando && s.bolaAvanco < 10,

    // Trinco: senta-se sempre que a equipa sobe, e a defender também.
    anchor_man: () => true,

    // Sai a jogar: bola no nosso terço.
    build_up: (p, bb, s) => s.atacando && s.bolaAvanco < -10,

    // Central que sobe: último terço, e não quando já se ganha por 2+ (não
    // vale a pena expor a defesa nesse caso).
    extra_frontman: (p, bb, s) => {
        if (!s.atacando || !s.ultimoTerco) return false;
        const meus = (p.team === 'TeamA') ? Match.placarA : Match.placarB;
        const deles = (p.team === 'TeamA') ? Match.placarB : Match.placarA;
        return (meus - deles) < 2;
    },

    // Laterais ofensivos: a partir do momento em que a equipa passa o meio.
    offensive_fullback: (p, bb, s) => s.atacando && s.bolaAvanco > -5,
    fullback_finisher: (p, bb, s) => s.atacando && s.ultimoTerco,

    // Restrição defensiva: está sempre em vigor.
    defensive_fullback: () => true
};

// Uma vez ligado, o estilo aguenta este tempo antes de poder desligar. Sem
// isto qualquer estilo cujo gatilho dependa da posição da bola ligava e
// desligava vários frames por segundo, e o alvo do jogador saltava com ele.
const ESTILO_TEMPO_MINIMO = 1.2;

/*
Decide se o estilo do jogador está em vigor neste frame. Chamado do
`prepare()` do PlayerBT — o nível 3 é que manda aqui, e por isso corre
independentemente do ramo da árvore que vier a ganhar.
*/
function avaliarEstilo(p, bb, dt) {
    if (typeof PlayingStyles === 'undefined' || !p.playingStyle) return;
    if (p.role === 'gk') { p.styleAtivo = true; return; }  // GR tem ciclo próprio

    p.styleTimer = (p.styleTimer || 0) + dt;

    const gatilho = PlayingStyleTriggers[p.playingStyle];
    // Sem gatilho declarado o estilo está sempre em vigor.
    if (!gatilho) { p.styleAtivo = true; return; }

    const avanco = p.model.position.z * p.dirZ;
    const bolaAvanco = bb.ballZ * bb.dir;
    const ladoDele = Math.sign(p.baseTarget.x) || 1;
    const s = {
        avanco: avanco,
        bolaAvanco: bolaAvanco,
        atacando: bb.isAttacking,
        ultimoTerco: bolaAvanco > 17,
        meuLado: Math.sign(bb.ballX) === ladoDele || Math.abs(bb.ballX) < 6,
        distBola: p.model.position.distanceTo(Match.ball.position)
    };

    const quer = !!gatilho(p, bb, s);
    const antes = !!p.styleAtivo;

    // Histerese por tempo: só troca depois de aguentar o mínimo no estado
    // actual. Ligar é imediato; desligar é que espera.
    if (quer === antes) return;
    if (!quer && p.styleTimer < ESTILO_TEMPO_MINIMO) return;

    p.styleAtivo = quer;
    p.styleTimer = 0;
    if (typeof EventBus !== 'undefined') {
        EventBus.emit(quer ? 'STYLE_ON' : 'STYLE_OFF', { p: p, estilo: p.playingStyle });
    }
}

const PlayingStyleEvents = {
    /*
    Uma passagem por equipa. `bb` é o TeamBlackboard já preenchido (tem
    `own`, `opp`, `isAttacking`, `carrier`, `dir`...).
    */
    tick: function (bb) {
        if (typeof PlayingStyles === 'undefined') return;

        const linhaAdv = this._linhaUltimoDefensor(bb);

        for (const p of bb.own) {
            if (p.role === 'gk') continue;              // GK tem o seu próprio ciclo
            const est = estiloDe(p);
            if (!p.styleFlags) p.styleFlags = {};

            this._avaliar(p, 'ombroDefesa', est.ombroDefesa &&
                bb.isAttacking && linhaAdv !== null &&
                Math.abs(p.model.position.z * p.dirZ - linhaAdv) < 3.0,
                'POACHER_ON_SHOULDER');

            this._avaliar(p, 'naArea', est.dentroArea &&
                p.model.position.z * p.dirZ > CrossModel.areaZ &&
                Math.abs(p.model.position.x) < CrossModel.areaX,
                'FOX_IN_BOX');

            this._avaliar(p, 'segurando', est.seguraBola && p.hasBall,
                'TARGET_MAN_HOLD');

            this._avaliar(p, 'aAtrair', est.atraiDefesa &&
                bb.isAttacking && bb.carrier && bb.carrier !== p &&
                p.model.position.distanceTo(bb.carrier.model.position) > 12.0,
                'DUMMY_RUN');

            this._avaliar(p, 'corridaNaArea', (est.avancoComBola >= 8) &&
                bb.isAttacking &&
                p.model.position.z * p.dirZ > CrossModel.areaZ - 6,
                'HOLE_RUN');

            this._avaliar(p, 'naLinha', est.colaNaLinha &&
                bb.isAttacking &&
                Math.abs(p.model.position.x) > CrossModel.alaX + 5,
                'CROSS_READY');

            this._avaliar(p, 'aFechar', est.cortaParaDentro &&
                bb.isAttacking &&
                Math.abs(p.model.position.x) < CrossModel.alaX,
                'WINGER_CUT_INSIDE');

            this._avaliar(p, 'subiu', est.juntaSeAoAtaque &&
                bb.isAttacking && p.model.position.z * p.dirZ > 20,
                'DEFENDER_JOINS_ATTACK');

            this._avaliar(p, 'aPressionar', est.pressao >= 1.5 &&
                !bb.isAttacking && bb.oppCarrier &&
                p.model.position.distanceTo(bb.oppCarrier.model.position) < 6.0,
                'DESTROYER_PRESS');

            this._avaliar(p, 'recuado', (est.avanco <= -5) &&
                bb.isAttacking && p.model.position.z * p.dirZ < 0,
                'DEEP_PLAYMAKER_READY');
        }
    },

    /*
    Emite só na TRANSIÇÃO. Sem isto seriam ~10 eventos por jogador por frame
    (220 por frame no total) e o EventBus deixava de ser útil como sinal.
    */
    _avaliar: function (p, flag, valor, evento) {
        const antes = !!p.styleFlags[flag];
        const agora = !!valor;
        if (antes === agora) return;
        p.styleFlags[flag] = agora;
        if (typeof EventBus !== 'undefined') {
            EventBus.emit(agora ? evento : evento + '_END', { p: p, team: p.team });
        }
    },

    // Profundidade do último defensor adversário, no NOSSO referencial de
    // ataque — é a linha em que um poacher se quer manter.
    _linhaUltimoDefensor: function (bb) {
        let linha = null;
        for (const o of bb.opp) {
            if (o.role === 'gk') continue;
            const z = o.model.position.z * bb.dir;
            if (linha === null || z < linha) linha = z;
        }
        return linha;
    }
};
