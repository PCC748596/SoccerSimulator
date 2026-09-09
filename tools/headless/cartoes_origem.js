/*
DE ONDE VÊM OS VERMELHOS.

O lote de 100 jogos dá 0.21 vermelhos por jogo (265% do alvo, 0.08) com 3.68
amarelos (70% do alvo, 5.22). A razão é que denuncia: **5.7% dos amarelos
acabam em vermelho, contra os 1.5% reais.**

O `decidirCartao` tem duas portas para o vermelho e é preciso saber por qual
saem:

  - DIRECTO, `gravidade >= limiarVermelho` (0.95). O comentário do config diz
    que devia ser "quase inalcançável" — exige carrinho lançado, pelas costas,
    de um jogador forte (0.99). Se estiver a acontecer, o limiar desceu de mais
    quando o `travarAtaque` saiu da gravidade.
  - SEGUNDO AMARELO, que é como quase todos os vermelhos reais acontecem. O
    travão desse é o `podeFazerCarrinho` — quem já tem amarelo não faz
    carrinhos. Se for por aqui, ou há amarelos a mais por jogador, ou o medo do
    advertido não está a morder.

Mede os dois, mais a distribuição da gravidade, para se saber qual arrumar.

Uso: node tools/headless/cartoes_origem.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 900);
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

// VERMELHO=<valor> para varrer o limiar sem tocar no config de producao.
if (process.env.VERMELHO) RefereeModel.faltas.limiarVermelho = Number(process.env.VERMELHO);

/*
ADVERTIDONAODISPUTA=1 estende o medo do advertido ao DESARME.

Hoje o `podeFazerCarrinho` so tira o carrinho, e o ramo do carrinho cai para o
`actTackle` — que e o desarme, um dos dois gestos em que os advertidos
reincidem. O travao redirige em vez de travar. Aqui simula-se o travao a
serio, sem tocar no codigo de producao, para se medir o preco antes de o pagar.
*/
if (process.env.ADVERTIDONAODISPUTA) {
    const origT = global.actTackle;
    if (typeof origT === 'function') {
        global.actTackle = function (ctx) {
            if (ctx && ctx.p && ctx.p.temAmarelo) return;
            return origT(ctx);
        };
    }
}

const conta = {
    directo: 0, segundoAmarelo: 0, amarelo: 0, amareloPorTravar: 0, nada: 0
};
const gravidades = [];
/*
POR TIPO DE GESTO, e se o infractor JA ESTAVA ADVERTIDO.

O travao dos advertidos (`podeFazerCarrinho`) e lido num sitio so — o ramo do
SLIDE_TACKLE. Se os amarelos vierem de `contacto` ou `desarme`, nada impede um
jogador ja advertido de repetir o gesto, e o segundo amarelo e so uma questao
de tempo. E o numero que decide onde por o travao.
*/
const porTipo = {};
const advertidoRepete = {};

{
    const origFalta = Officials.marcarFalta.bind(Officials);
    Officials.marcarFalta = function (infractor, vitima, dados) {
        const tipo = (dados && dados.tipo) || '?';
        const jaTinha = !!(infractor && infractor.temAmarelo);
        porTipo[tipo] = (porTipo[tipo] || 0) + 1;
        if (jaTinha) advertidoRepete[tipo] = (advertidoRepete[tipo] || 0) + 1;
        return origFalta(infractor, vitima, dados);
    };

    const orig = Officials.decidirCartao.bind(Officials);
    Officials.decidirCartao = function (gravidade, jogador, travouAtaque) {
        const r = orig(gravidade, jogador, travouAtaque);
        gravidades.push(gravidade);
        const F = RefereeModel.faltas;
        if (r === 'vermelho') {
            if (gravidade >= F.limiarVermelho) conta.directo++;
            else conta.segundoAmarelo++;
        } else if (r === 'amarelo') {
            conta.amarelo++;
            // O amarelo que só existe porque travou um ataque promissor.
            if (gravidade < F.limiarAmarelo && travouAtaque) conta.amareloPorTravar++;
        } else {
            conta.nada++;
        }
        return r;
    };
}

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

const min = Match.tempoDeJogo / 60;
const por90 = (n) => (n * 90 / min).toFixed(2);
const A = MatchStats.TeamA, B = MatchStats.TeamB;

console.log(`\nsemente ${semente} | ${min.toFixed(0)} min | limiarVermelho = ` +
    `${RefereeModel.faltas.limiarVermelho}\n`);
console.log(`  faltas julgadas            ${gravidades.length}  (${por90(gravidades.length)}/90)`);
console.log(`  amarelos                   ${conta.amarelo}  (${por90(conta.amarelo)}/90)` +
    `   dos quais por TRAVAR ataque: ${conta.amareloPorTravar}`);
console.log(`  vermelhos DIRECTOS         ${conta.directo}  (${por90(conta.directo)}/90)`);
console.log(`  vermelhos por 2.o amarelo  ${conta.segundoAmarelo}  (${por90(conta.segundoAmarelo)}/90)`);
console.log(`  sem cartao                 ${conta.nada}`);
console.log(`\n  contadores do jogo: amarelos ${por90(A.amarelos + B.amarelos)}/90  ` +
    `vermelhos ${por90(A.vermelhos + B.vermelhos)}/90   (alvo 5.22 e 0.08)`);

const faixa = (a, b) => gravidades.filter(g => g >= a && g < b).length;
console.log('\n  gravidade das faltas: <0.60 ' + faixa(0, 0.6) + ' | 0.60-0.85 ' + faixa(0.6, 0.85) +
    ' | 0.85-0.95 ' + faixa(0.85, 0.95) + ' | 0.95-1.10 ' + faixa(0.95, 1.10) +
    ' | 1.10+ ' + faixa(1.10, 99));
console.log('\n  faltas por gesto (e quantas de quem JA tinha amarelo):');
for (const [k, v] of Object.entries(porTipo).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(12)} ${String(v).padStart(4)}   ` +
        `de advertidos: ${advertidoRepete[k] || 0}`);
}
console.log('');
