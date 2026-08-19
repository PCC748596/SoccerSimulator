/*
=============================================================================
NÍVEL 2 — POSITION BEHAVIOR TREE
=============================================================================
Corre uma vez por jogador de campo por frame, DEPOIS do TeamBT e ANTES do
PlayerBT (nível 3, em js/player.js).

Responde a uma pergunta e só a essa: **onde é que este jogador se deve colocar,
dado o plano colectivo e a posição que ocupa?** Escreve o resultado em
`p.dynamicTarget`.

NÃO decide passes, remates ou desarmes — isso é do nível 3. NÃO executa nada ao
longo do tempo — isso é da PlayerFSM.

O guarda-redes não passa por aqui: o posicionamento dele é específico e vive em
FootballPlayer.updateGK().

Nota de manutenção: a matemática destas folhas foi transposta tal e qual do
antigo Match.runTeamAI/applyPhaseLogic. Os números estão afinados — muda-os com
intenção, não por arrumação.
=============================================================================
*/

/* --- Contexto por jogador ----------------------------------------------- */

class PositionContext {
    constructor(player) {
        this.p = player;
        this.bb = null;         // TeamBlackboard da equipa dele
        this.targetX = 0;
        this.targetZ = 0;
        // Marcou alguém neste tick? A basculação lateral do commit não se aplica
        // a quem está a marcar — arrastá-lo para o lado da bola seria largar o
        // homem. Tem de ser reposto a cada tick: o contexto é reutilizado, e sem
        // isto bastava marcar uma vez para a basculação ficar desligada para
        // sempre naquele jogador.
        this.isMarking = false;
        this.trace = [];
    }

    /*
    O ponto de partida de cada tick é o SLOT no bloco, não a posição de base.

    O bloco vem do nível 1 e já traz dentro a compacidade, a amplitude e a
    basculação. As folhas abaixo passam a ser desvios sobre este ponto — e como
    ninguém precisa de comprimir nada no fim, desapareceram os clamps que
    empilhavam jogadores na mesma fronteira.
    */
    bind(teamBB) {
        const p = this.p;
        this.bb = teamBB;

        const slot = slotNoBloco(p, teamBB);
        if (slot) {
            this.targetX = slot.x;
            this.targetZ = slot.z;
        } else {
            this.targetX = p.baseTarget.x;
            this.targetZ = p.baseTarget.z;
        }
        this.slotX = this.targetX;
        this.slotZ = this.targetZ;

        // Persistido no jogador só para debug visual: o anel do "Team BT
        // POS" mostra ISTO — o slot puro do nível 1, antes de qualquer
        // desvio do nível 2. Ver player.js->update() e o anel mais pequeno
        // do "Position BT" (p.tacticalTarget, já com os desvios).
        if (!p.slotTarget) p.slotTarget = new THREE.Vector3();
        p.slotTarget.set(this.slotX, ALTURA_BASE_Y, this.slotZ);

        this.isMarking = false;
        this.trace.length = 0;
        return this;
    }

    get opponents() { return this.bb.opp; }
    get teammates() { return this.bb.own; }
    get dir() { return this.p.dirZ; }
    get myGoalZ() { return this.p.ownGoalZ; }
}

/* =========================================================================
   FOLHAS OFENSIVAS — a equipa tem a bola
   ========================================================================= */

/*
As folhas ofensivas são DESVIOS sobre o slot que o bind() já pôs.

Antes cada uma recalculava a posição toda a partir do baseTarget, com a sua
própria fórmula e os seus próprios limites. Era daí que vinham as sobreposições:
fórmulas independentes que convergiam para os mesmos pontos, e clamps que as
projectavam sobre as mesmas fronteiras.

Agora o esqueleto da equipa é o rectângulo, e cada posição só lhe acrescenta o
que a distingue.
*/

// Deslocamento em metros no referencial de ataque.
function desviar(ctx, dx, dFrente) {
    ctx.targetX += dx;
    ctx.targetZ += dFrente * ctx.p.dirZ;
}

/*
Vão livre entre adversários, ao longo de uma linha Z fixa — testa uns
candidatos X e escolhe o mais longe do adversário mais próximo em cada um
(maximin, não é gradiente nem física, é escolha entre pontos discretos).

Usado por dois estilos (pedido explícito, "não é um ponto fixo, é relativo
aos adversários"):
    Fox in the Box  — vão entre 2 zagueiros, dentro da área.
    Goal Poacher    — brecha na última linha, à espera do lançamento.

`zAlvo` já vem no referencial do MUNDO (não do ataque) — quem chama resolve
isso. Devolve 0 (centro) se não há adversários de campo para comparar.

Também evita convergir com um COLEGA que já reivindicou um vão perto neste
mesmo frame (`bb.vaosReivindicados`, limpo em TeamBlackboard.gather) — sem
isto, dois atacantes com o mesmo estilo (ex.: dois Fox in the Box) calculavam
cada um o "melhor" vão sem saber do outro, e batiam os dois no mesmo ponto.

Preferência pelo PRÓPRIO lado: sem isto, dois CF cruzavam sem necessidade —
o vão da direita calhava ligeiramente mais aberto e mandava lá o CF da
esquerda (e vice-versa), todos os frames, os dois a passar um pelo outro.
Um pequeno bónus (2m) para candidatos do lado em que ele já está resolve os
quase-empates sem impedir uma troca de lado genuína, quando a diferença é
grande de verdade.
*/
function melhorVaoX(ctx, zAlvo, candidatosX) {
    const bb = ctx.bb;
    /*
    Lado preferido: o da JOGADA (bola), não o lado onde o jogador já está.
    Antes usava só a posição actual dele — com a bola presa num lado, o vão
    "mais livre" no lado OPOSTO ganhava, e o CF ia atrás dele: alvo do lado
    contrário ao da jogada, sem ligação nenhuma com o que estava a acontecer.
    */
    const meuLado = (bb && Math.abs(bb.ballX) > 3 ? Math.sign(bb.ballX) : 0) ||
        Math.sign(ctx.p.model.position.x) || Math.sign(ctx.p.baseTarget.x) || 1;
    let melhorX = 0, melhorNota = -Infinity;
    for (const x of candidatosX) {
        let minD = Infinity;
        for (const opp of ctx.opponents) {
            if (opp.role === 'gk') continue;
            const d = Math.hypot(opp.model.position.x - x, opp.model.position.z - zAlvo);
            if (d < minD) minD = d;
        }
        if (bb && bb.vaosReivindicados) {
            for (const cx of bb.vaosReivindicados) {
                const d = Math.abs(cx - x);
                if (d < minD) minD = d;
            }
        }
        let nota = minD;
        if (Math.sign(x) === meuLado) nota += 4.0;
        if (nota > melhorNota) { melhorNota = nota; melhorX = x; }
    }
    if (bb) {
        if (!bb.vaosReivindicados) bb.vaosReivindicados = [];
        bb.vaosReivindicados.push(melhorX);
    }
    return melhorX;
}

// Trinco: fica um pouco atrás do seu slot, como seguro e primeira estação.
function attackDM(ctx) {
    desviar(ctx, ctx.bb.ballX * 0.12, -3.0);
}

// Central: acompanha a bola de lado, mas recua para dar apoio se o lateral tiver a bola.
function attackCB(ctx) {
    const carrier = ctx.bb.carrier;
    if (carrier && (carrier.pos === 'LB' || carrier.pos === 'RB')) {
        // Se o lateral tem a bola, recua uns metros para dar linha de passe segura.
        // Fica um pouco mais centrado também.
        desviar(ctx, ctx.bb.ballX * 0.05, -7.0 * ctx.p.dirZ);
    } else {
        // Sem termo de Mentalidade aqui: ela ja desloca o bloco INTEIRO
        // (MentalidadeModel.blocoZ, em computeBlock). O `styleDefenseZShift * 0.3`
        // que aqui estava era uma terceira dose do mesmo botao, so no central.
        desviar(ctx, ctx.bb.ballX * 0.10, 0);
    }
}

/*
Lateral: sobe pelo corredor se o flanco estiver livre; senão fica curto.

O avanço é em METROS (FullBackStyle.avancoMax) e não uma fracção da
profundidade do bloco: o comBolaMult do slot valia ~1-3 m no total e nunca
tirava o lateral da linha defensiva, por muito ofensivo que fosse o estilo.

O avanço máximo só se ganha por inteiro quando a equipa já está instalada no
ataque (bb.advanceFactor) — um lateral não arranca 15 m à frente no primeiro
frame da posse. Piso de 40% para ele sair do lugar logo na construção.
*/
function attackFullBack(ctx) {
    const p = ctx.p;
    const flankSign = Math.sign(p.baseTarget.x);
    const estilo = FullBackStyle[p.fbStyle] || FullBackStyle.defensive;

    let livre = true;
    for (const opp of ctx.opponents) {
        if (opp.role === 'gk') continue;
        const noFlanco = (Math.sign(opp.model.position.x) === flankSign && Math.abs(opp.model.position.x) > 10.0);
        const aFrente = (opp.model.position.z * p.dirZ > p.model.position.z * p.dirZ) &&
            (opp.model.position.z * p.dirZ < p.model.position.z * p.dirZ + 15.0);
        if (noFlanco && aFrente) { livre = false; break; }
    }

    if (livre) {
        const rampa = 0.4 + 0.6 * THREE.MathUtils.clamp(ctx.bb.advanceFactor, 0, 1);
        desviar(ctx, flankSign * 1.5, estilo.avancoMax * rampa);
    } else {
        desviar(ctx, -flankSign * 1.0, -estilo.recuo);
    }
}

// Médio interior: procura o espaço entre linhas do lado da bola.
function attackCentralMid(ctx) {
    desviar(ctx, ctx.bb.ballX * 0.18, 0);
}

// Desce a oferecer-se para a construção sair a jogar. Escolhido pelo nível 1.
// Este é o único que ignora o slot: a função dele é ir ter com a bola.
function supportBuildUp(ctx) {
    const p = ctx.p, bb = ctx.bb;
    const lado = Math.sign(p.baseTarget.x) || 1;
    ctx.targetZ = bb.ballZ + TeamShape.supportAhead * p.dirZ;
    ctx.targetX = THREE.MathUtils.clamp(bb.ballX + lado * TeamShape.supportWide, -24, 24);
}

// Médio-ala: abre mais se o sector estiver escolhido no painel.
function attackWideMid(ctx) {
    const p = ctx.p;
    const lado = Math.sign(p.baseTarget.x) || 1;
    const sector = (Tatics.setores.includes('esq') && p.pos === 'LM') ||
        (Tatics.setores.includes('dir') && p.pos === 'RM');
    desviar(ctx, lado * (sector ? 5.25 : 1.0) + ctx.bb.ballX * 0.08, 0);
}

// Avançados: os extremos abrem, o ponta-de-lança ataca o eixo.
function attackForward(ctx) {
    const p = ctx.p;
    if (p.pos === 'RW' || p.pos === 'LW') {
        desviar(ctx, Math.sign(p.baseTarget.x) * 3.0, 0);
    } else {
        desviar(ctx, ctx.bb.ballX * 0.10, 0);
    }
}

// Rede de segurança: o slot puro, sem desvio.
function attackGeneric(ctx) { }

/* =========================================================================
   FOLHAS DEFENSIVAS — a equipa não tem a bola
   ========================================================================= */

/*
Ponto de marcação: sobre a recta que liga o atacante à nossa baliza, a `dist`
metros dele — ou seja, o defensor fica mesmo entre os dois.

Antes o desvio era só em Z (`alvo.z - dirZ * 1.8`). Para um atacante em frente à
baliza dá no mesmo, mas para um atacante aberto no corredor punha o defensor ao
LADO dele, com o caminho da baliza livre nas costas.
*/
function goalSide(p, alvo, dist) {
    const a = alvo.model.position;
    const gx = 0 - a.x;
    const gz = p.ownGoalZ - a.z;
    const l = Math.hypot(gx, gz) || 1;
    return { x: a.x + (gx / l) * dist, z: a.z + (gz / l) * dist };
}

/*
Desloca o alvo actual (já no slot do TeamBT, possivelmente já com outros
desvios) no máximo `maxDist` metros na direcção de (alvoX, alvoZ).

Ao contrário de um lerp por fracção da distância total, isto é sempre um
BIAS em metros — nunca "salta" quase até ao ponto absoluto só porque ele
está longe do slot. É a diferença entre CORRIGIR a posição do TeamBT e
SUBSTITUI-LA por outra. Ver a nota em MarkingModel.
*/
function aproximar(ctx, alvoX, alvoZ, maxDist) {
    let dx = alvoX - ctx.targetX;
    let dz = alvoZ - ctx.targetZ;
    const dist = Math.hypot(dx, dz);
    if (dist > maxDist && dist > 0.001) {
        const k = maxDist / dist;
        dx *= k; dz *= k;
    }
    ctx.targetX += dx;
    ctx.targetZ += dz;
}

/*
A marcação não vive aqui.

Havia um `marcar(ctx, alvo)` que cada folha chamava quando lhe apetecia, com
o seu próprio tecto de desvio. Passou a ser uma regra única, aplicada a toda
a gente com homem atribuído, no PositionAI.commit — ver a nota lá.
*/

/*
Bloco zonal: o slot no bloco JÁ é o posto zonal.

Antes esta folha recalculava x e z a partir do baseTarget com uma fórmula por
função, e depois vinha um clamp por cima. O slot faz o mesmo trabalho e melhor,
porque a forma do bloco é imposta por construção. Fica só o que é situacional:
a cobertura e a marcação.
*/
function defendZonal(ctx) {
    const p = ctx.p, bb = ctx.bb;

    // Acompanhar a bola de lado dentro do próprio corredor.
    const seguirBola = (p.role === 'def') ? 0.10 : (p.role === 'mid' ? 0.18 : 0.12);
    ctx.targetX += bb.ballX * seguirBola;

    // Sem homem para marcar, cai para trás e fecha para o eixo.
    if (p.isCovering) {
        ctx.targetZ -= p.dirZ * 4.0;
        const dxEixo = THREE.MathUtils.clamp(bb.ballX * 0.4 - ctx.targetX, -MarkingModel.coberturaBiasMax, MarkingModel.coberturaBiasMax);
        ctx.targetX += dxEixo;
    }

}

/*
Lateral a defender. Desvios sobre o slot, não posições recalculadas.

O `flankCB` fallback saiu: quando nenhum central correspondia ao flanco, AMBOS
os laterais caíam no mesmo `find(pos === 'CB')` e mediam a partir do mesmo
jogador — LB e RB acabavam a poucos metros um do outro. Era a combinação mais
frequente dos aglomerados medidos (CF + os dois laterais, 34% dos casos).
O slot no bloco já os põe cada um no seu corredor, sem precisar de referência.
*/
function defendFullBack(ctx) {
    const p = ctx.p, bb = ctx.bb;
    const flankSign = Math.sign(p.baseTarget.x) || 1;
    const ultrapassado = (bb.ballZ * p.dirZ < p.model.position.z * p.dirZ - 4.0);

    // Ultrapassado pela bola: corre a recuperar, e aí sim ignora o slot.
    if (ultrapassado && bb.ballZ * p.dirZ < 15.0) {
        ctx.targetX = p.baseTarget.x * 0.85;
        ctx.targetZ = p.ownGoalZ + 12.0 * p.dirZ;
        p.speedMult = (6.0 + ((p.skillFor('SPEED') - 50) / 50) * 1.5) * 1.25 * 0.9; // +25% depois -10% pedidos: sem bola
        return;
    }

    /*
    Este bloco escolhia um homem por conta própria — o extremo do corredor,
    ou o lateral que subisse — e marcava-o, ignorando quem o atribuirMarcacao
    lhe tinha dado. Dois sítios a decidir quem marca quem, e o lateral acabava
    em cima de quem não era o seu.

    Quem marca quem é do atribuirMarcacao; onde o marcador se põe é do commit.
    Aqui fica só o que ele faz sem homem.
    */
    // Ninguém no corredor: fecha um pouco para dentro, acompanhando a bola.
    ctx.targetX += (bb.ballX * 0.18) - flankSign * 1.5;
}

function defendCB(ctx) {
    const p = ctx.p, bb = ctx.bb;

    // Se tem homem atribuído, o commit põe-no atrás dele e o que estiver
    // aqui não conta. Isto é o que ele faz quando NÃO tem ninguém.
    let colegaPressiona = false;
    const carrier = bb.oppCarrier;
    if (carrier) {
        for (const mate of ctx.teammates) {
            if (mate !== p && mate.role !== 'gk' &&
                mate.model.position.distanceTo(carrier.model.position) < 4.0) {
                colegaPressiona = true;
                break;
            }
        }
    }

    if (colegaPressiona) {
        // Cobertura: cai atrás da bola, mas mantendo a SUA posição relativa
        aproximar(ctx, p.baseTarget.x + bb.ballX * 0.14, bb.ballZ - p.dirZ * 7.5, MarkingModel.coberturaBiasMax);
    } else {
        ctx.targetX += bb.ballX * 0.14;
    }
}

// Trinco a defender: tapa o corredor central à frente da última linha.
function defendDM(ctx) {
    const p = ctx.p, bb = ctx.bb;
    const bolaNoEixo = (Math.abs(bb.ballX) < 12.0 && bb.ballZ * p.dirZ < 15.0);

    if (bolaNoEixo) {
        aproximar(ctx, bb.ballX, bb.ballZ - p.dirZ * 1.5, MarkingModel.coberturaBiasMax);
        return;
    }
    ctx.targetX += bb.ballX * 0.22;
}

/*
Basculação para o flanco em perigo.

O bloco já basculou (o centro do rectângulo segue o x da bola, para o lado da
bola). Aqui só se acrescenta o que é específico: quem sai ao portador e quem
faz a cobertura por dentro.
*/
function defendFlankShift(ctx) {
    const p = ctx.p, bb = ctx.bb;
    const carrier = bb.oppCarrier;
    /*
    Lado pelo SINAL, não pelo nome da posição.

    `bb.flankAlert` vem no referencial de ataque da equipa que defende
    (`carrier.x * bb.dir`, ver detectFlankThreat). Nesse referencial quem tem
    `baseTarget.x * dirZ < 0` está no flanco 'left' — e no FormationsData é o
    RB que lá está (x = -0.7), não o LB. O `nearSide = flankAlert === 'left'
    ? 'LB' : 'RB'` que aqui estava mandava por isso o lateral do flanco
    OPOSTO atravessar o campo até à bola, nas duas equipas. Comparar sinais
    tira o problema do nome da posição de vez.
    */
    const ladoAmeaca = (bb.flankAlert === 'left') ? -1 : 1;
    const meuLado = Math.sign(p.baseTarget.x * p.dirZ) || 1;
    const noLadoDaAmeaca = (meuLado === ladoAmeaca);
    const eLateralDoLado = (p.pos === 'LB' || p.pos === 'RB') && noLadoDaAmeaca;
    const eCentralDoLado = noLadoDaAmeaca;

    if (eLateralDoLado) {
        // Aperta o portador. Se tiver homem atribuído, o commit sobrepõe-se a
        // isto — marcar o seu homem vem primeiro que sair ao portador de outro.
        aproximar(ctx, carrier.model.position.x, carrier.model.position.z,
            MarkingModel.coberturaBiasMax);
    } else if (p.pos === 'CB' && eCentralDoLado) {
        // Cobertura por dentro, mais atrás do que o lateral.
        const cob = goalSide(p, carrier, MarkingModel.distanciaPara(carrier.model.position.z * p.dirZ) + 4.5);
        aproximar(ctx, cob.x, cob.z, MarkingModel.coberturaBiasMax);
    } else if (p.pos === 'DM') {
        const dxDM = THREE.MathUtils.clamp(carrier.model.position.x * 0.45 - ctx.targetX, -MarkingModel.coberturaBiasMax, MarkingModel.coberturaBiasMax);
        ctx.targetX += dxDM;
    } else {
        defendZonal(ctx);
    }
}

/* =========================================================================
   A ÁRVORE
   ========================================================================= */

const isPos = (...list) => (ctx) => list.includes(ctx.p.pos);

const PositionBT = sel('PositionRoot',

    // Com bola: cada posição tem uma forma própria de ocupar o campo.
    seq('Ofensivo',
        cond('equipaTemPosse', (ctx) => ctx.bb.isAttacking),
        sel('PorPosicao',
            seq('ApoioNaConstrucao',
                cond('souOApoio', (ctx) => ctx.p === ctx.bb.supportMid),
                act('descerParaReceber', supportBuildUp)
            ),
            seq('Trinco', cond('eTrinco', isPos('DM')), act('subirComoTrinco', attackDM)),
            seq('Central', cond('eCentral', isPos('CB')), act('subirComoCentral', attackCB)),
            seq('Lateral', cond('eLateral', isPos('LB', 'RB')), act('subirNoCorredor', attackFullBack)),
            seq('Interior', cond('eInterior', isPos('CM', 'AM')), act('ocuparEntreLinhas', attackCentralMid)),
            seq('MedioAla', cond('eMedioAla', isPos('RM', 'LM')), act('abrirNaAla', attackWideMid)),
            seq('Avancado', cond('eAvancado', isPos('CF', 'RW', 'LW')), act('atacarArea', attackForward)),
            act('posicaoGenerica', attackGeneric)
        )
    ),

    // Sem bola: o plano colectivo manda primeiro (basculação), depois a posição.
    seq('Defensivo',
        sel('PorSituacao',
            seq('Basculacao',
                cond('equipaBascula', (ctx) => ctx.bb.flankAlert !== null && ctx.bb.oppCarrier !== null),
                act('bascularParaFlanco', defendFlankShift)
            ),
            seq('Lateral', cond('eLateral', isPos('LB', 'RB')), act('defenderCorredor', defendFullBack)),
            seq('Central', cond('eCentral', isPos('CB')), act('defenderEixo', defendCB)),
            seq('Trinco', cond('eTrinco', isPos('DM')), act('taparMeio', defendDM)),
            act('blocoZonal', defendZonal)
        )
    )
);


/* =========================================================================
   MARCACAO — quem marca quem
   =========================================================================
   Passagem de EQUIPA: corre uma vez por equipa por frame, antes dos ticks
   individuais, porque precisa dos 22 jogadores em campo.

   Veio do nivel 1 (team_bt.js) sem alteracoes de comportamento.
   ========================================================================= */

/*
Marcação individual + cobertura. Cada defensor escolhe o adversário que
melhor pontua por proximidade e perigo (distância à própria baliza).
Nenhum adversário é marcado por mais de 2 jogadores.

Histerese por "top-3", como no pickChaser: sem isto, dois adversários com
pontuação parecida faziam o alvo de marcação trocar de um frame para o
outro, e com ele o alvo de posicionamento do defensor (o salto reportado).
Quem já marcava um adversário continua a marcá-lo se ele ainda estiver
entre as 3 melhores opções deste frame.

Nota: p.markingTarget é limpo globalmente TODOS os frames antes deste tick
correr (ver Match.runTeamAI), por isso não dá para comparar contra ele
directamente — o valor "do frame anterior" tem de viver num campo à parte
que sobrevive a esse reset (p.prevMarkingTarget).
*/
function atribuirCobertura(semAlvo) {
    const bola = Match.ball.position;
    semAlvo
        .map(def => ({ def, d: def.model.position.distanceTo(bola) }))
        .filter(c => c.d <= CoberturaModel.raioMaxBola)
        .sort((a, b) => a.d - b.d || a.def.id - b.def.id)
        .slice(0, CoberturaModel.max)
        .forEach(c => { c.def.isCovering = true; });
}

function atribuirMarcacao(bb) {
    // Mesma janela de reação do pickChaser: mantém a marcação de antes da
    // perda de bola em vez de recalcular tudo no mesmo frame.
    const teamStyle = (typeof TeamPlayStyles !== 'undefined') ? TeamPlayStyles[Tatics.teamPlayStyle] : null;
    const reactionDelay = (DefensivePressureModel[Tatics.pressaoDefensiva] || DefensivePressureModel.balanced)
        * (teamStyle ? teamStyle.pressaoPosPerda : 1.0);
    if (!bb.isAttacking && Match.possessionTimer < reactionDelay) {
        const semAlvo = [];
        bb.outfield.forEach(def => {
            const alvo = def.prevMarkingTarget;
            if (alvo) {
                def.markingTarget = alvo;
                alvo.markCount = (alvo.markCount || 0) + 1;
            } else {
                semAlvo.push(def);
            }
        });
        atribuirCobertura(semAlvo);
        return;
    }

    /*
    Com a bola, marcar é tarefa só dos DEFESAS — e cobrir não é tarefa de
    ninguém.

    Isto corria para as duas equipas sem distinção, por isso a equipa que
    atacava saía daqui com a linha toda a marcar alguém: médios e avançados
    sem bola apareciam em MARKING, e os que não arranjavam par caíam em
    BLOCKING. Fechar a linha da bola é acção de quem defende; a equipa com
    posse tem outro trabalho (ver as acções de apoio em actHoldPosition).
    Os defesas continuam a marcar mesmo em posse: é o que evita que uma
    perda de bola apanhe a última linha sem ninguém em cima dos avançados.
    */
    const defenders = bb.isAttacking
        ? bb.outfield.filter(p => p.role === 'def')
        : bb.outfield;
    const attackers = bb.opp.filter(p => p.role !== 'gk');
    const ballCarrier = bb.oppCarrier;
    const primaryChaser = bb.chaser;

    if (primaryChaser && ballCarrier) {
        primaryChaser.markingTarget = ballCarrier;
        // Definir markCount = 2 impede que outros jogadores (na iteração abaixo) decidam marcar o mesmo portador
        ballCarrier.markCount = 2;
        primaryChaser.prevMarkingTarget = ballCarrier;
    }

    /*
    PRIMEIRA PASSAGEM — pares por posição (MarkingModel.paresPorPosicao).

    Corre antes da pontuação para que os pares óbvios de um 4-4-2 saiam
    sempre iguais: central com avançado, lateral com extremo, médio-ala com
    médio-ala. Só depois é que a pontuação trata de quem sobrou.

    Entre candidatos da mesma posição escolhe-se o do MESMO LADO: compara-se
    o x dos dois no mesmo referencial, por isso o lateral esquerdo apanha o
    extremo que ataca por ali, e não o do outro lado do campo.
    */
    const pares = MarkingModel.paresPorPosicao || {};
    defenders.forEach(def => {
        if (def === primaryChaser || def.markingTarget) return;

        const preferidas = pares[def.pos];
        if (!preferidas || !preferidas.length) return;

        for (const posAlvo of preferidas) {
            let melhor = null, melhorDx = Infinity;
            for (const att of attackers) {
                if (att.pos !== posAlvo) continue;
                if (att.markCount >= 1) continue;
                const dx = Math.abs(att.model.position.x - def.model.position.x);
                if (dx < melhorDx) { melhorDx = dx; melhor = att; }
            }
            if (melhor) {
                def.markingTarget = melhor;
                def.prevMarkingTarget = melhor;
                melhor.markCount++;
                break;
            }
        }
    });

    const semAlvo = [];
    defenders.forEach(def => {
        if (def === primaryChaser) return;
        // Já emparelhado por posição na primeira passagem.
        if (def.markingTarget) return;

        const candidatos = [];
        attackers.forEach(att => {
            if (att.markCount >= 1) return;

            const dist = def.model.position.distanceTo(att.model.position);
            if (dist > 25) return;

            // Fora do corredor natural do jogador: nunca é candidato, por
            // muito perto ou perigoso que esteja — ver MarkingModel.corredorMax.
            const xDiff = Math.abs(def.baseTarget.x - att.model.position.x);
            if (xDiff > MarkingModel.corredorMax) return;

            const distToGoal = Math.abs(def.ownGoalZ - att.model.position.z);
            let score = (100 - dist) + (100 - distToGoal) * 1.5;
            score -= (xDiff * 4.0);

            // Penaliza atacantes que tentem marcar jogadores no seu próprio meio-campo
            if (def.role === 'atk' && att.model.position.z * def.dirZ < 5.0) {
                score -= 100;
            }

            if (att === ballCarrier) score += 50;

            candidatos.push({ att, score });
        });
        candidatos.sort((a, b) => b.score - a.score);

        const prevAlvo = def.prevMarkingTarget;
        const prevIdx = prevAlvo ? candidatos.findIndex(c => c.att === prevAlvo) : -1;
        const escolhido = (prevIdx >= 0 && prevIdx < 3)
            ? prevAlvo
            : (candidatos.length ? candidatos[0].att : null);

        if (typeof MatchStats !== 'undefined' && prevAlvo && escolhido !== prevAlvo) {
            MatchStats[bb.team].trocasMarcacao++;
        }

        if (escolhido) {
            def.markingTarget = escolhido;
            escolhido.markCount++;
        } else {
            semAlvo.push(def);
        }
        def.prevMarkingTarget = escolhido;
    });

    // Cobertura só a defender — ver a nota acima.
    if (!bb.isAttacking) atribuirCobertura(semAlvo);
}

/* =========================================================================
   TACKLING — tirar a bola ao adversário
   =========================================================================
   Decisão de nível 2, junto da marcação: tirar a bola é defesa, e a defesa
   toda vive aqui. Estava no nível 3, nas folhas `vale carrinho` e `vale
   desarme` do PlayerBT, com os números escritos no meio das condições — ver
   TacklingModel em config.js, para onde foram todos.

   As ACÇÕES (actTackle/actSlideTackle, em player_bt.js) ficam onde estão:
   são execução, e é este nível que as dispara.

   DESLIGADO por inteiro enquanto TacklingModel.ativo for false.
   ========================================================================= */

const TacklingAI = {
    /*
    Setor onde é permitido tentar. Fora dele o jogador marca e acompanha, sem
    se atirar à bola: atacar a bola a meio campo é o que desfaz o bloco — o
    marcador salta ao portador, falha, e o corredor dele fica aberto com a
    equipa toda já ultrapassada.
    */
    podeRoubar(p) {
        const setor = TacklingModel.setor;
        if (!setor) return true;
        const terco = CAMPO_COMP / 6;
        const zAtk = p.model.position.z * p.dirZ;
        if (setor === 'def') return zAtk < -terco;
        if (setor === 'mid') return zAtk < terco;
        return true;
    },

    // Condições comuns às duas tentativas.
    podeTentar(p) {
        if (!TacklingModel.ativo) return false;
        if (!this.podeRoubar(p)) return false;

        const c = Match.ballCarrier;
        if (!c || c.team === p.team || c.role === 'gk') return false;
        if (p.model.position.distanceTo(Match.ball.position) >= TacklingModel.distMaxBola) return false;

        /*
        A marcar: só se o portador for o MEU homem. Não se abandona a marca
        para ir ao portador de outro — era assim que a marcação se desfazia
        toda de uma vez, com meia equipa a convergir no mesmo jogador.
        */
        if (p.markingTarget && p.markingTarget !== c) return false;

        return true;
    },

    // Devolve 'SLIDE_TACKLE', 'TACKLE' ou null. Não muda estado nenhum.
    decidir(p, dt) {
        if (!this.podeTentar(p)) return null;

        const c = Match.ballCarrier;
        const d = p.model.position.distanceTo(c.model.position);
        const estilo = estiloAtivoDe(p).pressao;

        // Carrinho primeiro: alcance maior, taxa mais baixa.
        const K = TacklingModel.carrinho;
        if (d >= K.distMin && d <= K.distMax && this.anguloDeEntradaOk(p, c, K.anguloMax)) {
            const taxa = TacklingModel.taxaDe(K.taxaPorPosicao, p.pos) * estilo;
            if (chancePorSegundo(taxa, dt)) return 'SLIDE_TACKLE';
        }

        const D = TacklingModel.desarme;
        const alcance = (p.pos === 'CB') ? D.alcanceCB : D.alcance;
        if (d < alcance) {
            const taxa = TacklingModel.taxaDe(D.taxaPorPosicao, p.pos) * estilo;
            if (chancePorSegundo(taxa, dt)) return 'TACKLE';
        }

        return null;
    },

    // Entra de frente, de lado ou em perseguição diagonal — nunca por trás.
    anguloDeEntradaOk(p, c, grausMax) {
        const dirPortador = c.velocity.lengthSq() > 0.1
            ? c.velocity.clone().normalize()
            : new THREE.Vector3(0, 0, 1).applyQuaternion(c.model.quaternion);

        const paraDefensor = new THREE.Vector3().subVectors(p.model.position, c.model.position);
        paraDefensor.y = 0;
        if (paraDefensor.lengthSq() < 0.0001) return false;
        paraDefensor.normalize();

        return dirPortador.angleTo(paraDefensor) <= (grausMax * Math.PI / 180);
    }
};

/* =========================================================================
   PONTO DE ENTRADA
   ========================================================================= */

const PositionAI = {
    /*
    Passagem de EQUIPA, uma vez por equipa por frame, antes dos ticks
    individuais: quem marca quem. Precisa dos 22 jogadores, por isso não pode
    viver no tick de um jogador só.

    Estava no nível 1 (assignMarking, em team_bt.js). Marcar não é a forma
    colectiva, é onde cada jogador se põe — nível 2. O nível 1 continua a
    escolher o perseguidor da bola (pickChaser), que é decisão de equipa: só
    um vai.
    */
    assignMarking: function (teamBB) {
        atribuirMarcacao(teamBB);
    },

    // Um tick do nível 2 para um jogador de campo.
    tick: function (player, teamBB) {
        if (player.role === 'gk') return;   // o GK posiciona-se em updateGK()

        if (!player.posCtx) player.posCtx = new PositionContext(player);
        const ctx = player.posCtx.bind(teamBB);

        PositionBT.tick(ctx);
        this.commit(ctx);

        /*
        Tackling depois do posicionamento: a decisão de atacar a bola sobrepõe-se
        ao alvo, não o substitui a meio. Desligado enquanto TacklingModel.ativo
        for false — ver TacklingAI.
        */
        const dt = (typeof Match !== 'undefined' && Match.delta) ? Match.delta : 0.016;
        const tentativa = TacklingAI.decidir(player, dt);
        if (tentativa === 'SLIDE_TACKLE') actSlideTackle(ctx);
        else if (tentativa === 'TACKLE') actTackle(ctx);
    },

    // Coesão táctica final + limites do campo. Corre depois da árvore para que
    // nenhuma folha se possa esquecer de aplicar as regras comuns.
    commit: function (ctx) {
        const p = ctx.p;
        let targetX = ctx.targetX;
        let targetZ = ctx.targetZ;

        /*
        MARCAÇÃO — a regra, não um desvio.

        Quem tem homem atribuído fica ATRÁS dele: sobre a recta que liga o
        homem à NOSSA baliza, a MarkingModel.distancia metros dele. "Atrás"
        aqui é do lado da nossa baliza — o marcador entre o homem e o golo
        que defende. É isso e mais nada; nem o slot do bloco nem folha
        nenhuma o podem contornar.

        Antes cada folha decidia SE marcava, e com as suas próprias
        condições por cima:

            defendFullBack  ignorava o markingTarget e escolhia outro homem
                            por proximidade — marcava quem não lhe tinha
                            sido atribuído, ou ninguém
            defendDM        nunca marcava, mesmo com homem atribuído
            defendCB        só marcava com o homem dentro da zona de perigo
                            (|x| < 22 e no nosso terço); fora disso limitava-se
                            a acompanhar o x dele
            defendZonal     só se markCount <= 2
            defendFlankShift marcava o PORTADOR, não o homem atribuído
            attackCB        (equipa com bola) nunca marcava

        O resultado era gente com a etiqueta MARKING espalhada pelo campo sem
        estar do lado de dentro de ninguém.
        */
        if (p.markingTarget) {
            const m = goalSide(p, p.markingTarget, MarkingModel.distancia);
            targetX = m.x;
            targetZ = m.z;
        }

        /*
        A compactação lateral por degraus saiu daqui.

        Era `if (ballX > 10) { if (targetX < -18) targetX = min(-18, targetX+12) }`
        e mais três ramos iguais: cada um empurra o jogador contra um limite
        FIXO, e quem chegar a esse limite fica todo no mesmo x. Medido: 10% dos
        alvos exactamente em x=28. A basculação passou para o rectângulo do
        nível 1, onde desloca a forma inteira e não pode empilhar ninguém.

        Não voltar a clampar aqui contra bb.bloco: as folhas do nível 2
        (defendFullBack "ultrapassado", marcar, defendFlankShift) saem do
        slot DE PROPÓSITO quando a situação exige — um clamp duro ao
        rectângulo reintroduz exactamente o efeito de empilhamento na
        fronteira que a refactorização eliminou. Só os limites gerais do
        campo, abaixo, se aplicam.
        */

        const dt = (typeof Match !== 'undefined' && Match.delta) ? Match.delta : 0.016;
        let k = 1 - Math.exp(-PositionSmoothing * dt);
        if (p.snapPosition) { k = 1; p.snapPosition = false; }

        /*
        Afastar do próprio GR quando ele está com a bola na mão.
        */
        if (p.role !== 'gk' && Match.gkHoldingBall[p.team]) {
            const gk = ctx.teammates.find(t => t.role === 'gk');
            if (gk) {
                const dx = targetX - gk.model.position.x;
                const dz = targetZ - gk.model.position.z;
                const dist = Math.hypot(dx, dz);
                const raio = 8.0;
                if (dist < raio) {
                    if (dist < 0.001) { targetX += raio; }
                    else { const k2 = (raio - dist) / dist; targetX += dx * k2; targetZ += dz * k2; }
                    targetX = Math.max(-32, Math.min(32, targetX));
                    targetZ = Math.max(-50, Math.min(50, targetZ));
                }
            }
        }

        // Bias temporário de reorganização (evento CB_HAS_BALL)
        if (p.buildOutTimer > 0) {
            targetX += p.buildOutBias.x;
            targetZ += p.buildOutBias.z;
            targetX = Math.max(-32, Math.min(32, targetX));
            targetZ = Math.max(-50, Math.min(50, targetZ));
            p.buildOutTimer -= dt;
        }

        // tacticalTarget é o alvo PURO do Nível 2 (TeamBT/PositionBT)
        // ANTES do PlayingStyle (Nível 3).
        let rawTx = Math.max(-32, Math.min(32, targetX));
        let rawTz = Math.max(-50, Math.min(50, targetZ));

        if (!p.tacticalTarget) p.tacticalTarget = new THREE.Vector3(rawTx, ALTURA_BASE_Y, rawTz);
        p.tacticalTarget.x = lerp(p.tacticalTarget.x, rawTx, k);
        p.tacticalTarget.z = lerp(p.tacticalTarget.z, rawTz, k);
        p.tacticalTarget.y = ALTURA_BASE_Y;

        /*
        Playing style — camada posicional (ver PlayingStyles em config.js e
        playing_styles.js). Aplicada AQUI, sobre o alvo já decidido pela folha
        da posição, e não dentro de cada folha: o estilo é um desvio pessoal
        por cima do papel táctico, não uma substituição dele.

        Só afecta jogadores de campo — o GR tem o seu próprio ciclo (updateGK).
        */
        if (Config.usePlayingStyles && p.role !== 'gk' && typeof estiloAtivoDe === 'function') {
            const est = estiloAtivoDe(p);

            // Avanço/recuo, no referencial de ataque.
            let avanco = est.avanco;
            if (ctx.bb && ctx.bb.isAttacking) avanco += est.avancoComBola;
            if (avanco !== 0) targetZ += avanco * p.dirZ;

            // Largura: + abre para a linha do LADO DELE, − fecha para o eixo.
            if (est.largura !== 0) {
                const ladoEst = Math.sign(p.baseTarget.x) || 1;
                targetX += est.largura * ladoEst;
            }

            /*
            `ombroDefesa` (Goal Poacher): cola-se à linha do último defensor,
            à espera do lançamento — pedido explícito: não num X fixo, na
            BRECHA da linha (o vão entre os dois zagueiros mais próximos ali,
            ver melhorVaoX). Z continua um alvo absoluto (a graça é estar
            exactamente no limite do fora-de-jogo).
            */
            if (est.ombroDefesa && ctx.bb && ctx.bb.isAttacking &&
                ctx.bb.offsideLimitDir !== null && ctx.bb.offsideLimitDir !== undefined) {
                targetZ = (ctx.bb.offsideLimitDir - 0.5) * p.dirZ;
                targetX = melhorVaoX(ctx, targetZ,
                    [-16, -12, -8, -4, 0, 4, 8, 12, 16]);
            }

            /*
            `dentroArea` (Fox in the Box): dentro da grande área, mas no VÃO
            entre zagueiros — pedido explícito: "numa posição que não tenha
            adversário, ou entre 2 adversários", não um X qualquer dentro da
            caixa.
            */
            if (est.dentroArea && ctx.bb && ctx.bb.isAttacking) {
                if (targetZ * p.dirZ < CrossModel.areaZ) targetZ = CrossModel.areaZ * p.dirZ;
                targetX = melhorVaoX(ctx, targetZ,
                    [-16, -11, -6.5, -2, 2, 6.5, 11, 16]);
            }

            /*
            `atraiDefesa` (Dummy Runner): afasta-se do portador em vez de se
            oferecer. É isso que puxa o marcador dele e abre o espaço para
            outro — o oposto do que qualquer outra folha faz.
            */
            if (est.atraiDefesa && ctx.bb && ctx.bb.isAttacking && ctx.bb.carrier && ctx.bb.carrier !== p) {
                const fx = targetX - ctx.bb.carrier.model.position.x;
                const fd = Math.abs(fx) || 1;
                targetX += (fx / fd) * 6.0;
            }

            // `colaNaLinha` (Cross Specialist) vs `cortaParaDentro`.
            //
            // Antes puxava para uma linha ABSOLUTA do campo (alaX+7=22m),
            // ignorando o bloco — que bascula com a bola (ver centroX em
            // team_bt.js). Com o jogo do lado oposto, o bloco desliza para
            // lá e o lateral ficava esticado até aos 22m absolutos, bem fora
            // do rectângulo encolhido/deslocado (anéis do PositionBT saíam
            // do TeamBT). Agora o tecto é o próprio limite do bloco, não o
            // campo inteiro.
            if (est.colaNaLinha && ctx.bb && ctx.bb.isAttacking) {
                const ladoEst = Math.sign(p.baseTarget.x) || 1;
                let tectoAla = CrossModel.alaX + 7;
                if (ctx.bb.bloco) {
                    const bordaBloco = ladoEst > 0 ? ctx.bb.bloco.x1 : -ctx.bb.bloco.x0;
                    tectoAla = Math.min(tectoAla, Math.max(bordaBloco, 0));
                }
                targetX = ladoEst * Math.max(Math.abs(targetX), tectoAla);
            }

            /*
            `fechaComBolaCentral` (Roaming Flank): pedido explícito (2ª
            correcção) — fica na PONTA por padrão, só busca o meio quando não
            consegue prosseguir pelo lado (corredor tapado por um adversário
            à frente), não só porque a bola está central. A 1ª versão fechava
            proporcional a |ballX|, agressiva de mais — fechava mesmo com o
            corredor livre. Mesma checagem de "corredor livre" do
            attackFullBack.
            */
            if (est.fechaComBolaCentral && ctx.bb && ctx.bb.isAttacking) {
                const ladoEst = Math.sign(p.baseTarget.x) || 1;
                let tapado = false;
                for (const opp of ctx.opponents) {
                    if (opp.role === 'gk') continue;
                    const noFlanco = (Math.sign(opp.model.position.x) === ladoEst && Math.abs(opp.model.position.x) > 10.0);
                    const aFrente = (opp.model.position.z * p.dirZ > p.model.position.z * p.dirZ) &&
                        (opp.model.position.z * p.dirZ < p.model.position.z * p.dirZ + 12.0);
                    if (noFlanco && aFrente) { tapado = true; break; }
                }
                if (tapado) targetX *= 0.5;
            }

            // `amplitudeZ`: estica ou encolhe o afastamento ao meio do bloco.
            if (est.amplitudeZ !== 1.0 && ctx.bb && ctx.bb.bloco) {
                const centro = (ctx.bb.bloco.z0 + ctx.bb.bloco.z1) / 2 * ctx.bb.dir;
                targetZ = centro + (targetZ - centro) * est.amplitudeZ;
            }

            /*
            `travaNaEntradaArea` (Box-to-Box): "da entrada de uma área até a
            entrada da outra" — pedido explícito. Sem teto, amplitudeZ (1.5x)
            esticava o alvo para BEM DENTRO da área adversária, um meio-campo
            a jogar de ponta-de-lança. Trava aqui, depois do amplitudeZ, para
            cortar só o excesso — nunca empurra para trás quem já estava
            aquém do teto.
            */
            if (est.travaNaEntradaArea && targetZ * p.dirZ > CrossModel.areaZ) {
                targetZ = CrossModel.areaZ * p.dirZ;
            }
        }

        let tx = Math.max(-32, Math.min(32, targetX));
        let tz = Math.max(-50, Math.min(50, targetZ));

        // styleTarget é o alvo após aplicar o Nível 3 (PlayingStyle)
        // Serve primariamente para visualização no anel
        if (!p.styleTarget) p.styleTarget = new THREE.Vector3(tx, ALTURA_BASE_Y, tz);
        p.styleTarget.x = lerp(p.styleTarget.x, tx, k);
        p.styleTarget.z = lerp(p.styleTarget.z, tz, k);
        p.styleTarget.y = ALTURA_BASE_Y;

        // dynamicTarget é o alvo que a FSM (Nível 3) vai usar e potencialmente reescrever
        // (por exemplo, quando vai à bola ou foge de adversários).
        p.dynamicTarget.x = lerp(p.dynamicTarget.x, tx, k);
        p.dynamicTarget.z = lerp(p.dynamicTarget.z, tz, k);
        p.dynamicTarget.y = ALTURA_BASE_Y;
    }
};
