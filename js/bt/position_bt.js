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
        desviar(ctx, ctx.bb.ballX * 0.10, ctx.bb.styleDefenseZShift * 0.3 * ctx.p.dirZ);
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
Teto de desvio da marcação (ver MarkingModel.biasMaxPara em config.js) para
o terço do campo onde ALVO está — no referencial de ataque do MARCADOR, não
do alvo, porque é a distância à PRÓPRIA baliza que decide a disciplina.
*/
function biasMaxDaMarcacao(p, alvo, mult) {
    const zoneAhead = alvo.model.position.z * p.dirZ;
    const base = MarkingModel.biasMaxPara(zoneAhead);
    return (mult === undefined) ? base : base * mult;
}

// Aplica a marcação sobre o posto zonal que a folha já calculou.
function marcar(ctx, alvo, maxDist) {
    const p = ctx.p;

    /*
    Grid espacial (camada MARCAÇÃO): zona core perto da própria baliza pede
    marcação mais colada, longe dela (fora da zona) pede mais folga. Factor
    0.7x (colado) a 1.3x (folgado) sobre a distância base do Defensive
    Pressure — a grid afina o valor, não o substitui.
    */
    let distancia = MarkingModel.distancia;
    if (typeof SpatialGrid !== 'undefined' && SpatialGrid.cells) {
        const markVal = SpatialGrid.layerValueAt('marking', alvo.model.position.x, alvo.model.position.z, p.team);
        distancia *= 1.3 - 0.006 * markVal;
    }

    const m = goalSide(p, alvo, distancia);
    aproximar(ctx, m.x, m.z, (maxDist === undefined) ? biasMaxDaMarcacao(p, alvo) : maxDist);
    ctx.isMarking = true;
}

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

    if (p.markingTarget && p.markingTarget.markCount <= 2) {
        marcar(ctx, p.markingTarget);
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

    // O extremo adversário do meu lado tem prioridade sobre tudo.
    let winger = null, wingerDist = 999;
    for (const opp of ctx.opponents) {
        if (opp.role === 'gk') continue;
        if (!['RW', 'LW', 'RM', 'LM'].includes(opp.pos)) continue;
        if (Math.sign(opp.model.position.x) !== flankSign || Math.abs(opp.model.position.x) <= 10.0) continue;
        const d = p.model.position.distanceTo(opp.model.position);
        if (d < wingerDist) { wingerDist = d; winger = opp; }
    }
    if (winger) { marcar(ctx, winger); return; }

    // Senão, o lateral adversário que subir.
    let lateral = null, lateralDist = 999;
    for (const opp of ctx.opponents) {
        if (opp.role === 'gk') continue;
        if (!['LB', 'RB'].includes(opp.pos)) continue;
        if (Math.sign(opp.model.position.x) !== flankSign || Math.abs(opp.model.position.x) <= 10.0) continue;
        if (opp.model.position.z * p.dirZ >= 15.0) continue;
        const d = p.model.position.distanceTo(opp.model.position);
        if (d < lateralDist) { lateralDist = d; lateral = opp; }
    }
    if (lateral) { marcar(ctx, lateral, biasMaxDaMarcacao(p, lateral, 0.9)); return; }

    // Ninguém no corredor: fecha um pouco para dentro, acompanhando a bola.
    ctx.targetX += (bb.ballX * 0.18) - flankSign * 1.5;
}

// Central a defender: marca quem entra na zona; se um colega já pressiona,
// faz a cobertura atrás da bola.
function defendCB(ctx) {
    const p = ctx.p, bb = ctx.bb;

    let naMinhaZona = false;
    for (const opp of ctx.opponents) {
        if (opp.role === 'gk') continue;
        if (Math.abs(opp.model.position.x) < 18 && opp.model.position.z * p.dirZ < -15.0) {
            naMinhaZona = true;
            break;
        }
    }

    if (naMinhaZona && p.markingTarget) {
        marcar(ctx, p.markingTarget);
        return;
    }

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
        // Cobertura: cai atrás da bola, do lado dela.
        aproximar(ctx, bb.ballX * 0.45, bb.ballZ - p.dirZ * 7.5, MarkingModel.coberturaBiasMax);
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

O bloco já basculou (BlockShape.bascular desloca o rectângulo para o lado da
bola). Aqui só se acrescenta o que é específico: quem sai ao portador e quem
faz a cobertura por dentro.
*/
function defendFlankShift(ctx) {
    const p = ctx.p, bb = ctx.bb;
    const carrier = bb.oppCarrier;
    const nearSide = (bb.flankAlert === 'left') ? 'LB' : 'RB';
    const lado = p.baseTarget.x * p.dirZ;
    const eCentralDoLado = (bb.flankAlert === 'left') ? (lado < 0) : (lado > 0);

    if (p.pos === nearSide) {
        // Sai ao portador, pelo lado da baliza.
        marcar(ctx, carrier, biasMaxDaMarcacao(p, carrier));
    } else if (p.pos === 'CB' && eCentralDoLado) {
        // Cobertura por dentro, mais atrás do que o lateral.
        const cob = goalSide(p, carrier, MarkingModel.distancia + 4.5);
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
   PONTO DE ENTRADA
   ========================================================================= */

const PositionAI = {
    // Um tick do nível 2 para um jogador de campo.
    tick: function (player, teamBB) {
        if (player.role === 'gk') return;   // o GK posiciona-se em updateGK()

        if (!player.posCtx) player.posCtx = new PositionContext(player);
        const ctx = player.posCtx.bind(teamBB);

        PositionBT.tick(ctx);
        this.commit(ctx);
    },

    // Coesão táctica final + limites do campo. Corre depois da árvore para que
    // nenhuma folha se possa esquecer de aplicar as regras comuns.
    commit: function (ctx) {
        const p = ctx.p;
        let targetX = ctx.targetX;
        let targetZ = ctx.targetZ;

        // Tiki-taka: com bola e passe curto, puxa ligeiramente para a bola.
        // Peso baixo de propósito — é uma correcção do nível 2 sobre o slot,
        // não pode competir com a forma do rectângulo do nível 1.
        if (Tatics.passe === 'curto' && ctx.bb.isAttacking) {
            targetX = lerp(targetX, Match.ball.position.x, 0.30);
            targetZ = lerp(targetZ, Match.ball.position.z, 0.30);
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
