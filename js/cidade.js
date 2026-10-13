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
    constructor() {
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

const Cidade = {
    grupo: null,
    inventario: null,
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
            telhado: { pos: new Float32Array(P), nor: new Float32Array(N), uv: new Float32Array(P.length / 3 * 2) }
        };
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
    },

    construir(cena) {
        const C = CidadeConfig;
        const rnd = this._rng(C.semente);
        const pick = a => a[Math.floor(rnd() * a.length) % a.length];
        this.remover();
        this._unidades();

        const comTex = typeof document !== 'undefined';
        const mats = this._mats = {
            liso: new THREE.MeshLambertMaterial({ vertexColors: true }),
            jan: new THREE.MeshLambertMaterial({
                vertexColors: true, map: this._texturaJanelas(false),
                emissiveMap: this._texturaJanelas(true), emissive: 0xffffff, emissiveIntensity: 0
            }),
            marc: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
            lamp: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffe2a0, emissiveIntensity: 0 }),
            brilho: new THREE.MeshBasicMaterial({ vertexColors: true })
        };
        if (!comTex) { mats.jan.map = null; mats.jan.emissiveMap = null; }

        const liso = new CidadeAcumulador(), jan = new CidadeAcumulador(), marc = new CidadeAcumulador();
        const lamp = new CidadeAcumulador(), brilho = new CidadeAcumulador();
        const grupo = new THREE.Group();
        grupo.name = 'Cidade';
        const extras = [];     // rótulos soltos
        const arvores = [], carrosParados = [];
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
                    paradas.push({ v, t, lado: alternar, x, z });
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

        const arvore = (x, z, h, r, c) => arvores.push({ x, z, h, r, c });

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
                arvore(x, z, 2 + rnd() * 1.5, 2.2 + rnd() * 2, null);
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
                        arvore(x, z, 2.2 + rnd() * 0.8, 2.6 + rnd() * 1.4, null);
                    }
                    if (v.avenida && !v.metro) {
                        const [x, z] = pt(v, t + 4, 0);
                        if (!reservado(x, z, 1.5) && !perto(x, z, 1.8)) arvore(x, z, 4.5, 2.4, 0x4f8f3a);
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
            const ac = new CidadeAcumulador();
            for (let k = 0; k < M.carros; k++) {
                const x = k * (dimC.l + 0.6);
                ac.caixa(x, 0, 0, dimC.l, dimC.a, dimC.w, 0xd7dade);
                ac.caixa(x, 1.9, 0, dimC.l - 1.2, 0.9, dimC.w + 0.04, 0x1d2630);
                ac.caixa(x, 0.9, 0, dimC.l, 0.45, dimC.w + 0.03, 0x2f6fb5);
                ac.caixa(x, dimC.a, 0, dimC.l - 2, 0.25, dimC.w - 0.8, 0x9ea4ab);
            }
            const geoTrem = ac.malha(mats.liso);
            for (let k = 0; k < M.trens; k++) {
                const m = geoTrem.clone();
                const dir = k % 2 === 0 ? 1 : -1;
                const compTotal = M.carros * (dimC.l + 0.6);
                m.userData = { dir, vel: M.velocidade, compTotal };
                m.position.set(-R + k * 150, yT + 0.1, zc + (k % 2 === 0 ? -2.2 : 2.2));
                if (dir < 0) { m.rotation.y = Math.PI; m.position.x = R - k * 120; }
                m.matrixAutoUpdate = true;
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

        // ---- instanciados: árvores, carros ---------------------------------
        const dummy = new THREE.Object3D();
        const instancias = [];
        if (arvores.length) {
            const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(.5, .5, 1, 6, 1),
                new THREE.MeshLambertMaterial({ color: 0x6b4a2f }), arvores.length);
            const copa = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.5, 1),
                new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), arvores.length);
            const verdes = [0x4f8f3a, 0x3f7d33, 0x5ea043, 0x2f6d33, 0x6aa84f];
            const cc = new THREE.Color();
            arvores.forEach((a, i) => {
                dummy.rotation.set(0, 0, 0);
                dummy.position.set(a.x, a.h / 2 + C.alturaCalcada, a.z); dummy.scale.set(0.35, a.h, 0.35); dummy.updateMatrix();
                tronco.setMatrixAt(i, dummy.matrix);
                dummy.position.set(a.x, a.h + a.r * 0.45 + C.alturaCalcada, a.z); dummy.scale.set(a.r * 1.7, a.r * 1.5, a.r * 1.7); dummy.updateMatrix();
                copa.setMatrixAt(i, dummy.matrix);
                copa.setColorAt(i, cc.setHex(a.c || pick(verdes)));
            });
            inv.arvores = arvores.length;
            instancias.push(tronco, copa);
        }
        const matCarro = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const matVidro = new THREE.MeshLambertMaterial({ color: 0x1d2630 });
        const caixaUnit = new THREE.BoxGeometry(1, 1, 1);
        if (carrosParados.length) {
            const n = carrosParados.length;
            const corpo = new THREE.InstancedMesh(caixaUnit, matCarro, n);
            const cab = new THREE.InstancedMesh(caixaUnit, matVidro, n);
            const cc = new THREE.Color();
            carrosParados.forEach((c, i) => {
                dummy.rotation.set(0, c.ry + (rnd() < 0.5 ? 0 : Math.PI), 0);
                dummy.position.set(c.x, yEst + 0.6, c.z); dummy.scale.set(1.8, 0.8, 4.3); dummy.updateMatrix();
                corpo.setMatrixAt(i, dummy.matrix); corpo.setColorAt(i, cc.setHex(c.c));
                dummy.position.set(c.x, yEst + 1.25, c.z); dummy.scale.set(1.6, 0.6, 2.3); dummy.updateMatrix();
                cab.setMatrixAt(i, dummy.matrix);
            });
            inv.carrosParados = n;
            instancias.push(corpo, cab);
        }
        // trânsito
        const TR = C.transito;
        const veic = [];
        const comp = vias.reduce((s, v) => s + (v.b - v.a), 0);
        const escolheVia = () => {
            let x = rnd() * comp;
            for (const v of vias) { x -= (v.b - v.a); if (x <= 0) return v; }
            return vias[0];
        };
        const nCarros = TR.carros, nOnibus = TR.onibus;
        for (let i = 0; i < nCarros + nOnibus; i++) {
            const v = escolheVia(), dir = rnd() < 0.5 ? -1 : 1, onibus = i >= nCarros;
            const faixas = v.avenida ? [3.3, 6.8] : [2.8];
            const off = dir * (onibus ? faixas[faixas.length - 1] : pick(faixas));
            veic.push({
                v, dir, off, onibus, t: v.a + rnd() * (v.b - v.a),
                vel: onibus ? 8 : TR.velMin + rnd() * (TR.velMax - TR.velMin),
                c: onibus ? pick([0xe8b923, 0x2f6fb5, 0xd0342c, 0x2f8a4f]) : pick(C.carros)
            });
        }
        const grupoVeic = (lista, dims, vidroDims) => {
            if (!lista.length) return null;
            const corpo = new THREE.InstancedMesh(caixaUnit, matCarro, lista.length);
            const vid = new THREE.InstancedMesh(caixaUnit, matVidro, lista.length);
            const cc = new THREE.Color();
            lista.forEach((c, i) => corpo.setColorAt(i, cc.setHex(c.c)));
            corpo.frustumCulled = false; vid.frustumCulled = false;
            return { corpo, vid, lista, dims, vidroDims };
        };
        const gCarros = grupoVeic(veic.filter(q => !q.onibus), [1.8, 1.0, 4.3, 0.7], [1.6, 0.6, 2.3, 1.45]);
        const gOnibus = grupoVeic(veic.filter(q => q.onibus), [2.55, 2.9, 11.5, 1.6], [2.6, 0.9, 10.5, 2.2]);
        this._veiculos = [gCarros, gOnibus].filter(Boolean);
        for (const g of this._veiculos) instancias.push(g.corpo, g.vid);
        this._trens = trens;
        this._atualizarVeiculos(0);

        // ---- monta ----------------------------------------------------------
        for (const [acc, mat] of [[liso, mats.liso], [jan, mats.jan], [marc, mats.marc], [lamp, mats.lamp], [brilho, mats.brilho]]) {
            const m = acc.malha(mat);
            if (m) grupo.add(m);
        }
        for (const o of instancias) { o.castShadow = false; o.receiveShadow = false; grupo.add(o); }
        for (const o of extras) grupo.add(o);
        for (const t of trens) grupo.add(t);
        grupo.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

        this.grupo = grupo;
        this.inventario = inv;
        if (cena) cena.add(grupo);
        this._noite = null;
        this._aplicarPeriodo(false);
        return grupo;
    },

    _aplicarPeriodo(noite) {
        if (!this._mats || this._noite === noite) return;
        this._noite = noite;
        this._mats.jan.emissiveIntensity = noite ? 1.0 : 0;
        this._mats.lamp.emissiveIntensity = noite ? 1.2 : 0;
    },

    _atualizarVeiculos(dt) {
        for (const g of this._veiculos) {
            const D = Cidade._dummy || (Cidade._dummy = new THREE.Object3D());
            g.lista.forEach((c, i) => {
                c.t += c.dir * c.vel * dt;
                if (c.t > c.v.b) c.t = c.v.a; else if (c.t < c.v.a) c.t = c.v.b;
                const [x, z] = c.v.eixo === 'z' ? [c.v.c + c.off, c.t] : [c.t, c.v.c + c.off];
                const ry = c.v.eixo === 'z' ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
                D.rotation.set(0, ry, 0);
                D.position.set(x, CidadeConfig.yAsfalto + 0.15 + g.dims[1] / 2, z);
                D.scale.set(g.dims[0], g.dims[1], g.dims[2]); D.updateMatrix();
                g.corpo.setMatrixAt(i, D.matrix);
                D.position.set(x, CidadeConfig.yAsfalto + 0.15 + g.vidroDims[3], z);
                D.scale.set(g.vidroDims[0], g.vidroDims[1], g.vidroDims[2]); D.updateMatrix();
                g.vid.setMatrixAt(i, D.matrix);
            });
            g.corpo.instanceMatrix.needsUpdate = true;
            g.vid.instanceMatrix.needsUpdate = true;
        }
    },

    update(dt) {
        if (!this.grupo) return;
        const noite = (typeof Weather !== 'undefined') && Weather.periodo === 'noite';
        this._aplicarPeriodo(noite);
        this._atualizarVeiculos(dt);
        for (const t of this._trens) {
            const u = t.userData;
            t.position.x += u.dir * u.vel * dt;
            const lim = CidadeConfig.meia + u.compTotal;
            if (u.dir > 0 && t.position.x > lim) t.position.x = -lim;
            else if (u.dir < 0 && t.position.x < -lim) t.position.x = lim;
        }
    }
};
if (typeof window !== 'undefined') window.Cidade = Cidade;
