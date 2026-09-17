/*
Funcionários do estádio (js/staff.js): o anel de colete laranja à volta do
recinto e os grupos atrás das placas de publicidade.

Corre o `Staff` a sério com o `three` de node, com as medidas que o
`createField` lhe passa, e mede o que o pedido diz:

  - o anel fica a 1 m da primeira fila da bancada (`recuoDaBancada`);
  - os vizinhos no anel estão a ~5 m um do outro (`espacamento`), nas rectas e
    nas curvas — é a razão de o perímetro ser andado por comprimento de arco;
  - ninguém cai dentro do campo de jogo;
  - há gente atrás das placas, e nenhum deles à frente delas;
  - os pés assentam no relvado (a pose do público está medida para um degrau);
  - a construção é determinística.
*/
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

// Só o bloco do config interessa: o physics.js inteiro arrasta meio jogo.
const cfg = ler('js/config/physics.js')
    .match(/const FuncionariosEstadio = \{[\s\S]*?\n\};/)[0];

const amb = { THREE, console };
const mod = new Function(...Object.keys(amb),
    `${ler('js/utils.js').match(/function mergeNonIndexedGeometries[\s\S]*?\n}\n/)[0]}
     ${ler('js/crowd.js')}
     ${cfg}
     ${ler('js/staff.js')}
     return { Staff, FuncionariosEstadio, Crowd, CrowdModel };`)(...Object.values(amb));
const { Staff, FuncionariosEstadio } = mod;

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

// As medidas do createField: campo 68x106, bancada a 12 m das linhas, raio da
// primeira fila 6.5, placas a 5 m das linhas.
const CAMPO_LARG = 68, CAMPO_COMP = 106;
const GEO = {
    bancadaX: CAMPO_LARG / 2 + 12,
    bancadaZ: CAMPO_COMP / 2 + 12,
    cantoX: CAMPO_LARG / 2 + 12 - 6.5,
    cantoZ: CAMPO_COMP / 2 + 12 - 6.5,
    raioPrimeiraFila: 6.5,
    placaX: CAMPO_LARG / 2 + 5,
    placaZ: CAMPO_COMP / 2 + 5
};

function construir() {
    const grupo = new THREE.Group();
    const n = Staff.build(grupo, GEO);
    return { grupo, n };
}

/* --- 1. O anel: espaçamento e distância à bancada --------------------- */
{
    const F = FuncionariosEstadio;
    const anel = Staff._pontosDoAnel(
        GEO.bancadaX - F.recuoDaBancada,
        GEO.bancadaZ - F.recuoDaBancada,
        GEO.raioPrimeiraFila - F.recuoDaBancada,
        GEO.cantoX, GEO.cantoZ, F.espacamento);

    // ~425 m de perímetro a dividir pelo espaçamento pedido.
    const esperados = Math.round(425 / F.espacamento);
    if (Math.abs(anel.length - esperados) > 3) {
        erro(`anel com ${anel.length} funcionários — esperados ~${esperados} a ${F.espacamento} m`);
    }

    // Passo entre vizinhos, incluindo o que fecha a volta.
    let minP = Infinity, maxP = -Infinity;
    for (let i = 0; i < anel.length; i++) {
        const a = anel[i], b = anel[(i + 1) % anel.length];
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        minP = Math.min(minP, d); maxP = Math.max(maxP, d);
    }
    /*
    A corda de uma curva é mais curta que o arco (o passo é andado em arco, que
    é o que o faz ser o mesmo nas rectas e nas curvas), e o passo real ajusta-se
    para o anel fechar. É essa a folga tolerada, para baixo e para cima.
    */
    if (minP < F.espacamento * 0.85 || maxP > F.espacamento * 1.05) {
        erro(`passo do anel entre ${minP.toFixed(2)} e ${maxP.toFixed(2)} m — pedidos ${F.espacamento}`);
    }

    /*
    DISTÂNCIA À BANCADA. Nas rectas é o recuo exacto; nas curvas mede-se ao
    arco da primeira fila, que tem o mesmo centro.
    */
    for (const p of anel) {
        const dx = Math.max(0, Math.abs(p.x) - GEO.cantoX);
        const dz = Math.max(0, Math.abs(p.z) - GEO.cantoZ);
        let folga;
        if (dx > 1e-6 && dz > 1e-6) folga = GEO.raioPrimeiraFila - Math.hypot(dx, dz);
        else folga = Math.min(GEO.bancadaX - Math.abs(p.x), GEO.bancadaZ - Math.abs(p.z));
        if (Math.abs(folga - F.recuoDaBancada) > 0.05) {
            erro(`funcionário do anel a ${folga.toFixed(2)} m da bancada em ` +
                `(${p.x.toFixed(1)}, ${p.z.toFixed(1)}) — pedido ${F.recuoDaBancada}`);
            break;
        }
    }
}

/* --- 2. Ninguém dentro do campo, e alguém atrás das placas ------------ */
{
    const { grupo, n } = construir();
    if (n < 40) erro(`${n} funcionários no estádio — esperados mais de 40`);

    const dummy = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    let atrasDasPlacas = 0;
    let dentroDoCampo = 0;
    let aFrenteDasPlacas = 0;
    let malhas = 0;

    grupo.children.forEach(m => {
        if (!m.isInstancedMesh) return;
        malhas++;
        for (let i = 0; i < m.count; i++) {
            m.getMatrixAt(i, dummy);
            pos.setFromMatrixPosition(dummy);
            const foraX = Math.abs(pos.x) > CAMPO_LARG / 2;
            const foraZ = Math.abs(pos.z) > CAMPO_COMP / 2;
            if (!foraX && !foraZ) dentroDoCampo++;
            const foraDaPlaca = Math.abs(pos.x) > GEO.placaX || Math.abs(pos.z) > GEO.placaZ;
            if (!foraDaPlaca) aFrenteDasPlacas++;
            // Entre as placas e o anel da bancada: é aí que estão os grupos.
            if (foraDaPlaca && Math.abs(pos.x) < GEO.bancadaX - 2 &&
                Math.abs(pos.z) < GEO.bancadaZ - 2) atrasDasPlacas++;
        }
    });

    if (!malhas) erro('nenhuma InstancedMesh construída');
    if (dentroDoCampo) erro(`${dentroDoCampo} funcionários dentro das linhas do campo`);
    if (aFrenteDasPlacas) erro(`${aFrenteDasPlacas} funcionários à frente das placas`);
    if (atrasDasPlacas < 10) erro(`só ${atrasDasPlacas} funcionários atrás das placas`);
}

/* --- 3. Os pés no relvado --------------------------------------------- */
{
    for (const pose of ['dePe', 'sentado']) {
        const geos = Staff._geometrias(mod.CrowdModel.poses[pose]);
        let minY = Infinity, maxY = -Infinity;
        for (const canal in geos) {
            geos[canal].computeBoundingBox();
            minY = Math.min(minY, geos[canal].boundingBox.min.y);
            maxY = Math.max(maxY, geos[canal].boundingBox.max.y);
        }
        if (Math.abs(minY) > 1e-6) erro(`pose ${pose} com os pés em y=${minY.toFixed(3)}`);
        // Um adulto: entre 1.2 (sentado) e 2 m de altura.
        if (maxY < 1.1 || maxY > 2.1) erro(`pose ${pose} com ${maxY.toFixed(2)} m de altura`);
    }
}

/* --- 4. Determinismo -------------------------------------------------- */
{
    const ler1 = construir(), ler2 = construir();
    if (ler1.n !== ler2.n) erro('o número de funcionários mudou entre execuções');

    const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4();
    const a = ler1.grupo.children.filter(c => c.isInstancedMesh);
    const b = ler2.grupo.children.filter(c => c.isInstancedMesh);
    let diff = 0;
    for (let k = 0; k < Math.min(a.length, b.length); k++) {
        for (let i = 0; i < a[k].count; i++) {
            a[k].getMatrixAt(i, m1); b[k].getMatrixAt(i, m2);
            for (let e = 0; e < 16; e++) {
                if (Math.abs(m1.elements[e] - m2.elements[e]) > 1e-9) { diff++; break; }
            }
        }
    }
    if (diff) erro(`${diff} instâncias em posições diferentes entre duas construções`);
}

/* --- 5. Bancos: um por pessoa sentada, e à altura da anca dela --------- */
{
    const { grupo } = construir();
    const bancos = grupo.children.filter(c => c.isInstancedMesh &&
        c.geometry.type === 'BoxGeometry');
    const gente = grupo.children.filter(c => c.isInstancedMesh &&
        c.geometry.type !== 'BoxGeometry');

    if (bancos.length !== 1) erro(`${bancos.length} InstancedMesh de bancos — esperada 1`);

    // Ninguém é levantado do relvado: os pés ficam no chão nas duas poses.
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    let noAr = 0;
    gente.forEach(im => {
        for (let i = 0; i < im.count; i++) {
            im.getMatrixAt(i, m); v.setFromMatrixPosition(m);
            if (Math.abs(v.y) > 1e-6) noAr++;
        }
    });
    if (noAr) erro(`${noAr} funcionários com os pés fora do relvado`);

    // O banco acaba à altura da anca de quem está sentado (o calção da pose).
    const geos = Staff._geometrias(mod.CrowdModel.poses.sentado);
    geos.calcao.computeBoundingBox();
    const anca = geos.calcao.boundingBox.max.y;
    if (bancos.length) {
        const im = bancos[0];
        const esc = new THREE.Vector3();
        for (let i = 0; i < im.count; i++) {
            im.getMatrixAt(i, m);
            m.decompose(v, new THREE.Quaternion(), esc);
            const topo = v.y + esc.y / 2;
            // A escala do corpo varia entre escalaMin e escalaMax, e o banco
            // acompanha-a: a folga é essa.
            if (topo < anca * FuncionariosEstadio.escalaMin - 0.01 ||
                topo > anca * FuncionariosEstadio.escalaMax + 0.01) {
                erro(`banco com o topo a ${topo.toFixed(3)} m e a anca a ${anca.toFixed(3)}`);
                break;
            }
        }
    }
}

/* --- 6. Coletes: laranja no anel, amarelo na imprensa ----------------- */
{
    const { grupo } = construir();
    const F = FuncionariosEstadio;
    const laranja = new THREE.Color(F.cores.colete);
    const amarelo = new THREE.Color(F.cores.coleteImprensa);

    const m = new THREE.Matrix4(), v = new THREE.Vector3(), c = new THREE.Color();
    const perto = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 1e-3;

    let nLaranja = 0, nAmarelo = 0, foraDeSitio = 0;
    let roupasImprensa = new Set();

    grupo.children.forEach(im => {
        if (!im.isInstancedMesh || !im.instanceColor) return;
        for (let i = 0; i < im.count; i++) {
            im.getMatrixAt(i, m); v.setFromMatrixPosition(m);
            c.fromBufferAttribute(im.instanceColor, i);
            // Quem está entre as placas e o anel é imprensa; o anel está a 1 m
            // da bancada.
            const noAnel = Math.abs(v.x) > GEO.bancadaX - 2 || Math.abs(v.z) > GEO.bancadaZ - 2;

            if (perto(c, laranja)) { nLaranja++; if (!noAnel) foraDeSitio++; }
            else if (perto(c, amarelo)) { nAmarelo++; if (noAnel) foraDeSitio++; }
            else if (!noAnel) roupasImprensa.add(c.getHexString());
        }
    });

    if (!nLaranja) erro('nenhum colete laranja no anel da bancada');
    if (!nAmarelo) erro('nenhum colete amarelo atrás das placas');
    if (foraDeSitio) erro(`${foraDeSitio} coletes na zona errada do estádio`);
    // Roupa à civil: vários tons, e não um fardamento.
    if (roupasImprensa.size < 4) {
        erro(`a imprensa só tem ${roupasImprensa.size} cores de roupa — deviam ser variadas`);
    }
}

if (falhas) {
    console.error(`FALHOU: ${falhas} problema(s)`);
    process.exit(1);
}
console.log('OK funcionarios_estadio');
