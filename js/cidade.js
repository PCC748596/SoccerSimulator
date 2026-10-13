/*
=============================================================================
CIDADE — o que há à volta do estádio
=============================================================================
Constrói os 500 m x 500 m descritos no `CidadeConfig` (js/config/cidade.js):
quarteirões de casas e prédios, ruas e avenidas com faixas e canteiro,
calçadas, postes, semáforos, árvores, paradas de ônibus, metrô elevado com
estação, passarelas de pedestres sobre a avenida de contorno e os
estacionamentos entre o estádio e essa avenida.

CUSTO: é cenário, e o desenho tem de ser barato.

    - A geometria estática é FUNDIDA por material (`CidadeAcumulador`): uma
      malha para o betão e as cores lisas, uma para as paredes com janelas,
      uma para a pintura do asfalto, e assim por diante. São algumas dezenas
      de draw calls para a cidade toda, não uma por prédio.
    - Árvores e carros são InstancedMesh.
    - Nada projecta nem recebe sombra: a câmara de sombras só cobre o campo.
    - Materiais Lambert, que iluminam por vértice. Os holofotes de noite são
      SpotLights reais e um material Standard pagava cada uma por pixel.

O QUE SE MEXE (`update`): os carros e ônibus nas vias, os dois comboios do
metrô, e o dia/noite — lê `Weather.periodo` e acende as janelas e os postes.
Tudo o resto é estático.

É DETERMINISTA (semente do config): senão duas capturas de ecrã não batiam.
=============================================================================
*/

class CidadeAcumulador {
    /*
    Dois modos. `instancias` (o da cidade): cada forma que entra é uma INSTÂNCIA de
    uma forma-unidade (caixa, cilindro, plano, telhado, painel) com a sua matriz e a
    sua cor, e `malha` devolve um InstancedMesh por forma. `fundido` (o dos
    comboios, que têm de ser UMA malha clonável): junta os vértices numa só.
    */
    constructor(modo) {
        this.modo = modo || 'instancias';
        this.inst = new Map();
        this.partes = [];
        this.base = new THREE.Matrix4();   // transformação aplicada a tudo o que entra
        this._cores = new Map();
    }

    _cor(hex) {
        let c = this._cores.get(hex);
        if (!c) { const t = new THREE.Color(hex); c = [t.r, t.g, t.b]; this._cores.set(hex, c); }
        return c;
    }

    _matriz(x, y, z, sx, sy, sz, ry, rz) {
        const T = CidadeAcumulador._tmp;
        T.q.setFromEuler(T.e.set(0, ry || 0, rz || 0, 'XYZ'));
        T.p.set(x, y, z); T.s.set(sx, sy, sz);
        T.M.compose(T.p, T.q, T.s);
        return T.M.premultiply(this.base);
    }

    // `un`: {pos, nor, uv} não indexados; `uv` substitui o da forma.
    forma(un, M, hex, uv) {
        if (this.modo === 'instancias') {
            let l = this.inst.get(un.nome);
            if (!l) { l = { un, m: [], c: [] }; this.inst.set(un.nome, l); }
            l.m.push(new Float32Array(M.elements)); l.c.push(hex);
            return;
        }
        const T = CidadeAcumulador._tmp;
        const n = un.pos.length / 3;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
        const e = M.elements;
        const ne = T.N.getNormalMatrix(M).elements;
        const c = this._cor(hex);
        for (let i = 0; i < n; i++) {
            const x = un.pos[3 * i], y = un.pos[3 * i + 1], z = un.pos[3 * i + 2];
            pos[3 * i] = e[0] * x + e[4] * y + e[8] * z + e[12];
            pos[3 * i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
            pos[3 * i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
            const a = un.nor[3 * i], b = un.nor[3 * i + 1], d = un.nor[3 * i + 2];
            let nx = ne[0] * a + ne[3] * b + ne[6] * d;
            let ny = ne[1] * a + ne[4] * b + ne[7] * d;
            let nz = ne[2] * a + ne[5] * b + ne[8] * d;
            const l = Math.hypot(nx, ny, nz) || 1;
            nor[3 * i] = nx / l; nor[3 * i + 1] = ny / l; nor[3 * i + 2] = nz / l;
            col[3 * i] = c[0]; col[3 * i + 1] = c[1]; col[3 * i + 2] = c[2];
        }
        this.partes.push({ pos, nor, col, uv: uv || un.uv });
    }

    /*
    Caixa de base em y0. Com `jan`, o UV põe a textura das janelas em escala
    real: a textura é um bloco de 4x4 janelas de 3 x `alturaPiso` m, e o tecto
    e o chão ficam num ponto de parede lisa.
    */
    caixa(cx, y0, cz, w, h, d, cor, ry, jan, rz) {
        const U = CidadeAcumulador.U;
        const M = this._matriz(cx, y0 + h / 2, cz, w, h, d, ry, rz);
        let uv = null;
        if (jan) {
            const piso = CidadeConfig.alturaPiso;
            uv = new Float32Array(72);
            for (let f = 0; f < 6; f++) {
                const larg = (f < 2) ? d : w;
                for (let k = 0; k < 6; k++) {
                    const i = f * 6 + k;
                    if (f === 2 || f === 3) { uv[2 * i] = 0.01; uv[2 * i + 1] = 0.01; }
                    else {
                        uv[2 * i] = U.caixa.uv[2 * i] * larg / 12;
                        uv[2 * i + 1] = U.caixa.uv[2 * i + 1] * h / (piso * 4);
                    }
                }
            }
        }
        this.forma(U.caixa, M, cor, uv);
    }

    // Painel vertical (grade) entre dois pontos do chão; o UV repete a barra a cada 0.25 m.
    painel(x0, z0, x1, z1, y0, h, cor) {
        const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
        if (len < 0.05) return;
        const U = CidadeAcumulador.U;
        const M = this._matriz((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2, len, h, 1, Math.atan2(-dz, dx), 0);
        const uv = new Float32Array(U.painel.uv.length);
        for (let i = 0; i < uv.length; i += 2) { uv[i] = U.painel.uv[i] * len / 0.25; uv[i + 1] = U.painel.uv[i + 1]; }
        this.forma(U.painel, M, cor, uv);
    }

    cilindro(cx, y0, cz, diam, h, cor) {
        this.forma(CidadeAcumulador.U.cil, this._matriz(cx, y0 + h / 2, cz, diam, h, diam, 0, 0), cor);
    }

    plano(cx, y, cz, w, d, cor, ry) {
        this.forma(CidadeAcumulador.U.plano, this._matriz(cx, y, cz, w, 1, d, ry, 0), cor);
    }

    // Telhado de duas águas. `ao`: largura transversal à cumeeira; `along`: o comprimento dela.
    telhado(cx, y0, cz, ao, h, along, cor, ry) {
        this.forma(CidadeAcumulador.U.telhado, this._matriz(cx, y0 + h / 2, cz, ao, h, along, ry, 0), cor);
    }

    malha(mat) {
        if (this.modo === 'instancias') {
            if (!this.inst.size) return null;
            const grupo = new THREE.Group();
            const cor = new THREE.Color();
            for (const l of this.inst.values()) {
                const m = new THREE.InstancedMesh(CidadeAcumulador.geoUnidade(l.un), mat, l.m.length);
                for (let i = 0; i < l.m.length; i++) { m.instanceMatrix.array.set(l.m[i], i * 16); m.setColorAt(i, cor.setHex(l.c[i])); }
                m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
                m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
                m.name = 'Cidade_' + l.un.nome;
                grupo.add(m);
            }
            return grupo;
        }
        if (!this.partes.length) return null;
        let total = 0, totalUv = 0;
        for (const p of this.partes) { total += p.pos.length; totalUv += p.uv.length; }
        const pos = new Float32Array(total), nor = new Float32Array(total), col = new Float32Array(total);
        const uv = new Float32Array(totalUv);
        let o = 0, ou = 0;
        for (const p of this.partes) {
            pos.set(p.pos, o); nor.set(p.nor, o); col.set(p.col, o); uv.set(p.uv, ou);
            o += p.pos.length; ou += p.uv.length;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        const m = new THREE.Mesh(g, mat);
        m.castShadow = false; m.receiveShadow = false;
        return m;
    }
}

// A geometria de uma forma-unidade, partilhada por todos os InstancedMesh dessa forma.
CidadeAcumulador.geoUnidade = function (un) {
    if (!un.geo) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(un.pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(un.nor, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(un.uv, 2));
        un.geo = g;
    }
    return un.geo;
};

const Cidade = {
    grupo: null,
    inventario: null,
    gente: null,
    dados: null,
    _parados: null,
    edificios: [],        // pegadas {tipo, x0, x1, z0, z1, alt}, para os testes
    vias: [],
    reservas: [],
    _veiculos: [],
    _trens: [],
    _noite: null,
    _mats: null,
    _inst: null,

    _rng(s) {
        let a = s | 0;
        return () => {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    _unidades() {
        if (CidadeAcumulador.U) return CidadeAcumulador.U;
        CidadeAcumulador._tmp = {
            q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(),
            s: new THREE.Vector3(), M: new THREE.Matrix4(), N: new THREE.Matrix3()
        };
        const nu = g => {
            const n = g.index ? g.toNonIndexed() : g;
            return {
                pos: n.attributes.position.array, nor: n.attributes.normal.array,
                uv: n.attributes.uv ? n.attributes.uv.array : new Float32Array(n.attributes.position.count * 2)
            };
        };
        // Prisma triangular: base em y = -0.5, cumeeira em y = +0.5 ao longo de z.
        const P = [], N = [];
        const tri = (a, b, c, want) => {
            const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) { const t = b; b = c; c = t; }
            const l = Math.hypot(want[0], want[1], want[2]);
            for (const q of [a, b, c]) { P.push(q[0], q[1], q[2]); N.push(want[0] / l, want[1] / l, want[2] / l); }
        };
        const A = [-.5, -.5, -.5], B = [.5, -.5, -.5], C = [0, .5, -.5];
        const A2 = [-.5, -.5, .5], B2 = [.5, -.5, .5], C2 = [0, .5, .5];
        tri(A, B, C, [0, 0, -1]); tri(A2, B2, C2, [0, 0, 1]);
        tri(A, A2, C, [-1, .5, 0]); tri(A2, C2, C, [-1, .5, 0]);
        tri(B, B2, C, [1, .5, 0]); tri(B2, C2, C, [1, .5, 0]);
        tri(A, B, A2, [0, -1, 0]); tri(B, B2, A2, [0, -1, 0]);
        CidadeAcumulador.U = {
            caixa: nu(new THREE.BoxGeometry(1, 1, 1)),
            cil: nu(new THREE.CylinderGeometry(.5, .5, 1, 8, 1)),
            plano: nu(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
            painel: nu(new THREE.PlaneGeometry(1, 1)),
            telhado: { pos: new Float32Array(P), nor: new Float32Array(N), uv: new Float32Array(P.length / 3 * 2) }
        };
        for (const k of Object.keys(CidadeAcumulador.U)) CidadeAcumulador.U[k].nome = k;
        return CidadeAcumulador.U;
    },

    // Janelas: 4x4 por bloco; um canal de cor e outro (emissivo) com as acesas de noite.
    _texturaJanelas(acesas) {
        if (typeof document === 'undefined') return null;
        const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const g = cv.getContext('2d');
        g.fillStyle = acesas ? '#000' : '#f1efe9'; g.fillRect(0, 0, 256, 256);
        const r = this._rng(77);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
            const x = i * 64 + 14, y = j * 64 + 12, w = 36, h = 38;
            if (acesas) {
                if (r() < 0.45) { g.fillStyle = r() < 0.7 ? '#ffd98a' : '#cfe6ff'; g.fillRect(x, y, w, h); }
            } else {
                g.fillStyle = '#2b3c4e'; g.fillRect(x, y, w, h);
                g.fillStyle = '#4d6a85'; g.fillRect(x, y, w, 8);
                g.fillStyle = '#d7d4cc'; g.fillRect(x - 3, y + h, w + 6, 4);
            }
        }
        const t = new THREE.CanvasTexture(cv);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
        return t;
    },

    // Disco de luz com queda suave, para as poças dos postes.
    _texturaPoca() {
        if (typeof document === 'undefined') return null;
        const cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const g = cv.getContext('2d');
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)');
        gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(cv);
    },

    _rotulo(texto, w, h, fundo, tinta, disco) {
        if (typeof document === 'undefined') return null;
        const cv = document.createElement('canvas');
        cv.width = disco ? 128 : 512; cv.height = disco ? 128 : Math.round(512 * h / w);
        const g = cv.getContext('2d');
        if (disco) {
            g.fillStyle = fundo; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
            g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
            g.fillStyle = tinta; g.font = 'bold 86px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(texto, 64, 70);
        } else {
            g.fillStyle = fundo; g.fillRect(0, 0, cv.width, cv.height);
            g.fillStyle = tinta; g.font = 'bold ' + Math.round(cv.height * 0.6) + 'px sans-serif';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(texto, cv.width / 2, cv.height / 2 + 4);
        }
        const mat = new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide, transparent: !!disco, alphaTest: disco ? 0.5 : 0
        });
        return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    },

    remover() {
        if (!this.grupo) return;
        if (this.grupo.parent) this.grupo.parent.remove(this.grupo);
        this.grupo.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material && o.material.map && o.material.map.dispose) o.material.map.dispose();
        });
        this.grupo = null; this._veiculos = []; this._trens = []; this._noite = null;
        if (this.gente && this.gente.limpar) this.gente.limpar();
        this.gente = null; this.dados = null; this._parados = null;
    },

    construir(cena) {
        const C = CidadeConfig;
        const rnd = this._rng(C.semente);
        const pick = a => a[Math.floor(rnd() * a.length) % a.length];
        this.remover();
        this._unidades();

        const comTex = typeof document !== 'undefined';
        // A cor vem da instância (instanceColor). `fundido` é só para os comboios, que são uma malha.
        const mats = this._mats = {
            liso: new THREE.MeshLambertMaterial({}),
            jan: new THREE.MeshLambertMaterial({
                map: this._texturaJanelas(false),
                emissiveMap: this._texturaJanelas(true), emissive: 0xffffff, emissiveIntensity: 0
            }),
            marc: new THREE.MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
            lamp: new THREE.MeshLambertMaterial({ emissive: 0xffe2a0, emissiveIntensity: 0 }),
            brilho: new THREE.MeshBasicMaterial({}),
            grade: new THREE.MeshLambertMaterial({ map: this._texturaGrade(), alphaTest: 0.5, side: THREE.DoubleSide }),
            fundido: new THREE.MeshLambertMaterial({ vertexColors: true })
        };
        if (!comTex) { mats.grade.map = null; mats.jan.map = null; mats.jan.emissiveMap = null; }
        // Uma instância da caixa é um cubo unitário esticado: o UV das janelas (e o das barras da
        // grade) tem de sair da ESCALA da instância, o que só o vertex shader sabe.
        const piso4 = (C.alturaPiso * 4).toFixed(2);
        mats.jan.onBeforeCompile = sh => {
            sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
                #ifdef USE_INSTANCING
                float sxI = length(instanceMatrix[0].xyz), syI = length(instanceMatrix[1].xyz), szI = length(instanceMatrix[2].xyz);
                if (abs(normal.y) > 0.5) vUv = vec2(0.01);
                else if (abs(normal.x) > 0.5) vUv = vec2(uv.x * szI / 12.0, uv.y * syI / ${piso4});
                else vUv = vec2(uv.x * sxI / 12.0, uv.y * syI / ${piso4});
                #endif`);
        };
        mats.jan.customProgramCacheKey = () => 'cidade-janelas';
        mats.grade.onBeforeCompile = sh => {
            sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
                #ifdef USE_INSTANCING
                vUv = vec2(uv.x * length(instanceMatrix[0].xyz) / 0.25, uv.y);
                #endif`);
        };
        mats.grade.customProgramCacheKey = () => 'cidade-grade';

        const liso = new CidadeAcumulador(), jan = new CidadeAcumulador(), marc = new CidadeAcumulador();
        const lamp = new CidadeAcumulador(), brilho = new CidadeAcumulador(), grade = new CidadeAcumulador();
        const grupo = new THREE.Group();
        grupo.name = 'Cidade';
        const extras = [];     // rótulos soltos
        const arvores = [], carrosParados = [];
        const pocas = [];      // poças de luz no chão: [x, z, raio]
        const zebras = [], corredores = [], portoesDados = [], bocasDados = [];
        const inv = {
            casas: 0, predios: 0, quarteiroes: 0, parques: 0, postes: 0, semaforos: 0, faixasPedestres: 0,
            paradasOnibus: 0, passarelas: 0, vagas: 0, carrosParados: 0, arvores: 0,
            metro: { pilares: 0, estacoes: 0, trens: 0, bocas: 0 }, estacionamentos: 0
        };
        this.edificios = []; this.reservas = [];
        const reservas = this.reservas;
        const reservar = (x0, x1, z0, z1, lote) => reservas.push({ x0, x1, z0, z1, lote: lote !== false });
        const reservado = (x, z, m) => reservas.some(r => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m);
        const retReservado = (x0, x1, z0, z1, m) => reservas.some(r => r.lote && x1 > r.x0 - m && x0 < r.x1 + m && z1 > r.z0 - m && z0 < r.z1 + m);
        const cor = C.cores;
        const H = C.alturaPiso;
        const R = C.meia;

        // ---- chão -----------------------------------------------------------
        const terra = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
            new THREE.MeshLambertMaterial({ color: cor.terra }));
        terra.position.y = C.yTerra;
        const asfalto = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2).rotateX(-Math.PI / 2),
            new THREE.MeshLambertMaterial({ color: cor.asfalto }));
        asfalto.position.y = C.yAsfalto;
        grupo.add(terra, asfalto);

        // ---- vias -----------------------------------------------------------
        const vias = this.vias = C.vias.map(v => {
            const h = v.w / 2;
            return v.eixo === 'z'
                ? Object.assign({ x0: v.c - h, x1: v.c + h, z0: v.a, z1: v.b, ocupa: [], avenida: v.w >= 20 }, v)
                : Object.assign({ x0: v.a, x1: v.b, z0: v.c - h, z1: v.c + h, ocupa: [], avenida: v.w >= 20 }, v);
        });
        const dentroDeOutra = (v, x, z, m) => vias.some(o => o !== v && x > o.x0 - m && x < o.x1 + m && z > o.z0 - m && z < o.z1 + m);
        const cruz = [];
        for (const vz of vias.filter(v => v.eixo === 'z')) {
            for (const vx of vias.filter(v => v.eixo === 'x')) {
                if (vz.c >= vx.a - 0.01 && vz.c <= vx.b + 0.01 && vx.c >= vz.a - 0.01 && vx.c <= vz.b + 0.01) {
                    cruz.push({ x: vz.c, z: vx.c, vz, vx });
                }
            }
        }
        // Troços de uma via livres de cruzamentos (e de passadeiras a meio).
        const livres = (v, margem) => {
            let ivs = [[v.a, v.b]];
            const cortes = cruz.filter(k => k.vz === v || k.vx === v).map(k => v.eixo === 'z'
                ? [k.z - k.vx.w / 2 - margem, k.z + k.vx.w / 2 + margem]
                : [k.x - k.vz.w / 2 - margem, k.x + k.vz.w / 2 + margem]).concat(v.ocupa);
            for (const c of cortes) {
                const nv = [];
                for (const [p, q] of ivs) {
                    if (c[1] <= p || c[0] >= q) nv.push([p, q]);
                    else {
                        if (c[0] - p > 0.5) nv.push([p, c[0]]);
                        if (q - c[1] > 0.5) nv.push([c[1], q]);
                    }
                }
                ivs = nv;
            }
            return ivs;
        };
        // Ponto sobre a via: t ao longo do eixo, d lateral.
        const pt = (v, t, d) => v.eixo === 'z' ? [v.c + d, t] : [t, v.c + d];

        // ---- reservas (passarelas, metrô, paradas) antes dos quarteirões ---
        const PP = C.passarela;
        const passarelas = C.passarelas.map(p => {
            const v = vias.find(q => q.eixo !== p.ao && q.c === (p.ao === 'x' ? p.x : p.z) && (p.ao === 'x' ? p.z : p.x) > q.a && (p.ao === 'x' ? p.z : p.x) < q.b);
            return Object.assign({ via: v, hr: v ? v.w / 2 : 12 }, p);
        });
        for (const p of passarelas) {
            const l0 = p.hr + PP.folgaAteAvenida, l1 = l0 + PP.rampa, hw = PP.largura / 2 + 0.3;
            for (const e of [-1, 1]) {
                const a = Math.min(e * l0, e * l1), b = Math.max(e * l0, e * l1);
                if (p.ao === 'x') reservar(p.x + a, p.x + b, p.z - hw, p.z + hw);
                else reservar(p.x - hw, p.x + hw, p.z + a, p.z + b);
            }
            // pilar do canteiro
            reservar(p.x - 1.5, p.x + 1.5, p.z - 1.5, p.z + 1.5);
            if (p.via) p.via.ocupa.push([(p.ao === 'x' ? p.z : p.x) - 1.5, (p.ao === 'x' ? p.z : p.x) + 1.5]);
        }

        const M = C.metro;
        const viaMetro = vias.find(v => v.metro);
        const pilaresMetro = [];
        const escadasEstacao = [];
        if (viaMetro) {
            for (let x = -R + 12; x <= R - 12; x += M.passoPilares) {
                if (vias.some(o => o.eixo === 'z' && o.z0 < viaMetro.c && o.z1 > viaMetro.c && x > o.x0 - 2 && x < o.x1 + 2)) continue;
                pilaresMetro.push(x);
                reservar(x - 1.2, x + 1.2, viaMetro.c - 1.2, viaMetro.c + 1.2);
            }
            // Escadas da estação: 4, duas para cada lado do viaduto.
            for (const sx of [-20, 20]) for (const sz of [-1, 1]) {
                const z0 = viaMetro.c + sz * (M.estacaoLarg / 2 - 0.6);
                const z1 = z0 + sz * 20;
                escadasEstacao.push({ x: M.estacaoX + sx, z0, z1, sz });
                reservar(M.estacaoX + sx - 2.1, M.estacaoX + sx + 2.1, Math.min(z0, z1), Math.max(z0, z1));
            }
        }
        for (const b of M.bocas) reservar(b.x - 3.5, b.x + 3.5, b.z - 4, b.z + 4);

        // Paradas de ônibus: nas avenidas, em troços livres, dos dois lados.
        const paradas = [];
        let alternar = 1;
        for (const v of vias.filter(q => q.avenida && !q.metro)) {
            for (const [p, q] of livres(v, 8)) {
                if (q - p < 30) continue;
                for (const f of (q - p < 60 ? [0.4] : [0.3, 0.65])) {
                    alternar = -alternar;
                    const t = p + (q - p) * f;
                    const d = alternar * (v.w / 2 + 2.6);
                    const [x, z] = pt(v, t, d);
                    if (reservado(x, z, 5) || dentroDeOutra(v, x, z, 0)) continue;
                    paradas.push({ v, t, lado: alternar, x, z, esperando: [] });
                    reservar(x - 3.2, x + 3.2, z - 3.2, z + 3.2, false);
                    v.ocupa.push([t + 4, t + 10]);     // passadeira a meio, ao lado da parada
                }
            }
        }

        // ---- quarteirões ----------------------------------------------------
        const xs = new Set([-R, R, -C.esplanada.meiaX, C.esplanada.meiaX]);
        const zs = new Set([-R, R, -C.esplanada.meiaZ, C.esplanada.meiaZ]);
        for (const v of vias) {
            if (v.eixo === 'z') { xs.add(v.x0); xs.add(v.x1); zs.add(v.a); zs.add(v.b); }
            else { zs.add(v.z0); zs.add(v.z1); xs.add(v.a); xs.add(v.b); }
        }
        const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
        const celulas = [];
        for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Z.length - 1; j++) {
            const c = { x0: X[i], x1: X[i + 1], z0: Z[j], z1: Z[j + 1] };
            if (c.x1 - c.x0 < 14 || c.z1 - c.z0 < 14) continue;
            const mx = (c.x0 + c.x1) / 2, mz = (c.z0 + c.z1) / 2;
            if (vias.some(v => mx > v.x0 && mx < v.x1 && mz > v.z0 && mz < v.z1)) continue;
            if (Math.abs(mx) < C.esplanada.meiaX && Math.abs(mz) < C.esplanada.meiaZ) continue;
            celulas.push(c);
        }
        // Os parques: os quarteirões mais próximos destes pontos.
        for (const alvo of [[-110, -176], [110, 176], [-222, 50], [222, -50]]) {
            let melhor = null, dm = 1e9;
            for (const c of celulas) {
                if (c.parque) continue;
                const d = Math.hypot((c.x0 + c.x1) / 2 - alvo[0], (c.z0 + c.z1) / 2 - alvo[1]);
                if (d < dm) { dm = d; melhor = c; }
            }
            if (melhor) { melhor.parque = true; inv.parques++; }
        }

        const lawn = cor.gramaLote;
        const alturaLote = C.alturaLote, yCal = C.alturaCalcada;
        const registar = (tipo, x0, x1, z0, z1, alt) => this.edificios.push({ tipo, x0, x1, z0, z1, alt });

        const casa = (u0, u1, v0, v1, sinal, aX) => {
            const W = (a, b) => aX ? [a, b] : [b, a];             // (u, v) -> (x, z)
            const larg = u1 - u0, prof = v1 - v0;
            const w = larg - 4, dep = prof - 9;
            if (w < 5 || dep < 5) return false;
            const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2 - sinal * 0.5;
            const pisos = rnd() < 0.4 ? 2 : 1, h = pisos * H;
            const [cx, cz] = W(uc, vc);
            const [dx, dz] = aX ? [w, dep] : [dep, w];
            jan.caixa(cx, alturaLote, cz, dx, h, dz, pick(C.paredesCasa), 0, true);
            // telhado: cumeeira ao longo do lado maior
            const ao = Math.min(w, dep) + 1.0, along = Math.max(w, dep) + 0.8;
            const ry = dx >= dz ? Math.PI / 2 : 0;
            liso.telhado(cx, alturaLote + h, cz, ao, 1.6 + rnd() * 0.8, along, pick(C.telhados), ry);
            // porta e garagem na frente
            const vf = vc + sinal * (dep / 2 + 0.05);
            const uPorta = uc + (rnd() - 0.5) * (w - 4);
            const [px, pz] = W(uPorta, vf);
            liso.caixa(px, alturaLote, pz, aX ? 1.0 : 0.12, 2.1, aX ? 0.12 : 1.0, 0x5a3b26);
            const uG = Math.min(uc + w / 2 - 1.8, Math.max(uc - w / 2 + 1.8, uPorta + (uPorta > uc ? -3 : 3)));
            const [gx, gz] = W(uG, vf);
            liso.caixa(gx, alturaLote, gz, aX ? 2.6 : 0.12, 2.2, aX ? 0.12 : 2.6, 0xb7b5ad);
            // muro baixo na frente, com o portão aberto
            const vm = (sinal < 0 ? v0 : v1) - sinal * 0.35;
            const metade = (larg - 0.6) / 2;
            const aberto = 1.4;
            for (const [a, b] of [[uc - metade, uPorta - aberto], [uPorta + aberto, uc + metade]]) {
                if (b - a < 0.5) continue;
                const [mx, mz] = W((a + b) / 2, vm);
                liso.caixa(mx, alturaLote, mz, aX ? b - a : 0.2, 1.0, aX ? 0.2 : b - a, 0xe8e4da);
            }
            registar('casa', cx - dx / 2, cx + dx / 2, cz - dz / 2, cz + dz / 2, h + 2.4);
            inv.casas++;
            return true;
        };

        const predio = (u0, u1, v0, v1, sinal, aX, r) => {
            const W = (a, b) => aX ? [a, b] : [b, a];
            const w = (u1 - u0) - 2.5, dep = (v1 - v0) - 2.5;
            if (w < 6 || dep < 6) return false;
            const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
            const escala = Math.max(0.35, 1 - (r - 150) / 320);
            const pisos = Math.max(4, Math.round((5 + Math.pow(rnd(), 1.6) * 17) * escala));
            const parede = pick(C.paredesPredio);
            const [cx, cz] = W(uc, vc);
            const [dx, dz] = aX ? [w, dep] : [dep, w];
            if (pisos > 9 && rnd() < 0.55) {
                const base = Math.max(3, Math.round(pisos * 0.35));
                jan.caixa(cx, alturaLote, cz, dx, base * H, dz, parede, 0, true);
                const topo = pisos - base;
                jan.caixa(cx, alturaLote + base * H, cz, dx * 0.72, topo * H, dz * 0.72, parede, 0, true);
                liso.caixa(cx, alturaLote + pisos * H, cz, dx * 0.4, 2.6, dz * 0.4, 0x8d9096);
            } else {
                jan.caixa(cx, alturaLote, cz, dx, pisos * H, dz, parede, 0, true);
                liso.caixa(cx + dx * 0.15, alturaLote + pisos * H, cz - dz * 0.1, dx * 0.35, 2.4, dz * 0.35, 0x8d9096);
                if (rnd() < 0.5) liso.cilindro(cx - dx * 0.25, alturaLote + pisos * H, cz + dz * 0.2, 2.2, 3.0, 0x6d747c);
            }
            // marquise da entrada
            const vf = vc + sinal * (dep / 2 + 0.6);
            const [ex, ez] = W(uc, vf);
            liso.caixa(ex, alturaLote + 3.0, ez, aX ? Math.min(8, w * 0.5) : 2.4, 0.25, aX ? 2.4 : Math.min(8, w * 0.5), 0x4a4f57);
            registar('predio', cx - dx / 2, cx + dx / 2, cz - dz / 2, cz + dz / 2, pisos * H + 3);
            inv.predios++;
            return true;
        };

        // sp: 0 folhosa, 1 conífera, 2 palmeira (ver _geoArvores)
        const arvore = (x, z, h, r, c, sp) => arvores.push({ x, z, h, r, c, sp: sp || 0 });

        const parque = (c, nPond) => {
            const x0 = c.x0 + C.calcada, x1 = c.x1 - C.calcada, z0 = c.z0 + C.calcada, z1 = c.z1 - C.calcada;
            liso.caixa((x0 + x1) / 2, yCal, (z0 + z1) / 2, x1 - x0, alturaLote - yCal, z1 - z0, cor.relva);
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
            // caminhos em cruz
            liso.plano(cx, alturaLote + 0.03, cz, 3, z1 - z0, cor.piso);
            liso.plano(cx, alturaLote + 0.03, cz, x1 - x0, 3, cor.piso);
            if (nPond) liso.cilindro(cx + (x1 - x0) * 0.22, alturaLote, cz + (z1 - z0) * 0.22, 12, 0.04, 0x4f86a8);
            const n = Math.round((x1 - x0) * (z1 - z0) / 55);
            for (let i = 0; i < n; i++) {
                const x = x0 + 2 + rnd() * (x1 - x0 - 4), z = z0 + 2 + rnd() * (z1 - z0 - 4);
                if (Math.abs(x - cx) < 2.5 || Math.abs(z - cz) < 2.5) continue;
                arvore(x, z, 2 + rnd() * 1.5, 2.2 + rnd() * 2, null, rnd() < 0.3 ? 1 : 0);
            }
            registar('parque', x0, x1, z0, z1, 0);
        };

        let nQuarteirao = 0;
        for (const c of celulas) {
            const mx = (c.x0 + c.x1) / 2, mz = (c.z0 + c.z1) / 2;
            const r = Math.hypot(mx, mz);
            liso.caixa(mx, C.yAsfalto, mz, c.x1 - c.x0, yCal - C.yAsfalto, c.z1 - c.z0, cor.calcada);
            inv.quarteiroes++;
            if (c.parque) { parque(c, nQuarteirao++ === 0); continue; }
            const ix0 = c.x0 + C.calcada, ix1 = c.x1 - C.calcada, iz0 = c.z0 + C.calcada, iz1 = c.z1 - C.calcada;
            const aX = (ix1 - ix0) >= (iz1 - iz0);
            const A = aX ? ix1 - ix0 : iz1 - iz0, B = aX ? iz1 - iz0 : ix1 - ix0;
            const linhas = B >= 30 ? 2 : 1, prof = B / linhas;
            const pPredio = r < 215 ? 0.9 : (r < 265 ? 0.5 : 0.12);
            for (let l = 0; l < linhas; l++) {
                const sinal = linhas === 2 ? (l === 0 ? -1 : 1) : (rnd() < 0.5 ? -1 : 1);
                const v0 = (aX ? iz0 : ix0) + l * prof, u0 = aX ? ix0 : iz0;
                let u = u0;
                while (u < u0 + A - 6) {
                    const ehPredio = rnd() < pPredio;
                    const alvo = ehPredio ? 20 + rnd() * 10 : 11 + rnd() * 4;
                    let larg = Math.min(alvo, u0 + A - u);
                    if (u0 + A - u - larg < alvo * 0.6) larg = u0 + A - u;
                    const wx0 = aX ? u : v0, wx1 = aX ? u + larg : v0 + prof;
                    const wz0 = aX ? v0 : u, wz1 = aX ? v0 + prof : u + larg;
                    if (!retReservado(wx0, wx1, wz0, wz1, 0.5)) {
                        liso.caixa((wx0 + wx1) / 2, yCal, (wz0 + wz1) / 2, wx1 - wx0, alturaLote - yCal, wz1 - wz0,
                            ehPredio ? cor.piso : lawn);
                        if (ehPredio) predio(u, u + larg, v0, v0 + prof, sinal, aX, r);
                        else casa(u, u + larg, v0, v0 + prof, sinal, aX);
                    }
                    u += larg;
                }
            }
        }

        // ---- esplanada e estacionamentos -----------------------------------
        const E = C.esplanada, S = C.estadio, EP = C.estacionamento;
        const placas = [
            [S.meiaX, E.meiaX, -E.meiaZ, E.meiaZ], [-E.meiaX, -S.meiaX, -E.meiaZ, E.meiaZ],
            [-S.meiaX, S.meiaX, S.meiaZ, E.meiaZ], [-S.meiaX, S.meiaX, -E.meiaZ, -S.meiaZ]
        ];
        for (const [x0, x1, z0, z1] of placas) {
            liso.caixa((x0 + x1) / 2, C.yAsfalto, (z0 + z1) / 2, x1 - x0, yCal - C.yAsfalto, z1 - z0, cor.esplanada);
        }
        const lotes = [
            { x0: S.meiaX + EP.recuoEstadio, x1: E.meiaX - EP.margemAvenida, z0: -(E.meiaZ - EP.margemAvenida), z1: E.meiaZ - EP.margemAvenida, L: 'z' },
            { x0: -(E.meiaX - EP.margemAvenida), x1: -(S.meiaX + EP.recuoEstadio), z0: -(E.meiaZ - EP.margemAvenida), z1: E.meiaZ - EP.margemAvenida, L: 'z' },
            { x0: -(S.meiaX + EP.recuoEstadio), x1: S.meiaX + EP.recuoEstadio, z0: S.meiaZ + EP.recuoEstadio, z1: E.meiaZ - EP.margemAvenida, L: 'x' },
            { x0: -(S.meiaX + EP.recuoEstadio), x1: S.meiaX + EP.recuoEstadio, z0: -(E.meiaZ - EP.margemAvenida), z1: -(S.meiaZ + EP.recuoEstadio), L: 'x' }
        ];
        const yEst = yCal + 0.04, yMarca = yEst + 0.04;
        const padrao = ['b', 'a', 'b', 'b', 'a', 'b'];
        const tamanho = { b: EP.profundidadeVaga, a: EP.corredor };
        const postesEstac = [];
        for (const lt of lotes) {
            inv.estacionamentos++;
            liso.plano((lt.x0 + lt.x1) / 2, yEst, (lt.z0 + lt.z1) / 2, lt.x1 - lt.x0, lt.z1 - lt.z0, cor.estacionamento);
            const L0 = lt.L === 'z' ? lt.z0 : lt.x0, L1 = lt.L === 'z' ? lt.z1 : lt.x1;
            const S0 = lt.L === 'z' ? lt.x0 : lt.z0, S1 = lt.L === 'z' ? lt.x1 : lt.z1;
            const W = (l, s) => lt.L === 'z' ? [s, l] : [l, s];
            let s = S0 + 1, i = 0;
            while (true) {
                const tipo = padrao[i % padrao.length];
                if (s + tamanho[tipo] > S1 - 1) break;
                if (tipo === 'b') {
                    for (let l = L0 + 1; l + EP.larguraVaga <= L1 - 1 + 0.01; l += EP.larguraVaga) {
                        const [lx, lz] = W(l, s + tamanho.b / 2);
                        if (reservado(lx, lz, 1.5)) continue;
                        marc.plano(lx, yMarca, lz,
                            lt.L === 'z' ? tamanho.b - 0.4 : 0.12, lt.L === 'z' ? 0.12 : tamanho.b - 0.4, cor.faixa);
                        const [vx, vz] = W(l + EP.larguraVaga / 2, s + tamanho.b / 2);
                        inv.vagas++;
                        if (rnd() < EP.ocupacao && !reservado(vx, vz, 1.5)) {
                            carrosParados.push({
                                x: vx + (rnd() - 0.5) * 0.3, z: vz + (rnd() - 0.5) * 0.4,
                                ry: lt.L === 'z' ? Math.PI / 2 : 0, c: pick(C.carros)
                            });
                        }
                    }
                } else {
                    corredores.push({ L: lt.L, s: s + tamanho.a / 2, l0: L0 + 2, l1: L1 - 2, lote: lt });
                    for (let l = L0 + 14; l < L1 - 6; l += C.postes.passoEstacionamento) {
                        const [px, pz] = W(l, s + tamanho.a / 2);
                        postesEstac.push({ x: px, z: pz, eixo: lt.L === 'z' ? 'x' : 'z' });
                    }
                }
                s += tamanho[tipo]; i++;
            }
        }
        // bilheteiras na esplanada
        for (const [kx, kz] of [[86.5, 70], [86.5, -70], [-86.5, 70], [-86.5, -70], [40, 106], [-40, -106]]) {
            reservar(kx - 2.5, kx + 2.5, kz - 2.2, kz + 2.2, false);
            liso.caixa(kx, yCal, kz, 3.2, 2.8, 2.6, 0xe9e5d8);
            liso.caixa(kx, yCal + 2.8, kz, 4, 0.2, 3.4, 0x2d5f9a);
        }

        // ---- pintura das vias ----------------------------------------------
        const yPint = C.yAsfalto + 0.05;
        const linha = (v, t0, t1, d, larg, c) => {
            if (v.eixo === 'z') marc.plano(v.c + d, yPint, (t0 + t1) / 2, larg, t1 - t0, c);
            else marc.plano((t0 + t1) / 2, yPint, v.c + d, t1 - t0, larg, c);
        };
        const zebra = (v, t) => {
            zebras.push({ v, t });
            const n = Math.floor((v.w - 1.2) / 1.0);
            for (let k = 0; k < n; k++) {
                const d = -v.w / 2 + 0.6 + 0.5 + k * 1.0;
                if (v.eixo === 'z') marc.plano(v.c + d, yPint, t, 0.5, 3.2, cor.faixa);
                else marc.plano(t, yPint, v.c + d, 3.2, 0.5, cor.faixa);
            }
            inv.faixasPedestres++;
        };
        for (const k of cruz) {
            const bz = k.vx.w / 2 + 2.4, bx = k.vz.w / 2 + 2.4;
            if (k.vz.b > k.z + bz + 3) zebra(k.vz, k.z + bz);
            if (k.vz.a < k.z - bz - 3) zebra(k.vz, k.z - bz);
            if (k.vx.b > k.x + bx + 3) zebra(k.vx, k.x + bx);
            if (k.vx.a < k.x - bx - 3) zebra(k.vx, k.x - bx);
        }
        for (const p of paradas) zebra(p.v, p.t + 7);

        for (const v of vias) {
            for (const [p, q] of livres(v, 4)) {
                if (v.avenida) {
                    // canteiro central
                    const [cx, cz] = pt(v, (p + q) / 2, 0);
                    const comp = q - p;
                    liso.caixa(cx, C.yAsfalto, cz, v.eixo === 'z' ? 3 : comp, 0.30, v.eixo === 'z' ? comp : 3, cor.canteiro);
                    liso.plano(cx, C.yAsfalto + 0.31, cz, v.eixo === 'z' ? 2.4 : comp - 0.4, v.eixo === 'z' ? comp - 0.4 : 2.4, cor.relva);
                    for (const d of [-5.0, 5.0]) {
                        for (let t = p + 1; t + 3 <= q; t += 9) linha(v, t, t + 3, d, 0.15, cor.faixa);
                    }
                    for (const d of [-8.8, 8.8]) linha(v, p, q, d, 0.18, cor.faixa);
                } else {
                    linha(v, p, q, -0.15, 0.12, cor.amarela);
                    linha(v, p, q, 0.15, 0.12, cor.amarela);
                    for (const d of [-5.2, 5.2]) linha(v, p, q, d, 0.12, cor.faixa);
                }
            }
        }

        // ---- postes, semáforos, árvores ------------------------------------
        const PO = C.postes;
        const ocupados = [];
        const perto = (x, z, r) => ocupados.some(o => Math.hypot(o[0] - x, o[1] - z) < r);
        const poste = (x, z, alt, bracos) => {
            if (reservado(x, z, 0.8)) return;
            ocupados.push([x, z]);
            liso.cilindro(x, yCal, z, 0.22, alt - yCal, 0x5b6068);
            for (const [bx, bz] of bracos) {
                const comp = Math.hypot(bx, bz);
                const ang = Math.atan2(bx, bz);
                liso.caixa(x + bx / 2, alt - 0.1, z + bz / 2, 0.1, 0.1, comp, 0x5b6068, ang);
                lamp.caixa(x + bx, alt - 0.25, z + bz, 0.5, 0.15, 0.9, 0xfff0c8, ang);
                pocas.push([x + bx, z + bz, alt * 0.95]);
            }
            inv.postes++;
        };
        for (const v of vias) {
            let idx = 0;
            for (const [p, q] of livres(v, 4)) {
                const passo = v.avenida ? PO.passoAvenida : PO.passoRua;
                for (let t = p + 8; t <= q - 4; t += passo, idx++) {
                    if (v.avenida) {
                        const [x, z] = pt(v, t, 0);
                        const perp = v.eixo === 'z' ? [3.4, 0] : [0, 3.4];
                        poste(x, z, PO.altura, [perp, [-perp[0], -perp[1]]]);
                    } else {
                        const lado = (idx % 2) ? 1 : -1;
                        const [x, z] = pt(v, t, lado * (v.w / 2 + 0.7));
                        if (dentroDeOutra(v, x, z, 0.5)) continue;
                        const para = v.eixo === 'z' ? [-lado * 2.4, 0] : [0, -lado * 2.4];
                        poste(x, z, PO.altura - 1.0, [para]);
                    }
                }
            }
        }
        for (const p of postesEstac) {
            const d = p.eixo === 'x' ? [[3.2, 0], [-3.2, 0]] : [[0, 3.2], [0, -3.2]];
            poste(p.x, p.z, PO.alturaEstac, d);
        }
        // Semáforos nos cruzamentos de avenida
        for (const k of cruz) {
            if (!k.vz.avenida && !k.vx.avenida) continue;
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                const x = k.x + sx * (k.vz.w / 2 + 1.0), z = k.z + sz * (k.vx.w / 2 + 1.0);
                if (reservado(x, z, 0.5)) continue;
                // fora do alcance de uma das vias (fim de via): não há semáforo
                if (k.vz.a > z || k.vz.b < z || k.vx.a > x || k.vx.b < x) continue;
                liso.cilindro(x, yCal, z, 0.18, 4.2 - yCal, 0x30343a);
                const ang = Math.atan2(-sx, -sz);
                liso.caixa(x, 3.0, z, 0.4, 1.2, 0.35, 0x1e2024, ang);
                const verde = (sx * sz > 0);
                const fx = -sx * 0.2, fz = -sz * 0.2;
                brilho.caixa(x + fx, 3.9, z + fz, 0.2, 0.2, 0.2, verde ? 0x401010 : 0xff2a2a, ang);
                brilho.caixa(x + fx, 3.6, z + fz, 0.2, 0.2, 0.2, 0x403810, ang);
                brilho.caixa(x + fx, 3.3, z + fz, 0.2, 0.2, 0.2, verde ? 0x2aff55 : 0x104018, ang);
                inv.semaforos++;
            }
        }
        // Árvores nos passeios e palmeiras nos canteiros
        for (const v of vias) {
            let idx = 0;
            for (const [p, q] of livres(v, 6)) {
                for (let t = p + 4; t <= q - 4; t += C.arvores.passo, idx++) {
                    for (const lado of [-1, 1]) {
                        if (rnd() < 0.18) continue;
                        const [x, z] = pt(v, t + (lado > 0 ? 8 : 0), lado * (v.w / 2 + 2.3));
                        if (reservado(x, z, 1.2) || perto(x, z, 1.6) || dentroDeOutra(v, x, z, 1.5)) continue;
                        arvore(x, z, 2.2 + rnd() * 0.8, 2.6 + rnd() * 1.4, null, rnd() < 0.2 ? 1 : 0);
                    }
                    if (v.avenida && !v.metro) {
                        const [x, z] = pt(v, t + 4, 0);
                        if (!reservado(x, z, 1.5) && !perto(x, z, 1.8)) arvore(x, z, 4.5, 2.4, 0x4f8f3a, 2);
                    }
                }
            }
        }

        // ---- paradas de ônibus ---------------------------------------------
        for (const p of paradas) {
            // Referencial: +z local aponta para a via.
            const dentro = (p.v.eixo === 'z') ? (p.lado > 0 ? -Math.PI / 2 : Math.PI / 2) : (p.lado > 0 ? Math.PI : 0);
            const B = liso.base;
            B.makeRotationY(dentro).setPosition(p.x, 0, p.z);
            liso.caixa(0, yCal, -0.7, 4.2, 2.2, 0.08, 0x9fc7d8);              // painel de fundo
            liso.caixa(-2.1, yCal, 0, 0.08, 2.2, 1.4, 0x9fc7d8);
            liso.caixa(2.1, yCal, 0, 0.08, 2.2, 1.4, 0x9fc7d8);
            liso.caixa(0, yCal + 2.2, 0, 4.6, 0.14, 2.0, 0xd0342c);           // telhado
            liso.caixa(0, yCal + 0.45, -0.4, 2.6, 0.07, 0.5, 0x6b4a2f);       // banco
            liso.caixa(-1.1, yCal, -0.4, 0.07, 0.45, 0.4, 0x3a3d42);
            liso.caixa(1.1, yCal, -0.4, 0.07, 0.45, 0.4, 0x3a3d42);
            liso.cilindro(3.6, yCal, 0.4, 0.1, 3.0, 0x3a3d42);                // placa
            liso.caixa(3.6, yCal + 2.5, 0.4, 0.6, 0.6, 0.05, 0xd0342c);
            liso.caixa(3.6, yCal + 2.5, 0.43, 0.38, 0.38, 0.03, 0xffffff);
            B.identity();
            inv.paradasOnibus++;
        }

        // ---- metrô ----------------------------------------------------------
        const trens = [];
        if (viaMetro) {
            const zc = viaMetro.c, yT = M.alturaTopo;
            // tabuleiro contínuo
            liso.caixa(0, yT - M.espessura, zc, R * 2, M.espessura, M.larguraTabuleiro, 0x9a9fa6);
            for (const lado of [-1, 1]) {
                liso.caixa(0, yT, zc + lado * (M.larguraTabuleiro / 2 - 0.2), R * 2, 0.9, 0.3, 0x7d838b);   // resguardo
                for (const f of [-1, 1]) liso.caixa(0, yT, zc + lado * 2.2 + f * 0.72, R * 2, 0.16, 0.1, 0x30343a); // carris
                liso.caixa(0, yT, zc + lado * 2.2, R * 2, 0.08, 1.9, 0x5e5a55);                                   // balastro
            }
            for (const px of pilaresMetro) {
                liso.caixa(px, C.yAsfalto, zc, 1.6, yT - M.espessura - C.yAsfalto, 1.6, 0x8b9097);
                liso.caixa(px, yT - M.espessura - 0.5, zc, 1.2, 0.5, M.larguraTabuleiro * 0.7, 0x8b9097);
                inv.metro.pilares++;
            }
            // estação: plataformas, cobertura e colunas
            const ex = M.estacaoX, cl = M.estacaoComp;
            for (const lado of [-1, 1]) {
                liso.caixa(ex, yT, zc + lado * (M.larguraTabuleiro / 2 + 0.6), cl, 0.9, 2.4, 0xb4b1a8);
                liso.caixa(ex, yT - M.espessura, zc + lado * (M.larguraTabuleiro / 2 + 0.6), cl, M.espessura, 2.4, 0x9a9fa6);
                for (let dx = -cl / 2 + 4; dx <= cl / 2 - 3; dx += 8) {
                    liso.caixa(ex + dx, yT + 0.9, zc + lado * (M.estacaoLarg / 2 - 0.4), 0.35, 4.0, 0.35, 0x4a4f57);
                }
            }
            liso.caixa(ex, yT + 4.9, zc, cl + 2, 0.3, M.estacaoLarg + 2, 0x3f6fa8);
            liso.caixa(ex, yT + 4.65, zc, cl + 1, 0.2, M.estacaoLarg + 1, 0xdfe3e8);
            // escadas (rampas) até ao passeio
            for (const e of escadasEstacao) {
                const comp = Math.abs(e.z1 - e.z0), alt = yT + 0.5 - yCal;
                const ang = Math.atan2(alt, comp);
                const cz = (e.z0 + e.z1) / 2, cy = (yT + 0.5 + yCal) / 2;
                // inclinação em torno de X: usa o rz a partir de uma base rodada
                const B = liso.base;
                B.makeRotationY(e.sz > 0 ? -Math.PI / 2 : Math.PI / 2).setPosition(e.x, 0, cz);
                // referencial local: +x ao longo do percurso (sentido da descida)
                liso.caixa(0, cy - 0.15, 0, Math.hypot(comp, alt), 0.3, 3.6, 0xb9bcc0, 0, false, -ang);
                for (const f of [-1, 1]) liso.caixa(0, cy + 0.45, f * 1.75, Math.hypot(comp, alt), 1.0, 0.12, 0x8e9399, 0, false, -ang);
                B.identity();
            }
            inv.metro.estacoes++;
            // placa da estação
            const placa = this._rotulo('ESTÁDIO', 12, 1.8, '#1f4f8a', '#ffffff', false);
            if (placa) for (const lado of [-1, 1]) {
                const m = placa.clone();
                m.position.set(ex, yT + 5.8, zc + lado * (M.estacaoLarg / 2 + 1.05));
                if (lado < 0) m.rotation.y = Math.PI;
                extras.push(m);
            }
            // comboios
            const dimC = { l: 18, a: 3.4, w: 3.0 };
            const ac = new CidadeAcumulador('fundido');
            for (let k = 0; k < M.carros; k++) {
                const x = k * (dimC.l + 0.6);
                ac.caixa(x, 0, 0, dimC.l, dimC.a, dimC.w, 0xd7dade);
                ac.caixa(x, 1.9, 0, dimC.l - 1.2, 0.9, dimC.w + 0.04, 0x1d2630);
                ac.caixa(x, 0.9, 0, dimC.l, 0.45, dimC.w + 0.03, 0x2f6fb5);
                ac.caixa(x, dimC.a, 0, dimC.l - 2, 0.25, dimC.w - 0.8, 0x9ea4ab);
                for (const o of [-4, 4]) for (const lado of [-1, 1]) {
                    ac.caixa(x + o, 0.25, lado * (dimC.w / 2 + 0.03), 1.3, 2.4, 0.05, 0x2c4f73);
                }
            }
            const geoTrem = ac.malha(mats.fundido);
            const centroLocal = (M.carros - 1) * (dimC.l + 0.6) / 2;
            for (let k = 0; k < M.trens; k++) {
                const m = geoTrem.clone();
                const dir = k % 2 === 0 ? 1 : -1, lado = k % 2 === 0 ? -1 : 1;
                m.userData = {
                    dir, lado, vmax: M.velocidade, v: M.velocidade, estado: 'viaja', timer: 0,
                    compTotal: M.carros * (dimC.l + 0.6), paragemX: M.estacaoX - dir * centroLocal, pax: []
                };
                m.position.set(dir > 0 ? -R : R + 60, yT + 0.1, zc + lado * 2.2);
                if (dir < 0) m.rotation.y = Math.PI;
                trens.push(m);
                inv.metro.trens++;
            }
        }
        // bocas de metrô na esplanada
        for (const b of M.bocas) {
            const B = liso.base;
            const gira = Math.abs(b.x) > 50 ? (b.x > 0 ? -Math.PI / 2 : Math.PI / 2) : (b.z > 0 ? Math.PI : 0);
            B.makeRotationY(gira).setPosition(b.x, 0, b.z);
            liso.caixa(0, yCal, -1.4, 5.4, 3.2, 3.2, 0x9ec5d6);
            liso.caixa(0, yCal + 3.2, -0.6, 6.2, 0.25, 5.2, 0x2f3a46);
            liso.caixa(0, yCal, 1.7, 3.4, 0.02, 2.6, 0x15181c);
            liso.caixa(-2.0, yCal, 2.4, 0.08, 1.0, 3.4, 0x6e747c);
            liso.caixa(2.0, yCal, 2.4, 0.08, 1.0, 3.4, 0x6e747c);
            liso.caixa(0, yCal, -1.5, 1.8, 2.2, 0.12, 0x20262d);
            const m = this._rotulo('M', 1.5, 1.5, '#d62828', '#ffffff', true);
            B.identity();
            if (m) { m.position.set(b.x + Math.sin(gira) * 1.0, yCal + 4.4, b.z + Math.cos(gira) * 1.0); m.rotation.y = gira; extras.push(m); }
            bocasDados.push({ x: b.x, z: b.z, gira });
            inv.metro.bocas++;
        }

        // ---- passarelas -----------------------------------------------------
        for (const p of passarelas) {
            const B = liso.base;
            B.makeRotationY(p.ao === 'x' ? 0 : -Math.PI / 2).setPosition(p.x, 0, p.z);
            const l0 = p.hr + PP.folgaAteAvenida, hy = PP.altura, W = PP.largura;
            liso.caixa(0, hy - 0.35, 0, l0 * 2, 0.35, W, PP.cor);
            for (const f of [-1, 1]) {
                liso.caixa(0, hy, f * (W / 2 - 0.06), l0 * 2, 1.1, 0.12, PP.corParapeito);
                liso.caixa(0, hy + 1.1, f * (W / 2 - 0.06), l0 * 2, 0.08, 0.2, 0x4a4f57);
            }
            liso.caixa(0, hy + 2.7, 0, l0 * 2, 0.15, W + 0.4, 0xd0342c);           // cobertura
            for (const t of [-l0 + 0.3, 0, l0 - 0.3]) for (const f of [-1, 1]) {
                liso.caixa(t, hy, f * (W / 2 - 0.1), 0.18, 2.7, 0.18, 0x4a4f57);
            }
            const pil = [-p.hr - 0.6, 0, p.hr + 0.6];
            for (const t of pil) liso.caixa(t, C.yAsfalto, 0, 0.8, hy - 0.35 - C.yAsfalto, 0.8, 0x8b9097);
            const ang = Math.atan2(hy - yCal, PP.rampa);
            const comp = Math.hypot(PP.rampa, hy - yCal);
            for (const e of [-1, 1]) {
                const tc = e * (l0 + PP.rampa / 2), yc = (hy + yCal) / 2;
                const rz = e > 0 ? -ang : ang;
                liso.caixa(tc, yc - 0.17, 0, comp, 0.35, W, PP.cor, 0, false, rz);
                for (const f of [-1, 1]) {
                    liso.caixa(tc, yc + 0.5, f * (W / 2 - 0.06), comp, 1.0, 0.12, PP.corParapeito, 0, false, rz);
                }
                liso.caixa(e * (l0 + PP.rampa * 0.5), yCal, 0, 0.4, yc - yCal - 0.35, W - 0.6, 0x8b9097);
            }
            B.identity();
            inv.passarelas++;
        }

        // ---- contorno do estádio: fachada e árvores da esplanada -----------
        const FA = C.fachada;
        // Polilinha densa do contorno arredondado, a `off` metros da parede.
        const anel = (off) => {
            const pts = [], r = FA.raio + off, passo = 0.5;
            const cantos = [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]];
            for (const [sx, sz, a0] of cantos) {
                const n = Math.max(4, Math.ceil(r * Math.PI / 2 / passo));
                for (let i = 0; i <= n; i++) {
                    const a = a0 + (i / n) * Math.PI / 2;
                    pts.push([sx * FA.centroX + r * Math.cos(a), sz * FA.centroZ + r * Math.sin(a)]);
                }
            }
            return pts;
        };
        if (FA.ativa) {
            const ring = anel(0);
            // densifica as rectas entre cantos (as arestas ligam o fim de um arco ao início do seguinte)
            const dens = [];
            for (let i = 0; i < ring.length; i++) {
                const a = ring[i], b = ring[(i + 1) % ring.length];
                const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
                const k = Math.max(1, Math.ceil(d / 6));
                for (let j = 0; j < k; j++) dens.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
            }
            const nP = dens.length;
            // normal para fora de cada ponto: do centro do canto mais próximo
            const fora = dens.map(([x, z]) => {
                const cx = Math.abs(x) > FA.centroX ? Math.sign(x) * FA.centroX : x;
                const cz = Math.abs(z) > FA.centroZ ? Math.sign(z) * FA.centroZ : z;
                const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1;
                return [dx / l, dz / l];
            });
            // perfil subdividido em bandas finas
            const lin = [];
            const pf = FA.perfil;
            for (let i = 0; i < pf.length - 1; i++) {
                const n = Math.max(1, Math.round((pf[i + 1][1] - pf[i][1]) / FA.passoBanda));
                for (let j = 0; j < n; j++) {
                    const u = j / n;
                    lin.push([pf[i][0] + (pf[i + 1][0] - pf[i][0]) * u, pf[i][1] + (pf[i + 1][1] - pf[i][1]) * u]);
                }
            }
            lin.push(pf[pf.length - 1]);
            const nR = lin.length;
            const pos = new Float32Array(nP * nR * 3), col = new Float32Array(nP * nR * 3);
            const cA = new THREE.Color(FA.corClara), cB = new THREE.Color(FA.corEscura), cBase = new THREE.Color(FA.corBase);
            const tmp = new THREE.Color();
            for (let r = 0; r < nR; r++) {
                const banda = r % 2;
                const alt = lin[r][1], k = Math.min(1, alt / 27);
                if (alt < 9) tmp.copy(cBase); else tmp.copy(banda ? cA : cB);
                if (alt >= 9) tmp.multiplyScalar(0.85 + 0.25 * k);          // mais claro para cima
                for (let i = 0; i < nP; i++) {
                    const o = lin[r][0] + (banda ? FA.relevo : 0);
                    const idx = (r * nP + i) * 3;
                    pos[idx] = dens[i][0] + fora[i][0] * o;
                    pos[idx + 1] = lin[r][1];
                    pos[idx + 2] = dens[i][1] + fora[i][1] * o;
                    col[idx] = tmp.r; col[idx + 1] = tmp.g; col[idx + 2] = tmp.b;
                }
            }
            const ind = [];
            for (let r = 0; r < nR - 1; r++) for (let i = 0; i < nP; i++) {
                const a = r * nP + i, b = r * nP + (i + 1) % nP, c2 = (r + 1) * nP + i, d = (r + 1) * nP + (i + 1) % nP;
                ind.push(a, c2, b, b, c2, d);
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            g.setIndex(ind);
            g.computeVertexNormals();
            const casca = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
            casca.castShadow = false; casca.receiveShadow = false;
            casca.name = 'FachadaEstadio';
            extras.push(casca);
            inv.fachada = true;
        }
        /*
        COLUNAS E PORTÕES. A casca está a `vao` metros do chão, e por baixo
        dela passa a torcida: colunas de aço a cada `passoColunas` m seguram-na,
        e em `portoes` pontos do contorno há uma entrada/saída — pórtico com o
        número, fila de catracas e grades a guiar a fila para fora.
        */
        if (FA.ativa) {
            const foraDe = (x, z) => {
                const cx = Math.abs(x) > FA.centroX ? Math.sign(x) * FA.centroX : x;
                const cz = Math.abs(z) > FA.centroZ ? Math.sign(z) * FA.centroZ : z;
                const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1;
                return [dx / l, dz / l];
            };
            // Pontos do contorno a `off` m da parede, de `passo` em `passo` metros (por comprimento de arco).
            const percorrer = (off, passo, desfasar) => {
                const ring = anel(off), out = [];
                let acum = 0, prox = desfasar;
                for (let i = 0; i < ring.length; i++) {
                    const a = ring[i], b = ring[(i + 1) % ring.length];
                    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
                    while (acum + d >= prox) {
                        const u = (prox - acum) / (d || 1);
                        const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
                        out.push({ x, z, n: foraDe(x, z), s: prox });
                        prox += passo;
                    }
                    acum += d;
                }
                return out;
            };
            const OFF = FA.perfil[0][0];
            const perim = anel(OFF).reduce((s2, a, i, r) => {
                const b = r[(i + 1) % r.length]; return s2 + Math.hypot(b[0] - a[0], b[1] - a[1]);
            }, 0);
            const portoes = percorrer(OFF, perim / FA.portoes, perim / FA.portoes / 2).slice(0, FA.portoes);
            // colunas, menos na boca dos portões
            const colunasPos = [];
            for (const c of percorrer(OFF + 0.2, FA.passoColunas, 2)) {
                if (portoes.some(g => Math.hypot(g.x - c.x, g.z - c.z) < 6.5)) continue;
                liso.caixa(c.x, yCal, c.z, 0.7, FA.vao - yCal, 0.7, FA.corColuna);
                colunasPos.push(c);
                inv.colunasFachada = (inv.colunasFachada || 0) + 1;
            }
            portoes.forEach((g, n) => {
                const ang = Math.atan2(g.n[0], g.n[1]);
                const B = liso.base;
                B.makeRotationY(ang).setPosition(g.x, 0, g.z);
                lamp.base.copy(B);      // as luminárias também estão em coordenadas do portão
                // pórtico: dois pilares e a viga com o número
                for (const sx of [-4.6, 4.6]) {
                    liso.caixa(sx, yCal, 0.4, 0.7, 5.0, 0.8, FA.corColuna);
                    lamp.caixa(sx, 5.0, 0.9, 0.5, 0.2, 0.3, 0xfff0c8);
                    pocas.push([g.x + Math.cos(ang) * sx + g.n[0] * 0.9, g.z - Math.sin(ang) * sx + g.n[1] * 0.9, 6]);
                }
                liso.caixa(0, 4.1, 0.4, 10.2, 1.0, 1.0, 0x2f6fb5);
                // catracas e piso de acesso
                liso.plano(0, yCal + 0.03, 3.4, 10, 6.2, 0x9aa7b8);
                for (let k = -3; k <= 3; k++) {
                    liso.caixa(k * 1.3, yCal, 1.2, 0.18, 1.0, 1.0, 0x5d6673);
                    liso.caixa(k * 1.3, yCal + 0.85, 1.2, 0.9, 0.06, 0.06, 0xc8ccd2);
                }
                // grades a guiar a fila para fora, com os seus postes
                grade.base.copy(B);
                for (const sx of [-5.3, 5.3]) {
                    grade.painel(sx, 1.4, sx, 6.6, yCal, 1.2, 0xc8ccd2);
                    for (let z = 1.4; z <= 6.7; z += 1.3) liso.caixa(sx, yCal, z, 0.12, 1.3, 0.12, 0x4a4f57);
                }
                grade.base.identity();
                lamp.base.identity();
                B.identity();
                portoesDados.push({ x: g.x, z: g.z, n: g.n, ang, i: n });
                reservar(g.x + g.n[0] * 4 - 7, g.x + g.n[0] * 4 + 7, g.z + g.n[1] * 4 - 7, g.z + g.n[1] * 4 + 7, false);
                const rot = this._rotulo('PORTÃO ' + (n + 1), 8.6, 0.9, '#2f6fb5', '#ffffff', false);
                if (rot) {
                    rot.position.set(g.x + g.n[0] * 0.95, 4.1 + 0.5, g.z + g.n[1] * 0.95);
                    rot.rotation.y = ang;
                    extras.push(rot);
                }
                inv.portoes = (inv.portoes || 0) + 1;
            });
            // Grade contínua entre as colunas e os postes dos portões (nunca entre os
            // dois postes do mesmo portão: é por aí que a torcida entra).
            const pil = colunasPos.map(c => ({ s: c.s, x: c.x, z: c.z, g: -1 }));
            portoes.forEach((g, n) => {
                const ang = Math.atan2(g.n[0], g.n[1]), tx = Math.cos(ang), tz = -Math.sin(ang);
                for (const sx of [-4.6, 4.6]) pil.push({ s: g.s + sx, x: g.x + tx * sx + g.n[0] * 0.4, z: g.z + tz * sx + g.n[1] * 0.4, g: n });
            });
            pil.sort((a, b) => a.s - b.s);
            for (let i = 0; i < pil.length; i++) {
                const a = pil[i], b = pil[(i + 1) % pil.length];
                if (a.g >= 0 && a.g === b.g) continue;
                if (Math.hypot(b.x - a.x, b.z - a.z) > 14) continue;
                grade.painel(a.x, a.z, b.x, b.z, yCal + 0.1, 2.2, 0x4a4f57);
                inv.paineisDeGrade = (inv.paineisDeGrade || 0) + 1;
            }
        }
        // Árvores em canteiros circulares, em anel, a `recuo` da fachada.
        {
            const AE = C.arvoresEsplanada, ring = anel(AE.recuo);
            let acum = 0, prox = AE.passo / 2;
            for (let i = 0; i < ring.length; i++) {
                const a = ring[i], b = ring[(i + 1) % ring.length];
                const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
                while (acum + d >= prox) {
                    const u = (prox - acum) / (d || 1);
                    const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
                    prox += AE.passo;
                    if (reservado(x, z, 1.5)) continue;
                    liso.cilindro(x, yCal, z, 3.4, 0.25, 0x9aa09a);
                    liso.cilindro(x, yCal + 0.25, z, 3.0, 0.03, cor.relva);
                    arvore(x, z, 2.4 + rnd() * 0.8, 2.8 + rnd() * 1.0, null);
                    inv.arvoresEsplanada = (inv.arvoresEsplanada || 0) + 1;
                }
                acum += d;
            }
        }

        // ---- instanciados: árvores, carros ---------------------------------
        const dummy = new THREE.Object3D();
        const instancias = [];
        if (arvores.length) {
            const G = this._geoArvores();
            const paletas = [
                [0x5ea043, 0x4f8f3a, 0x6aa84f, 0x3f7d33, 0x7bb35a, 0x8aa83c],
                [0x2f6d33, 0x28603a, 0x3a7a3e],
                [0x5a9a3c, 0x4f8f3a]
            ];
            // Altura total pela do tronco: cada espécie tem a sua proporção.
            const fatorAltura = [1 / 0.4, 3.2, 2.0];
            const cc = new THREE.Color();
            for (let sp = 0; sp < 3; sp++) {
                const lista = arvores.filter(a => a.sp === sp);
                if (!lista.length) continue;
                const tronco = new THREE.InstancedMesh(G[sp].tronco, G.matTronco, lista.length);
                const copa = new THREE.InstancedMesh(G[sp].copa, sp === 2 ? G.matFolha2 : G.matFolha, lista.length);
                lista.forEach((a, i) => {
                    dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
                    dummy.position.set(a.x, C.alturaCalcada, a.z);
                    const sx = a.r * 2 * (0.9 + rnd() * 0.2);
                    dummy.scale.set(sx, a.h * fatorAltura[sp] * (0.92 + rnd() * 0.16), sx);
                    dummy.updateMatrix();
                    tronco.setMatrixAt(i, dummy.matrix);
                    copa.setMatrixAt(i, dummy.matrix);
                    copa.setColorAt(i, cc.setHex(a.c || pick(paletas[sp])));
                });
                inv.arvores += lista.length;
                instancias.push(tronco, copa);
            }
        }
        // ---- veículos: modelos com rodas, vidros e faróis -----------------
        const GV = this._geoVeiculos();
        const cc2 = new THREE.Color();
        if (carrosParados.length) {
            const n = carrosParados.length;
            const corpo = new THREE.InstancedMesh(GV.carro.corpo, GV.matCorpo, n);
            const det = new THREE.InstancedMesh(GV.carro.det, GV.matDet, n);
            const guardadas = [];
            carrosParados.forEach((c, i) => {
                dummy.rotation.set(0, c.ry + (rnd() < 0.5 ? 0 : Math.PI), 0);
                dummy.position.set(c.x, yEst, c.z); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
                corpo.setMatrixAt(i, dummy.matrix); det.setMatrixAt(i, dummy.matrix);
                corpo.setColorAt(i, cc2.setHex(c.c));
                guardadas.push(dummy.matrix.clone());
                c.i = i; c.oculto = false;
            });
            this._parados = { corpo, det, mats: guardadas, lista: carrosParados };
            inv.carrosParados = n;
            instancias.push(corpo, det);
        } else this._parados = null;
        /*
        TRÂNSITO: só nas vias que atravessam o mapa de ponta a ponta. As vias curtas
        (que começam na esplanada) fariam os veículos aparecer e desaparecer à beira
        do estacionamento. Cada pista (via, sentido, faixa) tem a sua velocidade e os
        veículos nela ficam espaçados por igual, com um pouco de folga, para o trânsito
        ser denso sem eles se sobreporem. Os ônibus e táxis andam na faixa da direita das
        avenidas com parada, a que serve a calçada; os carros, nas outras.
        */
        const TR = C.transito;
        const veic = [];
        const viasParada = new Set(paradas.map(p => p.v));
        const completas = vias.filter(v => v.a <= -R + 1 && v.b >= R - 1);
        const pistas = [];
        for (const v of completas) for (const dir of [-1, 1]) {
            if (v.avenida) {
                pistas.push({ v, dir, off: dir * 3.3, servico: false });
                if (viasParada.has(v)) pistas.push({ v, dir, off: dir * 6.8, servico: true });
                else pistas.push({ v, dir, off: dir * 6.8, servico: false });
            } else pistas.push({ v, dir, off: dir * 2.8, servico: false });
        }
        const pCarro = pistas.filter(q => !q.servico), pServico = pistas.filter(q => q.servico);
        const cores = [0xe8b923, 0x2f6fb5, 0xd0342c, 0x2f8a4f];
        const distribuir = (lista, n, fabricar) => {
            if (!lista.length) return;
            const porPista = lista.map(() => []);
            for (let i = 0; i < n; i++) porPista[i % lista.length].push(i);
            lista.forEach((q, k) => {
                const ids = porPista[k];
                if (!ids.length) return;
                const vel = q.vel || (q.vel = TR.velMin + rnd() * (TR.velMax - TR.velMin));
                const passo = (q.v.b - q.v.a) / ids.length, fase = rnd() * passo;
                ids.forEach((id, j) => {
                    const t = q.v.a + ((fase + j * passo + (rnd() - 0.5) * passo * 0.3) % (q.v.b - q.v.a));
                    veic.push(Object.assign({
                        v: q.v, dir: q.dir, off: q.off, t, vel, vAtual: vel, estado: 'anda', timer: 0,
                        ultima: null, paradaAtual: null, passageiros: [], x: 0, z: 0
                    }, fabricar(id)));
                });
            });
        };
        distribuir(pCarro, TR.carros - TR.taxis, () => ({ onibus: false, taxi: false, c: pick(C.carros) }));
        const lenta = pServico.length ? pServico : pCarro;
        for (const q of lenta) q.vel = TR.velOnibus;
        distribuir(lenta, TR.taxis, () => ({ onibus: false, taxi: true, c: 0xf2c200 }));
        distribuir(lenta, TR.onibus, () => ({ onibus: true, taxi: false, c: pick(cores) }));
        const grupoVeic = (lista, geo) => {
            if (!lista.length) return null;
            const corpo = new THREE.InstancedMesh(geo.corpo, GV.matCorpo, lista.length);
            const det = new THREE.InstancedMesh(geo.det, GV.matDet, lista.length);
            lista.forEach((c, i) => corpo.setColorAt(i, cc2.setHex(c.c)));
            corpo.frustumCulled = false; det.frustumCulled = false;
            return { corpo, det, lista };
        };
        const gCarros = grupoVeic(veic.filter(q => !q.onibus), GV.carro);
        const gOnibus = grupoVeic(veic.filter(q => q.onibus), GV.onibus);
        this._veiculos = [gCarros, gOnibus].filter(Boolean);
        for (const g of this._veiculos) instancias.push(g.corpo, g.det);
        this._trens = trens;
        this.dados = {
            vias, zebras, paradas, escadas: escadasEstacao, cruz, passarelas, corredores,
            bocas: bocasDados, portoes: portoesDados, carrosParados, anel, pt, dentroDeOutra,
            metro: viaMetro ? { zc: viaMetro.c, yT: M.alturaTopo, ex: M.estacaoX } : null
        };
        this._atualizarVeiculos(0);


        // ---- monta ----------------------------------------------------------
        // Poças de luz: os postes não têm luz real (seriam centenas de SpotLights);
        // cada cabeça pinta um disco aditivo no chão, que só aparece de noite.
        if (pocas.length) {
            const n = pocas.length, pos = new Float32Array(n * 18), uv = new Float32Array(n * 12);
            const cantos = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, -1, 0, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
            pocas.forEach(([x, z, r], i) => {
                cantos.forEach(([cx, cz, u, v], k) => {
                    const o = (i * 6 + k) * 3;
                    pos[o] = x + cx * r; pos[o + 1] = 0.27; pos[o + 2] = z + cz * r;
                    uv[(i * 6 + k) * 2] = u; uv[(i * 6 + k) * 2 + 1] = v;
                });
            });
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
            mats.poca = new THREE.MeshBasicMaterial({
                color: 0xffc870, map: this._texturaPoca(), transparent: true, opacity: 0.8,
                blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
            });
            const m = new THREE.Mesh(g, mats.poca);
            m.renderOrder = 2; m.visible = false; m.name = 'PocasDeLuz';
            m.frustumCulled = false;
            grupo.add(m);
        }
        for (const [acc, mat] of [[liso, mats.liso], [jan, mats.jan], [marc, mats.marc], [lamp, mats.lamp], [brilho, mats.brilho], [grade, mats.grade]]) {
            const m = acc.malha(mat);
            if (m) grupo.add(m);
        }
        // Sem frustum culling: o raio da esfera de um InstancedMesh é o da geometria na origem,
        // e a cidade inteira desaparecia quando a origem saía do ecrã.
        for (const o of instancias) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; grupo.add(o); }
        for (const o of extras) grupo.add(o);
        for (const t of trens) grupo.add(t);
        grupo.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

        this.grupo = grupo;
        this.inventario = inv;
        if (cena) cena.add(grupo);
        this._noite = null;
        this._aplicarPeriodo(false);
        if (typeof CidadeGente !== 'undefined' && C.gente && C.gente.ativa) {
            this.gente = CidadeGente;
            CidadeGente.construir(this, grupo, this._rng(C.semente + 11));
        }
        return grupo;
    },

    // Ferramentas para fundir geometria com cor por vértice (árvores e veículos).
    _ferr() {
        const hash = (x, y, z) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return v - Math.floor(v); };
        const novo = () => ({ p: [], c: [] });
        const juntar = (d, geo, M, corFn, deformar) => {
            const g = geo.index ? geo.toNonIndexed() : geo.clone();
            const a = g.attributes.position.array, v = new THREE.Vector3();
            for (let i = 0; i < a.length; i += 3) {
                v.set(a[i], a[i + 1], a[i + 2]);
                if (deformar) v.multiplyScalar(1 + (hash(v.x, v.y, v.z) - 0.5) * deformar);
                v.applyMatrix4(M);
                const c = corFn(v);
                d.p.push(v.x, v.y, v.z); d.c.push(c[0], c[1], c[2]);
            }
        };
        const fechar = d => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(d.p), 3));
            g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(d.c), 3));
            g.computeVertexNormals();
            return g;
        };
        const T = (x, y, z, sx, sy, sz, q) => new THREE.Matrix4().compose(
            new THREE.Vector3(x, y, z), q || new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
        return { hash, novo, juntar, fechar, T };
    },

    /*
    OS VEÍCULOS, de geometria fundida em duas partes: `corpo` (a pintura, que
    leva a cor da instância) e `det` (vidros, rodas, faróis, pára-choques, que
    ficam sempre iguais). A frente é +z; a base está em y = 0.
    Carro 1.8 x 1.5 x 4.3 m: carroceria baixa, cabine trapezoidal envidraçada
    com tecto da cor do carro, quatro rodas com calota, faróis e lanternas.
    Ônibus 2.55 x 3.2 x 11.5 m: faixa de janelas com montantes, parabrisa,
    letreiro, duas portas por lado, tecto com ar-condicionado e quatro rodas.
    */
    _geoVeiculos() {
        if (this._geoV) return this._geoV;
        const { novo, juntar, fechar, T } = this._ferr();
        const caixa = () => new THREE.BoxGeometry(1, 1, 1);
        const roda = () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1).rotateZ(Math.PI / 2);
        const tronco = (kx, kz, dz) => {
            const g = caixa(), a = g.attributes.position.array;
            for (let i = 0; i < a.length; i += 3) if (a[i + 1] > 0) { a[i] *= kx; a[i + 2] = a[i + 2] * kz + dz; }
            return g;
        };
        const lisa = (base, grad) => v => { const k = base + grad * Math.max(0, Math.min(1, v.y / 3.2)); return [k, k, k]; };
        const fixo = (r, g, b) => () => [r, g, b];
        const pneu = fixo(0.06, 0.06, 0.07), calota = fixo(0.62, 0.64, 0.67), vidro = fixo(0.09, 0.13, 0.19);

        // ---- carro
        const cc = novo(), cd = novo();
        juntar(cc, caixa(), T(0, 0.56, 0, 1.8, 0.56, 4.3), lisa(0.82, 0.18));
        juntar(cc, caixa(), T(0, 0.87, 1.45, 1.74, 0.07, 1.3), lisa(0.95, 0.05));          // capô
        juntar(cc, caixa(), T(0, 0.87, -1.6, 1.74, 0.07, 0.9), lisa(0.95, 0.05));          // tampa
        juntar(cd, tronco(0.84, 0.6, -0.1), T(0, 1.18, -0.15, 1.66, 0.62, 2.55), vidro);    // cabine
        juntar(cc, caixa(), T(0, 1.5, -0.24, 1.36, 0.06, 1.45), lisa(0.92, 0.08));         // tecto
        juntar(cd, caixa(), T(0, 0.27, 0, 1.7, 0.12, 4.2), fixo(0.05, 0.05, 0.06));        // fundo
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            juntar(cd, roda(), T(sx * 0.88, 0.33, sz * 1.38, 0.26, 0.66, 0.66), pneu);
            juntar(cd, roda(), T(sx * 0.9, 0.33, sz * 1.38, 0.27, 0.36, 0.36), calota);
        }
        juntar(cd, caixa(), T(0, 0.4, 2.17, 1.78, 0.2, 0.12), fixo(0.12, 0.12, 0.13));
        juntar(cd, caixa(), T(0, 0.4, -2.17, 1.78, 0.2, 0.12), fixo(0.12, 0.12, 0.13));
        juntar(cd, caixa(), T(0, 0.58, 2.16, 0.7, 0.14, 0.05), fixo(0.1, 0.1, 0.11));      // grade
        for (const sx of [-1, 1]) {
            juntar(cd, caixa(), T(sx * 0.62, 0.7, 2.16, 0.36, 0.14, 0.06), fixo(1, 0.96, 0.75));
            juntar(cd, caixa(), T(sx * 0.66, 0.72, -2.16, 0.36, 0.12, 0.06), fixo(0.85, 0.05, 0.05));
            juntar(cd, caixa(), T(sx * 0.95, 1.02, 1.0, 0.1, 0.08, 0.16), fixo(0.1, 0.1, 0.11)); // retrovisor
        }

        // ---- ônibus
        const bc = novo(), bd = novo();
        juntar(bc, caixa(), T(0, 1.9, 0, 2.55, 2.6, 11.5), lisa(0.8, 0.2));
        juntar(bd, caixa(), T(0, 2.2, 0, 2.59, 0.95, 10.9), vidro);                         // faixa de janelas
        for (let z = -4.8; z <= 4.9; z += 1.6) juntar(bc, caixa(), T(0, 2.2, z, 2.62, 0.97, 0.16), lisa(0.82, 0.12));
        juntar(bd, caixa(), T(0, 0.66, 0, 2.58, 0.34, 11.52), fixo(0.2, 0.21, 0.23));       // saia
        juntar(bc, caixa(), T(0, 3.22, 0, 2.4, 0.07, 11.2), lisa(0.95, 0.05));             // tecto
        juntar(bd, caixa(), T(0, 3.4, -2.2, 1.5, 0.3, 2.6), fixo(0.72, 0.74, 0.77));        // ar-condicionado
        juntar(bd, caixa(), T(0, 2.15, 5.77, 2.3, 1.6, 0.06), vidro);                       // parabrisa
        juntar(bd, caixa(), T(0, 3.05, 5.78, 1.8, 0.24, 0.05), fixo(1, 0.6, 0.1));          // letreiro
        juntar(bd, caixa(), T(0, 0.55, 5.8, 2.5, 0.28, 0.12), fixo(0.12, 0.12, 0.13));
        juntar(bd, caixa(), T(0, 0.55, -5.8, 2.5, 0.28, 0.12), fixo(0.12, 0.12, 0.13));
        juntar(bd, caixa(), T(0, 2.1, -5.77, 2.0, 1.15, 0.05), vidro);
        for (const sx of [-1, 1]) {
            juntar(bd, caixa(), T(sx * 0.9, 0.98, 5.79, 0.38, 0.22, 0.05), fixo(1, 0.95, 0.72));
            juntar(bd, caixa(), T(sx * 1.0, 0.98, -5.79, 0.32, 0.22, 0.05), fixo(0.85, 0.05, 0.05));
            for (const z of [3.6, -1.6]) juntar(bd, caixa(), T(sx * 1.29, 1.55, z, 0.06, 2.05, 1.15), fixo(0.12, 0.2, 0.3)); // portas
            for (const z of [3.7, -3.5]) {
                juntar(bd, roda(), T(sx * 1.2, 0.5, z, 0.32, 1.0, 1.0), pneu);
                juntar(bd, roda(), T(sx * 1.22, 0.5, z, 0.33, 0.55, 0.55), calota);
            }
        }

        const mat = o => new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, o));
        this._geoV = {
            carro: { corpo: fechar(cc), det: fechar(cd) },
            onibus: { corpo: fechar(bc), det: fechar(bd) },
            matCorpo: mat({}), matDet: mat({})
        };
        return this._geoV;
    },

    // Grade: barras verticais e duas travessas, com transparência.
    _texturaGrade() {
        if (typeof document === 'undefined') return null;
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
        const g = cv.getContext('2d');
        g.clearRect(0, 0, 64, 64);
        g.fillStyle = '#fff';
        g.fillRect(29, 0, 6, 64);            // barra
        g.fillRect(0, 2, 64, 5);             // travessa de cima
        g.fillRect(0, 57, 64, 5);            // travessa de baixo
        const t = new THREE.CanvasTexture(cv);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
        return t;
    },

    /*
    AS ÁRVORES, em três espécies de geometria fundida (instanciada depois):
    folhosa (tronco afunilado com raízes, três ramos e seis lóbulos de copa
    deformados), conífera (quatro andares de cone) e palmeira (tronco com
    anéis, cachos e nove folhas arqueadas). O tom da copa vem de um degradê no
    vértice (sombra por baixo, luz por cima) multiplicado pela cor da instância.
    Unidade: altura 1; diâmetro da copa 1.
    */
    _geoArvores() {
        if (this._geoA) return this._geoA;
        const { hash, novo, juntar, fechar, T } = this._ferr();
        const casca = v => { const k = 0.7 + 0.3 * Math.min(1, v.y * 2); return [0.42 * k, 0.29 * k, 0.18 * k]; };
        const folha = (base, topo, tom) => v => {
            const t = Math.max(0, Math.min(1, (v.y - base) / (topo - base)));
            const k = 0.6 + 0.5 * t + tom;
            return [k, k, k];
        };
        const ramo = (d, x0, y0, z0, x1, y1, z1, r) => {
            const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), len = dir.length();
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
            juntar(d, new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1), T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, r * 2, len, r * 2, q), casca);
        };
        // cilindro afunilado: raio r0 em baixo, r1 em cima
        const afunilado = (d, r0, r1, h, y, seg) => juntar(d, new THREE.CylinderGeometry(r1, r0, h, seg, 1), T(0, y + h / 2, 0, 1, 1, 1), casca);

        // 0: folhosa
        const t0 = novo(), c0 = novo();
        afunilado(t0, 0.050, 0.030, 0.42, 0.0, 7);
        afunilado(t0, 0.085, 0.050, 0.07, 0.0, 7);
        for (const [x, z, y] of [[0.16, 0.05, 0.64], [-0.13, -0.1, 0.6], [0.02, 0.16, 0.58]]) ramo(t0, 0, 0.3, 0, x, y, z, 0.014);
        const lobos = [[0, .70, 0, .30], [.18, .62, .05, .22], [-.17, .64, -.08, .23], [.04, .62, .2, .21], [-.05, .82, -.12, .20], [.10, .86, .10, .17]];
        lobos.forEach(([x, y, z, r], i) => juntar(c0, new THREE.IcosahedronGeometry(1, 1), T(x, y, z, r, r * 0.9, r),
            folha(0.38, 1.0, (hash(i, 3, 7) - 0.5) * 0.14), 0.32));
        // 1: conífera
        const t1 = novo(), c1 = novo();
        afunilado(t1, 0.04, 0.03, 0.2, 0.0, 6);
        [[0.14, 0.50, 0.34], [0.34, 0.40, 0.30], [0.54, 0.30, 0.28], [0.74, 0.19, 0.26]].forEach(([y, r, h], i) =>
            juntar(c1, new THREE.ConeGeometry(r, h, 9, 1), T(0, y + h / 2, 0, 1, 1, 1), folha(y, y + h, -0.05 * i), 0.18));
        // 2: palmeira
        const t2 = novo(), c2 = novo();
        afunilado(t2, 0.034, 0.022, 0.8, 0.0, 8);
        for (let k = 0; k < 4; k++) juntar(t2, new THREE.CylinderGeometry(0.036, 0.036, 0.012, 8, 1), T(0, 0.15 + k * 0.18, 0, 1, 1, 1), casca);
        for (let k = 0; k < 3; k++) {
            const a = k * 2.1;
            juntar(t2, new THREE.IcosahedronGeometry(1, 0), T(Math.cos(a) * 0.03, 0.78, Math.sin(a) * 0.03, 0.025, 0.025, 0.025), () => [0.3, 0.2, 0.12]);
        }
        for (let f = 0; f < 9; f++) {
            const fi = (f / 9) * Math.PI * 2 + (f % 2) * 0.2, cx = Math.cos(fi), cz = Math.sin(fi);
            const px = -cz, pz = cx;
            const amostras = [];
            for (let s = 0; s <= 4; s++) {
                const u = s / 4, rad = 0.52 * u;
                const alt = 0.82 + 0.16 * u - 0.30 * u * u + (f % 3) * 0.02;
                amostras.push([cx * rad, alt, cz * rad, 0.05 * (1 - u * 0.75)]);
            }
            for (let s = 0; s < 4; s++) {
                const A = amostras[s], B = amostras[s + 1];
                const P = (q, sg) => [q[0] + px * q[3] * sg, q[1], q[2] + pz * q[3] * sg];
                const a1 = P(A, 1), a2 = P(A, -1), b1 = P(B, 1), b2 = P(B, -1);
                for (const tri of [[a1, b1, a2], [a2, b1, b2]]) for (const q of tri) {
                    const k = 0.62 + 0.4 * (s / 4) + (f % 2) * 0.08;
                    c2.p.push(q[0], q[1], q[2]); c2.c.push(k, k, k);
                }
            }
        }
        const mat = o => new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, o));
        this._geoA = [
            { tronco: fechar(t0), copa: fechar(c0) },
            { tronco: fechar(t1), copa: fechar(c1) },
            { tronco: fechar(t2), copa: fechar(c2) }
        ];
        this._geoA.matTronco = mat({});
        this._geoA.matFolha = mat({});
        this._geoA.matFolha2 = mat({ side: THREE.DoubleSide });
        return this._geoA;
    },

    _aplicarPeriodo(noite) {
        if (!this._mats || this._noite === noite) return;
        this._noite = noite;
        this._mats.jan.emissiveIntensity = noite ? 1.0 : 0;
        this._mats.lamp.emissiveIntensity = noite ? 1.2 : 0;
        const poca = this.grupo && this.grupo.getObjectByName('PocasDeLuz');
        if (poca) poca.visible = noite;
    },

    _atualizarVeiculos(dt) {
        const D = this._dummy || (this._dummy = new THREE.Object3D());
        const paradas = this.dados ? this.dados.paradas : [];
        for (const g of this._veiculos) {
            g.lista.forEach((c, i) => {
                if (dt > 0) this._passoVeiculo(c, dt, paradas);
                const [x, z] = c.v.eixo === 'z' ? [c.v.c + c.off, c.t] : [c.t, c.v.c + c.off];
                const ry = c.v.eixo === 'z' ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
                c.x = x; c.z = z;
                D.rotation.set(0, ry, 0);
                D.position.set(x, CidadeConfig.yAsfalto + 0.15, z);
                D.scale.set(1, 1, 1); D.updateMatrix();
                g.corpo.setMatrixAt(i, D.matrix);
                g.det.setMatrixAt(i, D.matrix);
            });
            g.corpo.instanceMatrix.needsUpdate = true;
            g.det.instanceMatrix.needsUpdate = true;
        }
    },

    /*
    Um veículo: cruza a via à sua velocidade e, se é ônibus ou táxi, trava
    para a próxima parada do seu lado, espera, e arranca. Quem sobe e desce é
    a CidadeGente (ver `aoVeiculoParar`). O táxi pára 7 m à frente da parada,
    para não disputar a calçada com o ônibus.
    */
    _passoVeiculo(c, dt, paradas) {
        const T = CidadeConfig.transito;
        if (c.estado === 'parado') {
            c.timer -= dt;
            if (c.timer <= 0) {
                const p = c.paradaAtual;
                c.estado = 'anda'; c.ultima = p; c.paradaAtual = null;
                if (this.gente) this.gente.aoVeiculoPartir(c, p);
            }
            return;
        }
        let vAlvo = c.vel;
        if (c.onibus || c.taxi) {
            const sgn = Math.sign(c.off);
            let melhor = null, dm = 1e9;
            for (const p of paradas) {
                if (p.v !== c.v || p.lado !== sgn || p === c.ultima) continue;
                const alvoT = c.onibus ? p.t : p.t + c.dir * 7;
                const d = (alvoT - c.t) * c.dir;
                if (d > -0.5 && d < dm) { dm = d; melhor = p; }
            }
            if (melhor && dm < 70) {
                vAlvo = Math.min(c.vel, Math.sqrt(2 * 0.7 * T.freada * Math.max(dm, 0)) + 0.4);
                if (dm < 0.6 && c.vAtual < 0.8) {
                    c.estado = 'parado'; c.vAtual = 0; c.paradaAtual = melhor;
                    c.timer = c.onibus ? T.paradaOnibus : T.paradaTaxi;
                    if (this.gente) this.gente.aoVeiculoParar(c, melhor);
                    return;
                }
            }
        }
        c.vAtual += Math.max(-T.freada * dt, Math.min(T.acel * dt, vAlvo - c.vAtual));
        c.t += c.dir * c.vAtual * dt;
        if (c.t > c.v.b) { c.t = c.v.a; c.ultima = null; }
        else if (c.t < c.v.a) { c.t = c.v.b; c.ultima = null; }
    },

    // Posição da porta do veículo parado, do lado da calçada.
    portaDoVeiculo(c) {
        const lado = Math.sign(c.off);
        const avancar = c.onibus ? 3.6 : 0.3;
        const lateral = Math.abs(c.off) + (c.onibus ? 1.45 : 1.2);
        const t = c.t + c.dir * avancar;
        return c.v.eixo === 'z' ? [c.v.c + lado * lateral, t] : [t, c.v.c + lado * lateral];
    },

    /*
    O comboio: chega depressa, FREIA com desaceleração constante até parar com
    o centro na estação, fica `paragem` segundos de portas abertas, arranca e
    sai. A velocidade na freada é v = sqrt(2·a·distância), que pára exactamente
    no sítio, sem andar à procura dele.
    */
    _atualizarTrens(dt) {
        const M = CidadeConfig.metro, R = CidadeConfig.meia;
        for (const t of this._trens) {
            const u = t.userData;
            const lim = R + u.compTotal;
            const dist = () => (u.paragemX - t.position.x) * u.dir;
            if (u.estado === 'parado') {
                u.timer -= dt;
                if (u.timer <= 0) { u.estado = 'sai'; if (this.gente) this.gente.aoTremPartir(t); }
                continue;
            }
            if (u.estado === 'freia') {
                const d = Math.max(dist(), 0);
                u.v = Math.max(0.5, Math.min(u.v, Math.sqrt(2 * M.freada * d)));
                const passo = u.v * dt;
                if (d <= passo + 0.02) {
                    t.position.x = u.paragemX; u.v = 0; u.estado = 'parado'; u.timer = M.paragem;
                    if (this.gente) this.gente.aoTremParar(t);
                } else t.position.x += u.dir * passo;
                continue;
            }
            u.v = Math.min(u.vmax, u.v + M.aceleracao * dt);
            t.position.x += u.dir * u.v * dt;
            if (u.estado === 'sai' && dist() < -2) u.estado = 'viaja';
            if (u.dir > 0 && t.position.x > lim) { t.position.x = -lim; u.estado = 'viaja'; }
            else if (u.dir < 0 && t.position.x < -lim) { t.position.x = lim; u.estado = 'viaja'; }
            if (u.estado === 'viaja') {
                const d = dist();
                if (d > 0 && d <= u.v * u.v / (2 * M.freada)) u.estado = 'freia';
            }
        }
    },

    // Portas do comboio parado: [{x, z}] na plataforma, uma por porta.
    portasDoTrem(t) {
        const u = t.userData, M = CidadeConfig.metro;
        const out = [];
        for (let k = 0; k < M.carros; k++) for (const o of [-4, 4]) {
            out.push({ x: t.position.x + u.dir * (k * 18.6 + o), z: this.dados.metro.zc + u.lado * 4.6 });
        }
        return out;
    },

    // Mostra/esconde um carro do estacionamento (saiu / voltou).
    mostrarCarroParado(i, visivel) {
        const P = this._parados;
        if (!P) return;
        const m = visivel ? P.mats[i] : (this._matNula || (this._matNula = new THREE.Matrix4().makeScale(0, 0, 0)));
        P.corpo.setMatrixAt(i, m); P.det.setMatrixAt(i, m);
        P.corpo.instanceMatrix.needsUpdate = true; P.det.instanceMatrix.needsUpdate = true;
        P.lista[i].oculto = !visivel;
    },

    update(dt) {
        if (!this.grupo) return;
        const noite = (typeof Weather !== 'undefined') && Weather.periodo === 'noite';
        this._aplicarPeriodo(noite);
        this._atualizarVeiculos(dt);
        this._atualizarTrens(dt);
        if (this.gente) this.gente.update(dt);
    }
};
if (typeof window !== 'undefined') window.Cidade = Cidade;
