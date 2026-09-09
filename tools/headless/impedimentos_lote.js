/*
IMPEDIMENTOS POR 90, com semente fixa.

O lote de 100 jogos deu 4.88 impedimentos por jogo (152% do alvo) contra os
3.13 (98%) do lote de 30 da mesma manhã. É uma subida grande, e a única coisa
que mudou entre os dois foi esta sessão.

A suspeita tem mecanismo: a `formaDaDefesaNoLivre` passou a arrumar a equipa
que defende um livre num BLOCO COMPACTO a 9.15-34 m da bola. Antes ficavam
espalhados, e havia quase sempre alguém esquecido lá atrás — e é o mais recuado
que DESENHA A LINHA de fora-de-jogo. Com o bloco junto, a linha sobe, e sobe
logo a seguir a cada uma das ~26 faltas por jogo.

Uma semente por invocação, para se poder correr o mesmo conjunto antes e depois
de uma alteração e comparar sem ruído:

    for S in 0 1 2; do node tools/headless/impedimentos_lote.js 600 $S; done

Uso: node tools/headless/impedimentos_lote.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 600);
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
QUANTOS FORA-DE-JOGO SAEM LOGO A SEGUIR A UM LIVRE. É a metade da suspeita que
o contador global não distingue: se a subida vier da forma do livre, os
impedimentos aparecem agrupados nos segundos seguintes a cada `FREE_KICK`.
*/
/*
SEMFORMA=1 desliga a `formaDaDefesaNoLivre` sem tocar no codigo de producao. E
o teste decisivo da suspeita: se os impedimentos voltarem ao valor de antes da
sessao, e ela.
*/
if (process.env.SEMFORMA) Match.formaDaDefesaNoLivre = function () { };

/*
E A LINHA DE FORA-DE-JOGO, medida em metros da baliza que a defesa protege. E o
numero que o mecanismo preve: se a forma do livre juntar o bloco, o mais
recuado sobe e a linha sobe com ele. Separa-se o jogo corrido do que acontece
logo a seguir a um livre.
*/
const linha = { corrido: [], aposLivre: [] };

/*
O QUE ESTA A MONTANTE DO IMPEDIMENTO, e que tem amostra a serio.

Contar apitos e contar um evento raro: 3 a 5 por 90 min, com desvio da mesma
ordem da media, e oito sementes nao chegam para distinguir nada. O que os
produz e outra coisa e mede-se por frame: quantos jogadores tem o ALVO para la
da linha de fora-de-jogo que eles proprios leem, e quantos ESTAO la.

`RunIntoSpaceModel.riscoAlemDaLinha` (4.5 m) e a aposta do avancado que arranca
antes do passe, e e o numero que a sessao de 8 de Setembro calibrou contra esta
mesma metrica.
*/
const alem = { comAlvo: 0, comCorpo: 0, amostras: 0 };

let ultimoLivre = -999;
let logoAposLivre = 0;
{
    const orig = MatchStats.registarImpedimento
        ? MatchStats.registarImpedimento.bind(MatchStats) : null;
    if (orig) {
        MatchStats.registarImpedimento = function (team) {
            if (Match.tempoDeJogo - ultimoLivre < 60) logoAposLivre++;
            return orig(team);
        };
    }
}

let estadoAnterior = null;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 30 === 0 && Match.state === 'PLAY') {
        for (const team of ['TeamA', 'TeamB']) {
            const bb = (typeof TeamAI !== 'undefined') ? TeamAI.blackboards[team] : null;
            if (!bb || typeof bb.offsideLimitDir !== 'number') continue;
            const lista = (team === 'TeamA') ? Match.players : Match.opponents;
            for (const p of lista) {
                if (!p || p.role === 'gk' || !p.model || !p.dynamicTarget) continue;
                alem.amostras++;
                if (p.dynamicTarget.z * p.dirZ > bb.offsideLimitDir) alem.comAlvo++;
                if (p.model.position.z * p.dirZ > bb.offsideLimitDir) alem.comCorpo++;
            }
        }
    }
    if (i % 30 === 0 && Match.state === 'PLAY') {
        for (const [lista, outra] of [[Match.players, Match.opponents],
                                      [Match.opponents, Match.players]]) {
            const def = lista.filter(p => p && p.role !== 'gk' && p.model);
            if (!def.length) continue;
            const dir = def[0].dirZ;
            // O mais recuado da equipa, em metros da propria linha de fundo.
            const m = Math.min(...def.map(p => p.model.position.z * dir + LINHA_FUNDO));
            (Match.tempoDeJogo - ultimoLivre < 60 ? linha.aposLivre : linha.corrido).push(m);
        }
    }
    if (Match.state !== estadoAnterior) {
        if (Match.state === 'FREE_KICK') ultimoLivre = Match.tempoDeJogo;
        estadoAnterior = Match.state;
    }
}

const A = MatchStats.TeamA, B = MatchStats.TeamB;
const min = Match.tempoDeJogo / 60;
const por90 = (n) => (n * 90 / min).toFixed(2);
const imp = A.impedimentos + B.impedimentos;
console.log(`semente ${semente}  |  impedimentos ${por90(imp).padStart(6)}/90  ` +
    `(${logoAposLivre} nos 12 s a seguir a um livre)  |  ` +
    `faltas ${por90(A.faltas.cometidas + B.faltas.cometidas).padStart(6)}  |  ` +
    `golos ${por90(A.remates.golos + B.remates.golos).padStart(5)}  |  ` +
    `remates ${por90(A.remates.tentados + B.remates.tentados).padStart(6)}`);
const med = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
console.log(`            alem da linha: ALVO ` +
    `${(100 * alem.comAlvo / Math.max(1, alem.amostras)).toFixed(2)}%  ` +
    `CORPO ${(100 * alem.comCorpo / Math.max(1, alem.amostras)).toFixed(2)}%  ` +
    `(n=${alem.amostras})`);
console.log(`            linha de fora-de-jogo: jogo corrido ${med(linha.corrido)} m ` +
    `| logo apos um livre ${med(linha.aposLivre)} m  (metros da propria baliza)`);
