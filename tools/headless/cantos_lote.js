/*
CANTOS POR 90, com semente fixa, e o que esta A MONTANTE deles.

O lote de 30 jogos de 9 de Setembro deu 4.34 cantos por jogo (44% do alvo de
9.92), contra 5.46 do lote de 100 da manha e 6.80 duas sessoes antes. Tres
lotes em queda e ninguem atribuiu a queda.

Contar cantos e contar um evento raro. O que esta a montante e tem amostra a
serio:

  1. TODAS as passagens da linha de fundo (canto + tiro de meta), e a fraccao
     que da canto -- ou seja, se o problema e a bola chegar la ou e quem lhe
     toca por ultimo;
  2. o ESTADO do ultimo a tocar (bloqueio, alivio, defesa do guarda-redes,
     passe atrasado) -- e o gesto que produz cantos no futebol a serio;
  3. os quase-cantos: toques de DEFENSOR que mandam a bola na direccao da
     propria linha de fundo e que ficam dentro.

Uso: node tools/headless/cantos_lote.js [segundos] [semente]
     for S in 0 1 2 3; do node tools/headless/cantos_lote.js 600 $S; done
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
OS TRES GESTOS DEFENSIVOS que no futebol a serio produzem cantos: a defesa do
guarda-redes, o bloqueio e o alivio. Envolvem-se as funcoes globais para se
contar quantos ha e como acabam, sem tocar no codigo do jogo.
*/
const gestos = { defesas: {}, espalmada: {}, vel: {}, alivio: { fundo: 0, lateral: 0 } };
const dump = [];
let espalmadasCanto = 0, espalmadaDeuCanto = 0, pendenteEspalmada = -999;
/*
O bloqueio nao regista toque nenhum -- o `executeShotGameplay` poe o REMATADOR
como ultimo a tocar mesmo quando foi o defensor a travar a bola. Marca-se aqui
para se poder ver o que a bola bloqueada acaba por dar.
*/
let bloqueios = 0, ultimoBloqueio = -999, nToques = 0, toquesNoBloqueio = -1;
let bloqueadoDeuFundo = { canto: 0, tiroDeMeta: 0 };
{
    const origBloq = MatchStats.registarRemateBloqueado.bind(MatchStats);
    MatchStats.registarRemateBloqueado = function (team, eq) {
        bloqueios++; ultimoBloqueio = Match.tempoDeJogo; toquesNoBloqueio = nToques;
        return origBloq(team, eq);
    };
    const origAlivio = global.alvoDeAlivio;
    if (origAlivio) {
        global.alvoDeAlivio = function (x, z, dir, C) {
            const a = origAlivio(x, z, dir, C);
            gestos.alivio[a && a.fundo ? 'fundo' : 'lateral']++;
            return a;
        };
    }
}
{
    const origDefesa = global.resolverDefesaGK;
    global.resolverDefesaGK = function (o) {
        const r = origDefesa(o);
        const tipo = o.tipo || 'mergulho';
        gestos.defesas[tipo + '/' + r.resultado] = (gestos.defesas[tipo + '/' + r.resultado] || 0) + 1;
        gestos.vel[tipo] = gestos.vel[tipo] || [];
        gestos.vel[tipo].push(Math.round(o.vChegada || 0));
        /*
        DUMP=ficheiro guarda cada chamada em bruto, para se poder varrer a
        calibracao do GkCatchModel offline sem voltar a correr as partidas.
        */
        if (process.env.DUMP) {
            dump.push([tipo, +(o.vChegada || 0).toFixed(2),
                +(o.extensao || 0).toFixed(3), +(o.altura || 0).toFixed(3),
                o.gk || 50, o.tec || 50, r.resultado].join(','));
        }
        return r;
    };
    const origDestino = global.destinoDaEspalmada;
    global.destinoDaEspalmada = function (o) {
        const d = origDestino(o);
        const chave = d + (o.podeSair ? '' : ' (sem saida)');
        gestos.espalmada[chave] = (gestos.espalmada[chave] || 0) + 1;
        if (d === 'canto') { espalmadasCanto++; pendenteEspalmada = Match.tempoDeJogo; }
        return d;
    };
}

/*
O ESTADO DO ULTIMO A TOCAR, guardado a cada frame enquanto ele ainda se sabe.
O `setupSetPiece` corre depois de o toque ter passado, e nessa altura o jogador
ja mudou de estado -- por isso a leitura tem de ser continua.
*/
let ultimo = null;   // { team, estado, dzLinha }
let anterior = null;
const distLinha = (p) => {
    if (!p || !p.model) return null;
    // metros que faltam a bola/jogador para a linha de fundo que a equipa defende
    return LINHA_FUNDO - p.model.position.z * -p.dirZ;
};

const porEstado = { canto: {}, tiroDeMeta: {} };
let cantos = 0, tirosDeMeta = 0;

const origSetup = Match.setupSetPiece.bind(Match);
Match.setupSetPiece = function (tipo, equipa) {
    if (tipo === 'CORNER_KICK' || tipo === 'GOAL_KICK') {
        const chave = ultimo ? ultimo.estado : '?';
        const alvo = (tipo === 'CORNER_KICK') ? porEstado.canto : porEstado.tiroDeMeta;
        alvo[chave] = (alvo[chave] || 0) + 1;
        // Veio de um remate bloqueado sem mais ninguem lhe ter tocado?
        // <= 1 toque desde o corte: o proprio bloqueador ja conta como toque
        // desde que a atribuicao foi arranjada.
        if (nToques - toquesNoBloqueio <= 1 && Match.tempoDeJogo - ultimoBloqueio < 8) {
            bloqueadoDeuFundo[tipo === 'CORNER_KICK' ? 'canto' : 'tiroDeMeta']++;
        }
        if (tipo === 'CORNER_KICK') cantos++; else tirosDeMeta++;
        if (tipo === 'CORNER_KICK' && Match.tempoDeJogo - pendenteEspalmada < 5) {
            espalmadaDeuCanto++; pendenteEspalmada = -999;
        }
    }
    return origSetup(tipo, equipa);
};

/*
QUASE-CANTOS: um DEFENSOR toca a bola e ela sai a andar para a propria linha de
fundo. Conta-se o toque e conta-se se acabou mesmo por sair. A diferenca entre
os dois e o que o jogo esta a perder.
*/
let toquesDefesaParaTras = 0, dosQuaisSairam = 0;
let pendente = null;

const proprioLadoDe = (p) => p ? -p.dirZ : 0;   // sinal da linha que ele defende

for (let i = 0; i < Math.round(segundos / dt); i++) {
    const estadoAntes = Match.state;
    Match.update(dt);

    const p = Match.lastTouchedPlayer;
    if (p && p !== anterior) {
        anterior = p; nToques++;
        ultimo = {
            team: p.team,
            estado: (p.fsm && p.fsm.currentState) || '?',
            dz: distLinha(p),
        };
        /*
        Toque de quem defende, com a bola a caminhar para a propria linha de
        fundo: e o gesto que gera cantos.
        */
        const bolaParaTras = Match.ballVel &&
            (Match.ballVel.z * proprioLadoDe(p) > 1.0);
        const noProprioTerco = p.model && (p.model.position.z * proprioLadoDe(p) > 15);
        if (bolaParaTras && noProprioTerco) {
            toquesDefesaParaTras++;
            pendente = { t: Match.tempoDeJogo, team: p.team };
        }
    }
    if (pendente && Match.state !== 'PLAY' && estadoAntes === 'PLAY' &&
        Match.tempoDeJogo - pendente.t < 6) {
        if (Match.state === 'CORNER_KICK') dosQuaisSairam++;
        pendente = null;
    }
    if (pendente && Match.tempoDeJogo - pendente.t > 6) pendente = null;
}

const min = Match.tempoDeJogo / 60;
const por90 = (n) => (n * 90 / min).toFixed(2);
const linhaFundo = cantos + tirosDeMeta;
console.log(`semente ${semente}  |  cantos ${por90(cantos).padStart(6)}/90  ` +
    `tiros de meta ${por90(tirosDeMeta).padStart(6)}  |  ` +
    `linha de fundo ${por90(linhaFundo).padStart(6)}  ` +
    `(${linhaFundo ? (100 * cantos / linhaFundo).toFixed(0) : '-'}% dao canto)`);
console.log(`            golos ${por90(MatchStats.TeamA.remates.golos + MatchStats.TeamB.remates.golos)}` +
    `  remates ${por90(MatchStats.TeamA.remates.tentados + MatchStats.TeamB.remates.tentados)}` +
    `  bloqueados ${por90(MatchStats.TeamA.bloqueiosFeitos + MatchStats.TeamB.bloqueiosFeitos)}` +
    `  xG ${((MatchStats.TeamA.xg + MatchStats.TeamB.xg) * 90 / min).toFixed(2)}`);
console.log(`            toques de defensor para a propria linha ` +
    `${por90(toquesDefesaParaTras).padStart(7)}/90, ` +
    `${dosQuaisSairam} deram canto`);

const tabela = (nome, obj) => {
    const linhas = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    if (!linhas.length) return;
    console.log(`  ${nome}: ` + linhas.map(([k, v]) => `${k} ${v}`).join('  '));
};
console.log(`            bloqueios ${bloqueios}, dos quais para la da linha: ` +
    `${bloqueadoDeuFundo.canto} canto / ${bloqueadoDeuFundo.tiroDeMeta} tiro de meta`);
console.log(`            espalmadas para canto ${espalmadasCanto}, deram canto ${espalmadaDeuCanto}`);
console.log(`            alivios: ${gestos.alivio.fundo} para a linha de fundo, ` +
    `${gestos.alivio.lateral} para a lateral`);
tabela('defesas do guarda-redes      ', gestos.defesas);
{
    const med = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
    const l = Object.entries(gestos.vel).map(([k, v]) => `${k} n=${v.length} v=${med(v)}`);
    if (l.length) console.log('  velocidade de chegada         : ' + l.join('  '));
}
tabela('destino da espalmada        ', gestos.espalmada);
tabela('ultimo toque nos cantos      ', porEstado.canto);
tabela('ultimo toque nos tiros de meta', porEstado.tiroDeMeta);

if (process.env.DUMP) {
    const cab = 'tipo,v,extensao,altura,gk,tec,resultado';
    require('fs').writeFileSync(process.env.DUMP,
        [cab].concat(dump).join(String.fromCharCode(10)) + String.fromCharCode(10));
}
