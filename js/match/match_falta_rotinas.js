/*
AS ROTINAS DA FALTA QUE NAO E DIRECTA — a montagem, o tracejado, a cadeia de passes e a marcacao.
O desenho de cada uma (FK2, FK3, FK5, FK6) esta em FaltaRotinas (js/config/falta_rotinas.js); aqui esta
o que o motor faz com ele. Ver o `setupSetPiece` (match_setpieces.js), o ramo FREE_KICK do `update`
(match_loop.js), o `executarFalta` (player.js) e a ordem `rotinaOrdem` do `PlayerAI.tick`.
*/
Object.assign(Match, {
    /*
    ESCOLHE E MONTA A ROTINA. Devolve o plano ({ rotina, jogadores, lugares, passos, corridas, ... }) ou
    null quando a falta nao e para rotina: directa, indirecta (fora-de-jogo), batida pelo guarda-redes,
    fora da faixa de distancia ou sem batedor. `jogadores` e a equipa que cobra.
    */
    planearRotinaDaFalta: function (bolaFK, attDir, taker, decisao, indirecta, jogadores) {
        this.rotinaPlano = null;
        const FR = (typeof FaltaRotinas !== 'undefined') ? FaltaRotinas : null;
        if (!FR || !FR.activo || indirecta || decisao === 'remate' || !taker || taker.role === 'gk') return null;

        const zd = CAMPO_COMP / 2 - bolaFK.z * attDir;
        if (zd < FR.zMin || zd > FR.zMax) return null;

        const tipo = (Math.abs(bolaFK.x) >= FR.alaX) ? 'wide' : 'central';
        const candidatas = FR.rotinas.filter(r => r.tipo === tipo);
        if (!candidatas.length) return null;
        const rotina = candidatas[Math.floor(Math.random() * candidatas.length)];

        const lado = ladoDaRotina(bolaFK.x);
        const pontoDe = (n) => pontoDaRotina(rotina.lugares[n], bolaFK, attDir, lado, CAMPO_COMP, CAMPO_LARG);
        const campo = jogadores.filter(p => p && p.role !== 'gk' && p !== taker && p.model && !p.expulso && !p.queda);
        const num = atribuirNumerosDaRotina(rotina, taker, campo, pontoDe, p => grupoNaBolaParada(p.pos), FR);

        // O desfecho: so os que tem todos os intervenientes atribuidos; sorteado pelo peso.
        const completa = (o) => o.passos.every(s => num[s.de] && (!s.para || num[s.para]));
        const validas = rotina.opcoes.filter(completa);
        if (!validas.length) return null;
        let soma = 0;
        for (const o of validas) soma += o.peso;
        let r = Math.random() * soma, opcao = validas[0];
        for (const o of validas) { r -= o.peso; if (r <= 0) { opcao = o; break; } }

        const ponto = (alvo) => pontoDaRotina(alvo, bolaFK, attDir, lado, CAMPO_COMP, CAMPO_LARG);
        const lugares = [];
        for (const n of Object.keys(rotina.lugares)) {
            const p = num[n];
            if (!p || p === taker) continue;
            const pt = pontoDe(n);
            lugares.push({ p: p, x: pt.x, z: pt.z, n: Number(n) });
        }
        const corridas = [];
        for (const n of Object.keys(opcao.corridas || {})) {
            const p = num[n];
            if (!p) continue;
            const pt = ponto(opcao.corridas[n]);
            corridas.push({ p: p, x: pt.x, z: pt.z });
        }
        const plano = {
            rotina: rotina, opcao: opcao, lado: lado, attDir: attDir, taker: taker,
            bola: { x: bolaFK.x, z: bolaFK.z },
            jogadores: num, lugares: lugares, corridas: corridas, marcadores: [],
            passos: opcao.passos.map(s => ({
                de: s.de, tipo: s.tipo, para: s.para, espera: s.espera || 0, picado: !!s.picado,
                alvo: s.alvo ? ponto(s.alvo) : null
            })),
            depois: (opcao.depois || []).map(d => ({ apos: d.apos, quem: d.quem, alvo: ponto(d.alvo) })),
            fase: 0, tFase: 0, espera: 0, disparou: false
        };
        this.rotinaPlano = plano;
        return plano;
    },

    /*
    A DEFESA MARCA OS ATACANTES DA AREA (a outra metade do pedido). Quem sobra da barreira emparelha
    com os atacantes a menos de `marcaAteZ` da linha de fundo, do mais perto da baliza para o mais longe,
    cada um com o defensor mais perto, ficando a `folgaMarcacao` do atacante do lado da baliza. Ao correr
    o atacante (o tracejado), o marcador corre para o mesmo sitio, pelo mesmo desvio. Respeita os 9.15 m.
    */
    marcarAtacantesNaRotina: function (plano, defensores, bolaFK) {
        const FR = FaltaRotinas;
        const goalZ = plano.attDir * CAMPO_COMP / 2;
        const livres = defensores.filter(d => d && d.role !== 'gk' && !d.naBarreiraFalta && d.model && !d.expulso);
        const alvos = plano.lugares
            .map(l => ({ n: l.n, p: l.p, x: l.x, z: l.z, zd: (goalZ - l.z) * plano.attDir }))
            .filter(a => a.zd <= FR.marcaAteZ)
            .sort((a, b) => a.zd - b.zd);
        const aoLado = (x, z) => {
            const dx = -x, dz = goalZ - z;
            const d = Math.hypot(dx, dz) || 1;
            let mx = x + dx / d * FR.folgaMarcacao, mz = z + dz / d * FR.folgaMarcacao;
            // Nunca a menos de 9.15 m da bola.
            const bx = mx - bolaFK.x, bz = mz - bolaFK.z, bd = Math.hypot(bx, bz);
            if (bd < 9.4 && bd > 0.01) { mx = bolaFK.x + bx / bd * 9.4; mz = bolaFK.z + bz / bd * 9.4; }
            return {
                x: THREE.MathUtils.clamp(mx, -CAMPO_LARG / 2 + 1, CAMPO_LARG / 2 - 1),
                z: THREE.MathUtils.clamp(mz, -CAMPO_COMP / 2 + 1, CAMPO_COMP / 2 - 1)
            };
        };
        for (const a of alvos) {
            if (!livres.length) break;
            let k = 0, dMin = Infinity;
            for (let i = 0; i < livres.length; i++) {
                const d = Math.hypot(livres[i].model.position.x - a.x, livres[i].model.position.z - a.z);
                if (d < dMin) { dMin = d; k = i; }
            }
            const marcador = livres.splice(k, 1)[0];
            const m = aoLado(a.x, a.z);
            marcador.model.position.set(m.x, ALTURA_BASE_Y, m.z);
            marcador.velocity.set(0, 0, 0);
            if (marcador.dynamicTarget) marcador.dynamicTarget.set(m.x, ALTURA_BASE_Y, m.z);
            lookAtBola(marcador.model, bolaFK);
            marcador.fsm.changeState('SET_PIECE_WAIT');
            const corrida = plano.corridas.find(c => c.p === a.p);
            let mc = null;
            if (corrida) mc = aoLado(corrida.x, corrida.z);
            plano.marcadores.push({ d: marcador, atacante: a.p, corrida: mc });
        }
    },

    /*
    O TRACEJADO: um pouco antes da cobranca os atacantes (e quem os marca) arrancam para o ponto da
    corrida. Usa o mesmo mecanismo da caminhada para o lugar (`lugarBolaParada`), com velocidade de
    corrida — a cobranca espera por quem ainda vai a caminho (ver `algumACaminhoDoLugar`).
    */
    dispararCorridasDaFalta: function (plano) {
        if (!plano || plano.disparou) return;
        plano.disparou = true;
        const FR = FaltaRotinas;
        const ir = (p, x, z) => {
            if (!p || !p.model || p === plano.taker) return;
            // Pre-contacto: a caminhada de bola parada; depois do contacto (PLAY) a ordem do PlayerAI continua o tracejado.
            p.lugarBolaParada = { x: x, z: z, t: 0, vel: FR.velCorrida };
            p.rotinaOrdem = { tipo: 'ir', x: x, z: z, vel: FR.velCorrida };
        };
        plano.corridas.forEach(c => ir(c.p, c.x, c.z));
        plano.marcadores.forEach(m => { if (m.corrida) ir(m.d, m.corrida.x, m.corrida.z); });
    },

    /*
    UM PASSO DA CADEIA. O primeiro (fase 0) e o do batedor, no contacto do gesto de bola parada
    (chamado pelo `executarFalta`); os seguintes saem de `correrRotinaDaFalta`. Devolve true se o
    passo saiu.
    */
    executarPassoDaRotina: function (plano, i) {
        const st = plano.passos[i];
        if (!st) return false;
        const de = plano.jogadores[st.de];
        if (!de || !de.model) return false;

        const g = BallPhysics.gravidade;
        const receptor = st.para ? plano.jogadores[st.para] : null;
        let saiu = false;

        if (st.tipo === 'passe' && receptor && st.alvo) {
            de.isCross = false; de.isThroughBall = false; de.isPasseEspaco = false;
            de.passTarget = receptor;
            de.passTargetPos = new THREE.Vector3(st.alvo.x, 0, st.alvo.z);
            de.hasBall = true;
            Match.ballCarrier = de;
            if (st.picado) {
                // Picado por cima da barreira: elevacao alta, alcance ate ao alvo.
                const bx = Match.ball.position.x, bz = Match.ball.position.z;
                const dx = st.alvo.x - bx, dz = st.alvo.z - bz;
                const R = Math.hypot(dx, dz) || 1;
                const th = 38 * Math.PI / 180;
                const v = Math.sqrt(R * g / Math.sin(2 * th));
                Match.ballVel.set(dx / R * v * Math.cos(th), v * Math.sin(th), dz / R * v * Math.cos(th));
                Match.ball.position.y = BallPhysics.raio;
                de.hasBall = false;
                de.touchLock = BallControl.touchLock;
                Match.ballCarrier = null;
                Match.intendedReceiver = receptor;
                if (!Match.passTargetPos) Match.passTargetPos = new THREE.Vector3();
                Match.passTargetPos.set(st.alvo.x, ALTURA_BASE_Y, st.alvo.z);
                Match.possessionTeam = de.team;
                Match.possessionTimer = 0;
                Match.lastTouchedTeam = de.team;
                Match.lastTouchedPlayer = de;
                de.showActionBanner('PASS');
            } else if (i === 0) {
                _vFrenteCorpo.set(0, 0, 1).applyQuaternion(de.model.quaternion);
                const ddx = st.alvo.x - de.model.position.x, ddz = st.alvo.z - de.model.position.z;
                de.cosCorpoNoPasse = (_vFrenteCorpo.x * ddx + _vFrenteCorpo.z * ddz) / (Math.hypot(ddx, ddz) || 1);
                executePassGameplay(de);
                de.showActionBanner('PASS');
            } else {
                de.passAimPoint = new THREE.Vector3(st.alvo.x, 0, st.alvo.z);
                de.initiatePass(receptor);
            }
            saiu = true;
        } else if (st.tipo === 'cruzamento') {
            de.hasBall = true;
            Match.ballCarrier = de;
            de.executarFalta('cruzamento');
            saiu = true;
        } else if (st.tipo === 'remate') {
            if (de.hasBall) { de.initiateShoot(); saiu = true; }
        }

        if (saiu) {
            plano.depois.filter(d => d.apos === i).forEach(d => {
                const p = plano.jogadores[d.quem];
                if (p) p.rotinaOrdem = { tipo: 'ir', x: d.alvo.x, z: d.alvo.z, vel: 5.0 };
            });
        }
        return saiu;
    },

    /*
    A CADEIA, em jogo: quem recebe segura a bola o `espera` do passo (o 11 que "pára a bola") e so
    depois joga ao seguinte. Acaba quando a cadeia acaba, quando se perde a bola ou ao fim do prazo.
    */
    correrRotinaDaFalta: function (dt) {
        const pl = this.rotinaPlano;
        if (!pl) return;
        const FR = FaltaRotinas;
        if (this.state !== 'PLAY') {
            if (this.state !== 'FREE_KICK') this.encerrarRotinaDaFalta();
            return;
        }
        if (pl.fase === 0) {
            // O batedor ainda nao jogou (a falta passou a jogo corrido por outro motivo).
            pl.tFase += dt;
            if (pl.tFase > 1.0) this.encerrarRotinaDaFalta();
            return;
        }
        // Quem so tinha a corrida (nao e dos passos) larga-a quando a bola e de outra equipa: tratado abaixo.
        if (pl.fase >= pl.passos.length) {
            // A cadeia acabou: as ordens de corrida ainda duram `sobraDepoisDoFim` s.
            pl.depoisT = (pl.depoisT || 0) + dt;
            if (pl.depoisT >= FR.sobraDepoisDoFim) this.encerrarRotinaDaFalta();
            return;
        }
        pl.tFase += dt;
        const portador = this.ballCarrier;
        if (pl.tFase > FR.prazoPasso || (portador && portador.team !== pl.taker.team)) {
            this.encerrarRotinaDaFalta();
            return;
        }
        const st = pl.passos[pl.fase];
        const de = pl.jogadores[st.de];
        if (!de) { this.encerrarRotinaDaFalta(); return; }
        if (portador === de) {
            pl.espera += dt;
            de.rotinaOrdem = { tipo: 'segurar' };
            if (pl.espera >= st.espera) {
                const i = pl.fase;
                pl.fase++;
                pl.espera = 0;
                pl.tFase = 0;
                de.rotinaOrdem = null;
                if (!this.executarPassoDaRotina(pl, i)) this.encerrarRotinaDaFalta();
                else if (pl.fase >= pl.passos.length) pl.fim = true;
            }
        } else {
            pl.espera = 0;
        }
        if (pl.fim && this.ballCarrier !== de) this.encerrarRotinaDaFalta();
    },

    encerrarRotinaDaFalta: function () {
        const pl = this.rotinaPlano;
        if (!pl) return;
        for (const n of Object.keys(pl.jogadores)) {
            const p = pl.jogadores[n];
            if (p) p.rotinaOrdem = null;
        }
        (pl.marcadores || []).forEach(m => { if (m.d) m.d.rotinaOrdem = null; });
        this.rotinaPlano = null;
    }
});
