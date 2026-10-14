/*
=============================================================================
COMEMORACAO — quem festeja o golo, para onde corre e quem vai ter com ele
=============================================================================
Corre durante o estado GOAL do jogo (ver match_physics.js). Os números e as poses estão em
`ComemoracaoGol` (config/comemoracao.js); a pose em si é o estado `COMEMORAR` da FSM (fsm.js). Aqui fica o que
o estado não sabe:

  . se este golo tem comemoração (`chance`) e qual (sorteio por pesos);
  . do autor: o ponto de partida do deslize — na direcção da linha lateral mais perto e um pouco para fora da
    área —, a corrida até lá (a FSM normal, MOVE_TO_POS) e a entrada no estado `COMEMORAR` quando lá chega;
  . dos companheiros: os `apoio.max` de campo mais perto de onde o autor vai parar correm até lá e festejam;
  . prender a saída de bola enquanto isto dura (`emCurso`), com um tecto de `tempoMax` s;
  . dizer à câmara onde olhar (`foco`).

Quem participa leva `p.comemorando = true`: a caminhada de volta ao meio-campo (`caminharParaSaida`) salta-os até
acabarem, e depois vão a pé como os outros.
=============================================================================
*/
const Comemoracao = {
    ativa: false,
    t: 0,
    autor: null,
    plano: null,
    participantes: [],

    _sortear() {
        const lista = ComemoracaoGol.comemoracoes;
        let soma = 0;
        for (const c of lista) soma += c.peso;
        let r = Math.random() * soma;
        for (const c of lista) { r -= c.peso; if (r <= 0) return c.tipo; }
        return lista[0].tipo;
    },

    /*
    `autor`: quem marcou (null num autogolo — não há festa). `zSinal`: o lado da baliza onde entrou.
    Devolve true se a comemoração arrancou.
    */
    iniciar(autor, zSinal) {
        this.limpar();
        const C = (typeof ComemoracaoGol !== 'undefined') ? ComemoracaoGol : null;
        if (!C || !C.activo || !autor || !autor.model || autor.role === 'gk') return false;
        if (typeof Sim !== 'undefined' && Sim.running && !window.comemoracaoNaSimulacao) return false;
        if (Math.random() > C.chance) return false;

        const tipo = this._sortear();
        if (tipo === 'joelhos') return this._iniciarJoelhos(autor, zSinal);
        return false;
    },

    _iniciarJoelhos(autor, zSinal) {
        const C = ComemoracaoGol, J = C.joelhos, K = J.corrida;
        const P0 = autor.model.position;
        const sx = Math.sign(P0.x) || 1;

        // Direcção: para a linha lateral mais perto, e um pouco para fora da baliza onde marcou.
        let dx = sx, dz = -Math.sign(zSinal) * K.recuoDaBaliza;
        let l = Math.hypot(dx, dz); dx /= l; dz /= l;

        // Quanto corre: até 5 m da linha lateral, entre `min` e `max` metros.
        const xAlvo = sx * (CAMPO_LARG / 2 - K.margemLinha);
        let comp = Math.abs(dx) > 0.01 ? (xAlvo - P0.x) / dx : K.min;
        comp = Math.max(K.min, Math.min(K.max, isFinite(comp) ? comp : K.min));

        const limZ = LINHA_FUNDO - 6.0;
        const S = new THREE.Vector3(
            THREE.MathUtils.clamp(P0.x + dx * comp, -(CAMPO_LARG / 2 - 3.0), CAMPO_LARG / 2 - 3.0),
            ALTURA_BASE_Y,
            THREE.MathUtils.clamp(P0.z + dz * comp, -limZ, limZ));
        // A direcção do deslize é a da corrida de facto (depois dos cortes).
        dx = S.x - P0.x; dz = S.z - P0.z;
        l = Math.hypot(dx, dz);
        if (l < 0.5) { dx = sx; dz = -Math.sign(zSinal) * 0.3; l = Math.hypot(dx, dz); }
        dx /= l; dz /= l;

        // Onde vai parar: o deslize percorre ~ v0 * tDeslize / 2.6 (a velocidade cai com expoente 1.6).
        const desliza = J.velocidadeDeslize * J.tDeslize / 2.6;
        const E = new THREE.Vector3(
            THREE.MathUtils.clamp(S.x + dx * desliza, -J.limiteLateral, J.limiteLateral), ALTURA_BASE_Y, S.z + dz * desliza);

        this.autor = autor;
        this.plano = { tipo: 'joelhos', S, E, dx, dz, fase: 'corre', tFase: 0 };
        this.participantes = [];

        this._mandar(autor, S, K.velocidade);
        this.participantes.push({ p: autor, papel: 'autor', fase: 'corre', t: 0 });

        // Os companheiros: os mais perto do ponto onde ele vai parar.
        const A = C.apoio;
        const meus = ((autor.team === 'TeamA') ? Match.players : Match.opponents)
            .filter(o => o && o !== autor && o.role !== 'gk' && o.model && !o.expulso)
            .map(o => ({ o, d: o.model.position.distanceTo(E) }))
            .filter(x => x.d <= A.raioMax)
            .sort((a, b) => a.d - b.d)
            .slice(0, A.max);
        meus.forEach(({ o }, i) => {
            const ang = (i / Math.max(1, meus.length)) * Math.PI * 2 + Math.random() * 0.8;
            const alvo = new THREE.Vector3(E.x + Math.cos(ang) * A.espalhar, ALTURA_BASE_Y, E.z + Math.sin(ang) * A.espalhar);
            this._mandar(o, alvo, A.velocidade);
            this.participantes.push({ p: o, papel: 'apoio', alvo, fase: 'corre', t: 0 });
        });

        this.ativa = true;
        this.t = 0;
        return true;
    },

    // Manda o jogador correr (pela FSM normal) até ao ponto.
    _mandar(p, alvo, velocidade) {
        p.comemorando = true;
        p.comemoracao = null;
        p.hasBall = false;
        if (!p.dynamicTarget) p.dynamicTarget = new THREE.Vector3();
        p.dynamicTarget.set(alvo.x, ALTURA_BASE_Y, alvo.z);
        p.speedMult = velocidade;
        p.fsm.changeState('MOVE_TO_POS');
    },

    _largar(par) {
        const p = par.p;
        p.comemorando = false;
        if (p.fsm && p.fsm.currentState === 'COMEMORAR') {
            p.model.position.y = ALTURA_BASE_Y;
            p.fsm.changeState('MOVE_TO_POS');
        }
        p.comemoracao = null;
        par.fase = 'fim';
    },

    update(dt) {
        if (!this.ativa) return;
        if (typeof Match !== 'undefined' && Match.state !== 'GOAL') { this.limpar(); return; }
        this.t += dt;
        const C = ComemoracaoGol, pl = this.plano;
        let todosFim = true;

        for (const par of this.participantes) {
            par.t += dt;
            const p = par.p;
            if (par.fase === 'fim') continue;
            todosFim = false;

            if (par.papel === 'autor') {
                if (par.fase === 'corre') {
                    const perto = p.model.position.distanceTo(pl.S) < 1.0;
                    if (perto || par.t > C.joelhos.corrida.prazo) {
                        p.comemoracao = { tipo: 'joelhos', dx: pl.dx, dz: pl.dz };
                        p.fsm.changeState('COMEMORAR');
                        par.fase = 'festa'; par.t = 0;
                    }
                } else if (p.comemoracao && p.comemoracao.fim) {
                    this._largar(par);
                }
            } else {
                if (par.fase === 'corre') {
                    const perto = p.model.position.distanceTo(par.alvo) < C.apoio.chegada;
                    if (perto || par.t > 9.0) {
                        p.comemoracao = { tipo: 'abraco', mira: this.autor.model.position };
                        p.fsm.changeState('COMEMORAR');
                        par.fase = 'festa'; par.t = 0;
                    }
                } else if (p.comemoracao && p.comemoracao.fim) {
                    this._largar(par);
                }
            }
        }

        if (todosFim || this.t > C.tempoMax) {
            for (const par of this.participantes) if (par.fase !== 'fim') this._largar(par);
            this.limpar();
        }
    },

    // O jogo espera por isto antes de passar à saída de bola.
    emCurso() { return this.ativa; },

    // Para onde a câmara olha enquanto dura: o autor (um pouco acima do chão), ou null.
    foco() {
        if (!this.ativa || !this.autor || !this.autor.model) return null;
        const v = this._foco || (this._foco = new THREE.Vector3());
        v.copy(this.autor.model.position);
        v.y = 0.8;
        return v;
    },

    limpar() {
        for (const par of this.participantes) {
            const p = par.p;
            if (p) { p.comemorando = false; if (par.fase !== 'fim' && p.fsm && p.fsm.currentState === 'COMEMORAR') { p.model.position.y = ALTURA_BASE_Y; p.fsm.changeState('MOVE_TO_POS'); } p.comemoracao = null; }
        }
        this.ativa = false; this.t = 0; this.autor = null; this.plano = null; this.participantes = [];
    }
};
if (typeof window !== 'undefined') window.Comemoracao = Comemoracao;
