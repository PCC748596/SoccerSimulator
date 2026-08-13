/*
=============================================================================
SPATIAL GRID
=============================================================================
Campo dividido em células de 2x2m. Cada célula sabe quem está dentro dela,
por equipa. Reconstruída (não incrementalmente) a cada frame em
Match.update() — com só 22 jogadores isto é barato, e evita ter de rastrear
em que célula cada jogador estava no frame anterior para o tirar de lá.

Serve para perguntas de espaço que hoje custam um loop O(n) sobre todos os
adversários/colegas (findCross, findThroughBall, scoring de passe,
marcação): "há alguém perto deste ponto?", "qual o espaço mais livre perto
dali?". Ainda não está ligado a nenhuma dessas decisões — é só a estrutura +
visualização de debug. A integração (passes mirarem espaço livre, atacantes
se afastarem da marcação, defesas se aproximarem dela) é o próximo passo.
=============================================================================
*/
const SpatialGrid = {
    cellSize: 2,
    cols: 0, rows: 0,
    minX: 0, minZ: 0,
    cells: null,

    debug: false,
    _mesh: null, _canvas: null, _ctx: null, _tex: null,

    init: function () {
        this.minX = -CAMPO_LARG / 2;
        this.minZ = -CAMPO_COMP / 2;
        this.cols = Math.ceil(CAMPO_LARG / this.cellSize);
        this.rows = Math.ceil(CAMPO_COMP / this.cellSize);
        this.cells = new Array(this.cols * this.rows);
        for (let i = 0; i < this.cells.length; i++) this.cells[i] = { TeamA: [], TeamB: [] };
    },

    idx: function (ix, iz) { return iz * this.cols + ix; },

    cellIndexAt: function (x, z) {
        let ix = Math.floor((x - this.minX) / this.cellSize);
        let iz = Math.floor((z - this.minZ) / this.cellSize);
        ix = Math.max(0, Math.min(this.cols - 1, ix));
        iz = Math.max(0, Math.min(this.rows - 1, iz));
        return { ix: ix, iz: iz };
    },

    // Chamado uma vez por frame a partir de Match.update().
    update: function () {
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
        if (this.debug) this.updateDebugVisual();
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
    Amostra o centro de cada célula candidata dentro do raio e pontua por
    -ocupação (janela de 1 célula ao redor de cada candidato) menos uma
    pequena penalização por distância a (x,z), pra preferir espaço perto.
    Devolve {x,z} ou null se não achar candidato dentro dos limites do campo.
    */
    findFreeSpace: function (x, z, raioMetros, equipaAEvitar) {
        if (!this.cells) this.init();
        const raioCelulas = Math.max(1, Math.round(raioMetros / this.cellSize));
        const c = this.cellIndexAt(x, z);
        let melhor = null, melhorNota = -Infinity;

        for (let dz = -raioCelulas; dz <= raioCelulas; dz++) {
            for (let dx = -raioCelulas; dx <= raioCelulas; dx++) {
                const cx = c.ix + dx, cz = c.iz + dz;
                if (cx < 0 || cx >= this.cols || cz < 0 || cz >= this.rows) continue;
                const distCelulas = Math.hypot(dx, dz);
                if (distCelulas > raioCelulas) continue;

                const px = this.minX + (cx + 0.5) * this.cellSize;
                const pz = this.minZ + (cz + 0.5) * this.cellSize;
                const ocupacao = this.occupancy(px, pz, 1, equipaAEvitar);
                const nota = -ocupacao * 10 - distCelulas * 0.5;

                if (nota > melhorNota) { melhorNota = nota; melhor = { x: px, z: pz }; }
            }
        }
        return melhor;
    },

    /* --- Visualização de debug ------------------------------------------- */

    buildDebugVisual: function () {
        const canvas = document.createElement('canvas');
        canvas.width = this.cols; canvas.height = this.rows;
        const ctx = canvas.getContext('2d');
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
        const geo = new THREE.PlaneGeometry(CAMPO_LARG, CAMPO_COMP);
        const mesh = new THREE.Mesh(geo, mat);
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

        const img = this._ctx.createImageData(this.cols, this.rows);
        for (let iz = 0; iz < this.rows; iz++) {
            for (let ix = 0; ix < this.cols; ix++) {
                const cell = this.cells[this.idx(ix, iz)];
                const a = cell.TeamA.length, b = cell.TeamB.length;
                // Linha 0 do canvas = topo da textura = -Z no mundo (plano
                // roda -90° em X) — inverte a linha pra bater com o campo.
                const linha = this.rows - 1 - iz;
                const p = (linha * this.cols + ix) * 4;
                if (a === 0 && b === 0) {
                    img.data[p] = 60; img.data[p + 1] = 200; img.data[p + 2] = 100; img.data[p + 3] = 55;
                } else {
                    const tot = a + b;
                    img.data[p] = Math.min(255, 40 + (b / tot) * 200);
                    img.data[p + 1] = 30;
                    img.data[p + 2] = Math.min(255, 40 + (a / tot) * 200);
                    img.data[p + 3] = 150;
                }
            }
        }
        this._ctx.putImageData(img, 0, 0);
        this._tex.needsUpdate = true;
    },

    setDebug: function (on) {
        this.debug = on;
        if (!this._mesh) this.buildDebugVisual();
        this._mesh.visible = on;
    }
};
