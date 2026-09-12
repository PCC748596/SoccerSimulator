/*
A CONVERSÃO DOS REMATES — de onde se remata, e quantos entram.

O lote de 50 jogos do browser fechou o diagnóstico a meio:

    finalizações   24.37   alvo 26.11    93%   <- o volume está certo
    golos           3.75   alvo  2.52   149%
    xG total        1.25   alvo  2.84    44%
    xG por remate  0.051   alvo 0.109    47%

Ou seja: o jogo cria a quantidade certa de remates, o modelo de xG diz que
valem metade do que valem os remates de um jogo a sério, e entram uma vez e
meia mais. Só pode ser uma de duas coisas — e são medíveis:

  1. REMATA-SE DE LONGE. Um xG médio de 0.051 é a assinatura de um remate de
     22-25 m; 0.109 é a de um remate de 13-16 m. Se a distribuição de
     distâncias estiver deslocada para trás, o defeito é da DECISÃO de rematar
     e não da conversão.
  2. OS REMATES MAUS ENTRAM DEMASIADO. Se a conversão por faixa de distância
     estiver acima do xG dessa faixa, o defeito é da execução — o remate é
     preciso demais, ou o guarda-redes defende pouco.

Isto mede as duas ao mesmo tempo: por faixa de distância, quantos remates,
quanto valiam (xG do próprio modelo do jogo) e quantos entraram mesmo. Onde a
coluna "entrou" se afastar da coluna "xG" está o problema.

Referências reais por faixa (fonte: distribuição típica de ligas europeias,
que é a mesma de onde saem os alvos do painel):

    dentro da pequena área      ~35-40% entram
    6-11 m (marca de penálti)   ~20%
    11-16 m                      ~10%
    16-22 m                       ~5%
    22 m+                         ~2-3%

Uso: node tools/headless/remates_conversao.js [minutos] [semente]
*/
const minutos = Number(process.argv[2] || 30);
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
Cada remate fica em aberto até se saber o que lhe aconteceu. O desfecho não é
conhecido no instante do contacto — a bola cruza a linha frames depois —, por
isso guarda-se o remate e fecha-se com o primeiro destes: golo da equipa que
remata, defesa do guarda-redes, bola fora, ou o prazo a esgotar.
*/
const remates = [];
let aberto = null;

function fecharAberto(desfecho) {
    if (!aberto) return;
    aberto.desfecho = desfecho;
    remates.push(aberto);
    aberto = null;
}

/*
O GOLO conta-se no TOTAL das duas equipas e não na equipa que remata: só há um
remate em aberto de cada vez, portanto o golo que aparecer na janela dele é
dele. Atribuir a equipa a partir da baliza dava-me a conta errada nos jogos em
que os lados trocam ao intervalo.
*/
let golosAntes = 0;

/*
O REMATE apanha-se no `xgDoRemate` — chamado uma vez por remate no
`executeShotGameplay`, com a posição de onde se rematou, e é de lá que sai o xG
que a ficha do painel soma. O mesmo gancho garante o MESMO universo de remates
que o painel conta.

Sem um evento por remate no instante do contacto, o gancho é o próprio
`xgDoRemate`: é chamado uma vez por remate, com a posição do remate, e é de lá
que sai o xG que a ficha soma.
*/
const origXg = global.xgDoRemate;
global.xgDoRemate = function (x, z, golZ, larguraBaliza, M) {
    const xg = origXg(x, z, golZ, larguraBaliza, M);
    fecharAberto('sem desfecho');
    aberto = {
        frame: frameActual,
        dist: Math.hypot(x, golZ - z),
        ang: anguloDaBaliza(x, z, golZ, larguraBaliza),
        xg: xg,
        t: Match.tempoDeJogo,
        desfecho: null
    };
    return xg;
};

const FAIXAS = [
    { rot: 'até 6 m (pequena área)', max: 6, real: '35-40%' },
    { rot: '6 a 11 m', max: 11, real: '~20%' },
    { rot: '11 a 16 m', max: 16, real: '~10%' },
    { rot: '16 a 22 m', max: 22, real: '~5%' },
    { rot: '22 m e mais', max: Infinity, real: '2-3%' }
];

/*
À BALIZA OU NÃO, e se o guarda-redes a defendeu.

A mira sai do `alvo.naBaliza` (fsm.js) e não passa por nenhuma função que se
possa envolver, mas os CONTADORES bumpam todos no mesmo frame do remate: se o
`remates.tentados` subiu e o `remates.noAlvo` subiu com ele, aquele remate ia à
baliza. A defesa vem do `defesas` do outro lado, dentro da janela do remate.

É a decomposição que falta: de cada dez remates à baliza, quantos são golo e
quantos o guarda-redes tira. Num jogo a sério são ~3 golos em 10 à baliza.
*/
const contA = () => ({
    alvo: MatchStats.TeamA.remates.noAlvo + MatchStats.TeamB.remates.noAlvo,
    def: MatchStats.TeamA.defesas + MatchStats.TeamB.defesas
});
let antes = contA();

let frameActual = 0;
const passos = Math.round(minutos * 60 / dt);
for (let f = 0; f < passos; f++) {
    frameActual = f;
    Match.update(dt);

    /*
    O `noAlvo` é contado no MESMO `Match.update` do remate, mas DEPOIS do xG
    (fsm.js: o xG no topo do executeShotGameplay, a mira umas linhas abaixo).
    Por isso a comparação é com o valor de antes desta chamada e não com o do
    frame anterior — foi o que me deu zero remates à baliza na primeira
    tentativa.
    */
    const agora = contA();
    if (aberto && aberto.naBaliza === undefined) {
        if (agora.alvo > antes.alvo) aberto.naBaliza = true;
        // Cinco frames de folga: a mira é escrita no mesmo gesto, mas não
        // garantidamente na mesma chamada de `Match.update` que o xG.
        else if (f - aberto.frame >= 5) aberto.naBaliza = false;
    }
    if (aberto && agora.def > antes.def) aberto.defendido = true;
    antes = agora;

    const golosAgora = MatchStats.TeamA.remates.golos + MatchStats.TeamB.remates.golos;
    if (aberto) {
        if (golosAgora > golosAntes) fecharAberto('golo');
        // Doze segundos de jogo (menos de três de relógio) chegam: ou entrou,
        // ou já não é este remate que decide nada.
        else if (Match.tempoDeJogo - aberto.t > 12) fecharAberto('não entrou');
    }
    golosAntes = golosAgora;
}
fecharAberto('sem desfecho');

/*
`LOTE_JSON=1` escreve uma linha JSON por remate em vez do relatório, para se
poder juntar várias sementes — um jogo dá 12 a 25 remates e nenhuma faixa tem
amostra suficiente sozinha.
*/
if (process.env.LOTE_JSON === '1') {
    for (const r of remates) {
        console.log(JSON.stringify({
            d: +r.dist.toFixed(2), a: +r.ang.toFixed(4), x: +r.xg.toFixed(4),
            g: r.desfecho === 'golo' ? 1 : 0,
            b: r.naBaliza ? 1 : 0, s: r.defendido ? 1 : 0
        }));
    }
    process.exit(0);
}

const n = remates.length;
const golos = remates.filter(r => r.desfecho === 'golo').length;
const xgTotal = remates.reduce((a, r) => a + r.xg, 0);

console.log(`\n${(Match.tempoDeJogo / 60).toFixed(0)} min de jogo, semente ${semente}`);
console.log(`${n} remates | ${golos} golos | conversão ${(100 * golos / Math.max(1, n)).toFixed(1)}% | ` +
    `xG médio ${(xgTotal / Math.max(1, n)).toFixed(3)}`);
console.log('');
console.log('faixa                     remates   % dos remates    xG médio   entraram    real');
let min = 0;
for (const fa of FAIXAS) {
    const lista = remates.filter(r => r.dist >= min && r.dist < fa.max);
    min = fa.max;
    if (!lista.length) {
        console.log(`  ${fa.rot.padEnd(22)} ${'0'.padStart(8)}`);
        continue;
    }
    const xg = lista.reduce((a, r) => a + r.xg, 0) / lista.length;
    const g = lista.filter(r => r.desfecho === 'golo').length;
    console.log(`  ${fa.rot.padEnd(22)} ${String(lista.length).padStart(8)} ` +
        `${((100 * lista.length / n).toFixed(0) + '%').padStart(14)} ` +
        `${xg.toFixed(3).padStart(11)} ` +
        `${((100 * g / lista.length).toFixed(0) + '%').padStart(10)} ` +
        `${fa.real.padStart(8)}`);
}

/*
E a mesma conta por ÂNGULO, porque a distância sozinha engana: 12 m junto à
linha de fundo é uma fresta e 12 m de frente é meia baliza.
*/
console.log('');
console.log('ângulo da baliza          remates       xG médio   entraram');
const ANG = [
    { rot: 'fresta (< 15 graus)', max: 15 * Math.PI / 180 },
    { rot: '15 a 30 graus', max: 30 * Math.PI / 180 },
    { rot: '30 a 50 graus', max: 50 * Math.PI / 180 },
    { rot: 'aberto (50 graus +)', max: Infinity }
];
let aMin = 0;
for (const a of ANG) {
    const lista = remates.filter(r => r.ang >= aMin && r.ang < a.max);
    aMin = a.max;
    if (!lista.length) { console.log(`  ${a.rot.padEnd(22)} ${'0'.padStart(8)}`); continue; }
    const xg = lista.reduce((s, r) => s + r.xg, 0) / lista.length;
    const g = lista.filter(r => r.desfecho === 'golo').length;
    console.log(`  ${a.rot.padEnd(22)} ${String(lista.length).padStart(8)} ` +
        `${xg.toFixed(3).padStart(14)} ${((100 * g / lista.length).toFixed(0) + '%').padStart(10)}`);
}
