/*
O DESMARQUE DE AFASTAMENTO (pullAway): sair de cima do marcador para ser opcao.

`destinoDeDesmarque` (utils.js) escolhe, em volta de quem se desmarca, o ponto
para onde ele se afasta do marcador. E polar: um cone de `anguloMax` graus de
cada lado da direccao "para longe do marcador" (0 = directamente para longe),
e distancias entre `distMin` e `distMax`. Com portador, prefere pontos a uma
distancia de passe dele (`distPortadorIdeal`).

Pura: sem Match, sem THREE. O modelo (`PullAwayModel`, config/passing.js) so e
lido aqui para a configuracao existir.

Corre com: node tests/desmarque_afastar_do_marcador.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));
const srcUtils = ler('js/utils.js');
const srcPassing = ler('js/config/passing.js');

function extrairObjecto(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    if (i < 0) throw new Error(`${nome} não encontrado`);
    const f = src.indexOf(LF + '};', i);
    return new Function(`${src.slice(i, f + 3)}; return ${nome};`)();
}
function corpoDaFuncao(src, nome) {
    const i = src.indexOf(`function ${nome}(`);
    if (i < 0) throw new Error(`${nome} não encontrada`);
    return src.slice(i, src.indexOf(LF + '}', i) + 2);
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

let M;
try { M = extrairObjecto(srcPassing, 'PullAwayModel'); } catch (e) { erro(e.message); }
let destino;
try {
    destino = new Function('CAMPO_LARG', 'CAMPO_COMP',
        corpoDaFuncao(srcUtils, 'destinoDeDesmarque') + LF + 'return destinoDeDesmarque;')(68, 105);
} catch (e) { erro(e.message); }
if (!M || !destino) { console.error(falhas + ' falha(s)'); process.exit(1); }

// --- o modelo ---------------------------------------------------------------
for (const k of ['activo', 'raioMarcador', 'distMin', 'distMax', 'anguloMax', 'duracao', 'arrefecimento', 'chance', 'posicoes']) {
    if (M[k] === undefined) erro('PullAwayModel.' + k + ' em falta');
}
if (!falhas) ok('PullAwayModel tem os campos todos');

const grauDe = (o, r) => {
    // Angulo entre "para longe do marcador" e o deslocamento, em graus.
    const ax = o.px - o.marcador.x, az = o.pz - o.marcador.z;
    const dx = r.x - o.px, dz = r.z - o.pz;
    const c = (ax * dx + az * dz) / (Math.hypot(ax, az) * Math.hypot(dx, dz));
    return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
};
const base = extra => Object.assign({
    px: 0, pz: 0, dirZ: 1,
    marcador: { x: 0, z: 2 },           // colado a frente dele
    portador: { x: 0, z: -15 },         // a bola esta atras
    adversarios: [{ x: 0, z: 2 }],
    offsideLimitDir: null
}, extra);

// --- a geometria ------------------------------------------------------------
{
    const o = base({});
    const r = destino(o, M);
    if (!r) erro('devia haver destino');
    else {
        const antes = Math.hypot(o.px - o.marcador.x, o.pz - o.marcador.z);
        const depois = Math.hypot(r.x - o.marcador.x, r.z - o.marcador.z);
        if (depois <= antes) erro('o destino devia afastar do marcador: ' + antes.toFixed(1) + ' -> ' + depois.toFixed(1));
        else ok('afasta do marcador: ' + antes.toFixed(1) + ' m -> ' + depois.toFixed(1) + ' m');
        const g = grauDe(o, r), d = Math.hypot(r.x - o.px, r.z - o.pz);
        if (g > M.anguloMax + 1e-6) erro('fora do cone: ' + g.toFixed(1) + ' graus');
        else ok('dentro do cone: ' + g.toFixed(1) + ' graus');
        if (d < M.distMin - 1e-6 || d > M.distMax + 1e-6) erro('distancia fora de [distMin, distMax]: ' + d.toFixed(1));
        else ok('distancia ' + d.toFixed(1) + ' m');
    }
}

// --- sem portador nao ha excepcao -------------------------------------------
{
    const r = destino(base({ portador: null }), M);
    if (!r) erro('sem portador devia haver destino'); else ok('sem portador funciona');
}

// --- cone fechado: sai quase directo para longe -----------------------------
{
    const o = base({});
    const r = destino(o, Object.assign({}, M, { anguloMax: 10 }));
    if (!r) erro('cone de 10 graus devia ter destino');
    else if (grauDe(o, r) > 10 + 1e-6) erro('cone de 10 graus: ' + grauDe(o, r).toFixed(1));
    else ok('cone de 10 graus respeitado');
}

// --- fora-de-jogo: nunca para alem da linha ---------------------------------
{
    // Marcador atras dele: "para longe" e para a frente, mas a linha esta a 1 m.
    const o = base({ marcador: { x: 0, z: -2 }, adversarios: [{ x: 0, z: -2 }], offsideLimitDir: 1.0, portador: null });
    const r = destino(o, Object.assign({}, M, { recuoMax: 8 }));
    if (r && r.z * o.dirZ > 1.0 + 1e-6) erro('passou a linha de fora-de-jogo: z=' + r.z.toFixed(1));
    else ok('respeita a linha de fora-de-jogo');
}

// --- campo: nunca fora das linhas -------------------------------------------
{
    const o = base({ px: 31, pz: 0, marcador: { x: 29, z: 0 }, adversarios: [{ x: 29, z: 0 }], portador: null });
    const r = destino(o, M);
    if (r && Math.abs(r.x) > 34 - 2 + 1e-6) erro('fora do campo: x=' + r.x.toFixed(1));
    else ok('fica dentro do campo');
}

// --- sem sitio: null ---------------------------------------------------------
{
    const adv = [{ x: 0, z: 2 }];
    for (let x = -30; x <= 30; x += 2) for (let z = -30; z <= 30; z += 2) adv.push({ x, z });
    const r = destino(base({ adversarios: adv }), M);
    if (r) erro('campo cheio de adversarios devia dar null');
    else ok('sem folga nenhuma: null');
}

// --- dirZ negativo: espelha -------------------------------------------------
{
    const a = destino(base({}), M);
    const b = destino(base({ dirZ: -1, marcador: { x: 0, z: -2 }, adversarios: [{ x: 0, z: -2 }], portador: { x: 0, z: 15 } }), M);
    if (!a || !b) erro('espelho: devia haver destino nos dois');
    else if (Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.z + b.z) > 1e-6) erro('espelho falhou: ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
    else ok('dirZ -1 e o espelho de dirZ 1');
}

if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK');
