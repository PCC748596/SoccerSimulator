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
                nuvensVisiveis: true,
                nuvensOpacidade: 0.25,
                nuvensCor: 0xffffff,
                nuvensQtd: 12,
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
                holofotes: false,
                nuvensVisiveis: true,
                nuvensOpacidade: 0.60,
                nuvensCor: 0xe0e6ed,
                nuvensQtd: 25,
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
                holofotes: false,
                nuvensVisiveis: true,
                nuvensOpacidade: 0.85,
                nuvensCor: 0x808b96,
                nuvensQtd: 40,
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
                nuvensVisiveis: true,
                nuvensOpacidade: 0.95,
                nuvensCor: 0x3a424b,
                nuvensQtd: 55,
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
                nuvensVisiveis: true,
                nuvensOpacidade: 0.20,
                nuvensCor: 0x1f2b3e,
                nuvensQtd: 10,
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
                nuvensVisiveis: true,
                nuvensOpacidade: 0.45,
                nuvensCor: 0x1c2738,
                nuvensQtd: 22,
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
                nuvensVisiveis: true,
                nuvensOpacidade: 0.75,
                nuvensCor: 0x151b26,
                nuvensQtd: 35,
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
                nuvensVisiveis: true,
                nuvensOpacidade: 0.95,
                nuvensCor: 0x0f141e,
                nuvensQtd: 50,
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
            for (const l of HF.luzes) {
                l.intensity = ligarHolofotes ? HConfig.intensidadeLuz : 0;
            }
            if (HF.matLampada) {
                HF.matLampada.color.setHex(ligarHolofotes ? HConfig.corLampadaAcesa : HConfig.corLampadaApagada);
                HF.matLampada.emissive.setHex(ligarHolofotes ? HConfig.corLampadaAcesa : 0x000000);
                HF.matLampada.emissiveIntensity = ligarHolofotes ? 1.0 : 0;
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

        const cloudGeom = new THREE.DodecahedronGeometry(8, 1);
        const numClouds = 60;
        this.clouds = [];

        for (let i = 0; i < numClouds; i++) {
            const mat = new THREE.MeshLambertMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.5,
                depthWrite: false
            });

            const cloudCluster = new THREE.Group();
            const clusterPuffs = 4 + Math.floor(Math.random() * 4);
            for (let j = 0; j < clusterPuffs; j++) {
                const mesh = new THREE.Mesh(cloudGeom, mat);
                mesh.position.set(
                    (Math.random() - 0.5) * 15,
                    (Math.random() - 0.5) * 4,
                    (Math.random() - 0.5) * 12
                );
                const s = 0.6 + Math.random() * 0.8;
                mesh.scale.set(s, s * 0.5, s);
                cloudCluster.add(mesh);
            }

            cloudCluster.position.set(
                (Math.random() - 0.5) * 300,
                35 + Math.random() * 25,
                (Math.random() - 0.5) * 320
            );

            cloudCluster.userData = {
                speedX: 1.5 + Math.random() * 2.5,
                speedZ: (Math.random() - 0.5) * 0.8,
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
        if (this.cloudGroup && this.cloudGroup.visible) {
            const boundsX = 170;
            this.clouds.forEach(c => {
                if (!c.visible) return;
                c.position.x += c.userData.speedX * dt;
                c.position.z += c.userData.speedZ * dt;

                if (c.position.x > boundsX) {
                    c.position.x = -boundsX;
                    c.position.z = (Math.random() - 0.5) * 320;
                }
            });
        }

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
