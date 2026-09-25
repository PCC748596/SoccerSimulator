Object.assign(Match, {
    setupKeyboardListeners: function () {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'o' || e.key === 'O') {
                this.showOffsideLines = !this.showOffsideLines;
                this.offsideLineA.visible = this.showOffsideLines;
                this.offsideLineB.visible = this.showOffsideLines;
                if (this.defLineA) this.defLineA.visible = this.showOffsideLines;
                if (this.defLineB) this.defLineB.visible = this.showOffsideLines;
            }
            if (e.key === 'f' || e.key === 'F') this.setSpeed('frame');
            /*
            AS TECLAS SÃO AS VELOCIDADES QUE EXISTEM MESMO.

            O '1' estava em 0.9x, que não tem botão nenhum: carregar nele punha
            o jogo a uma velocidade que o painel não marcava em lado nenhum.
            O '4' fazia DUAS coisas — setSpeed(2) e a seguir a câmara central,
            portanto a velocidade mudava e o botão 2x acendia sem que ninguém
            tivesse pedido a câmara. O 2x saiu (pedido) e a colisão com ele.

            O 0.3x novo não tem tecla: só há três livres antes do '4' começar as
            câmaras, e ficam para as três de jogar.
            */
            if (e.key === '1') this.setSpeed(0.6);
            if (e.key === '2') this.setSpeed(1.0);
            if (e.key === '3') this.setSpeed(1.2);
            if (e.key === '4') this.setCameraMode('center');
            if (e.key === '5') this.setCameraMode('sideline');
            if (e.key === '6') this.setCameraMode('topdown');
            if (e.key === '7') this.setCameraMode('lateraltv');
            // A câmara da grua de televisão atrás da baliza (ver GruaDeCamera).
            if (e.key === '8') this.setCameraMode('grua');
            /*
            ESC SAI DA REPETICAO.

            BUG, com relato: *"nao esta saindo do replay quando aperto ESC"*.
            E nao estava mesmo: o ESC nao estava ligado a NADA — nao havia um
            unico `Escape` em todo o codigo. A unica forma de sair era voltar a
            carregar no botao "Replay (20s)" do painel, e numa repeticao
            automatica de golo nem isso, porque ela comeca sozinha e o
            utilizador so a quer ver ate onde lhe apetece.

            So morde COM UMA REPETICAO A CORRER: fora dela o ESC fica livre
            para o que o navegador quiser fazer com ele (sair do ecra inteiro,
            por exemplo), e engolir essa tecla sem nada para fechar era tirar
            ao utilizador uma saida que ele conta ter.

            O `stopReplay` trata do resto — repoe o frame mais recente e, se a
            repeticao era a automatica do golo, devolve a camara que pediu
            emprestada.
            */
            if (e.key === 'Escape' || e.key === 'Esc') {
                const R = window.MatchReplay;
                if (R && R.isReplaying) {
                    R.stopReplay();
                    e.preventDefault();
                }
            }
            if (e.key === ' ' || e.code === 'Space') {
                this.togglePause();
                e.preventDefault();
            }
            if (e.key === 'x' || e.key === 'X') togglePainel();
            /*
            Ctrl+C: canto forçado, para se ver a jogada sem esperar que
            aconteça sozinha. Vai para a equipa que está a atacar (a posse, ou
            o último toque se ainda não houver posse), na quina do lado onde a
            bola está e na linha de fundo que essa equipa ataca.
            */
            if ((e.key === 'c' || e.key === 'C') && e.ctrlKey) {
                this.forcarCanto();
                e.preventDefault();
            }
        });
    },

    forcarCanto: function () {
        const equipa = this.possessionTeam || this.lastTouchedTeam || 'TeamA';
        const plantel = (equipa === 'TeamA') ? this.players : this.opponents;
        const attDir = (plantel[0] && plantel[0].dirZ) ? plantel[0].dirZ : 1;

        // A bola diz o LADO (o sinal do x); o setupSetPiece lê daqui.
        const ladoX = Math.sign(this.ball.position.x) || 1;
        this.ball.position.set(ladoX * 20, BallPhysics.raio, attDir * 50);
        this.ballVel.set(0, 0, 0);

        this.setupSetPiece('CORNER_KICK', equipa);
    },

    togglePause: function () {
        window.isPaused = !window.isPaused;
        /*
        O SOM PÁRA COM O JOGO. O `AmbienteSonoro.update` corre dentro do
        `Match.update`, que não corre em pausa — o loop do estádio ficava a
        tocar sozinho, no volume em que ia.
        */
        if (typeof AmbienteSonoro !== 'undefined' && AmbienteSonoro.setPausa) {
            AmbienteSonoro.setPausa(window.isPaused);
        }
        if (window.isPaused && typeof EfeitosSonoros !== 'undefined' && EfeitosSonoros.pararTudo) {
            EfeitosSonoros.pararTudo();
        }
        const btn = document.getElementById('btn-pause');
        if (btn) btn.textContent = window.isPaused ? 'Continue' : 'Pause';
        if (typeof TouchControls !== 'undefined' && TouchControls.updateButtonsState) {
            TouchControls.updateButtonsState();
        }
    },

    setSpeed: function (speed) {
        if (speed === 'frame' && window.speedMultiplier === 'frame') {
            this.stepNextFrame = true;
        }
        window.speedMultiplier = speed;
        document.querySelectorAll('.btn-speed').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('spd-' + speed);
        if (btn) btn.classList.add('active');
        if (typeof TouchControls !== 'undefined' && TouchControls.updateButtonsState) {
            TouchControls.updateButtonsState();
        }
    },

    setCameraMode: function (mode) {
        if (mode === 'orbit' && window.cameraMode !== 'orbit' && typeof orbitControls !== 'undefined') {
            orbitControls.syncFromCamera(window.cameraCore, this.currentLookTarget);
        }

        window.cameraMode = mode;
        document.querySelectorAll('.btn-cam').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('cam-' + mode);
        if (btn) btn.classList.add('active');

        window.cameraCore.up.set(0, 1, 0);
        if (mode === 'topdown') {
            // Roda a câmara 90 graus: Vermelho (Z = +53) à esquerda, Azul (Z = -53) à direita
            window.cameraCore.up.set(-1, 0, 0);
        }
        if (typeof TouchControls !== 'undefined' && TouchControls.updateButtonsState) {
            TouchControls.updateButtonsState();
        }
    },

    atualizarVistaTatica: function () {
        if (!this.ball) return;
        const tatico = (window.cameraMode === 'topdown');

        if (!this.discoBola) {
            let cvs = document.createElement('canvas');
            cvs.width = 128; cvs.height = 128;
            let ctx = cvs.getContext('2d');

            // Desenha a bola (branco com pentágonos pretos)
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(64, 64, 60, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#1a1a1a';
            // Pentágono central
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                let a = (Math.PI * 2 / 5) * i - Math.PI / 2;
                let px = 64 + 18 * Math.cos(a);
                let py = 64 + 18 * Math.sin(a);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            // Pentágonos exteriores
            for (let i = 0; i < 5; i++) {
                let a = (Math.PI * 2 / 5) * i - Math.PI / 2;
                let cx = 64 + 44 * Math.cos(a);
                let cy = 64 + 44 * Math.sin(a);
                ctx.beginPath();
                for (let j = 0; j < 5; j++) {
                    let a2 = (Math.PI * 2 / 5) * j + a;
                    let px = cx + 14 * Math.cos(a2);
                    let py = cy + 14 * Math.sin(a2);
                    if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
            }

            // Borda exterior
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#cccccc';
            ctx.beginPath();
            ctx.arc(64, 64, 60, 0, Math.PI * 2);
            ctx.stroke();

            let tex = new THREE.CanvasTexture(cvs);

            this.discoBola = new THREE.Group();

            this.discoIcon = new THREE.Mesh(
                new THREE.CircleGeometry(0.4675 * 0.75, 20),
                new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
            );
            this.discoIcon.rotation.x = -Math.PI / 2;
            this.discoBola.add(this.discoIcon);

            // Sombra
            let cvsS = document.createElement('canvas');
            cvsS.width = 64; cvsS.height = 64;
            let ctxS = cvsS.getContext('2d');
            let grad = ctxS.createRadialGradient(32, 32, 0, 32, 32, 32);
            grad.addColorStop(0, 'rgba(0,0,0,0.6)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctxS.fillStyle = grad;
            ctxS.fillRect(0, 0, 64, 64);
            let texS = new THREE.CanvasTexture(cvsS);

            this.discoSombra = new THREE.Mesh(
                new THREE.PlaneGeometry(1.0 * 0.75, 1.0 * 0.75),
                new THREE.MeshBasicMaterial({ map: texS, transparent: true, depthWrite: false })
            );
            this.discoSombra.rotation.x = -Math.PI / 2;
            this.discoSombra.position.y = -0.01;
            this.discoBola.add(this.discoSombra);

            this.discoBola.visible = false;
            this.scene.add(this.discoBola);
        }

        this.discoBola.visible = tatico;
        this.ball.visible = !tatico;

        if (tatico) {
            // BallPhysics.raio approx 0.11
            let altura = Math.max(0, this.ball.position.y - 0.11);

            // Aumenta o tamanho do ícone da bola em até 35% no ápice
            let escalaBola = 1.0 + Math.min(0.35, altura * 0.08);
            this.discoIcon.scale.set(escalaBola, escalaBola, escalaBola);

            // Para dar ainda mais a sensação de 3D, a bola "sobe" um pouquinho para o Sul (Z+) no ecrã
            // simulando a perspectiva da câmara que não é 100% perfeitamente a pino ou apenas a paralaxe.
            this.discoIcon.position.z = altura * 0.3;

            // Suaviza a sombra conforme a bola sobe
            let opacidadeSombra = Math.max(0.15, 1.0 - altura * 0.15);
            this.discoSombra.material.opacity = opacidadeSombra;
            // E a sombra cresce ligeiramente e fica difusa
            let escalaSombra = 1.0 + Math.min(0.5, altura * 0.1);
            this.discoSombra.scale.set(escalaSombra, escalaSombra, escalaSombra);

            // Mantemos o grupo na vertical da sombra
            this.discoBola.position.set(this.ball.position.x, 0.06, this.ball.position.z);
        }
    },

    updateCamera: function () {
        if (window.cameraMode === 'orbit') return;

        if (!this.ball) return;
        const zoom = window.cameraZoom || 1.0;
        if (!this._cTPos) { this._cTPos = new THREE.Vector3(); this._cLTar = new THREE.Vector3(); this._cFwd = new THREE.Vector3(); } let targetPos = this._cTPos;
        let lookTarget = this._cLTar;

        if (window.cameraMode === 'center') {
            /*
            TV CENTRO. ALTURA 34 E NAO 39 — pedido: baixar cinco metros.

            A distancia a zoom 1 passa de hypot(58, 39) = 70 m para
            hypot(58, 34) = 67 m, que e o numero citado nos comentarios do zoom
            (mais abaixo e no CameraZoom, config/tactics.js). O afastamento
            lateral (58) nao se mexeu: baixar e descer o ponto de vista, nao
            aproxima-lo.

            Era "na altura do ultimo degrau" da bancada; a 34 fica um degrau
            mais abaixo.
            */
            targetPos.set(58 * zoom, 34 * zoom, 0);
            lookTarget.copy(this.ball.position);
        } else if (window.cameraMode === 'sideline') {
            // Câmara Lateral bem mais próxima, acompanhando a bola no eixo Z
            let bz = THREE.MathUtils.clamp(this.ball.position.z, -45, 45);
            targetPos.set(35 * zoom, 14 * zoom, bz);
            lookTarget.copy(this.ball.position);
        } else if (window.cameraMode === 'lateraltv') {
            // Mistura de TV Centro e Lateral Móvel
            // Acompanha até metade do meio-campo, depois fica parada e só roda
            let bz = THREE.MathUtils.clamp(this.ball.position.z, -26.5, 26.5);
            /*
            ALTURA 20 E NAO 30 — dois pedidos seguidos de "baixar cinco
            metros", 10 m ao todo.

            A distancia a zoom 1 passa de hypot(48, 30) = 57 m para
            hypot(48, 20) = 52 m, que e o numero citado nos comentarios do
            zoom (aqui em baixo e no CameraZoom, config/tactics.js). O
            afastamento lateral (48) nao se mexeu: baixar a camara e descer o
            ponto de vista, nao aproxima-lo.
            */
            targetPos.set(48 * zoom, 20 * zoom, bz);
            lookTarget.copy(this.ball.position);

            if (typeof TeamAI !== 'undefined') {
                const teamA = TeamAI.get('TeamA');
                const teamB = TeamAI.get('TeamB');
                if (teamA && teamB) {
                    const defTeam = teamA.isAttacking ? teamB : teamA;
                    if (defTeam.bloco && defTeam.bloco.x1 !== undefined) {
                        // edgeX é a linha de baixo do bloco da defesa (lado +X)
                        const edgeX = defTeam.bloco.x1;
                        // O máximo normal seria o limite do campo (34)
                        const recuo = 34 - edgeX;
                        if (recuo > 0) {
                            // Aproxima a câmera na direção do seu próprio look target (frente/trás local)
                            let fwd = this._cFwd.subVectors(lookTarget, targetPos).normalize();
                            targetPos.addScaledVector(fwd, recuo * 0.5);
                        }
                    }
                }
            }
        } else if (window.cameraMode === 'grua') {
            /*
            A CÂMARA DA GRUA (tecla 8). O ponto de vista é a cabeça da jib
            atrás da baliza — a posição real dela, guardada pelo
            `GruasDeCamera.build`, e não uma reconstituição destas contas aqui.

            QUAL DAS DUAS: a que está atrás da baliza para onde o jogo vai. Uma
            é escolhida pelo SINAL do z da bola, que é a mesma regra que uma
            realização segue — mostra-se a baliza que está a ser atacada, não a
            que ficou atrás. Sem isto, metade do jogo era visto de 110 m.

            O ZOOM NÃO SE APLICA: as outras vistas multiplicam a posição
            inteira pelo `cameraZoom`, mas esta é um sítio físico do estádio —
            multiplicá-lo levava a câmara para fora da grua, e o que se estava
            a ver deixava de ser a grua.
            */
            const GR = (typeof GruasDeCamera !== 'undefined') ? GruasDeCamera : null;
            const lista = (GR && GR.cameras) ? GR.cameras : null;
            if (lista && lista.length) {
                const ladoBola = Math.sign(this.ball.position.z) || 1;
                const escolhida = lista.find(c => c.ladoZ === ladoBola) || lista[0];
                targetPos.copy(escolhida.pos);
            } else {
                /*
                Sem gruas construídas (podem estar desligadas no config), a
                tecla não pode deixar a câmara onde estava a olhar para o nada:
                fica o ponto onde a grua estaria, atrás da baliza mais perto da
                bola.
                */
                const ladoBola = Math.sign(this.ball.position.z) || 1;
                targetPos.set(9, 2.0, ladoBola * (CAMPO_COMP / 2 + 7));
            }
            lookTarget.copy(this.ball.position);
        } else if (window.cameraMode === 'topdown') {
            const aspect = window.innerWidth / window.innerHeight;
            // Campo deitado: precisamos caber (CAMPO_COMP + margem) na horizontal e (CAMPO_LARG + margem) na vertical
            const reqYForHeight = (CAMPO_LARG + 10) / 0.8284;
            const reqYForWidth = (CAMPO_COMP + 10) / (0.8284 * aspect);
            const optimalY = Math.max(reqYForHeight, reqYForWidth);
            targetPos.set(0, optimalY * zoom, 0);
            lookTarget.set(0, 0, 0);
        }

        /*
        E NÃO SE CHEGA A MENOS DE `distanciaMinima` DO QUE SE ESTÁ A VER.

        Pedido: *"ajusta o zoom in máximo para uma distância de 5 metros dos
        jogadores"*. O `cameraZoom` multiplica a posição inteira, e cada vista
        parte de uma distância diferente (67 m na TV Centro, 38 na Lateral
        Móvel, 52 na Lateral TV, 94 na Tática Cima), portanto o mesmo
        multiplicador dá quatro aproximações diferentes — e um piso no
        multiplicador não é um limite em metros.

        O limite é aplicado aqui, à distância já calculada e antes da
        suavização: se o zoom a levou para dentro dos 5 m, ela é empurrada de
        volta ao longo da MESMA direcção, que é o que mantém o enquadramento da
        vista (o ângulo não muda, só a aproximação pára). Ver CameraZoom
        (config/tactics.js).
        */
        {
            const Z = (typeof CameraZoom !== 'undefined') ? CameraZoom : null;
            const minDist = Z ? Z.distanciaMinima : 5.0;
            const dx = targetPos.x - lookTarget.x;
            const dy = targetPos.y - lookTarget.y;
            const dz = targetPos.z - lookTarget.z;
            const d = Math.hypot(dx, dy, dz);
            if (d > 1e-4 && d < minDist) {
                const k = minDist / d;
                targetPos.set(lookTarget.x + dx * k,
                    lookTarget.y + dy * k,
                    lookTarget.z + dz * k);
            }
        }

        /*
        Interpolação de posição e de foco, AO TEMPO e não ao frame.

        Era `lerp(alvo, 0.05)` por frame: 5% de cada vez, quantas vezes o
        browser desenhasse. A constante de tempo passava de 0.33 s a 60 fps
        para 0.5 s a 40 fps — a imagem arrastava-se mais quanto pior corria,
        que é o pior momento para isso acontecer. `fatorSuavizacao` (utils.js)
        devolve os mesmos 0.05 a 60 fps e corrige o resto.

        O `dt` é o do frame desenhado, não o do passo de simulação: a câmara é
        desenhada uma vez por frame mesmo quando o `Match.update` correu duas.
        */
        const dtFrame = (typeof window.lastFrameDelta === 'number') ? window.lastFrameDelta : (1 / 60);
        window.cameraCore.position.lerp(targetPos, fatorSuavizacao(0.05, dtFrame));

        // Interpolação do ponto de foco
        if (!this.currentLookTarget) this.currentLookTarget = new THREE.Vector3();
        this.currentLookTarget.lerp(lookTarget, fatorSuavizacao(0.08, dtFrame));

        // Usando lookAt direto evita que a câmara torça ou olhe para o céu ao alternar modos
        window.cameraCore.lookAt(this.currentLookTarget);
    },

    updatePlacar: function () {
        const elA = document.getElementById('placar-a');
        const elB = document.getElementById('placar-b');
        const elT = document.getElementById('placar-tempo');
        if (elA) elA.textContent = this.placarB;
        if (elB) elB.textContent = this.placarA;
        if (elT) {
            const total = Math.floor(this.tempoDeJogo);
            const mm = String(Math.floor(total / 60)).padStart(2, '0');
            const ss = String(total % 60).padStart(2, '0');
            elT.textContent = mm + ':' + ss;
        }
    },
});
