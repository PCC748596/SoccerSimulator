/*
=============================================================================
GkDive — mergulho do guarda-redes
=============================================================================
Três coisas, e só estas três (não é o sistema procedural completo do
tools/proceduralHumanAnimationSystem.md — é o recorte que resolve o mergulho):

  1. ROTAÇÃO POR QUATERNIÃO, UM EIXO SÓ.
     O corpo tomba à volta do eixo frontal do próprio modelo. Um eixo, um
     ângulo. O mergulho antigo compunha `pelvis.rotation.z` (o tombo) com
     `pelvis.rotation.x` (o pitch) em Euler, e o próprio comentário no código
     admitia o resultado: "deixava o boneco virado/torcido". Com um eixo só
     isso é geometricamente impossível.

  2. CENTRO DE MASSA BALÍSTICO.
     `p = p0 + v0·t + ½g·t²`, com fases: ler, impulso, voo, chão, levantar.
     Antes era `position.x += dirX * velocidade * dt` — um deslize lateral,
     não um mergulho. Agora ele agacha, impulsiona-se, voa e aterra.

  3. BRAÇOS POR IK (ver js/ik.js).
     `handTarget` = posição prevista da bola; a cadeia ombro-cotovelo-mão
     resolve-se para lá chegar. E o teste da defesa lê a posição REAL da mão
     no mundo, em vez de a estimar por trigonometria a partir do ângulo do
     ombro como fazia o código antigo. Pose e gameplay deixam de poder
     discordar: se defendeu, foi porque a mão lá estava.

O que este ficheiro NÃO faz: posicionamento do guarda-redes. Ele mergulha bem
para onde decidiu mergulhar; se decidiu mal, mergulha bem para o sítio errado.
Isso vive em updateGK (player.js) e é problema à parte.
=============================================================================
*/

const GkDive = {
    _v: new THREE.Vector3(),
    _v2: new THREE.Vector3(),
    _alvoMao: new THREE.Vector3(),
    _cima: new THREE.Vector3(0, 1, 0),
    _eixoZ: new THREE.Vector3(0, 0, 1),
    _qTilt: new THREE.Quaternion(),
    // Eixo da queda, montado uma vez por mergulho no `iniciar`.
    _eixoQueda: new THREE.Vector3(),

    /*
    Ossos que podem ser o ponto mais baixo com ele deitado. Nao sao so as
    botas: caido de lado, quem toca primeiro e a mao, o ombro ou a anca.
    */
    _ossosDeitado: ['pelvis', 'chest', 'neck', 'lArm', 'rArm', 'lHand', 'rHand',
        'lLeg', 'rLeg', 'lKnee', 'rKnee', 'lFoot', 'rFoot'],

    /*
    Arranca o mergulho.

        alvoX, alvoY   onde a bola vai passar (já previsto por quem chama)
        tipo           'baixo' | 'meio' | 'alto'
        dirX           lado do mergulho, em X do MUNDO (+1 / -1)
    */
    iniciar(p, alvoX, alvoY, tipo, dirX) {
        const D = GoalkeeperDive;
        const corpo = p.model;

        /*
        A direcção que ele encara fica CONGELADA no início. Sem isto, o
        lookAt continuava a correr durante o mergulho e reescrevia o
        quaternião todos os frames — o tombo desaparecia.
        */
        _v1.set(corpo.position.x, corpo.position.y, corpo.position.z + p.dirZ * 10);
        lookAtBola(corpo, _v1);

        p.dive = {
            fase: 'ler',
            t: 0,
            dirX: dirX || 1,
            tipo: tipo || 'meio',
            alvoX: alvoX,
            alvoY: alvoY,
            x0: corpo.position.x,
            y0: corpo.position.y,
            v0x: 0, v0y: 0,
            tVoo: D.vooMax,
            ang: 0,
            angMax: D.anguloMax[tipo] || D.anguloMax.meio,
            qFacing: corpo.quaternion.clone(),
            tocou: false,
            agarrou: false
        };

        /*
        De que lado do MODELO fica o lado do mergulho.

        O eixo do tombo é o +Z local (a frente do jogador). Rodar +φ à volta
        dele leva a cabeça para o -X local. Mas o +X local só coincide com o
        +X do mundo para uma das equipas — a outra está virada ao contrário,
        e o sinal invertia-se. Lê-se o eixo X real do modelo em vez de o
        assumir.
        */
        this._v.set(1, 0, 0).applyQuaternion(p.dive.qFacing);
        p.dive.ladoLocal = Math.sign(this._v.x * p.dive.dirX) || 1;

        /*
        O EIXO DA QUEDA — um eixo so, mas inclinado para ele cair de FRENTE.

        Rodar a volta do +Z local tomba-o de lado e mais nada. Uma componente
        em +X local pica-o para a frente (rodar +X leva a frente, que e o +Z,
        para baixo). O eixo e a soma dos dois, normalizado: continua a ser uma
        rotacao de um eixo so — o que muda e a direccao para onde ele cai.

        Ver GoalkeeperDive.pesoQuedaFrente para o porque do numero.
        */
        const pesoFrente = (typeof GoalkeeperDive.pesoQuedaFrente === 'number')
            ? GoalkeeperDive.pesoQuedaFrente : 0;
        p.dive.eixoQueda = new THREE.Vector3(pesoFrente, 0, -p.dive.ladoLocal).normalize();
    },

    /*
    O ALVO CONTINUA A SER LIDO ATE ELE LARGAR O CHAO.

    O `iniciar` congelava `alvoX`/`alvoY` no frame da decisao, e o gesto tem
    0.17 s de agachar e estender antes de sair — tempo em que a bola pode ter
    sido desviada, ou em que a leitura de onde ela vai passar melhora muito. Um
    guarda-redes ajusta-se ate ao ultimo passo, e era isto que faltava: medido,
    a mira ficava presa a uma projeccao feita cedo e em 8 de 10 casos estava no
    lado errado.

    A fonte e o `gkAlvoX`/`gkAlvoY` que o `updateGK` reescreve todos os frames.
    Depois de sair do chao nao se mexe: a parabola ja esta lancada.
    */
    actualizarAlvo(p, d) {
        // So quando e o jogo a alimentar o mergulho: um mergulho montado a mao
        // (testes, cenarios) traz o alvo no `iniciar` e nao tem `gkAlvoX` vivo.
        if (p.gkEstado !== 'mergulho') return;
        if (typeof p.gkAlvoX === 'number') d.alvoX = p.gkAlvoX;
        if (typeof p.gkAlvoY === 'number') d.alvoY = p.gkAlvoY;
        const lado = Math.sign(d.alvoX - p.model.position.x);
        if (lado !== 0) d.dirX = lado;
    },

    /*
    Calcula o salto no instante em que as pernas largam o chão.

    O corpo não tem de percorrer a distância toda até à bola: o braço estende
    `alcanceBraco` para lá dele. Descontar isso é o que evita o guarda-redes
    a aterrar EM CIMA da bola em vez de a alcançar com a mão.
    */
    lancar(p) {
        const D = GoalkeeperDive;
        const d = p.dive;
        const corpo = p.model;
        const skill = p.skillFor('GK');

        const dx = d.alvoX - corpo.position.x;
        let distCorpo = dx - d.dirX * D.alcanceBraco;
        // Se o braço sozinho já lá chega, quase não é preciso deslocar corpo.
        if (Math.sign(distCorpo) !== Math.sign(dx)) distCorpo = 0;

        const g = BallPhysics.gravidade;

        /*
        VERTICAL PRIMEIRO, e é ela que dá o tempo de voo.

        Antes resolvia-se para o OMBRO estar à altura da bola a `fracContacto`
        do voo, com o tempo de voo já fixado pela distância lateral. Duas
        coisas erradas: o braço só contava na horizontal — o ombro tinha de ir
        ele próprio aos 2.2 m de uma bola ao ângulo, e o solver pedia 10.26 m/s
        de impulsão, que são 5.4 m de salto — e o tempo de voo não tinha nada
        que ver com a parábola que o corpo ia mesmo descrever.

        Agora pede-se o que um salto pede: que a MÃO chegue à altura da bola no
        ápice. O que ficar por cima disso é bola que ele não alcança — e é
        assim que se vê um guarda-redes a saltar para o ângulo e a não lá
        chegar, em vez de deslizar por baixo dela.
        */
        const subidaPedida = d.alvoY - (D.ombroY * 0.5 + D.alcanceVertical) - corpo.position.y;
        d.v0y = Math.max(D.vySubidaMin,
            Math.min(D.vySubidaMax, Math.sqrt(2 * g * Math.max(0, subidaPedida))));

        // Subir e voltar a descer: o voo dura o que a parábola durar.
        d.tVoo = Math.min(D.vooMax, Math.max(D.vooMin, 2 * d.v0y / g));

        /*
        E o lateral reparte-se por esse tempo — não o contrário. A velocidade
        de deslocação mantém o tecto que a skill de GK dá: se a bola estiver
        longe de mais para o tempo que ele fica no ar, não lá chega, que é o
        que deve acontecer.
        */
        const velMax = D.velLateral + ((skill - 50) / 50) * D.velLateralSkill;
        /*
        MEDIDO E NAO ENTREGUE: por o `v0x` a cobrir a distancia ate ao INSTANTE
        DO CONTACTO (`distCorpo / (tVoo * fracContacto)`) em vez de ate ao fim
        do voo parece mais correcto — a mao devia estar no sitio quando o
        contacto e avaliado — mas medido em 12 sementes deu 4.07 golos por 90
        contra 3.72, e nao mexeu na distancia da mao a bola no instante em que
        ela cruza o plano dele (4.1 m contra 4.0). Fica escrito para nao se
        voltar a tentar as cegas: o que falha no mergulho nao e a velocidade
        lateral, e a MIRA.
        */
        d.v0x = Math.max(-velMax, Math.min(velMax, distCorpo / d.tVoo));

        d.x0 = corpo.position.x;
        d.y0 = corpo.position.y;
        d.t = 0;
    },

    /*
    Um frame do mergulho. Devolve `false` quando acabou (o chamador volta ao
    estado 'idle').
    */
    update(p, dt, corpo, rig) {
        const D = GoalkeeperDive;
        const d = p.dive;
        // O `defender` corre fundo na cadeia e precisa de saber quanto a bola
        // andou neste frame; passa por aqui em vez de por cinco assinaturas.
        this._dtFrame = dt;
        if (!d) return false;

        d.t += dt;

        switch (d.fase) {
            case 'ler':
                // Agacha e carrega o peso na perna do lado do mergulho.
                this.poseCarregar(rig, Math.min(1, d.t / D.tempoLer) * 0.4);
                this.actualizarAlvo(p, d);
                if (d.t >= D.tempoLer) { d.fase = 'impulso'; d.t = 0; }
                break;

            case 'impulso': {
                const k = Math.min(1, d.t / D.tempoImpulso);
                // Comprime e estende: o pico da compressão é a meio.
                this.poseCarregar(rig, Math.sin(k * Math.PI) * 0.9);
                // E por cima disso a assimetria: a perna de baixo empurra o
                // chão, a de cima já dobra para sair.
                this.poseImpulso(rig, d, k);
                // E os braços atrás, com o tronco já a torcer para o lado.
                this.poseBracosImpulso(rig, d, k);
                this.torcerTronco(rig, d, 'impulso', k);
                this.actualizarAlvo(p, d);
                // O corpo já começa a tombar antes de sair do chão.
                d.ang = d.angMax * 0.18 * k;
                if (d.t >= D.tempoImpulso) { d.fase = 'voo'; this.lancar(p); }
                break;
            }

            case 'voo': {
                const g = BallPhysics.gravidade;
                const t = d.t;
                corpo.position.x = d.x0 + d.v0x * t;

                // Tombo: do 18% já feito no impulso até ao ângulo cheio,
                // com smoothstep para não haver ressalto na velocidade.
                const k = Math.min(1, t / d.tVoo);
                const s = k * k * (3 - 2 * k);
                d.ang = d.angMax * (0.18 + 0.82 * s);

                /*
                ALTURA = a base do modelo MAIS a parábola.

                A origem do modelo está a `ALTURA_BASE_Y` com ele de pé e a
                `alturaDeitado` com ele deitado — 45 cm ACIMA. Escrever aqui só
                a parábola punha o corpo abaixo da altura de aterragem logo no
                primeiro frame, e a guarda lá em baixo mandava-o para 'chao': o
                voo durava um frame, sempre, em todos os mergulhos do jogo. Era
                isto que se via como "salta por baixo da bola e desliza".

                A base acompanha o tombo (quanto mais deitado, mais alta) e o
                salto soma-se-lhe. Aterra quando a parábola volta a zero.
                */
                const salto = d.v0y * t - 0.5 * g * t * t;
                const base = ALTURA_BASE_Y + (D.alturaDeitado - ALTURA_BASE_Y) * s;
                corpo.position.y = base + Math.max(0, salto);

                this.poseVoo(rig, d);
                this.mirarBola(p, rig);
                // Passado o instante do contacto, o braço de trás sai do IK
                // e estica ao longo do corpo.
                this.poseBracosVoo(rig, d, k);
                this.torcerTronco(rig, d, 'voo');

                // A parábola fechou-se: o corpo chegou ao relvado.
                if (salto <= 0 && t > 0) {
                    // Ponto de partida; o assento a seguir e que manda.
                    corpo.position.y = D.alturaDeitado;
                    d.fase = 'chao';
                    d.t = 0;
                    d.vSlide = d.v0x;
                    d.assentar = true;
                }
                break;
            }

            case 'chao': {
                // Desliza e trava no relvado.
                const trav = D.atritoChao * dt * Math.sign(d.vSlide || 0);
                if (Math.abs(d.vSlide) <= Math.abs(trav)) d.vSlide = 0;
                else d.vSlide -= trav;
                corpo.position.x += d.vSlide * dt;
                corpo.position.y = (typeof d.yDeitado === 'number') ? d.yDeitado : D.alturaDeitado;
                d.ang = d.angMax;
                d.assentar = true;

                this.poseChao(rig, d);
                /*
                NO CHAO OS BRACOS AMPARAM A QUEDA — menos enquanto a bola ainda
                esta ao alcance.

                O `mirarBola` nao se pode cortar sem mais: e ele que corre o
                teste da defesa (`defender`). Fica enquanto ela esta dentro do
                `raioIKNoChao`; passado isso os dois bracos vao a frente, que e
                o pedido e e o que ele faz mal percebe que nao chega la.
                */
                d.bolaPerto = this.bolaAoAlcance(p);
                if (!d.agarrou && d.bolaPerto) this.mirarBola(p, rig);
                this.poseBracosChao(rig, d);
                this.torcerTronco(rig, d, 'chao');

                if (d.t >= D.tempoChao) { d.fase = 'levantar'; d.t = 0; }
                break;
            }

            case 'levantar': {
                const k = Math.min(1, d.t / D.tempoLevantar);
                const s = k * k * (3 - 2 * k);
                d.ang = d.angMax * (1 - s);
                // Sobe a partir de onde ficou DEITADO, nao da constante.
                const yBase = (typeof d.yDeitado === 'number') ? d.yDeitado : D.alturaDeitado;
                corpo.position.y = yBase + (ALTURA_BASE_Y - yBase) * s;
                this.poseLevantar(rig, s);

                if (d.t >= D.tempoLevantar) {
                    corpo.position.y = ALTURA_BASE_Y;
                    corpo.quaternion.copy(d.qFacing);
                    p.resetBonesToDefault();
                    /*
                    Se agarrou a meio do voo, a posse já foi registada nessa
                    altura (ver `defender`) mas o estado só muda agora — senão
                    'segurando' tomava conta do rig a meio do mergulho e ele
                    levantava-se instantaneamente com a bola na mão.
                    */
                    p.gkEstado = d.agarrou ? 'segurando' : 'idle';
                    /*
                    Levanta-se, mas ainda nao corre: ver
                    GoalkeeperDive.recuperacao. Quem a gasta e o updateGK.
                    */
                    p.gkRecuperacao = (typeof D.recuperacao === 'number') ? D.recuperacao : 0;
                    p.gkTempoMergulho = 0;
                    p.dive = null;
                    return false;
                }
                break;
            }
        }

        /*
        --- A rotação. Um eixo, um ângulo, sempre. --------------------
        O eixo ja traz o lado do mergulho no sinal do Z e o picar para a frente
        no X (ver `eixoQueda` no `iniciar`), portanto o angulo entra limpo.
        */
        const eixo = d.eixoQueda || this._eixoQueda.set(0, 0, -d.ladoLocal);
        this._qTilt.setFromAxisAngle(eixo, d.ang);
        corpo.quaternion.copy(d.qFacing).multiply(this._qTilt);

        /*
        E SO AGORA SE ASSENTA: o assento mede ossos no MUNDO, portanto tem de
        vir depois de a rotacao do frame estar escrita. Ver assentarDeitado.
        */
        if (d.assentar) {
            d.yDeitado = this.assentarDeitado(corpo, rig);
            d.assentar = false;
        }

        // Bola agarrada acompanha a mão durante o resto do mergulho.
        if (d.agarrou && rig.rHand) {
            rig[d.maoAgarrou || 'rHand'].getWorldPosition(this._v);
            Match.ball.position.copy(this._v);
            Match.ballVel.set(0, 0, 0);
        }

        return true;
    },

    /*
    DESCE O CORPO ATE ELE TOCAR MESMO O RELVADO.

    Ver GoalkeeperDive.folgaDeitado para o porque de isto existir e para os
    numeros que o motivaram. Devolve o y final, que o 'levantar' usa como ponto
    de partida — senao ele subia a partir de uma altura que ja nao e a dele.
    */
    assentarDeitado(corpo, rig) {
        const D = GoalkeeperDive;
        if (!rig) return corpo.position.y;
        let minY = Infinity;
        for (let i = 0; i < this._ossosDeitado.length; i++) {
            const o = rig[this._ossosDeitado[i]];
            if (!o) continue;
            o.getWorldPosition(this._v);
            if (this._v.y < minY) minY = this._v.y;
        }
        if (!isFinite(minY)) return corpo.position.y;
        const folga = (typeof D.folgaDeitado === 'number') ? D.folgaDeitado : 0.10;
        corpo.position.y += (folga - minY);
        return corpo.position.y;
    },

    /*
    Braços: os DOIS vão à bola por IK. É o que um guarda-redes faz na maioria
    das defesas, e evita ter de decidir qual é o braço líder — a cadeia que
    não chega fica esticada na direcção certa, que também é o correcto.

    O pole vector é o "para cima" do mundo: assim o cotovelo fica sempre por
    baixo da linha ombro-mão, mesmo com o corpo deitado. Ver a nota sobre pole
    vectors em js/ik.js.
    */
    mirarBola(p, rig) {
        const D = GoalkeeperDive;
        const C = IKChains.braco;

        // Ligeira antecipação: mira onde a bola vai estar, não onde está.
        const prev = (typeof preverBolaEm === 'function') ? preverBolaEm(0.06) : null;
        if (prev) this._alvoMao.set(prev.x, prev.y, prev.z);
        else this._alvoMao.copy(Match.ball.position);

        IK.resolverSuave(rig.lArm, rig.lElbow, C.L1, C.L2, this._alvoMao, this._cima, D.pesoIK);
        IK.resolverSuave(rig.rArm, rig.rElbow, C.L1, C.L2, this._alvoMao, this._cima, D.pesoIK);

        this.defender(p, rig);
    },

    /*
    Teste de defesa a partir da posição REAL da mão.

    O código antigo projectava onde a mão estaria:
        maoX = corpo.x + sin(|braço.rotation.z|) * 0.9 * dirX
    — uma estimativa a partir do ângulo do ombro, que ignorava o cotovelo e a
    rotação do corpo. Agora lê-se `getWorldPosition` da mão, que é onde ela
    está mesmo depois do IK.
    */
    defender(p, rig) {
        // O dt do frame, posto pelo `update` — e o que diz quanto a bola andou.
        const dt = this._dtFrame;
        const D = GoalkeeperDive;
        const d = p.dive;
        if (d.tocou) return;
        if (Match.state !== 'PLAY') return;
        if (Match.ballVel.lengthSq() <= 0.0001) return;

        /*
        E A BOLA MEDE-SE NO TRAJECTO DO FRAME, nao na posicao final.

        Era `mao.distanceTo(bola.position)`. A 25 m/s a bola anda 0.42 m entre
        frames e o raio de contacto sao 0.53 m: com os bracos colados ao corpo
        a mao estava em cima da linha dela e nao se notava, mas com os bracos a
        FRENTE (a pose correcta) a bola passa-lhes por cima sem nunca estar
        perto em frame nenhum. Medido no lote: a conversao de remate enquadrado
        subiu de 44.3% para 57.1% quando a pose foi corrigida.

        Ver distanciaAoSegmento (utils.js).
        */
        const vdt = (typeof dt === 'number' && dt > 0) ? dt : 1 / 60;
        const bx = Match.ball.position.x, by = Match.ball.position.y, bz = Match.ball.position.z;
        const ax = bx - Match.ballVel.x * vdt;
        const ay = by - Match.ballVel.y * vdt;
        const az = bz - Match.ballVel.z * vdt;

        let melhorDist = Infinity, melhorMao = null;
        for (const nome of ['lHand', 'rHand']) {
            const mao = rig[nome];
            if (!mao) continue;
            mao.getWorldPosition(this._v);
            const dist = (typeof distanciaAoSegmento === 'function')
                ? distanciaAoSegmento(this._v.x, this._v.y, this._v.z, ax, ay, az, bx, by, bz)
                : this._v.distanceTo(Match.ball.position);
            if (dist < melhorDist) { melhorDist = dist; melhorMao = nome; }
        }
        if (melhorMao === null || melhorDist > D.raioMao + BallPhysics.raio) return;

        d.tocou = true;

        /*
        A decisão é do `resolverDefesaGK` (utils.js), a mesma para os quatro
        tipos de defesa. O que este ramo sabe e os outros não é a EXTENSÃO: a
        distância real da mão à bola, medida com o IK já resolvido, contra o
        alcance de contacto. Bola no meio da luva = 0, bola na ponta dos dedos
        = 1 — e é isso que separa agarrar de deixá-la passar a raspar.
        */
        const alcance = D.raioMao + BallPhysics.raio;
        const extensao = Math.max(0, Math.min(1, melhorDist / Math.max(0.001, alcance)));
        const decisao = resolverDefesaGK({
            tipo: 'mergulho',
            gk: p.skillFor('GK'),
            tec: p.skillFor('TEC'),
            vChegada: Match.ballVel.length(),
            extensao: extensao,
            altura: Math.max(0, Match.ball.position.y - GkCatchModel.alturaPeito)
        });

        Match.lastTouchedPlayer = p;
        Match.lastTouchedTeam = p.team;

        if (decisao.resultado === 'agarra') {
            d.agarrou = true;
            d.maoAgarrou = melhorMao;
            // Posse já; a pose continua a ser do mergulho até ele se levantar.
            p.grabBall(true);
            return;
        }

        if (decisao.resultado === 'roca') {
            /*
            ROÇAR: tocou-lhe e ela segue. Trava-a um nada e desvia-a o mínimo —
            o suficiente para o toque contar (é ele que decide canto ou tiro de
            meta se ela sair), não para a tirar da baliza.
            */
            const M = GkCatchModel;
            Match.ballVel.multiplyScalar(M.rocarTravagem);
            Match.ballVel.x += d.dirX * (Math.random() * M.rocarDesvioMax);
            Match.ballVel.y += Math.random() * M.rocarDesvioMax * 0.5;
            return;
        }

        this.espalmar(p, d, decisao.qualidade);
    },

    /*
    A ESPALMADA, e para onde ela vai — decidido pela TÉCNICA (ver
    `destinoDaEspalmada` em utils.js), não à sorte como antes.

        canto     bola já colocada perto do poste ou por cima do ombro: sai
                  pela linha de fundo por fora da armação.
        lateral   volta ao campo, mas aberta e longe do miolo.
        meio      rebote curto à frente da baliza — o que um guarda-redes de
                  técnica fraca deixa, e a razão de haver recargas.

    No caso 'canto' a POSIÇÃO da bola é empurrada para fora da moldura no
    mesmo instante: a mão está na linha de golo, e sem isso ela atravessava o
    plano ainda dentro dos postes nos milissegundos seguintes — golo.
    */
    espalmar(p, d, qualidade) {
        const D = GoalkeeperDive;
        const bola = Match.ball.position;
        const folgaPoste = (LARGURA_BALIZA / 2) - Math.abs(bola.x);
        const alta = bola.y > D.espalmarAltaY;

        const destino = destinoDaEspalmada({
            qualidade: qualidade,
            podeSair: alta || (folgaPoste < D.espalmarForaMargem)
        });

        if (destino === 'canto') {
            if (alta) {
                bola.y = ALTURA_BALIZA + D.espalmarFolga;
                Match.ballVel.y = Math.max(Match.ballVel.y, D.espalmarSubida);
            } else {
                // Lado do poste onde ela ia: o do próprio remate, e não o do
                // mergulho — em bola central o `dirX` desempata.
                const ladoPoste = Math.sign(bola.x) || (d && d.dirX) || 1;
                bola.x = ladoPoste * ((LARGURA_BALIZA / 2) + D.espalmarFolga);
                Match.ballVel.x = ladoPoste * D.espalmarLateral;
                Match.ballVel.y = Math.max(Match.ballVel.y, 2.0);
            }
            // Sentido de z MANTIDO: atravessa a linha de fundo por fora.
            Match.ballVel.z *= D.espalmarForaZ;
        } else if (destino === 'lateral') {
            // Para o lado e para cima, de volta ao campo mas longe do miolo.
            Match.ballVel.z *= -0.5;
            Match.ballVel.x += (d ? d.dirX : 1) * (6 + Math.random() * 6);
            Match.ballVel.y += 3;
        } else {
            // Rebote curto: fica à frente da baliza, disputável.
            Match.ballVel.z *= -0.30;
            Match.ballVel.x = Match.ballVel.x * 0.3 + (Math.random() - 0.5) * 3;
            Match.ballVel.y += 1.5;
        }
        Match.lastTouchedPlayer = p;
        Match.lastTouchedTeam = p.team;
    },

    // --- Poses ---------------------------------------------------------
    // Simples de propósito: o que faz o mergulho ler bem é a trajectória e a
    // rotação de eixo único, não o detalhe das pernas.

    poseCarregar(rig, k) {
        const P = GoalkeeperPose.espera;
        rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, P.coxa - 0.5 * k, 0.4);
        rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, P.coxa - 0.5 * k, 0.4);
        rig.lKnee.rotation.x = lerpTo(rig.lKnee.rotation.x, P.joelho + 1.1 * k, 0.4);
        rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, P.joelho + 1.1 * k, 0.4);
        rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, P.chest + 0.25 * k, 0.3);
    },

    /*
    QUAL É A PERNA DE BAIXO.

    `d.ladoLocal` é o lado do mergulho no referencial do MODELO. A perna de
    baixo é a desse lado; a de cima é a outra. Sem isto a assimetria sairia
    trocada em metade dos mergulhos — os de um dos lados — e isso é pior do
    que não a ter.
    */
    pernas(rig, d) {
        const paraDireita = (d && d.ladoLocal >= 0);
        return paraDireita
            ? { coxaB: rig.rLeg, joelhoB: rig.rKnee, coxaC: rig.lLeg, joelhoC: rig.lKnee, sinal: 1 }
            : { coxaB: rig.lLeg, joelhoB: rig.lKnee, coxaC: rig.rLeg, joelhoC: rig.rKnee, sinal: -1 };
    },

    // Impulso: a de baixo estende-se a empurrar, a de cima dobra para sair.
    poseImpulso(rig, d, k) {
        const S = GoalkeeperDive.sequenciaPernas;
        const P = S && S.impulso;
        if (!P) return;
        const L = this.pernas(rig, d);
        const w = 0.25 * k;   // entra POR CIMA do agachamento, sem o apagar
        L.coxaB.rotation.x = lerpTo(L.coxaB.rotation.x, P.coxaBaixo, w);
        L.joelhoB.rotation.x = lerpTo(L.joelhoB.rotation.x, P.joelhoBaixo, w);
        L.coxaC.rotation.x = lerpTo(L.coxaC.rotation.x, P.coxaCima, w);
        L.joelhoC.rotation.x = lerpTo(L.joelhoC.rotation.x, P.joelhoCima, w);
    },

    /*
    Voo: corpo na horizontal, pernas ATRÁS — a de cima esticada, a de baixo a
    arrastar dobrada. É a linha do salto.
    */
    poseVoo(rig, d) {
        const D = GoalkeeperDive;
        const S = D.sequenciaPernas;
        const P = S && S.voo;
        const L = this.pernas(rig, d);
        if (!P) {
            // Sem a sequência configurada, o mergulho simétrico de antes.
            L.coxaB.rotation.x = lerpTo(L.coxaB.rotation.x, D.coxaVoo, 0.25);
            L.coxaC.rotation.x = lerpTo(L.coxaC.rotation.x, D.coxaVoo, 0.25);
            L.joelhoB.rotation.x = lerpTo(L.joelhoB.rotation.x, D.joelhoVoo, 0.25);
            L.joelhoC.rotation.x = lerpTo(L.joelhoC.rotation.x, D.joelhoVoo, 0.25);
            rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, -0.1, 0.2);
            return;
        }
        L.coxaB.rotation.x = lerpTo(L.coxaB.rotation.x, P.coxaBaixo, 0.25);
        L.joelhoB.rotation.x = lerpTo(L.joelhoB.rotation.x, P.joelhoBaixo, 0.25);
        L.coxaC.rotation.x = lerpTo(L.coxaC.rotation.x, P.coxaCima, 0.25);
        L.joelhoC.rotation.x = lerpTo(L.joelhoC.rotation.x, P.joelhoCima, 0.25);

        // A abertura separa as pernas de perfil; a de cima abre mais.
        const ab = (P.abertura !== undefined) ? P.abertura : D.aberturaVoo;
        L.coxaB.rotation.z = lerpTo(L.coxaB.rotation.z, L.sinal * ab * 0.4, 0.2);
        L.coxaC.rotation.z = lerpTo(L.coxaC.rotation.z, -L.sinal * ab, 0.2);

        rig.chest.rotation.x = lerpTo(rig.chest.rotation.x,
            (P.chest !== undefined) ? P.chest : -0.1, 0.2);
    },

    /*
    Chão: aterra de lado e RECOLHE as pernas — os dois joelhos sobem e o tronco
    roda para a frente. É a rolagem do fim do mergulho.
    */
    poseChao(rig, d) {
        const S = GoalkeeperDive.sequenciaPernas;
        const P = S && S.chao;
        const L = this.pernas(rig, d);
        if (!P) {
            L.joelhoB.rotation.x = lerpTo(L.joelhoB.rotation.x, 1.0, 0.2);
            L.joelhoC.rotation.x = lerpTo(L.joelhoC.rotation.x, 0.7, 0.2);
            L.coxaB.rotation.x = lerpTo(L.coxaB.rotation.x, -0.35, 0.2);
            L.coxaC.rotation.x = lerpTo(L.coxaC.rotation.x, -0.15, 0.2);
            return;
        }
        L.coxaB.rotation.x = lerpTo(L.coxaB.rotation.x, P.coxaBaixo, 0.2);
        L.joelhoB.rotation.x = lerpTo(L.joelhoB.rotation.x, P.joelhoBaixo, 0.2);
        L.coxaC.rotation.x = lerpTo(L.coxaC.rotation.x, P.coxaCima, 0.2);
        L.joelhoC.rotation.x = lerpTo(L.joelhoC.rotation.x, P.joelhoCima, 0.2);
        if (P.chest !== undefined) {
            rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, P.chest, 0.2);
        }
    },

    /*
    QUAL É O BRAÇO LÍDER: o do lado do mergulho, que é o que vai à bola. O
    outro é o de trás. Mesma lógica das pernas — sem isto a coreografia sairia
    trocada em metade dos mergulhos.
    */
    bracos(rig, d) {
        const paraDireita = (d && d.ladoLocal >= 0);
        return paraDireita
            ? { lider: rig.rArm, cotoveloLider: rig.rElbow, traseiro: rig.lArm, cotoveloTraseiro: rig.lElbow, sinal: 1 }
            : { lider: rig.lArm, cotoveloLider: rig.lElbow, traseiro: rig.rArm, cotoveloTraseiro: rig.rElbow, sinal: -1 };
    },

    /*
    Impulso: os dois braços atrás, a carregar o gesto. Escreve os dois — o
    contacto com a bola ainda não existe nesta fase.
    */
    poseBracosImpulso(rig, d, k) {
        const S = GoalkeeperDive.sequenciaBracos;
        const P = S && S.impulso;
        if (!P) return;
        const B = this.bracos(rig, d);
        const w = 0.3 * k;
        B.lider.rotation.x = lerpTo(B.lider.rotation.x, P.liderX, w);
        B.lider.rotation.z = lerpTo(B.lider.rotation.z, B.sinal * P.liderZ, w);
        B.traseiro.rotation.x = lerpTo(B.traseiro.rotation.x, P.traseiroX, w);
        B.traseiro.rotation.z = lerpTo(B.traseiro.rotation.z, -B.sinal * P.traseiroZ, w);
        if (B.cotoveloLider) B.cotoveloLider.rotation.x = lerpTo(B.cotoveloLider.rotation.x, P.cotovelo, w);
        if (B.cotoveloTraseiro) B.cotoveloTraseiro.rotation.x = lerpTo(B.cotoveloTraseiro.rotation.x, P.cotovelo, w);
    },

    /*
    Voo: o líder fica no IK (é ele que apanha a bola); o de trás estica ao
    longo do corpo, e só depois de `fracIKTraseiro` — até lá vão os dois à
    bola, para o instante do contacto não perder uma mão.
    */
    poseBracosVoo(rig, d, k) {
        const S = GoalkeeperDive.sequenciaBracos;
        const P = S && S.voo;
        if (!P) return;
        const desde = (P.fracIKTraseiro !== undefined) ? P.fracIKTraseiro : 0.6;
        if (k < desde) return;
        const B = this.bracos(rig, d);
        const w = 0.25;
        B.traseiro.rotation.x = lerpTo(B.traseiro.rotation.x, P.traseiroX, w);
        B.traseiro.rotation.z = lerpTo(B.traseiro.rotation.z, -B.sinal * P.traseiroZ, w);
        if (B.cotoveloTraseiro) B.cotoveloTraseiro.rotation.x = lerpTo(B.cotoveloTraseiro.rotation.x, P.cotovelo, w);
    },

    /*
    A bola ainda esta ao alcance de quem ja esta no chao? Ver raioIKNoChao.
    */
    bolaAoAlcance(p) {
        if (typeof Match === 'undefined' || !Match.ball) return false;
        const R = (typeof GoalkeeperDive.raioIKNoChao === 'number')
            ? GoalkeeperDive.raioIKNoChao : 2.2;
        return p.model.position.distanceTo(Match.ball.position) <= R;
    },

    /*
    Chão: os dois braços à frente, a amparar a batida.

    O líder só saía do IK quando ele tinha AGARRADO a bola; nos outros casos
    ficava a apontar para onde ela estivesse, mesmo já longe — e era isso que
    dava o guarda-redes caído com o braço atrás das costas em vez de o pôr à
    frente para travar a queda.
    */
    poseBracosChao(rig, d) {
        const S = GoalkeeperDive.sequenciaBracos;
        const P = S && S.chao;
        if (!P) return;
        const B = this.bracos(rig, d);
        const w = 0.2;
        B.traseiro.rotation.x = lerpTo(B.traseiro.rotation.x, P.traseiroX, w);
        B.traseiro.rotation.z = lerpTo(B.traseiro.rotation.z, -B.sinal * P.traseiroZ, w);
        if (B.cotoveloTraseiro) B.cotoveloTraseiro.rotation.x = lerpTo(B.cotoveloTraseiro.rotation.x, P.cotovelo, w);
        // O líder sai do IK com a bola agarrada OU com ela já fora de alcance.
        if (d.agarrou || !d.bolaPerto) {
            B.lider.rotation.x = lerpTo(B.lider.rotation.x, P.liderX, w);
            B.lider.rotation.z = lerpTo(B.lider.rotation.z, B.sinal * P.liderZ, w);
            if (B.cotoveloLider) B.cotoveloLider.rotation.x = lerpTo(B.cotoveloLider.rotation.x, P.cotovelo, w);
        }
    },

    /*
    A TORÇÃO DO TRONCO, para o lado do mergulho. É ela que faz o gesto ler
    como um mergulho e não como um tombo de lado. Ver GoalkeeperDive.
    */
    torcerTronco(rig, d, fase, k) {
        const T = GoalkeeperDive.torcaoTronco;
        if (!T || T[fase] === undefined || !rig.chest) return;
        const B = this.bracos(rig, d);
        const alvo = B.sinal * T[fase] * ((k === undefined) ? 1 : k);
        rig.chest.rotation.y = lerpTo(rig.chest.rotation.y, alvo, 0.25);
    },

    poseLevantar(rig, s) {
        // Recolhe as pernas primeiro, estica no fim — é assim que se levanta.
        const dobra = Math.sin(s * Math.PI);
        rig.lKnee.rotation.x = lerpTo(rig.lKnee.rotation.x, 1.4 * dobra, 0.2);
        rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, 1.4 * dobra, 0.2);
        rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, -0.5 * dobra, 0.2);
        rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, -0.5 * dobra, 0.2);
        rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, 0.5 * dobra, 0.2);
        rig.lArm.rotation.x = lerpTo(rig.lArm.rotation.x, 0.4 * dobra, 0.2);
        rig.rArm.rotation.x = lerpTo(rig.rArm.rotation.x, 0.4 * dobra, 0.2);
        rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, Math.PI / 16, 0.2);
        rig.rArm.rotation.z = lerpTo(rig.rArm.rotation.z, -Math.PI / 16, 0.2);
        // E desfaz a torção do mergulho: quem se levanta fica de frente.
        rig.chest.rotation.y = lerpTo(rig.chest.rotation.y, 0, 0.2);
    }
};
