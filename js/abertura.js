/*
=============================================================================
A ABERTURA DO JOGO — a entrada pelo tunel (ver TunelJogadores / AberturaModel, config/tunel.js)
=============================================================================
Corre UMA vez, ao carregar a pagina (main.js), no estado 'ABERTURA' do Match: o relogio e a IA estao parados
e so se move esta coreografia.

    entrada   o trio (juiz com a bola na mao e os dois assistentes) sai do tunel a andar; atras, os dois times em
              duas filas indianas (um par de cada vez, `intervaloEntrada` s). Cada jogador segue uma lista de
              pontos: tunel -> faixa de desvio -> lugar da fila.
    espera    todos alinhados (trio ao centro, um time de cada lado, de frente para o campo): `esperaAlinhados` s.
    saida     devolve o jogo ao estado 'GOAL' no estagio da caminhada para as posicoes de saida de bola (a mesma de
              depois de um golo): quando chegam, o `resetPlay` faz o pontape de saida.

ESC (ver setupKeyboardListeners) chama `cancelar`: salta direto para a formacao inicial de sempre (`resetPlay`).

Os jogadores sao movidos por `passoDoJogador` (chamado do topo de FootballPlayer.update): andam em linha reta ate
cada ponto a `velocidade` m/s, com o ciclo de passada do `animateBones`. O trio anda pelo `Officials.mover`.
=============================================================================
*/
const Abertura = {
    activa: false,
    jaCorreu: false,
    // 'inicio' (a entrada pelo tunel e a fila) ou 'segundo' (a volta do intervalo: direto para as posicoes).
    modo: 'inicio',
    fase: null,
    t: 0,
    tEspera: 0,
    partes: [],
    _v: null,

    iniciar: function () {
        const AM = (typeof AberturaModel !== 'undefined') ? AberturaModel : null;
        const T = (typeof TunelJogadores !== 'undefined') ? TunelJogadores : null;
        if (!AM || !AM.activa || !T || !T.activo || this.jaCorreu) return false;
        if (typeof Match === 'undefined' || !Match.players || !Match.players.length) return false;
        if (typeof Sim !== 'undefined' && Sim.running) return false;
        if (typeof Officials === 'undefined' || !Officials.arbitro) return false;

        this.jaCorreu = true;
        this.activa = true;
        this.modo = 'inicio';
        this.fase = 'entrada';
        this.t = 0;
        this.tEspera = 0;
        this.partes = [];
        if (!this._v) this._v = new THREE.Vector3();

        Match.kickoffActive = false;
        Match.mudarEstado('ABERTURA', 'abertura');
        Match.ballVel.set(0, 0, 0);
        Match.ballCarrier = null;

        // O config esta escrito para o tunel em -X; com o tunel em +X espelha-se (f = sentido do campo em x).
        const f = -T.lado;
        const xs = T.xFundo + f * 0.9;                 // 0.9 m para dentro do tunel
        const xFila = AM.xFila * f;
        const xDesvio = AM.xDesvio * f;
        const x0 = xs;

        const nova = (tipo, obj, model, team, k, tSpawn, z0, wps) => {
            const s = { tipo: tipo, obj: obj, model: model, team: team, k: k, tSpawn: tSpawn,
                spawned: false, wps: wps, i: 0, chegou: false, x0: x0, z0: z0 };
            model.visible = false;
            this.partes.push(s);
            return s;
        };

        // O TRIO: o juiz ao centro, os assistentes de cada lado.
        const arb = Officials.arbitro;
        // O juiz vem um pouco a frente dos assistentes (`adiantoJuiz`), a entrar e na fila.
        const sA = nova('arb', arb, arb.model, null, 0, 0, 0, [{ x: xFila + f * AM.adiantoJuiz, z: 0 }]);
        sA.x0 = x0 + f * AM.adiantoJuiz;
        const lins = Officials.assistentes;
        nova('lin', lins[0], lins[0].model, null, 0, 0, AM.zAssistente, [{ x: xFila, z: AM.zAssistente }]);
        nova('lin', lins[1], lins[1].model, null, 0, 0, -AM.zAssistente, [{ x: xFila, z: -AM.zAssistente }]);

        // OS DOIS TIMES: fila indiana dentro do tunel, desvio em z na faixa `xDesvio`, e entram no lugar a andar para a frente.
        // Cada time entra na fila (e fica no lado da linha) mais perto da PROPRIA metade do campo: a da sua baliza.
        const ladoDe = (team) => -Math.sign(Lados.dirDe(team) || 1);
        [{ lista: Match.players, lado: ladoDe('TeamA'), team: 'TeamA' }, { lista: Match.opponents, lado: ladoDe('TeamB'), team: 'TeamB' }].forEach(eq => {
            const n = eq.lista.length;
            eq.lista.forEach((p, k) => {
                const zf = eq.lado * AM.zFileira;
                const zLugar = eq.lado * (AM.zPrimeiroLugar + (n - 1 - k) * AM.passoNaFila);
                const s = nova('jog', p, p.model, eq.team, k, AM.atrasoTimes + k * AM.intervaloEntrada, zf, [
                    { x: xDesvio, z: zf }, { x: xDesvio, z: zLugar }, { x: xFila, z: zLugar }
                ]);
                p.aberturaOrdem = s;
                p.hasBall = false;
                p.velocity.set(0, 0, 0);
                if (p.fsm) p.fsm.changeState('IDLE');
            });
        });

        // A bola fica com o juiz.
        this._bolaNaMao();
        return true;
    },

    /*
    A VOLTA DO INTERVALO: os 22 saem do tunel numa ordem ALEATORIA, depois do trio, e vao direto para as posicoes
    de saida de bola (sem fila nem espera). Sem grito de golo (ver `semFestaDeGolo`). Devolve false se nao puder
    correr (lotes, sem tunel...) e o `iniciarSegundoTempo` faz a caminhada de sempre.
    */
    segundoTempo: function () {
        const AM = (typeof AberturaModel !== 'undefined') ? AberturaModel : null;
        const T = (typeof TunelJogadores !== 'undefined') ? TunelJogadores : null;
        if (!AM || !AM.activa || !T || !T.activo || this.activa) return false;
        if (typeof Match === 'undefined' || !Match.players || !Match.players.length) return false;
        if (typeof Sim !== 'undefined' && Sim.running) return false;
        if (typeof Officials === 'undefined' || !Officials.arbitro || !Officials.assistentes) return false;

        this.activa = true;
        this.modo = 'segundo';
        this.fase = 'entrada';
        this.t = 0;
        this.partes = [];
        if (!this._v) this._v = new THREE.Vector3();

        Match.kickoffActive = false;
        Match.mudarEstado('ABERTURA', 'segundo_tempo');
        Match.ball.position.set(0, BallPhysics.raio, 0);
        Match.ballVel.set(0, 0, 0);
        Match.ballCarrier = null;

        const f = -T.lado;
        const x0 = T.xFundo + f * 0.9;
        const xSaida = T.xBoca + f * 4.0;     // 4 m fora da boca, em linha reta ate la
        const nova = (tipo, obj, model, team, tSpawn, z0, alvo) => {
            const s = { tipo: tipo, obj: obj, model: model, team: team, k: 0, tSpawn: tSpawn, spawned: false,
                wps: [{ x: xSaida, z: z0 }, { x: alvo.x, z: alvo.z }], i: 0, chegou: false, x0: x0, z0: z0, vel: AM.velocidade2T };
            model.visible = false;
            this.partes.push(s);
            return s;
        };

        // O TRIO vai para os postos que tem no arranque (o `colocarInicial` poe-nos la; lemos e voltamos a tira-los).
        Officials.colocarInicial();
        const arb = Officials.arbitro, lins = Officials.assistentes;
        const alvoArb = { x: arb.model.position.x, z: arb.model.position.z };
        const alvoL = lins.map(l => ({ x: l.model.position.x, z: l.model.position.z }));
        nova('arb', arb, arb.model, null, 0, 0, alvoArb);
        nova('lin', lins[0], lins[0].model, null, 0.4, AM.zAssistente, alvoL[0]);
        nova('lin', lins[1], lins[1].model, null, 0.4, -AM.zAssistente, alvoL[1]);

        // Os 22, em ordem aleatoria, a andar para o posto de saida de bola (o mesmo que o golo usa).
        const plano = Match.planoDeSaida(Match.nextKickoffTeam);
        const raioCirculo = 9.15 + 0.5;
        const todos = [];
        [{ lista: Match.players, dir: Lados.dirDe('TeamA') }, { lista: Match.opponents, dir: Lados.dirDe('TeamB') }]
            .forEach(eq => eq.lista.forEach(p => todos.push({ p: p, dir: eq.dir })));
        for (let i = todos.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = todos[i]; todos[i] = todos[j]; todos[j] = tmp;
        }
        todos.forEach((q, idx) => {
            const p = q.p;
            let alvo;
            if (plano && p === plano.taker) alvo = plano.takerPos;
            else if (plano && p === plano.apoio) alvo = plano.apoioPos;
            else {
                alvo = Match.posicaoDeSaida(p, q.dir);
                if (plano && p.team !== plano.team && p.role !== 'gk') {
                    const d = Math.hypot(alvo.x, alvo.z);
                    if (d < raioCirculo && d > 0.001) alvo = { x: alvo.x * raioCirculo / d, z: alvo.z * raioCirculo / d };
                }
            }
            const z0 = ((idx % 2) ? 1 : -1) * AM.zFileira;
            const s = nova('jog', p, p.model, p.team, AM.atrasoSegundoTempo + idx * AM.intervaloSegundoTempo, z0, alvo);
            p.aberturaOrdem = s;
            p.hasBall = false;
            p.velocity.set(0, 0, 0);
            if (p.fsm) p.fsm.changeState('IDLE');
        });
        return true;
    },

    _spawn: function (s) {
        const T = TunelJogadores;
        s.spawned = true;
        s.model.visible = (s.tipo === 'jog') ? true : (Officials._ativo !== false);
        s.model.position.set(s.x0, (typeof ALTURA_BASE_Y === 'number' ? ALTURA_BASE_Y : 0), s.z0);
        s.model.rotation.y = Math.PI / 2 * (-T.lado);
        s.yaw = Math.PI / 2 * (-T.lado);
        if (s.tipo === 'jog') s.obj.velocity.set(0, 0, 0);
    },

    /*
    A BOLA NO ANTEBRACO DO JUIZ — pedido: *"o juiz tem que estar com o antebraco direito um pouco mais levantado e com a
    bola apoiada entre a mao e o braco"*. O braco direito fica com o cotovelo dobrado e o antebraco levantado
    (`AberturaModel.bracoDaBola`) e a bola assenta POR CIMA do antebraco, a meio entre o cotovelo e a mao.
    */
    _poseDoBracoDoJuiz: function () {
        const arb = Officials.arbitro;
        const AM = AberturaModel;
        if (!arb || !arb.rig || !AM.bracoDaBola) return;
        const B = AM.bracoDaBola;
        arb.rig.rArm.rotation.set(B.ombroX, 0, B.ombroZ);
        arb.rig.rElbow.rotation.x = B.cotovelo;
        if (arb.rig.rHand) arb.rig.rHand.rotation.set(0, B.maoRoll || 0, 0);
    },

    _bolaNaMao: function () {
        const arb = Officials.arbitro;
        if (!arb || !arb.rig || !arb.rig.rHand || !arb.rig.rElbow) return;
        const AM = AberturaModel;
        const v = this._v, w = this._w || (this._w = new THREE.Vector3());
        this._poseDoBracoDoJuiz();
        arb.model.updateMatrixWorld(true);
        arb.rig.rHand.getWorldPosition(v);
        arb.rig.rElbow.getWorldPosition(w);
        const BB = AM.bracoDaBola || {};
        const k = (typeof BB.pontoNoAntebraco === 'number') ? BB.pontoNoAntebraco : 1.0;
        const sobe = BB.sobe || 0.12;
        // A bola assenta na palma: no ponto do antebraco, um pouco para la da mao (na direccao cotovelo -> mao) e por cima.
        let dx = v.x - w.x, dz = v.z - w.z;
        const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        const av = BB.avancoMao || 0;
        Match.ball.position.set(w.x + (v.x - w.x) * k + dx * av, w.y + (v.y - w.y) * k + sobe, w.z + (v.z - w.z) * k + dz * av);
        Match.ballVel.set(0, 0, 0);
    },

    update: function (dt) {
        if (!this.activa) return;
        const AM = AberturaModel;
        this.t += dt;
        for (const s of this.partes) {
            if (!s.spawned && this.t >= s.tSpawn) this._spawn(s);
        }
        if (this.fase === 'entrada') {
            if (this.modo === 'segundo') {
                if (this.partes.every(s => s.chegou) || this.t > AM.prazoEntrada) this.terminar();
                return;
            }
            if (this.partes.every(s => s.chegou) || this.t > AM.prazoEntrada) {
                // Rede de seguranca: quem ainda nao chegou e posto no lugar.
                for (const s of this.partes) {
                    if (!s.chegou) {
                        const w = s.wps[s.wps.length - 1];
                        s.model.visible = true; s.spawned = true;
                        s.model.position.set(w.x, s.model.position.y, w.z);
                        s.chegou = true;
                    }
                }
                this.fase = 'espera';
                this.tEspera = 0;
            }
        } else if (this.fase === 'espera') {
            this.tEspera += dt;
            if (this.tEspera >= AM.esperaAlinhados) { this.terminar(); return; }
        }
        if (this.activa && this.modo === 'inicio') this._bolaNaMao();
    },

    // O passo de um jogador (chamado do topo de FootballPlayer.update).
    passoDoJogador: function (p, dt) {
        const s = p.aberturaOrdem;
        const AM = AberturaModel;
        if (!s || !s.spawned) { p.velocity.set(0, 0, 0); return; }
        const pos = p.model.position;
        const T = TunelJogadores;
        let yawAlvo = (this.modo === 'segundo') ? s.yaw : Math.PI / 2 * (-T.lado);
        if (s.i < s.wps.length) {
            const w = s.wps[s.i];
            const dx = w.x - pos.x, dz = w.z - pos.z, d = Math.hypot(dx, dz);
            if (d < 0.05) {
                s.i++;
            } else {
                const vel = s.vel || AM.velocidade;
                const passo = Math.min(d, vel * dt);
                pos.x += dx / d * passo;
                pos.z += dz / d * passo;
                p.velocity.set(dx / d * vel, 0, dz / d * vel);
                yawAlvo = Math.atan2(dx, dz);
            }
        }
        if (s.i >= s.wps.length) { s.chegou = true; p.velocity.set(0, 0, 0); }
        // Vira-se suave para o rumo. O angulo e guardado a parte (`s.yaw`) e escrito no QUATERNIAO: ler `rotation.y`
        // de volta enganava-se (o Euler decompoe-se com x = z = pi quando |yaw| > pi/2) e quem andava para -Z ia de costas.
        let dif = Math.atan2(Math.sin(yawAlvo - s.yaw), Math.cos(yawAlvo - s.yaw));
        s.yaw += dif * (1 - Math.exp(-dt * 9));
        p.model.quaternion.setFromAxisAngle(this._eixoY || (this._eixoY = new THREE.Vector3(0, 1, 0)), s.yaw);
        p.animateBones(dt);
    },

    // O trio anda pelo `Officials.mover` (chamado do Officials.update).
    moverOficiais: function (dt) {
        if (!this.activa) return;
        const AM = AberturaModel;
        const T = TunelJogadores;
        for (const s of this.partes) {
            if (s.tipo === 'jog' || !s.spawned) continue;
            const w = s.wps[s.wps.length - 1];
            const olhar = { x: s.model.position.x - T.lado * 20, z: s.model.position.z };
            // A volta do intervalo: o trio vai para os postos de sempre, a andar.
            Officials.mover(s.obj, w.x, w.z, s.vel || AM.velocidade, dt, this.modo === 'segundo' ? undefined : olhar);
            if (Math.hypot(w.x - s.model.position.x, w.z - s.model.position.z) < AM.chegada) s.chegou = true;
            else s.chegou = false;
            if (s.tipo === 'lin') Officials._ajustarPano(s.obj, dt);
        }
        // Depois do `mover` (que reescreve os bracos): a pose do braco do juiz e a bola no antebraco.
        if (this.modo === 'inicio') this._bolaNaMao();
        Officials.atualizarVista();
    },

    // A camera cinematica (chamada do Match.updateCamera): preenche posicao e alvo.
    camera: function (pos, look) {
        const AM = AberturaModel;
        if (this.fase === 'entrada' && this.t < AM.atrasoTimes + 9.0) {
            const arb = this.partes[0];
            const C = AM.cameraEntrada;
            const f = -TunelJogadores.lado;
            pos.set(C.pos[0] * f, C.pos[1], C.pos[2]);
            if (arb && arb.spawned) look.set(arb.model.position.x, C.alturaAlvo, arb.model.position.z);
            else look.set(TunelJogadores.xBoca, C.alturaAlvo, 0);
        } else {
            const C = AM.cameraFila;
            const f = -TunelJogadores.lado;
            pos.set(C.pos[0] * f, C.pos[1], C.pos[2]);
            look.set(C.alvo[0] * f, C.alvo[1], C.alvo[2]);
        }
    },

    // Devolve quem e da abertura ao estado normal (bonecos visiveis, sem ordens).
    _libertar: function () {
        for (const s of this.partes) {
            if (s.tipo === 'jog') {
                s.obj.aberturaOrdem = null;
                s.model.visible = true;
            } else {
                s.model.visible = (Officials._ativo !== false);
            }
        }
        this.partes = [];
        this.activa = false;
        this.fase = null;
    },

    // Fim natural: os 22 vao a andar para as posicoes de saida de bola e o jogo comeca.
    terminar: function () {
        this._libertar();
        Match.ball.position.set(0, BallPhysics.raio, 0);
        Match.ballVel.set(0, 0, 0);
        Match.ballCarrier = null;
        // No 2.o tempo o plano e o proximo a sair ja foram decididos (e os jogadores andaram para eles).
        if (this.modo !== 'segundo') {
            Match.saidaPlano = null;
            Match.nextKickoffTeam = Match.saidaInicial || 'TeamA';
        }
        // Estado GOAL so para a caminhada: o som da torcida fica, mas sem o grito de golo (ver ambiente_sonoro.js).
        Match.semFestaDeGolo = true;
        Match.mudarEstado('GOAL', 'abertura_fim');
        Match.goalSequenceStage = 1;
        Match.tempoParada = 0;
        [...Match.players, ...Match.opponents].forEach(p => {
            p.fsm.changeState('MOVE_TO_POS');
            p.speedMult = 3.0;
            p.dynamicTarget = p.model.position.clone();
        });
        if (Officials.colocarInicial) Officials.arbitro.alvoSuave = null;
    },

    // ESC: salta direto para a formacao inicial de sempre.
    cancelar: function () {
        if (!this.activa) return;
        // Na volta do intervalo o ESC so poe toda a gente a andar ja para as posicoes.
        if (this.modo === 'segundo') { this.terminar(); return; }
        this._libertar();
        Match.saidaPlano = null;
        Match.ballCarrier = null;
        [...Match.players, ...Match.opponents].forEach(p => { p.speedMult = 1; p.velocity.set(0, 0, 0); });
        Match.resetPlay(Match.saidaInicial || 'TeamA');
        if (typeof Officials !== 'undefined' && Officials.colocarInicial) Officials.colocarInicial();
    }
};
if (typeof window !== 'undefined') window.Abertura = Abertura;
