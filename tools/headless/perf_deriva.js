/*
DERIVA DE PERFORMANCE — o que cresce ao longo de um jogo.

Relato: "quando chega a 40 minutos de jogo aproximadamente, cai de 60 para
40 FPS".

Uma queda que aparece com o TEMPO e não com o que está no ecrã é acumulação:
alguma coisa que se junta frame a frame e nunca se limpa — objectos na cena,
entradas num array, ouvintes de eventos, geometrias criadas e não libertadas.

Isto corre o jogo sem ecrã e, a cada meio minuto de jogo, mede:

  - o TEMPO DE CPU por frame, em janelas (o headless não tem GPU, portanto o
    que aqui se vê é só o custo de lógica — se a queda for de desenho, este
    número fica plano e a culpa está na cena);
  - o número de objectos da CENA (e quantos são novos desde o arranque);
  - o tamanho de todo o array, Map e Set que o `Match`, o `MatchStats` e o
    `Officials` tenham lá dentro, e as que mais cresceram;
  - as geometrias e materiais que o `three` tem vivos.

Uso: node tools/headless/perf_deriva.js [minutos] [semente]
*/
const minutos = Number(process.argv[2] || 25);
const semente = Number(process.argv[3] || 0);

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(1000 + semente * 977);

require('./harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

/*
Conta os objectos da cena por tipo. `traverse` percorre a árvore toda, que é
onde as coisas se escondem: um objecto acrescentado a um jogador não aparece
em `scene.children`.
*/
function contarCena() {
    let n = 0;
    const porTipo = {};
    scene.traverse((o) => {
        n++;
        porTipo[o.type] = (porTipo[o.type] || 0) + 1;
    });
    return { n: n, porTipo: porTipo };
}

/*
Tamanhos de todas as colecções alcançáveis a partir das raízes, até dois
níveis. Dois níveis chegam: o que cresce sem limite está sempre num campo de
um objecto global (Match.eventos, MatchStats.TeamA.remates.lista), e descer
mais do que isso passa a apanhar a cena inteira.
*/
function tamanhos() {
    const out = {};
    const raizes = { Match: (typeof Match !== 'undefined') ? Match : null,
        MatchStats: (typeof MatchStats !== 'undefined') ? MatchStats : null,
        Officials: (typeof Officials !== 'undefined') ? Officials : null,
        EventBus: (typeof EventBus !== 'undefined') ? EventBus : null };

    const medir = (nome, v, nivel) => {
        if (!v || typeof v !== 'object') return;
        if (Array.isArray(v)) { out[nome] = v.length; return; }
        if (v instanceof Map || v instanceof Set) { out[nome] = v.size; return; }
        if (v.isObject3D || v.isVector3 || v.isQuaternion) return;
        if (nivel <= 0) return;
        for (const k of Object.keys(v)) {
            try { medir(nome + '.' + k, v[k], nivel - 1); } catch (e) { /* getters */ }
        }
    };
    for (const nome in raizes) medir(nome, raizes[nome], 3);
    return out;
}

const cenaInicial = contarCena().n;
const tamInicial = tamanhos();
const amostras = [];

const passosPorAmostra = Math.round(30 / dt);   // meio minuto de relógio real
const passos = Math.round(minutos * 60 / dt);

let t0 = process.hrtime.bigint();
for (let f = 1; f <= passos; f++) {
    Match.update(dt);

    if (f % passosPorAmostra) continue;

    const t1 = process.hrtime.bigint();
    const msPorFrame = Number(t1 - t0) / 1e6 / passosPorAmostra;
    t0 = t1;

    const cena = contarCena();
    amostras.push({
        minJogo: Match.tempoDeJogo / 60,
        minReal: f * dt / 60,
        ms: msPorFrame,
        fps: 1000 / msPorFrame,
        cena: cena.n,
        tam: tamanhos(),
        geo: (THREE.Cache && THREE.Cache.files) ? Object.keys(THREE.Cache.files).length : 0
    });
}

const p = (v, n) => String(v.toFixed(n)).padStart(7);
console.log(`\n${minutos} min de relógio (${(Match.tempoDeJogo / 60).toFixed(0)} min de jogo), semente ${semente}`);
console.log('min jogo | min real |   ms/frame |  fps CPU | objectos na cena');
for (const a of amostras) {
    console.log(`${p(a.minJogo, 1)}  | ${p(a.minReal, 1)}  | ${p(a.ms, 3)}    | ${p(a.fps, 0)}  | ${a.cena}`);
}

const prim = amostras[0], ult = amostras[amostras.length - 1];
console.log(`\nms/frame: ${prim.ms.toFixed(3)} -> ${ult.ms.toFixed(3)} (${((ult.ms / prim.ms - 1) * 100).toFixed(0)}%)`);
console.log(`objectos na cena: ${cenaInicial} -> ${ult.cena} (${ult.cena - cenaInicial})`);

// O que cresceu, do maior crescimento para o menor.
const cresceu = [];
for (const chave in ult.tam) {
    const antes = (tamInicial[chave] !== undefined) ? tamInicial[chave] : 0;
    const delta = ult.tam[chave] - antes;
    if (delta > 0) cresceu.push({ chave, antes, agora: ult.tam[chave], delta });
}
cresceu.sort((a, b) => b.delta - a.delta);
console.log('\ncolecções que cresceram:');
if (!cresceu.length) console.log('  nenhuma');
for (const c of cresceu.slice(0, 15)) {
    console.log(`  ${c.chave}: ${c.antes} -> ${c.agora} (+${c.delta})`);
}
