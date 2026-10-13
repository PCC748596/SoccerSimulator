/*
=============================================================================
CIDADE — A GENTE
=============================================================================
Quinhentas pessoas a circular pela cidade (`CidadeConfig.gente.total`), a
andar pelas calçadas, a atravessar nas faixas, a formar filas nos portões do
estádio e a entrar e sair do metrô, do comboio, dos ônibus, dos táxis e dos
carros dos estacionamentos. A cidade (js/cidade.js) constrói o cenário; aqui
fica quem o usa.

O CAMINHO: um grafo de calçadas. Os nós são os pontos onde as passadeiras
tocam o passeio, mais um nó a cada 25 m, as paradas, o anel da esplanada, os
corredores dos estacionamentos, os portões, as bocas de metrô, as pontas das
rampas das passarelas e as plataformas da estação com as suas escadas. As
arestas ligam nós seguidos de um mesmo passeio (nunca através de uma via) e
as duas pontas de cada passadeira. O percurso é um Dijkstra por distância.

A VIDA DE CADA PESSOA é uma sequência de DESTINOS escolhidos ao acaso:
passear, descer à boca de metrô, esperar o comboio na plataforma, esperar um
ônibus/táxi numa parada, ir ao estádio (entra na fila de uma catraca) ou ir ao
seu carro. Entrar num transporte esconde-a (o `oculto`); quando o comboio, o
ônibus ou o táxi pára, parte dos passageiros desce, a pessoa aparece na porta
e segue a pé. As pessoas que estão à espera sobem enquanto as portas estão
abertas. O total é constante: ninguém é criado ou destruído.

DESENHO: quatro InstancedMesh (camisa+braços, cabeça, perna esquerda, perna
direita), com o balanço das pernas feito em cada frame.
=============================================================================
*/
const CidadeGente = {
    cid: null,
    nos: [], adj: [],
    agentes: [],
    portoes: [], bocas: [], plat: { '-1': [], '1': [] },
    estat: {},
    _mesh: null,

    limpar() {
        this.nos = []; this.adj = []; this.agentes = []; this.portoes = []; this.bocas = [];
        this.plat = { '-1': [], '1': [] }; this._mesh = null; this.cid = null;
    },

    // --------------------------------------------------------------------
    // GRAFO
    // --------------------------------------------------------------------
    _construirGrafo(D) {
        const C = CidadeConfig, FA = C.fachada;
        const yG = C.alturaCalcada + 0.02;
        const nos = this.nos, adj = this.adj, chave = new Map();
        const k = (x, y, z) => Math.round(x * 2) + '|' + Math.round(z * 2) + '|' + Math.round(y);
        const no = (x, y, z) => {
            const kk = k(x, y, z);
            let i = chave.get(kk);
            if (i === undefined) { i = nos.length; nos.push({ x, y, z }); adj.push([]); chave.set(kk, i); }
            return i;
        };
        const buscar = (x, y, z) => chave.get(k(x, y, z));
        const ligar = (a, b) => {
            if (a === undefined || b === undefined || a < 0 || b < 0 || a === b) return;
            if (!adj[a].includes(b)) { adj[a].push(b); adj[b].push(a); }
        };
        const dist = (a, b) => Math.hypot(nos[a].x - nos[b].x, nos[a].z - nos[b].z);
        const maisPerto = (x, z, ids, max) => {
            let m = -1, dm = max === undefined ? 1e9 : max;
            for (const i of ids) { const d = Math.hypot(nos[i].x - x, nos[i].z - z); if (d < dm) { dm = d; m = i; } }
            return m;
        };
        this._no = no; this._ligar = ligar;

        // ---- passeios das vias
        const vias = D.vias;
        vias.forEach((v, i) => { v.idx = i; });
        const linhas = vias.map(() => ({ '1': [], '-1': [] }));
        const noLado = (v, t, s) => {
            const [x, z] = D.pt(v, t, s * (v.w / 2 + 1.5));
            const id = no(x, yG, z);
            linhas[v.idx][s].push({ t, id });
            return id;
        };
        for (const zb of D.zebras) ligar(noLado(zb.v, zb.t, 1), noLado(zb.v, zb.t, -1));
        // cantos dos cruzamentos: o fim de uma passadeira liga ao da vizinha
        for (const kx of D.cruz) {
            const bz = kx.vx.w / 2 + 2.4, bx = kx.vz.w / 2 + 2.4;
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                const A = buscar(kx.x + sx * (kx.vz.w / 2 + 1.5), yG, kx.z + sz * bz);
                const B = buscar(kx.x + sx * bx, yG, kx.z + sz * (kx.vx.w / 2 + 1.5));
                ligar(A, B);
            }
        }
        for (const p of D.paradas) {
            p.noEspera = noLado(p.v, p.t, p.lado);
            p.pos = [nos[p.noEspera].x, nos[p.noEspera].z];
        }
        // pontos intermédios, para o passeio ter onde virar
        for (const v of vias) for (const s of [-1, 1]) {
            for (let t = v.a + 10; t < v.b; t += 25) {
                const [x, z] = D.pt(v, t, s * (v.w / 2 + 1.5));
                if (D.dentroDeOutra(v, x, z, 0.3)) continue;
                noLado(v, t, s);
            }
        }
        const nosChao = [];
        for (const v of vias) for (const s of [-1, 1]) {
            const L = linhas[v.idx][s].sort((a, b) => a.t - b.t);
            for (let i = 0; i < L.length; i++) {
                nosChao.push(L[i].id);
                if (i + 1 >= L.length) continue;
                const a = nos[L[i].id], b = nos[L[i + 1].id];
                if (D.dentroDeOutra(v, (a.x + b.x) / 2, (a.z + b.z) / 2, 0.2)) continue;
                if (Math.hypot(a.x - b.x, a.z - b.z) < 70) ligar(L[i].id, L[i + 1].id);
            }
        }
        this.nosChao = nosChao;

        // ---- anel da esplanada
        const poli = D.anel(7.2), anel = [];
        let acum = 0, prox = 0;
        for (let i = 0; i < poli.length; i++) {
            const a = poli[i], b = poli[(i + 1) % poli.length];
            const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
            while (acum + d >= prox) {
                const u = (prox - acum) / (d || 1);
                anel.push(no(a[0] + (b[0] - a[0]) * u, yG, a[1] + (b[1] - a[1]) * u));
                prox += 9;
            }
            acum += d;
        }
        for (let i = 0; i < anel.length; i++) ligar(anel[i], anel[(i + 1) % anel.length]);
        this.anel = anel;

        // ---- portões: o nó fica na ponta da fila
        for (const g of D.portoes) {
            const tx = Math.cos(g.ang), tz = -Math.sin(g.ang);
            const id = no(g.x + g.n[0] * 5.9, yG, g.z + g.n[1] * 5.9);
            const vizinhos = anel.slice().sort((a, b) => Math.hypot(nos[a].x - nos[id].x, nos[a].z - nos[id].z) - Math.hypot(nos[b].x - nos[id].x, nos[b].z - nos[id].z));
            ligar(id, vizinhos[0]); ligar(id, vizinhos[1]);
            nosChao.push(id);
            const lanes = [];
            for (const kk of [-2, 0, 2]) lanes.push({ k: kk, fila: [], t: 1 + this.rnd() * 3 });
            this.portoes.push({ x: g.x, z: g.z, n: g.n, tx, tz, noId: id, lanes });
        }

        // ---- estacionamentos: corredores entre as filas de vagas
        const nosLote = [];
        const porLote = new Map();
        for (const c of D.corredores) {
            const ids = [];
            for (let l = c.l0; l <= c.l1 + 0.01; l += 9) {
                const [x, z] = c.L === 'z' ? [c.s, l] : [l, c.s];
                ids.push(no(x, yG + 0.04, z));
            }
            for (let i = 0; i + 1 < ids.length; i++) ligar(ids[i], ids[i + 1]);
            nosLote.push(...ids);
            c.ids = ids;
            if (!porLote.has(c.lote)) porLote.set(c.lote, []);
            porLote.get(c.lote).push(c);
        }
        for (const lista of porLote.values()) {
            lista.sort((a, b) => a.s - b.s);
            for (let i = 0; i + 1 < lista.length; i++) {
                ligar(lista[i].ids[0], lista[i + 1].ids[0]);
                ligar(lista[i].ids[lista[i].ids.length - 1], lista[i + 1].ids[lista[i + 1].ids.length - 1]);
            }
            for (const c of lista) for (const id of [c.ids[0], c.ids[c.ids.length - 1]]) {
                ligar(id, maisPerto(nos[id].x, nos[id].z, anel, 60));
                ligar(id, maisPerto(nos[id].x, nos[id].z, nosChao, 60));
            }
        }
        for (const a of anel) ligar(a, maisPerto(nos[a].x, nos[a].z, nosLote, 30));
        this.nosLote = nosLote;

        // ---- bocas de metrô
        for (const b of D.bocas) {
            const nx = Math.sin(b.gira), nz = Math.cos(b.gira), tx = Math.cos(b.gira), tz = -Math.sin(b.gira);
            const frente = no(b.x + tx * 4.4, yG, b.z + tz * 4.4);
            ligar(frente, maisPerto(nos[frente].x, nos[frente].z, anel, 30));
            nosChao.push(frente);
            this.bocas.push({ x: b.x + nx * 1.9, z: b.z + nz * 1.9, noFrente: frente });
        }

        // ---- passarelas
        const PP = C.passarela;
        for (const p of D.passarelas) {
            const l0 = p.hr + PP.folgaAteAvenida, l1 = l0 + PP.rampa;
            const em = (t, y) => p.ao === 'x' ? no(p.x + t, y, p.z) : no(p.x, y, p.z + t);
            const A = em(-l1, yG), A1 = em(-l0, PP.altura), M0 = em(0, PP.altura), B1 = em(l0, PP.altura), B = em(l1, yG);
            ligar(A, A1); ligar(A1, M0); ligar(M0, B1); ligar(B1, B);
            for (const f of [A, B]) {
                ligar(f, maisPerto(nos[f].x, nos[f].z, nosChao, 40));
                ligar(f, maisPerto(nos[f].x, nos[f].z, anel, 40));
            }
        }

        // ---- metrô: plataformas e escadas
        if (D.metro) {
            const { zc, yT, ex } = D.metro;
            const M = C.metro;
            for (const lado of [-1, 1]) {
                const ids = [];
                for (let i = -3; i <= 3; i++) {
                    const id = no(ex + i * 9, yT + 0.9, zc + lado * 5.4);
                    ids.push(id);
                    this.plat[lado].nos = ids;
                }
                for (let i = 0; i + 1 < ids.length; i++) ligar(ids[i], ids[i + 1]);
            }
            for (const e of D.escadas) {
                const topo = no(e.x, yT + 0.5, e.z0), pe = no(e.x, yG, e.z1);
                const plat = this.plat[e.sz].nos;
                ligar(topo, pe);
                ligar(topo, maisPerto(e.x, e.z0, plat));
                ligar(pe, maisPerto(e.x, e.z1, nosChao, 40));
            }
        }
        this.nosChao = nosChao;
    },

    // ---- Dijkstra por distância (heap binário)
    caminho(de, para) {
        const nos = this.nos, adj = this.adj, n = nos.length;
        if (de === para) return [de];
        const dist = new Float64Array(n).fill(Infinity), ant = new Int32Array(n).fill(-1);
        const heap = [[0, de]];
        dist[de] = 0;
        const push = it => {
            heap.push(it); let i = heap.length - 1;
            while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
        };
        const pop = () => {
            const top = heap[0], last = heap.pop();
            if (heap.length) {
                heap[0] = last; let i = 0;
                for (;;) {
                    let l = 2 * i + 1, r = l + 1, m = i;
                    if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                    if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                    if (m === i) break;
                    [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
                }
            }
            return top;
        };
        while (heap.length) {
            const [d, u] = pop();
            if (d > dist[u]) continue;
            if (u === para) break;
            for (const v of adj[u]) {
                const a = nos[u], b = nos[v];
                const nd = d + Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.y - b.y) * 1.5;
                if (nd < dist[v]) { dist[v] = nd; ant[v] = u; push([nd, v]); }
            }
        }
        if (ant[para] < 0) return null;
        const out = [];
        for (let v = para; v >= 0; v = ant[v]) out.push(v);
        return out.reverse();
    },

    _noMaisPerto(x, y, z) {
        let m = 0, dm = 1e9;
        for (let i = 0; i < this.nos.length; i++) {
            const n = this.nos[i];
            const d = Math.hypot(n.x - x, n.z - z) + Math.abs(n.y - y) * 3;
            if (d < dm) { dm = d; m = i; }
        }
        return m;
    },

    // --------------------------------------------------------------------
    // CONSTRUÇÃO
    // --------------------------------------------------------------------
    construir(cid, grupo, rnd) {
        this.limpar();
        const C = CidadeConfig, G = C.gente;
        this.cid = cid; this.rnd = rnd;
        this.estat = { embTrem: 0, desTrem: 0, embOnibus: 0, desOnibus: 0, embTaxi: 0, desTaxi: 0, carros: 0, bocas: 0, estadio: 0, servidos: 0 };
        this._construirGrafo(cid.dados);
        this._criarMalhas(grupo);

        const yG = C.alturaCalcada + 0.02;
        const pick = a => a[Math.floor(rnd() * a.length) % a.length];
        const cores = {
            camisa: [0xd62828, 0x1d4ed8, 0xf5f5f5, 0x2a2a2a, 0xf2c200, 0x2f8a4f, 0x7b3fa0, 0xff7f2a, 0x4fb3d9, 0xd62828, 0x1d4ed8],
            calca: [0x20242c, 0x2f3e5a, 0x4a4a4a, 0x6b5a3a, 0x1a1a1a, 0x3a4a6a],
            pele: (typeof CrowdModel !== 'undefined' && CrowdModel.peles) ? CrowdModel.peles : [0xf0c8a0, 0xd9a577, 0xb07a4f, 0x7d5233, 0x4b2f1c]
        };
        const N = G.total;
        for (let i = 0; i < N; i++) {
            this.agentes.push({
                i, x: 0, y: yG, z: 0, yaw: rnd() * 6.28, fase: rnd() * 6.28,
                vel: G.velMin + rnd() * (G.velMax - G.velMin),
                ox: (rnd() - 0.5) * 1.1, oz: (rnd() - 0.5) * 1.1,
                modo: 'oculto', t: 0, no: 0, pts: null, pi: 0, fim: null, oc: null, ref: null,
                zerado: false, parada: null, gate: null, lane: null, naFrente: false, plataforma: 0,
                camisa: pick(cores.camisa), calca: pick(cores.calca), pele: pick(cores.pele),
                cabelo: (typeof CrowdModel !== 'undefined' && CrowdModel.cabelos) ? pick(CrowdModel.cabelos) : 0x2a1d12, w: 0.5
            });
        }
        this._pintar();

        // distribuição inicial: filas, estádio, metrô, resto pelas calçadas
        let livre = 0;
        const pegar = () => (livre < this.agentes.length ? this.agentes[livre++] : null);
        let nFila = 0;
        for (const g of this.portoes) {
            const lanes = g.lanes.slice().sort(() => rnd() - 0.5).slice(0, 2 + ((rnd() * 2) | 0));
            for (const lane of lanes) {
                const n = G.pessoasPorFila[0] + ((rnd() * (G.pessoasPorFila[1] - G.pessoasPorFila[0] + 1)) | 0);
                for (let j = 0; j < n && nFila < G.filasIniciais; j++) {
                    const a = pegar(); if (!a) break;
                    this._entrarNaFilaDireto(a, g, lane);
                    nFila++;
                }
            }
        }
        const nDentro = Math.round(N * 0.1);
        for (let i = 0; i < nDentro; i++) {
            const a = pegar(); if (!a) break;
            this._ocultar(a, i % 3 === 0 ? 'metro' : 'estadio', rnd() * 60);
        }
        let a;
        while ((a = pegar())) {
            const id = pick(this.nosChao);
            const n = this.nos[id];
            a.x = n.x + a.ox; a.y = n.y; a.z = n.z + a.oz; a.no = id;
            this._decidir(a);
        }
        this._desenhar(0);
    },

    /*
    O MODELO É O DOS JOGADORES (e dos adeptos): o `Crowd._geometrias(pose)` junta o
    corpo vestido — calças compridas e sapatos — numa geometria por canal de cor
    (pele, camisa, calças, cabelo, sapatos), já à escala do jogo e com os pés no chão.

    O PASSO: duas poses assadas, A (perna e braço de um lado à frente) e B (o
    contrário). A geometria é a de A e leva a de B num atributo (`posB`); o vertex
    shader faz `mix(position, posB, aW)`, com `aW` por pessoa (instanciado): 0 é A,
    1 é B e 0.5, a meio, é o corpo direito e parado. A fase do passo faz `aW` oscilar
    entre os dois; parada, `aW` volta devagar a 0.5. É a mesma ideia da bancada.

    As cinco malhas PARTILHAM a matriz das instâncias e o `aW`: escreve-se uma vez
    por frame, não cinco.
    */
    _criarMalhas(grupo) {
        if (typeof Crowd === 'undefined' || typeof CrowdModel === 'undefined' || typeof mergeNonIndexedGeometries === 'undefined') {
            this._modelo = 'caixas';
            return this._criarMalhasSimples(grupo);
        }
        this._modelo = 'jogador';
        const N = CidadeConfig.gente.total;
        const base = CrowdModel.poses.dePe;
        const A = Object.assign({}, base, {
            anca: 0, joelho: 0, ombro: -0.15, cotovelo: -0.25, tronco: 0.06, alturaBacia: 2.36,
            ancaE: -0.5, ancaD: 0.42, joelhoE: 0.05, joelhoD: 0.55,
            ombroE: 0.5, ombroD: -0.55, cotoveloE: -0.2, cotoveloD: -0.75
        });
        const B = Object.assign({}, A, {
            ancaE: 0.42, ancaD: -0.5, joelhoE: 0.55, joelhoD: 0.05,
            ombroE: -0.55, ombroD: 0.5, cotoveloE: -0.75, cotoveloD: -0.2
        });
        const gA = this._geometriasVestidas(A), gB = this._geometriasVestidas(B);
        const matriz = new THREE.InstancedBufferAttribute(new Float32Array(N * 16), 16);
        const aw = new THREE.InstancedBufferAttribute(new Float32Array(N).fill(0.5), 1);
        matriz.setUsage(THREE.DynamicDrawUsage); aw.setUsage(THREE.DynamicDrawUsage);
        this._matriz = matriz; this._aw = aw;
        this._mesh = {};
        for (const canal of Object.keys(gA)) {
            const g = gA[canal];
            g.setAttribute('posB', new THREE.BufferAttribute(new Float32Array(gB[canal].attributes.position.array), 3));
            g.setAttribute('aW', aw);
            const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
            mat.onBeforeCompile = sh => {
                sh.vertexShader = 'attribute vec3 posB;\nattribute float aW;\n' +
                    sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = mix(position, posB, aW);');
            };
            mat.customProgramCacheKey = () => 'cidade-gente-passo';
            const m = new THREE.InstancedMesh(g, mat, N);
            m.instanceMatrix = matriz;
            m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.name = 'Gente_' + canal;
            this._mesh[canal] = m;
            grupo.add(m);
        }
        this._tmp = {
            p: new THREE.Vector3(), qy: new THREE.Quaternion(), um: new THREE.Vector3(1, 1, 1), M: new THREE.Matrix4(),
            eixoY: new THREE.Vector3(0, 1, 0), zero: new THREE.Matrix4().makeScale(0, 0, 0)
        };
    },

    // Corpo vestido (calças compridas, sapatos) numa geometria por canal, à escala do jogo e com os pés no zero.
    _geometriasVestidas(pose) {
        const pecas = Crowd._pecas(pose, { perna: 'calcao', pe: 'sapato' });
        const escala = (typeof ESCALA_CORPO === 'number') ? ESCALA_CORPO : 1.8 / 5.5;
        const saida = {};
        let minY = Infinity;
        for (const canal in pecas) {
            if (!pecas[canal].length) continue;
            const g = mergeNonIndexedGeometries(pecas[canal]);
            g.scale(escala, escala, escala);
            g.computeBoundingBox();
            minY = Math.min(minY, g.boundingBox.min.y);
            saida[canal] = g;
        }
        for (const canal in saida) saida[canal].translate(0, -minY, 0);
        return saida;
    },

    // Cor por pessoa em cada canal (instanceColor).
    _pintar() {
        const cc = new THREE.Color();
        const mesh = this._mesh;
        for (const a of this.agentes) {
            if (this._modelo === 'jogador') {
                if (mesh.pele) mesh.pele.setColorAt(a.i, cc.setHex(0xffffff).set(a.pele));
                if (mesh.camisa) mesh.camisa.setColorAt(a.i, cc.set(a.camisa));
                if (mesh.calcao) mesh.calcao.setColorAt(a.i, cc.set(a.calca));
                if (mesh.cabelo) mesh.cabelo.setColorAt(a.i, cc.set(a.cabelo));
                if (mesh.sapato) mesh.sapato.setColorAt(a.i, cc.set(0x1b1b1d));
            } else {
                mesh.roupa.setColorAt(a.i, cc.set(a.camisa));
                mesh.cabeca.setColorAt(a.i, cc.set(a.pele));
                mesh.pernaE.setColorAt(a.i, cc.set(a.calca));
                mesh.pernaD.setColorAt(a.i, cc.set(a.calca));
            }
        }
        for (const m of Object.values(this._mesh)) m.instanceColor.needsUpdate = true;
    },

    // Reserva: bonecos de caixas, se o crowd.js não estiver carregado.
    _criarMalhasSimples(grupo) {
        const N = CidadeConfig.gente.total;
        const { novo, juntar, fechar, T } = this.cid._ferr();
        const caixa = () => new THREE.BoxGeometry(1, 1, 1);
        const fix = (r, g, b) => () => [r, g, b];
        // camisa: tronco e braços (braços curtos, pele tapada pelo tom da camisa)
        const r = novo();
        juntar(r, caixa(), T(0, 1.18, 0, 0.42, 0.62, 0.24), v => { const k = 0.82 + 0.18 * (v.y - 0.87) / 0.62; return [k, k, k]; });
        for (const s of [-1, 1]) juntar(r, caixa(), T(s * 0.275, 1.3, 0, 0.11, 0.38, 0.14), fix(0.9, 0.9, 0.9));
        // cabeça com cabelo
        const h = novo();
        juntar(h, new THREE.IcosahedronGeometry(1, 1), T(0, 1.65, 0, 0.115, 0.13, 0.12), v => v.y > 1.69 ? [0.16, 0.11, 0.08] : [1, 1, 1]);
        juntar(h, caixa(), T(0, 1.5, 0, 0.08, 0.1, 0.08), fix(0.95, 0.95, 0.95));         // pescoço
        // pernas, penduradas da anca (origem em y = 0)
        const p = novo();
        juntar(p, caixa(), T(0, -0.42, 0, 0.16, 0.84, 0.18), v => v.y < -0.78 ? [0.1, 0.1, 0.11] : [1, 1, 1]);
        const mat = () => new THREE.MeshLambertMaterial({ vertexColors: true });
        const mk = (g, m) => { const x = new THREE.InstancedMesh(g, m, N); x.frustumCulled = false; x.castShadow = false; x.receiveShadow = false; return x; };
        const gp = fechar(p);
        this._mesh = { roupa: mk(fechar(r), mat()), cabeca: mk(fechar(h), mat()), pernaE: mk(gp, mat()), pernaD: mk(gp, mat()) };
        for (const m of Object.values(this._mesh)) { m.name = 'Gente'; grupo.add(m); }
        this._tmp = {
            p: new THREE.Vector3(), q: new THREE.Quaternion(), qx: new THREE.Quaternion(), qy: new THREE.Quaternion(),
            um: new THREE.Vector3(1, 1, 1), M: new THREE.Matrix4(), eixoY: new THREE.Vector3(0, 1, 0), eixoX: new THREE.Vector3(1, 0, 0),
            lado: new THREE.Vector3(), zero: new THREE.Matrix4().makeScale(0, 0, 0)
        };
    },

    // --------------------------------------------------------------------
    // MOVIMENTO
    // --------------------------------------------------------------------
    _mover(a, dt, x, y, z, vel) {
        const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz);
        const passo = (vel || a.vel) * dt;
        if (d <= passo || d < 0.001) { a.x = x; a.z = z; a.y = y; return true; }
        const f = passo / d;
        a.x += dx * f; a.z += dz * f; a.y += (y - a.y) * f;
        let dy = Math.atan2(dx, dz) - a.yaw;
        while (dy > Math.PI) dy -= 2 * Math.PI;
        while (dy < -Math.PI) dy += 2 * Math.PI;
        a.yaw += dy * Math.min(1, dt * 9);
        a.fase += passo * 5.2;
        a.andando = true;
        return false;
    },

    // percorre `pts` ([x, y, z, idDoNó?]) e chama `fim`
    _seguir(a, pts, fim) {
        a.modo = 'anda'; a.pts = pts; a.pi = 0; a.fim = fim;
        if (!pts.length) { this._concluir(a); }
    },
    _concluir(a) {
        const f = a.fim; a.fim = null; a.pts = null;
        if (f) f(a); else this._decidir(a);
    },

    // vai por nós até `alvo` e chama `fim`; se não houver caminho, passeia
    _irPara(a, alvo, fim) {
        if (a.no === undefined || a.no < 0) a.no = this._noMaisPerto(a.x, a.y, a.z);
        const cam = this.caminho(a.no, alvo);
        if (!cam) { a.no = this._noMaisPerto(a.x, a.y, a.z); const c2 = this.caminho(a.no, alvo); if (!c2) return this._passear(a); return this._irPara2(a, c2, fim); }
        this._irPara2(a, cam, fim);
    },
    _irPara2(a, cam, fim) {
        const nos = this.nos;
        const pts = cam.map((id, i) => {
            const n = nos[id];
            const ult = i === cam.length - 1;
            return [n.x + (ult ? a.ox * 0.4 : a.ox), n.y, n.z + (ult ? a.oz * 0.4 : a.oz), id];
        });
        this._seguir(a, pts, fim);
    },

    _ocultar(a, tipo, t, ref) {
        a.modo = 'oculto'; a.oc = tipo; a.t = t; a.ref = ref || null; a.zerado = false;
    },

    // --------------------------------------------------------------------
    // DESTINOS
    // --------------------------------------------------------------------
    _decidir(a) {
        // pesos: passear, metrô, plataforma, parada, portão, carro. Quem acaba de sair do
        // estádio não volta logo a entrar.
        // Quem chega de metrô, comboio ou ônibus vai quase sempre para o estádio.
        if (a.rumoPortao && !a.semPortao && this.rnd() < 0.85) { a.rumoPortao = false; return this._irAoPortao(a); }
        a.rumoPortao = false;
        // (o destino `carro` fica de fora de propósito: o carro desaparecia do estacionamento)
        const w = [0.16, 0.10, 0.12, 0.12, a.semPortao ? 0 : 0.50, 0];
        a.semPortao = false;
        let r = this.rnd() * w.reduce((x, y) => x + y, 0);
        const fn = [this._passear, this._irAoMetro, this._irAPlataforma, this._irAParada, this._irAoPortao, this._irAoCarro];
        for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return fn[i].call(this, a); }
        return this._passear(a);
    },

    _passear(a) {
        const alvo = this.nosChao[Math.floor(this.rnd() * this.nosChao.length)];
        this._irPara(a, alvo, a2 => {
            a2.modo = 'espera'; a2.t = 1 + this.rnd() * 4; a2.espera = 'passeio';
        });
    },

    _irAoMetro(a) {
        const b = this.bocas[Math.floor(this.rnd() * this.bocas.length)];
        this._irPara(a, b.noFrente, a2 => {
            this._seguir(a2, [[b.x, a2.y, b.z]], a3 => {
                this.estat.bocas++;
                const T = CidadeConfig.gente.tempoNoMetro;
                this._ocultar(a3, 'metro', T[0] + this.rnd() * (T[1] - T[0]));
            });
        });
    },

    _irAPlataforma(a) {
        const D = this.cid.dados;
        if (!D.metro) return this._passear(a);
        const lado = this.rnd() < 0.5 ? -1 : 1;
        const ids = this.plat[lado].nos;
        const alvo = ids[Math.floor(this.rnd() * ids.length)];
        this._irPara(a, alvo, a2 => this._esperarNaPlataforma(a2, lado));
    },
    _esperarNaPlataforma(a, lado) {
        const D = this.cid.dados.metro;
        const x = D.ex + (this.rnd() - 0.5) * 56, z = D.zc + lado * (5.5 + this.rnd() * 0.7);
        this._seguir(a, [[x, D.yT + 0.9, z]], a2 => {
            a2.modo = 'espera'; a2.espera = 'plataforma'; a2.plataforma = lado; a2.t = 90 + this.rnd() * 90;
            this.plat[lado].push(a2);
        });
    },

    _irAParada(a) {
        const P = this.cid.dados.paradas;
        if (!P.length) return this._passear(a);
        const p = P[Math.floor(this.rnd() * P.length)];
        this._irPara(a, p.noEspera, a2 => this._esperarNaParada(a2, p));
    },
    _esperarNaParada(a, p) {
        const v = p.v;
        const al = (this.rnd() - 0.5) * 3;
        const x = p.pos[0] + (v.eixo === 'x' ? al : 0), z = p.pos[1] + (v.eixo === 'z' ? al : 0);
        this._seguir(a, [[x, a.y, z]], a2 => {
            a2.modo = 'espera'; a2.espera = 'parada'; a2.parada = p; a2.t = 70 + this.rnd() * 70;
            p.esperando.push(a2);
        });
    },

    _irAoPortao(a) {
        const g = this.portoes[Math.floor(this.rnd() * this.portoes.length)];
        this._irPara(a, g.noId, a2 => this._entrarNaFila(a2, g));
    },
    _slot(g, lane, idx) {
        const lx = lane.k * 1.3, lz = 2.4 + idx * 0.8;
        return [g.x + g.tx * lx + g.n[0] * lz, g.z + g.tz * lx + g.n[1] * lz];
    },
    _entrarNaFila(a, g) {
        const lane = g.lanes.reduce((m, l) => (l.fila.length < m.fila.length ? l : m), g.lanes[0]);
        if (lane.fila.length >= 5) { a.modo = 'espera'; a.espera = 'fila'; a.t = 3 + this.rnd() * 3; a.gate = g; return; }
        this._entrarNaFilaDireto(a, g, lane, true);
    },
    _entrarNaFilaDireto(a, g, lane, andando) {
        a.modo = 'fila'; a.gate = g; a.lane = lane; a.naFrente = false; a.zerado = false;
        const idx = lane.fila.length;
        lane.fila.push(a);
        if (!andando) {
            const [x, z] = this._slot(g, lane, idx);
            a.x = x; a.z = z; a.y = CidadeConfig.alturaCalcada + 0.02; a.yaw = Math.atan2(-g.n[0], -g.n[1]);
            a.no = g.noId;
        }
    },
    _servirFila(g, lane) {
        const a = lane.fila.shift();
        const cfg = CidadeConfig.gente;
        lane.t = cfg.servicoCatraca[0] + this.rnd() * (cfg.servicoCatraca[1] - cfg.servicoCatraca[0]);
        const lx = lane.k * 1.3, y = CidadeConfig.alturaCalcada + 0.02;
        const P = (lz) => [g.x + g.tx * lx + g.n[0] * lz, y, g.z + g.tz * lx + g.n[1] * lz];
        a.lane = null; a.naFrente = false;
        this._seguir(a, [P(1.2), P(-1.0)], a2 => {
            this.estat.estadio++;
            const T = CidadeConfig.gente.tempoNoEstadio;
            this._ocultar(a2, 'estadio', T[0] + this.rnd() * (T[1] - T[0]));
        });
        a.vel = 1.0;
        this.estat.servidos++;
    },

    _irAoCarro(a) {
        const P = this.cid._parados;
        if (!P) return this._passear(a);
        let c = null;
        for (let i = 0; i < 12; i++) {
            const cand = P.lista[Math.floor(this.rnd() * P.lista.length)];
            if (!cand.oculto && !cand.reservado) { c = cand; break; }
        }
        if (!c) return this._passear(a);
        c.reservado = true;
        if (c.noLote === undefined) {
            let m = 0, dm = 1e9;
            for (const id of this.nosLote) { const d = Math.hypot(this.nos[id].x - c.x, this.nos[id].z - c.z); if (d < dm) { dm = d; m = id; } }
            c.noLote = m;
        }
        this._irPara(a, c.noLote, a2 => {
            this._seguir(a2, [[c.x + 1.3, a2.y, c.z]], a3 => {
                this.estat.carros++;
                this.cid.mostrarCarroParado(c.i, false);
                const T = CidadeConfig.gente.tempoNoCarro;
                this._ocultar(a3, 'carro', T[0] + this.rnd() * (T[1] - T[0]), c);
            });
        });
    },

    // quando o tempo de um oculto acaba
    _emergir(a) {
        const yG = CidadeConfig.alturaCalcada + 0.02;
        a.zerado = false;
        if (a.oc === 'metro') {
            const b = this.bocas[Math.floor(this.rnd() * this.bocas.length)];
            a.x = b.x; a.z = b.z; a.y = yG; a.rumoPortao = true;
            a.no = b.noFrente;
            const n = this.nos[b.noFrente];
            this._seguir(a, [[n.x, yG, n.z, b.noFrente]], null);
        } else if (a.oc === 'estadio') {
            const g = this.portoes[Math.floor(this.rnd() * this.portoes.length)];
            const lx = (this.rnd() < 0.5 ? -3 : 3) * 1.3;
            a.x = g.x + g.tx * lx + g.n[0] * 0.6; a.z = g.z + g.tz * lx + g.n[1] * 0.6; a.y = yG;
            a.no = g.noId; a.semPortao = true;
            const n = this.nos[g.noId];
            this._seguir(a, [[g.x + g.tx * lx + g.n[0] * 3.5, yG, g.z + g.tz * lx + g.n[1] * 3.5], [n.x, yG, n.z, g.noId]], null);
        } else if (a.oc === 'carro') {
            const c = a.ref;
            this.cid.mostrarCarroParado(c.i, true); c.reservado = false;
            a.x = c.x + 1.3; a.z = c.z; a.y = yG + 0.04;
            a.no = c.noLote;
            const n = this.nos[c.noLote];
            this._seguir(a, [[n.x, n.y, n.z, c.noLote]], null);
        }
        a.oc = null; a.ref = null;
    },

    // --------------------------------------------------------------------
    // TRANSPORTES
    // --------------------------------------------------------------------
    // Um veículo acaba de parar: desce parte dos passageiros, sobem os que esperam.
    aoVeiculoParar(c, p) {
        const sai = Math.min(c.passageiros.length, c.onibus ? 1 + ((this.rnd() * 3) | 0) : 1);
        for (let i = 0; i < sai; i++) {
            const a = c.passageiros.shift();
            a.modo = 'saindo'; a.t = 0.8 + i * 1.2; a.ref = c; a.parada = p;
            this.estat[c.onibus ? 'desOnibus' : 'desTaxi']++;
        }
        const cap = c.onibus ? 4 : 1;
        const espera = p.esperando.filter(a => a.modo === 'espera');
        for (let i = 0; i < Math.min(cap, espera.length); i++) {
            const a = espera[i];
            p.esperando.splice(p.esperando.indexOf(a), 1);
            a.modo = 'embarcando'; a.t = 0.4 + i * 0.7; a.ref = c; a.parada = p;
        }
    },
    aoVeiculoPartir() { },

    aoTremParar(t) {
        const u = t.userData;
        const portas = this.cid.portasDoTrem(t);
        const n = Math.ceil(u.pax.length * 0.6);
        for (let i = 0; i < n; i++) {
            const a = u.pax.shift();
            a.modo = 'saindo'; a.t = 0.5 + i * 0.25; a.ref = t; a.porta = portas[Math.floor(this.rnd() * portas.length)];
            this.estat.desTrem++;
        }
        u.tEmb = 0;
    },
    aoTremPartir() { },

    _emTransporte(a) {
        const D = this.cid.dados;
        const yG = CidadeConfig.alturaCalcada + 0.02;
        const c = a.ref;
        a.zerado = false; a.rumoPortao = true;
        if (c.isMesh) {            // comboio
            const m = D.metro;
            a.x = a.porta.x; a.z = a.porta.z; a.y = m.yT + 0.9;
            const ids = this.plat[c.userData.lado].nos;
            const id = ids[Math.floor(this.rnd() * ids.length)];
            a.no = id;
            const n = this.nos[id];
            this._seguir(a, [[n.x + a.ox, n.y, n.z, id]], null);
        } else {                   // ônibus / táxi
            const [x, z] = this.cid.portaDoVeiculo(c);
            a.x = x; a.z = z; a.y = yG - 0.02;
            const p = a.parada;
            a.no = p.noEspera;
            this._seguir(a, [[p.pos[0], yG, p.pos[1], p.noEspera]], null);
        }
        a.ref = null;
    },

    _embarcar(a) {
        const D = this.cid.dados, c = a.ref;
        if (c.isMesh) {
            const portas = this.cid.portasDoTrem(c);
            let m = portas[0], dm = 1e9;
            for (const p of portas) { const d = Math.abs(p.x - a.x); if (d < dm) { dm = d; m = p; } }
            this._seguir(a, [[m.x, D.metro.yT + 0.9, m.z]], a2 => {
                const u = c.userData;
                if (u.estado === 'parado' && u.timer > 0.6) {
                    u.pax.push(a2); this.estat.embTrem++; this._ocultar(a2, 'trem', Infinity, c);
                } else this._esperarNaPlataforma(a2, u.lado);
            });
        } else {
            const [x, z] = this.cid.portaDoVeiculo(c), p = a.parada;
            this._seguir(a, [[x, CidadeConfig.alturaCalcada, z]], a2 => {
                if (c.estado === 'parado' && c.paradaAtual === p) {
                    c.passageiros.push(a2);
                    this.estat[c.onibus ? 'embOnibus' : 'embTaxi']++;
                    this._ocultar(a2, 'veic', Infinity, c);
                } else this._esperarNaParada(a2, p);
            });
        }
    },

    // --------------------------------------------------------------------
    // PASSO
    // --------------------------------------------------------------------
    update(dt) {
        if (!this.agentes.length) return;
        dt = Math.min(dt, 0.1);
        const M = CidadeConfig.metro, cid = this.cid;
        // filas: a frente de cada uma passa a catraca de tempos a tempos
        for (const g of this.portoes) for (const lane of g.lanes) {
            lane.t -= dt;
            if (lane.t <= 0 && lane.fila.length && lane.fila[0].naFrente) this._servirFila(g, lane);
        }
        // embarque no comboio: um por 0.3 s, só com as portas abertas
        for (const t of cid._trens) {
            const u = t.userData;
            if (u.estado !== 'parado' || u.timer > M.paragem - 1.2 || u.timer < 1.5) continue;
            u.tEmb = (u.tEmb || 0) - dt;
            if (u.tEmb > 0) continue;
            u.tEmb = 0.3;
            const lst = this.plat[u.lado];
            const i = lst.findIndex(a => a.modo === 'espera');
            if (i < 0) continue;
            const a = lst.splice(i, 1)[0];
            a.modo = 'embarcando'; a.t = 0; a.ref = t;
        }
        for (const a of this.agentes) this._passo(a, dt);
        this._desenhar(dt);
    },

    _passo(a, dt) {
        a.andando = false;
        const yG = CidadeConfig.alturaCalcada + 0.02;
        switch (a.modo) {
            case 'anda': {
                const p = a.pts[a.pi];
                if (this._mover(a, dt, p[0], p[1], p[2])) {
                    if (p[3] !== undefined) a.no = p[3];
                    a.pi++;
                    if (a.pi >= a.pts.length) this._concluir(a);
                }
                break;
            }
            case 'espera':
                a.t -= dt;
                if (a.t <= 0) {
                    if (a.espera === 'fila') { this._entrarNaFila(a, a.gate); break; }
                    if (a.espera === 'parada' && a.parada) { const p = a.parada; const i = p.esperando.indexOf(a); if (i >= 0) p.esperando.splice(i, 1); a.parada = null; }
                    if (a.espera === 'plataforma') { const l = this.plat[a.plataforma]; const i = l.indexOf(a); if (i >= 0) l.splice(i, 1); }
                    a.espera = null;
                    this._decidir(a);
                }
                break;
            case 'fila': {
                const lane = a.lane, g = a.gate;
                const idx = lane.fila.indexOf(a);
                if (idx < 0) break;
                const [x, z] = this._slot(g, lane, idx);
                const chegou = this._mover(a, dt, x, yG, z, 1.0);
                a.naFrente = chegou && idx === 0;
                if (chegou) a.yaw = Math.atan2(-g.n[0], -g.n[1]);
                break;
            }
            case 'oculto':
                if (a.oc === 'veic' || a.oc === 'trem') break;
                a.t -= dt;
                if (a.t <= 0) this._emergir(a);
                break;
            case 'saindo':
                a.t -= dt;
                if (a.t <= 0) this._emTransporte(a);
                break;
            case 'embarcando':
                a.t -= dt;
                if (a.t <= 0) this._embarcar(a);
                break;
        }
    },

    _desenhar(dt) {
        if (this._modelo === 'jogador') return this._desenharJogador(dt);
        const T = this._tmp, mesh = this._mesh;
        for (const a of this.agentes) {
            const oculto = a.modo === 'oculto' || a.modo === 'saindo';
            if (oculto) {
                if (!a.zerado) {
                    for (const m of Object.values(mesh)) m.setMatrixAt(a.i, T.zero);
                    a.zerado = true;
                }
                continue;
            }
            a.zerado = false;
            const balanco = a.andando ? Math.sin(a.fase) * 0.6 : 0;
            const bob = a.andando ? Math.abs(Math.cos(a.fase)) * 0.03 : 0;
            T.qy.setFromAxisAngle(T.eixoY, a.yaw);
            T.p.set(a.x, a.y + bob, a.z);
            T.M.compose(T.p, T.qy, T.um);
            mesh.roupa.setMatrixAt(a.i, T.M);
            mesh.cabeca.setMatrixAt(a.i, T.M);
            for (const s of [-1, 1]) {
                T.qx.setFromAxisAngle(T.eixoX, balanco * s);
                T.q.copy(T.qy).multiply(T.qx);
                T.lado.set(s * 0.1, 0.85, 0).applyQuaternion(T.qy);
                T.p.set(a.x + T.lado.x, a.y + bob + T.lado.y, a.z + T.lado.z);
                T.M.compose(T.p, T.q, T.um);
                (s < 0 ? mesh.pernaE : mesh.pernaD).setMatrixAt(a.i, T.M);
            }
        }
        for (const m of Object.values(mesh)) m.instanceMatrix.needsUpdate = true;
    },

    // Modelo do jogador: uma matriz e um `aW` por pessoa, partilhados pelas cinco malhas.
    _desenharJogador(dt) {
        const T = this._tmp, arr = this._matriz.array, aw = this._aw.array;
        for (const a of this.agentes) {
            const i = a.i;
            if (a.modo === 'oculto' || a.modo === 'saindo') {
                if (!a.zerado) { arr.set(T.zero.elements, i * 16); a.zerado = true; }
                continue;
            }
            a.zerado = false;
            let w;
            if (a.andando) {
                w = 0.5 + 0.5 * Math.sin(a.fase);
                a.w = w;
            } else {
                a.w += (0.5 - a.w) * Math.min(1, dt * 6);       // pára com as pernas juntas
                w = a.w;
            }
            aw[i] = w;
            const bob = a.andando ? Math.abs(Math.cos(a.fase)) * 0.03 : 0;
            T.qy.setFromAxisAngle(T.eixoY, a.yaw);
            T.p.set(a.x, a.y + bob, a.z);
            T.M.compose(T.p, T.qy, T.um);
            arr.set(T.M.elements, i * 16);
        }
        this._matriz.needsUpdate = true;
        this._aw.needsUpdate = true;
    }
};
if (typeof window !== 'undefined') window.CidadeGente = CidadeGente;
