Object.assign(Match, {
    init: function (scene) {
        this.scene = scene;
        this.currentLookTarget = new THREE.Vector3(0, 0, 0);

        if (typeof EventBus !== 'undefined' && !this._eventBusBound) {
            this._eventBusBound = true;
            EventBus.on('GK_CATCH_BALL', (d) => {
                if (this.gkHoldingBall) this.gkHoldingBall[d.team] = true;
            });
            EventBus.on('GK_RELEASE_BALL', (d) => {
                if (this.gkHoldingBall) this.gkHoldingBall[d.team] = false;
            });
            EventBus.on('CB_HAS_BALL', (d) => {
                const p = d.p;
                const teammates = (p.team === 'TeamA') ? this.players : this.opponents;
                const outroCB = teammates.find(t => t.pos === 'CB' && t !== p);
                const rm = teammates.find(t => t.pos === 'RM');
                const lm = teammates.find(t => t.pos === 'LM');
                const rb = teammates.find(t => t.pos === 'RB');
                const lb = teammates.find(t => t.pos === 'LB');
                
                const ladoJogada = Math.sign(p.model.position.x) || Math.sign(this.ball.position.x) || 1;
                const mesmoLado = (ladoJogada > 0) ? rm || rb : lm || lb;
                const ladoOposto = (ladoJogada > 0) ? lm || lb : rm || rb;
                
                const aplicar = (jog, ofs) => {
                    if (!jog) return;
                    if (!jog.buildOutOffset) jog.buildOutOffset = new THREE.Vector3();
                    jog.buildOutOffset.setZ(ofs * jog.dirZ);
                    jog.buildOutTimer = 5.0;
                };
                
                aplicar(outroCB, -3);
                aplicar(mesmoLado, 3);
                aplicar(ladoOposto, 5);
            });
        }

            /*
            Migração por eventos — parte 3: CM. Quando um CM fica com a
            bola: médio-ala do lado da jogada avança 5m, lateral do mesmo
            lado avança 10m, CM oposto recua (dá support atrás), médio-ala
            do lado oposto avança 3m. Mesmo bias temporário (5s) do CB.
            */
            if (!this._eventBusBoundCM) { this._eventBusBoundCM = true; EventBus.on('CM_HAS_BALL', (d) => {
                const p = d.p;
                const teammates = (p.team === 'TeamA') ? this.players : this.opponents;
                const outroCM = teammates.find(t => t.pos === 'CM' && t !== p);
                const rm = teammates.find(t => t.pos === 'RM');
                const lm = teammates.find(t => t.pos === 'LM');
                const rb = teammates.find(t => t.pos === 'RB');
                const lb = teammates.find(t => t.pos === 'LB');

                const ladoJogada = Math.sign(p.model.position.x) || Math.sign(this.ball.position.x) || 1;
                const mesmoM = (ladoJogada < 0) ? lm : rm;
                const opostoM = (ladoJogada < 0) ? rm : lm;
                const mesmoB = (ladoJogada < 0) ? lb : rb;

                const aplicar = (jog, metros) => {
                    if (!jog) return;
                    jog.buildOutBias = { x: 0, z: metros * jog.dirZ };
                    jog.buildOutTimer = 5.0;
                };
                aplicar(mesmoM, 5);
                aplicar(mesmoB, 10);
                aplicar(outroCM, -4);
                aplicar(opostoM, 3);
            }); }

        this.createField();

        this.ball = new THREE.Group();
        // ballVisual pode ser um Group (malha do OBJ, um mesh por material) ou
        // um Mesh (bola procedural). Ambos têm scale e quaternion, que é tudo o
        // que o updateBall lhes toca.
        this.ballVisual = this.criarBola(BallPhysics.raio * BallPhysics.escalaVisual);
        this.ball.add(this.ballVisual); this.scene.add(this.ball);

        this.offsideLineA = new THREE.Mesh(new THREE.PlaneGeometry(CAMPO_LARG, 0.25), new THREE.MeshBasicMaterial({ color: 0x3498db, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
        this.offsideLineA.rotation.x = -Math.PI / 2; this.offsideLineA.position.y = 0.04; this.offsideLineA.visible = false;
        this.scene.add(this.offsideLineA);

        this.offsideLineB = new THREE.Mesh(new THREE.PlaneGeometry(CAMPO_LARG, 0.25), new THREE.MeshBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
        this.offsideLineB.rotation.x = -Math.PI / 2; this.offsideLineB.position.y = 0.04; this.offsideLineB.visible = false;
        this.scene.add(this.offsideLineB);
        const lineGeomA = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-CAMPO_LARG/2, 0.05, 0), new THREE.Vector3(CAMPO_LARG/2, 0.05, 0)]);
        this.defLineA = new THREE.LineSegments(lineGeomA, new THREE.LineDashedMaterial({ color: 0x3498db, dashSize: 1, gapSize: 1 }));
        this.defLineA.computeLineDistances();
        this.defLineA.visible = false;
        this.scene.add(this.defLineA);
        const lineGeomB = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-CAMPO_LARG/2, 0.05, 0), new THREE.Vector3(CAMPO_LARG/2, 0.05, 0)]);
        this.defLineB = new THREE.LineSegments(lineGeomB, new THREE.LineDashedMaterial({ color: 0xe74c3c, dashSize: 1, gapSize: 1 }));
        this.defLineB.computeLineDistances();
        this.defLineB.visible = false;
        this.scene.add(this.defLineB);

        this.btPosRectA = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x3498db, linewidth: 2 }));
        this.btPosRectA.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
        this.btPosRectA.visible = false;
        this.scene.add(this.btPosRectA);

        this.btPosRectB = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe74c3c, linewidth: 2 }));
        this.btPosRectB.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
        this.btPosRectB.visible = false;
        this.scene.add(this.btPosRectB);


        // Marca do centro do bloco — quadrado cheio no meio do rectângulo.
        const criarCentro = (cor) => {
            const m = new THREE.Mesh(
                new THREE.PlaneGeometry(0.85, 0.85),
                new THREE.MeshBasicMaterial({ color: cor, side: THREE.DoubleSide })
            );
            m.rotation.x = -Math.PI / 2;
            m.position.y = 0.06;
            m.visible = false;
            this.scene.add(m);
            return m;
        };
        this.btPosCentroA = criarCentro(0x3498db);
        this.btPosCentroB = criarCentro(0xe74c3c);

        this.passTargetVisual = new THREE.Mesh(
            new THREE.CircleGeometry(0.5, 32),
            new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide })
        );
        this.passTargetVisual.rotation.x = -Math.PI / 2;
        this.passTargetVisual.position.y = 0.12;
        this.passTargetVisual.visible = false;
        this.scene.add(this.passTargetVisual);

        this.passLineVisual = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: 0xffff00 })
        );
        this.passLineVisual.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        this.passLineVisual.visible = false;
        this.scene.add(this.passLineVisual);

        this.goalLineVisual = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 1 })
        );
        this.goalLineVisual.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        this.goalLineVisual.visible = false;
        this.scene.add(this.goalLineVisual);

        // Anti Ping-Pong Aéreo: rastreia cabeceios sucessivos sem a bola assentar no chão/pé
        this.aerialHeaderCount = 0;
        this.aerialHeaderTimer = 0;

        this.showOffsideLines = false;

        this.equipasPorOmissao();
        this.createTeams();
        this.resetPlay();
        this.setupKeyboardListeners();
    },

    createField: function () {
        const campoGrupo = new THREE.Group();
        let gramaLarg = CAMPO_LARG + 52;
        let gramaComp = CAMPO_COMP + 34;
        /*
        =================================================================
        AS FAIXAS DO CORTE SÓ DENTRO DO CAMPO
        =================================================================
        Pedido: *"usa só a cor escura do gramado fora do campo de jogo"*.

        A textura era de UMA dimensão — 16 px de largura, e cada linha do canvas
        pintada de ponta a ponta. A cor só podia variar ao longo do comprimento
        (o eixo Z), portanto as faixas do corte atravessavam o relvado inteiro,
        campo e run-off, e não havia como parar nas linhas laterais.

        Agora é 2D: cada faixa pinta-se primeiro TODA de escuro e só depois se
        pinta o pedaço que cai dentro das linhas laterais com a cor da faixa.
        As três faixas de cada ponta — o run-off atrás das balizas, que já eram
        faixas próprias no desenho antigo — ficam escuras de uma ponta à outra.

        Custo: 256x512 em vez de 16x512, uma vez por jogo. E o `repeat` deixa de
        ser 15 em X: com a cor a variar na largura, repetir a textura era
        repetir o campo quinze vezes.
        */
        const cvsR = document.createElement('canvas'); const ctxR = cvsR.getContext('2d');
        cvsR.width = 256; cvsR.height = 512;

        // Onde é que as linhas laterais caem, em pixels da textura.
        const xDentroIni = Math.round(((gramaLarg / 2 - CAMPO_LARG / 2) / gramaLarg) * 256);
        const xDentroFim = Math.round(((gramaLarg / 2 + CAMPO_LARG / 2) / gramaLarg) * 256);

        const stripeHeights = [];
        for (let i = 0; i < 3; i++) stripeHeights.push(17 / 3);
        for (let i = 0; i < 20; i++) stripeHeights.push(CAMPO_COMP / 20);
        for (let i = 0; i < 3; i++) stripeHeights.push(17 / 3);
        let currentY = 0;
        for (let i = 0; i < 26; i++) {
            let nextY = currentY + stripeHeights[i];
            let yStartPix = Math.round((currentY / gramaComp) * 512);
            let yEndPix = Math.round((nextY / gramaComp) * 512);
            const altura = yEndPix - yStartPix;

            // Fora do campo é sempre a escura. As duas cores vivem no config:
            // ver RelvaCores (config/physics.js).
            ctxR.fillStyle = RelvaCores.escura;
            ctxR.fillRect(0, yStartPix, 256, altura);

            // E dentro, a faixa do corte — menos nas três de cada ponta, que
            // são o run-off atrás das balizas.
            const noCampo = (i >= 3 && i < 23);
            if (noCampo && (i % 2 === 0)) {
                ctxR.fillStyle = RelvaCores.clara;
                ctxR.fillRect(xDentroIni, yStartPix, xDentroFim - xDentroIni, altura);
            }
            currentY = nextY;
        }
        const relvaTex = new THREE.CanvasTexture(cvsR);
        relvaTex.wrapS = THREE.ClampToEdgeWrapping; relvaTex.wrapT = THREE.ClampToEdgeWrapping;
        window.relva = new THREE.Mesh(new THREE.PlaneGeometry(gramaLarg, gramaComp), new THREE.MeshStandardMaterial({ map: relvaTex, roughness: 1.0 }));
        window.relva.rotation.x = -Math.PI / 2; window.relva.receiveShadow = true; campoGrupo.add(window.relva);

        const matLinha = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
        const esp = 0.15; const comp = CAMPO_COMP; const larg = CAMPO_LARG;
        function addLinha(w, h, x, z) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matLinha); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); m.receiveShadow = true; campoGrupo.add(m); }
        addLinha(larg + esp, esp, 0, comp / 2); addLinha(larg + esp, esp, 0, -comp / 2); addLinha(esp, comp + esp, larg / 2, 0); addLinha(esp, comp + esp, -larg / 2, 0); addLinha(larg, esp, 0, 0);

        const circ = new THREE.Mesh(new THREE.RingGeometry(9.15 - esp / 2, 9.15 + esp / 2, 64), matLinha); circ.rotation.x = -Math.PI / 2; circ.position.y = 0.02; campoGrupo.add(circ);
        const ptC = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), matLinha); ptC.rotation.x = -Math.PI / 2; ptC.position.y = 0.02; campoGrupo.add(ptC);

        /*
        OS QUATRO CANTOS: quarto de círculo e bandeirinha.

        O arco é o mesmo `RingGeometry` deitado do arco da grande área; o que
        muda é o `thetaStart`, que tem de apontar o quarto para DENTRO do
        campo. Essa conta saiu para `arcoDeCanto` (utils.js) porque o `z` fica
        invertido quando o anel é deitado — é o género de sinal que se acerta
        por tentativa e se volta a perder na alteração seguinte.

        A bandeira fica virada para o meio do campo e é `DoubleSide`: de um
        lado só, desaparecia consoante a câmara, e esta anda à volta toda.
        */
        const CF = CornerFlag;
        const matPosteCanto = new THREE.MeshStandardMaterial({ color: CF.corPoste, roughness: 0.6 });
        const matBandeira = new THREE.MeshStandardMaterial({
            color: CF.corBandeira, roughness: 0.9, side: THREE.DoubleSide
        });

        [1, -1].forEach(sx => [1, -1].forEach(sz => {
            const cx = sx * larg / 2, cz = sz * comp / 2;

            const quarto = new THREE.Mesh(
                new THREE.RingGeometry(CF.raioArco - esp / 2, CF.raioArco + esp / 2,
                    16, 1, arcoDeCanto(sx, sz), Math.PI / 2),
                matLinha);
            quarto.rotation.x = -Math.PI / 2;
            quarto.position.set(cx, 0.02, cz);
            quarto.receiveShadow = true;
            campoGrupo.add(quarto);

            const poste = new THREE.Mesh(
                new THREE.CylinderGeometry(CF.raioPoste, CF.raioPoste, CF.alturaPoste, 8),
                matPosteCanto);
            poste.position.set(cx, CF.alturaPoste / 2, cz);
            poste.castShadow = true;
            campoGrupo.add(poste);

            /*
            A bandeira sai do poste para DENTRO do campo (-sx), no topo.

            SEM rotação nenhuma: o `PlaneGeometry` já nasce no plano XY, ou
            seja com a largura em X e a altura em Y — que é exactamente um pano
            preso ao poste e a apontar para dentro ao longo de X. Rodá-lo em Y
            punha-o a estender-se em Z enquanto a posição o desloca em X, e a
            bandeira ficava ao lado do poste em vez de presa a ele.
            */
            const bandeira = new THREE.Mesh(
                new THREE.PlaneGeometry(CF.larguraBandeira, CF.alturaBandeira), matBandeira);
            bandeira.position.set(
                cx - sx * (CF.larguraBandeira / 2 + CF.raioPoste),
                CF.alturaPoste - CF.alturaBandeira / 2 - 0.05,
                cz);
            bandeira.castShadow = true;
            campoGrupo.add(bandeira);
        }));

        /*
        PLACAS DE PUBLICIDADE, a toda a volta e `recuo` metros para fora das
        linhas. Ver PlacasPublicidade (config/physics.js) para as medidas.

        A textura e desenhada UMA vez e repetida ao longo de cada painel: um
        canvas por cada faixa de cor daria dezenas de texturas para o mesmo
        efeito. O `repeat.x` conta quantos paineis cabem no comprimento, para
        os blocos terem sempre `larguraPainel` metros em qualquer das quatro
        faixas, e nao esticarem nas compridas e encolherem nas curtas.

        `DoubleSide` porque a camara deste jogo anda a toda a volta e uma placa
        so tem interesse vista de dentro — mas de fora nao pode desaparecer e
        deixar ver o recinto vazio.
        */
        if (typeof PlacasPublicidade !== 'undefined' && PlacasPublicidade.activo) {
            const PP = PlacasPublicidade;
            const xLateral = MEIA_LARGURA_CAMPO + PP.recuo;
            const zFundo = LINHA_FUNDO + PP.recuo;
            /*
            OS CANTOS ARREDONDAM, como os da bancada. As rectas param a
            `raioCanto` do vertice e um quarto de circulo fecha o anel — a
            mesma conta do `cornerX`/`cornerZ` da bancada, mais abaixo.

            As pontas de cada arco caem EM CIMA das duas rectas por
            construcao, portanto o anel fecha em qualquer `recuo` ou
            `raioCanto` e nao ha dois numeros a manter a par.
            */
            const rc = Math.max(0, Math.min(PP.raioCanto || 0,
                Math.min(xLateral, zFundo) - 1));
            const cantoX = xLateral - rc;
            const cantoZ = zFundo - rc;
            const compLateral = 2 * cantoZ;
            const compFundo = 2 * cantoX;

            // Uma faixa de blocos de cor, repetida ao longo do painel.
            const cvsPP = document.createElement('canvas');
            cvsPP.width = 256; cvsPP.height = 64;
            const ctxPP = cvsPP.getContext('2d');
            const nCores = PP.cores.length;
            for (let i = 0; i < nCores; i++) {
                ctxPP.fillStyle = PP.cores[i];
                ctxPP.fillRect(Math.round(i * 256 / nCores), 0,
                    Math.ceil(256 / nCores), 64);
            }
            // Risco escuro em baixo: assenta a placa no chao em vez de a deixar
            // a brilhar toda igual.
            ctxPP.fillStyle = 'rgba(0,0,0,0.35)';
            ctxPP.fillRect(0, 56, 256, 8);

            const fazerMaterial = (comprimento) => {
                const tex = new THREE.CanvasTexture(cvsPP);
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;
                tex.repeat.set(Math.max(1, Math.round(comprimento / (PP.larguraPainel * nCores))), 1);
                return new THREE.MeshStandardMaterial({
                    map: tex, roughness: 0.65, side: THREE.DoubleSide
                });
            };

            const matLateralPP = fazerMaterial(compLateral);
            const matFundoPP = fazerMaterial(compFundo);

            const addPlaca = (comprimento, mat, x, z, rodaY) => {
                const m = new THREE.Mesh(
                    new THREE.BoxGeometry(comprimento, PP.altura, PP.espessura), mat);
                m.position.set(x, PP.altura / 2, z);
                m.rotation.y = rodaY;
                m.castShadow = true;
                m.receiveShadow = true;
                campoGrupo.add(m);
            };

            // Laterais: correm em Z, portanto a caixa roda 90 graus em Y.
            addPlaca(compLateral, matLateralPP, xLateral, 0, Math.PI / 2);
            addPlaca(compLateral, matLateralPP, -xLateral, 0, Math.PI / 2);
            // Fundos: correm em X, sem rotacao.
            addPlaca(compFundo, matFundoPP, 0, zFundo, 0);
            addPlaca(compFundo, matFundoPP, 0, -zFundo, 0);

            /*
            E OS QUATRO ARCOS. Um `CylinderGeometry` aberto e sem tampas e uma
            parede curva — melhor do que caixinhas em leque, que deixavam
            arestas visiveis a cada segmento.

            No three.js o angulo do cilindro anda `x = R*sin(t)`,
            `z = R*cos(t)`: em t=0 aponta a +Z e em t=PI/2 a +X. Logo o canto
            (+cantoX, +cantoZ) e o sector de 0 a PI/2, e os outros seguem de
            90 em 90 graus no sentido dos ponteiros.

            A textura repete-se pelo COMPRIMENTO DO ARCO, nao por uma volta
            inteira: sem isso os blocos de cor esticavam na curva e ficavam com
            outra largura que nas rectas.
            */
            const arco = (cx, cz, thetaStart) => {
                const geo = new THREE.CylinderGeometry(
                    rc, rc, PP.altura, 24, 1, true, thetaStart, Math.PI / 2);
                const tex = new THREE.CanvasTexture(cvsPP);
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;
                /*
                O sector cobre um quarto do U do cilindro, portanto para o arco
                (de comprimento R*PI/2) mostrar N repeticoes da faixa e preciso
                pedir 4*N ao `repeat`.
                */
                const nFaixas = Math.max(1, Math.round(
                    (rc * Math.PI / 2) / (PP.larguraPainel * nCores)));
                tex.repeat.set(4 * nFaixas, 1);
                const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
                    map: tex, roughness: 0.65, side: THREE.DoubleSide
                }));
                m.position.set(cx, PP.altura / 2, cz);
                m.castShadow = true;
                m.receiveShadow = true;
                campoGrupo.add(m);
            };
            if (rc > 0.01) {
                arco(cantoX, cantoZ, 0);
                arco(cantoX, -cantoZ, Math.PI / 2);
                arco(-cantoX, -cantoZ, Math.PI);
                arco(-cantoX, cantoZ, 3 * Math.PI / 2);
            }
        }

        const cvsRede = document.createElement('canvas'); cvsRede.width = 32; cvsRede.height = 32; const ctxRede = cvsRede.getContext('2d');
        ctxRede.fillStyle = 'rgba(240, 240, 245, 0.35)'; ctxRede.fillRect(0, 0, 32, 32);
        ctxRede.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctxRede.lineWidth = 1.5; ctxRede.strokeRect(0, 0, 32, 32);
        ctxRede.strokeStyle = 'rgba(220, 220, 230, 0.5)'; ctxRede.lineWidth = 0.8;
        ctxRede.beginPath(); ctxRede.moveTo(0, 0); ctxRede.lineTo(32, 32); ctxRede.stroke();
        ctxRede.beginPath(); ctxRede.moveTo(32, 0); ctxRede.lineTo(0, 32); ctxRede.stroke();
        const texRede = new THREE.CanvasTexture(cvsRede); texRede.wrapS = THREE.RepeatWrapping; texRede.wrapT = THREE.RepeatWrapping;
        const matRede = new THREE.MeshBasicMaterial({ map: texRede, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });

        /*
        Uma face da rede. Passou de um quad de QUATRO vértices para uma grelha
        (ver gerarGrelhaRede em goal_net.js): sem vértices pelo meio, a rede não
        podia deformar-se — era uma chapa rígida com textura de rede.

        Os cantos, as UVs e o aspecto em repouso são os mesmos; só há mais
        vértices entre eles.
        */
        function criarFaceRede(p1, p2, p3, p4, repX, repY, nu, nv) {
            const g = gerarGrelhaRede(p1, p2, p3, p4, repX, repY,
                nu || GoalNet.segmentosU, nv || GoalNet.segmentosV);

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(g.posicoes, 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
            geo.setIndex(g.indices);
            geo.computeVertexNormals();
            return new THREE.Mesh(geo, matRede);
        }

        [1, -1].forEach(lado => {
            const zSinal = comp / 2 * lado; const dir = -lado;
            const zGA = zSinal + (Area.profundidade / 2) * dir;
            addLinha(Area.largura, esp, 0, zSinal + Area.profundidade * dir);
            addLinha(esp, Area.profundidade + esp, Area.meiaLargura, zGA);
            addLinha(esp, Area.profundidade + esp, -Area.meiaLargura, zGA);

            const zPA = zSinal + (Area.pequenaProfundidade / 2) * dir;
            addLinha(Area.pequenaLargura, esp, 0, zSinal + Area.pequenaProfundidade * dir);
            addLinha(esp, Area.pequenaProfundidade + esp, Area.pequenaMeiaLargura, zPA);
            addLinha(esp, Area.pequenaProfundidade + esp, -Area.pequenaMeiaLargura, zPA);

            const ptPen = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), matLinha); ptPen.rotation.x = -Math.PI / 2; ptPen.position.set(0, 0.02, zSinal + Area.distanciaPenalti * dir); campoGrupo.add(ptPen);
            const theta = Math.acos(Area.pequenaProfundidade / Area.raioMeiaLua); const arcRot = lado === 1 ? Math.PI / 2 - theta : -Math.PI / 2 - theta;
            const arco = new THREE.Mesh(new THREE.RingGeometry(Area.raioMeiaLua - esp / 2, Area.raioMeiaLua + esp / 2, 32, 1, arcRot, theta * 2), matLinha); arco.rotation.x = -Math.PI / 2; arco.position.set(0, 0.02, zSinal + Area.distanciaPenalti * dir); campoGrupo.add(arco);

            const baliza = new THREE.Group();
            const matPoste = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }); const rP = GoalFrame.raioPoste;
            const posteEsq = new THREE.Mesh(new THREE.CylinderGeometry(rP, rP, ALTURA_BALIZA, 16), matPoste); posteEsq.position.set(-LARGURA_BALIZA / 2, ALTURA_BALIZA / 2, 0); posteEsq.castShadow = true;
            const posteDir = new THREE.Mesh(new THREE.CylinderGeometry(rP, rP, ALTURA_BALIZA, 16), matPoste); posteDir.position.set(LARGURA_BALIZA / 2, ALTURA_BALIZA / 2, 0); posteDir.castShadow = true;
            const travessao = new THREE.Mesh(new THREE.CylinderGeometry(rP, rP, LARGURA_BALIZA + rP * 2, 16), matPoste); travessao.rotation.z = Math.PI / 2; travessao.position.set(0, ALTURA_BALIZA + rP, 0); travessao.castShadow = true;
            baliza.add(posteEsq, posteDir, travessao);

            const profTop = 0.8; const profBot = 2.0; const w = LARGURA_BALIZA / 2;
            const tLE = [-w, ALTURA_BALIZA, 0]; const tLD = [w, ALTURA_BALIZA, 0];
            const tTE = [-w, ALTURA_BALIZA, profTop]; const tTD = [w, ALTURA_BALIZA, profTop];
            const bTE = [-w, 0, profBot]; const bTD = [w, 0, profBot];
            const bFE = [-w, 0, 0]; const bFD = [w, 0, 0];

            const S = GoalNet;
            // Os laterais são estreitos: menos divisões ao longo de u.
            const redeCima = criarFaceRede(tLE, tLD, tTE, tTD, 30, 4, S.segmentosU, S.segmentosV);
            const redeTras = criarFaceRede(tTE, tTD, bTE, bTD, 30, 10, S.segmentosU, S.segmentosV);
            const redeEsq = criarFaceRede(bFE, tLE, bTE, tTE, 8, 10, S.segmentosLateralU, S.segmentosV);
            const redeDir = criarFaceRede(tLD, bFD, tTD, bTD, 8, 10, S.segmentosLateralU, S.segmentosV);

            const redes = new THREE.Group(); redes.add(redeCima, redeTras, redeEsq, redeDir);

            /*
            Regista as faces no NetWave para poderem ondular. A normal de cada
            uma é aproximada pelo eixo dominante: chega para o deslocamento
            visual, e evita ter de recalcular normais por vértice a cada frame.
            */
            if (typeof NetWave !== 'undefined') {
                NetWave.registarFace(redeCima, lado, { x: 0, y: 1, z: 0 }, S.segmentosU, S.segmentosV);
                NetWave.registarFace(redeTras, lado, { x: 0, y: 0, z: 1 }, S.segmentosU, S.segmentosV);
                NetWave.registarFace(redeEsq, lado, { x: 1, y: 0, z: 0 }, S.segmentosLateralU, S.segmentosV);
                NetWave.registarFace(redeDir, lado, { x: 1, y: 0, z: 0 }, S.segmentosLateralU, S.segmentosV);
            }
            if (lado === -1) { redes.scale.z = -1; }

            baliza.add(redes); baliza.position.set(0, 0, zSinal + (rP * dir)); campoGrupo.add(baliza);
        });

        const concreteMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9 });
        const stepGeos = [];

        function addStepBox(w, h, d, px, py, pz, rotY) {
            const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
            if (rotY) geo.rotateY(rotY);
            geo.translate(px, py, pz);
            stepGeos.push(geo);
        }

        /*
        Cadeiras da bancada. A altura passou de 0.30 para 0.075 — um quarto:
        eram cubos altos de mais e liam-se como caixotes, não como assentos.

        A geometria é centrada na origem, portanto encolher só a altura fazia a
        BASE subir metade da diferença e as cadeiras ficavam a flutuar acima do
        degrau. O `translate` desce o centro exactamente essa metade, e a base
        fica onde estava.
        */
        const SEAT_ALT_ANTIGA = 0.3, SEAT_ALT = SEAT_ALT_ANTIGA / 4;
        const seatGeo = new THREE.BoxGeometry(0.5, SEAT_ALT, 0.4);
        seatGeo.translate(0, -(SEAT_ALT_ANTIGA - SEAT_ALT) / 2, 0);
        const seatMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });

        /*
        O TECTO DOS LUGARES, e ele CORTA EM SILENCIO.

        O `addSeatInstance` faz `if (seatIndex >= maxSeats) return` — passado o
        tecto, as cadeiras deixam de aparecer e nada o diz. Era 30 000, e com
        um anel de 30 filas sobrava muito.

        Com dois aneis de 20 filas medem-se 24 528 lugares (10 448 no de baixo,
        14 080 no de cima — o de cima tem mais porque o arco das esquinas cresce
        com o raio). Ficavam 1 824 de margem: um terceiro anel, ou so mexer no
        `RAIO_PRIMEIRA_FILA`, e comecava a faltar cadeiras sem aviso.

        45 000 dao folga para tres aneis. O custo e memoria da InstancedMesh
        (uma matriz 4x4 e uma cor por lugar, ~80 bytes), ou seja ~1.2 MB a mais
        no pior caso — e nada em desenho, porque o que nao e preenchido fica
        com a matriz a zero e nao chega ao ecra.
        */
        const maxSeats = 45000;
        const seatMesh = new THREE.InstancedMesh(seatGeo, seatMat, maxSeats);
        seatMesh.castShadow = false;
        seatMesh.receiveShadow = false;

        const specGeo = createSpectatorGeometry();
        const specMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
        specMat.userData = { time: { value: 0 }, excitement: { value: 0 } };
        specMat.onBeforeCompile = function (shader) {
            shader.uniforms.uTime = specMat.userData.time;
            shader.uniforms.uExcitement = specMat.userData.excitement;
            shader.vertexShader = 'uniform float uTime;\nuniform float uExcitement;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `
                #ifdef USE_INSTANCING
                float phase = instanceMatrix[3].x * 13.0 + instanceMatrix[3].z * 7.0;
                float t = uTime;
                float exc = uExcitement;
                
                float standUp = 0.0;
                float armWave = 0.0;
                float lean = 0.0;
                
                float wavePhase = mod(floor(phase * 10.0), 3.0);
                standUp = abs(sin(t * (4.0 + wavePhase) + phase)) * 0.12;
                
                if (exc > 0.7) {
                    standUp = 0.15 + abs(sin(t * 9.0 + phase)) * 0.18;
                    armWave = sin(t * 11.0 + phase) * 0.25;
                } else if (exc > 0.35) {
                    standUp *= 1.4;
                    armWave = sin(t * 6.0 + phase) * 0.12;
                    lean = sin(t * 4.0 + phase) * 0.04;
                } else {
                    lean = sin(t * 2.0 + phase) * 0.02;
                }

                transformed.y += standUp;
                transformed.x += lean;
                
                float cW = cos(armWave);
                float sW = sin(armWave);
                float tx = transformed.x;
                float tz = transformed.z;
                transformed.x = tx * cW - tz * sW;
                transformed.z = tx * sW + tz * cW;
                #endif
                
                #include <project_vertex>
                `
            );
        };
        const specMesh = new THREE.InstancedMesh(specGeo, specMat, maxSeats);
        specMesh.castShadow = false;
        specMesh.receiveShadow = false;

        let seatIndex = 0;
        let spectatorIndex = 0;
        const dummy = new THREE.Object3D();
        const specDummy = new THREE.Object3D();

        /*
        CORES DA BANCADA — vermelho e branco, em composição desenhada.

        Antes cada cadeira sorteava uma de quatro cores (azul, vermelho,
        branco, amarelo) com `Math.random`. Isso dá ruído: de longe lê-se como
        um chão salpicado, não como uma bancada. Um estádio real pinta os
        assentos num PADRÃO, e é o padrão que se vê da câmara alta.

        Aqui o padrão sai da FILA e da COLUNA de cada cadeira, portanto é
        determinístico — a bancada é a mesma em cada arranque, como já é a
        multidão (ver o gerador com semente em js/crowd.js).

        A composição, de baixo para cima nas 30 filas:

            filas 0-1     branco   contorno claro a rodear o campo
            filas 8-9     branco   faixa do meio
            filas 18-19   branco   faixa alta
            filas 28-29   branco   remate do topo
            resto         vermelho

        As filas logo acima de cada faixa branca levam DENTES: blocos brancos
        de 3 colunas a cada 12, deslocados pela fila. Sem eles as faixas eram
        quatro linhas a direito e o conjunto ficava com ar de código de barras;
        os dentes quebram a horizontal e dão a leitura de mosaico.
        */
        const SEAT_VERMELHO = new THREE.Color('#c0392b');
        const SEAT_BRANCO = new THREE.Color('#ecf0f1');
        const SEAT_FILAS_BRANCAS = [0, 1, 8, 9, 18, 19, 28, 29];
        // Filas com dentes: a que fica logo acima de cada faixa branca.
        const SEAT_FILAS_DENTADAS = [2, 10, 20];
        const SEAT_DENTE_PERIODO = 12, SEAT_DENTE_LARGURA = 3;

        /*
        Variação de tom por cadeira. Sem isto uma faixa inteira é uma chapa de
        cor exacta e o plástico não se lê. É determinística — um hash da fila e
        da coluna, não `Math.random` — para a bancada não mudar entre corridas.
        */
        const SEAT_VARIACAO = 0.10;
        const _seatCor = new THREE.Color();

        function seatEhBranca(fila, coluna) {
            if (SEAT_FILAS_BRANCAS.indexOf(fila) !== -1) return true;
            if (SEAT_FILAS_DENTADAS.indexOf(fila) !== -1) {
                // O deslocamento por fila impede que os dentes de duas filas
                // dentadas fiquem alinhados na vertical.
                const c = (coluna + fila * 5) % SEAT_DENTE_PERIODO;
                return c < SEAT_DENTE_LARGURA;
            }
            return false;
        }

        function getSeatColor(fila, coluna) {
            _seatCor.copy(seatEhBranca(fila, coluna) ? SEAT_BRANCO : SEAT_VERMELHO);
            // Hash inteiro barato: dá sempre o mesmo valor para a mesma cadeira.
            const h = ((fila * 73856093) ^ (coluna * 19349663)) & 0x7fffffff;
            const k = 1 + ((h / 0x7fffffff) - 0.5) * 2 * SEAT_VARIACAO;
            return _seatCor.multiplyScalar(k);
        }

        /*
        Todos os lugares construídos, para o `Crowd` (js/crowd.js) lá pôr os
        adeptos com o modelo dos jogadores. É recolhido aqui porque só quem
        constrói as bancadas sabe onde os lugares ficam — e o Crowd precisa
        deles TODOS antes de decidir seja o que for: a mescla das duas claques
        sai da posição em Z de cada lugar face aos extremos do estádio.
        */
        const lugares = [];

        function addSeatInstance(x, y, z, rotY, fila, coluna) {
            if (seatIndex >= maxSeats) return;
            dummy.position.set(x, y, z);
            dummy.rotation.set(0, rotY, 0);
            dummy.updateMatrix();
            seatMesh.setMatrixAt(seatIndex, dummy.matrix);
            seatMesh.setColorAt(seatIndex, getSeatColor(fila || 0, coluna || 0));
            seatIndex++;

            // O adepto senta-se um pouco acima do assento.
            lugares.push({ x: x, y: y + 0.13, z: z, rotY: rotY });

            const crowdAllowed = false && (typeof Config === 'undefined' || Config.enableCrowd !== false);
            if (crowdAllowed && Math.random() < 0.75 && spectatorIndex < maxSeats) {
                specDummy.position.set(x, y + 0.13, z);
                specDummy.rotation.set(0, rotY, 0);
                specDummy.updateMatrix();
                specMesh.setMatrixAt(spectatorIndex, specDummy.matrix);

                let teamColor;
                let t = (z + 55) / 110;
                t = Math.max(0, Math.min(1, t));
                let probRed = t * 0.85;
                let probBlue = (1 - t) * 0.85;
                let rnd = Math.random();
                if (rnd < probRed) {
                    teamColor = new THREE.Color('#e74c3c');
                } else if (rnd < probRed + probBlue) {
                    teamColor = new THREE.Color('#2980b9');
                } else {
                    teamColor = new THREE.Color('#ecf0f1');
                }

                specMesh.setColorAt(spectatorIndex, teamColor);
                Match.specData.push({ bx: x, by: y + 0.13, bz: z, rotY: rotY, phase: Math.random() * Math.PI * 2 });
                spectatorIndex++;
            }
        }

        /*
        DEGRAUS DE UM ANEL, e nao da bancada toda. Eram 30 numa tirada; passam
        a ser os `degrausPorAnel` do BancadaAneis, repetidos por anel, com uma
        parede e uma cobertura entre eles. Ver BancadaAneis (config/physics.js).
        */
        const BA = (typeof BancadaAneis !== 'undefined') ? BancadaAneis : {
            aneis: 1, degrausPorAnel: 30, alturaParede: 0, espessuraParede: 0,
            cobertura: false, coberturaAvanco: 0, coberturaEspessura: 0
        };
        const rows = BA.degrausPorAnel;
        const N_ANEIS = Math.max(1, BA.aneis);
        /*
        QUANTO CADA ANEL SOBE E RECUA.

        O recuo e medido do BORDO da cobertura do anel de baixo e nao da parede
        dele: o anel de cima fica em voladura sobre o de baixo, com a cobertura
        inferior a servir-lhe de piso. Ver BancadaAneis.recuoSobreCobertura,
        com a medicao do erro que isto corrige (o anel de cima nascia 16.6 m
        atras do bordo, empurrado para fora do estadio).

        Sem cobertura o recuo volta a ser atras da parede, que e a unica coisa
        que faz sentido nesse caso.
        */
        const PASSO_Y = rows * 0.5 + BA.alturaParede;
        const PASSO_PROF = (BA.cobertura && BA.coberturaAvanco > 0)
            ? (rows * 1.2 - BA.coberturaAvanco + (BA.recuoSobreCobertura || 3.0))
            : (rows * 1.2 + BA.espessuraParede);

        /*
        =================================================================
        A QUE DISTÂNCIA DO CAMPO É QUE A BANCADA COMEÇA
        =================================================================
        Pedido: *"ajusta as arquibancadas para 12 metros das linhas laterais e de
        fundo do campo"*. Eram 4.5 na lateral e 5.5 no fundo; passaram por 7.0 na
        lateral (primeiro pedido) e estão agora nos 12 nos dois lados.

        Os três números estavam escritos à mão nos sítios onde se constrói cada
        bancada, e o das esquinas estava escrito DUAS vezes (no raio da primeira
        fila e na âncora do arco). Mudar um sem os outros abre uma fenda na
        esquina — é por isso que ficam aqui, com a relação entre eles explícita:

            a primeira fila da lateral fica a `RECUO_LATERAL` da linha lateral;
            a primeira fila do fundo   fica a `RECUO_FUNDO` da linha de fundo;
            e o arco da esquina, de raio `RAIO_PRIMEIRA_FILA`, é ancorado de
            modo a ENCOSTAR nos dois: o centro dele recua o raio para dentro,
            em cada eixo.

        Sem essa última conta, subir o recuo lateral empurrava a esquina para
        fora também em Z e ela deixava de bater com a bancada de fundo.
        */
        const RECUO_LATERAL = 12.0;
        const RECUO_FUNDO = 12.0;
        const RAIO_PRIMEIRA_FILA = 6.5;

        const BANCADA_X = CAMPO_LARG / 2 + RECUO_LATERAL;
        const BANCADA_Z = CAMPO_COMP / 2 + RECUO_FUNDO;

        /*
        ONDE AS RECTAS ACABAM E AS ESQUINAS COMEÇAM — é o mesmo ponto, e é daqui
        que sai.

        O arco de uma esquina é um quarto de círculo de raio
        `RAIO_PRIMEIRA_FILA` centrado em (cornerX, cornerZ); as duas pontas dele
        caem em (BANCADA_X, cornerZ) e (cornerX, BANCADA_Z), ou seja EM CIMA da
        primeira fila da lateral e da do fundo. Logo: a lateral tem de ir até
        |z| = cornerZ e o fundo até |x| = cornerX.

        Relato: *"fecha os vãos das arquibancadas"*. As rectas acabavam nos
        limites do CAMPO (|z| = 52, |x| = 32), que era onde as esquinas ficavam
        quando as bancadas estavam a 4.5 m. Afastadas para 12, as esquinas
        andaram para fora e as rectas não — sobravam dez buracos de 6.6 a 9.4 m,
        medidos com `tools/scratch/vaos_bancada.js`. Amarrado à geometria da
        esquina, o anel fecha sozinho em qualquer recuo.
        */
        const cornerX = BANCADA_X - RAIO_PRIMEIRA_FILA;
        const cornerZ = BANCADA_Z - RAIO_PRIMEIRA_FILA;

        /*
        A ESQUINA DE UM ANEL. `offProf` e `offY` sao o recuo e a subida do anel
        — a zero dao a esquina do anel de baixo, exactamente como era.

        O raio cresce com o recuo e nao com uma esquina nova: o arco do anel de
        cima e concentrico com o de baixo, portanto continua a encostar nas
        rectas das bancadas desse anel (ver a nota do `cornerX`/`cornerZ`).
        */
        function buildCorner(cx, cz, startAngle, offProf, offY) {
            const oP = offProf || 0, oY = offY || 0;
            for (let r = 0; r < rows; r++) {
                const R = RAIO_PRIMEIRA_FILA + oP + r * 1.2;
                const standY = oY + 0.25 + (r * 0.5);

                const numSteps = Math.max(4, Math.floor(R * (Math.PI / 2) / 2.5));
                const stepLength = (R * (Math.PI / 2) / numSteps) * 1.05;
                for (let j = 0; j <= numSteps; j++) {
                    const angle = startAngle + (j / numSteps) * (Math.PI / 2);
                    const sx = cx + R * Math.cos(angle);
                    const sz = cz + R * Math.sin(angle);
                    addStepBox(1.2, 0.5, stepLength, sx, standY, sz, -angle);
                }

                const seatYOffset = standY + 0.25 + 0.15;
                const numSeats = Math.floor(R * (Math.PI / 2) / 0.85);
                for (let i = 0; i <= numSeats; i++) {
                    const angle = startAngle + (i / numSeats) * (Math.PI / 2);
                    const sx = cx + R * Math.cos(angle);
                    const sz = cz + R * Math.sin(angle);
                    const rotY = Math.atan2(-sx, -sz);
                    addSeatInstance(sx, seatYOffset, sz, rotY, r, i);
                }
            }
        }

        /*
        NUM CORREDOR? A conta e em metros a partir do CENTRO do campo, para o
        corredor k=0 cair na linha central. Ver CorredoresBancada
        (config/physics.js) e a nota de porque o modulo do indice nao servia.
        */
        const CB_ = (typeof CorredoresBancada !== 'undefined')
            ? CorredoresBancada : { largura: 2.7, espacamento: 18.7 };
        /*
        E A GRELHA DAS CADEIRAS E ANCORADA NO CENTRO, nao na ponta.

        Era `for (z = -cornerZ; z <= cornerZ; z += 0.85)`: com cornerZ = 58.5,
        `-58.5 + k*0.85` nunca da exactamente 0, portanto as cadeiras montavam
        a cavalo do meio-campo e o corredor central saia com o centro em
        0.15 m. Ancorada no centro, ha uma cadeira em 0 e o corredor fica
        simetrico sobre a linha.
        */
        const grelha = (limite, fn) => {
            const n = Math.floor(limite / 0.85);
            let idx = 0;
            for (let i = -n; i <= n; i++, idx++) fn(i * 0.85, idx);
        };

        const noCorredor = (coord) => {
            const passo = CB_.espacamento;
            const centro = Math.round(coord / passo) * passo;
            return Math.abs(coord - centro) < (CB_.largura / 2);
        };

        /*
        AS QUATRO BANCADAS, UMA VEZ POR ANEL.

        `offProf` e `offY` sao o recuo e a subida deste anel; a 0 dao
        exactamente a bancada de sempre, portanto com `aneis: 1` nada disto
        muda. Ver BancadaAneis.
        */
        for (let anel = 0; anel < N_ANEIS; anel++) {
            const offProf = anel * PASSO_PROF;
            const offY = anel * PASSO_Y;

            // Bancada Oeste (Esquerda)
            for (let r = 0; r < rows; r++) {
                const standX = -BANCADA_X - (offProf + r * 1.2);
                const standY = offY + 0.25 + (r * 0.5);
                addStepBox(1.2, 0.5, cornerZ * 2, standX, standY, 0, 0);

                const seatYOffset = standY + 0.25 + 0.15;
                // Até onde a esquina começa — ver `cornerZ`.
                grelha(cornerZ, (z, colIdx) => {
                    if (noCorredor(z)) return;   // corredor centrado no meio-campo
                    addSeatInstance(standX, seatYOffset, z, Math.PI / 2, r, colIdx);
                });
            }

            // Bancada Este (Direita)
            for (let r = 0; r < rows; r++) {
                const standX = BANCADA_X + (offProf + r * 1.2);
                const standY = offY + 0.25 + (r * 0.5);
                addStepBox(1.2, 0.5, cornerZ * 2, standX, standY, 0, 0);

                const seatYOffset = standY + 0.25 + 0.15;
                // Até onde a esquina começa — ver `cornerZ`.
                grelha(cornerZ, (z, colIdx) => {
                    if (noCorredor(z)) return;   // corredor centrado no meio-campo
                    addSeatInstance(standX, seatYOffset, z, -Math.PI / 2, r, colIdx);
                });
            }

            // Bancada Norte (Fundo)
            for (let r = 0; r < rows; r++) {
                const standZ = BANCADA_Z + (offProf + r * 1.2);
                const standY = offY + 0.25 + (r * 0.5);
                addStepBox(cornerX * 2, 0.5, 1.2, 0, standY, standZ, 0);

                const seatYOffset = standY + 0.25 + 0.15;
                /*
                Até onde a esquina começa — ver `cornerX`.

                AS DUAS PRIMEIRAS FILAS ATRÁS DA BALIZA DEIXARAM DE TER BURACO. Era
                `Math.abs(x) > 4.5 || r > 1`: um vão de 9.4 m no meio, que fazia
                sentido com a bancada a 5.5 m da linha (as cadeiras tapavam a
                baliza) e deixou de fazer com ela a 12. Foi o maior dos vãos
                medidos.
                */
                grelha(cornerX, (x, colIdx) => {
                    if (noCorredor(x)) return;   // corredor centrado no meio-campo
                    addSeatInstance(x, seatYOffset, standZ, Math.PI, r, colIdx);
                });
            }

            // Bancada Sul (Fundo oposto)
            for (let r = 0; r < rows; r++) {
                const standZ = -BANCADA_Z - (offProf + r * 1.2);
                const standY = offY + 0.25 + (r * 0.5);
                addStepBox(cornerX * 2, 0.5, 1.2, 0, standY, standZ, 0);

                const seatYOffset = standY + 0.25 + 0.15;
                // Até onde a esquina começa — ver `cornerX`. E sem o buraco das duas
                // primeiras filas atrás da baliza (ver a bancada Norte).
                grelha(cornerX, (x, colIdx) => {
                    if (noCorredor(x)) return;   // corredor centrado no meio-campo
                    addSeatInstance(x, seatYOffset, standZ, 0, r, colIdx);
                });
            }

            /*
            A PAREDE NO FIM DO ANEL — a fachada, 3 m acima do ultimo degrau.
            E dela que nasce a cobertura, e e nela que ficam os paineis da
            fotografia de referencia.
            */
            const profFim = offProf + rows * 1.2;
            const yFim = offY + rows * 0.5;
            const yParedeMeio = yFim + BA.alturaParede / 2;
            const matParede = new THREE.MeshStandardMaterial({
                color: BA.corParede, roughness: 0.9
            });
            const addParede = (eixo, sinal, base, comprimento) => {
                const pos = base + sinal * (profFim + BA.espessuraParede / 2);
                const dims = (eixo === 'x')
                    ? [BA.espessuraParede, BA.alturaParede, comprimento]
                    : [comprimento, BA.alturaParede, BA.espessuraParede];
                const m = new THREE.Mesh(new THREE.BoxGeometry(...dims), matParede);
                if (eixo === 'x') m.position.set(pos, yParedeMeio, 0);
                else m.position.set(0, yParedeMeio, pos);
                // Projecta, mas nao recebe: ver a nota do mergedStepsMesh.
                m.castShadow = true; m.receiveShadow = false;
                campoGrupo.add(m);
            };
            addParede('x', -1, -BANCADA_X, cornerZ * 2);
            addParede('x', 1, BANCADA_X, cornerZ * 2);
            addParede('z', 1, BANCADA_Z, cornerX * 2);
            addParede('z', -1, -BANCADA_Z, cornerX * 2);

            /*
            E A COBERTURA, no topo da parede, a AVANCAR sobre o anel.

            `coberturaAvanco` nao cobre o anel todo de proposito: na
            fotografia as primeiras filas estao a ceu aberto, e e isso que
            deixa a luz chegar ao relvado.

            Duas faces de cor diferente (`corCobertura` por cima,
            `corCoberturaBaixo` por baixo), porque um tecto visto de baixo e
            sempre mais escuro do que visto de cima — com uma cor so, a
            cobertura lia-se como uma laje a flutuar.
            */
            if (BA.cobertura && BA.coberturaAvanco > 0) {
                const yCob = yFim + BA.alturaParede + BA.coberturaEspessura / 2;
                const avanco = BA.coberturaAvanco;
                const matCima = new THREE.MeshStandardMaterial({
                    color: BA.corCobertura, roughness: 0.85
                });
                const matBaixo = new THREE.MeshStandardMaterial({
                    color: BA.corCoberturaBaixo, roughness: 0.95
                });
                const addCobertura = (eixo, sinal, base, comprimento) => {
                    // Do plano da parede para DENTRO do campo.
                    const bordoParede = base + sinal * profFim;
                    const centro = bordoParede - sinal * (avanco / 2);
                    const dims = (eixo === 'x')
                        ? [avanco, BA.coberturaEspessura, comprimento]
                        : [comprimento, BA.coberturaEspessura, avanco];
                    // [+x,-x,+y,-y,+z,-z]: 2 e o topo, 3 a face de baixo.
                    const mats = [0,1,2,3,4,5].map(i => (i === 3) ? matBaixo : matCima);
                    const m = new THREE.Mesh(new THREE.BoxGeometry(...dims), mats);
                    if (eixo === 'x') m.position.set(centro, yCob, 0);
                    else m.position.set(0, yCob, centro);
                    m.castShadow = true; m.receiveShadow = false;
                    campoGrupo.add(m);
                };
                addCobertura('x', -1, -BANCADA_X, cornerZ * 2);
                addCobertura('x', 1, BANCADA_X, cornerZ * 2);
                addCobertura('z', 1, BANCADA_Z, cornerX * 2);
                addCobertura('z', -1, -BANCADA_Z, cornerX * 2);
            }

            /*
            E NAS CURVAS TAMBEM — pedido: *"ta faltando o muro e a cobertura
            nas curvas"*. E estava: as quatro chamadas acima sao das bancadas
            RECTAS, e as esquinas ficavam sem nada.

            Em SEGMENTOS ao longo do quarto de circulo, e nao numa casca de
            cilindro: e o padrao que o `buildCorner` ja usa para os degraus, e
            e o unico que da ESPESSURA a parede. Uma casca de cilindro nao tem
            espessura, e no encontro com a parede recta (0.6 m) via-se a
            emenda.

            O raio e o mesmo da parede: `RAIO_PRIMEIRA_FILA + offProf +
            rows*1.2`, ou seja o fim do ultimo degrau deste anel — as pontas do
            arco caem em cima das paredes rectas, como os degraus do
            `buildCorner` caem em cima das filas.
            */
            const rArcoFim = RAIO_PRIMEIRA_FILA + offProf + rows * 1.2;
            const arcoSegs = Math.max(6, Math.floor(rArcoFim * (Math.PI / 2) / 2.0));
            const arcoLen = (rArcoFim * (Math.PI / 2) / arcoSegs) * 1.06;

            /*
            OS SEGMENTOS SAO FUNDIDOS, nao sao 560 malhas.

            A primeira versao criava uma `Mesh` por segmento — medidas 280
            pecas de parede e 280 de cobertura, mais ~1680 materiais, porque os
            materiais estavam a ser criados DENTRO do ciclo. Isso sao centenas
            de draw calls por uma geometria que nunca se mexe.

            Junta-se tudo com o `mergeNonIndexedGeometries`, o mesmo que os
            degraus usam (ver o `mergedStepsMesh` mais abaixo): as quatro
            esquinas de um anel passam a ser UMA malha por tipo.
            */
            const aoLongoDoArco = (destino, cx, cz, ang0, raio, dims, y) => {
                for (let j = 0; j <= arcoSegs; j++) {
                    const a = ang0 + (j / arcoSegs) * (Math.PI / 2);
                    const geo = new THREE.BoxGeometry(...dims).toNonIndexed();
                    geo.rotateY(-a);
                    geo.translate(cx + raio * Math.cos(a), y, cz + raio * Math.sin(a));
                    destino.push(geo);
                }
            };
            const geosParedeArco = [], geosCobArco = [];

            const esquinas = [
                [-cornerX, cornerZ, Math.PI / 2],
                [cornerX, cornerZ, 0],
                [-cornerX, -cornerZ, Math.PI],
                [cornerX, -cornerZ, 3 * Math.PI / 2]
            ];
            const avArco = BA.coberturaAvanco;
            const yCobArco = yFim + BA.alturaParede + BA.coberturaEspessura / 2;
            for (const [cx, cz, ang0] of esquinas) {
                // A parede: espessura no RADIAL, comprimento no TANGENCIAL.
                aoLongoDoArco(geosParedeArco, cx, cz, ang0, rArcoFim,
                    [BA.espessuraParede, BA.alturaParede, arcoLen], yParedeMeio);

                if (!BA.cobertura || avArco <= 0) continue;
                /*
                A cobertura da curva avanca para DENTRO, ou seja para um raio
                MENOR — dai o `rArcoFim - avanco/2`.

                A face de baixo NAO leva cor propria aqui, ao contrario da
                cobertura recta: com a geometria fundida numa malha so, um
                material por face deixaria de corresponder as faces certas
                depois da rotacao de cada segmento. Fica a cor do topo, e a
                diferenca nao se nota porque a curva se ve de lado.
                */
                aoLongoDoArco(geosCobArco, cx, cz, ang0, rArcoFim - avArco / 2,
                    [avArco, BA.coberturaEspessura, arcoLen], yCobArco);
            }

            const fundirArco = (geos, mat) => {
                if (!geos.length) return;
                const g = mergeNonIndexedGeometries(geos);
                g.computeVertexNormals();
                const m = new THREE.Mesh(g, mat);
                m.castShadow = true;
                m.receiveShadow = false;   // ver a nota do mergedStepsMesh
                campoGrupo.add(m);
            };
            fundirArco(geosParedeArco, matParede);
            fundirArco(geosCobArco, new THREE.MeshStandardMaterial({
                color: BA.corCobertura, roughness: 0.85
            }));
        }

        /*
        OS HOLOFOTES, no bordo da cobertura do ULTIMO anel e so nas laterais.

        A posicao sai da mesma conta dos aneis: o ultimo anel esta a
        `(N-1) * PASSO_PROF` de profundidade e `(N-1) * PASSO_Y` de altura, e o
        bordo da cobertura dele fica `coberturaAvanco` mais para dentro. Se os
        aneis mudarem, os holofotes acompanham.

        As LAMPADAS sao instanciadas (48 caixas iguais) e as travessas
        fundidas; as LUZES a serio sao uma por conjunto e nao por lampada, que
        seria 48 luzes na cena. Ver Holofotes (config/physics.js).

        Guarda-se tudo em `window.holofotes` para o interruptor dia/noite
        (main.js) poder acender e apagar sem reconstruir nada.
        */
        if (typeof Holofotes !== 'undefined' && Holofotes.activo && BA.cobertura) {
            const H = Holofotes;
            const tUlt = N_ANEIS - 1;
            const profBordo = tUlt * PASSO_PROF + rows * 1.2 - BA.coberturaAvanco;
            const yLuz = tUlt * PASSO_Y + rows * 0.5 + BA.alturaParede;

            const matEstrut = new THREE.MeshStandardMaterial({
                color: H.corEstrutura, roughness: 0.8, metalness: 0.3
            });
            /*
            O material da lampada e guardado a parte: e nele que o interruptor
            mexe (cor e `emissive`), e por ser UM material as 48 lampadas
            acendem todas de uma vez.
            */
            const matLampada = new THREE.MeshStandardMaterial({
                color: H.corLampadaApagada, roughness: 0.4, metalness: 0.2,
                emissive: new THREE.Color(0x000000)
            });

            const geosTravessa = [];
            const posLampadas = [];
            const luzes = [];
            const larguraConj = H.lampadasPorFileira * H.espacoEntreLampadas;

            for (const sinal of [-1, 1]) {
                const xConj = sinal * (BANCADA_X + profBordo);
                for (let f = 0; f < H.fileiras; f++) {
                    // Espalhados ao longo do comprimento, simetricos sobre z=0.
                    const frac = (H.fileiras === 1) ? 0.5 : (f + 0.5) / H.fileiras;
                    const zConj = (frac * 2 - 1) * cornerZ;

                    // A travessa que segura as lampadas.
                    const gt = new THREE.BoxGeometry(
                        H.travessaEspessura, H.travessaEspessura, larguraConj).toNonIndexed();
                    gt.translate(xConj, yLuz - H.lampadaAlt / 2 - H.travessaEspessura / 2, zConj);
                    geosTravessa.push(gt);

                    for (let i = 0; i < H.lampadasPorFileira; i++) {
                        const dz = (i - (H.lampadasPorFileira - 1) / 2) * H.espacoEntreLampadas;
                        posLampadas.push([xConj, yLuz, zConj + dz]);
                    }

                    /*
                    UMA SpotLight POR CONJUNTO, apontada ao centro do campo no
                    z dele: e isso que faz os cones cobrirem o relvado todo em
                    vez de se somarem no meio.

                    `castShadow` fica FALSE: oito luzes com sombra sao oito
                    mapas de sombra por frame, e a sombra do jogo ja vem do
                    `dirLight` (ver main.js). De noite o sol fica com um
                    residuo justamente para as sombras nao desaparecerem.
                    */
                    const luz = new THREE.SpotLight(H.corLuz, 0,
                        H.alcanceLuz, H.anguloLuz, H.penumbra, 1.0);
                    luz.position.set(xConj, yLuz, zConj);
                    luz.target.position.set(0, 0, zConj * 0.5);
                    luz.castShadow = false;
                    campoGrupo.add(luz);
                    campoGrupo.add(luz.target);
                    luzes.push(luz);
                }
            }

            if (geosTravessa.length) {
                const g = mergeNonIndexedGeometries(geosTravessa);
                g.computeVertexNormals();
                const m = new THREE.Mesh(g, matEstrut);
                m.castShadow = false; m.receiveShadow = false;
                campoGrupo.add(m);
            }

            const imL = new THREE.InstancedMesh(
                new THREE.BoxGeometry(H.lampadaLarg, H.lampadaAlt, H.lampadaProf),
                matLampada, posLampadas.length);
            const dL = new THREE.Object3D();
            posLampadas.forEach((pp, i) => {
                dL.position.set(pp[0], pp[1], pp[2]);
                dL.updateMatrix();
                imL.setMatrixAt(i, dL.matrix);
            });
            imL.castShadow = false; imL.receiveShadow = false;
            campoGrupo.add(imL);

            window.holofotes = { luzes, matLampada, lampadas: imL };
        }

        /*
        OS TÚNEIS DE ACESSO, um por corredor e nas quatro bancadas.

        A posição sai da MESMA conta dos corredores (`noCorredor`/
        `CorredoresBancada.espacamento`), portanto uma boca cai exactamente no
        corredor central, sobre a linha do meio-campo, e as outras nos
        corredores seguintes. Se o espaçamento mudar, as bocas acompanham.

        A profundidade e a altura da fila saem da geometria das bancadas: cada
        fila tem 1.2 m de profundidade e 0.5 m de altura (ver os `addStepBox`
        acima), logo o degrau N está a `N * 1.2` para dentro e a
        `0.25 + N * 0.5` de altura. Ver TunelBancada (config/physics.js).
        */
        if (typeof TunelBancada !== 'undefined' && TunelBancada.activo) {
            const TB = TunelBancada;
            const larguraTunel = (typeof CorredoresBancada !== 'undefined')
                ? CorredoresBancada.largura : 2.55;
            const passoTunel = (typeof CorredoresBancada !== 'undefined')
                ? CorredoresBancada.espacamento : 18.7;

            const matTunel = new THREE.MeshStandardMaterial({
                color: TB.cor, roughness: 0.95, metalness: 0.0
            });
            const matMoldura = new THREE.MeshStandardMaterial({
                color: TB.corMoldura, roughness: 0.85
            });
            // Acumuladores: as bocas por orientacao, e as barras todas juntas.
            const bocasPorLado = {};
            const geosMoldura = [];

            /*
            ONDE A FILA `degrau` ESTÁ, e a face que se vê dela.

            Cada `addStepBox` é centrado em `BANCADA + N*1.2` com 1.2 m de
            profundidade, portanto a face da fila N que dá para o CAMPO está
            meio degrau mais perto: `N*1.2 - 0.6`.

            Isto estava errado à primeira: a boca era centrada em `N*1.2` e
            ficava enterrada dentro do degrau — medido, a caixa a 59.5 m com a
            face visível do degrau a 57.4 m, ou seja dois metros de betão à
            frente dela. Não se via nada.

            Agora a face da frente da boca nasce 5 cm À FRENTE dessa face e a
            caixa entra para dentro: só a face da frente fica exposta, e é ela
            que se lê como a entrada do túnel. O resto do volume fica dentro da
            massa dos degraus, escondido.
            */
            const dentro = TB.degrau * 1.2 - 0.6 - (TB.folgaFrente || 0.30);
            const yTunel = 0.25 + TB.degrau * 0.5 + TB.altura / 2;

            /*
            `eixo` diz em que direcção a bancada cresce ('x' nas laterais, 'z'
            nos fundos) e `sinal` para que lado. A boca é sempre uma caixa com
            a LARGURA no eixo do corredor e a PROFUNDIDADE no eixo da bancada.
            */
            const addTunel = (eixo, sinal, base, coordCorredor, dProf, dY) => {
                const prof = TB.profundidade;
                // `dProf`/`dY` deslocam a boca para o anel a que pertence.
                const fora = base + sinal * (dentro + (dProf || 0));
                const yTunelAnel = yTunel + (dY || 0);
                const centroProf = fora + sinal * (prof / 2);

                const dims = (eixo === 'x')
                    ? [prof, TB.altura, larguraTunel]
                    : [larguraTunel, TB.altura, prof];

                /*
                PRETO SO POR DENTRO. A caixa sobressai `folgaFrente` a frente
                do degrau, portanto as faces LATERAIS dela ficam a vista — e
                pintadas de preto liam-se como um bloco negro colado a
                bancada, nao como uma entrada. Relato: *"pinta o tunel por fora
                da cor da arquibancada, deixa preto so dentro"*.

                Um material POR FACE: escuro so na face que da para o campo (e
                a que se ve de frente, o vao do tunel), betao nas outras cinco.
                A ordem dos indices numa BoxGeometry e [+x, -x, +y, -y, +z, -z],
                e a face virada ao campo depende do lado da bancada:

                    lateral Este  (x cresce para fora)  ->  ve-se o -x, indice 1
                    lateral Oeste (x decresce)          ->  ve-se o +x, indice 0
                    fundo Norte   (z cresce)            ->  ve-se o -z, indice 5
                    fundo Sul     (z decresce)          ->  ve-se o +z, indice 4
                */
                const iEscura = (eixo === 'x')
                    ? (sinal > 0 ? 1 : 0)
                    : (sinal > 0 ? 5 : 4);
                /*
                A BOCA E INSTANCIADA, nao e uma Mesh por tunel.

                Eram 48 bocas soltas mais 192 barras de moldura: 240 draw calls
                por geometria que nunca se mexe. As bocas de uma mesma
                orientacao sao a MESMA caixa com a mesma tabela de materiais —
                muda so a posicao —, portanto sao instancias.

                Quatro grupos e nao um: a face escura depende do lado da
                bancada (`iEscura`), e uma InstancedMesh partilha a tabela de
                materiais por todas as instancias. As dimensoes tambem diferem
                entre laterais e fundos, o que daria dois grupos; com a face
                escura sao quatro.
                */
                const chave = eixo + sinal;
                if (!bocasPorLado[chave]) {
                    bocasPorLado[chave] = { dims, iEscura, pos: [] };
                }
                bocasPorLado[chave].pos.push((eixo === 'x')
                    ? [centroProf, yTunelAnel, coordCorredor]
                    : [coordCorredor, yTunelAnel, centroProf]);

                if (!TB.moldura) return;
                /*
                A MOLDURA E UM ANEL, e nao uma placa.

                Estava uma CAIXA CHEIA de `largura + 2e` por `altura + 2e`,
                posta a frente da boca: tapava a abertura toda e o tunel lia-se
                CINZA em vez de escuro. Relato: *"agora ficou cinza"*.

                Sao quatro barras em volta do vao — duas horizontais (por cima e
                por baixo) e duas verticais (aos lados) — e o meio fica aberto,
                que e por onde se ve o escuro da boca.

                Fica a FRENTE da boca: o sinal e negativo em relacao ao
                crescimento da bancada, porque a bancada cresce para fora do
                campo e a moldura sai para dentro.
                */
                const e = TB.espessuraMoldura;
                const espM = 0.12;
                const recuo = fora - sinal * ((TB.folgaMoldura || 0.12) + espM / 2);
                const L = larguraTunel, H = TB.altura;

                // [comprimento ao longo do corredor, altura, desvio lateral, desvio vertical]
                const barras = [
                    [L + e * 2, e, 0, (H + e) / 2],    // por cima
                    [L + e * 2, e, 0, -(H + e) / 2],   // por baixo
                    [e, H, (L + e) / 2, 0],            // lado
                    [e, H, -(L + e) / 2, 0]            // outro lado
                ];
                /*
                AS BARRAS SAO FUNDIDAS numa geometria so. Ao contrario das
                bocas, ha quatro tamanhos diferentes por tunel (duas
                horizontais e duas verticais), portanto instanciar daria oito
                grupos; fundir da UMA malha para as 192 barras, e elas nunca se
                mexem.
                */
                for (const [cL, cH, dLat, dVer] of barras) {
                    const dimsB = (eixo === 'x') ? [espM, cH, cL] : [cL, cH, espM];
                    const g = new THREE.BoxGeometry(...dimsB).toNonIndexed();
                    if (eixo === 'x') g.translate(recuo, yTunelAnel + dVer, coordCorredor + dLat);
                    else g.translate(coordCorredor + dLat, yTunelAnel + dVer, recuo);
                    geosMoldura.push(g);
                }
            };

            // Os centros dos corredores, a mesma conta do `noCorredor`.
            const centros = (limite) => {
                const out = [];
                const k = Math.floor(limite / passoTunel);
                for (let i = -k; i <= k; i++) out.push(i * passoTunel);
                return out;
            };

            /*
            UM CONJUNTO DE BOCAS POR ANEL — pedido: os tuneis tambem no anel
            superior.

            O anel `t` esta `t * PASSO_PROF` mais para dentro e
            `t * PASSO_Y` mais alto (a mesma conta que constroi os degraus), e
            e isso que se soma a base e a altura da boca. No anel de cima o
            degrau 7 fica a ~16.9 m de altura, que e onde um estadio de dois
            aneis tem as entradas do segundo.
            */
            for (let t = 0; t < N_ANEIS; t++) {
                const dProf = t * PASSO_PROF;
                const dY = t * PASSO_Y;
                for (const z of centros(cornerZ)) {
                    addTunel('x', -1, -BANCADA_X, z, dProf, dY);   // Oeste
                    addTunel('x', 1, BANCADA_X, z, dProf, dY);     // Este
                }
                for (const x of centros(cornerX)) {
                    addTunel('z', 1, BANCADA_Z, x, dProf, dY);     // Norte
                    addTunel('z', -1, -BANCADA_Z, x, dProf, dY);   // Sul
                }
            }

            // Uma InstancedMesh por orientacao, com as instancias recolhidas.
            const dummyT = new THREE.Object3D();
            for (const chave of Object.keys(bocasPorLado)) {
                const g = bocasPorLado[chave];
                const mats = [0, 1, 2, 3, 4, 5].map(i =>
                    (i === g.iEscura) ? matTunel : concreteMat);
                const im = new THREE.InstancedMesh(
                    new THREE.BoxGeometry(...g.dims), mats, g.pos.length);
                g.pos.forEach((pp, i) => {
                    dummyT.position.set(pp[0], pp[1], pp[2]);
                    dummyT.updateMatrix();
                    im.setMatrixAt(i, dummyT.matrix);
                });
                im.castShadow = false;
                im.receiveShadow = false;   // ver a nota do mergedStepsMesh
                campoGrupo.add(im);
            }

            if (geosMoldura.length) {
                const gm = mergeNonIndexedGeometries(geosMoldura);
                gm.computeVertexNormals();
                const mm = new THREE.Mesh(gm, matMoldura);
                mm.castShadow = true;
                mm.receiveShadow = false;
                campoGrupo.add(mm);
            }
        }

        // O `cornerX`/`cornerZ` já estão calculados lá em cima, com os recuos:
        // é deles que as rectas tiram até onde vão.
        /*
        AS ESQUINAS, UMA VEZ POR ANEL — pedido: o anel de cima tinha quatro
        buracos nos cantos, porque estas quatro chamadas viviam fora do ciclo
        dos aneis.
        */
        for (let t = 0; t < N_ANEIS; t++) {
            const oP = t * PASSO_PROF;
            const oY = t * PASSO_Y;
            buildCorner(-cornerX, cornerZ, Math.PI / 2, oP, oY);
            buildCorner(cornerX, cornerZ, 0, oP, oY);
            buildCorner(-cornerX, -cornerZ, Math.PI, oP, oY);
            buildCorner(cornerX, -cornerZ, 3 * Math.PI / 2, oP, oY);
        }

        /*
        ADEPTOS. Corre depois de todas as bancadas estarem construídas, porque
        a mescla das duas claques precisa de conhecer os extremos do estádio em
        Z (ver Crowd.claqueEm em js/crowd.js).

        Substitui o `specMesh` — o boneco simplificado de seis caixas com uma
        cor só, que ficou desligado acima (`crowdAllowed = false && ...`). Este
        usa o modelo dos jogadores, na pose sentada, com quatro InstancedMesh —
        um por canal de cor, que é o que permite pele, camisa, calção e cabelo
        independentes na mesma instância.
        */
        if (typeof Crowd !== 'undefined' &&
            (typeof Config === 'undefined' || Config.enableCrowd !== false)) {
            Crowd.build(campoGrupo, lugares);
        }

        /*
        FUNCIONÁRIOS DO ESTÁDIO — o pessoal de colete laranja (ver staff.js).

        Fica aqui, e não junto das placas lá em cima, porque precisa das duas
        geometrias ao mesmo tempo: a da BANCADA (`BANCADA_X`, `cornerX`,
        `RAIO_PRIMEIRA_FILA`, só definidas nesta altura do `createField`) e a
        das PLACAS. Passam-se os números já usados para as construir em vez de
        os repetir — quem mudar o `RECUO_LATERAL` ou o
        `PlacasPublicidade.recuo` arrasta o pessoal com eles.
        */
        const recuoPlacas = (typeof PlacasPublicidade !== 'undefined' &&
            PlacasPublicidade.activo) ? PlacasPublicidade.recuo : 5.0;

        if (typeof Staff !== 'undefined' && typeof FuncionariosEstadio !== 'undefined' &&
            FuncionariosEstadio.activo) {
            Staff.build(campoGrupo, {
                bancadaX: BANCADA_X,
                bancadaZ: BANCADA_Z,
                cantoX: cornerX,
                cantoZ: cornerZ,
                raioPrimeiraFila: RAIO_PRIMEIRA_FILA,
                placaX: MEIA_LARGURA_CAMPO + recuoPlacas,
                placaZ: LINHA_FUNDO + recuoPlacas
            });
        }

        /*
        A GRUA DE TELEVISÃO atrás de cada baliza (ver GruaDeCamera). Sai das
        mesmas medidas das placas, pela mesma razão do `Staff`, mas com o
        interruptor PRÓPRIO: desligar os funcionários não é razão para desligar
        as gruas, que não são gente.
        */
        if (typeof GruasDeCamera !== 'undefined') {
            GruasDeCamera.build(campoGrupo, {
                placaX: MEIA_LARGURA_CAMPO + recuoPlacas,
                placaZ: LINHA_FUNDO + recuoPlacas
            });
        }

        // Geometria fundida das bancadas para mínimo de draw calls
        if (stepGeos.length > 0) {
            const mergedStepsGeo = mergeNonIndexedGeometries(stepGeos);
            mergedStepsGeo.computeVertexNormals();
            const mergedStepsMesh = new THREE.Mesh(mergedStepsGeo, concreteMat);
            /*
            O BETAO DA BANCADA NAO RECEBE SOMBRA — e isso e deliberado.

            Relato: *"so tem umas areas mais escuras"*. A camara de sombra e
            ortografica e cobre +-70 m (ver o `d` no main.js, escolhido pelos
            texels por metro no RELVADO). Com os dois aneis a bancada passou a
            ir a +-94.6 m em x e +-113.6 m em z: mais de metade dela fica FORA
            da caixa, e amostrar o mapa de sombra fora do alcance dele devolve
            o texel da borda — bandas escuras onde nao ha nada a fazer sombra.

            As alternativas e porque nao servem: alargar o `d` para 95 baixaria
            a nitidez no relvado de 14.6 para 10.8 texels/m, e essa nitidez foi
            escolhida a medir (ver a nota do main.js); e nao ha nada por cima
            da bancada que precise de lhe fazer sombra a nao ser a propria
            cobertura, que e o que se perde aqui.

            As cadeiras e os adeptos ja estavam assim (`receiveShadow = false`
            no seatMesh e no specMesh), pela mesma razao.
            */
            mergedStepsMesh.receiveShadow = false;
            mergedStepsMesh.castShadow = false;
            campoGrupo.add(mergedStepsMesh);
        }

        /*
        Barreira de contenção à frente da bancada (ver BarreiraCampo).

        Quatro paredes que se cruzam nos cantos — não é preciso fechar as
        quinas à parte, a sobreposição já as tapa. Cada uma tem duas camadas:
        o painel de publicidade opaco em baixo e a rede de protecção
        translúcida por cima.
        */
        /* (Removido visualmente a pedido do utilizador)
        {
            const BC = BarreiraCampo;
            const matPainel = new THREE.MeshStandardMaterial({
                color: 0x1b3a5c, roughness: 0.8, metalness: 0.0
            });
            const matRede = new THREE.MeshBasicMaterial({
                color: 0xdfe6ec, transparent: true, opacity: 0.14,
                side: THREE.DoubleSide, depthWrite: false
            });
            const alturaRedeReal = BC.alturaRede - BC.alturaPainel;

            const paredeBarreira = (larg, prof, px, pz) => {
                const painel = new THREE.Mesh(
                    new THREE.BoxGeometry(larg, BC.alturaPainel, prof), matPainel);
                painel.position.set(px, BC.alturaPainel / 2, pz);
                painel.receiveShadow = true;
                campoGrupo.add(painel);

                const rede = new THREE.Mesh(
                    new THREE.BoxGeometry(larg, alturaRedeReal, prof * 0.4), matRede);
                rede.position.set(px, BC.alturaPainel + alturaRedeReal / 2, pz);
                campoGrupo.add(rede);
            };

            const compTotal = BC.z * 2;
            const largTotal = BC.x * 2;
            paredeBarreira(0.4, compTotal, -BC.x, 0);
            paredeBarreira(0.4, compTotal, BC.x, 0);
            paredeBarreira(largTotal, 0.4, 0, -BC.z);
            paredeBarreira(largTotal, 0.4, 0, BC.z);
        }
        */

        seatMesh.instanceMatrix.needsUpdate = true;
        if (seatMesh.instanceColor) seatMesh.instanceColor.needsUpdate = true;
        campoGrupo.add(seatMesh);

        specMesh.count = spectatorIndex;
        specMesh.instanceMatrix.needsUpdate = true;
        if (specMesh.instanceColor) specMesh.instanceColor.needsUpdate = true;
        
        campoGrupo.add(specMesh);

        this.specMesh = specMesh;

        this.scene.add(campoGrupo);
    },

    criarBola: function (raio) {
        if (typeof BallMesh !== 'undefined' && BallMesh.partes && BallMesh.partes.length) {
            return this.criarBolaDaMalha(raio);
        }
        console.warn('BallMesh não encontrada — a usar a bola procedural.');
        return this.criarBolaProcedural(raio);
    },

    criarBolaDaMalha: function (raio) {
        const grupo = new THREE.Group();

        /*
        Cores por material do OBJ — o modelo separa os painéis em dois grupos.

        DoubleSide porque o OBJ tem winding inconsistente. Não vale a pena
        "corrigi-lo": 9% das faces são as paredes verticais dos sulcos entre
        painéis, e qualquer regra baseada em "virar tudo para fora do centro"
        estraga exactamente essas. Com DoubleSide o winding deixa de importar,
        e o custo de uma bola de 14 cm no ecrã é nulo.
        */
        const cores = {
            'Bianco': { color: 0xf2f2f2, roughness: 0.55, metalness: 0.03, side: THREE.DoubleSide },
            'Nero.001': { color: 0x1a1a1a, roughness: 0.5, metalness: 0.03, side: THREE.DoubleSide }
        };

        for (const parte of BallMesh.partes) {
            const geo = new THREE.BufferGeometry();
            const pos = BallMesh.posicoes(parte, raio);
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setIndex(new THREE.BufferAttribute(BallMesh.indices(parte), 1));

            /*
            Normais analíticas em vez de computeVertexNormals(): a bola está
            centrada na origem, por isso a normal de cada vértice é a própria
            posição normalizada. É exacta na superfície dos painéis, aproximada
            nas paredes dos sulcos (9% das faces, 2.6 mm de profundidade — não
            se vê a esta escala), e não depende do winding, que no OBJ vem
            inconsistente. computeVertexNormals() daria lixo por causa disso.
            */
            const nrm = new Float32Array(pos.length);
            for (let i = 0; i < pos.length; i += 3) {
                const d = Math.hypot(pos[i], pos[i + 1], pos[i + 2]) || 1;
                nrm[i] = pos[i] / d; nrm[i + 1] = pos[i + 1] / d; nrm[i + 2] = pos[i + 2] / d;
            }
            geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
            geo.computeBoundingSphere();

            const cor = cores[parte.material] ||
                { color: 0xcccccc, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide };
            const malha = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(cor));
            malha.castShadow = true; malha.receiveShadow = true;
            grupo.add(malha);
        }

        return grupo;
    },

    criarBolaProcedural: function (raio) {
        const cvsBola = document.createElement('canvas'); cvsBola.width = 512; cvsBola.height = 256;
        const ctxBola = cvsBola.getContext('2d');
        ctxBola.fillStyle = '#ffffff'; ctxBola.fillRect(0, 0, 512, 256);
        ctxBola.fillStyle = '#1a1a1a';
        const pentagons = [
            [128, 64], [384, 64], [64, 192], [256, 192], [448, 192],
            [192, 128], [320, 128], [128, 64], [384, 64]
        ];
        for (const [cx, cy] of pentagons) {
            ctxBola.beginPath();
            for (let i = 0; i < 5; i++) {
                const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
                const px = cx + 28 * Math.cos(a);
                const py = cy + 28 * Math.sin(a);
                if (i === 0) ctxBola.moveTo(px, py); else ctxBola.lineTo(px, py);
            }
            ctxBola.closePath(); ctxBola.fill();
        }
        ctxBola.strokeStyle = '#cccccc'; ctxBola.lineWidth = 1.5;
        for (const [cx, cy] of pentagons) {
            for (let i = 0; i < 5; i++) {
                const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
                ctxBola.beginPath();
                ctxBola.moveTo(cx + 28 * Math.cos(a), cy + 28 * Math.sin(a));
                ctxBola.lineTo(cx + 44 * Math.cos(a), cy + 44 * Math.sin(a));
                ctxBola.stroke();
            }
        }
        const texBola = new THREE.CanvasTexture(cvsBola);
        texBola.wrapS = THREE.RepeatWrapping; texBola.wrapT = THREE.ClampToEdgeWrapping;
        const malha = new THREE.Mesh(
            new THREE.SphereGeometry(raio, 32, 32),
            new THREE.MeshStandardMaterial({ map: texBola, roughness: 0.55, metalness: 0.05 })
        );
        malha.castShadow = true; malha.receiveShadow = true;
        return malha;
    },

    /*
    A EQUIPA ESCOLHIDA, ou nada. `Match.equipaIdA`/`equipaIdB` guardam o id de
    `data/squads.js` (ver tools/gen_squads.js); sem eles — ou sem o ficheiro
    carregado — o jogo continua com os 22 de sempre do `player_skills.js`.
    */
    /*
    AS EQUIPAS POR OMISSÃO, por NOME e não por id: os ids vêm do ficheiro de
    origem e o `data/squads.js` é regerado sempre que esses dados mudarem —
    um id escrito à mão aqui ficaria a apontar para outra equipa qualquer, ou
    para nenhuma, sem ninguém dar por isso. O nome resolve-se no arranque
    (ver `equipasPorOmissao`), e se não existir fica-se com as genéricas.
    */
    equipaNomeOmissaoA: 'Grêmio-RS',
    equipaNomeOmissaoB: 'Internacional-RS',

    equipaIdA: null,
    equipaIdB: null,

    /*
    Resolve os nomes por omissão em ids, uma vez, antes do `createTeams`.
    Chamado pelo `init`; quem quiser outras equipas mexe nos selectores do
    painel ou chama o `trocarEquipas` directamente.
    */
    equipasPorOmissao: function () {
        if (typeof SquadsData === 'undefined' || !SquadsData.equipas) return;
        const idDe = (nome) => {
            const e = SquadsData.equipas.find(x => x.nome === nome);
            return e ? e.id : null;
        };
        if (this.equipaIdA === null) this.equipaIdA = idDe(this.equipaNomeOmissaoA);
        if (this.equipaIdB === null) this.equipaIdB = idDe(this.equipaNomeOmissaoB);
    },

    equipaDoPlantel: function (id) {
        if (typeof SquadsData === 'undefined' || !SquadsData.equipas) return null;
        if (id === null || id === undefined) return null;
        return SquadsData.equipas.find(e => e.id === id) || null;
    },

    /*
    O ONZE da formação activa, a partir do plantel.

    A escolha em si vive em `escolherOnzeDaFormacao` (js/config/skill_map.js),
    partilhada com o conversor dos planteis e com o teste — é a mesma regra nos
    três, e a razão de ser gulosa global está explicada lá.

    Escolhe-se UMA VEZ, no `createTeams`. Mudar a formação a meio do jogo move
    os mesmos onze pelo campo — não troca de gente, que é o que um treinador
    faz. Para trocar de gente há a troca de equipa, que recomeça o jogo.
    */
    escolherOnze: function (plantel, formacaoKey) {
        if (typeof escolherOnzeDaFormacao !== 'function') return null;
        const fData = FormationsData[formacaoKey || '442'] || FormationsData['442'];
        return escolherOnzeDaFormacao(plantel, fData.map(f => f.pos));
    },

    /*
    TROCA DE EQUIPAS EM JOGO.

    Recriar os bonecos é o caminho curto e o certo: as skills são lidas por
    `p.skills` em dezenas de sítios e meia dúzia de sistemas guardam
    referências a jogadores (marcações, o portador da bola, os alvos do bloco).
    Substituir os dados por baixo deles deixava ponteiros para gente que já
    não joga; deitar os bonecos fora e montar de novo não deixa nenhum.

    `ids` pode trazer só um dos lados — o outro fica como está.
    */
    trocarEquipas: function (ids) {
        if (!this.scene) return;
        if (ids && 'A' in ids) this.equipaIdA = ids.A;
        if (ids && 'B' in ids) this.equipaIdB = ids.B;

        /*
        OS EXPULSOS TAMBÉM. Eles não estão nas listas — o cartão vermelho
        tira-os de lá e guarda-os no `Match.expulsos`, e o `reporExpulsos`
        (chamado pelo `resetPlay` aqui em baixo) volta a metê-los na lista da
        equipa deles. Sem os limpar aqui, o primeiro jogo com uma expulsão
        envenenava o seguinte: os bonecos antigos eram devolvidos às listas
        NOVAS, ficava uma equipa com doze, e dois deles eram fantasmas sem
        modelo na cena.
        */
        const todos = [...this.players, ...this.opponents, ...(this.expulsos || [])];
        for (const p of todos) {
            /*
            Tudo o que o jogador pôs na cena, e não só o boneco: os anéis do
            debug e a linha do alvo são filhos da CENA e não do modelo (para
            não subirem com ele no salto), portanto não saem com o `model`.
            Sem isto a cena crescia 88 objectos por jogo num lote.
            */
            for (const obj of [p.model, p.discoTatico, p.btTargetGroup, p.btLine,
                p.positionTargetGroup, p.styleTargetGroup]) {
                if (obj) this.scene.remove(obj);
            }
        }
        if (this.expulsos) this.expulsos.length = 0;
        this.players = [];
        this.opponents = [];

        this.createTeams();
        this.esquecerJogadoresAntigos(todos);
        this.resetPlay();
        if (typeof MatchStats !== 'undefined' && MatchStats.reset) MatchStats.reset();

        /*
        QUEM MOSTRA JOGADORES TEM DE SABER QUE ELES MUDARAM.

        O painel "Player Skills" é montado uma vez (as skills eram fixas) e o
        modal do jogador guarda a referência do boneco que estava aberto — os
        dois ficavam a mostrar o elenco anterior. O evento avisa-os, e serve
        qualquer origem da troca: os selectores do painel, a consola, ou o
        lote de jogos.
        */
        if (typeof EventBus !== 'undefined') {
            EventBus.emit('TEAMS_CHANGED', { A: this.equipaInfoA, B: this.equipaInfoB });
        }
    },

    /*
    APAGA AS REFERÊNCIAS AOS JOGADORES QUE JÁ NÃO JOGAM.

    O `Match` guarda jogadores em dezenas de campos — o portador, o receptor
    do passe, o batedor, os perseguidores, o plano da saída de bola, a barreira
    da falta. Trocar as listas não limpa nenhum deles, e um deles é o suficiente
    para partir o jogo seguinte: medido num lote, um jogo acabou em GOAL, o
    `saidaPlano` guardou o batedor desse jogo, e o `resetPlay` do jogo SEGUINTE
    reutilizou-o — o jogo inteiro passou com a bola no meio-campo, agarrada a um
    boneco que já não estava na cena. Zero passes em 18 minutos.

    Varre-se o objecto inteiro em vez de listar os campos à mão: a lista à mão
    fica desactualizada no dia em que alguém acrescentar mais um campo, e o
    defeito volta calado.
    */
    esquecerJogadoresAntigos: function (antigos) {
        if (!antigos || !antigos.length) return;
        const fora = new Set(antigos);
        const ehAntigo = (v) => v && typeof v === 'object' && fora.has(v);

        for (const chave of Object.keys(this)) {
            if (chave === 'players' || chave === 'opponents') continue;
            const v = this[chave];
            if (!v || typeof v !== 'object') continue;

            if (ehAntigo(v)) { this[chave] = null; continue; }

            if (Array.isArray(v)) {
                if (v.some(ehAntigo)) this[chave] = v.filter(x => !ehAntigo(x));
                continue;
            }

            // Planos e lances guardam jogadores lá dentro (saidaPlano.taker,
            // cantoVivo.equipa, faltaDirectaPlano...). Um plano com gente que
            // já não joga não se conserta: deita-se fora inteiro.
            for (const sub of Object.keys(v)) {
                const filho = v[sub];
                if (ehAntigo(filho) || (Array.isArray(filho) && filho.some(ehAntigo))) {
                    this[chave] = null;
                    break;
                }
            }
        }
    },

    createTeams: function () {
        // Skills fixas (data/player_skills.js) — atribuídas por ÍNDICE, não
        // por posição da formação: a formação pode mudar (442/433/4231),
        // mas o elenco (jogador 0..10) é sempre o mesmo, ver
        // tools/gen_player_skills.js.
        //
        // Com uma equipa real escolhida (ver equipaIdA/equipaIdB), o onze vem
        // do plantel dela e estes ficam por usar.
        const equipaA = this.equipaDoPlantel(this.equipaIdA);
        const equipaB = this.equipaDoPlantel(this.equipaIdB);
        const onzeA = equipaA ? this.escolherOnze(equipaA.plantel, Tatics.formacaoA || '442') : null;
        const onzeB = equipaB ? this.escolherOnze(equipaB.plantel, Tatics.formacaoB || '442') : null;
        this.equipaInfoA = onzeA ? equipaA : null;
        this.equipaInfoB = onzeB ? equipaB : null;

        const skillsA = onzeA || ((typeof PlayerSkillsData !== 'undefined') ? PlayerSkillsData.teamA : null);
        const skillsB = onzeB || ((typeof PlayerSkillsData !== 'undefined') ? PlayerSkillsData.teamB : null);

        /*
        O EQUIPAMENTO E DO CLUBE, e nao do lado do campo.

        Pedido, com fotografias das camisolas do Flamengo e do Fluminense. Os
        planteis ja eram reais (data/squads.js) e os equipamentos nao: o TeamA
        era azul e o TeamB vermelho, escolhesse-se quem se escolhesse.

        `uniformeDe` (config/uniformes.js) devolve o desenho do clube pelo nome
        com que ele vem nos dados, ou `null` — e o null mantem o azul e o
        vermelho de sempre em quem nao tem desenho feito.

        O GUARDA-REDES FICA DE FORA (o `i === 0`): veste de outra cor por
        regra, para se distinguir dos dez e dos outros onze. Um equipamento de
        guarda-redes por clube e outro pedido.

        Mas leva o uniforme DELE (`UniformeGuardaRedes`), que e o que lhe da a
        manga comprida — ver config/uniformes.js. Sem `camisa` nem `calcao` lá
        dentro, as cores continuam a ser as que estas duas linhas lhe dao.
        */
        const uniGK = (typeof UniformeGuardaRedes !== 'undefined')
            ? UniformeGuardaRedes : null;
        const uniA = (typeof uniformeDe === 'function' && this.equipaInfoA)
            ? uniformeDe(this.equipaInfoA.nome) : null;
        const uniB = (typeof uniformeDe === 'function' && this.equipaInfoB)
            ? uniformeDe(this.equipaInfoB.nome) : null;

        for (let i = 0; i < 11; i++) {
            let corCamisa = (i === 0) ? '#f1c40f' : '#3498db';
            let corCalcao = (i === 0) ? '#1e1b18' : '#34495e';
            let p = new FootballPlayer(i, corCamisa, corCalcao, 'TeamA',
                (i === 0) ? uniGK : uniA);
            p.skills = skillsA ? skillsA[i] : null;
            // O estilo que o jogador traz nos dados manda sobre o estilo por
            // omissão da posição — ver aplicarPlayingStyle.
            p.playingStyleFixo = (p.skills && p.skills.estilo) ? p.skills.estilo : null;
            this.players.push(p);
            this.scene.add(p.model);
        }

        for (let i = 0; i < 11; i++) {
            let corCamisa = (i === 0) ? '#e67e22' : '#e74c3c';
            let corCalcao = (i === 0) ? '#111111' : '#ffffff';
            let p = new FootballPlayer(i + 20, corCamisa, corCalcao, 'TeamB',
                (i === 0) ? uniGK : uniB);
            p.skills = skillsB ? skillsB[i] : null;
            p.playingStyleFixo = (p.skills && p.skills.estilo) ? p.skills.estilo : null;
            this.opponents.push(p);
            this.scene.add(p.model);
        }

        this.assignFormations();
    },

    /*
    ONDE CADA JOGADOR SE POE NA SAIDA DE BOLA.

    Uma so conta, lida por tres sitios: a caminhada de volta ao meio-campo
    depois do golo (goalSequenceStage, em match_physics.js), o teste de "ja
    chegaram?" dessa caminhada, e o proprio setupKickoff. Estava escrita duas
    vezes, e por isso a caminhada podia apontar para um ponto e a montagem do
    kickoff para outro — o jogador andava e depois era teletransportado na
    mesma.

    `dir` e o sentido de ataque da equipa: o campo de defesa e o lado oposto,
    e e por isso que o clamp usa z*dir <= -margem.
    */
    posicaoDeSaida: function (p, dir) {
        const margem = 1.5;
        if (p.role === 'gk') return { x: 0, z: -48 * dir };

        let z = p.baseTarget.z;
        if (p.role === 'def') {
            // Linha de defesa respeita o ajuste "Linha Defensiva" do painel
            // tambem na saida, nao so durante o jogo — TeamShape.linhaDefensiva
            // esta no referencial de ataque, por isso converte para mundo por *dir.
            const cap = TeamShape.linhaDefensiva[Tatics.linhaDefensiva] ?? TeamShape.linhaDefensiva.medium;
            z = cap * dir;
        }
        if (z * dir > -margem) z = -margem * dir;   // força para o campo de defesa
        return { x: p.baseTarget.x, z: z };
    },

    /*
    A CAMINHADA DE VOLTA AO MEIO-CAMPO, depois do golo.

    O `goalSequenceStage` sempre esperou que toda a gente estivesse "proxima da
    posicao" — mas ninguem lhes escrevia essa posicao: o nivel 2 nao corre fora
    do PLAY (ver `nivel2Activo`), o ramo `BolaParada` da arvore poe-nos em IDLE
    no estado GOAL, e o teste de chegada dava sempre falso. Passados os 3 s do
    timeout o `setupKickoff` teletransportava os 22.

    Aqui escreve-se o alvo TODOS OS FRAMES enquanto o golo esta a ser
    festejado, e o MOVE_TO_POS leva-os la a pe. Quem sobrar longe no fim
    continua a ser colocado a mao pelo setupKickoff — a saida nao pode ficar
    refem de um jogador preso.
    */
    caminharParaSaida: function () {
        const plano = this.planoDeSaida(this.nextKickoffTeam);
        const raioCirculo = 9.15 + 0.5;

        [{ list: this.players, dir: 1 }, { list: this.opponents, dir: -1 }].forEach(({ list, dir }) => {
            list.forEach(p => {
                if (!p || p.role === 'gk') return;   // o GK volta pela lerp do updateGK

                let alvo;
                if (plano && p === plano.taker) alvo = plano.takerPos;
                else if (plano && p === plano.apoio) alvo = plano.apoioPos;
                else {
                    alvo = this.posicaoDeSaida(p, dir);
                    /*
                    O CÍRCULO CENTRAL É DE QUEM DÁ A SAÍDA. Quem não a dá é
                    empurrado para fora dele — a mesma conta do setupKickoff,
                    feita aqui para ele CAMINHAR para fora em vez de ser
                    empurrado no último frame.
                    */
                    if (plano && p.team !== plano.team) {
                        const d = Math.hypot(alvo.x, alvo.z);
                        if (d < raioCirculo && d > 0.001) {
                            const k = raioCirculo / d;
                            alvo = { x: alvo.x * k, z: alvo.z * k };
                        }
                    }
                }

                if (!p.dynamicTarget) p.dynamicTarget = new THREE.Vector3();
                p.dynamicTarget.set(alvo.x, ALTURA_BASE_Y, alvo.z);
                p.hasBall = false;
                if (p.fsm.currentState !== 'MOVE_TO_POS') p.fsm.changeState('MOVE_TO_POS');
            });
        });
    },

    /*
    QUEM DÁ A SAÍDA, E ONDE — decidido UMA vez e guardado.

    O batedor e o apoio eram escolhidos dentro do `setupKickoff`, no instante em
    que a bola volta ao centro: a caminhada de volta (acima) não tinha como
    saber quem eles eram e mandava-os para o posto da formação, de onde eram
    depois colocados à mão no círculo. Eram os dois únicos saltos que sobravam
    da caminhada — medidos até 21 m.

    O sorteio do apoio (a posição à volta do batedor) também tem de ser feito
    uma vez só: sorteado outra vez na montagem, o ponto mudava debaixo dos pés
    de quem já lá tinha chegado.

    `equipa` a null significa "ainda não há equipa decidida" (arranque de jogo,
    intervalo) — aí não há plano nenhum e toda a gente vai para o posto.
    */
    planoDeSaida: function (equipa) {
        if (!equipa) return null;
        if (this.saidaPlano && this.saidaPlano.team === equipa) return this.saidaPlano;

        const startA = (equipa === 'TeamA');
        const takerList = startA ? this.players : this.opponents;
        const attDir = startA ? 1 : -1;

        const atacantes = takerList.filter(p => p.role === 'atk');
        const taker = atacantes[0] || takerList.find(p => p.role !== 'gk');

        // Apoio sorteado entre o outro atacante e os meio-campistas — cada
        // saída escolhe um companheiro diferente, não sempre o mesmo.
        const candidatosApoio = takerList.filter(p => p !== taker && (p.role === 'atk' || p.role === 'mid'));
        const apoio = candidatosApoio.length
            ? candidatosApoio[Math.floor(Math.random() * candidatosApoio.length)]
            : takerList.find(p => p.role === 'mid');

        this.saidaPlano = {
            team: equipa,
            startA: startA,
            attDir: attDir,
            taker: taker,
            apoio: apoio,
            // Encostado à bola (~0.4 m), do lado do campo dele.
            takerPos: { x: 0, z: attDir * 0.4 },
            // Perto do batedor, mas nunca no mesmo sítio duas saídas seguidas.
            apoioPos: { x: (Math.random() - 0.5) * 6, z: -attDir * (3 + Math.random() * 3) }
        };
        return this.saidaPlano;
    },

    assignFormations: function () {
        let compMult = 0.8;
        if (Tatics.compactness) {
            if (Tatics.compactness === 'large') compMult = 1.0;
            else if (Tatics.compactness === 'short') compMult = 0.6;
        }

        const fDataA = FormationsData[Tatics.formacaoA || '442'];
        const fDataB = FormationsData[Tatics.formacaoB || '442'];

        const processTeam = (teamList, fData, isTeamA) => {
            /*
            O NÚMERO DA CAMISOLA é o do jogador, quando os dados o trazem. Só
            vale se for único DENTRO deste onze: o plantel tem 60 jogadores e
            dois deles podem partilhar o 0 (o ficheiro de origem usa o 0 para
            "sem número"). Onde não dá, fica o número da formação, que é o que
            havia antes.
            */
            const contagemNum = {};
            for (let i = 0; i < 11; i++) {
                const n = teamList[i].skills && teamList[i].skills.numero;
                if (n) contagemNum[n] = (contagemNum[n] || 0) + 1;
            }

            const campo = fData.filter(f => f.role !== 'gk');
            const zMin = Math.min(...campo.map(f => f.z));
            const zMax = Math.max(...campo.map(f => f.z));
            const zSpan = (zMax - zMin) || 1;
            const contagemPos = {};

            for (let i = 0; i < 11; i++) {
                const uVal = isTeamA ? (fData[i].x + 1) / 2 : (-fData[i].x + 1) / 2;
                const slot = (fData[i].role === 'gk') ? null : {
                    u: uVal,
                    v: (fData[i].z - zMin) / zSpan
                };

                const x = isTeamA ? fData[i].x : -fData[i].x;
                const z = isTeamA ? fData[i].z : -fData[i].z;

                teamList[i].baseTarget.set(x * (CAMPO_LARG / 2) * compMult, ALTURA_BASE_Y, z * (CAMPO_COMP / 2));
                teamList[i].role = fData[i].role;
                teamList[i].slot = slot;
                const numReal = teamList[i].skills && teamList[i].skills.numero;
                const num = (numReal && contagemNum[numReal] === 1) ? numReal : fData[i].num;
                teamList[i].updateShirt(num, fData[i].pos);
                
                const idxPos = contagemPos[fData[i].pos] || 0;
                contagemPos[fData[i].pos] = idxPos + 1;
                this.aplicarPlayingStyle(teamList[i], fData[i].pos, idxPos);
                
                if (fData[i].role === 'gk') {
                    teamList[i].gkStyleBase = isTeamA ? 'offensive' : 'defensive';
                    teamList[i].playingStyle = isTeamA ? 'offensive_gk' : 'defensive_gk';
                }
            }
        };

        processTeam(this.players, fDataA, true);
        processTeam(this.opponents, fDataB, false);
    },

    aplicarPlayingStyle: function (p, pos, idxPos) {
        if (typeof PlayingStyles === 'undefined') return;

        let chave = p.playingStyleFixo;
        if (!chave || !estiloValidoPara(chave, pos)) {
            const omissao = EstiloPorOmissao[pos];
            chave = Array.isArray(omissao) ? omissao[(idxPos || 0) % omissao.length] : omissao;
        }
        if (!chave || !PlayingStyles[chave]) chave = null;
        p.playingStyle = chave;
        // Por padrão os estilos começam ligados para espelhar o painel (Teams States: ON).
        if (p.playingStyleDesligado === undefined) {
            p.playingStyleDesligado = (typeof window.allPlayingStylesEnabled !== 'undefined') ? !window.allPlayingStylesEnabled : false;
        }
        // Espelhos para os sistemas que já existiam antes do catálogo.
        if (pos === 'LB' || pos === 'RB') {
            if (chave === 'defensive_fullback') p.fbStyle = 'defensive';
            else if (chave === 'fullback_finisher') p.fbStyle = 'finisher';
            else p.fbStyle = 'offensive';
        }
        if (pos === 'GK') {
            p.gkStyleBase = (chave === 'offensive_gk') ? 'offensive' : 'defensive';
        }
    },

    resetPlay: function (forcingKickoffTeam = null) {
        this.mudarEstado('PLAY', 'reset_play'); this.ballVel.set(0, 0, 0);

        /*
        Disciplina zerada e expulsos de volta ao plantel. O `Sim` chama isto
        entre jogos do lote (js/simulate.js), e sem esta reposicao as
        expulsoes acumulavam-se de jogo para jogo ate as equipas ficarem sem
        gente.
        */
        this.reporExpulsos();
        [...this.players, ...this.opponents].forEach(p => { p.temAmarelo = false; });
        if (typeof Officials !== 'undefined') Officials.resetFaltas();

        this.intendedReceiver = null;
        this.passTargetPos = null;
        this.chaserA = null;
        this.chaserB = null;
        this.setPieceTaker = null;
        this.setPieceTimer = 0;
        this.recuoParaGR = null;
        this.ultimoToque = null;
        this.peitosSeguidos = 0;
        // O lance da falta morre com a jogada: sem isto o plano sobrevivia ao
        // reset e o salto da barreira disparava no lance seguinte.
        this.faltaDirectaPlano = null;
        this.freeKickDip = null;
        (this.faltaDirectaBarreira || []).forEach(p => { p.naBarreiraFalta = false; });
        this.faltaDirectaBarreira = null;
        [...this.players, ...this.opponents].forEach(p => { p.jostleAncora = null; });
        this.counterAttackTeam = null;
        this.counterAttackTimer = 0;
        this.goalSequenceStage = undefined;
        this.tempoParada = 0;

        document.getElementById('alerta-golo').style.opacity = '0';
        window.bolaChutada = false;

        this.ball.position.set(0, BallPhysics.raio, 0);

        /*
        Os guarda-redes voltam pela lerp do `updateGK` durante o estado GOAL
        (ver alvoGkX/alvoGkZ em player.js), por isso valem-lhes as mesmas
        contas dos outros: quem já lá está fica, quem ficou longe é colocado.
        */
        [{ gk: this.players[0], z: -48 }, { gk: this.opponents[0], z: 48 }].forEach(({ gk, z }) => {
            if (!gk) return;
            if (Math.hypot(gk.model.position.x, gk.model.position.z - z) > TOLERANCIA_SAIDA) {
                gk.model.position.set(0, ALTURA_BASE_Y, z);
            }
            lookAtBola(gk.model, this.ball.position);
            gk.fsm.changeState('IDLE');
        });

        // Reset do estado por-instância de cada GK. Kickoff pode interromper
        // um GR a meio dos 8s de segurando — sem isto o gkHoldingBall ficava
        // preso em true (só GK_RELEASE_BALL, disparado no fim normal do
        // timer, o desligava) e afastarDoGuardaRedes/commit continuavam a
        // achar que ele tinha a bola na mão depois do reposicionamento.
        this.gkHoldingBall.TeamA = false;
        this.gkHoldingBall.TeamB = false;
        [this.players[0], this.opponents[0]].forEach(gk => {
            if (gk) {
                gk.gkEstado = 'idle';
                gk.gkTempoMergulho = 0;
                gk.gkDirMergulho = 0;
                gk.gkTipoMergulho = 'baixo';
                gk.gkReagiu = false;
                gk.gkDelayReacao = 0;
                // Tiro de meta interrompido a meio (golo do outro lado, etc.).
                gk.gkKickAction = null;
                gk.gkKickTipo = null;
                gk.gkKickBlend = null;
                gk.gkTiroFase = 0;
                gk.gkTiroAlvo = null;
            }
        });
        this.golKickProntos = false;
        this.golKickEspera = 0;
        this.golKickAlvoEspera = 0;
        this.golKickPendente = false;
        this.golKickAtrasoInicio = 0;
        this.lateralPendente = false;
        this.lateralAtraso = 0;
        this.cantoBolaAlvo = null;
        this.cantoAguardaChao = false;
        this.cantoBolaAtraso = 0;
        this.faltaPendente = false;
        this.faltaAtraso = 0;
        this.penaltiPendente = false;
        this.penaltiAtraso = 0;
        [...this.players, ...this.opponents].forEach(p => {
            p.lateralAction = null;
            p.lateralLargou = false;
        });
        this.golKickBolaAtraso = 0;
        this.golKickBolaAlvo = null;
        this.golKickAguardaChao = false;

        // dirA/dirB: sentido de ataque de cada equipa. O campo de defesa é o
        // lado oposto — por isso o clamp abaixo usa z*dir <= -margem.
        [{ list: this.players, dir: 1 }, { list: this.opponents, dir: -1 }].forEach(({ list, dir }) => {
            list.forEach(p => {
                p.isCross = false;
                if (p.role !== 'gk') {
                    const alvo = this.posicaoDeSaida(p, dir);
                    /*
                    QUEM JA LA CHEGOU A PE FICA ONDE ESTA.

                    Depois do golo os 22 caminham para ca (ver
                    `caminharParaSaida`); teletransporta-los na mesma apagava a
                    caminhada toda no ultimo frame — era o que se via. O
                    `TOLERANCIA_SAIDA` e a folga que se aceita: dois metros ao
                    lado do posto nao valem um salto, e ninguem esta em posicao
                    irregular por causa deles (o campo de defesa ja e garantido
                    pela caminhada, que persegue este mesmo ponto).

                    Quem ficou longe — inicio de jogo, intervalo, um jogador
                    preso — continua a ser colocado a mao.
                    */
                    const longe = Math.hypot(p.model.position.x - alvo.x, p.model.position.z - alvo.z) > TOLERANCIA_SAIDA;
                    if (longe) p.model.position.set(alvo.x, ALTURA_BASE_Y, alvo.z);
                    p.hasBall = false;
                    // Sem isto ficavam com a rotação da jogada anterior — de
                    // costas, de lado, o que calhasse — em vez de virados
                    // para a bola antes do kickoff.
                    lookAtBola(p.model, this.ball.position);
                }
                // dynamicTarget é o que o MOVE_TO_POS persegue (steerArrive);
                // sem isto ele ficava com o alvo antigo da jogada anterior e
                // saía a correr para lá assim que o update() volta a chamar
                // p.update(dt), mesmo com o runTeamAI travado no kickoff.
                p.dynamicTarget = p.model.position.clone();
                p.fsm.changeState('MOVE_TO_POS');
                p.speedMult = 3.5;
            });
        });

        /*
        Sorteio do time que dá a saída, ou usa o time forçado. O plano (quem
        bate, quem apoia e onde) pode JÁ existir da caminhada de volta ao
        meio-campo — reutilizá-lo é o que evita que os dois sejam
        teletransportados para o sítio para onde acabaram de andar.
        */
        const equipaDaSaida = forcingKickoffTeam || ((Math.random() < 0.5) ? 'TeamA' : 'TeamB');
        const plano = this.planoDeSaida(equipaDaSaida);
        const startA = plano.startA;
        const attDir = plano.attDir;
        const taker = plano.taker;
        const apoio = plano.apoio;

        if (taker) {
            // Ele é quem dá a saída — pode ficar no campo de ataque, encostado
            // à bola (~0.4m), diferente do resto da equipa que fica atrás.
            if (Math.hypot(taker.model.position.x - plano.takerPos.x,
                taker.model.position.z - plano.takerPos.z) > TOLERANCIA_SAIDA) {
                taker.model.position.set(plano.takerPos.x, ALTURA_BASE_Y, plano.takerPos.z);
            }
            taker.fsm.changeState('IDLE');
        }
        if (apoio) {
            // Posição sorteada uma vez no plano — perto do taker, mas nunca igual.
            if (Math.hypot(apoio.model.position.x - plano.apoioPos.x,
                apoio.model.position.z - plano.apoioPos.z) > TOLERANCIA_SAIDA) {
                apoio.model.position.set(plano.apoioPos.x, ALTURA_BASE_Y, plano.apoioPos.z);
            }
            apoio.fsm.changeState('IDLE');
            lookAtBola(apoio.model, this.ball.position);
            // alvoDePasse mira o tacticalTarget do BT (posição da jogada
            // ANTERIOR, ainda não recalculada) em vez de onde ele está agora
            // — sem isto o passe de saída ia para o meio do campo adversário.
            apoio.tacticalTarget = apoio.model.position.clone();
        }
        if (taker) lookAtBola(taker.model, apoio ? apoio.model.position : this.ball.position);

        // Time que NÃO dá a saída fica todo fora do círculo central — só o
        // taker (e o apoio, na prática) podem ficar perto da bola.
        const raioCirculo = 9.15 + 0.5;
        const naoKickList = startA ? this.opponents : this.players;
        naoKickList.forEach(p => {
            if (p.role === 'gk') return;
            const pos = p.model.position;
            const dist = Math.hypot(pos.x, pos.z);
            if (dist < raioCirculo && dist > 0.001) {
                const k = raioCirculo / dist;
                pos.x *= k; pos.z *= k;
                p.dynamicTarget = pos.clone();
            }
        });

        this.ballCarrier = taker || takerList[0];
        this.lastTouchedTeam = startA ? 'TeamA' : 'TeamB';
        this.lastTouchedPlayer = this.ballCarrier;
        if (this.ballCarrier) this.ballCarrier.hasBall = true;

        // Trava o jogo uns segundos antes do toque inicial: ninguém circula
        // livremente pelo campo (runTeamAI/BT não corre) até o timer zerar,
        // e aí o "taker" toca para o apoio — isso é que dá o pontapé de saída.
        this.kickoffActive = true;
        this.kickoffTimer = ESPERA_APOS_REPOSICAO;
        /*
        O apito da saída não é dado aqui: é dado `APITO_ANTES_DA_SAIDA`
        segundos antes do toque, no update do kickoff. Apitar na montagem
        punha-o os 3 s inteiros antes da bola sair — ouvia-se como um apito
        solto, sem relação com o lance. O árbitro apita e a bola sai a
        seguir.
        */
        this.kickoffApitado = false;
        this.kickoffTaker = taker;
        this.kickoffApoio = apoio;
        this.kickoffTeam = startA ? 'TeamA' : 'TeamB';
        this.kickoffPendingPassToDef = true;
        this.kickoffPassToDefTimer = KICKOFF_PRAZO_PASSE_DEFESA;
        // O plano morre com a saída que o usou: a próxima escolhe de novo.
        this.saidaPlano = null;
    },

    reporExpulsos: function () {
        if (!this.expulsos || !this.expulsos.length) return;
        for (const p of this.expulsos) {
            p.expulso = false;
            p.temAmarelo = false;
            if (p.model) p.model.visible = true;
            const lista = (p.team === 'TeamA') ? this.players : this.opponents;
            const idx = (typeof p.indiceNaFormacao === 'number')
                ? Math.min(p.indiceNaFormacao, lista.length) : lista.length;
            lista.splice(idx, 0, p);
        }
        this.expulsos.length = 0;
    },
});
