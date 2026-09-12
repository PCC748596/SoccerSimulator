/*
LOTE DE JOGOS COMPLETOS — o teste de aceitação, e não uma medição de um
detalhe.

Corre N jogos de M minutos com EQUIPAS REAIS diferentes (data/squads.js) e
sementes diferentes, e no fim diz duas coisas: os números do jogo comparados
com o futebol a sério, e a lista de PENDÊNCIAS — o que ficou fora do que se
considera aceitável, jogo a jogo.

Um jogo só não chega para nada disto: 3 a 7 matadas no peito por jogo, 25
faltas, 2.5 golos. É preciso o lote para um número destes significar alguma
coisa.

Corre em paralelo (um processo por trabalhador) porque 60 jogos de 18 min são
~45 minutos de relógio num processo só.

Uso:
    node tools/headless/lote_jogos.js [jogos] [minutos] [trabalhadores]
*/
const { fork } = require('child_process');
const os = require('os');
const path = require('path');

const JOGOS = Number(process.env.LOTE_JOGOS || process.argv[2] || 60);
const MINUTOS = Number(process.env.LOTE_MINUTOS || process.argv[3] || 18);
const WORKERS = Number(process.argv[4] || Math.min(8, Math.max(1, os.cpus().length - 2)));

/*
=============================================================================
O QUE CONTA COMO PENDÊNCIA
=============================================================================
Os alvos do futebol a sério são os mesmos que o `tools/headless/painel.js`
usa (2.52 golos, 26.11 remates, 176.63 ataques por 90). Aqui a banda é larga
de propósito: um lote não é para afinar décimas, é para apanhar o que está
partido — zero golos, a bola presa, um jogador fora do campo, uma equipa com
90% de posse.

As três últimas linhas são as regras que se acabaram de mexer, e estão aqui
para não voltarem a partir sem ninguém dar por isso.
*/
const LIMITES = {
    golosMin: 1.0, golosMax: 5.0,          // por 90 minutos, somando as duas
    rematesMin: 12, rematesMax: 45,
    passesCertosMin: 55,                   // %
    posseMin: 25, posseMax: 75,            // % de uma equipa
    paradaMax: 25,                         // % do tempo com o jogo parado
    larguraAlaMin: 14.0,                   // |x| médio do lateral/médio de ala
    peitoMin: 2,                           // matadas no peito por jogo
    faltasMin: 8, faltasMax: 45            // por 90
};

/* =====================================================================
   TRABALHADOR — corre os jogos que lhe couberem e devolve uma linha por jogo
   ===================================================================== */
if (process.env.LOTE_WORKER) {
    const indices = JSON.parse(process.env.LOTE_WORKER);
    const minutos = MINUTOS;

    const mulberry32 = (a) => () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    require('./harness.js');
    const dt = 1 / 60;
    const scene = new THREE.Scene();

    Math.random = mulberry32(1000);
    Match.init(scene);
    if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
    if (typeof Sim === 'undefined') global.Sim = {};
    Sim.running = true;

    /*
    `LOTE_GENERICAS=1` corre o lote com as equipas genéricas do
    `player_skills.js` em vez dos planteis reais. É o controlo: os mesmos 60
    jogos, a mesma medição, e a única diferença é quem joga — sem isto não se
    sabe se um número fora de banda é dos planteis ou do jogo.
    */
    const genericas = process.env.LOTE_GENERICAS === '1';
    const equipas = (!genericas && typeof SquadsData !== 'undefined' && SquadsData.equipas)
        ? SquadsData.equipas : [];

    for (const i of indices) {
        // Semente por jogo: dois jogos do lote nunca são o mesmo jogo.
        Math.random = mulberry32(1000 + i * 977);

        // Equipas reais, um par diferente por jogo. Sem planteis carregados,
        // corre com as genéricas de sempre — o lote continua a valer.
        let nomeA = 'genérica A', nomeB = 'genérica B';
        if (equipas.length >= 2) {
            const a = equipas[(i * 2) % equipas.length];
            const b = equipas[(i * 2 + 1) % equipas.length];
            nomeA = a.nome; nomeB = b.nome;
            Match.trocarEquipas({ A: a.id, B: b.id });
        } else {
            Match.trocarEquipas({});
        }
        MatchStats.reset();
        Match.tempoDeJogo = 0;
        Match.placarA = 0; Match.placarB = 0;

        const jogo = {
            i: i, equipaA: nomeA, equipaB: nomeB,
            peitos: 0, gestosArbitro: 0,
            foraDoCampo: 0, naoNumerico: 0,
            paradoFrames: 0, maiorParagem: 0,
            largura: { soma: 0, n: 0 },
            erro: null
        };

        // Contadores que não vivem no MatchStats.
        const origPeito = FootballPlayer.prototype.controlarNoPeito;
        FootballPlayer.prototype.controlarNoPeito = function () {
            jogo.peitos++;
            return origPeito.apply(this, arguments);
        };

        const ALAS = ['LB', 'RB', 'LM', 'RM', 'LWB', 'RWB', 'LW', 'RW'];
        const LIM_X = CAMPO_LARG / 2 + 4;
        const LIM_Z = CAMPO_COMP / 2 + 6;

        let paragemActual = 0;
        const passos = Math.round(minutos * 60 / dt);
        try {
            for (let f = 0; f < passos; f++) {
                Match.update(dt);

                if (Match.state !== 'PLAY') {
                    jogo.paradoFrames++;
                    paragemActual++;
                    if (paragemActual > jogo.maiorParagem) jogo.maiorParagem = paragemActual;
                } else {
                    paragemActual = 0;
                }

                if (Officials && Officials.arbitro && Officials.arbitro.sinal) jogo.gestosArbitro++;

                // Amostragem: 2 vezes por segundo chega para médias e para
                // apanhar um jogador fora do campo.
                if (f % 30) continue;
                for (const p of Match.players.concat(Match.opponents)) {
                    if (!p || !p.model) continue;
                    const x = p.model.position.x, z = p.model.position.z;
                    if (!isFinite(x) || !isFinite(z)) { jogo.naoNumerico++; continue; }
                    if (Math.abs(x) > LIM_X || Math.abs(z) > LIM_Z) jogo.foraDoCampo++;
                    if (p.role !== 'gk' && ALAS.includes(p.pos)) {
                        jogo.largura.soma += Math.abs(x);
                        jogo.largura.n++;
                    }
                }
                if (!isFinite(Match.ball.position.x) || !isFinite(Match.ball.position.z)) jogo.naoNumerico++;
            }
        } catch (e) {
            jogo.erro = String(e && e.message || e);
        }
        FootballPlayer.prototype.controlarNoPeito = origPeito;

        const A = MatchStats.TeamA, B = MatchStats.TeamB;
        jogo.min = Match.tempoDeJogo / 60;
        jogo.stats = {
            golos: A.remates.golos + B.remates.golos,
            remates: A.remates.tentados + B.remates.tentados,
            passesTentados: A.passes.tentados + B.passes.tentados,
            passesCertos: A.passes.certos + B.passes.certos,
            posseA: A.posseSegundos || 0,
            posseB: B.posseSegundos || 0,
            faltas: (A.faltas ? A.faltas.cometidas : 0) + (B.faltas ? B.faltas.cometidas : 0),
            impedimentos: (A.impedimentos || 0) + (B.impedimentos || 0)
        };
        jogo.larguraMedia = jogo.largura.n ? jogo.largura.soma / jogo.largura.n : 0;
        delete jogo.largura;

        process.send({ tipo: 'jogo', jogo: jogo });
    }
    process.send({ tipo: 'fim' });
    return;
}

/* =====================================================================
   PAI — reparte os jogos, junta os resultados, escreve o relatório
   ===================================================================== */
const porTrabalhador = [];
for (let w = 0; w < WORKERS; w++) porTrabalhador.push([]);
for (let i = 0; i < JOGOS; i++) porTrabalhador[i % WORKERS].push(i);

const resultados = [];
let vivos = 0;
const inicio = Date.now();

console.log(`Lote: ${JOGOS} jogos de ${MINUTOS} min em ${WORKERS} processos...`);

for (const lista of porTrabalhador) {
    if (!lista.length) continue;
    vivos++;
    const filho = fork(path.join(__dirname, 'lote_jogos.js'), [], {
        env: Object.assign({}, process.env, {
            LOTE_WORKER: JSON.stringify(lista),
            LOTE_MINUTOS: String(MINUTOS),
            LOTE_JOGOS: String(JOGOS)
        }),
        stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    });
    filho.on('message', (m) => {
        if (m.tipo === 'jogo') {
            resultados.push(m.jogo);
            const feitos = resultados.length;
            if (feitos % 5 === 0 || feitos === JOGOS) {
                const seg = ((Date.now() - inicio) / 1000).toFixed(0);
                console.log(`  ${feitos}/${JOGOS} jogos (${seg}s)`);
            }
        }
    });
    filho.on('exit', () => { if (--vivos === 0) relatorio(); });
}

function relatorio() {
    if (!resultados.length) {
        console.log('Nenhum jogo correu.');
        process.exit(1);
    }
    resultados.sort((a, b) => a.i - b.i);

    const pendencias = [];
    const soma = { golos: 0, remates: 0, faltas: 0, peitos: 0, largura: 0, parado: 0, impedimentos: 0 };
    let passT = 0, passC = 0;

    for (const j of resultados) {
        const k = j.min > 0 ? 90 / j.min : 0;
        const s = j.stats;
        const golos90 = s.golos * k;
        const remates90 = s.remates * k;
        const faltas90 = s.faltas * k;
        const pctPasses = s.passesTentados ? 100 * s.passesCertos / s.passesTentados : 0;
        const posseTotal = s.posseA + s.posseB;
        const pctPosseA = posseTotal ? 100 * s.posseA / posseTotal : 50;
        const pctParado = j.min > 0 ? 100 * j.paradoFrames / (j.min * 60 * 60) : 0;

        soma.golos += golos90; soma.remates += remates90; soma.faltas += faltas90;
        soma.peitos += j.peitos; soma.largura += j.larguraMedia; soma.parado += pctParado;
        soma.impedimentos += s.impedimentos * k;
        passT += s.passesTentados; passC += s.passesCertos;

        const onde = `jogo ${j.i} (${j.equipaA} x ${j.equipaB})`;
        const falha = (txt) => pendencias.push(`${onde}: ${txt}`);

        if (j.erro) falha(`REBENTOU — ${j.erro}`);
        if (j.naoNumerico) falha(`${j.naoNumerico} leituras de posição não numéricas (NaN)`);
        if (j.foraDoCampo > 5) falha(`${j.foraDoCampo} leituras com alguém fora do campo`);
        if (golos90 < LIMITES.golosMin || golos90 > LIMITES.golosMax) falha(`golos/90 = ${golos90.toFixed(1)}`);
        if (remates90 < LIMITES.rematesMin || remates90 > LIMITES.rematesMax) falha(`remates/90 = ${remates90.toFixed(0)}`);
        if (pctPasses < LIMITES.passesCertosMin) falha(`passes certos = ${pctPasses.toFixed(0)}%`);
        if (pctPosseA < LIMITES.posseMin || pctPosseA > LIMITES.posseMax) falha(`posse = ${pctPosseA.toFixed(0)}% / ${(100 - pctPosseA).toFixed(0)}%`);
        if (pctParado > LIMITES.paradaMax) falha(`${pctParado.toFixed(0)}% do tempo com o jogo parado`);
        if (j.maiorParagem > 60 * 90) falha(`paragem de ${(j.maiorParagem / 60).toFixed(0)} s seguidos`);
        if (j.larguraMedia < LIMITES.larguraAlaMin) falha(`alas a ${j.larguraMedia.toFixed(1)} m do eixo`);
        if (j.peitos < LIMITES.peitoMin) falha(`só ${j.peitos} matadas no peito`);
        if (faltas90 < LIMITES.faltasMin || faltas90 > LIMITES.faltasMax) falha(`faltas/90 = ${faltas90.toFixed(0)}`);
        if (j.gestosArbitro === 0 && s.faltas > 0) falha('o árbitro marcou faltas e nunca sinalizou');
    }

    const n = resultados.length;
    const m = (v) => (v / n).toFixed(2);
    const seg = ((Date.now() - inicio) / 1000).toFixed(0);

    console.log(`\n=== ${n} jogos de ${MINUTOS} min (${seg}s de relógio) ===`);
    console.log(`golos/90         ${m(soma.golos)}   (real 2.52)`);
    console.log(`remates/90       ${m(soma.remates)}  (real 26.11)`);
    console.log(`faltas/90        ${m(soma.faltas)}  (real 27.63)`);
    console.log(`impedimentos/90  ${m(soma.impedimentos)}  (real 3.2)`);
    console.log(`passes certos    ${passT ? (100 * passC / passT).toFixed(0) : '-'}%`);
    console.log(`matadas no peito ${m(soma.peitos)} por jogo`);
    console.log(`|x| dos alas     ${m(soma.largura)} m`);
    console.log(`tempo parado     ${m(soma.parado)}%`);

    if (!pendencias.length) {
        console.log('\nPENDÊNCIAS: nenhuma.');
        process.exit(0);
    }
    console.log(`\nPENDÊNCIAS (${pendencias.length}):`);
    for (const p of pendencias) console.log('  - ' + p);
    process.exit(2);
}
