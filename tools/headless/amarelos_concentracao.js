/*
A CONCENTRAÇÃO DOS AMARELOS POR JOGADOR.

Os vermelhos estão a 265% do alvo (0.21 por jogo contra 0.08) e **todos** são
segundo amarelo — o vermelho directo não acontece (gravidade máxima medida
0.74, limiar 0.95). O `cartoes_origem.js` mostrou de onde vêm; o que nunca foi
medido, e é a alavanca que os docs apontam, é **em quantas cabeças diferentes
caem os amarelos**.

A conta que motiva isto: com 3.68 amarelos repartidos ao acaso por 22
jogadores, a probabilidade de ALGUM apanhar dois é ~26% por jogo (problema do
aniversário). O real é 8%. Se a simulação estiver acima disso, ou os amarelos
caem sempre nos mesmos, ou o `podeFazerCarrinho` não morde onde devia.

Mede, por jogo:
  - quantos jogadores DISTINTOS levaram amarelo, e o máximo por jogador;
  - a repartição das faltas e dos amarelos por POSTO — a suspeita vem dos
    lotes, em que o expulso é quase sempre um CM;
  - o que o acaso puro previa, com o mesmo número de amarelos e 11 por equipa,
    para se ver se a concentração é real ou é o aniversário.

Uso: node tools/headless/amarelos_concentracao.js [jogos] [dur] [semente]
*/
const jogos = Number(process.argv[2] || 8);
const dur = Number(process.argv[3] || 1080);
const semente = Number(process.argv[4] || 1);

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
Embrulha o `marcarFalta` em vez de tocar no código do jogo: dá a falta, o
infractor e o cartão que saiu, que é tudo o que aqui se quer.
*/
let jogo = null;
{
    const orig = Officials.marcarFalta.bind(Officials);
    const origDecidir = Officials.decidirCartao.bind(Officials);
    let ultimoCartao = null;
    Officials.decidirCartao = function (g, j, t) {
        ultimoCartao = origDecidir(g, j, t);
        return ultimoCartao;
    };
    Officials.marcarFalta = function (infractor, vitima, dados) {
        if (!infractor || !vitima || infractor.expulso) return orig(infractor, vitima, dados);
        if (typeof Match === 'undefined' || Match.state !== 'PLAY') return orig(infractor, vitima, dados);
        ultimoCartao = null;
        const r = orig(infractor, vitima, dados);
        if (!jogo) return r;
        const chave = infractor.team + '#' + infractor.id;
        const f = jogo.jogadores[chave] || (jogo.jogadores[chave] = { pos: infractor.pos, faltas: 0, amarelos: 0, vermelho: 0 });
        f.faltas++;
        jogo.faltas++;
        if (ultimoCartao === 'amarelo') { f.amarelos++; jogo.amarelos++; }
        else if (ultimoCartao === 'vermelho') { f.amarelos++; f.vermelho++; jogo.amarelos++; jogo.vermelhos++; }
        return r;
    };
}

/*
E QUEM É QUE SEQUER DISPUTA. Sem isto não se sabe se o CM faz mais faltas por
DISPUTAR mais ou por FALHAR mais o que disputa — que são dois defeitos
diferentes e com alavancas diferentes.
*/
const disputas = {};
{
    const contar = (p, gesto) => {
        if (!p || !p.pos) return;
        const e = disputas[p.pos] || (disputas[p.pos] = { desarme: 0, carrinho: 0 });
        e[gesto]++;
    };
    for (const nome of ['actTackle', 'actSlideTackle']) {
        const orig = global[nome];
        if (typeof orig !== 'function') continue;
        const gesto = (nome === 'actTackle') ? 'desarme' : 'carrinho';
        global[nome] = function (ctx) {
            if (ctx && ctx.p) contar(ctx.p, gesto);
            return orig(ctx);
        };
    }
}

const relatos = [];
for (let g = 0; g < jogos; g++) {
    MatchStats.reset();
    Match.placarA = 0; Match.placarB = 0;
    if (Match.resetPlay) Match.resetPlay();
    jogo = { jogadores: {}, faltas: 0, amarelos: 0, vermelhos: 0 };
    for (let i = 0; i < Math.round(dur / dt); i++) Match.update(dt);
    relatos.push(jogo);
}

/*
O ACASO PURO, para comparar: `a` amarelos atirados a 22 jogadores, qual a
probabilidade de algum apanhar dois. Fecha-se por Monte Carlo porque é mais
curto do que a fórmula e não engana ninguém.
*/
const acasoDoisNoMesmo = (a, n, tentativas) => {
    let sim = 0;
    for (let k = 0; k < tentativas; k++) {
        const c = new Array(n).fill(0);
        let houve = false;
        for (let i = 0; i < a; i++) { const j = (Math.random() * n) | 0; if (++c[j] >= 2) houve = true; }
        if (houve) sim++;
    }
    return sim / tentativas;
};

const soma = (f) => relatos.reduce((s, j) => s + f(j), 0);
const totalAmarelos = soma(j => j.amarelos);
const totalVermelhos = soma(j => j.vermelhos);
const totalFaltas = soma(j => j.faltas);
const minutosPorJogo = (dur * MatchDuration.timeScale) / 60;
const p90 = (n) => n * (90 / minutosPorJogo) / jogos;

console.log(`\n${jogos} jogos de ${minutosPorJogo.toFixed(0)} min (semente ${semente})`);
console.log(`faltas ${p90(totalFaltas).toFixed(1)} (alvo 27.6) | amarelos ${p90(totalAmarelos).toFixed(2)} (5.22) | vermelhos ${p90(totalVermelhos).toFixed(2)} (0.08)`);

// --- em quantas cabeças diferentes caem
const distintos = relatos.map(j => Object.values(j.jogadores).filter(p => p.amarelos > 0).length);
const maxPorJogador = relatos.map(j => Math.max(0, ...Object.values(j.jogadores).map(p => p.amarelos)));
const jogosComDois = maxPorJogador.filter(m => m >= 2).length;
const media = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
console.log(`\nAMARELOS, em quantas cabeças:`);
console.log(`  jogadores distintos advertidos por jogo: ${media(distintos).toFixed(2)}`);
console.log(`  máximo de amarelos num só jogador:       ${media(maxPorJogador).toFixed(2)} (pior ${Math.max(...maxPorJogador)})`);
console.log(`  jogos com alguém a chegar aos dois:      ${(100 * jogosComDois / jogos).toFixed(0)}% (real ~8%)`);
const previsto = acasoDoisNoMesmo(Math.round(totalAmarelos / jogos), 22, 20000);
console.log(`  o acaso puro previa:                     ${(100 * previsto).toFixed(0)}% com ${(totalAmarelos / jogos).toFixed(1)} amarelos por jogo`);

// --- por posto
const porPosto = {};
for (const j of relatos) {
    for (const p of Object.values(j.jogadores)) {
        const e = porPosto[p.pos] || (porPosto[p.pos] = { faltas: 0, amarelos: 0, vermelhos: 0 });
        e.faltas += p.faltas; e.amarelos += p.amarelos; e.vermelhos += p.vermelho;
    }
}
console.log(`\nPOR POSTO (total dos ${jogos} jogos):`);
console.log(`  posto   faltas   amarelos   vermelhos`);
for (const [pos, e] of Object.entries(porPosto).sort((a, b) => b[1].amarelos - a[1].amarelos)) {
    console.log(`  ${pos.padEnd(6)}  ${String(e.faltas).padStart(6)}   ${String(e.amarelos).padStart(8)}   ${String(e.vermelhos).padStart(9)}`);
}

// --- disputas: quem tenta, e quantas lhe saem falta
console.log(`
DISPUTAS TENTADAS (total dos ${jogos} jogos):`);
console.log(`  posto   desarmes   carrinhos   faltas   faltas por disputa`);
const postos = new Set([...Object.keys(disputas), ...Object.keys(porPosto)]);
for (const pos of [...postos].sort((a, b) => ((disputas[b] || {}).desarme || 0) + ((disputas[b] || {}).carrinho || 0) - ((disputas[a] || {}).desarme || 0) - ((disputas[a] || {}).carrinho || 0))) {
    const d = disputas[pos] || { desarme: 0, carrinho: 0 };
    const f = (porPosto[pos] || {}).faltas || 0;
    const tot = d.desarme + d.carrinho;
    console.log(`  ${pos.padEnd(6)}  ${String(d.desarme).padStart(8)}   ${String(d.carrinho).padStart(9)}   ${String(f).padStart(6)}   ${tot ? (f / tot).toFixed(3) : '-'}`);
}

// --- concentração das FALTAS: quanto leva o pior de cada jogo
const quotaDoPior = relatos.map(j => {
    const fs = Object.values(j.jogadores).map(p => p.faltas).sort((a, b) => b - a);
    return j.faltas ? fs[0] / j.faltas : 0;
});
const faltososPorJogo = relatos.map(j => Object.keys(j.jogadores).length);
console.log(`\nFALTAS, concentração:`);
console.log(`  jogadores diferentes a cometer faltas: ${media(faltososPorJogo).toFixed(1)} de 22`);
console.log(`  quota do pior infractor de cada jogo:  ${(100 * media(quotaDoPior)).toFixed(0)}% das faltas da partida`);
