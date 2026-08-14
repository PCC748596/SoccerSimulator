const Match = {
    scene: null, ball: null, ballVisual: null, ballVel: new THREE.Vector3(),
    players: [], opponents: [], ballCarrier: null, intendedReceiver: null, state: 'PLAY',
    tempoParada: 0, delta: 0,
    placarA: 0, placarB: 0, tempoDeJogo: 0,
    chaserA: null, chaserB: null,
    possessionTeam: null, possessionTimer: 0,
    lastTouchedTeam: 'TeamA', lastTouchedPlayer: null,
    setPieceTaker: null, setPieceTimer: 0,
    counterAttackTeam: null, counterAttackTimer: 0,
    specMesh: null, specData: [], specDummy: new THREE.Object3D(),
    crowdExcitement: 0, crowdTimer: 0,
    currentLookTarget: null, // Usado para interpolação da câmara
    kickoffActive: false, kickoffTimer: 0, kickoffTaker: null, kickoffApoio: null,

    // Migração por eventos (ver EventBus) — parte 1: GK. Substitui o polling
    // directo de gk.gkEstado === 'apanhar'/'segurando' espalhado por vários
    // ficheiros (match.js afastarDoGuardaRedes, position_bt.js commit).
    // TeamA/TeamB -> true enquanto o GR dessa equipa está com a bola na mão.
    gkHoldingBall: { TeamA: false, TeamB: false },

    init: function (scene) {
        this.scene = scene;
        this.currentLookTarget = new THREE.Vector3(0, 0, 0);

        if (typeof EventBus !== 'undefined') {
            EventBus.on('GK_CATCH_BALL', (d) => {
                this.gkHoldingBall[d.team] = true;
                // Reposicionamento instantâneo: os dois times reorganizam já
                // pro PositionBT deles, não esperam o lerp de suavização
                // normal (PositionSmoothing) convergir devagar ao longo de
                // vários segundos.
                for (const p of this.players) p.snapPosition = true;
                for (const p of this.opponents) p.snapPosition = true;
            });
            EventBus.on('GK_RELEASE_BALL', (d) => { this.gkHoldingBall[d.team] = false; });

            /*
            Migração por eventos — parte 2: CB. Quando um CB fica com a bola,
            a equipa reorganiza a saída: CB oposto recua 3m, lateral do
            mesmo lado avança 3m, lateral oposto avança 5m. Bias temporário
            (5s), consumido em commit() (position_bt.js).
            */
            EventBus.on('CB_HAS_BALL', (d) => {
                const p = d.p;
                const teammates = (p.team === 'TeamA') ? this.players : this.opponents;
                const outroCB = teammates.find(t => t.pos === 'CB' && t !== p);
                const lb = teammates.find(t => t.pos === 'LB');
                const rb = teammates.find(t => t.pos === 'RB');

                const ladoBase = (p.baseTarget) ? p.baseTarget.x : p.model.position.x;
                const mesmoLado = (ladoBase < 0) ? lb : rb;
                const ladoOposto = (ladoBase < 0) ? rb : lb;

                const aplicar = (jog, metros) => {
                    if (!jog) return;
                    jog.buildOutBias = { x: 0, z: metros * jog.dirZ };
                    jog.buildOutTimer = 5.0;
                };
                aplicar(outroCB, -3);
                aplicar(mesmoLado, 3);
                aplicar(ladoOposto, 5);
            });
        }

        this.createField();

        this.ball = new THREE.Group();
        // ballVisual pode ser um Group (malha do OBJ, um mesh por material) ou
        // um Mesh (bola procedural). Ambos têm scale e quaternion, que é tudo o
        // que o updateBall lhes toca.
        this.ballVisual = this.criarBola(0.14);
        this.ball.add(this.ballVisual); this.scene.add(this.ball);

        this.offsideLineA = new THREE.Mesh(new THREE.PlaneGeometry(68, 0.25), new THREE.MeshBasicMaterial({ color: 0x3498db, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
        this.offsideLineA.rotation.x = -Math.PI / 2; this.offsideLineA.position.y = 0.04; this.offsideLineA.visible = false;
        this.scene.add(this.offsideLineA);

        this.offsideLineB = new THREE.Mesh(new THREE.PlaneGeometry(68, 0.25), new THREE.MeshBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
        this.offsideLineB.rotation.x = -Math.PI / 2; this.offsideLineB.position.y = 0.04; this.offsideLineB.visible = false;
        this.scene.add(this.offsideLineB);

        this.btPosRectA = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x3498db, linewidth: 2 }));
        this.btPosRectA.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
        this.btPosRectA.visible = false;
        this.scene.add(this.btPosRectA);

        this.btPosRectB = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe74c3c, linewidth: 2 }));
        this.btPosRectB.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
        this.btPosRectB.visible = false;
        this.scene.add(this.btPosRectB);

        this.passTargetVisual = new THREE.Mesh(
            new THREE.CircleGeometry(0.5, 32),
            new THREE.MeshBasicMaterial({ color: 0x0088ff, side: THREE.DoubleSide })
        );
        this.passTargetVisual.rotation.x = -Math.PI / 2;
        this.passTargetVisual.position.y = 0.05;
        this.passTargetVisual.visible = false;
        this.scene.add(this.passTargetVisual);

        this.showOffsideLines = false;

        this.createTeams();
        this.resetPlay();
        this.setupKeyboardListeners();
    },

    /*
    A bola.

    Usa a malha de assets/Ball.obj (convertida para assets/ball_mesh.js) se ela
    estiver carregada; senão constrói a esfera com textura de painéis desenhada
    à mão, que é o que existia antes. Assim o jogo abre na mesma se o ficheiro
    da malha faltar ou for removido.
    */
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

    setupKeyboardListeners: function () {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'o' || e.key === 'O') {
                this.showOffsideLines = !this.showOffsideLines;
                this.offsideLineA.visible = this.showOffsideLines;
                this.offsideLineB.visible = this.showOffsideLines;
            }
            if (e.key === '1') this.setSpeed(0.5);
            if (e.key === '2') this.setSpeed(1.0);
            if (e.key === '3') this.setSpeed(1.3);
            if (e.key === '4') this.setCameraMode('center');
            if (e.key === '5') this.setCameraMode('sideline');
            if (e.key === '6') this.setCameraMode('topdown');
            if (e.key === ' ' || e.code === 'Space') {
                this.togglePause();
                e.preventDefault();
            }
            if (e.key === 'x' || e.key === 'X') togglePainel();
        });
    },

    // Também acionado pela tecla Espaço (ver setupKeyboardListeners) — usado
    // pelo botão Pause/Continue do painel esquerdo.
    togglePause: function () {
        window.isPaused = !window.isPaused;
        const btn = document.getElementById('btn-pause');
        if (btn) btn.textContent = window.isPaused ? 'Continue' : 'Pause';
    },

    setSpeed: function (speed) {
        window.speedMultiplier = speed;
        document.querySelectorAll('.btn-speed').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('spd-' + speed);
        if (btn) btn.classList.add('active');
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
    },

    updateCamera: function () {
        if (window.cameraMode === 'orbit') return;
        
        if (!this.ball) return;
        const zoom = window.cameraZoom || 1.0;
        let targetPos = new THREE.Vector3();
        let lookTarget = new THREE.Vector3();

        if (window.cameraMode === 'center') {
            // Câmara de TV mais próxima da ação, na altura do último degrau
            targetPos.set(62 * zoom, 42 * zoom, 0);
            lookTarget.copy(this.ball.position);
        } else if (window.cameraMode === 'sideline') {
            // Câmara Lateral bem mais próxima, acompanhando a bola no eixo Z
            let bz = THREE.MathUtils.clamp(this.ball.position.z, -45, 45);
            targetPos.set(40 * zoom, 15 * zoom, bz);
            lookTarget.copy(this.ball.position);
        } else if (window.cameraMode === 'topdown') {
            const aspect = window.innerWidth / window.innerHeight;
            // Campo deitado: precisamos caber ~116m na horizontal (106 + margem) e ~78m na vertical (68 + margem)
            const reqYForHeight = 78 / 0.8284;
            const reqYForWidth = 116 / (0.8284 * aspect);
            const optimalY = Math.max(reqYForHeight, reqYForWidth);
            targetPos.set(0, optimalY * zoom, 0);
            lookTarget.set(0, 0, 0);
        }

        // Interpolação de posição (suave)
        window.cameraCore.position.lerp(targetPos, 0.05);
        
        // Interpolação do ponto de foco
        if (!this.currentLookTarget) this.currentLookTarget = new THREE.Vector3();
        this.currentLookTarget.lerp(lookTarget, 0.08); 
        
        // Usando lookAt direto evita que a câmara torça ou olhe para o céu ao alternar modos
        window.cameraCore.lookAt(this.currentLookTarget);
    },

    createField: function () {
        const campoGrupo = new THREE.Group();
        const cvsR = document.createElement('canvas'); const ctxR = cvsR.getContext('2d'); cvsR.width = 16; cvsR.height = 512;
        const stripeHeights = [];
        for (let i = 0; i < 3; i++) stripeHeights.push(17 / 3);
        for (let i = 0; i < 20; i++) stripeHeights.push(53 / 10);
        for (let i = 0; i < 3; i++) stripeHeights.push(17 / 3);
        let currentY = 0;
        for (let i = 0; i < 26; i++) {
            let nextY = currentY + stripeHeights[i];
            let yStartPix = Math.round((currentY / 140) * 512);
            let yEndPix = Math.round((nextY / 140) * 512);
            ctxR.fillStyle = (i % 2 === 0) ? '#4B8B3B' : '#428032';
            ctxR.fillRect(0, yStartPix, 16, yEndPix - yStartPix);
            currentY = nextY;
        }
        const relvaTex = new THREE.CanvasTexture(cvsR);
        relvaTex.wrapS = THREE.RepeatWrapping; relvaTex.wrapT = THREE.ClampToEdgeWrapping; relvaTex.repeat.set(15, 1);
        window.relva = new THREE.Mesh(new THREE.PlaneGeometry(120, 140), new THREE.MeshStandardMaterial({ map: relvaTex, roughness: 1.0 }));
        window.relva.rotation.x = -Math.PI / 2; window.relva.receiveShadow = true; campoGrupo.add(window.relva);

        const matLinha = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
        const esp = 0.15; const comp = 106; const larg = 68;
        function addLinha(w, h, x, z) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matLinha); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); m.receiveShadow = true; campoGrupo.add(m); }
        addLinha(larg + esp, esp, 0, comp / 2); addLinha(larg + esp, esp, 0, -comp / 2); addLinha(esp, comp + esp, larg / 2, 0); addLinha(esp, comp + esp, -larg / 2, 0); addLinha(larg, esp, 0, 0);

        const circ = new THREE.Mesh(new THREE.RingGeometry(9.15 - esp / 2, 9.15 + esp / 2, 64), matLinha); circ.rotation.x = -Math.PI / 2; circ.position.y = 0.02; campoGrupo.add(circ);
        const ptC = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), matLinha); ptC.rotation.x = -Math.PI / 2; ptC.position.y = 0.02; campoGrupo.add(ptC);

        const cvsRede = document.createElement('canvas'); cvsRede.width = 32; cvsRede.height = 32; const ctxRede = cvsRede.getContext('2d');
        ctxRede.fillStyle = 'rgba(240, 240, 245, 0.35)'; ctxRede.fillRect(0, 0, 32, 32);
        ctxRede.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctxRede.lineWidth = 1.5; ctxRede.strokeRect(0, 0, 32, 32);
        ctxRede.strokeStyle = 'rgba(220, 220, 230, 0.5)'; ctxRede.lineWidth = 0.8;
        ctxRede.beginPath(); ctxRede.moveTo(0, 0); ctxRede.lineTo(32, 32); ctxRede.stroke();
        ctxRede.beginPath(); ctxRede.moveTo(32, 0); ctxRede.lineTo(0, 32); ctxRede.stroke();
        const texRede = new THREE.CanvasTexture(cvsRede); texRede.wrapS = THREE.RepeatWrapping; texRede.wrapT = THREE.RepeatWrapping;
        const matRede = new THREE.MeshBasicMaterial({ map: texRede, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });

        function criarFaceRede(p1, p2, p3, p4, repX, repY) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...p1, ...p2, ...p3, ...p4]), 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, repX, 0, 0, repY, repX, repY]), 2));
            geo.setIndex([0, 1, 2, 1, 3, 2]); geo.computeVertexNormals();
            return new THREE.Mesh(geo, matRede);
        }

        [1, -1].forEach(lado => {
            const zSinal = comp / 2 * lado; const dir = -lado;
            const zGA = zSinal + (16.5 / 2) * dir; addLinha(40.32, esp, 0, zSinal + 16.5 * dir); addLinha(esp, 16.5 + esp, 40.32 / 2, zGA); addLinha(esp, 16.5 + esp, -40.32 / 2, zGA);
            const zPA = zSinal + (5.5 / 2) * dir; addLinha(18.32, esp, 0, zSinal + 5.5 * dir); addLinha(esp, 5.5 + esp, 18.32 / 2, zPA); addLinha(esp, 5.5 + esp, -18.32 / 2, zPA);

            const ptPen = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), matLinha); ptPen.rotation.x = -Math.PI / 2; ptPen.position.set(0, 0.02, zSinal + 11 * dir); campoGrupo.add(ptPen);
            const theta = Math.acos(5.5 / 9.15); const arcRot = lado === 1 ? Math.PI / 2 - theta : -Math.PI / 2 - theta;
            const arco = new THREE.Mesh(new THREE.RingGeometry(9.15 - esp / 2, 9.15 + esp / 2, 32, 1, arcRot, theta * 2), matLinha); arco.rotation.x = -Math.PI / 2; arco.position.set(0, 0.02, zSinal + 11 * dir); campoGrupo.add(arco);

            const baliza = new THREE.Group();
            const matPoste = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }); const rP = 0.06;
            const posteEsq = new THREE.Mesh(new THREE.CylinderGeometry(rP, rP, ALTURA_BALIZA, 16), matPoste); posteEsq.position.set(-LARGURA_BALIZA / 2, ALTURA_BALIZA / 2, 0); posteEsq.castShadow = true;
            const posteDir = new THREE.Mesh(new THREE.CylinderGeometry(rP, rP, ALTURA_BALIZA, 16), matPoste); posteDir.position.set(LARGURA_BALIZA / 2, ALTURA_BALIZA / 2, 0); posteDir.castShadow = true;
            const travessao = new THREE.Mesh(new THREE.CylinderGeometry(rP, rP, LARGURA_BALIZA + rP * 2, 16), matPoste); travessao.rotation.z = Math.PI / 2; travessao.position.set(0, ALTURA_BALIZA + rP, 0); travessao.castShadow = true;
            baliza.add(posteEsq, posteDir, travessao);

            const profTop = 0.8; const profBot = 2.0; const w = LARGURA_BALIZA / 2;
            const tLE = [-w, ALTURA_BALIZA, 0]; const tLD = [w, ALTURA_BALIZA, 0];
            const tTE = [-w, ALTURA_BALIZA, profTop]; const tTD = [w, ALTURA_BALIZA, profTop];
            const bTE = [-w, 0, profBot]; const bTD = [w, 0, profBot];
            const bFE = [-w, 0, 0]; const bFD = [w, 0, 0];

            const redeCima = criarFaceRede(tLE, tLD, tTE, tTD, 30, 4); const redeTras = criarFaceRede(tTE, tTD, bTE, bTD, 30, 10);
            const redeEsq = criarFaceRede(bFE, tLE, bTE, tTE, 8, 10); const redeDir = criarFaceRede(tLD, bFD, tTD, bTD, 8, 10);

            const redes = new THREE.Group(); redes.add(redeCima, redeTras, redeEsq, redeDir);
            if (lado === -1) { redes.scale.z = -1; }

            baliza.add(redes); baliza.position.set(0, 0, zSinal + (rP * dir)); campoGrupo.add(baliza);
        });

        const concreteMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9 });
        const seatGeo = new THREE.BoxGeometry(0.5, 0.3, 0.4);
        const seatMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });

        const maxSeats = 12000;
        const seatMesh = new THREE.InstancedMesh(seatGeo, seatMat, maxSeats);
        seatMesh.castShadow = true;
        seatMesh.receiveShadow = true;

        const specGeo = createSpectatorGeometry();
        const specMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
        const specMesh = new THREE.InstancedMesh(specGeo, specMat, maxSeats);
        specMesh.castShadow = true;
        specMesh.receiveShadow = true;

        let seatIndex = 0;
        let spectatorIndex = 0;
        const dummy = new THREE.Object3D();
        const specDummy = new THREE.Object3D();

        const palette = [
            new THREE.Color('#3498db'),
            new THREE.Color('#e74c3c'),
            new THREE.Color('#ffffff'),
            new THREE.Color('#f1c40f')
        ];
        function getSeatColor() {
            return palette[Math.floor(Math.random() * palette.length)];
        }

        function addSeatInstance(x, y, z, rotY) {
            if (seatIndex >= maxSeats) return;
            dummy.position.set(x, y, z);
            dummy.rotation.set(0, rotY, 0);
            dummy.updateMatrix();
            seatMesh.setMatrixAt(seatIndex, dummy.matrix);
            seatMesh.setColorAt(seatIndex, getSeatColor());
            seatIndex++;

            if (Math.random() < 0.75 && spectatorIndex < maxSeats) {
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

        function buildCorner(cx, cz, startAngle) {
            for (let r = 0; r < 20; r++) {
                const R = 6.5 + r * 1.2;
                const standY = 0.25 + (r * 0.5);
                
                const numSteps = Math.max(4, Math.floor(R * (Math.PI / 2) / 2.5));
                const stepLength = (R * (Math.PI / 2) / numSteps) * 1.05;
                for (let j = 0; j <= numSteps; j++) {
                    const angle = startAngle + (j / numSteps) * (Math.PI / 2);
                    const sx = cx + R * Math.cos(angle);
                    const sz = cz + R * Math.sin(angle);
                    const stepBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, stepLength), concreteMat);
                    stepBox.position.set(sx, standY, sz);
                    stepBox.rotation.y = -angle;
                    stepBox.receiveShadow = true;
                    stepBox.castShadow = true;
                    campoGrupo.add(stepBox);
                }
                
                const seatYOffset = standY + 0.25 + 0.15;
                const numSeats = Math.floor(R * (Math.PI / 2) / 0.85);
                for (let i = 0; i <= numSeats; i++) {
                    const angle = startAngle + (i / numSeats) * (Math.PI / 2);
                    const sx = cx + R * Math.cos(angle);
                    const sz = cz + R * Math.sin(angle);
                    const rotY = Math.atan2(-sx, -sz);
                    addSeatInstance(sx, seatYOffset, sz, rotY);
                }
            }
        }

        for (let r = 0; r < 20; r++) {
            const standX = -38.5 - (r * 1.2);
            const standY = 0.25 + (r * 0.5);
            const stepBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 108), concreteMat);
            stepBox.position.set(standX, standY, 0);
            stepBox.receiveShadow = true;
            stepBox.castShadow = true;
            campoGrupo.add(stepBox);

            const seatYOffset = standY + 0.25 + 0.15;
            for (let z = -52; z <= 52; z += 0.85) {
                addSeatInstance(standX, seatYOffset, z, Math.PI / 2);
            }
        }

        for (let r = 0; r < 20; r++) {
            const standX = 38.5 + (r * 1.2);
            const standY = 0.25 + (r * 0.5);
            const stepBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 108), concreteMat);
            stepBox.position.set(standX, standY, 0);
            stepBox.receiveShadow = true;
            stepBox.castShadow = true;
            campoGrupo.add(stepBox);

            const seatYOffset = standY + 0.25 + 0.15;
            for (let z = -52; z <= 52; z += 0.85) {
                addSeatInstance(standX, seatYOffset, z, -Math.PI / 2);
            }
        }

        for (let r = 0; r < 20; r++) {
            const standZ = 58.5 + (r * 1.2);
            const standY = 0.25 + (r * 0.5);
            const stepBox = new THREE.Mesh(new THREE.BoxGeometry(64, 0.5, 1.2), concreteMat); 
            stepBox.position.set(0, standY, standZ);
            stepBox.receiveShadow = true;
            stepBox.castShadow = true;
            campoGrupo.add(stepBox);

            const seatYOffset = standY + 0.25 + 0.15;
            for (let x = -32; x <= 32; x += 0.85) {
                if (Math.abs(x) > 4.5 || r > 1) {
                    addSeatInstance(x, seatYOffset, standZ, Math.PI);
                }
            }
        }

        for (let r = 0; r < 20; r++) {
            const standZ = -58.5 - (r * 1.2);
            const standY = 0.25 + (r * 0.5);
            const stepBox = new THREE.Mesh(new THREE.BoxGeometry(64, 0.5, 1.2), concreteMat); 
            stepBox.position.set(0, standY, standZ);
            stepBox.receiveShadow = true;
            stepBox.castShadow = true;
            campoGrupo.add(stepBox);

            const seatYOffset = standY + 0.25 + 0.15;
            for (let x = -32; x <= 32; x += 0.85) {
                if (Math.abs(x) > 4.5 || r > 1) {
                    addSeatInstance(x, seatYOffset, standZ, 0);
                }
            }
        }

        buildCorner(-32.0, 52.0, Math.PI / 2);      
        buildCorner(32.0, 52.0, 0);                 
        buildCorner(-32.0, -52.0, Math.PI);         
        buildCorner(32.0, -52.0, 3 * Math.PI / 2);  

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

    createTeams: function () {
        // Skills fixas (data/player_skills.js) — atribuídas por ÍNDICE, não
        // por posição da formação: a formação pode mudar (442/433/4231),
        // mas o elenco (jogador 0..10) é sempre o mesmo, ver
        // tools/gen_player_skills.js.
        const skillsA = (typeof PlayerSkillsData !== 'undefined') ? PlayerSkillsData.teamA : null;
        const skillsB = (typeof PlayerSkillsData !== 'undefined') ? PlayerSkillsData.teamB : null;

        for (let i = 0; i < 11; i++) {
            let corCamisa = (i === 0) ? '#f1c40f' : '#3498db';
            let corCalcao = (i === 0) ? '#1e1b18' : '#34495e';
            let p = new FootballPlayer(i, corCamisa, corCalcao, 'TeamA');
            p.skills = skillsA ? skillsA[i] : null;
            this.players.push(p);
            this.scene.add(p.model);
        }

        for (let i = 0; i < 11; i++) {
            let corCamisa = (i === 0) ? '#e67e22' : '#e74c3c';
            let corCalcao = (i === 0) ? '#111111' : '#ffffff';
            let p = new FootballPlayer(i + 20, corCamisa, corCalcao, 'TeamB');
            p.skills = skillsB ? skillsB[i] : null;
            this.opponents.push(p);
            this.scene.add(p.model);
        }

        this.assignFormations();
    },

    assignFormations: function () {
        let compMult = 0.8;
        if (typeof Tatics !== 'undefined' && Tatics.compactness) {
            if (Tatics.compactness === 'large') compMult = 1.0;
            else if (Tatics.compactness === 'short') compMult = 0.6;
        }

        const fData = FormationsData[Tatics.formacao];

        /*
        Slot normalizado: onde este jogador fica DENTRO do bloco, em fracções.

            u  0 = lado esquerdo do bloco, 1 = lado direito
            v  0 = última linha,           1 = frente do bloco

        O u sai directo do FormationsData (que já vem em -1..1). O v é
        normalizado contra o alcance real dos jogadores de campo desta
        formação, para o bloco ser usado todo — um 4-4-2 vai de -0.7 a 0.4, e
        sem esta normalização os defesas nunca chegavam à traseira do bloco.

        O guarda-redes não tem slot: o posicionamento dele é próprio e vive em
        FootballPlayer.updateGK().
        */
        const campo = fData.filter(f => f.role !== 'gk');
        const zMin = Math.min(...campo.map(f => f.z));
        const zMax = Math.max(...campo.map(f => f.z));
        const zSpan = (zMax - zMin) || 1;

        for (let i = 0; i < 11; i++) {
            const slotA = (fData[i].role === 'gk') ? null : {
                u: (fData[i].x + 1) / 2,
                v: (fData[i].z - zMin) / zSpan
            };

            this.players[i].baseTarget.set(fData[i].x * (CAMPO_LARG / 2) * compMult, ALTURA_BASE_Y, fData[i].z * (CAMPO_COMP / 2));
            this.players[i].role = fData[i].role;
            this.players[i].slot = slotA;
            this.players[i].updateShirt(fData[i].num, fData[i].pos);

            // O adversário ataca ao contrário, mas o slot está no referencial
            // de ataque dele — logo é o mesmo. Só o baseTarget e o u são espelhados.
            const slotB = (fData[i].role === 'gk') ? null : {
                u: (-fData[i].x + 1) / 2,
                v: (fData[i].z - zMin) / zSpan
            };
            this.opponents[i].baseTarget.set(-fData[i].x * (CAMPO_LARG / 2) * compMult, ALTURA_BASE_Y, -fData[i].z * (CAMPO_COMP / 2));
            this.opponents[i].role = fData[i].role;
            this.opponents[i].slot = slotB;
            this.opponents[i].updateShirt(fData[i].num, fData[i].pos);
        }
    },

    // TeamB = RED, TeamA = BLUE. Ver #placar em index.html.
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

    /*
    Saída de bola padrão (kickoff): bola ao centro, as duas equipas na sua
    metade de campo (via baseTarget da formação), sorteio de quem inicia, e
    um jogador dessa equipa junto à bola para tocar para um companheiro
    posicionado atrás dele. O jogo só "começa" quando esse primeiro toque
    sai — mas isso já é o comportamento normal do BT (Dominar/CadenceModel)
    assim que o jogador tem a bola em IDLE, tal como no reinício antigo.

    Usado tanto pelo botão do painel como no reinício automático após golo.
    */
    resetPlay: function () {
        this.state = 'PLAY'; this.ballVel.set(0, 0, 0);

        this.intendedReceiver = null;
        this.chaserA = null;
        this.chaserB = null;
        this.setPieceTaker = null;
        this.setPieceTimer = 0;
        this.counterAttackTeam = null;
        this.counterAttackTimer = 0;

        document.getElementById('alerta-golo').style.opacity = '0';
        window.bolaChutada = false;

        this.ball.position.set(0, 0.15, 0);

        this.players[0].model.position.set(0, ALTURA_BASE_Y, -48);
        lookAtBola(this.players[0].model, this.ball.position);
        this.players[0].fsm.changeState('IDLE');

        this.opponents[0].model.position.set(0, ALTURA_BASE_Y, 48);
        lookAtBola(this.opponents[0].model, this.ball.position);
        this.opponents[0].fsm.changeState('IDLE');

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
            }
        });

        // dirA/dirB: sentido de ataque de cada equipa. O campo de defesa é o
        // lado oposto — por isso o clamp abaixo usa z*dir <= -margem.
        const margem = 1.5;
        [{ list: this.players, dir: 1 }, { list: this.opponents, dir: -1 }].forEach(({ list, dir }) => {
            list.forEach(p => {
                p.isCross = false;
                if (p.role !== 'gk') {
                    let z = p.baseTarget.z;
                    if (p.role === 'def') {
                        // Linha de defesa respeita o ajuste "Linha Defensiva"
                        // do painel também na saída, não só durante o jogo —
                        // TeamShape.linhaDefensiva está no referencial de
                        // ataque, por isso converte para mundo por *dir.
                        const cap = TeamShape.linhaDefensiva[Tatics.linhaDefensiva] ?? TeamShape.linhaDefensiva.medium;
                        z = cap * dir;
                    }
                    if (z * dir > -margem) z = -margem * dir; // força para o campo de defesa
                    p.model.position.set(p.baseTarget.x, ALTURA_BASE_Y, z);
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

        // Sorteio do time que dá a saída.
        const startA = Math.random() < 0.5;
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

        if (taker) {
            // Ele é quem dá a saída — pode ficar no campo de ataque, encostado
            // à bola (~0.4m), diferente do resto da equipa que fica atrás.
            taker.model.position.set(0, ALTURA_BASE_Y, attDir * 0.4);
            taker.fsm.changeState('IDLE');
        }
        if (apoio) {
            // Posição varia a cada saída — perto do taker, mas nunca igual.
            const apoioX = (Math.random() - 0.5) * 6;
            const apoioDist = 3 + Math.random() * 3;
            apoio.model.position.set(apoioX, ALTURA_BASE_Y, -attDir * apoioDist);
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
        this.kickoffTimer = 4.0;
        this.kickoffTaker = taker;
        this.kickoffApoio = apoio;
    },

    update: function (dt) {
        this.delta = dt;

        if (this.kickoffActive) {
            this.kickoffTimer -= dt;
            // Animação de idle continua (respiração/etc.), mas sem BT: os
            // alvos de movimento não mudam, por isso ninguém sai do lugar.
            this.players.forEach(p => p.update(dt));
            this.opponents.forEach(p => p.update(dt));
            if (this.kickoffTimer <= 0) {
                this.kickoffActive = false;
                if (this.kickoffTaker && this.kickoffApoio) {
                    this.kickoffTaker.initiatePass(this.kickoffApoio);
                }
                this.kickoffTaker = null;
                this.kickoffApoio = null;
            }
            return;
        }

        if (this.state === 'PLAY') {
            this.tempoDeJogo += dt;
            this.updatePlacar();
        }

        if (this.state === 'CORNER_KICK') {
            this.setPieceTimer += dt;
        }

        if (this.counterAttackTimer > 0) {
            this.counterAttackTimer -= dt;
            if (this.counterAttackTimer <= 0) {
                this.counterAttackTeam = null;
            }
        }

        if (!this.intendedReceiver && this.passTargetVisual) {
            this.passTargetVisual.visible = false;
        }
        
        this.updateBall();
        if (typeof SpatialGrid !== 'undefined') SpatialGrid.update(dt);
        if (typeof PassCandidates !== 'undefined') PassCandidates.update(dt);
        if (typeof Perception !== 'undefined') Perception.tick(this, dt);
        this.runTeamAI();

        this.players.forEach(p => p.update(dt));
        this.opponents.forEach(p => p.update(dt));

        if (this.showOffsideLines) {
            let outfieldA = this.players.filter(p => p.role !== 'gk');
            if (outfieldA.length > 0) {
                outfieldA.sort((a, b) => a.model.position.z - b.model.position.z);
                this.offsideLineA.position.z = outfieldA[0].model.position.z;
            }
            let outfieldB = this.opponents.filter(p => p.role !== 'gk');
            if (outfieldB.length > 0) {
                outfieldB.sort((a, b) => b.model.position.z - a.model.position.z);
                this.offsideLineB.position.z = outfieldB[0].model.position.z;
            }
        }

        this.btPosRectA.visible = false;
        this.btPosRectB.visible = false;

        const updateRect = (teamName, rectMesh) => {
            const bb = (typeof TeamAI !== 'undefined' && TeamAI.blackboards) ? TeamAI.blackboards[teamName] : null;
            if (bb) {
                rectMesh.visible = true;
                const minZ = Math.min(bb.blockBottom * bb.dir, bb.blockTop * bb.dir);
                const maxZ = Math.max(bb.blockBottom * bb.dir, bb.blockTop * bb.dir);
                let x0 = -17;
                let x1 = 17;
                if (bb.bloco) {
                    x0 = bb.bloco.x0;
                    x1 = bb.bloco.x1;
                }
                const pts = rectMesh.geometry.attributes.position.array;
                pts[0] = x0; pts[1] = 0.05; pts[2] = minZ;
                pts[3] = x1; pts[4] = 0.05; pts[5] = minZ;
                pts[6] = x1; pts[7] = 0.05; pts[8] = maxZ;
                pts[9] = x0; pts[10] = 0.05; pts[11] = maxZ;
                rectMesh.geometry.attributes.position.needsUpdate = true;
            }
        };

        if (window.teamBTPosState === 'TeamA' || window.teamBTPosState === 'Both') {
            updateRect('TeamA', this.btPosRectA);
        }
        if (window.teamBTPosState === 'TeamB' || window.teamBTPosState === 'Both') {
            updateRect('TeamB', this.btPosRectB);
        }

        const allPlayers = this.players.concat(this.opponents);
        const colRadius = 0.45;
        const colDiameter = colRadius * 2;
        for (let i = 0; i < allPlayers.length; i++) {
            for (let j = i + 1; j < allPlayers.length; j++) {
                const a = allPlayers[i]; const b = allPlayers[j];
                const dx = a.model.position.x - b.model.position.x;
                const dz = a.model.position.z - b.model.position.z;
                const distSq = dx * dx + dz * dz;
                if (distSq < colDiameter * colDiameter && distSq > 0.001) {
                    const dist = Math.sqrt(distSq);
                    const overlap = colDiameter - dist;
                    const nx = dx / dist; const nz = dz / dist;
                    const push = overlap * 0.5;
                    a.model.position.x += nx * push;
                    a.model.position.z += nz * push;
                    b.model.position.x -= nx * push;
                    b.model.position.z -= nz * push;
                }
            }
        }

        this.updateCrowd(dt);
    },

    updateCrowd: function (dt) {
        if (!this.specMesh || this.specData.length === 0) return;
        this.crowdTimer += dt;

        let targetExcitement = 0.0;
        if (this.state === 'GOAL') {
            targetExcitement = 1.0; 
        } else if (this.ballVel.lengthSq() > 400) {
            targetExcitement = 0.7; 
        } else if (this.ball && Math.abs(this.ball.position.z) > 40) {
            targetExcitement = 0.5; 
        } else if (this.ballCarrier && this.ballVel.lengthSq() > 100) {
            targetExcitement = 0.3; 
        } else {
            targetExcitement = 0.05; 
        }
        this.crowdExcitement += (targetExcitement - this.crowdExcitement) * dt * 3.0;

        const sd = this.specDummy;
        const t = this.crowdTimer;
        const exc = this.crowdExcitement;
        const count = this.specData.length;

        const updateRate = exc > 0.5 ? 1 : (exc > 0.2 ? 3 : 8);
        const startIdx = Math.floor(t * 60) % updateRate;

        for (let i = startIdx; i < count; i += updateRate) {
            const d = this.specData[i];
            const phase = d.phase;

            let standUp = 0;
            let armWave = 0;
            let lean = 0;

            standUp = Math.abs(Math.sin(t * (4 + (Math.floor(phase * 10) % 3)) + phase)) * 0.12;

            if (exc > 0.7) {
                standUp = 0.15 + Math.abs(Math.sin(t * 9 + phase)) * 0.18;
                armWave = Math.sin(t * 11 + phase) * 0.25;
            } else if (exc > 0.35) {
                standUp *= 1.4;
                armWave = Math.sin(t * 6 + phase) * 0.12;
                lean = Math.sin(t * 4 + phase) * 0.04;
            } else {
                lean = Math.sin(t * 2 + phase) * 0.02;
            }

            sd.position.set(d.bx + lean, d.by + standUp, d.bz);
            sd.rotation.set(0, d.rotY + armWave, 0);
            sd.updateMatrix();
            this.specMesh.setMatrixAt(i, sd.matrix);
        }
        this.specMesh.instanceMatrix.needsUpdate = true;
    },

    /*
    Orquestrador dos níveis de decisão. Esta função já não decide nada por si:

        1. updatePossession()  quem tem a bola — facto, não decisão
        2. TeamAI.tick()       nível 1: o plano colectivo de cada equipa
        3. PositionAI.tick()   nível 2: onde cada jogador se coloca
        4. relaxConstraints()  coesão do bloco + linha de fora-de-jogo

    O nível 3 (o que este jogador faz com a bola) corre depois, em
    FootballPlayer.update → runBehaviorTree, e comanda a PlayerFSM.
    */
    runTeamAI: function () {
        if (this.state !== 'PLAY') return;

        this.updatePossession();

        // O nível 1 escreve marcações nos jogadores das DUAS equipas, por isso
        // a limpeza tem de ser um passo global antes dos dois ticks — se cada
        // equipa limpasse na sua vez, a segunda apagava o trabalho da primeira.
        this.players.forEach(p => { p.markingTarget = null; p.isCovering = false; p.markCount = 0; });
        this.opponents.forEach(o => { o.markingTarget = null; o.isCovering = false; o.markCount = 0; });

        const bbA = TeamAI.tick('TeamA', this);
        const bbB = TeamAI.tick('TeamB', this);
        this.chaserA = bbA.chaser;
        this.chaserB = bbB.chaser;

        this.players.forEach(p => PositionAI.tick(p, bbA));
        this.opponents.forEach(p => PositionAI.tick(p, bbB));

        // Coesão local (molas entre jogadores) e linha de fora-de-jogo.
        this.relaxConstraints(this.players);
        this.relaxConstraints(this.opponents);

        // Volta ao nível 1 para os limites colectivos. Corre DEPOIS do relax
        // porque as molas, à conta das distâncias de repouso, voltavam a esticar
        // o bloco — quem impõe a forma final da equipa tem de falar por último.
        TeamAI.compact(bbA);
        TeamAI.compact(bbB);
        // Ninguém no sítio de ninguém — antes dos limites colectivos...
        this.separarAlvos(this.players);
        this.separarAlvos(this.opponents);

        TeamAI.holdLine(bbA);
        TeamAI.holdLine(bbB);

        // ...e outra vez depois, só lateralmente, para o holdLine não voltar a
        // juntar em z quem tinha sido afastado.
        this.separarAlvos(this.players, true);
        this.separarAlvos(this.opponents, true);

        this.afastarDoGuardaRedes(this.players);
        this.afastarDoGuardaRedes(this.opponents);
    },

    // Quem tem a bola, há quanto tempo, e se isto é um contra-ataque.
    updatePossession: function () {
        const ballPos = this.ball.position;

        if (this.ballCarrier) {
            if (this.possessionTeam !== this.ballCarrier.team) {
                const oldPossessionTeam = this.possessionTeam;
                this.possessionTeam = this.ballCarrier.team;
                this.possessionTimer = 0;

                // Recuperar a bola no nosso meio-campo abre janela de contra-ataque.
                if (oldPossessionTeam && this.ballCarrier.model.position.z * this.ballCarrier.dirZ < -10) {
                    this.counterAttackTeam = this.ballCarrier.team;
                    this.counterAttackTimer = 4.0;
                } else {
                    this.counterAttackTeam = null;
                    this.counterAttackTimer = 0;
                }
            }
            this.possessionTimer += this.delta;
            this.lastTouchedTeam = this.ballCarrier.team;
            this.lastTouchedPlayer = this.ballCarrier;

            if (typeof MatchStats !== 'undefined') {
                MatchStats[this.ballCarrier.team].posseSegundos += this.delta;
                const zoneAhead = this.ballCarrier.model.position.z * this.ballCarrier.dirZ;
                MatchStats.registarZona(this.ballCarrier.team, zoneAhead, this.delta);
            }

            window.bolaChutada = false;
            // Repõe o estado de reacção nos dois GKs.
            [Match.players[0], Match.opponents[0]].forEach(gk => { if (gk) { gk.gkReagiu = false; } });

            // A bola fugiu-lhe do pé.
            const distToBall = this.ballCarrier.model.position.distanceTo(ballPos);
            if (distToBall > 2.0 && this.ballVel.lengthSq() > 1.0) {
                if (typeof MatchStats !== 'undefined') MatchStats[this.ballCarrier.team].perdasDePosse++;
                this.ballCarrier.hasBall = false;
                this.ballCarrier = null;
            }
        }
        else {
            if (!this.resolveBallContact() && this.possessionTeam) {
                this.possessionTimer += this.delta;
            }
        }
    },

    /*
    Disputa da bola solta: recepção, intercepção e desvio.

    Corre uma vez por frame sobre o jogador mais próximo da bola que esteja em
    condições de lhe tocar. Devolve true se alguém ficou com ela.

    Cada jogador só tem direito a uma tentativa por aproximação (`retryLock`),
    senão uma bola rápida a passar por ele daria uma dezena de rolagens de dados
    e a intercepção seria certa.
    */
    resolveBallContact: function () {
        /*
        Prioridade do guarda-redes na própria área: sem isto, um atacante
        colado a ele (ex.: cena de disputa junto à baliza) podia ganhar-lhe
        o toque via disputa genérica abaixo (que só considera jogadores de
        linha) — o GR ficava eternamente agachado, sem nunca completar o
        'apanhar' porque a bola era sempre tocada por outro antes. Aqui, se
        ele estiver mesmo em cima da bola e dentro da própria área, agarra
        na hora, sem disputa.
        */
        const gks = [this.players[0], this.opponents[0]];
        for (const gk of gks) {
            if (!gk || gk.role !== 'gk' || gk.touchLock > 0) continue;
            const d = gk.model.position.distanceTo(this.ball.position);
            if (d > 1.3) continue;
            const dentroArea = Math.abs(this.ball.position.x) < 20.16 &&
                (this.ball.position.z - gk.ownGoalZ) * gk.dirZ < 16.5 &&
                (this.ball.position.z - gk.ownGoalZ) * gk.dirZ > -1.0;
            if (!dentroArea) continue;
            gk.grabBall();
            return true;
        }

        const speed = this.ballVel.length();

        let best = null;
        let bestDist = 999;
        const considerar = (p) => {
            if (p.touchLock > 0) return;
            // O guarda-redes nunca controla a bola com o pé por aqui — só
            // apanha com as mãos, sempre via updateGK() (gkEstado 'apanhar').
            if (p.role === 'gk') return;
            const d = p.model.position.distanceTo(this.ball.position);
            if (d < bestDist) { bestDist = d; best = p; }
        };
        this.players.forEach(considerar);
        this.opponents.forEach(considerar);

        if (!best || bestDist > BallControl.reach) return false;

        let dominou;
        if (speed < BallControl.easySpeed) {
            dominou = true;
        } else {
            const dificuldade = THREE.MathUtils.clamp(
                (speed - BallControl.easySpeed) / (BallControl.hardSpeed - BallControl.easySpeed), 0, 1);
            let hipotese = (best.skillFor('TEC') / 100) * (1 - dificuldade);
            if (best === this.intendedReceiver) hipotese += BallControl.receiverBonus;

            /*
            Técnica x Marcação: marcador colado ao receptor aperta o
            primeiro toque — reduz a chance de domínio limpo. Só conta se
            houver marcador mesmo perto (<3m); longe disso não interfere.
            */
            const marcadoresBest = (best.team === 'TeamA') ? this.opponents : this.players;
            let marcadorBest = null, distMarcBest = 999;
            for (const m of marcadoresBest) {
                if (m.role === 'gk') continue;
                const dm = m.model.position.distanceTo(best.model.position);
                if (dm < distMarcBest) { distMarcBest = dm; marcadorBest = m; }
            }
            if (marcadorBest && distMarcBest < 3.0) {
                const fatorMarc = THREE.MathUtils.clamp(
                    1 - (marcadorBest.skillFor('MARKING') - best.skillFor('TEC')) / 300, 0.6, 1.15);
                hipotese *= fatorMarc;
            }

            dominou = Math.random() < hipotese;
            best.touchLock = BallControl.retryLock;
        }

        if (typeof MatchStats !== 'undefined') MatchStats.registarRecepcao(best, dominou);

        if (!dominou) {
            this.deflectBall(best);
            return false;
        }

        this.ballCarrier = best;
        best.hasBall = true;
        this.intendedReceiver = null;
        this.lastTouchedTeam = best.team;
        this.lastTouchedPlayer = best;


        if (best.jumpTimer > 0) {
            best.executeHeader();
        } else {
            window.bolaChutada = false;
            [Match.players[0], Match.opponents[0]].forEach(gk => { if (gk) { gk.gkReagiu = false; } });
        }
        return true;
    },

    // Toque falhado: a bola sai desviada e mais lenta, e fica disputável.
    deflectBall: function (p) {
        this.ballVel.multiplyScalar(BallControl.deflectKeep);

        const restante = this.ballVel.length();
        const espalhar = BallControl.deflectSpread;
        this.ballVel.x += (Math.random() - 0.5) * restante * espalhar;
        this.ballVel.z += (Math.random() - 0.5) * restante * espalhar;
        this.ballVel.y = Math.max(this.ballVel.y, 1.2);

        this.intendedReceiver = null;
        this.lastTouchedTeam = p.team;
        this.lastTouchedPlayer = p;
        window.bolaChutada = false;
    },

    /*
    Pós-processamento colectivo dos alvos escritos pelo nível 2.

    Trata o bloco como uma malha de molas: cada par de jogadores cujas posições
    de base distam menos de 33m fica ligado por uma mola que tenta manter essa
    distância. Três iterações de relaxação chegam para o bloco não se esticar
    nem colapsar. Depois corta os alvos pela linha de fora-de-jogo e pelos
    limites do campo.
    */
    /*
    Separação mínima entre alvos: só repulsão, nunca atracção.

    Dois jogadores nunca devem ir para o mesmo sítio, aconteça o que acontecer
    nas folhas — dois defesas podem escolher marcar adversários que estão
    colados, e o alvo dos dois fica no mesmo ponto.

    As molas de coesão garantiam isto por acidente (o comprimento de repouso
    também empurrava para fora). Mas coesão e não-sobreposição são exigências
    diferentes, e misturá-las era o que fazia as molas discutirem com o bloco.
    Aqui só se resolve a segunda.

    Corre duas vezes, e a ordem importa:

        antes do holdLine   separação completa (x e z)
        depois do holdLine  `apenasX` — só lateral

    Só antes não chega: o holdLine põe os defesas todos no mesmo z e desfaz
    metade do trabalho (medido: um par CB/RB a 0.03 m). Só depois também não:
    empurrar em z passa defesas para lá da linha de fora-de-jogo (medido: 145
    violações). Em x não há nada que se possa violar — dois defesas na linha
    ficam lado a lado, que é o que se quer.
    */
    /*
    Companheiros de linha nunca são afastados do próprio GR em separarAlvos
    (que só separa jogadores de linha entre si, role!=='gk' excluído dos
    dois lados) — um alvo de "apoio" perto da baliza podia coincidir com a
    posição real do GR e o jogador entrava mesmo por cima dele. Empurra o
    alvo pra fora de um raio mínimo do GR.
    */
    afastarDoGuardaRedes: function (teamPlayers) {
        const gk = teamPlayers.find(p => p.role === 'gk');
        if (!gk) return;
        /*
        Com a bola agarrada nas mãos ele precisa de ângulo de passe — 2.5m só
        evita pisão de pé, não abre espaço nenhum. Companheiros ficavam
        encostados nele em vez de se abrirem para receber. Com a bola na mão
        o raio sobe bastante, forçando-os a afastar-se de verdade e criar
        linhas de passe.

        Migração por eventos (parte GK): antes lia gk.gkEstado directamente
        aqui; agora lê Match.gkHoldingBall, mantido por GK_CATCH_BALL/
        GK_RELEASE_BALL (ver EventBus.on no Match.init).
        */
        const comBolaNaMao = Match.gkHoldingBall[gk.team];
        const raio = comBolaNaMao ? 8.0 : 2.5;
        for (const p of teamPlayers) {
            if (p === gk) continue;
            const dx = p.dynamicTarget.x - gk.model.position.x;
            const dz = p.dynamicTarget.z - gk.model.position.z;
            const dist = Math.hypot(dx, dz);
            if (dist >= raio) continue;
            if (dist < 0.001) { p.dynamicTarget.x += raio; continue; }
            const k = (raio - dist) / dist;
            p.dynamicTarget.x += dx * k;
            p.dynamicTarget.z += dz * k;
        }
    },

    separarAlvos: function (teamPlayers, apenasX) {
        const outfield = teamPlayers.filter(p => p.role !== 'gk');
        const n = outfield.length;
        const P = outfield.map(p => ({ x: p.dynamicTarget.x, z: p.dynamicTarget.z }));
        const SEPARACAO = 3.2;

        for (let iter = 0; iter < 4; iter++) {
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const a = P[i], b = P[j];
                    let dx = a.x - b.x, dz = a.z - b.z;
                    let dist = Math.hypot(dx, dz);

                    // Exactamente sobrepostos: separa numa direcção arbitrária
                    // mas determinada, senão não há direcção para empurrar.
                    if (dist < 0.001) { dx = (i - j); dz = 0.1; dist = Math.hypot(dx, dz); }
                    if (dist >= SEPARACAO) continue;

                    const empurrao = ((SEPARACAO - dist) / dist) * 0.5;
                    a.x += dx * empurrao; b.x -= dx * empurrao;
                    if (!apenasX) { a.z += dz * empurrao; b.z -= dz * empurrao; }
                }
            }
        }

        for (let i = 0; i < n; i++) {
            outfield[i].dynamicTarget.x = Math.max(-32, Math.min(32, P[i].x));
            if (!apenasX) outfield[i].dynamicTarget.z = Math.max(-50, Math.min(50, P[i].z));
        }
    },

    relaxConstraints: function (teamPlayers) {
        const outfield = teamPlayers.filter(p => p.role !== 'gk');
        const n = outfield.length;

        /*
        As molas de coesão saíram daqui.

        Eram um passo de relaxação com comprimentos de repouso tirados do
        `baseTarget` — ou seja, da forma da FORMAÇÃO, que não sabe nada do
        bloco. Corriam depois do nível 2 e desfaziam-lhe o trabalho: com o
        rectângulo a pedir 22 m de profundidade, as molas voltavam a esticar a
        equipa para os ~40 m da formação. Medido: alvos do ponta-de-lança a
        z=21 com a frente do bloco em 6.4, e o bloco a medir 62.7 m contra os
        44 m de limite.

        A coesão passou a ser garantida por construção — toda a gente é colocada
        dentro do mesmo rectângulo, por percentagem. Não faz sentido ter duas
        noções de forma da equipa a discutir uma com a outra.

        O que fica é o limite de fora-de-jogo, que continua a ser calculado aqui
        porque depende das posições REAIS do adversário — e uma separação
        mínima, abaixo.
        */
        const P = outfield.map(p => ({ x: p.dynamicTarget.x, z: p.dynamicTarget.z }));

        const isAttacking = (this.possessionTeam === teamPlayers[0].team);
        let offsideLimitZ = null;
        if (isAttacking) {
            if (teamPlayers[0].team === 'TeamA') {
                let maxOppZ = -999;
                Match.opponents.forEach(o => { if (o.role !== 'gk' && o.model.position.z > maxOppZ) maxOppZ = o.model.position.z; });
                offsideLimitZ = Math.max(0, maxOppZ, Match.ball.position.z) - 0.2;
            } else {
                let minOppZ = 999;
                Match.players.forEach(o => { if (o.role !== 'gk' && o.model.position.z < minOppZ) minOppZ = o.model.position.z; });
                offsideLimitZ = Math.min(0, minOppZ, Match.ball.position.z) + 0.2;
            }
        }

        // Publica o limite para o nível 1 não o poder violar ao compactar.
        const bb = TeamAI.get(teamPlayers[0].team);
        bb.offsideLimitDir = (offsideLimitZ === null) ? null : offsideLimitZ * teamPlayers[0].dirZ;

        for (let i = 0; i < n; i++) {
            const p = outfield[i];
            const tx = Math.max(-28.0, Math.min(28.0, P[i].x));
            let tz = P[i].z;

            if (p.dirZ === 1) {
                tz = Math.max(-49.5, tz);
                if (isAttacking && !p.hasBall && offsideLimitZ !== null) tz = Math.min(offsideLimitZ, tz);
            } else {
                tz = Math.min(49.5, tz);
                if (isAttacking && !p.hasBall && offsideLimitZ !== null) tz = Math.max(offsideLimitZ, tz);
            }
            tz = Math.max(-50.0, Math.min(50.0, tz));

            p.dynamicTarget.x = tx;
            p.dynamicTarget.z = tz;
        }
    },

    updateBall: function () {
        this.ball.position.add(this.ballVel.clone().multiplyScalar(this.delta));
        let r = 0.15;
        if (this.ball.position.y > r) { this.ballVel.y -= 15.0 * this.delta; }
        if (this.ball.position.y <= r) {
            this.ball.position.y = r; this.ballVel.y *= -0.6;
            let groundFriction = Math.pow(0.55, this.delta);
            this.ballVel.x *= groundFriction; this.ballVel.z *= groundFriction;
            if (Math.abs(this.ballVel.y) < 0.5) this.ballVel.y = 0;
        }

        if (!this.ballCarrier) {
            let airResistance = Math.pow(0.85, this.delta);
            this.ballVel.x *= airResistance; this.ballVel.z *= airResistance;
        }

        this.ballVisual.scale.set(1, 1, 1);
        if (this.ballVel.lengthSq() > 0.1) {
            let speed = this.ballVel.length();
            _v1.set(this.ballVel.z, 0, -this.ballVel.x).normalize();
            _q1.setFromAxisAngle(_v1, (speed * this.delta) / r);
            this.ballVisual.quaternion.premultiply(_q1);
            this.ballVisual.quaternion.normalize();
        } else if (this.ballCarrier && this.ballCarrier.velocity.lengthSq() > 0.1) {
            let speed = this.ballCarrier.velocity.length();
            _v1.set(this.ballCarrier.velocity.z, 0, -this.ballCarrier.velocity.x).normalize();
            _q1.setFromAxisAngle(_v1, (speed * this.delta) / r);
            this.ballVisual.quaternion.premultiply(_q1);
            this.ballVisual.quaternion.normalize();
        }

        if (Math.abs(this.ball.position.z) > 53) {
            let zSinal = Math.sign(this.ball.position.z);
            if (Math.abs(this.ball.position.x) < (LARGURA_BALIZA / 2 - 0.1) && this.ball.position.y < ALTURA_BALIZA) {

                if (this.state === 'PLAY') {
                    this.state = 'GOAL';

                    if (typeof MatchStats !== 'undefined' && MatchStats[this.lastTouchedTeam]) {
                        MatchStats[this.lastTouchedTeam].remates.golos++;
                    }
                    if (this.lastTouchedTeam === 'TeamA') this.placarA++; else if (this.lastTouchedTeam === 'TeamB') this.placarB++;
                    this.updatePlacar();

                    const alerta = document.getElementById('alerta-golo');
                    alerta.style.opacity = '1'; alerta.style.transform = 'translate(-50%, -50%) scale(1.2)';
                    setTimeout(() => { alerta.style.transform = 'translate(-50%, -50%) scale(1)'; }, 150);
                }

                let bateuRede = false;
                if (Math.abs(this.ball.position.z) > 54.8) { this.ball.position.z = 54.8 * zSinal; this.ballVel.z *= -0.02; this.ballVel.x *= 0.1; if (this.ballVel.y > 0) this.ballVel.y *= 0.1; bateuRede = true; }
                if (this.ball.position.x > (LARGURA_BALIZA / 2 - 0.2)) { this.ball.position.x = (LARGURA_BALIZA / 2 - 0.2); this.ballVel.x *= -0.02; this.ballVel.z *= 0.1; bateuRede = true; }
                if (this.ball.position.x < -(LARGURA_BALIZA / 2 - 0.2)) { this.ball.position.x = -(LARGURA_BALIZA / 2 - 0.2); this.ballVel.x *= -0.02; this.ballVel.z *= 0.1; bateuRede = true; }
                if (this.ball.position.y > (ALTURA_BALIZA - 0.2)) { this.ball.position.y = (ALTURA_BALIZA - 0.2); this.ballVel.y *= -0.02; this.ballVel.z *= 0.1; bateuRede = true; }

                if (bateuRede) { this.ballVel.set(0, 0, 0); }

            } else {
                if (this.state === 'PLAY') {
                    let lastTeam = this.lastTouchedTeam || 'TeamA';
                    // Saída de bola do goleiro foi removida — se a bola sai
                    // pela linha de fundo sem ser escanteio, volta pro centro
                    // do campo (mesmo reinício padrão do kickoff).
                    if (zSinal < 0) {
                        if (lastTeam === 'TeamA') {
                            this.setupSetPiece('CORNER_KICK', 'TeamB');
                        } else {
                            this.resetPlay();
                        }
                    } else {
                        if (lastTeam === 'TeamB') {
                            this.setupSetPiece('CORNER_KICK', 'TeamA');
                        } else {
                            this.resetPlay();
                        }
                    }
                } else {
                    this.ballVel.z *= -0.5; this.ball.position.z = 53 * zSinal;
                }
            }
        }

        if ((this.state === 'GOAL' || this.state === 'OUT') && this.ballVel.lengthSq() < 0.5) {
            this.tempoParada += this.delta;
            if (this.tempoParada > 2.0) {
                this.tempoParada = 0;
                this.resetPlay();
            }
        }
    },

    setupSetPiece: function (type, team) {
        this.state = type;
        this.setPieceTeam = team;
        this.setPieceTimer = 0;
        this.ballVel.set(0, 0, 0);
        this.intendedReceiver = null;

        if (typeof MatchStats !== 'undefined' && MatchStats[team]) {
            if (type === 'CORNER_KICK') MatchStats[team].cantos++;
        }

        let attackingPlayers = (team === 'TeamA') ? this.players : this.opponents;
        let defendingPlayers = (team === 'TeamA') ? this.opponents : this.players;

        let attDir = (team === 'TeamA') ? 1 : -1;
        let defDir = -attDir;

        if (type === 'CORNER_KICK') {
            let flagX = Math.sign(this.ball.position.x) * 33.5;
            let flagZ = attDir * 52.5;

            this.ball.position.set(flagX, 0.15, flagZ);

            let taker = null;
            let minDist = 999;
            attackingPlayers.forEach(p => {
                if (p.role !== 'gk') {
                    let d = p.model.position.distanceTo(this.ball.position);
                    if (d < minDist) { minDist = d; taker = p; }
                }
            });

            this.setPieceTaker = taker;
            this.setPieceTaker.hasBall = false;

            taker.model.position.set(flagX - Math.sign(flagX) * 1.5, ALTURA_BASE_Y, flagZ - attDir * 1.5);
            lookAtBola(taker.model, new THREE.Vector3(0, ALTURA_BASE_Y, flagZ - attDir * 10));
            taker.fsm.changeState('SET_PIECE_TAKER');

            let attackersInBox = attackingPlayers.filter(p => p !== taker && p.role !== 'gk');
            let boxPositions = [
                { x: -5, z: flagZ - attDir * 8 },
                { x: 5, z: flagZ - attDir * 8 },
                { x: 0, z: flagZ - attDir * 12 },
                { x: -8, z: flagZ - attDir * 14 },
                { x: 8, z: flagZ - attDir * 14 },
                { x: -2, z: flagZ - attDir * 5 },
                { x: 2, z: flagZ - attDir * 5 },
                { x: -12, z: flagZ - attDir * 18 },
                { x: 12, z: flagZ - attDir * 18 },
                { x: 0, z: flagZ - attDir * 20 }
            ];

            attackersInBox.forEach((p, idx) => {
                let pos = boxPositions[idx] || { x: 0, z: flagZ - attDir * 15 };
                p.model.position.set(pos.x + (Math.random() - 0.5) * 2, ALTURA_BASE_Y, pos.z + (Math.random() - 0.5) * 2);
                p.fsm.changeState('SET_PIECE_WAIT');
                p.dynamicTarget.copy(p.model.position);
            });

            let defendersInBox = defendingPlayers.filter(p => p.role !== 'gk');
            defendersInBox.forEach((p, idx) => {
                let attToMark = attackersInBox[idx % attackersInBox.length];
                if (attToMark) {
                    p.model.position.set(attToMark.model.position.x, ALTURA_BASE_Y, attToMark.model.position.z + defDir * 1.5);
                    p.fsm.changeState('SET_PIECE_WAIT');
                    p.dynamicTarget.copy(p.model.position);
                }
            });

            let defGK = defendingPlayers.find(p => p.role === 'gk');
            if (defGK) {
                defGK.model.position.set(0, ALTURA_BASE_Y, flagZ);
                lookAtBola(defGK.model, this.ball.position);
                defGK.fsm.changeState('SET_PIECE_WAIT');
            }

            let attGK = attackingPlayers.find(p => p.role === 'gk');
            if (attGK) {
                attGK.model.position.set(0, ALTURA_BASE_Y, -flagZ);
                lookAtBola(attGK.model, this.ball.position);
                attGK.fsm.changeState('SET_PIECE_WAIT');
            }

        }
    },
};

