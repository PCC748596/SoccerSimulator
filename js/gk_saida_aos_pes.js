/*
=============================================================================
A SAÍDA AOS PÉS DO GUARDA-REDES — decisão, corrida, tombo de lado e contacto
=============================================================================
Estes métodos eram do player.js (a classe é a mesma para todos os papéis),
mas são só do guarda-redes: aqui ficam juntos, ao lado do GkDive. Os números
estão em GoalkeeperDive.saidaAosPes (config/goalkeeper.js). Carrega DEPOIS do
player.js; usa as constantes e auxiliares globais dele (_p_v2, _p_q1,
_p_eixoZ, _p_v3, lookAtBola).
=============================================================================
*/
Object.assign(FootballPlayer.prototype, {
    /*
    =========================================================================
    A SAÍDA AOS PÉS — ver GoalkeeperDive.saidaAosPes (config/goalkeeper.js)
    =========================================================================
    Estado próprio do guarda-redes, 'saida_pes', e movimento próprio: o
    mergulho (GkDive) só desliza no eixo da baliza, e aqui ele vai para a
    FRENTE, ao encontro da bola.

    O corpo: virado para a bola, tomba de lado (`tombo`) à volta do eixo da
    frente — fica deitado atravessado no caminho do avançado, com o peito para
    ele. A origem do modelo são os pés, portanto o corpo deitado vai da bota
    até `comprimento` para o lado da queda; o alvo do movimento é posto de
    maneira que o PEITO fique em cima do ponto onde a bola vai estar.
    =========================================================================
    */
    /*
    Só a partir do repouso e já recuperado de um gesto anterior. Vive aqui e não
    no `updateGK` de propósito: tests/gk_agarra_no_fim_do_gesto lê o ramo
    'idle' pelo primeiro `gkEstado === 'idle'` desse método.
    */
    talvezSairAosPes() {
        if (this.gkEstado !== 'idle' || this.gkRecuperacao > 0) return;
        const saida = this.saidaAosPesDeveArrancar();
        if (saida) this.iniciarSaidaAosPes(saida);
    },

    saidaAosPesDeveArrancar() {
        const S = (typeof GoalkeeperDive !== 'undefined') ? GoalkeeperDive.saidaAosPes : null;
        if (!S || !S.activo || typeof Match === 'undefined' || Match.state !== 'PLAY') return null;
        if (this.hasBall || !Match.ball || typeof Area === 'undefined') return null;
        const b = Match.ball.position;
        if (b.y > S.alturaBolaMax) return null;
        if (!Area.contem(b.x, b.z, this.ownGoalZ)) { this._saidaVista = null; return null; }

        // O avançado: quem tem a bola, ou o adversário mais perto de uma bola solta.
        let atk = (Match.ballCarrier && Match.ballCarrier.team !== this.team &&
            Match.ballCarrier.role !== 'gk') ? Match.ballCarrier : null;
        if (!atk && !Match.ballCarrier && Match.lastTouchedPlayer &&
            Match.lastTouchedPlayer.team !== this.team && Match.ballVel.length() < 10) {
            const advs = (this.team === 'TeamA') ? Match.opponents : Match.players;
            let melhor = Infinity;
            for (const o of advs) {
                if (o.role === 'gk' || !o.model) continue;
                const d = Math.hypot(o.model.position.x - b.x, o.model.position.z - b.z);
                if (d < S.disputaAvancado && d < melhor) { melhor = d; atk = o; }
            }
        }
        if (!atk) { this._saidaVista = null; return null; }

        // Um defesa dele em cima da bola: é ele quem disputa, não o guarda-redes.
        const meus = (this.team === 'TeamA') ? Match.players : Match.opponents;
        for (const m of meus) {
            if (m === this || m.role === 'gk' || !m.model) continue;
            if (Math.hypot(m.model.position.x - b.x, m.model.position.z - b.z) < S.defesaPerto) return null;
        }

        const gp = this.model.position;
        const dist = Math.hypot(b.x - gp.x, b.z - gp.z);
        if (dist > S.distMax + 3) this._saidaVista = null;
        if (dist < S.distMin || dist > S.distMax) return null;

        // A vir para a baliza (a componente da velocidade na direcção da linha dele).
        const paraBaliza = -atk.velocity.z * this.dirZ;
        if (paraBaliza < S.velAvancadoMin && atk.velocity.length() < S.velAvancadoMin) return null;

        // Uma decisão por aproximação.
        if (this._saidaVista === atk) return null;
        this._saidaVista = atk;
        const p = S.chance + ((this.skillFor('GK') - 50) / 100) * S.pesoGK;
        if (Math.random() >= p) return null;
        return { atk: atk };
    },

    iniciarSaidaAosPes(o) {
        const S = GoalkeeperDive.saidaAosPes;
        const corpo = this.model;
        const dist = Math.hypot(Match.ball.position.x - corpo.position.x, Match.ball.position.z - corpo.position.z);
        // Longe ainda: primeiro a corrida (ver actualizarSaidaAosPes).
        if (dist > S.distMergulho) {
            this.saidaPes = { fase: 'corrida', t: 0, atk: o.atk, animT: 0 };
            this.gkEstado = 'saida_pes';
            this.velocity.set(0, 0, 0);
            return;
        }
        this.lancarSaidaAosPes(o);
    },

    lancarSaidaAosPes(o) {
        const S = GoalkeeperDive.saidaAosPes;
        const corpo = this.model;
        const b = Match.ball.position;
        const atk = o.atk;
        // Onde a bola vai estar quando ele lá chegar.
        const tChega = S.tAgachar + S.tVoo;
        const v = atk ? atk.velocity : Match.ballVel;
        const bx = b.x + v.x * tChega, bz = b.z + v.z * tChega;

        // Virado para a bola; cai para o lado de onde o avançado vem a correr.
        let fx = bx - corpo.position.x, fz = bz - corpo.position.z;
        const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
        _p_v2.set(corpo.position.x + fx, corpo.position.y, corpo.position.z + fz);
        lookAtBola(corpo, _p_v2);
        // Lateral do corpo (a esquerda dele): (fz, -fx). Cai para o lado em que
        // o avançado se desloca através da frente dele, para lhe fechar o caminho.
        const latX = fz, latZ = -fx;
        const lado = (atk && (atk.velocity.x * latX + atk.velocity.z * latZ) < 0) ? -1 : 1;
        // A bota fica de maneira que o PEITO (a `peitoNoCorpo` da bota, para o
        // lado da queda) caia em cima do ponto da bola, um pouco atrás dela.
        const alvoX = bx - lado * latX * S.peitoNoCorpo - fx * 0.25;
        const alvoZ = bz - lado * latZ * S.peitoNoCorpo - fz * 0.25;

        this.saidaPes = {
            t: 0, fase: 'agachar', lado: lado,
            fx: fx, fz: fz, latX: latX * lado, latZ: latZ * lado,
            x0: corpo.position.x, z0: corpo.position.z, alvoX: alvoX, alvoZ: alvoZ,
            qFacing: corpo.quaternion.clone(), atk: atk, resolvido: false
        };
        this.gkEstado = 'saida_pes';
        this.velocity.set(0, 0, 0);
        this.touchLock = S.tAgachar + S.tVoo + S.tDeslize + S.tChao;
    },

    actualizarSaidaAosPes(dt, corpo, rig) {
        const S = GoalkeeperDive.saidaAosPes;
        const d = this.saidaPes;
        if (!d) { this.gkEstado = 'idle'; return; }
        d.t += dt;

        /*
        A CORRIDA para a bola. Desiste se o lance mudou: o avançado rematou ou
        perdeu a bola, a bola saiu da área, ou passou o tempo. Chegado a
        `distMergulho`, atira-se.
        */
        if (d.fase === 'corrida') {
            const b = Match.ball.position;
            const atk = d.atk;
            const continua = Match.state === 'PLAY' && atk && !this.hasBall &&
                (Match.ballCarrier === atk || (!Match.ballCarrier && Match.lastTouchedPlayer === atk &&
                    Match.ballVel.length() < 10)) &&
                Area.contem(b.x, b.z, this.ownGoalZ) && d.t < S.corridaMax;
            if (!continua) {
                this.saidaPes = null;
                this.gkEstado = 'idle';
                if (rig) this.resetBonesToDefault();
                return;
            }
            const dx = b.x - corpo.position.x, dz = b.z - corpo.position.z;
            const dist = Math.hypot(dx, dz);
            if (dist <= S.distMergulho) {
                this.lancarSaidaAosPes({ atk: atk });
                return;
            }
            const passo = Math.min(dist, S.velCorrida * dt);
            corpo.position.x += (dx / dist) * passo;
            corpo.position.z += (dz / dist) * passo;
            corpo.position.y = ALTURA_BASE_Y;
            _p_v2.set(b.x, corpo.position.y, b.z);
            lookAtBola(corpo, _p_v2);
            // A passada, com o ciclo dos jogadores (o mesmo que os oficiais usam).
            if (rig && typeof getGaitPose === 'function' && !(typeof Sim !== 'undefined' && Sim.running)) {
                const P0 = getGaitPose(0, S.velCorrida);
                d.animT += (S.velCorrida * dt) / P0.passada;
                const P = getGaitPose(((d.animT % 1) + 1) % 1, S.velCorrida);
                rig.lLeg.rotation.x = P.lHip; rig.lKnee.rotation.x = P.lKnee;
                rig.rLeg.rotation.x = P.rHip; rig.rKnee.rotation.x = P.rKnee;
                rig.lArm.rotation.x = P.lArm; rig.rArm.rotation.x = P.rArm;
                rig.lElbow.rotation.x = P.cotovelo; rig.rElbow.rotation.x = P.cotovelo;
                rig.chest.rotation.x = P.tronco;
            }
            return;
        }
        const t1 = S.tAgachar, t2 = t1 + S.tVoo, t3 = t2 + S.tDeslize, t4 = t3 + S.tChao, t5 = t4 + S.tLevantar;
        const headless = (typeof Sim !== 'undefined' && Sim.running);

        // O caminho: parado a agachar, depois vai até ao alvo (voo + deslize, a travar).
        let k = 0;
        if (d.t > t1) {
            const u = Math.min(1, (d.t - t1) / (S.tVoo + S.tDeslize));
            k = 1 - (1 - u) * (1 - u);
        }
        corpo.position.x = d.x0 + (d.alvoX - d.x0) * k;
        corpo.position.z = d.z0 + (d.alvoZ - d.z0) * k;

        // O tombo: entra no voo, fica deitado, desfaz-se a levantar.
        let tomb = 0;
        if (d.t > t1 && d.t <= t2) tomb = S.tombo * ((d.t - t1) / S.tVoo);
        else if (d.t > t2 && d.t <= t4) tomb = S.tombo;
        else if (d.t > t4) tomb = S.tombo * Math.max(0, 1 - (d.t - t4) / S.tLevantar);
        corpo.quaternion.copy(d.qFacing);
        _p_q1.setFromAxisAngle(_p_eixoZ, -d.lado * tomb);
        corpo.quaternion.multiply(_p_q1);

        /*
        A pose: a fotografia — mãos à bola, uma perna dobrada por baixo, a outra
        esticada. Escreve-se SEMPRE, também sem desenho: as mãos são lidas pelo
        resto do jogo (e pelos testes, que correm sem desenho). Só o assento
        fino no relvado (que percorre as malhas) fica para quando há desenho.
        */
        if (rig) {
            const w = Math.min(1, tomb / S.tombo);
            const kk = (d.t <= t1) ? Math.min(1, d.t / t1) : 1;
            const L = (d.lado > 0);
            /*
            TRES TEMPOS, como nas fotografias (F1-F3): F1 a correr e a lancar-se (passada larga),
            F2 de JOELHO no relvado, uma perna dobrada por baixo e a outra esticada a frente, e F3
            a escorregar DEITADO DE LADO, bracos a bola, uma perna dobrada e a outra esticada.
            `kk` leva do F1 ao F2 (em tAgachar); `w` do F2 ao F3 (o tombo). Nao ha mergulho de
            peito para baixo: o corpo desce de joelhos e so depois tomba de lado.
            */
            const lerp = (x, y, u) => x + (y - x) * u;
            const bracoX = lerp(lerp(-0.4, -0.95, kk), -1.45, w);
            rig.lArm.rotation.set(bracoX, 0, lerp(0.3, 0.15, w)); rig.rArm.rotation.set(bracoX, 0, -lerp(0.3, 0.15, w));
            rig.lElbow.rotation.x = -0.25; rig.rElbow.rotation.x = -0.25;
            const dobrada = L ? rig.lLeg : rig.rLeg, joelhoD = L ? rig.lKnee : rig.rKnee;
            const esticada = L ? rig.rLeg : rig.lLeg, joelhoE = L ? rig.rKnee : rig.lKnee;
            // dobrada: F2 coxa quase vertical e canela deitada atras (joelho no relvado); F3 por baixo do corpo.
            dobrada.rotation.x = lerp(0.1 * kk, -0.7, w); joelhoD.rotation.x = lerp(1.5 * kk, 1.4, w);
            // esticada: F2 lancada a frente, quase direita; F3 esticada pelo corpo deitado.
            esticada.rotation.x = lerp(-0.95 * kk, 0.25, w); joelhoE.rotation.x = lerp(0.2 * kk, 0.15, w);
            rig.chest.rotation.x = lerp(0.2 * kk, 0.25, w);
            if (rig.pelvis) { rig.pelvis.rotation.set(0, 0, 0); }
            corpo.position.y = ALTURA_BASE_Y;
            if (!headless && typeof this.assentarCorpoInteiro === 'function') this.assentarCorpoInteiro();
            else corpo.position.y = ALTURA_BASE_Y + 0.25 * w;
        } else {
            corpo.position.y = ALTURA_BASE_Y + 0.25 * Math.min(1, tomb / S.tombo);
        }

        // O CONTACTO, entre o lançamento e o fim do deslize.
        if (!d.resolvido && d.t > t1 && d.t <= t3) this.contactoDaSaidaAosPes(d, corpo, S, tomb);

        /*
        COM A BOLA AGARRADA, ELA FICA AO PEITO enquanto ele está no chão e se
        levanta — sem isto ficava no relvado, onde ele lhe tocou.
        */
        if (this.hasBall && Match.ballCarrier === this) {
            if (!headless && rig && rig.chest) {
                rig.chest.getWorldPosition(_p_v2);
                Match.ball.position.set(_p_v2.x + d.fx * 0.25, Math.max(BallPhysics.raio, _p_v2.y), _p_v2.z + d.fz * 0.25);
            } else {
                const deit = Math.min(1, tomb / S.tombo);
                Match.ball.position.set(corpo.position.x + d.latX * S.peitoNoCorpo * deit + d.fx * 0.25,
                    BallPhysics.raio + 0.25, corpo.position.z + d.latZ * S.peitoNoCorpo * deit + d.fz * 0.25);
            }
            Match.ballVel.set(0, 0, 0);
        }

        if (d.t >= t5) {
            corpo.quaternion.copy(d.qFacing);
            corpo.position.y = ALTURA_BASE_Y;
            if (rig) this.resetBonesToDefault();
            this.saidaPes = null;
            if (this.gkEstado === 'saida_pes') this.gkEstado = this.hasBall ? 'segurando' : 'idle';
            this.gkTempoMergulho = 0;
            this.gkRecuperacao = (typeof GoalkeeperDive.recuperacao === 'number') ? GoalkeeperDive.recuperacao : 0;
        }
    },

    contactoDaSaidaAosPes(d, corpo, S, tomb) {
        const b = Match.ball.position;
        if (b.y > S.alturaBolaMax) return;
        // O corpo deitado: segmento da bota até `comprimento` para o lado da
        // queda, à altura do relvado; as mãos à frente do peito.
        const deitado = Math.min(1, tomb / S.tombo);
        const comp = S.comprimento * deitado + 0.3;
        const ax = corpo.position.x, az = corpo.position.z;
        const bx2 = ax + d.latX * comp, bz2 = az + d.latZ * comp;
        const sx = bx2 - ax, sz = bz2 - az;
        const kk = Math.max(0, Math.min(1, ((b.x - ax) * sx + (b.z - az) * sz) / (sx * sx + sz * sz)));
        const dCorpo = Math.hypot(b.x - (ax + sx * kk), b.z - (az + sz * kk));
        /*
        AS MÃOS SÃO AS DO RIG, onde a pose as pôs — a mesma medida que o resto
        do jogo usa. Uma estimativa geométrica (o peito mais `alcanceMaos`)
        chegou a dar "pelas mãos" com a mão real a 0.94 m da bola.
        */
        let dMaos = Infinity;
        if (this.rig && this.rig.lHand && this.rig.rHand) {
            corpo.updateMatrixWorld(true);
            for (const m of [this.rig.lHand, this.rig.rHand]) {
                m.getWorldPosition(_p_v3);
                dMaos = Math.min(dMaos, _p_v3.distanceTo(b));
            }
        } else {
            const mx = ax + d.latX * S.peitoNoCorpo * deitado + d.fx * S.alcanceMaos;
            const mz = az + d.latZ * S.peitoNoCorpo * deitado + d.fz * S.alcanceMaos;
            dMaos = Math.hypot(b.x - mx, b.z - mz);
        }
        // Para as sondas: o mais perto que a bola passou do corpo deitado.
        d.minDist = Math.min((typeof d.minDist === 'number') ? d.minDist : Infinity, dCorpo, dMaos);
        if (Match.ballVel.length() > d.velMaxBola || d.velMaxBola === undefined) d.velMaxBola = Match.ballVel.length();
        if (dCorpo > S.raio && dMaos > S.raio) return;

        d.resolvido = true;
        const atk = d.atk;
        const comBola = atk && Match.ballCarrier === atk;
        if (comBola) {
            const p = S.base + ((this.skillFor('GK') - atk.skillFor('TEC')) / 100) * S.pesoDuelo;
            if (Math.random() >= Math.max(0.15, Math.min(0.9, p))) {
                /*
                PERDEU O DUELO: o avançado passa. Se o corpo lhe apanhou as
                pernas (ele está dentro do corpo deitado), é falta com
                `chanceFalta` — dentro da área, penálti.
                */
                const ap = atk.model.position;
                const kA = Math.max(0, Math.min(1, ((ap.x - ax) * sx + (ap.z - az) * sz) / (sx * sx + sz * sz)));
                const dAtk = Math.hypot(ap.x - (ax + sx * kA), ap.z - (az + sz * kA));
                if (dAtk < S.raio + 0.35 && Math.random() < S.chanceFalta &&
                    typeof Officials !== 'undefined' && Officials.marcarFalta) {
                    Officials.marcarFalta(this, atk, {
                        tipo: 'carrinho', velocidade: (atk.velocity ? atk.velocity.length() : 0),
                        angulo: 0, marcacao: this.skillFor('GK'), forca: this.skillFor('STRENGTH'),
                        travouAtaque: true
                    });
                }
                return;
            }
            // Ganhou: a bola sai dos pés do avançado e é dele.
            atk.hasBall = false;
            atk.touchLock = 0.8;
            Match.ballCarrier = null;
            Match.ballVel.set(atk.velocity.x, 0, atk.velocity.z);
        }
        if (typeof MatchStats !== 'undefined' && MatchStats[this.team] && MatchStats[this.team].saidasAosPes !== undefined) {
            MatchStats[this.team].saidasAosPes++;
        }
        /*
        A mesma regra das outras defesas decide se agarra, espalma ou roça —
        mas SÓ AS MÃOS AGARRAM. Um toque do corpo deitado (as pernas, a anca)
        tapa e a bola ressalta, como na perna da barreira. Apanhado pelo
        gk_agarra_com_a_mao: uma bola agarrada a 0.97 m da mão.
        */
        this.touchLock = 0;
        const pelasMaos = dMaos <= S.raio;
        this.resolverDefesaComMaos(pelasMaos ? 'maos' : 'corpo', 0.3, !pelasMaos);
    }
});
