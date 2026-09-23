/*
=============================================================================
SISTEMA DE CONDIÇÕES CLIMÁTICAS E ILUMINAÇÃO (js/weather.js)
=============================================================================
Módulo centralizador de clima e iluminação do estádio:
- Período: 'dia' | 'noite'
- Condição: 'limpo' | 'nublado' | 'encoberto' | 'chuva' (Tempo Fechado com chuva)

Gerencia:
- Iluminação direcional (Sol / Lua), ambiente e nevoeiro (fog)
- Acendimento de holofotes à noite ou em chuva forte
- Nuvens 3D procedurais em movimento com vento
- Partículas de chuva 3D com reposição contínua
=============================================================================
*/

const Weather = {
    periodo: 'dia',      // 'dia' | 'noite'
    condicao: 'limpo',   // 'limpo' | 'nublado' | 'encoberto' | 'chuva'

    scene: null,
    camera: null,
    dirLight: null,
    ambientLight: null,

    cloudGroup: null,
    clouds: [],
    baseSolIntensidade: undefined,   // intensidade do Sol/Lua do preset ativo, antes da sombra das nuvens
    /*
    OPACIDADE DA SOMBRA DAS NUVENS — 0.20 é 20%.

    As nuvens já não entram no mapa de sombras (ver `_criarNuvens`); o que
    faz a sombra delas é este escurecimento da luz direcional, aplicado como
    FRAÇÃO da intensidade do preset e não como valor absoluto — 0.20 fixo
    apagava quase por completo a Lua (0.12) e a chuva de dia (0.25).
    */
    opacidadeSombraNuvem: 0.20,
    rainParticles: null,
    rainCount: 3500,
    rainSpeed: 45,
    rainGeometry: null,
    rainMaterial: null,

    presets: {
        dia: {
            limpo: {
                ceu: 0x87CEEB,
                fogColor: 0x87CEEB,
                fogNear: 150,
                fogFar: 350,
                solColor: 0xffffff,
                solIntensidade: 0.95,
                solPos: [50, 100, 40],
                ambienteColor: 0xffffff,
                ambienteIntensidade: 0.50,
                holofotes: false,
                holofotesIntensidade: 0,
                nuvensVisiveis: true,
                nuvensOpacidade: 0.25,
                nuvensCor: 0xffffff,
                /*
                Eram 2. Pedido: *"Coloca mais 2 de nuves no céu claro."*

                FICA ACIMA DO `nublado`, QUE TEM 3. A escala dos outros três
                presets (3, 4, 5) não foi mexida, portanto o céu limpo passa a
                ter mais nuvens que o nublado. Foi o pedido à letra; quem quiser
                a progressão de volta sobe os outros na mesma proporção.
                */
                nuvensQtd: 4,
                chuva: false
            },
            nublado: {
                ceu: 0x9cb0c4,
                fogColor: 0x9cb0c4,
                fogNear: 100,
                fogFar: 280,
                solColor: 0xfff5e6,
                solIntensidade: 0.65,
                solPos: [40, 90, 35],
                ambienteColor: 0xd4e2f0,
                ambienteIntensidade: 0.45,
                holofotes: true,
                holofotesIntensidade: 0.15,
                nuvensVisiveis: true,
                nuvensOpacidade: 0.60,
                nuvensCor: 0xe0e6ed,
                nuvensQtd: 3,
                chuva: false
            },
            encoberto: {
                ceu: 0x6e7d8c,
                fogColor: 0x6e7d8c,
                fogNear: 60,
                fogFar: 220,
                solColor: 0xdedede,
                solIntensidade: 0.40,
                solPos: [30, 80, 20],
                ambienteColor: 0xb0bac4,
                ambienteIntensidade: 0.38,
                holofotes: true,
                holofotesIntensidade: 0.25,
                nuvensVisiveis: true,
                nuvensOpacidade: 0.85,
                nuvensCor: 0x808b96,
                nuvensQtd: 4,
                chuva: false
            },
            chuva: {
                ceu: 0x36414d,
                fogColor: 0x36414d,
                fogNear: 35,
                fogFar: 160,
                solColor: 0x8a99a8,
                solIntensidade: 0.25,
                solPos: [20, 70, 10],
                ambienteColor: 0x6c7b8a,
                ambienteIntensidade: 0.30,
                holofotes: true,
                holofotesIntensidade: 0.5,
                nuvensVisiveis: true,
                nuvensOpacidade: 0.95,
                nuvensCor: 0x3a424b,
                nuvensQtd: 5,
                chuva: true
            }
        },
        noite: {
            limpo: {
                ceu: 0x070b14,
                fogColor: 0x070b14,
                fogNear: 120,
                fogFar: 300,
                solColor: 0x8fa4d4,
                solIntensidade: 0.12,
                solPos: [30, 80, 40],
                ambienteColor: 0x1a2638,
                ambienteIntensidade: 0.18,
                holofotes: true,
                holofotesIntensidade: 0.7, // Holofotes bem mais fortes de noite
                nuvensVisiveis: true,
                nuvensOpacidade: 0.20,
                nuvensCor: 0x1f2b3e,
                // Eram 1. O mesmo "+2" do céu limpo de dia — `limpo` é o
                // mesmo céu, e deixá-lo em 1 punha a noite limpa com menos
                // nuvens do que antes tinha o dia limpo.
                nuvensQtd: 3,
                chuva: false
            },
            nublado: {
                ceu: 0x0c1322,
                fogColor: 0x0c1322,
                fogNear: 90,
                fogFar: 250,
                solColor: 0x7588b0,
                solIntensidade: 0.10,
                solPos: [30, 80, 40],
                ambienteColor: 0x162030,
                ambienteIntensidade: 0.16,
                holofotes: true,
                holofotesIntensidade: 0.7,
                nuvensVisiveis: true,
                nuvensOpacidade: 0.45,
                nuvensCor: 0x1c2738,
                nuvensQtd: 3,
                chuva: false
            },
            encoberto: {
                ceu: 0x111622,
                fogColor: 0x111622,
                fogNear: 50,
                fogFar: 200,
                solColor: 0x5a6a8a,
                solIntensidade: 0.07,
                solPos: [20, 70, 30],
                ambienteColor: 0x121824,
                ambienteIntensidade: 0.14,
                holofotes: true,
                holofotesIntensidade: 0.7,
                nuvensVisiveis: true,
                nuvensOpacidade: 0.75,
                nuvensCor: 0x151b26,
                nuvensQtd: 4,
                chuva: false
            },
            chuva: {
                ceu: 0x080b12,
                fogColor: 0x080b12,
                fogNear: 30,
                fogFar: 140,
                solColor: 0x42506b,
                solIntensidade: 0.05,
                solPos: [10, 60, 20],
                ambienteColor: 0x0d131d,
                ambienteIntensidade: 0.12,
                holofotes: true,
                holofotesIntensidade: 0.7,
                nuvensVisiveis: true,
                nuvensOpacidade: 0.95,
                nuvensCor: 0x0f141e,
                nuvensQtd: 5,
                chuva: true
            }
        }
    },

    init(scene, camera) {
        this.scene = scene || window.sceneCore;
        this.camera = camera || window.cameraCore;
        this.dirLight = window.dirLightCore;
        this.ambientLight = window.ambientLightCore;

        if (!this.scene) return;

        if (!this.scene.fog) {
            this.scene.fog = new THREE.Fog(0x87CEEB, 150, 350);
        }

        this._criarNuvens();
        this._criarChuva();
        this.apply();
    },

    setPeriodo(p) {
        if (p !== 'dia' && p !== 'noite') return;
        this.periodo = p;
        window.jogoNoturno = (p === 'noite');
        this.apply();
        this._atualizarUI();
    },

    setCondicao(c) {
        if (!['limpo', 'nublado', 'encoberto', 'chuva'].includes(c)) return;
        this.condicao = c;
        this.apply();
        this._atualizarUI();
    },

    setTempo(periodo, condicao) {
        if (periodo) this.periodo = periodo;
        if (condicao) this.condicao = condicao;
        window.jogoNoturno = (this.periodo === 'noite');
        this.apply();
        this._atualizarUI();
    },

    apply() {
        if (!this.scene) return;

        this.dirLight = this.dirLight || window.dirLightCore;
        this.ambientLight = this.ambientLight || window.ambientLightCore;

        const pConfig = (this.presets[this.periodo] && this.presets[this.periodo][this.condicao])
            || this.presets.dia.limpo;

        // 1. Cor do fundo (Céu)
        this.scene.background = new THREE.Color(pConfig.ceu);

        // 2. Fog
        if (this.scene.fog) {
            if (this.scene.fog.isFog) {
                this.scene.fog.color.setHex(pConfig.fogColor);
                this.scene.fog.near = pConfig.fogNear;
                this.scene.fog.far = pConfig.fogFar;
            } else if (this.scene.fog.isFogExp2) {
                this.scene.fog.color.setHex(pConfig.fogColor);
                this.scene.fog.density = 2 / pConfig.fogFar;
            }
        } else {
            this.scene.fog = new THREE.Fog(pConfig.fogColor, pConfig.fogNear, pConfig.fogFar);
        }

        // 3. Luz solar/lunar
        if (this.dirLight) {
            this.baseSolIntensidade = pConfig.solIntensidade;
            this.dirLight.intensity = pConfig.solIntensidade;
            this.dirLight.color.setHex(pConfig.solColor);
            if (pConfig.solPos) {
                this.dirLight.position.set(pConfig.solPos[0], pConfig.solPos[1], pConfig.solPos[2]);
            }
        }

        // 4. Luz ambiente
        if (this.ambientLight) {
            this.ambientLight.intensity = pConfig.ambienteIntensidade;
            this.ambientLight.color.setHex(pConfig.ambienteColor);
        }

        // 5. Holofotes
        const HF = window.holofotes;
        const HConfig = (typeof Holofotes !== 'undefined') ? Holofotes : null;
        if (HF && HConfig) {
            const ligarHolofotes = pConfig.holofotes;
            const intensidade = pConfig.holofotesIntensidade || HConfig.intensidadeLuz;
            for (const l of HF.luzes) {
                l.intensity = ligarHolofotes ? intensidade : 0;
            }
            if (HF.matLampada) {
                HF.matLampada.color.setHex(ligarHolofotes ? HConfig.corLampadaAcesa : HConfig.corLampadaApagada);
                HF.matLampada.emissive.setHex(ligarHolofotes ? HConfig.corLampadaAcesa : 0x000000);
                HF.matLampada.emissiveIntensity = ligarHolofotes ? (this.periodo === 'noite' ? 2.0 : 1.0) : 0;
            }
        }

        // 6. Nuvens
        this._atualizarNuvens(pConfig);

        // 7. Chuva
        if (this.rainParticles) {
            this.rainParticles.visible = pConfig.chuva;
        }
    },

    _criarNuvens() {
        if (this.cloudGroup) return;

        this.cloudGroup = new THREE.Group();
        this.cloudGroup.name = "Weather_Clouds";

        // Geometrias triplicadas (base 6x6x6) para grandes nuvens voxel
        const boxMainGeom = new THREE.BoxGeometry(6, 6, 6);
        const boxLargeGeom = new THREE.BoxGeometry(10.5, 10.5, 10.5);
        const boxSmallGeom = new THREE.BoxGeometry(3, 3, 3);
        const boxMicroGeom = new THREE.BoxGeometry(1.8, 1.8, 1.8);

        const numClouds = 5;
        this.clouds = [];

        for (let i = 0; i < numClouds; i++) {
            const mat = new THREE.MeshLambertMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.85,
                alphaTest: 0.05
            });

            const cloudCluster = new THREE.Group();

            const tipo = Math.random();
            let widthBlocks, lengthBlocks, heightBlocks;

            if (tipo < 0.35) {
                widthBlocks = 6 + Math.floor(Math.random() * 5);
                lengthBlocks = 6 + Math.floor(Math.random() * 5);
                heightBlocks = 4 + Math.floor(Math.random() * 4);
            } else if (tipo < 0.70) {
                widthBlocks = 10 + Math.floor(Math.random() * 6);
                lengthBlocks = 4 + Math.floor(Math.random() * 4);
                heightBlocks = 2 + Math.floor(Math.random() * 3);
            } else {
                widthBlocks = 5 + Math.floor(Math.random() * 4);
                lengthBlocks = 5 + Math.floor(Math.random() * 4);
                heightBlocks = 3 + Math.floor(Math.random() * 3);
            }

            const halfW = widthBlocks / 2;
            const halfL = lengthBlocks / 2;

            for (let bx = -Math.floor(halfW); bx <= Math.floor(halfW); bx++) {
                for (let bz = -Math.floor(halfL); bz <= Math.floor(halfL); bz++) {
                    for (let by = 0; by < heightBlocks; by++) {
                        const distNorm = Math.sqrt((bx / halfW) ** 2 + (bz / halfL) ** 2 + ((by - heightBlocks * 0.3) / (heightBlocks * 0.7)) ** 2);

                        if (distNorm <= 1.0 + Math.random() * 0.3) {
                            let geom = boxMainGeom;
                            if (distNorm < 0.4 && Math.random() < 0.35) {
                                geom = boxLargeGeom;
                            } else if (distNorm > 0.8 && Math.random() < 0.4) {
                                geom = boxSmallGeom;
                            }

                            const mesh = new THREE.Mesh(geom, mat);
                            mesh.position.set(
                                bx * 6 + (Math.random() - 0.5) * 1.2,
                                by * 6 + (Math.random() - 0.5) * 1.2,
                                bz * 6 + (Math.random() - 0.5) * 1.2
                            );

                            /*
                            A NUVEM NÃO ENTRA NO MAPA DE SOMBRAS.

                            Relato: *"as sombras das nuvens estão muito hard;
                            gostaria de só uma opacidade de 20% nas sombras"*.
                            E estavam: cada caixa da nuvem projetava no mesmo
                            mapa de sombras dos jogadores, a 100% e com recorte
                            duro — o `alphaTest` da matéria dá uma sombra
                            binária, a opacidade dela não conta para nada.

                            Não há opacidade de sombra por objeto: a dureza é
                            da LUZ, e o `shadow.intensity` do Three só existe
                            da r165 para cima — o jogo corre com a r128 do CDN
                            (ver index.html). Baixar o contraste pela luz
                            apagaria também as sombras dos jogadores.

                            Por isso a nuvem sai do mapa e a sombra dela passa
                            a ser o escurecimento suave da luz à passagem, a
                            20% (ver `opacidadeSombraNuvem` e o `update`).
                            De caminho poupa-se o mapa: são centenas de caixas
                            por nuvem que deixam de ser desenhadas nele.

                            `receiveShadow` cai pela mesma razão — não há nada
                            por cima das nuvens que lhes faça sombra.
                            */
                            mesh.castShadow = false;
                            mesh.receiveShadow = false;

                            cloudCluster.add(mesh);
                        }
                    }
                }
            }

            const numDebris = 14 + Math.floor(Math.random() * 14);
            for (let d = 0; d < numDebris; d++) {
                const geom = (Math.random() < 0.6) ? boxSmallGeom : boxMicroGeom;
                const mesh = new THREE.Mesh(geom, mat);

                const angle = Math.random() * Math.PI * 2;
                const radiusX = (halfW * 6) + 3 + Math.random() * 15;
                const radiusZ = (halfL * 6) + 3 + Math.random() * 15;
                const posY = Math.random() * (heightBlocks * 6 + 9);

                mesh.position.set(
                    Math.cos(angle) * radiusX,
                    posY,
                    Math.sin(angle) * radiusZ
                );

                // Mesma razão do corpo da nuvem, acima.
                mesh.castShadow = false;
                mesh.receiveShadow = false;
                cloudCluster.add(mesh);
            }

            // Alturas das nuvens no céu (entre 45m e 85m)
            const alturaY = 45 + Math.random() * 40;
            cloudCluster.position.set(
                (Math.random() - 0.5) * 360,
                alturaY,
                (Math.random() - 0.5) * 380
            );

            // Velocidade reduzida pela metade: 5 a 15 km/h (1.39m/s a 4.17m/s em unidades 3D)
            const speedKmh = 5 + Math.random() * 10; // 5 a 15 km/h
            const speedMs = speedKmh / 3.6;

            // Dimensões reais do aglomerado (blocos base de 6 unidades), usadas
            // para que uma nuvem grande faça mais sombra do que uma pequena
            cloudCluster.userData = {
                speedX: speedMs,
                speedZ: (Math.random() - 0.5) * 0.25,
                larguraX: widthBlocks * 6,
                larguraZ: lengthBlocks * 6,
                material: mat
            };

            this.cloudGroup.add(cloudCluster);
            this.clouds.push(cloudCluster);
        }

        this.scene.add(this.cloudGroup);
    },

    _atualizarNuvens(pConfig) {
        if (!this.cloudGroup) return;
        this.cloudGroup.visible = pConfig.nuvensVisiveis;
        if (!pConfig.nuvensVisiveis) return;

        const maxVisivel = pConfig.nuvensQtd;
        const cor = new THREE.Color(pConfig.nuvensCor);

        this.clouds.forEach((c, idx) => {
            const visivel = idx < maxVisivel;
            c.visible = visivel;
            if (visivel) {
                c.userData.material.color.copy(cor);
                c.userData.material.opacity = pConfig.nuvensOpacidade;
            }
        });
    },

    _criarChuva() {
        if (this.rainParticles) return;

        const count = this.rainCount;
        const positions = new Float32Array(count * 6);

        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 160;
            const y = Math.random() * 45;
            const z = (Math.random() - 0.5) * 180;

            const len = 0.8 + Math.random() * 0.6;

            positions[i * 6 + 0] = x;
            positions[i * 6 + 1] = y;
            positions[i * 6 + 2] = z;

            positions[i * 6 + 3] = x - 0.1;
            positions[i * 6 + 4] = y - len;
            positions[i * 6 + 5] = z;
        }

        this.rainGeometry = new THREE.BufferGeometry();
        this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        this.rainMaterial = new THREE.LineBasicMaterial({
            color: 0x9ec2e6,
            transparent: true,
            opacity: 0.65,
            depthWrite: false
        });

        this.rainParticles = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
        this.rainParticles.name = "Weather_Rain";
        this.rainParticles.visible = false;
        this.scene.add(this.rainParticles);
    },

    update(dt) {
        let maxSombra = 0;

        // Nuvens só se movem em céu limpo e nublado (estáticas em encoberto e chuva).
        // Em pausa o céu congela, mas a luz continua a convergir (ver mais abaixo).
        const moverNuvens = !window.isPaused
            && (this.condicao === 'limpo' || this.condicao === 'nublado');

        if (this.cloudGroup && this.cloudGroup.visible) {
            const boundsX = 260;
            this.clouds.forEach(c => {
                if (!c.visible) return;

                if (moverNuvens) {
                    c.position.x += c.userData.speedX * dt;
                    c.position.z += c.userData.speedZ * dt;

                    if (c.position.x > boundsX) {
                        c.position.x = -boundsX;
                        c.position.z = (Math.random() - 0.5) * 380;
                    }
                }

                // A sombra só faz sentido para nuvens que passam: em encoberto e chuva
                // as nuvens estão paradas e escurecer aqui daria um escurecimento
                // permanente somado ao preset, que já é escuro por si.
                if (!moverNuvens) return;

                // Quanto está a nuvem a cobrir o centro do campo (X: -85..85, Z: -75..75),
                // alargado pelo tamanho real do aglomerado
                const alcanceX = 85 + c.userData.larguraX * 0.5;
                const alcanceZ = 75 + c.userData.larguraZ * 0.5;
                const distX = Math.abs(c.position.x);
                const distZ = Math.abs(c.position.z);
                if (distX < alcanceX && distZ < alcanceZ) {
                    const fatorX = Math.max(0, 1 - distX / alcanceX);
                    const fatorZ = Math.max(0, 1 - distZ / alcanceZ);
                    const fator = fatorX * fatorZ;
                    if (fator > maxSombra) maxSombra = fator;
                }
            });
        }

        /*
        A SOMBRA DA NUVEM, agora que ela não entra no mapa de sombras: um
        escurecimento suave da luz direcional à passagem. Ver
        `opacidadeSombraNuvem` lá em cima para o valor e o porquê da fração.
        */
        if (this.dirLight && this.baseSolIntensidade !== undefined) {
            const op = (typeof this.opacidadeSombraNuvem === 'number') ? this.opacidadeSombraNuvem : 0.20;
            const solAlvo = this.baseSolIntensidade * (1 - op * maxSombra);
            this.dirLight.intensity += (solAlvo - this.dirLight.intensity) * Math.min(1.0, dt * 2.5);
        }

        // A chuva também congela em pausa, mas só depois de a luz convergir,
        // para não deixar o lerp preso a meio da transição.
        if (window.isPaused) return;

        if (this.rainParticles && this.rainParticles.visible) {
            const attr = this.rainGeometry.attributes.position;
            const pos = attr.array;
            const count = this.rainCount;
            const velY = this.rainSpeed * dt;
            const windX = 3.0 * dt;

            for (let i = 0; i < count; i++) {
                let idx1 = i * 6 + 1;
                let idx2 = i * 6 + 4;

                pos[idx1] -= velY;
                pos[idx2] -= velY;

                pos[i * 6 + 0] += windX;
                pos[i * 6 + 3] += windX;

                if (pos[idx2] < 0) {
                    const newX = (Math.random() - 0.5) * 160;
                    const newY = 35 + Math.random() * 15;
                    const newZ = (Math.random() - 0.5) * 180;
                    const len = 0.8 + Math.random() * 0.6;

                    pos[i * 6 + 0] = newX;
                    pos[i * 6 + 1] = newY;
                    pos[i * 6 + 2] = newZ;

                    pos[i * 6 + 3] = newX - 0.1;
                    pos[i * 6 + 4] = newY - len;
                    pos[i * 6 + 5] = newZ;
                }
            }

            attr.needsUpdate = true;
        }
    },

    _atualizarUI() {
        const selPeriodo = document.getElementById('sel-weather-periodo');
        if (selPeriodo) selPeriodo.value = this.periodo;

        const selCondicao = document.getElementById('sel-weather-condicao');
        if (selCondicao) selCondicao.value = this.condicao;

        const btnPeriodo = document.getElementById('btn-periodo');
        if (btnPeriodo) btnPeriodo.innerText = (this.periodo === 'noite') ? 'Noite' : 'Dia';
    }
};

function definirPeriodo(noite) {
    Weather.setPeriodo(noite ? 'noite' : 'dia');
}

function togglePeriodo() {
    Weather.setPeriodo(Weather.periodo === 'noite' ? 'dia' : 'noite');
}

if (typeof window !== 'undefined') {
    window.Weather = Weather;
    window.definirPeriodo = definirPeriodo;
    window.togglePeriodo = togglePeriodo;
}
