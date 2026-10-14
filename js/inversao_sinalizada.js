/*
=============================================================================
INVERSAO SINALIZADA E SUP_TO_INVERT — a equipa avisa que a jogada e uma inversao
=============================================================================
Pedido: quando o jogador nao consegue inverter DIRECTAMENTE, tem de poder usar passes para tras — mas a equipa tem
de saber que e uma inversao: a penalizacao do passe para tras ajusta-se, e alguem recua para dar a opcao.

O SINAL (`sinal`, por equipa). Nasce quando a equipa tem a bola e o corredor da bola passou do alvo do treinador mais
a margem de TEMPO (BalancoCorredores, TempoPorCorredor.empurrao > 0). O destino e o corredor com mais falta de tempo.
Dura ate a bola chegar la, ou `duracaoMax` s, e fica em `cooldown` s sem outro.

O APOIO DE INVERSAO (SUP_TO_INVERT). Se o portador nao tem ninguem LIVRE no corredor de destino (a inversao directa),
um colega vai para um espaco livre ATRAS da bola (`recuo` m, e `lateral` m para o lado do destino), no corredor da
bola ou entre os dois, para receber e jogar para o lado contrario. O estado da FSM e SUP_TO_INVERT (a mesma locomocao
do SUPPORT_PASS) e `p.apoioInverter` guarda o ponto. A escolha e de EQUIPA, como a dos apoios normais.

NA NOTA DO PASSE (findPassTarget, player.js; `favorece` abaixo):
  . o passe ao apoio (para tras) conta como inversao: nao paga as penalidades de recuar nem de virar o corpo, e leva
    o bonus de inversao;
  . o passe de quem recebeu como apoio para o corredor de destino tambem (durante `janelaPassePosReceb` s);
  . com o sinal activo, um passe directo a um colega LIVRE no corredor de destino conta como inversao sem pedir
    congestao (o criterio de tempo substitui-o).
=============================================================================
*/
const InversaoSinalizada = {
    _est: { TeamA: null, TeamB: null },

    _de(team) { return this._est[team] || (this._est[team] = { sinal: null, cooldown: 0, ultimoPonto: null }); },

    reset() { this._est = { TeamA: null, TeamB: null }; },

    sinal(team) { const e = this._est[team]; return e ? e.sinal : null; },

    _limpar(lista, e) {
        e.sinal = null;
        for (const p of lista) p.apoioInverter = null;
    },

    _livreDe(x, z, adv) {
        let m = 99;
        for (const a of adv) m = Math.min(m, Math.hypot(a.x - x, a.z - z));
        return m;
    },

    // O centro (x, referencial de ataque) de cada corredor, para saber para que lado fica o destino.
    _centroX(cor) {
        const c = (typeof BalancoCorredores !== 'undefined' && typeof BalancoCorredores.corteX === 'number')
            ? BalancoCorredores.corteX : ((typeof CAMPO_LARG === 'number' ? CAMPO_LARG : 68) / 6);
        return cor === 'esq' ? -2 * c : (cor === 'dir' ? 2 * c : 0);
    },

    /*
    Uma vez por frame e por equipa, depois do posicionamento e dos apoios normais (match_loop.js).
    `lista` sao os jogadores da equipa e `bb` o blackboard.
    */
    tick(lista, bb) {
        const C = (typeof BalancoCorredores !== 'undefined') ? BalancoCorredores.inversao : null;
        const e = this._de(bb.team);
        if (!C || !C.activo || !lista || !lista[0] || typeof TempoPorCorredor === 'undefined') { this._limpar(lista || [], e); return; }
        const dt = (typeof Match !== 'undefined' && typeof Match.delta === 'number') ? Match.delta : 1 / 60;
        if (e.cooldown > 0) e.cooldown -= dt;

        const emJogo = typeof Match !== 'undefined' && Match.state === 'PLAY' && Match.ball && bb.isAttacking &&
            !(Match.gkHoldingBall && Match.gkHoldingBall[bb.team]);
        if (!emJogo) { this._limpar(lista, e); return; }

        const dir = lista[0].dirZ || 1;
        const cBola = TempoPorCorredor._de(bb.team).atual;
        let s = e.sinal;

        if (s) {
            s.t += dt;
            const chegou = (cBola === s.destino);
            if (chegou) s.tNoDestino += dt; else s.tNoDestino = 0;
            const portador = Match.ballCarrier;
            if (portador && s.apoio && portador === s.apoio) s.recebeu = true;
            const perdeu = !bb.isAttacking;
            if (perdeu || s.t > C.duracaoMax || s.tNoDestino > C.fimNoDestino ||
                (s.recebeu && s.t - s.tRecebeu > C.janelaPassePosReceb)) {
                this._limpar(lista, e);
                e.cooldown = C.cooldown;
                return;
            }
            if (s.recebeu && !s.tRecebeu) s.tRecebeu = s.t;
        } else {
            if (e.cooldown > 0) return;
            if (TempoPorCorredor.empurrao(bb.team, cBola) <= 0) return;
            // O destino: o corredor com mais falta de tempo (menor desvio ao alvo), se for MESMO menos usado que o da bola.
            let melhor = null, dm = Infinity;
            for (const cor of ['esq', 'cen', 'dir']) {
                if (cor === cBola) continue;
                const d = TempoPorCorredor.estado(bb.team, cor).desvio;
                if (d < dm) { dm = d; melhor = cor; }
            }
            if (!melhor) return;
            if (dm > TempoPorCorredor.estado(bb.team, cBola).desvio - C.diferencaMin) return;
            s = e.sinal = { origem: cBola, destino: melhor, t: 0, tNoDestino: 0, apoio: null, recebeu: false, tRecebeu: 0, reavaliar: 0 };
        }

        // --- o apoio de inversao ---------------------------------------------------------------------------
        const portador = Match.ballCarrier;
        if (!portador || portador.team !== bb.team || !portador.model || portador.role === 'gk') {
            // sem portador (bola no ar) o apoio mantem-se
            return;
        }
        s.reavaliar -= dt;
        if (s.recebeu && s.apoio === portador) { for (const p of lista) if (p !== portador) p.apoioInverter = null; return; }

        const adv = (bb.opp || []).filter(o => o && o.role !== 'gk' && o.model)
            .map(o => ({ x: o.model.position.x, z: o.model.position.z }));
        // A inversao directa: alguem livre no corredor de destino, longe o bastante, em linha de passe.
        const bx = Match.ball.position.x, bz = Match.ball.position.z;
        let directa = false;
        for (const m of lista) {
            if (m === portador || !m.model || m.role === 'gk') continue;
            if (TempoPorCorredor.corredorDeX(m.model.position.x * dir) !== s.destino) continue;
            if (Math.abs(m.model.position.x - bx) < C.larguraMin) continue;
            if (this._livreDe(m.model.position.x, m.model.position.z, adv) >= C.livreMin) { directa = true; break; }
        }
        s.directa = directa;
        if (directa) { for (const p of lista) p.apoioInverter = null; s.apoio = null; return; }

        if (s.apoio && s.reavaliar > 0 && s.apoio.apoioInverter) return;
        s.reavaliar = C.reavaliacao;

        // Os pontos candidatos: atras da bola, para o lado do destino.
        const bxAtk = bx * dir;
        const sgn = Math.sign(this._centroX(s.destino) - bxAtk) || 1;
        let ponto = null, nota = -Infinity;
        for (const lat of C.lateral) for (const rec of C.recuo) {
            const xAtk = Math.max(-30, Math.min(30, bxAtk + sgn * lat));
            const x = xAtk * dir, z = bz - dir * rec;
            if (Math.abs(z) > CAMPO_COMP / 2 - 6) continue;
            const livre = this._livreDe(x, z, adv);
            if (livre < C.livreMin) continue;
            const n = Math.min(livre, 9) - 0.15 * rec;
            if (n > nota) { nota = n; ponto = { x: x, z: z }; }
        }
        if (!ponto) { for (const p of lista) p.apoioInverter = null; s.apoio = null; return; }

        // O jogador: o mais perto do ponto, que nao seja o portador nem o receptor previsto, e nao seja um avancado.
        let esc = null, de = Infinity;
        for (const p of lista) {
            if (!p.model || p === portador || p.role === 'gk' || p.role === 'atk') continue;
            if (Match.intendedReceiver === p) continue;
            const d = Math.hypot(p.model.position.x - ponto.x, p.model.position.z - ponto.z);
            if (d > C.raioApoio) continue;
            // Quem ja era o apoio fica com vantagem (histerese).
            const dd = (s.apoio === p) ? d - 3 : d;
            if (dd < de) { de = dd; esc = p; }
        }
        for (const p of lista) p.apoioInverter = null;
        s.apoio = esc;
        if (esc) esc.apoioInverter = ponto;
    },

    /*
    O passe de `quem` para `opt` (optPos) e uma inversao sinalizada? Devolve true/false.
    `dir` e o dirZ da equipa.
    */
    favorece(quem, opt, optPos, dir) {
        const C = (typeof BalancoCorredores !== 'undefined') ? BalancoCorredores.inversao : null;
        if (!C || !C.activo) return false;
        const s = this.sinal(quem.team);
        if (!s) return false;
        // 1. o passe (para tras) ao apoio de inversao
        if (s.apoio && opt === s.apoio && quem !== s.apoio) return true;
        const corDest = TempoPorCorredor.corredorDeX(optPos.x * dir);
        // 2. o apoio, depois de receber, joga para o corredor de destino
        if (s.apoio && quem === s.apoio && corDest === s.destino) return true;
        // 3. a inversao directa: a um colega no corredor de destino, afastado do portador
        if (corDest === s.destino && Math.abs(optPos.x - quem.model.position.x) >= C.larguraMin) return true;
        return false;
    }
};
if (typeof window !== 'undefined') window.InversaoSinalizada = InversaoSinalizada;
