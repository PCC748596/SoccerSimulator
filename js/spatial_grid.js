/*
=============================================================================
SPATIAL GRID
=============================================================================
Campo dividido em 25 (largura) x 32 (comprimento) células — ~2.7 x 3.3m
cada. Cada célula sabe quem está dentro dela
(por equipa) e traz anotações derivadas — livre, marcada, ponto de apoio,
valor de passe — mais bónus por tipo de acção (passe, lançamento, chute,
cruzamento, cabeçada). Reconstruída inteira a cada frame em Match.update():
com só 22 jogadores e ~1800 células isto é barato, e evita rastrear em que
célula cada jogador estava no frame anterior para o tirar de lá.

O objectivo é o jogador com bola poder "ler" as células perto dele para
decidir — hoje só a estrutura de dados e o debug visual existem; a ligação
às decisões do BT é o próximo passo (findThroughBall já usa findFreeSpace).

Convenção de cor/equipa igual ao placar (ver Match.updatePlacar): TeamA =
BLUE, TeamB = RED.
=============================================================================
*/
const SpatialGrid = {
    /*
    Grid fixa por contagem de células, não por tamanho de célula: 32 colunas
    ao longo do COMPRIMENTO (106m, `rows`, eixo Z) por 25 à LARGURA (68m,
    `cols`, eixo X).
    */
    cols: 25,   // eixo X (largura)
    rows: 32,   // eixo Z (comprimento)
    cellSizeX: 0, cellSizeZ: 0,
    minX: 0, minZ: 0,
    cells: null,

    debug: false,
    _mesh: null, _canvas: null, _ctx: null, _tex: null,
    _redrawAccum: 0,
    _redrawEvery: 0.15, // debug é caro (texto por célula) — não vale redesenhar a 60fps

    init: function () {
        this.minX = -CAMPO_LARG / 2;
        this.minZ = -CAMPO_COMP / 2;
        this.cellSizeX = CAMPO_LARG / this.cols;
        this.cellSizeZ = CAMPO_COMP / this.rows;
        this.cells = new Array(this.cols * this.rows);
        for (let i = 0; i < this.cells.length; i++) this.cells[i] = this.blankCell();
    },

    blankCell: function () {
        return {
            TeamA: [], TeamB: [],
            free: true,
            markA: false, markB: false,
            supportA: false, supportB: false,
            passA: 0, passB: 0,
            bonus: {
                A: { pass: 0, lanc: 0, chute: 0, cruz: 0, cab: 0 },
                B: { pass: 0, lanc: 0, chute: 0, cruz: 0, cab: 0 }
            }
        };
    },

    idx: function (ix, iz) { return iz * this.cols + ix; },

    cellIndexAt: function (x, z) {
        let ix = Math.floor((x - this.minX) / this.cellSizeX);
        let iz = Math.floor((z - this.minZ) / this.cellSizeZ);
        ix = Math.max(0, Math.min(this.cols - 1, ix));
        iz = Math.max(0, Math.min(this.rows - 1, iz));
        return { ix: ix, iz: iz };
    },

    // Chamado uma vez por frame a partir de Match.update().
    update: function (dt) {
        if (!this.cells) this.init();
        for (let i = 0; i < this.cells.length; i++) {
            this.cells[i].TeamA.length = 0;
            this.cells[i].TeamB.length = 0;
        }
        for (const p of Match.players) {
            const c = this.cellIndexAt(p.model.position.x, p.model.position.z);
            this.cells[this.idx(c.ix, c.iz)].TeamA.push(p);
        }
        for (const p of Match.opponents) {
            const c = this.cellIndexAt(p.model.position.x, p.model.position.z);
            this.cells[this.idx(c.ix, c.iz)].TeamB.push(p);
        }

        this.annotate();

        if (this.debug) {
            this._redrawAccum += (dt || 0);
            if (this._redrawAccum >= this._redrawEvery) {
                this._redrawAccum = 0;
                this.updateDebugVisual();
            }
        }
    },

    /*
    Campo de influência: cada jogador "espalha" valor 1.0 na sua própria
    célula, decaindo linearmente até 0 numa distância de `influenceRaioM`
    metros — não é só a célula onde ele está, as vizinhas também sobem (e
    descem de novo se ele sair). Vários jogadores perto empilham (soma),
    por isso duas defesas encostadas marcam mais forte que uma só. Guardado
    em dois Float32Array (um por equipa) do tamanho da grid — muito mais
    barato do que cada célula perguntar "quem está perto de mim" com uma
    janela fixa (como era antes).
    */
    influenceRaioM: 12,

    splatInfluence: function () {
        const n = this.cols * this.rows;
        if (!this.infA || this.infA.length !== n) {
            this.infA = new Float32Array(n);
            this.infB = new Float32Array(n);
        }
        this.infA.fill(0);
        this.infB.fill(0);

        // Células já não são quadradas (cellSizeX != cellSizeZ) — o raio de
        // varrimento em células é diferente por eixo, mas a distância usada
        // no decaimento é sempre em METROS, não em "células", senão o
        // círculo de influência saía oval.
        const raioCelX = Math.max(1, Math.ceil(this.influenceRaioM / this.cellSizeX));
        const raioCelZ = Math.max(1, Math.ceil(this.influenceRaioM / this.cellSizeZ));

        const splat = (players, arr) => {
            for (const p of players) {
                const c = this.cellIndexAt(p.model.position.x, p.model.position.z);
                for (let dz = -raioCelZ; dz <= raioCelZ; dz++) {
                    const cz = c.iz + dz;
                    if (cz < 0 || cz >= this.rows) continue;
                    for (let dx = -raioCelX; dx <= raioCelX; dx++) {
                        const cx = c.ix + dx;
                        if (cx < 0 || cx >= this.cols) continue;
                        const distM = Math.hypot(dx * this.cellSizeX, dz * this.cellSizeZ);
                        if (distM > this.influenceRaioM) continue;
                        arr[this.idx(cx, cz)] += 1 - distM / this.influenceRaioM; // 1 no centro, 0 na borda
                    }
                }
            }
        };
        splat(Match.players, this.infA);
        splat(Match.opponents, this.infB);
    },

    /*
    Anotações por célula, derivadas do campo de influência acima. Fórmulas
    propositadamente simples (primeira versão) — dá pra afinar depois sem
    mexer na estrutura:

        free              nenhum jogador (das duas equipas) na célula
        markA/markB       influência dessa equipa acima do limiar de
                           marcação (~7-8m de um jogador dela)
        supportA/supportB célula livre com alguma influência da equipa por
                           perto, mas abaixo do limiar de marcação
        passA/passB       0-100, quanto vale essa equipa passar pra aqui:
                           menos influência adversária por perto (contínua,
                           soma de vários jogadores), mais progressão no
                           referencial de ataque dela
        bonus.*.{pass,lanc,chute,cruz,cab}
                           valor de contexto por zona do campo (baliza,
                           grande área, ala), por equipa/direcção de ataque
    */
    markLimiar: 0.35,
    supportLimiar: 0.05,

    annotate: function () {
        this.splatInfluence();

        for (let iz = 0; iz < this.rows; iz++) {
            for (let ix = 0; ix < this.cols; ix++) {
                const i = this.idx(ix, iz);
                const cell = this.cells[i];
                const cx = this.minX + (ix + 0.5) * this.cellSizeX;
                const cz = this.minZ + (iz + 0.5) * this.cellSizeZ;

                cell.free = (cell.TeamA.length === 0 && cell.TeamB.length === 0);

                const infA = this.infA[i], infB = this.infB[i];
                cell.markA = infA > this.markLimiar;
                cell.markB = infB > this.markLimiar;
                cell.supportA = cell.free && infA > this.supportLimiar && !cell.markA;
                cell.supportB = cell.free && infB > this.supportLimiar && !cell.markB;

                cell.passA = this.passValue(cz, 1, infB, infA);
                cell.passB = this.passValue(cz, -1, infA, infB);

                this.zoneBonus(cell.bonus.A, cx, cz, 1);
                this.zoneBonus(cell.bonus.B, cx, cz, -1);
            }
        }
    },

    // dir = sentido de ataque da equipa que está a avaliar passar pra aqui.
    // infAdversaria/infPropria = influência (contínua, soma de vários
    // jogadores dentro do raio) de cada equipa nesta célula.
    passValue: function (cz, dir, infAdversaria, infPropria) {
        const avanco = cz * dir; // referencial de ataque: mais alto = melhor
        let v = 55 - infAdversaria * 30 - infPropria * 10 + avanco * 0.35;
        return Math.round(Math.max(0, Math.min(100, v)));
    },

    // Bónus de contexto por zona do campo, no referencial de ataque de quem
    // ataca no sentido `dir` (linha da baliza adversária = +53*dir).
    zoneBonus: function (out, cx, cz, dir) {
        const avanco = cz * dir;               // -53 baliza própria .. +53 baliza adversária
        const largura = Math.abs(cx);

        const dentroArea = avanco > (53 - 16.5) && largura < 20.16;
        const dentroPequenaArea = avanco > (53 - 5.5) && largura < 9.16;
        const zonaRemate = avanco > (53 - 22) && largura < 18;
        const ala = largura > 20 && avanco > (53 - 30);
        const costasDaLinha = avanco > 18; // aprox. final terço, ver findThroughBall p/ linha real

        out.chute = dentroArea ? 40 : (zonaRemate ? 18 : 0);
        out.cab = dentroPequenaArea ? 45 : (dentroArea ? 20 : 0);
        out.cruz = ala ? 30 : 0;
        out.lanc = costasDaLinha ? 25 : 0;
        out.pass = Math.round(30 + avanco * 0.3);
    },

    cellAt: function (x, z) {
        const c = this.cellIndexAt(x, z);
        return this.cells[this.idx(c.ix, c.iz)];
    },

    // Nº de jogadores de uma equipa numa janela quadrada de `raioCelulas`
    // células ao redor de (x,z). team = 'TeamA' | 'TeamB'.
    occupancy: function (x, z, raioCelulas, team) {
        const c = this.cellIndexAt(x, z);
        let n = 0;
        for (let dz = -raioCelulas; dz <= raioCelulas; dz++) {
            for (let dx = -raioCelulas; dx <= raioCelulas; dx++) {
                const cx = c.ix + dx, cz = c.iz + dz;
                if (cx < 0 || cx >= this.cols || cz < 0 || cz >= this.rows) continue;
                n += this.cells[this.idx(cx, cz)][team].length;
            }
        }
        return n;
    },

    /*
    Ponto mais livre de `equipaAEvitar` dentro de `raioMetros` de (x,z).
    Devolve {x,z} ou null se não achar candidato dentro dos limites do campo.
    */
    findFreeSpace: function (x, z, raioMetros, equipaAEvitar) {
        if (!this.cells) this.init();
        const raioCelX = Math.max(1, Math.round(raioMetros / this.cellSizeX));
        const raioCelZ = Math.max(1, Math.round(raioMetros / this.cellSizeZ));
        const c = this.cellIndexAt(x, z);
        let melhor = null, melhorNota = -Infinity;

        for (let dz = -raioCelZ; dz <= raioCelZ; dz++) {
            for (let dx = -raioCelX; dx <= raioCelX; dx++) {
                const cx = c.ix + dx, cz = c.iz + dz;
                if (cx < 0 || cx >= this.cols || cz < 0 || cz >= this.rows) continue;
                const distM = Math.hypot(dx * this.cellSizeX, dz * this.cellSizeZ);
                if (distM > raioMetros) continue;

                const px = this.minX + (cx + 0.5) * this.cellSizeX;
                const pz = this.minZ + (cz + 0.5) * this.cellSizeZ;
                const ocupacao = this.occupancy(px, pz, 1, equipaAEvitar);
                const nota = -ocupacao * 10 - distM * 0.15;

                if (nota > melhorNota) { melhorNota = nota; melhor = { x: px, z: pz }; }
            }
        }
        return melhor;
    },

    /* --- Visualização de debug -------------------------------------------
    Fundo transparente (o relvado escuro do campo já fica visível por
    baixo) + linhas mais claras a cada 2m + texto compacto por célula:
        linha 1: FREE, ou RM/BM (marcada por Red/Blue)
        linha 2: R:xx B:xx (valor de passe de cada equipa pra ali)
    ----------------------------------------------------------------------- */

    pxPerMeter: 32,

    buildDebugVisual: function () {
        const w = Math.round(CAMPO_LARG * this.pxPerMeter);
        const h = Math.round(CAMPO_COMP * this.pxPerMeter);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const tex = new THREE.CanvasTexture(canvas);
        // Mipmap em texto fino borra tudo a qualquer ângulo/zoom que não seja
        // 1:1 — desliga mipmap e usa filtro linear simples (nítido, sem serrilhado).
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
        const geo = new THREE.PlaneGeometry(CAMPO_LARG, CAMPO_COMP);
        const mesh = new THREE.Mesh(geo, mat);
        // SÓ o rotation.x deita o plano no chão, alinhado com o campo
        // (68 de largura em X, 106 de comprimento em Z). Rodar a MALHA
        // inteira (como antes, com rotateZ) troca essas dimensões de eixo —
        // a malha passa a ocupar 106 em X (que só tem 68 de campo), sobrando
        // tile fora do campo, e a célula que aparece num ponto do ecrã já
        // não é a célula calculada pra esse ponto (dados de uma posição
        // aparecem desenhados noutra) — por isso mudavam "sem ninguém lá".
        // O giro pedido é só do TEXTO, feito dentro de updateDebugVisual()
        // por célula (ctx.rotate), não da malha.
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.03;
        mesh.visible = false;
        Match.scene.add(mesh);
        this._canvas = canvas; this._ctx = ctx; this._tex = tex; this._mesh = mesh;
    },

    updateDebugVisual: function () {
        if (!this._mesh) this.buildDebugVisual();
        this._mesh.visible = this.debug;
        if (!this.debug) return;

        const ctx = this._ctx;
        const csX = this.cellSizeX * this.pxPerMeter;
        const csZ = this.cellSizeZ * this.pxPerMeter;
        const w = this._canvas.width, h = this._canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Linhas mais claras a cada célula, sobre o verde escuro do campo
        // (que fica por baixo — este canvas é transparente).
        ctx.strokeStyle = 'rgba(200, 255, 210, 0.22)';
        ctx.lineWidth = 1;
        for (let ix = 0; ix <= this.cols; ix++) {
            ctx.beginPath(); ctx.moveTo(ix * csX, 0); ctx.lineTo(ix * csX, h); ctx.stroke();
        }
        for (let iz = 0; iz <= this.rows; iz++) {
            ctx.beginPath(); ctx.moveTo(0, iz * csZ, 0); ctx.lineTo(w, iz * csZ); ctx.stroke();
        }

        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Só o TEXTO gira (90° anti-horário pedido), a malha fica alinhada
        // com o campo. Um único sítio pra ajustar o sinal se sair invertido.
        const textAngle = -Math.PI / 2;

        for (let iz = 0; iz < this.rows; iz++) {
            for (let ix = 0; ix < this.cols; ix++) {
                const cell = this.cells[this.idx(ix, iz)];
                // Linha 0 do canvas = topo = -Z no mundo (plano roda -90° em
                // X); inverte a linha pra bater com o campo.
                const linha = this.rows - 1 - iz;
                const px = ix * csX + csX / 2;
                const py = linha * csZ + csZ / 2;

                const marca = (cell.markB ? 'R' : '') + (cell.markA && cell.markB ? ',' : '') + (cell.markA ? 'B' : '');

                const l1 = 'PASS | R:' + cell.passB + ', B:' + cell.passA;
                const l2 = 'MARK | ' + (marca || '-');
                // "->" = lançamento (passe directo nas costas da defesa) — ver bonus.lanc.
                const l3 = '-> | R:' + cell.bonus.B.lanc + ', B:' + cell.bonus.A.lanc;

                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(textAngle);

                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillText(l1, 0.6, -csZ * 0.24 + 0.6);
                ctx.fillText(l2, 0.6, 0.6);
                ctx.fillText(l3, 0.6, csZ * 0.24 + 0.6);
                ctx.fillStyle = 'rgba(235,255,235,0.92)';
                ctx.fillText(l1, 0, -csZ * 0.24);
                ctx.fillText(l2, 0, 0);
                ctx.fillText(l3, 0, csZ * 0.24);

                ctx.restore();
            }
        }

        this._tex.needsUpdate = true;
    },

    setDebug: function (on) {
        this.debug = on;
        if (!this._mesh) this.buildDebugVisual();
        this._mesh.visible = on;
        if (on) this.updateDebugVisual();
    }
};
