/*
PORQUE É QUE NINGUÉM ENTRA NA GRANDE ÁREA.

Medido em `area_entradas.js`: com a bola no último terço há 0.7-0.9 atacantes
dentro da área adversária e, no instante em que a bola lá entra, 1.2-1.4
atacantes contra 2.0-2.5 defensores. O real é 3-5 contra 5-7. Ninguém lá está,
dos DOIS lados — e é essa simetria que aponta a causa: se os defensores não
recuam para dentro da própria área, a linha de fora-de-jogo que eles desenham
também não deixa entrar quem ataca.

O suspeito está escrito no `blocoDoTime` (team_bt.js):

    const minZArea = -(fundo - profArea);          // -36.5, a linha da área
    const minZ = Math.max(pisoFundo, Math.min(minZArea, bolaZDir - folgaBola));

A traseira do bloco só passa a linha da própria área quando a BOLA já lá está
dentro. Com a bola a 25 m da baliza — que é de onde se cruza — o bloco não pode
recuar, e a última linha fica na borda da área.

Mede-se, por frame, com a bola no último terço de quem ataca:

  - a traseira do bloco de quem defende, em metros da própria linha de fundo;
  - o defensor mais recuado (sem o guarda-redes), que é a linha de fora-de-jogo;
  - o atacante mais avançado;
  - quantos de cada lado estão dentro da área.

Uso: node tools/headless/linha_na_area.js [segundos] [semente]
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

/*
Varrimento: FOLGA=<metros> sobrepoe `BlockShape.folgaAtrasDaBola` para se poder
medir o efeito do piso sem tocar no config de producao.
*/
if (process.env.FOLGA) BlockShape.folgaAtrasDaBola = Number(process.env.FOLGA);
// MOLA=0 desliga a mola de coesao, para se ver quanto do recuo do avancado e dela.
if (process.env.MOLA !== undefined) {
    MolaDeCoesao.forcaComBola = Number(process.env.MOLA);
    MolaDeCoesao.forcaSemBola = Number(process.env.MOLA);
}

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const med = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : 0;
const f1 = (a) => med(a).toFixed(1);

/*
As leituras são agrupadas pela distância da BOLA à baliza atacada, porque é
essa que manda no bloco. A faixa 16.5-25 m é a do cruzamento: a bola já está no
último terço mas ainda não entrou na área.
*/
const faixas = [
    { nome: 'bola 25-35 m da baliza', min: 25, max: 35 },
    { nome: 'bola 16.5-25 m (cruza)', min: 16.5, max: 25 },
    { nome: 'bola DENTRO da area  ', min: 0, max: 16.5 }
];
for (const f of faixas) {
    f.traseira = []; f.ultimoDefesa = []; f.maisAvancado = [];
    f.defsNaArea = []; f.atksNaArea = [];
    // Quem manda no avancado: a frente do bloco, a linha de fora-de-jogo, ou
    // o alvo que lhe escreveram. Tudo em metros da linha de fundo atacada.
    f.frenteBloco = []; f.linhaAtk = []; f.linhaOffside = []; f.alvoAvancado = [];
    f.posDoAlvo = []; f.estados = {}; f.velDoAlvo = [];
    /*
    POR POSICAO, sem o vies do argmax: escolher "o alvo mais adiantado" escolhe
    justamente quem tem alvo mais ambicioso, e o desvio dele nao representa
    ninguem. Aqui e o mesmo posto sempre.
    */
    f.porPos = {};
}

const jogadoresDe = (team) => (team === 'TeamA') ? Match.players : Match.opponents;

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);

    const portador = Match.ballCarrier || Match.lastTouchedPlayer;
    if (!portador || !portador.model) continue;
    const atk = portador.team;
    const def = (atk === 'TeamA') ? 'TeamB' : 'TeamA';
    const dirAtk = portador.dirZ;
    const b = Match.ball.position;

    // Distância da bola à linha de fundo que está a ser atacada.
    const distBola = LINHA_FUNDO - b.z * dirAtk;
    if (distBola > 35 || distBola < 0) continue;
    /*
    SO JOGO CORRIDO. Fora do PLAY a gente esta colocada a mao pelo lance
    (SET_PIECE_WAIT dava ate 54% das leituras) e nada disto mede decisao.
    */
    if (typeof Match.state === 'string' && Match.state !== 'PLAY') continue;

    const faixa = faixas.find(f => distBola >= f.min && distBola < f.max);
    if (!faixa) continue;

    const alvoZ = dirAtk * LINHA_FUNDO;
    const naArea = (p) => Area.contem(p.model.position.x, p.model.position.z, alvoZ);
    // Profundidade medida da linha de fundo atacada: 0 = em cima da linha.
    const prof = (p) => LINHA_FUNDO - p.model.position.z * dirAtk;

    const defesas = jogadoresDe(def).filter(p => p && p.model && p.role !== 'gk');
    const atacantes = jogadoresDe(atk).filter(p => p && p.model && p.role !== 'gk');
    if (!defesas.length || !atacantes.length) continue;

    // O defensor mais recuado é a linha de fora-de-jogo.
    faixa.ultimoDefesa.push(Math.min(...defesas.map(prof)));
    faixa.maisAvancado.push(Math.min(...atacantes.map(prof)));
    faixa.defsNaArea.push(defesas.filter(naArea).length);
    faixa.atksNaArea.push(atacantes.filter(naArea).length);

    /*
    QUEM MANDA NO AVANCADO. Le-se o bloco de quem ATACA (a frente dele e o
    tecto de posicionamento), a linha de fora-de-jogo publicada, e o alvo
    escrito ao avancado mais adiantado. A fase que estiver mais atras e a que
    o esta a segurar.
    */
    const bbAtk = (typeof TeamAI !== 'undefined') ? TeamAI.blackboards[atk] : null;
    if (bbAtk && bbAtk.bloco) {
        faixa.frenteBloco.push(LINHA_FUNDO - Math.max(bbAtk.bloco.z0, bbAtk.bloco.z1));
        faixa.linhaAtk.push(LINHA_FUNDO - bbAtk.bloco.zAtk);
    }
    if (bbAtk && typeof bbAtk.offsideLimitDir === 'number') {
        faixa.linhaOffside.push(LINHA_FUNDO - bbAtk.offsideLimitDir);
    }
    {
        /*
        O mais adiantado por ALVO, nao por posicao: e o alvo que revela a
        decisao. E guarda-se a posicao DELE, nao a do mais adiantado em campo —
        senao comparam-se dois jogadores diferentes e o desvio e ficcao.
        */
        let melhor = null, delePos = null, deleEstado = null, deleVel = 0;
        for (const p of atacantes) {
            if (!p.dynamicTarget) continue;
            // O portador tem alvo proprio e nao esta a ocupar a area: fora.
            if (p === Match.ballCarrier) continue;
            const d = LINHA_FUNDO - p.dynamicTarget.z * dirAtk;
            if (melhor === null || d < melhor) {
                melhor = d;
                delePos = LINHA_FUNDO - p.model.position.z * dirAtk;
                deleEstado = p.fsm ? p.fsm.currentState : '?';
                // Velocidade a que ele vai, para separar "vai a caminho" de "esta parado".
                deleVel = (p.velocidadeActual !== undefined) ? p.velocidadeActual
                    : (p.velocity ? Math.hypot(p.velocity.x, p.velocity.z) : -1);
            }
        }
        if (melhor !== null) {
            faixa.alvoAvancado.push(melhor);
            faixa.posDoAlvo.push(delePos);
            faixa.estados[deleEstado] = (faixa.estados[deleEstado] || 0) + 1;
            faixa.velDoAlvo.push(deleVel);
        }
    }

    for (const p of atacantes) {
        if (!p.dynamicTarget || p === Match.ballCarrier) continue;
        const r = faixa.porPos[p.pos] || (faixa.porPos[p.pos] = {
            alvo: [], pos: [], area: 0, n: 0, noClamp: 0, comClamp: 0,
            slot: [], estilo: [], tactico: []
        });
        r.alvo.push(LINHA_FUNDO - p.dynamicTarget.z * dirAtk);
        /*
        AS QUATRO SONDAS que ja existem no team_bt.js, na ordem em que correm:
          slotTarget      o slot puro do bloco (anel grande)
          postoBase       depois do playing style
          tacticalTarget  depois da marcacao/mola/tecto, ja alisado
          dynamicTarget   o que o nivel 3 usa mesmo
        A fase que somar metros e a que esta a segurar o avancado.
        */
        if (p.slotTarget) r.slot.push(LINHA_FUNDO - p.slotTarget.z * dirAtk);
        if (p.postoBase) r.estilo.push(LINHA_FUNDO - p.postoBase.z * dirAtk);
        if (p.tacticalTarget) r.tactico.push(LINHA_FUNDO - p.tacticalTarget.z * dirAtk);
        r.pos.push(prof(p));
        if (naArea(p)) r.area++;
        r.n++;
        /*
        O CLAMP ESTA A MORDER? O TeamBT escreve
            maxLegalZDir = offsideLimitDir - 0.5 + offsideBias
        e corta o alvo a esse valor. Se o alvo estiver EM CIMA desse numero, foi
        o fora-de-jogo que o pos ali e nao a decisao de ataque.
        */
        if (bbAtk && typeof bbAtk.offsideLimitDir === 'number') {
            r.comClamp++;
            const maxLegal = bbAtk.offsideLimitDir - 0.5 + (p.offsideBias || 0);
            if (Math.abs(p.dynamicTarget.z * dirAtk - maxLegal) < 0.15) r.noClamp++;
        }
    }

    // A traseira do bloco de quem defende, tal como o nível 1 a calculou.
    const bbDef = (typeof TeamAI !== 'undefined') ? TeamAI.blackboards[def] : null;
    const bloco = bbDef && bbDef.bloco;
    if (bloco) {
        // z0/z1 vêm no referencial de ataque DELES; a traseira é a que está
        // mais perto da baliza que defendem.
        /*
        z0/z1 estao no referencial de ataque DE QUEM DEFENDE: +z e a baliza
        adversaria deles. A traseira (a baliza que defendem) e o z0, e a
        distancia a essa linha e LINHA_FUNDO + z0.
        */
        faixa.traseira.push(LINHA_FUNDO + Math.min(bloco.z0, bloco.z1));
    }
}

console.log(`\n${(Match.tempoDeJogo / 60).toFixed(0)} min de relogio (semente ${semente})`);
console.log('\nTudo em metros da LINHA DE FUNDO ATACADA (0 = em cima da linha).');
console.log('A grande area vai da linha aos 16.5 m.\n');
console.log('                            traseira   ultimo   mais      defs      atks');
console.log('                            do bloco   defesa   avancado  na area   na area');
for (const f of faixas) {
    if (!f.ultimoDefesa.length) { console.log(`  ${f.nome}   (sem leituras)`); continue; }
    console.log(`  ${f.nome}  ` +
        `${f1(f.traseira).padStart(7)}  ` +
        `${f1(f.ultimoDefesa).padStart(7)}  ` +
        `${f1(f.maisAvancado).padStart(8)}  ` +
        `${f1(f.defsNaArea).padStart(8)}  ` +
        `${f1(f.atksNaArea).padStart(8)}   (n=${f.ultimoDefesa.length})`);
}
console.log('\n  real, com a bola na faixa do cruzamento: ultimo defesa a ~6-10 m,');
console.log('  5-7 defensores e 3-5 atacantes dentro da area.');

/*
QUEM SEGURA O AVANÇADO. As três coisas que lhe podem pôr um tecto — a frente do
rectângulo, a linha de ataque dele dentro do rectângulo, e a linha de
fora-de-jogo — lado a lado com o alvo que lhe escreveram e com onde ele está.
A que estiver mais ATRÁS (número maior) é a que manda.
*/
console.log('\nQUEM SEGURA O AVANCADO (metros da linha de fundo atacada;');
console.log('a fase mais ATRAS e a que manda)\n');
console.log('                            frente    linha    linha      alvo do   ele');
console.log('                            do bloco  ataque   offside    avancado  esta a');
for (const f of faixas) {
    if (!f.alvoAvancado.length) { console.log(`  ${f.nome}   (sem leituras)`); continue; }
    console.log(`  ${f.nome}  ` +
        `${f1(f.frenteBloco).padStart(7)}  ` +
        `${f1(f.linhaAtk).padStart(7)}  ` +
        `${f1(f.linhaOffside).padStart(8)}  ` +
        `${f1(f.alvoAvancado).padStart(9)}  ` +
        `${f1(f.posDoAlvo).padStart(7)}` +
        `   (atras do proprio alvo: ${(med(f.posDoAlvo) - med(f.alvoAvancado)).toFixed(1)} m)`);
    const est = Object.entries(f.estados).sort((a, b) => b[1] - a[1]).slice(0, 4);
    console.log('        estado dele: ' + est.map(([k, v]) =>
        `${k} ${(100 * v / f.posDoAlvo.length).toFixed(0)}%`).join('  ') +
        `   |  velocidade ${f1(f.velDoAlvo)} m/s`);
}
console.log('\nPOR POSICAO, com a bola na faixa do cruzamento (16.5-25 m)');
console.log('  pos    alvo dele   ele esta a   atras do alvo   % do tempo na area');
{
    const f = faixas[1];
    const linhas = Object.entries(f.porPos).sort((a, b) => med(a[1].alvo) - med(b[1].alvo));
    for (const [pos, r] of linhas) {
        console.log(`  ${pos.padEnd(5)}  ${f1(r.alvo).padStart(8)}  ${f1(r.pos).padStart(11)}  ` +
            `${(med(r.pos) - med(r.alvo)).toFixed(1).padStart(13)}  ` +
            `${(100 * r.area / Math.max(1, r.n)).toFixed(0).padStart(16)}%` +
            `   alvo colado ao fora-de-jogo: ` +
            `${(100 * r.noClamp / Math.max(1, r.comClamp)).toFixed(0)}%`);
    }
}
console.log('AS FASES DO ALVO, com a bola na faixa do cruzamento');
console.log('(metros da linha de fundo atacada; a fase que SOMA metros e a que segura)');
console.log('  pos    slot    +estilo   +marcacao/mola   alvo final   ele esta a');
{
    const f = faixas[1];
    const ordem = ['CF', 'RM', 'LM', 'CM', 'RB', 'LB', 'CB'];
    for (const pos of ordem) {
        const r = f.porPos[pos];
        if (!r || !r.slot.length) continue;
        console.log(`  ${pos.padEnd(5)}  ${f1(r.slot).padStart(5)}  ${f1(r.estilo).padStart(7)}  ` +
            `${f1(r.tactico).padStart(14)}  ${f1(r.alvo).padStart(11)}  ${f1(r.pos).padStart(11)}`);
    }
}
console.log('');
