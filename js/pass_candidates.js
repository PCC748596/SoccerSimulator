/*
=============================================================================
PlayerPassTarget — pontos candidatos para passe (debug visual)
=============================================================================
Implementa o algoritmo clássico de geração de pontos candidatos ao redor de
cada companheiro de equipa (sem bola) do jogador com a posse, filtrando os
que seriam facilmente interceptados. Só visualização — não decide nada (ver
findPassTarget em player.js para a decisão real).

Geração (por companheiro, "referencial de ataque": frente = dirZ, lateral = X):
    j de 1 a `arcos` (raio = j*`espacamento` -> arcos a 3, 6, 9 ... 21 m)
    k de 1 a `pontosPorArco` (ângulo = 120 + 15*k -> desvio de -45° a +45°
                em torno da direcção de ataque do companheiro)

    Os arcos passaram de 2 em 2 m (5 arcos, até 10 m) para 3 em 3 m (7
    arcos, até 21 m): pontos menos amontoados uns em cima dos outros e um
    leque que chega ao espaço onde o passe vale a pena, não só à roda do
    companheiro.

    O leque é SEMPRE à frente do companheiro, e "à frente" é a direcção em
    que ele CORRE (±45° em torno dela). Um ponto atrás dele seria um passe
    para onde ele já esteve — não existe e não deve existir.

Descarte de um ponto candidato:
    - fora do campo;
    - o jogador mais próximo do ponto é um adversário;
    - a mais de 30m da bola;
    - o companheiro está em impedimento (offsideLimitDir do TeamAI) -> descarta
      TODOS os pontos desse companheiro;
    - há adversário na linha de passe: dentro de ±20° do ângulo bola->ponto
      E mais perto da bola do que o próprio ponto.
=============================================================================
*/
const PassCandidates = {
    // Geometria do leque de candidatos, por companheiro.
    pontosPorArco: 7,      // ângulos, de 15° em 15° (-45° a +45°)
    passoAngular: 15,      // graus entre pontos do mesmo arco
    arcos: 7,              // quantos arcos concêntricos (3, 6, 9 ... 21 m)
    espacamento: 3.0,      // metros entre arcos (o 1º fica a esta distância)
    raioPonto: 0.15,       // raio do disco desenhado, em metros

    debug: false,
    _group: null,
    _pool: [],
    _usados: 0,
    _geo: null,

    ensureGroup: function () {
        if (this._group) return;
        this._group = new THREE.Group();
        Match.scene.add(this._group);
        // Círculo achatado sobre o gramado, não uma esfera flutuando no ar.
        this._geo = new THREE.CircleGeometry(this.raioPonto, 10);
        this._mat = new THREE.MeshBasicMaterial({ color: 0xff8c1a, side: THREE.DoubleSide });
    },

    getDot: function () {
        if (this._usados < this._pool.length) {
            const m = this._pool[this._usados++];
            m.visible = true;
            return m;
        }
        const mesh = new THREE.Mesh(this._geo, this._mat);
        mesh.rotation.x = -Math.PI / 2;
        this._group.add(mesh);
        this._pool.push(mesh);
        this._usados++;
        return mesh;
    },

    esconderResto: function () {
        for (let i = this._usados; i < this._pool.length; i++) this._pool[i].visible = false;
    },

    setDebug: function (on) {
        this.debug = on;
        this.ensureGroup();
        this._group.visible = on;
        if (on) this.rebuild();
        else { this._usados = 0; this.esconderResto(); }
    },

    /*
    Todos os frames. Havia aqui um acumulador que só redesenhava de 0.2 em
    0.2s: entre redesenhos os jogadores continuavam a correr e os pontos
    ficavam para trás, pousados em relva vazia a vários metros do dono. A
    5 redesenhos por segundo o leque nunca coincidia com quem o gerou.

    O custo é o que já era — a mesma conta que corria a cada 0.2s — e é
    debug, só corre com o toggle ligado.
    */
    update: function () {
        if (!this.debug) return;
        this.rebuild();
    },

    /*
    Gera a lista de candidatos sobreviventes para o `carrier` — pura, sem
    THREE, usada tanto pelo desenho de debug como pela decisão de passe real
    (ver findGridPassTarget em player_bt.js). Devolve [{x, z, mate}, ...].
    */
    gerarCandidatos: function (carrier) {
        const out = [];
        if (!carrier) return out;

        const team = carrier.team;
        const teammates = (team === 'TeamA') ? Match.players : Match.opponents;
        const opponents = (team === 'TeamA') ? Match.opponents : Match.players;
        const bb = (typeof TeamAI !== 'undefined') ? TeamAI.get(team) : null;
        const offsideLimitDir = (bb && bb.offsideLimitDir !== undefined) ? bb.offsideLimitDir : null;

        for (const mate of teammates) {
            if (mate === carrier || mate.role === 'gk') continue;

            // Impedimento: descarta TODOS os pontos deste companheiro.
            if (offsideLimitDir !== null) {
                const mateAdv = mate.model.position.z * mate.dirZ;
                if (mateAdv > offsideLimitDir) continue;
            }

            const mx = mate.model.position.x, mz = mate.model.position.z;

            /*
            FRENTE = direcção do MOVIMENTO dele, não o eixo de ataque da
            equipa.

            Era `mate.dirZ`, ou seja ±Z: o leque apontava sempre para a
            baliza adversária, viesse o jogador de onde viesse. Um extremo a
            abrir para a linha lateral, ou um médio a receber de lado,
            levava os pontos atirados para o fundo do campo — de través com
            a corrida dele, às vezes atrás das costas. Passe para o espaço é
            à frente de quem CORRE, medido pela corrida.

            Parado (ou quase), não há corrida que dê direcção: aí vale o
            eixo de ataque, que é para onde ele vai arrancar.
            */
            let fx = 0, fz = mate.dirZ;
            const v = mate.velocity;
            if (v) {
                const vel = Math.hypot(v.x, v.z);
                if (vel > 0.5) { fx = v.x / vel; fz = v.z / vel; }
            }

            for (let j = this.arcos; j >= 1; j--) {
                const raio = j * this.espacamento;
                for (let k = 1; k <= this.pontosPorArco; k++) {
                    /*
                    Leque centrado na frente do companheiro: com 7 pontos de
                    15° dá -45°..+45°. O 180 de partida era escrito já somado
                    (`120 + 15*k`), o que só ficava centrado para esses dois
                    valores exactos — mexer num dos números torcia o leque
                    todo para um lado.
                    */
                    const meio = this.passoAngular * (this.pontosPorArco + 1) / 2;
                    const offsetRad = (this.passoAngular * k - meio) * Math.PI / 180;
                    const cosO = Math.cos(offsetRad), sinO = Math.sin(offsetRad);

                    // Vector da frente (fx,fz) rodado por offsetRad em torno de Y.
                    const px = mx + (fx * cosO + fz * sinO) * raio;
                    const pz = mz + (fz * cosO - fx * sinO) * raio;

                    if (!this.pontoValido(px, pz, carrier, teammates, opponents)) continue;
                    out.push({ x: px, z: pz, mate: mate });
                }
            }
        }

        return out;
    },

    rebuild: function () {
        this.ensureGroup();
        this._usados = 0;

        /*
        `ballCarrier` fica a null em cada toque da condução (touchLock) e
        durante todo o voo de um passe — ou seja, boa parte do tempo em que
        a bola está viva. Ler só esse campo apagava o leque inteiro nesses
        instantes, e o efeito no ecrã era um pisca-pisca.

        `lastTouchedPlayer` cobre essa janela: na condução é o próprio
        condutor, num passe é quem o fez. O leque continua a ser desenhado
        em torno da equipa que tem a bola.
        */
        const carrier = Match.ballCarrier || Match.lastTouchedPlayer;
        if (!carrier) { this.esconderResto(); return; }

        const cands = this.gerarCandidatos(carrier);
        for (const c of cands) {
            const dot = this.getDot();
            dot.position.set(c.x, 0.05, c.z);
        }

        this.esconderResto();
    },

    pontoValido: function (px, pz, carrier, teammates, opponents) {
        if (Math.abs(px) > CAMPO_LARG / 2 || Math.abs(pz) > CAMPO_COMP / 2) return false;

        const cx = carrier.model.position.x, cz = carrier.model.position.z;
        const distBola = Math.hypot(px - cx, pz - cz);
        if (distBola > 30) return false;

        // Jogador mais próximo do ponto: se for adversário, descarta.
        let melhorD = Infinity, maisPertoOpp = false;
        for (const o of opponents) {
            const d = Math.hypot(px - o.model.position.x, pz - o.model.position.z);
            if (d < melhorD) { melhorD = d; maisPertoOpp = true; }
        }
        for (const t of teammates) {
            const d = Math.hypot(px - t.model.position.x, pz - t.model.position.z);
            if (d < melhorD) { melhorD = d; maisPertoOpp = false; }
        }
        if (maisPertoOpp) return false;

        // Adversário na linha de passe: dentro de ±20° do ângulo bola->ponto
        // e mais perto da bola do que o próprio ponto candidato.
        const angPasse = Math.atan2(pz - cz, px - cx);
        for (const o of opponents) {
            if (o.role === 'gk') continue;
            const dO = Math.hypot(o.model.position.x - cx, o.model.position.z - cz);
            if (dO >= distBola) continue;
            const angO = Math.atan2(o.model.position.z - cz, o.model.position.x - cx);
            let diff = Math.abs(angO - angPasse);
            diff = Math.min(diff, Math.PI * 2 - diff);
            if (diff <= 20 * Math.PI / 180) return false;
        }

        return true;
    }
};
