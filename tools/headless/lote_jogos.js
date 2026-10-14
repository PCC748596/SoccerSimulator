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

/*
A LIGA (LOTE_LIGA=1): os 20 times do campeonato, TODOS CONTRA TODOS, UM JOGO POR PAR (190 jogos), com o MANDO
alternado: quem joga em casa e a equipa A (a primeira do jogo), e o mandante de cada par alterna com a paridade dos
indices, para cada time ter 9 ou 10 jogos em casa e os outros fora. Pedido: *"um jogo para cada com cada rival, um em
casa e outro fora alternando; o mando de campo tambem afeta os resultados"*. No fim sai a classificacao, e a
diferenca dos resultados em casa e fora.
*/
const LIGA_NOMES = ['Palmeiras-SP', 'Grêmio-RS', 'Atlético-MG', 'Flamengo-RJ', 'Botafogo-RJ', 'Bragantino-SP', 'Fluminense-RJ',
    'Atlético-PR', 'Internacional-RS', 'Fortaleza-CE', 'São Paulo-SP', 'Cuiabá-MT', 'Corinthians-SP', 'Cruzeiro-MG',
    'Vasco-RJ', 'Bahia-BA', 'Santos-SP', 'Goiás-GO', 'Coritiba-PR', 'América-MG'];
const LIGA = process.env.LOTE_LIGA === '1';
// Os pares (a, b, mandante) de uma liga de `n` times, a < b, o mandante alternando com a paridade de a + b.
function calendarioDaLiga(n, turnos) {
    /*
    Metodo do circulo: n - 1 rodadas de n / 2 jogos, e em cada rodada cada time joga UMA vez (e e por isso que as
    suspensoes por cartao se podem aplicar de uma rodada para a seguinte). O mandante alterna pela paridade da rodada e
    da mesa. Com 2 turnos o returno repete as rodadas com o mando trocado. O indice do jogo e o da lista: o jogo i
    pertence a rodada Math.floor(i / (n / 2)).
    */
    const pares = [];
    const t = []; for (let k = 0; k < n; k++) t.push(k);
    for (let r = 0; r < n - 1; r++) {
        for (let k = 0; k < n / 2; k++) {
            const x = t[k], y = t[n - 1 - k];
            const casaX = ((r + k) % 2 === 0);
            pares.push({ casa: casaX ? x : y, fora: casaX ? y : x, rodada: r });
        }
        t.splice(1, 0, t.pop());   // gira todos menos o primeiro
    }
    if ((turnos || 1) >= 2) { const n1 = pares.length; for (let i = 0; i < n1; i++) pares.push({ casa: pares[i].fora, fora: pares[i].casa, rodada: pares[i].rodada + (n - 1) }); }
    return pares;
}
const LIGA_TURNOS = Number(process.env.LOTE_TURNOS || (Number(process.argv[2]) > 190 ? 2 : 1));
const JOGOS = LIGA ? calendarioDaLiga(LIGA_NOMES.length, LIGA_TURNOS).length : Number(process.env.LOTE_JOGOS || process.argv[2] || 60);
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
    /*
    LOTE_SET="ShotModel.factorForca=0.9;RefereeModel.faltas.escala=5.8": sobrepoe numeros da configuracao SO neste lote
    (caminho com pontos = valor numerico, separados por ';'), para afinar sem editar ficheiros a cada tentativa.
    */
    if (process.env.LOTE_SET) {
        for (const par of process.env.LOTE_SET.split(';')) {
            const [caminho, valor] = par.split('=');
            if (!caminho || valor === undefined) continue;
            const partes = caminho.trim().split('.');
            let o = global[partes[0]] || (typeof window !== 'undefined' ? window[partes[0]] : undefined);
            if (!o) { try { o = (0, eval)(partes[0]); } catch (e) { o = undefined; } }
            if (!o) { console.error('LOTE_SET: nao encontrei ' + partes[0]); continue; }
            for (let k = 1; k < partes.length - 1; k++) o = o[partes[k]];
            o[partes[partes.length - 1]] = Number(valor);
        }
    }
    // Sobreposicoes para A/B sem tocar na configuracao: LOTE_VEL (maximo m/s), LOTE_SEMMEIAS=1 (desliga o tecto dos meias), LOTE_SEMATERRAGEM=1.
    if (process.env.LOTE_VEL) { VelocidadeHumana.maximo = Number(process.env.LOTE_VEL); VelocidadeHumana.amplitude = Number(process.env.LOTE_VEL) * (2.2 / 9.5); }
    if (process.env.LOTE_SEMMEIAS === '1') BlockShape.meiasComBola.activo = false;
    if (process.env.LOTE_SEMATERRAGEM === '1') SaltoCabeceio.aterragem.activo = false;
    // Varrimento dos impedimentos: LOTE_PSIGMA (erro do passador, m), LOTE_RISCO (riscoAlemDaLinha), LOTE_AVIES (vies do atacante).
    if (process.env.LOTE_PSIGMA) { OffsideModel.passeSigma = Number(process.env.LOTE_PSIGMA); OffsideModel.passeSigmaMin = Number(process.env.LOTE_PSIGMA) * 0.45; }
    if (process.env.LOTE_RISCO) RunIntoSpaceModel.riscoAlemDaLinha = Number(process.env.LOTE_RISCO);
    if (process.env.LOTE_AVIES) OffsideModel.vies = Number(process.env.LOTE_AVIES);
    // LOTE_IMPOLD=1: volta a calibracao antiga dos impedimentos (sem erro do passador, vies 0.45, risco 1.0).
    if (process.env.LOTE_IMPOLD === '1') { OffsideModel.passeSigma = 0.001; OffsideModel.passeSigmaMin = 0.001; OffsideModel.passeVies = 0; OffsideModel.vies = 0.45; RunIntoSpaceModel.riscoAlemDaLinha = 1.0; }
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
    const todas = (!genericas && typeof SquadsData !== 'undefined' && SquadsData.equipas)
        ? SquadsData.equipas : [];
    /*
    O NIVEL DAS EQUIPAS: so jogam entre si equipas do nivel pedido. Relato: *"estou a ajustar o jogo para partidas
    entre times da Serie A, de nivel 80 em media; se ajusto para um time de media 80, fica mais dificil para um de 70"*.
    O lote misturava os 57 plantéis (forca 75-88) em pares ao acaso, e a calibracao ficava a perseguir a mistura.
    Agora (por omissao) so entram equipas com `forca` a `LOTE_BANDA` (2) do `LOTE_NIVEL` (80); a banda alarga-se de 1 em
    1 se houver menos de 8 equipas. `LOTE_NIVEL=0` volta a usar todas. Quem for mais fraco tem mais dificuldade e quem for
    mais forte menos, naturalmente — o ajuste e para o padrao.
    */
    // O "80 da Serie A" acompanha o fator de forca dos plantéis (SkillCalib.fatorForca em skill_map.js): reduzidos 8%, o 80 passa a 73.6.
    const fatorForca = require('../../js/config/skill_map.js').SkillCalib.fatorForca || 1;
    const nivel = (process.env.LOTE_NIVEL !== undefined) ? Number(process.env.LOTE_NIVEL) : 80 * fatorForca;
    let banda = (process.env.LOTE_BANDA !== undefined) ? Number(process.env.LOTE_BANDA) : 2;
    let equipas = todas;
    if (nivel > 0 && todas.length) {
        equipas = todas.filter(e => Math.abs(e.forca - nivel) <= banda);
        while (equipas.length < 8 && banda < 20) { banda++; equipas = todas.filter(e => Math.abs(e.forca - nivel) <= banda); }
    }

    for (const i of indices) {
        /*
        Semente por jogo: dois jogos do lote nunca são o mesmo jogo.

        `LOTE_SEMENTE` desloca o conjunto inteiro. Serve para medir o RUÍDO do
        próprio lote: correr a mesma configuração com outro conjunto de
        sementes diz quanto é que um número se mexe sem nada ter mudado — sem
        isso, uma diferença de 0.3 golos entre dois lotes não se sabe se é
        efeito ou acaso.
        */
        const base = Number(process.env.LOTE_SEMENTE || 1000);
        Math.random = mulberry32(base + i * 977);

        // Equipas reais, um par diferente por jogo. Sem planteis carregados,
        // corre com as genéricas de sempre — o lote continua a valer.
        let nomeA = 'genérica A', nomeB = 'genérica B', forcaA = null, forcaB = null;
        let ligaA = null, ligaB = null;
        if (LIGA && typeof SquadsData !== 'undefined' && SquadsData.equipas) {
            const par = calendarioDaLiga(LIGA_NOMES.length, LIGA_TURNOS)[i];
            ligaA = SquadsData.equipas.find(e => e.nome === LIGA_NOMES[par.casa]);
            ligaB = SquadsData.equipas.find(e => e.nome === LIGA_NOMES[par.fora]);
            if (!ligaA || !ligaB) throw new Error('equipa da liga nao encontrada: ' + LIGA_NOMES[par.casa] + ' / ' + LIGA_NOMES[par.fora]);
        }
        // As SUSPENSOES desta rodada (nomes de equipa -> ids dos jogadores que nao jogam): ver o pai.
        const susp = process.env.LOTE_SUSPENSOS ? JSON.parse(process.env.LOTE_SUSPENSOS) : {};
        const suspDe = (nome) => new Set((susp[nome] || []));
        if (ligaA && ligaB) {
            Match.suspensos = { A: suspDe(ligaA.nome), B: suspDe(ligaB.nome) };
        } else {
            Match.suspensos = null;
        }
        if (ligaA && ligaB) {
            nomeA = ligaA.nome; nomeB = ligaB.nome; forcaA = ligaA.forca; forcaB = ligaB.forca;
            Match.trocarEquipas({ A: ligaA.id, B: ligaB.id });
        } else if (equipas.length >= 2) {
            const a = equipas[(i * 2) % equipas.length];
            const b = equipas[(i * 2 + 1) % equipas.length];
            nomeA = a.nome; nomeB = b.nome; forcaA = a.forca; forcaB = b.forca;
            Match.trocarEquipas({ A: a.id, B: b.id });
        } else {
            Match.trocarEquipas({});
        }
        MatchStats.reset();
        Match.tempoDeJogo = 0;
        Match.placarA = 0; Match.placarB = 0;

        const jogo = {
            i: i, equipaA: nomeA, equipaB: nomeB, forcaA: forcaA, forcaB: forcaB, banda: banda, nivelPedido: nivel, equipasNoNivel: equipas.length,
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
        /*
        A FICHA COMPLETA, pela conta do próprio jogo: `MatchStats.porJogo`
        normaliza para 90 minutos e é a mesma função que alimenta o painel
        "Estatísticas" do ecrã. Repetir a extrapolação aqui era arriscar dois
        números diferentes para a mesma coisa.
        */
        jogo.ficha = MatchStats.porJogo(Match.tempoDeJogo);
        // O processo que escreve o relatorio nao carrega o jogo: leva daqui o ritmo do relogio (ver `x real/min`).
        // TODOS os contadores do MatchStats (folhas numericas), para a tabela completa no fim.
        const folhas = (o, pre, out) => { for (const k in o) { const v = o[k]; if (typeof v === 'number' && isFinite(v)) out[pre + k] = v; else if (v && typeof v === 'object' && !Array.isArray(v)) folhas(v, pre + k + '.', out); } return out; };
        jogo.folhas = { A: folhas(MatchStats.TeamA, '', {}), B: folhas(MatchStats.TeamB, '', {}) };
        jogo.timeScale = MatchDuration.timeScale;
        jogo.razoes = MatchStats.RAZOES;
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
        jogo.placar = { A: Match.placarA, B: Match.placarB };
        // Os cartoes de cada jogador, para as suspensoes da rodada seguinte (e para o relatorio).
        jogo.cartoes = [];
        const todosOsJogadores = [].concat(Match.players, Match.opponents, Match.expulsos || []);
        for (const p of todosOsJogadores) {
            if (!p || !p.skills || p.skills.id === undefined) continue;
            if (!p.temAmarelo && !p.expulso) continue;
            jogo.cartoes.push({ id: p.skills.id, nome: p.skills.nome, equipa: p.team === 'TeamA' ? nomeA : nomeB,
                amarelo: !!p.temAmarelo, vermelho: !!p.expulso, directo: !!(p.expulso && !p.temAmarelo) });
        }
        jogo.suspensosNesteJogo = { A: [...Match.suspensos ? Match.suspensos.A : []].length, B: [...Match.suspensos ? Match.suspensos.B : []].length };
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
const resultados = [];
const inicio = Date.now();
const LISTA_PARES = LIGA ? calendarioDaLiga(LIGA_NOMES.length, LIGA_TURNOS) : null;
const COM_SUSPENSOES = LIGA && process.env.LOTE_SUSP !== '0';
/*
SUSPENSOES (liga): vermelho = 1 jogo de suspensao; 3 amarelos acumulados = 1 jogo (e o contador volta a zero). Quem esta
suspenso nao entra no onze do jogo seguinte da equipa (Match.suspensos, createTeams); cumprida a suspensao, volta. O
segundo amarelo de um jogo conta como vermelho (e nao como amarelo para a acumulacao), como na regra.
*/
const SUSP = { porEquipa: {}, amarelosAcum: {}, totalVermelhos: 0, totalPorAmarelos: 0, jogosPerdidos: 0, lista: [] };

function aoJogo(m) {
    if (m.tipo !== 'jogo') return;
    resultados.push(m.jogo);
    const feitos = resultados.length;
    /*
    BARRA DE PROGRESSO com percentagem, tempo decorrido e tempo que falta — um lote demora dezenas de minutos
    e sem isto parece que o computador travou. Num terminal reescreve-se a mesma linha; redireccionado
    para ficheiro escreve-se uma linha de cada vez, a cada jogo que acaba.
    */
    const seg = (Date.now() - inicio) / 1000;
    const falta = feitos > 0 ? seg / feitos * (JOGOS - feitos) : 0;
    const fmt = (t) => { t = Math.round(t); const mm = Math.floor(t / 60), r = t % 60; return mm + 'm' + String(r).padStart(2, '0') + 's'; };
    const larg = 30, cheio = Math.round(larg * feitos / JOGOS);
    const linha = '  [' + '#'.repeat(cheio) + '-'.repeat(larg - cheio) + '] ' + (100 * feitos / JOGOS).toFixed(0).padStart(3) + '%  ' + feitos + '/' + JOGOS + ' jogos  decorrido ' + fmt(seg) + '  falta ~' + fmt(falta);
    if (process.stdout.isTTY) {
        process.stdout.write(String.fromCharCode(13) + linha + (feitos === JOGOS ? String.fromCharCode(10) : ''));
    } else {
        console.log(linha);
    }
}

// Corre um conjunto de jogos (indices) repartidos pelos trabalhadores e devolve uma promessa para quando acabarem.
function correrJogos(indices, suspensos) {
    return new Promise((resolve) => {
        const porTrabalhador = [];
        for (let w = 0; w < WORKERS; w++) porTrabalhador.push([]);
        indices.forEach((i, k) => porTrabalhador[k % WORKERS].push(i));
        let vivos = 0;
        for (const lista of porTrabalhador) {
            if (!lista.length) continue;
            vivos++;
            const filho = fork(path.join(__dirname, 'lote_jogos.js'), [], {
                env: Object.assign({}, process.env, {
                    LOTE_WORKER: JSON.stringify(lista),
                    LOTE_MINUTOS: String(MINUTOS),
                    LOTE_JOGOS: String(JOGOS),
                    LOTE_TURNOS: String(LIGA_TURNOS),
                    LOTE_SUSPENSOS: JSON.stringify(suspensos || {})
                }),
                stdio: ['ignore', 'inherit', 'inherit', 'ipc']
            });
            filho.on('message', aoJogo);
            filho.on('exit', () => { if (--vivos === 0) resolve(); });
        }
    });
}

console.log('Lote: ' + JOGOS + ' jogos de ' + MINUTOS + ' min em ' + WORKERS + ' processos' + (COM_SUSPENSOES ? ' (por rodadas, com suspensoes)' : '') + '...');

(async function () {
    if (!COM_SUSPENSOES) {
        const todos = []; for (let i = 0; i < JOGOS; i++) todos.push(i);
        await correrJogos(todos, {});
        relatorio();
        return;
    }
    const porRodada = LIGA_NOMES.length / 2;
    const rodadas = Math.min(JOGOS / porRodada, Number(process.env.LOTE_RODADAS || 1e9));
    let suspensos = {};   // nome da equipa -> [ids] que nao jogam a rodada seguinte
    for (let r = 0; r < rodadas; r++) {
        const indices = []; for (let k = 0; k < porRodada; k++) indices.push(r * porRodada + k);
        const antes = resultados.length;
        await correrJogos(indices, suspensos);
        const jogosDaRodada = resultados.slice(antes);
        // quem cumpriu: as equipas que jogaram esta rodada deixam de ter suspensos
        for (const j of jogosDaRodada) { SUSP.jogosPerdidos += (suspensos[j.equipaA] || []).length + (suspensos[j.equipaB] || []).length; delete suspensos[j.equipaA]; delete suspensos[j.equipaB]; }
        // e quem viu cartoes nesta rodada
        for (const j of jogosDaRodada) {
            for (const c of (j.cartoes || [])) {
                const chave = c.equipa + '#' + c.id;
                if (c.vermelho) {
                    (suspensos[c.equipa] = suspensos[c.equipa] || []).push(c.id);
                    SUSP.totalVermelhos++;
                    SUSP.lista.push({ rodada: r + 1, equipa: c.equipa, nome: c.nome, motivo: c.directo ? 'vermelho directo' : '2º amarelo' });
                } else if (c.amarelo) {
                    SUSP.amarelosAcum[chave] = (SUSP.amarelosAcum[chave] || 0) + 1;
                    if (SUSP.amarelosAcum[chave] >= 3) {
                        SUSP.amarelosAcum[chave] = 0;
                        (suspensos[c.equipa] = suspensos[c.equipa] || []).push(c.id);
                        SUSP.totalPorAmarelos++;
                        SUSP.lista.push({ rodada: r + 1, equipa: c.equipa, nome: c.nome, motivo: '3 amarelos' });
                    }
                }
            }
        }
    }
    relatorio();
})();

/*
OS ALVOS DO FUTEBOL A SÉRIO — os mesmos do painel do ecrã
(`ALVOS_ESTATISTICA` em js/main.js). Repetidos aqui e não importados porque o
`main.js` não corre fora do browser; se algum mudar lá, muda aqui.

`provisorio` são os cartões: não há alvo acordado, e ficam à vista sem
contarem para nada.
*/
const ALVOS = [
    // BENCHMARK BR 2025 (as duas equipas somadas, por 90 min, salvo indicacao):
    { campo: 'golos', rotulo: 'golos', alvo: 2.52, casas: 2 },
    { campo: 'remates', rotulo: 'finalizações', alvo: 26.1, casas: 2 },
    { campo: 'rematesNoAlvo', rotulo: 'finalizações no alvo', alvo: 8.8, casas: 2 },
    { campo: 'pctRematesNoAlvo', rotulo: '% no alvo', alvo: 33.7, casas: 1 },
    { campo: 'xg', rotulo: 'xG total', alvo: 2.84, casas: 2 },
    { campo: 'xgPorRemate', rotulo: 'xG por remate', alvo: 0.109, casas: 3 },
    { campo: 'cantos', rotulo: 'escanteios', alvo: 9.92, casas: 2 },
    { campo: 'faltas', rotulo: 'faltas', alvo: 27.63, casas: 2 },
    { campo: 'amarelos', rotulo: 'amarelos', alvo: 5.22, casas: 2 },
    { campo: 'vermelhos', rotulo: 'vermelhos', alvo: 0.20, casas: 2 },
    { campo: 'impedimentos', rotulo: 'impedimentos', alvo: 3.20, casas: 2 },
    { campo: 'ataquesTotais', rotulo: 'ataques', alvo: 176.6, casas: 1 },
    { campo: 'ataquesPerigosos', rotulo: 'ataques perigosos', alvo: 77.8, casas: 1 },
    { campo: 'passesPorTime', rotulo: 'passes tentados/time', alvo: 375, casas: 0 },
    { campo: 'pctPassesCertos', rotulo: '% passes certos', alvo: 80, casas: 1 },
    { campo: 'pctPosseCasa', rotulo: 'posse da casa (A) %', alvo: 51, casas: 1 },
    { campo: 'defesas', rotulo: 'defesas (GR)', alvo: 6.2, casas: 2 },
    { campo: 'rematesBloqueados', rotulo: 'finalizações bloqueadas', alvo: 7.0, casas: 2 },
    { campo: 'penaltis', rotulo: 'penaltis', alvo: 0.28, casas: 2 },
    // Sem alvo, so informativo:
    // Pedido: no minimo 15 entradas na grande area por jogo (as duas equipas, por 90 min).
    { campo: 'ataquesNaArea', rotulo: 'entradas na área (mín.)', alvo: 15, casas: 1, minimo: true }
];

/*
A tabela das percentagens: medido, alvo, e quanto isso é do alvo. A coluna do
sinal é a mesma regra do painel do ecrã (desvio RELATIVO: 15% ok, 40%
aproximado, mais do que isso fora) — dois golos a mais é um desastre, duas
faltas a mais não é nada.
*/
function tabelaDePercentagens(fichas) {
    const linhas = [];
    for (const m of ALVOS) {
        const vals = fichas.map(f => f[m.campo]).filter(v => typeof v === 'number' && isFinite(v));
        if (!vals.length) { linhas.push({ m: m, medido: null }); continue; }
        const medido = vals.reduce((a, b) => a + b, 0) / vals.length;
        const pct = (m.alvo) ? 100 * medido / m.alvo : null;
        let sinal = '';
        if (m.minimo) {
            sinal = (medido >= m.alvo) ? 'ok' : 'X';
        } else if (pct !== null && !m.provisorio) {
            const desvio = Math.abs(medido - m.alvo) / m.alvo;
            sinal = (desvio <= 0.15) ? 'ok' : (desvio <= 0.40 ? '~' : 'X');
        }
        linhas.push({ m: m, medido: medido, pct: pct, sinal: sinal, n: vals.length });
    }
    return linhas;
}

function relatorio() {
    // Guarda os resultados de cada jogo (para analisar depois sem repetir o lote).
    try { require('fs').writeFileSync(path.join(__dirname, 'ultimo_lote.json'), JSON.stringify(resultados.map(r => ({ i: r.i, equipaA: r.equipaA, equipaB: r.equipaB, forcaA: r.forcaA, forcaB: r.forcaB, placar: r.placar, min: r.min, stats: r.stats })))); } catch (e) { /* so conveniencia */ }
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
    const TS = resultados[0].timeScale || 1, RAZOES = resultados[0].razoes || [];
    const forcas = {};
    for (const r of resultados) { if (typeof r.forcaA === 'number') { forcas[r.equipaA] = r.forcaA; forcas[r.equipaB] = r.forcaB; } }
    {
        const fs = resultados.flatMap(r => [r.forcaA, r.forcaB]).filter(v => typeof v === 'number');
        if (fs.length) {
            const med = fs.reduce((a, b) => a + b, 0) / fs.length;
            const dif = resultados.filter(r => typeof r.forcaA === 'number').map(r => Math.abs(r.forcaA - r.forcaB));
            console.log(`Nível das equipas: média ${med.toFixed(1)} (mín ${Math.min(...fs)}, máx ${Math.max(...fs)}), pedido ${resultados[0].nivelPedido} ±${resultados[0].banda} (${resultados[0].equipasNoNivel} equipas); diferença média entre as duas do jogo ${(dif.reduce((a, b) => a + b, 0) / dif.length).toFixed(1)}`);
        }
    }
    console.log('por 90 minutos de RELÓGIO, média dos jogos  (90 min de relógio = ' + (90 / TS).toFixed(1) + ' min simulados; "x real/min" = quantas vezes o ritmo real por minuto):');
    console.log('');
    console.log('                          medido       alvo   % do alvo   x real/min');
    for (const l of tabelaDePercentagens(resultados.map(r => r.ficha).filter(Boolean))) {
        const rot = l.m.rotulo.padEnd(22);
        if (l.medido === null || l.medido === undefined) {
            console.log('  ' + rot + '       —');
            continue;
        }
        const medido = l.medido.toFixed(l.m.casas).padStart(8);
        const alvo = (l.m.alvo === null) ? '—'.padStart(10) : l.m.alvo.toFixed(l.m.casas).padStart(10);
        const pct = (l.pct === null || l.pct === undefined) ? '—'.padStart(10) : (l.pct.toFixed(0) + '%').padStart(10);
        const nota = l.m.provisorio ? '   (sem alvo acordado)'
            : (l.sinal === 'ok' ? '   ok' : (l.sinal === '~' ? '   ~' : (l.sinal === 'X' ? '   <-- fora' : '')));
        const vez = (RAZOES.indexOf(l.m.campo) >= 0 || !l.m.alvo) ? null : (l.medido / l.m.alvo) * TS;
        const vezTxt = (vez === null) ? '—'.padStart(10) : (vez.toFixed(1) + 'x').padStart(10);
        console.log('  ' + rot + medido + alvo + pct + vezTxt + nota);
    }
    {
        // TODAS AS ESTATISTICAS: media por jogo, escalada a 90 min de relogio, do mandante (equipa A) e do visitante (B).
        const chaves = new Set();
        for (const r of resultados) if (r.folhas) for (const t of ['A', 'B']) for (const k in r.folhas[t]) chaves.add(k);
        const soma = {};
        let nj = 0;
        for (const r of resultados) {
            if (!r.folhas || !(r.min > 0)) continue;
            nj++;
            const k90 = 90 / r.min;
            for (const c of chaves) {
                soma[c] = soma[c] || { A: 0, B: 0 };
                soma[c].A += (r.folhas.A[c] || 0) * k90;
                soma[c].B += (r.folhas.B[c] || 0) * k90;
            }
        }
        console.log('\nTODAS AS ESTATÍSTICAS (média por jogo, por 90 min de relógio; ' + nj + ' jogos; A = mandante, B = visitante):');
        console.log('  ' + 'estatística'.padEnd(46) + 'mandante'.padStart(12) + 'visitante'.padStart(12) + 'média/equipa'.padStart(14));
        for (const c of [...chaves].sort()) {
            const a = soma[c].A / (nj || 1), b = soma[c].B / (nj || 1);
            console.log('  ' + c.padEnd(46) + a.toFixed(2).padStart(12) + b.toFixed(2).padStart(12) + ((a + b) / 2).toFixed(2).padStart(14));
        }
    }
    if (LIGA) {
        const tab = {};
        const T = (nome) => tab[nome] || (tab[nome] = { nome: nome, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0, casa: { j: 0, pts: 0, gp: 0, gc: 0 }, fora: { j: 0, pts: 0, gp: 0, gc: 0 } });
        for (const j of resultados) {
            if (!j.placar) continue;
            const c = T(j.equipaA), f = T(j.equipaB);
            const gc = j.placar.A, gf = j.placar.B;
            for (const [t, gp, ctr, lado] of [[c, gc, gf, 'casa'], [f, gf, gc, 'fora']]) {
                const pts = gp > ctr ? 3 : (gp === ctr ? 1 : 0);
                t.j++; t.gp += gp; t.gc += ctr; t.pts += pts; if (pts === 3) t.v++; else if (pts === 1) t.e++; else t.d++;
                t[lado].j++; t[lado].pts += pts; t[lado].gp += gp; t[lado].gc += ctr;
            }
        }
        const linhas = Object.values(tab).sort((a, b) => b.pts - a.pts || (b.gp - b.gc) - (a.gp - a.gc) || b.gp - a.gp);
        if (COM_SUSPENSOES) {
            console.log('\nSUSPENSOES: ' + SUSP.totalVermelhos + ' vermelhos + ' + SUSP.totalPorAmarelos + ' por 3 amarelos = ' + (SUSP.totalVermelhos + SUSP.totalPorAmarelos) + ' jogadores suspensos; ' + SUSP.jogosPerdidos + ' ausencias em jogos (titular/banco).');
            const porEq = {}; for (const x of SUSP.lista) porEq[x.equipa] = (porEq[x.equipa] || 0) + 1;
            console.log('   por equipa: ' + Object.entries(porEq).sort((a, b) => b[1] - a[1]).map(e => e[0] + ' ' + e[1]).join(', '));
        }
        console.log('\nCLASSIFICAÇÃO (1 jogo por par, mando alternado; jogos de ' + MINUTOS + ' min de relógio):');
        console.log('   #  time                  forca  J   V  E  D   GP  GC   SG  Pts | casa: J Pts GP-GC | fora: J Pts GP-GC');
        linhas.forEach((t, k) => {
            console.log(String(k + 1).padStart(4) + '  ' + t.nome.padEnd(20) + String(forcas[t.nome] || '').padStart(5) + String(t.j).padStart(4) + String(t.v).padStart(5) + String(t.e).padStart(3) + String(t.d).padStart(3) +
                String(t.gp).padStart(5) + String(t.gc).padStart(4) + String((t.gp - t.gc >= 0 ? '+' : '') + (t.gp - t.gc)).padStart(5) + String(t.pts).padStart(5) +
                ' |' + String(t.casa.j).padStart(10) + String(t.casa.pts).padStart(4) + (' ' + t.casa.gp + '-' + t.casa.gc).padStart(7) + ' |' + String(t.fora.j).padStart(10) + String(t.fora.pts).padStart(4) + (' ' + t.fora.gp + '-' + t.fora.gc).padStart(7));
        });
        const sc = linhas.reduce((a, t) => a + t.casa.gp, 0), sf = linhas.reduce((a, t) => a + t.fora.gp, 0), jn = linhas.reduce((a, t) => a + t.casa.j, 0) || 1;
        console.log('   golos por jogo: mandante ' + (sc / jn).toFixed(2) + ' | visitante ' + (sf / jn).toFixed(2));

        // PRIMEIRO E SEGUNDO TURNO lado a lado, e o quanto a ordem se repete (so com 2 turnos).
        if (LIGA_TURNOS >= 2) {
            const porTurno = (t) => {
                const n1 = calendarioDaLiga(LIGA_NOMES.length, 1).length;
                const m = {};
                for (const j of resultados) {
                    if (!j.placar || (t === 1 ? j.i >= n1 : j.i < n1)) continue;
                    for (const [nome, gp, gc] of [[j.equipaA, j.placar.A, j.placar.B], [j.equipaB, j.placar.B, j.placar.A]]) {
                        const x = m[nome] || (m[nome] = { nome: nome, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0 });
                        x.j++; x.gp += gp; x.gc += gc;
                        if (gp > gc) { x.v++; x.pts += 3; } else if (gp === gc) { x.e++; x.pts += 1; } else x.d++;
                    }
                }
                return Object.values(m).sort((a, b) => b.pts - a.pts || (b.gp - b.gc) - (a.gp - a.gc) || b.gp - a.gp);
            };
            const t1 = porTurno(1), t2 = porTurno(2);
            if (t1.length && t1.length === t2.length) {
            const pos1 = {}, pos2 = {};
            t1.forEach((x, k) => pos1[x.nome] = k + 1); t2.forEach((x, k) => pos2[x.nome] = k + 1);
            console.log('\nPRIMEIRO TURNO (19 jogos por time)                          SEGUNDO TURNO (19 jogos por time, mando trocado)');
            console.log('   #  time                  V  E  D   GP-GC  Pts  | pos  time                  V  E  D   GP-GC  Pts');
            for (let k = 0; k < t1.length; k++) {
                const a = t1[k], b = t2[k];
                const fmt = (x) => x.nome.padEnd(20) + String(x.v).padStart(3) + String(x.e).padStart(3) + String(x.d).padStart(3) + (x.gp + '-' + x.gc).padStart(8) + String(x.pts).padStart(5);
                console.log(String(k + 1).padStart(4) + '  ' + fmt(a) + '  | ' + String(k + 1).padStart(3) + '  ' + fmt(b));
            }
            // Correlacao de Spearman entre as posicoes dos dois turnos e diferenca de pontos por time.
            const nomes = Object.keys(pos1), n = nomes.length;
            let d2 = 0, difPts = 0, iguais = 0;
            const pts1 = {}, pts2 = {};
            t1.forEach(x => pts1[x.nome] = x.pts); t2.forEach(x => pts2[x.nome] = x.pts);
            for (const nome of nomes) { const d = pos1[nome] - (pos2[nome] || 0); d2 += d * d; difPts += Math.abs(pts1[nome] - (pts2[nome] || 0)); if (d === 0) iguais++; }
            const rho = 1 - 6 * d2 / (n * (n * n - 1));
            console.log('   mesma posicao nos dois turnos: ' + iguais + ' de ' + n + ' | correlacao das posicoes (Spearman): ' + rho.toFixed(2) + ' | diferenca media de pontos por time entre os turnos: ' + (difPts / n).toFixed(1));
            console.log('   (o mesmo time faz em media ' + (nomes.reduce((a, x) => a + pts1[x], 0) / n).toFixed(1) + ' pontos no 1o turno e ' + (nomes.reduce((a, x) => a + pts2[x], 0) / n).toFixed(1) + ' no 2o)');
            }
        }
    }
    // Resultados: A joga "em casa". So tem sentido em jogos de ~90 min.
    {
        let v = 0, e = 0, d = 0;
        for (const j of resultados) {
            if (!j.placar) continue;
            if (j.placar.A > j.placar.B) v++; else if (j.placar.A === j.placar.B) e++; else d++;
        }
        const t = v + e + d || 1;
        console.log('');
        console.log(`resultados (casa/empate/fora): ${(100 * v / t).toFixed(0)}% / ${(100 * e / t).toFixed(0)}% / ${(100 * d / t).toFixed(0)}%` +
            `   alvo 50 / 26 / 24` + (MINUTOS < 90 ? `   (jogos de ${MINUTOS} min: so indicativo)` : ''));
    }
    console.log('');
    console.log('fora da ficha (não há alvo de futebol real para comparar):');
    console.log(`  matadas no peito      ${m(soma.peitos)} por jogo`);
    console.log(`  |x| dos alas          ${m(soma.largura)} m`);
    console.log(`  tempo parado          ${m(soma.parado)}%`);

    if (!pendencias.length) {
        console.log('\nPENDÊNCIAS: nenhuma.');
        process.exit(0);
    }
    console.log(`\nPENDÊNCIAS (${pendencias.length}):`);
    for (const p of pendencias) console.log('  - ' + p);
    process.exit(2);
}
