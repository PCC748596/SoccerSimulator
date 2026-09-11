/*
=============================================================================
SIMULAÇÃO EM LOTE — correr jogos sem ecrã, medir em vez de ver
=============================================================================
Conduz Match.update(dt) directamente, sem passar por requestAnimationFrame
nem por renderer.render(). Corre dentro da mesma página (não em Node): o
jogo já está cheio de document.createElement/getElementById espalhados por
match.js/player.js, e replicar isso num DOM falso seria muito mais trabalho
do que aproveitar o browser que já lá está.

Enquanto Sim.running é true, main.js->animate() salta o Match.update() e o
render() (ver a guarda lá) para não haver dois "donos" do tick ao mesmo
tempo nem gasto de GPU à toa.

Uso (consola do browser, ou o botão "Simulação rápida" do painel):
    Sim.run({ jogos: 10, duracaoSeg: 120 })

No fim, descarrega um .json com o resumo de MatchStats de cada jogo e um
heatmap de posições (grelha 2m) por equipa.
=============================================================================
*/

function criarHeatmap(cellSize) {
    cellSize = cellSize || 2;
    const nx = Math.ceil(CAMPO_LARG / cellSize) + 2;
    const nz = Math.ceil(CAMPO_COMP / cellSize) + 2;
    return {
        cellSize: cellSize,
        nx: nx,
        nz: nz,
        TeamA: new Array(nx * nz).fill(0),
        TeamB: new Array(nx * nz).fill(0)
    };
}

function heatmapIndex(hm, x, z) {
    const ix = Math.round((x + CAMPO_LARG / 2) / hm.cellSize);
    const iz = Math.round((z + CAMPO_COMP / 2) / hm.cellSize);
    if (ix < 0 || ix >= hm.nx || iz < 0 || iz >= hm.nz) return -1;
    return iz * hm.nx + ix;
}

function registarHeatmap(hm) {
    const registar = (lista, key) => {
        for (const p of lista) {
            const idx = heatmapIndex(hm, p.model.position.x, p.model.position.z);
            if (idx >= 0) hm[key][idx]++;
        }
    };
    registar(Match.players, 'TeamA');
    registar(Match.opponents, 'TeamB');
}

// Devolve uma promessa que resolve no próximo "tick" do browser — usado
// para ceder o controlo entre lotes de passos e a página não gelar.
function cederAoBrowser() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/*
DESVIO DO ALVO POR ESTADO — quão longe do slot do bloco está o ponto para
onde cada jogador está mesmo a ir (`dynamicTarget` contra `slotTarget`, os
anéis maior e médio do debug).

Existe por causa das linhas enormes vistas no ecrã: um desvio de 10 m tem
explicação (marcação, estilo), um de 30 m não tem, e sem separar por estado
não se sabe se vem do chaser a ir à bola — onde é normal — ou de quem devia
estar quieto na posição.
*/
function criarDesvioStats() { return {}; }

function registarDesvios(stats, lista) {
    for (const p of lista) {
        if (!p || !p.slotTarget || !p.dynamicTarget || !p.fsm) continue;
        const estado = p.fsm.currentState;
        let st = stats[estado];
        if (!st) st = stats[estado] = { n: 0, soma: 0, soma2: 0, max: 0, maxPos: null };

        const d = Math.hypot(
            p.dynamicTarget.x - p.slotTarget.x,
            p.dynamicTarget.z - p.slotTarget.z);

        st.n++;
        st.soma += d;
        st.soma2 += d * d;
        if (d > st.max) {
            st.max = d;
            st.maxPos = p.pos;
        }
    }
}

/*
PERMANÊNCIA NUM ESTADO DA FSM — quanto tempo SEGUIDO cada jogador lá fica.

O contador de frames por estado (registarDesvios) diz o tempo TOTAL e não
distingue dois casos opostos: mil entradas curtas ou uma entrada presa. Foi
essa ambiguidade que travou a leitura do CHEST_CONTROL, com 1 006 032 frames
num lote de 20 jogos — que tanto pode ser a bola a repicar sem parar na faixa
do peito como dois jogadores congelados no gesto.

Aqui mede-se cada episódio: quantos houve, quanto durou o médio e quanto durou
o mais longo. Um estado com duração máxima muito acima da duração do gesto que
o define (peitoDur = 0.55 s no caso do peito) está preso, e a média perto dessa
duração diz que a saída normal funciona.

Não leva o gate de `nivel2Activo()` que o desvio leva: é justamente com o jogo
parado que interessa ver quem não sai do sítio.
*/
function criarPermanenciaStats() {
    return { abertos: new Map(), porEstado: {} };
}

function fecharEpisodio(stats, ep) {
    let st = stats.porEstado[ep.estado];
    if (!st) st = stats.porEstado[ep.estado] = { n: 0, soma: 0, max: 0, posDoMax: null };
    st.n++;
    st.soma += ep.tempo;
    if (ep.tempo > st.max) { st.max = ep.tempo; st.posDoMax = ep.pos; }
}

function registarPermanencia(stats, lista, dt) {
    for (const p of lista) {
        if (!p || !p.fsm) continue;
        /*
        O GUARDA-REDES FICA DE FORA, e não por desinteresse: a FSM dele só
        corre quando tem a bola nas mãos (ver updateGK, js/player.js) — o resto
        do tempo é o `gkEstado` que manda e o `currentState` fica congelado no
        último valor que teve. Medi-lo aqui dava um episódio do tamanho do jogo
        inteiro (900 s em MOVE_TO_POS) que não é um jogador parado, é um campo
        que ninguém escreve. Contado junto com os outros, esse falso positivo
        tapava sempre o maior episódio verdadeiro.
        */
        if (p.role === 'gk') continue;
        const estado = p.fsm.currentState;
        let ep = stats.abertos.get(p);
        if (!ep || ep.estado !== estado) {
            if (ep) fecharEpisodio(stats, ep);
            ep = { estado: estado, tempo: 0, pos: `${p.team} ${p.pos}` };
            stats.abertos.set(p, ep);
        }
        ep.tempo += dt;
    }
}

/*
Fecha os episódios ainda a decorrer. Tem de correr no fim de cada jogo: o
episódio aberto é precisamente o candidato a estar preso, e deixá-lo de fora
apagava o caso que se quer ver.
*/
function fecharPermanencias(stats) {
    for (const ep of stats.abertos.values()) fecharEpisodio(stats, ep);
    stats.abertos.clear();
}

function resumirPermanencia(stats) {
    const linhas = [];
    for (const estado in stats.porEstado) {
        const st = stats.porEstado[estado];
        if (!st.n) continue;
        linhas.push({
            estado: estado,
            episodios: st.n,
            duracaoMediaS: +(st.soma / st.n).toFixed(2),
            duracaoMaxS: +st.max.toFixed(1),
            tempoTotalS: +st.soma.toFixed(0),
            posicaoDoMax: st.posDoMax
        });
    }
    linhas.sort((a, b) => b.duracaoMaxS - a.duracaoMaxS);
    return linhas;
}

/*
`amostragem` é o intervalo com que os desvios foram medidos (1 = todos os
frames). Entra aqui para o `frames` do relatório continuar a querer dizer
FRAMES: com amostragem 6, `st.n` são leituras de 6 em 6, e publicá-lo como
frames dividia o número por seis sem nada a dizê-lo. As médias e o RMS não
precisam da correcção — são razões, e o factor cancela-se.
*/
function resumirDesvios(stats, amostragem) {
    const passo = Math.max(1, amostragem || 1);
    const linhas = [];
    for (const estado in stats) {
        const st = stats[estado];
        if (!st.n) continue;
        linhas.push({
            estado: estado,
            frames: st.n * passo,
            amostras: st.n,
            desvioMedioM: +(st.soma / st.n).toFixed(2),
            desvioRmsM: +Math.sqrt(st.soma2 / st.n).toFixed(2),
            desvioMaxM: +st.max.toFixed(2),
            posicaoDoMax: st.maxPos
        });
    }
    linhas.sort((a, b) => b.desvioMaxM - a.desvioMaxM);
    return linhas;
}

/*
=============================================================================
CALIBRAÇÃO DE PLAYING STYLES — dispara mesmo? move de forma coerente?
=============================================================================
Uma chave por (estilo, posição) — o mesmo estilo calibra diferente consoante
a posição que o usa (ex.: creative_playmaker em SS não é o mesmo problema que
em RM). Em vez de guardar cada amostra (centenas de milhares de frames por
jogo), acumula-se soma e soma-dos-quadrados de dx/dz — dá média e desvio
padrão no fim sem gastar memória com o histórico completo.

desvio-padrão ~0 com ativações > 0 = SUSPEITO: o estilo liga mas o alvo não
sai do sítio (caso encontrado do `juntaSeAoAtaque`, que só emite evento e não
mexe em commit()).
=============================================================================
*/
function criarEstiloStats() {
    return {};
}

function chaveEstilo(p) {
    return p.playingStyle + '|' + p.pos;
}

function registarEstilos(stats, lista) {
    for (const p of lista) {
        if (p.role === 'gk' || !p.playingStyle || !p.slotTarget || !p.dynamicTarget) continue;

        const key = chaveEstilo(p);
        let st = stats[key];
        if (!st) {
            st = stats[key] = {
                style: p.playingStyle, pos: p.pos,
                framesAtivo: 0, framesTotal: 0, ativacoes: 0,
                dxSum: 0, dzSum: 0, dx2Sum: 0, dz2Sum: 0,
                offMax: 0,
                totX2Sum: 0, totZ2Sum: 0, totMax: 0
            };
        }

        st.framesTotal++;
        const ativo = !!p.styleAtivo && !p.playingStyleDesligado;
        // Estado anterior por JOGADOR, não pela chave partilhada — dois
        // jogadores (um por equipa) caem na mesma chave (estilo+posição) e,
        // se o "anterior" vivesse na chave, o segundo jogador processado no
        // frame pisava o estado do primeiro: toda leitura parecia transição.
        if (ativo && !p._estiloStatsPrevAtivo) st.ativacoes++;
        p._estiloStatsPrevAtivo = ativo;
        if (!ativo) continue;

        st.framesAtivo++;

        /*
        DOIS deslocamentos, e a diferença entre eles é o ponto todo.

        `styleTarget` é o posto DEPOIS do estilo e ANTES da marcação (o
        postoBase do PosicionamentoAI); `dynamicTarget` é o alvo final, com
        marcação, inquietação, tecto e alisamento por cima. Enquanto se media
        só o final contra o slot, um estilo que não fizesse nada aparecia com
        metros de deslocamento — os metros eram da marcação — e o `semEfeito`
        nunca disparava. O estilo mede-se pelo styleTarget.
        */
        const alvoEstilo = p.styleTarget || p.dynamicTarget;
        const dx = alvoEstilo.x - p.slotTarget.x;
        const dz = alvoEstilo.z - p.slotTarget.z;
        st.dxSum += dx; st.dzSum += dz;
        st.dx2Sum += dx * dx; st.dz2Sum += dz * dz;
        const off = Math.hypot(dx, dz);
        if (off > st.offMax) st.offMax = off;

        const tdx = p.dynamicTarget.x - p.slotTarget.x;
        const tdz = p.dynamicTarget.z - p.slotTarget.z;
        st.totX2Sum += tdx * tdx; st.totZ2Sum += tdz * tdz;
        const tot = Math.hypot(tdx, tdz);
        if (tot > st.totMax) st.totMax = tot;
    }
}

// Liga o estilo em toda a gente (o padrão vem desligado — match.js
// aplicarPlayingStyle) e devolve os valores antigos, para repor no fim.
function forcarEstilosLigados() {
    const anteriores = [];
    const todos = [].concat(Match.players || [], Match.opponents || []);
    for (const p of todos) {
        anteriores.push([p, p.playingStyleDesligado]);
        p.playingStyleDesligado = false;
    }
    return anteriores;
}

function restaurarEstilos(anteriores) {
    for (const [p, valor] of anteriores) p.playingStyleDesligado = valor;
}

/*
=============================================================================
COBERTURA FORÇADA — os 21 estilos, independente da formação do painel
=============================================================================
Nenhuma formação sozinha (442/433/4231, ver FormationsData) tem as 12
posições de campo distintas ao mesmo tempo (só cabem 10 jogadores fora o
GR) — logo nenhuma tem espaço para os 21 estilos de uma vez. A solução é
GIRAR as 3 formações ao longo do lote de jogos e, para cada uma, forçar
`playingStyleFixo` nos jogadores da posição certa (respeitado por
aplicarPlayingStyle em match.js — só cai no omisso se o fixo for inválido).

`SS` nunca aparece em nenhuma FormationsData, mas nenhum estilo depende
SÓ de SS (todos que a listam também servem AM/CM/LM/RM/LW/RW) — por isso
os 19 estilos de campo (exclui offensive_gk/defensive_gk, que não passam
por aqui — o GR tem ciclo de posicionamento próprio) são sempre alcançáveis
nalguma das 3 formações.

Se `filas` não esvaziar dentro de `opts.jogos`, o styles que sobrarem
ficam por testar nesta corrida — o aviso final (Sim.run) já assinala quem
nunca ativou.
=============================================================================
*/
const FORM_CYCLE = ['442', '433', '4231'];

function construirPlanoCobertura() {
    const planosPorFormacao = {};
    for (const forma of FORM_CYCLE) {
        const fData = FormationsData[forma];
        if (!fData) continue;
        const contagem = {};
        const porPos = {};
        fData.forEach((f, idx) => {
            if (f.role === 'gk') return;
            const idxPos = contagem[f.pos] || 0;
            contagem[f.pos] = idxPos + 1;
            (porPos[f.pos] = porPos[f.pos] || []).push(idx);
        });
        planosPorFormacao[forma] = porPos;
    }

    const filas = {}; // chave "forma|pos" -> fila de estilos por colocar
    const semFormacao = [];
    for (const chave in PlayingStyles) {
        if (chave.indexOf('_gk') >= 0) continue;
        const def = PlayingStyles[chave];
        let colocado = false;
        for (const pos of (def.posicoes || [])) {
            for (const forma of FORM_CYCLE) {
                if (planosPorFormacao[forma] && planosPorFormacao[forma][pos]) {
                    const key = forma + '|' + pos;
                    (filas[key] = filas[key] || []).push(chave);
                    colocado = true;
                    break;
                }
            }
            if (colocado) break;
        }
        if (!colocado) semFormacao.push(chave);
    }
    if (semFormacao.length) {
        console.warn('Sim: estilos sem posição em nenhuma formação, não calibráveis por rotação:', semFormacao.join(', '));
    }
    return { planosPorFormacao, filas };
}

// Aplica, para a formação escolhida NESTE jogo, um estilo pendente da fila
// a cada slot disponível daquela posição (nas duas equipas). `originais`
// guarda o valor de playingStyleFixo de cada jogador ANTES da primeira vez
// que esta calibração lhe mexeu — para repor no fim, mesmo que o mesmo
// jogador seja reescrito em vários jogos do lote.
function aplicarCoberturaNoJogo(plano, forma, originais) {
    const porPos = plano.planosPorFormacao[forma];
    if (!porPos) return;

    for (const pos in porPos) {
        const fila = plano.filas[forma + '|' + pos];
        if (!fila || !fila.length) continue;
        for (const idx of porPos[pos]) {
            if (!fila.length) break;
            const estilo = fila.shift();
            for (const p of [Match.players[idx], Match.opponents[idx]]) {
                if (!p) continue;
                if (!originais.has(p)) originais.set(p, p.playingStyleFixo);
                p.playingStyleFixo = estilo;
            }
        }
    }
}

// Resumo final: desvio padrão de dx/dz (mede se o alvo varia ou fica preso
// no mesmo desvio) e RMS do deslocamento (mede se o estilo desloca alguma
// coisa). Marca `semEfeito` quando ativa mas não desloca (>0 ativações, RMS
// desprezável) — sinal de flag sem código de posicionamento por trás.
/*
O estilo tem sequer algum campo que MOVA o jogador? Se nao tiver, um
deslocamento de zero e o comportamento correcto e nao um contador morto.
Os campos sao os que o `aplicarEstiloPosicional` (playing_styles.js) le.
*/
const CAMPOS_POSICIONAIS = ['avanco', 'avancoComBola', 'largura', 'amplitudeZ',
    'colaNaLinha', 'fechaComBolaCentral', 'cortaParaDentro', 'dentroArea',
    'travaNaEntradaArea'];

function estiloDeslocaPorDefinicao(chave) {
    const def = (typeof PlayingStyles !== 'undefined') ? PlayingStyles[chave] : null;
    if (!def) return true;   // desconhecido: nao se assume que esta certo
    if (def.defensivo && def.defensivo.recuo) return true;
    return CAMPOS_POSICIONAIS.some(c => def[c]);
}

/*
=============================================================================
MEDIA POR JOGO CONTRA OS ALVOS
=============================================================================
Recebe uma ficha `MatchStats.porJogo()` por partida (ja escalada para 90
minutos de relogio e com as duas equipas somadas) e devolve uma linha por
metrica: a media do lote, o alvo, e a percentagem do alvo.

Os alvos e os rotulos vem do `ALVOS_ESTATISTICA` (main.js), que e a unica
fonte deles — duplica-los aqui era garantir que divergiam. Sem essa tabela
carregada (headless, por exemplo) devolve as medias sem coluna de alvo.

`pctDoAlvo` e o numero que se le primeiro: 100 e estar la, 40 e ter menos de
metade dos eventos que um jogo a serio tem.
=============================================================================
*/
function montarMediaPorJogo(fichas) {
    if (!fichas || !fichas.length) return null;
    const validas = fichas.filter(f => f && f.escalado);
    if (!validas.length) return null;

    const tabela = (typeof ALVOS_ESTATISTICA !== 'undefined') ? ALVOS_ESTATISTICA : null;
    const campos = tabela
        ? tabela.map(l => ({ campo: l.campo, rotulo: l.rotulo, alvo: l.alvo, casas: l.casas,
            nota: l.semRegra ? 'sem regra no jogo' : (l.provisorio ? 'alvo provisorio' : '') }))
        : Object.keys(validas[0]).filter(k => typeof validas[0][k] === 'number')
            .map(c => ({ campo: c, rotulo: c, alvo: null, casas: 2, nota: '' }));

    const linhas = [];
    for (const c of campos) {
        const vals = validas.map(f => f[c.campo]).filter(v => typeof v === 'number');
        if (!vals.length) continue;
        const media = vals.reduce((a, b) => a + b, 0) / vals.length;
        const casas = (typeof c.casas === 'number') ? c.casas : 2;
        linhas.push({
            /*
            `campo` alem do rotulo: o rotulo leva emoji, e o JSON exportado
            passa por uma codificacao que os estraga ("â½ Golos"). O campo e
            ASCII e serve para ler a tabela sem depender disso.
            */
            campo: c.campo,
            metrica: c.rotulo,
            medido: Number(media.toFixed(casas)),
            alvo: (typeof c.alvo === 'number') ? c.alvo : null,
            pctDoAlvo: (typeof c.alvo === 'number' && c.alvo > 0)
                ? Number((100 * media / c.alvo).toFixed(0)) : null,
            nota: c.nota
        });
    }
    return linhas;
}

function resumirEstilos(stats) {
    const linhas = [];
    for (const key in stats) {
        const st = stats[key];
        const n = st.framesAtivo || 1;
        const meanDx = st.dxSum / n, meanDz = st.dzSum / n;
        const stdDx = Math.sqrt(Math.max(0, st.dx2Sum / n - meanDx * meanDx));
        const stdDz = Math.sqrt(Math.max(0, st.dz2Sum / n - meanDz * meanDz));
        const rms = Math.sqrt((st.dx2Sum + st.dz2Sum) / n);
        linhas.push({
            estilo: st.style,
            posicao: st.pos,
            ativacoes: st.ativacoes,
            pctTempoAtivo: st.framesTotal ? +(100 * st.framesAtivo / st.framesTotal).toFixed(1) : 0,
            deslocamentoEstiloM: +rms.toFixed(2),
            deslocamentoEstiloMaxM: +st.offMax.toFixed(2),
            deslocamentoTotalM: +Math.sqrt((st.totX2Sum + st.totZ2Sum) / n).toFixed(2),
            deslocamentoTotalMaxM: +st.totMax.toFixed(2),
            desvioPadraoXM: +stdDx.toFixed(2),
            desvioPadraoZM: +stdDz.toFixed(2),
            /*
            `semEfeito` = ligado e nao desloca NADA. Mas ha estilos que nao
            tem, de propria definicao, nenhum campo posicional: o Target Man
            mexe no passe e na cadencia, o Extra Frontman so sobe na BOLA
            PARADA (ver a nota dele em tactics.js). Marcar esses como defeito
            mandava procurar codigo em falta que nao existe — por isso saem
            separados, em `semDeslocacaoPorDesenho`.
            */
            semDeslocacaoPorDesenho: !estiloDeslocaPorDefinicao(st.style),
            semEfeito: st.ativacoes > 0 && rms < 0.3 &&
                estiloDeslocaPorDefinicao(st.style)
        });
    }
    linhas.sort((a, b) => (a.semEfeito === b.semEfeito) ? (a.estilo < b.estilo ? -1 : 1) : (a.semEfeito ? -1 : 1));
    return linhas;
}


/*
=============================================================================
VIGIA DE JOGO ENCRAVADO
=============================================================================
Num lote de 5 jogos, um deles passou ~33 minutos com a bola parada no
meio-campo: 47 passes contra ~200 dos outros, 61 km percorridos contra 160 km,
e 2042 s de posse a somar sem nada acontecer. O relatório dá o SINTOMA e não o
momento, portanto não houve como saber onde começou.

Isto vigia a bola: se ela não se mexer mais do que `raio` durante `segundos`
seguidos de jogo, regista UMA vez o estado completo no momento — quem tem a
bola, em que estado está o Match, o que a FSM de cada jogador está a fazer.

É diagnóstico, não correcção: da próxima vez que acontecer, o relatório traz o
retrato do encrave em vez de só as suas consequências.
=============================================================================
*/
function criarVigia() {
    return {
        raio: 1.5,          // metros que a bola tem de percorrer para "contar"
        segundos: 25,       // tempo parada até se considerar encravada
        pos: null,
        parada: 0,
        registos: []
    };
}

function vigiarEncrave(v, jogo, tempoDeJogo, dt) {
    if (!v || typeof Match === 'undefined' || !Match.ball) return;

    const b = Match.ball.position;
    if (!v.pos) { v.pos = { x: b.x, z: b.z }; return; }

    const d = Math.hypot(b.x - v.pos.x, b.z - v.pos.z);
    if (d > v.raio) {
        v.pos = { x: b.x, z: b.z };
        v.parada = 0;
        v.jaRegistou = false;
        return;
    }

    v.parada += dt;
    if (v.parada < v.segundos || v.jaRegistou) return;
    v.jaRegistou = true;

    // Quem está a fazer o quê, agregado por estado da FSM.
    const porEstado = {};
    for (const p of [...Match.players, ...Match.opponents]) {
        const e = (p.fsm && p.fsm.currentState) || '?';
        porEstado[e] = (porEstado[e] || 0) + 1;
    }

    const reg = {
        jogo: jogo,
        aosSegundos: Math.round(tempoDeJogo),
        estadoDoMatch: Match.state,
        /*
        O `y` distingue duas explicações opostas para a mesma bola imóvel: no
        chão (y ~ BallPhysics.raio) ninguém a foi buscar; à altura do peito
        (BallControl.peitoAltura, 1.20) ela está COLADA a alguém que não larga
        o gesto, e a deriva lenta é o corpo dele a andar.
        */
        bola: { x: +b.x.toFixed(1), y: +b.y.toFixed(2), z: +b.z.toFixed(1) },
        bolaVel: +Math.hypot(Match.ballVel.x, Match.ballVel.y, Match.ballVel.z).toFixed(2),
        portador: Match.ballCarrier ? `${Match.ballCarrier.team} ${Match.ballCarrier.pos}` : null,
        /*
        O PORTADOR QUE NÃO DECIDE NADA.

        Encraves medidos: um jogador com a bola aos pés, parado em IDLE, 843 s
        seguidos — o jogo inteiro. O ramo `ComBola` do player_bt.js acaba num
        `act('conduzir', actCarry)` sem condição, portanto quem lá chega nunca
        pode ficar em IDLE: se ficou, é porque a árvore nem entrou no ramo.

        A porta é `temBola`, que lê `hasBall || carryTouchGrace > 0` — enquanto
        os OUTROS vinte e um leem `Match.ballCarrier`. Se os dois divergirem, o
        portador não decide (para ele não tem a bola) e mais ninguém a persegue
        (para eles a bola tem dono). Estes campos dizem qual dos dois é.
        */
        estadoDoPortador: Match.ballCarrier ? {
            fsm: Match.ballCarrier.fsm ? Match.ballCarrier.fsm.currentState : '?',
            hasBall: !!Match.ballCarrier.hasBall,
            carryTouchGrace: +(Match.ballCarrier.carryTouchGrace || 0).toFixed(2),
            touchLock: +(Match.ballCarrier.touchLock || 0).toFixed(2),
            decisionTimer: +(Match.ballCarrier.decisionTimer || 0).toFixed(1),
            distanciaABola: +Match.ballCarrier.model.position.distanceTo(b).toFixed(2)
        } : null,
        posse: Match.possessionTeam,
        setPieceTimer: +(Match.setPieceTimer || 0).toFixed(1),
        setPieceTaker: Match.setPieceTaker
            ? `${Match.setPieceTaker.team} ${Match.setPieceTaker.pos}` : null,
        emCampo: { TeamA: Match.players.length, TeamB: Match.opponents.length },
        estadosFSM: porEstado,
        /*
        QUEM ESTÁ A MATAR NO PEITO NESTE INSTANTE, e com que números.

        O gesto NÃO fica preso: medido em 20 jogos, 10 552 episódios de
        CHEST_CONTROL com duração máxima de 0,5 s, dentro da `peitoDur`. O que
        não acaba é a SEQUÊNCIA — nos jogos encravados há sempre dois
        jogadores em CHEST_CONTROL, gesto atrás de gesto, e a bola nunca chega
        a ser dominada.

        Enquanto o gesto dura, o ramo `AccaoEmCurso` do player_bt.js trata-o
        como acção em curso e o jogador não decide mais nada — é por isso que
        estes encraves aparecem com ninguém a ir à bola.

        `distanciaABola` e o `y` da bola dizem se ela está a ser devolvida à
        faixa do peito (peitoYMin 1.15 a peitoYMax 1.35) do jogador seguinte.
        */
        /*
        O contador anti ping-pong que JÁ EXISTE, e só conta cabeças: o
        resolveBallContact limita cabeceios seguidos a HeaderModel.
        maxHeadersSeguidos, mas não limita matadas no peito — e é uma
        sequência de peitos que aparece nestes encraves. Ver se ele está a
        zero diz se a sequência passa por ele ou o contorna.
        */
        aerialHeaderCount: Match.aerialHeaderCount,
        peitosNoGesto: [...Match.players, ...Match.opponents]
            .filter(p => p.fsm && p.fsm.currentState === 'CHEST_CONTROL')
            .map(p => ({
                quem: `${p.team} ${p.pos}`,
                peitoTimer: Number.isFinite(p.peitoTimer) ? +p.peitoTimer.toFixed(2) : String(p.peitoTimer),
                peitoCola: Number.isFinite(p.peitoCola) ? +p.peitoCola.toFixed(2) : String(p.peitoCola),
                touchLock: Number.isFinite(p.touchLock) ? +p.touchLock.toFixed(2) : String(p.touchLock),
                distanciaABola: +p.model.position.distanceTo(b).toFixed(1)
            }))
    };
    v.registos.push(reg);
    console.warn(`Sim: JOGO ENCRAVADO — bola parada ${v.segundos}s ` +
        `no jogo ${jogo}, aos ${reg.aosSegundos}s.`, reg);
}

/*
=============================================================================
EQUIPAS DE MEDIAS DIFERENTES — 60x70, 70x80, 65x85
=============================================================================
Ate aqui o lote corria sempre 80 contra 80: as duas equipas com a mesma
media em `TeamSkills`, e por isso nada no relatorio dizia se a skill vale
alguma coisa. Um simulador em que o 85 nao ganha ao 65 esta partido, e nunca
foi medido.

`opts.medias` e a lista de confrontos a girar pelo lote. Aceita os dois
formatos, que e como eles se escrevem:

    Sim.run({ jogos: 24, medias: [[60, 70], [70, 80], [65, 85]] })
    Sim.run({ jogos: 24, medias: ['60x70', '70x80', '65x85'] })

A media aplica-se aos QUATRO campos (def, mid, ata, gk): e a media da equipa,
nao um perfil.

E TROCA DE LADO a meio. Cada par corre metade dos jogos com o mais forte em
TeamA e metade com ele em TeamB — senao qualquer vies de lado (quem comeca
com a bola, a orientacao do campo) entrava na conta como se fosse skill.
=============================================================================
*/
function normalizarMedias(medias) {
    if (!medias || !medias.length) return null;
    const pares = [];
    for (const m of medias) {
        let a, b;
        if (typeof m === 'string') {
            const partes = m.split(/[xX×,\s]+/).filter(Boolean).map(Number);
            a = partes[0]; b = partes[1];
        } else if (Array.isArray(m)) {
            a = Number(m[0]); b = Number(m[1]);
        } else if (m && typeof m === 'object') {
            a = Number(m.a); b = Number(m.b);
        }
        if (!isFinite(a) || !isFinite(b)) {
            console.warn('Sim: confronto ignorado, nao percebi as medias:', m);
            continue;
        }
        pares.push([a, b]);
    }
    return pares.length ? pares : null;
}

/*
A MEDIA MEXE NAS SKILLS INDIVIDUAIS, e nao so no TeamSkills.

O `TeamSkills` do painel e FALLBACK: o `player.skillFor()` le primeiro as
skills individuais de `data/player_skills.js` e so cai no generico quando o
jogador nao as tem. Escrever 65 no painel e deixar os onze com os valores de
sempre nao fazia equipa nenhuma pior — fazia um lote que parecia estar a testar
e nao estava.

O deslocamento e ADITIVO sobre o ancora do gerador. O
`tools/gen_player_skills.js` monta cada atributo como `base + desvio do posto +
ruido`, com `base = 80`; portanto "media 65" e exactamente `base` a 65, ou seja
somar -15 a tudo. Assim o perfil do jogador mantem-se — o RB continua a ser o
melhor marcador do plantel, o CF o mais rapido — e so o nivel desce.

Parte SEMPRE dos valores originais (`originais`), nunca dos do jogo anterior:
a somar sobre o que ja la estava, um lote de 24 jogos acabava com equipas a
zero.
*/
const MEDIA_BASE_SKILLS = 80;
const CAMPOS_DA_MEDIA = ['fitness', 'stamina', 'gk', 'tec', 'marking', 'speed',
    'strength', 'pass', 'intercept', 'tacticknow'];

/*
O DEPOSITO ENCHE-SE ENTRE JOGOS, e mede-se no fim de cada um.

Sem o encher, o jogo 2 do lote comecava com as pernas do fim do jogo 1 e ao
decimo estava toda a gente no `StaminaModel.minimo` — um lote de calibracao a
medir um cansaco que nao e o de um jogo. E sem o medir nao ha por onde afinar
o modelo: e o `energiaFinal` de cada ficha que diz se o deposito acabou onde
devia (0.65-0.70) ou encostado ao chao.
*/
function reporEnergias() {
    for (const lista of [Match.players, Match.opponents]) {
        for (const p of lista) { if (p) p.energia = 1; }
    }
}

function mediaDeEnergia(lista) {
    let soma = 0, n = 0;
    for (const p of lista) {
        if (!p || typeof p.energia !== 'number') continue;
        soma += p.energia; n++;
    }
    return n ? Number((soma / n).toFixed(3)) : null;
}

function listaDaEquipa(equipa) {
    return (equipa === 'TeamA') ? Match.players : Match.opponents;
}

// Cópia das skills de cada jogador, para repor no fim do lote.
function guardarSkillsDaEquipa(equipa) {
    return listaDaEquipa(equipa).map(p => (p && p.skills) ? Object.assign({}, p.skills) : null);
}

function reporSkillsDaEquipa(equipa, guardadas) {
    const lista = listaDaEquipa(equipa);
    for (let i = 0; i < lista.length; i++) {
        if (lista[i] && guardadas[i]) lista[i].skills = guardadas[i];
    }
}

function aplicarMediaNaEquipa(equipa, media, originais) {
    TeamSkills[equipa].def = media;
    TeamSkills[equipa].mid = media;
    TeamSkills[equipa].ata = media;
    TeamSkills[equipa].gk = media;

    const delta = media - MEDIA_BASE_SKILLS;
    const lista = listaDaEquipa(equipa);
    let soma = 0, n = 0;
    for (let i = 0; i < lista.length; i++) {
        const p = lista[i], orig = originais[i];
        if (!p || !orig) continue;
        // Objecto novo: o `originais` e a copia rasa do arranque e nao pode
        // ser escrito por cima.
        const novas = Object.assign({}, orig);
        for (const campo of CAMPOS_DA_MEDIA) {
            if (typeof orig[campo] !== 'number') continue;
            novas[campo] = Math.max(1, Math.min(99, Math.round(orig[campo] + delta)));
            soma += novas[campo]; n++;
        }
        p.skills = novas;
    }
    // A media EFECTIVA, depois do clamp: e ela que vale, nao a pedida.
    return n ? (soma / n) : media;
}

/*
O CONFRONTO, do lado do MAIS FORTE — e nao do TeamA.

Com a troca de lado, somar por equipa nao diz nada: metade dos jogos tem o 85
de um lado e metade do outro. O que se quer saber e o que a diferenca de media
compra, portanto tudo se conta como "forte" contra "fraco".
*/
function resumirConfrontos(resultados) {
    const porPar = {};
    for (const r of resultados) {
        if (!r.medias) continue;
        const mA = r.medias.TeamA, mB = r.medias.TeamB;
        const forteEhA = mA >= mB;
        const forte = forteEhA ? r.TeamA : r.TeamB;
        const fraco = forteEhA ? r.TeamB : r.TeamA;
        const mForte = Math.max(mA, mB), mFraco = Math.min(mA, mB);
        const chave = mFraco + ' x ' + mForte;
        const e = porPar[chave] || (porPar[chave] = {
            confronto: chave, media: mFraco + ' vs ' + mForte, jogos: 0,
            gForte: 0, gFraco: 0, remForte: 0, remFraco: 0,
            alvoForte: 0, alvoFraco: 0, xgForte: 0, xgFraco: 0,
            vitForte: 0, empates: 0, vitFraco: 0
        });
        e.jogos++;
        e.gForte += forte.golos; e.gFraco += fraco.golos;
        e.remForte += forte.remates; e.remFraco += fraco.remates;
        e.alvoForte += forte.rematesNoAlvo; e.alvoFraco += fraco.rematesNoAlvo;
        e.xgForte += forte.xg; e.xgFraco += fraco.xg;
        if (forte.golos > fraco.golos) e.vitForte++;
        else if (forte.golos < fraco.golos) e.vitFraco++;
        else e.empates++;
    }
    const linhas = [];
    for (const chave in porPar) {
        const e = porPar[chave];
        const n = Math.max(1, e.jogos);
        linhas.push({
            confronto: e.media,
            jogos: e.jogos,
            golosForte: Number((e.gForte / n).toFixed(2)),
            golosFraco: Number((e.gFraco / n).toFixed(2)),
            saldoForte: Number(((e.gForte - e.gFraco) / n).toFixed(2)),
            pctVitoriaForte: Number((100 * e.vitForte / n).toFixed(1)),
            pctEmpate: Number((100 * e.empates / n).toFixed(1)),
            pctVitoriaFraco: Number((100 * e.vitFraco / n).toFixed(1)),
            rematesForte: Number((e.remForte / n).toFixed(1)),
            rematesFraco: Number((e.remFraco / n).toFixed(1)),
            pctNoAlvoForte: Number((100 * e.alvoForte / Math.max(1, e.remForte)).toFixed(1)),
            pctNoAlvoFraco: Number((100 * e.alvoFraco / Math.max(1, e.remFraco)).toFixed(1)),
            xgForte: Number((e.xgForte / n).toFixed(2)),
            xgFraco: Number((e.xgFraco / n).toFixed(2))
        });
    }
    linhas.sort((a, b) => b.saldoForte - a.saldoForte);
    return linhas;
}

const Sim = {
    running: false,
    resultados: [],
    heatmap: null,

    /*
    opts.jogos       quantos jogos seguidos correr (default 10)
    opts.duracaoSeg  duração de jogo simulado por jogo, em segundos de
                      relógio interno — não é tempo real (default 300 = 5 min)
    opts.dt          passo fixo de cada Match.update() (default 1/60)
    opts.passosPorLote  quantos passos por lote antes de ceder ao browser
    opts.calibrarEstilos  força todos os playing styles ligados e mede
                      ativações/deslocamento por (estilo, posição) — ver
                      resumirEstilos (default true)
    opts.rotacionarFormacoes  gira 442/433/4231 entre jogos e força
                      playingStyleFixo para cobrir os 21 estilos numa
                      corrida só, mesmo que o painel tenha outra formação
                      escolhida — ver construirPlanoCobertura
                      (default = mesmo valor de calibrarEstilos)
    opts.rapido      amostra a telemetria acumulativa em vez de a medir em
                      todos os frames, e cede ao browser menos vezes. Ver
                      `amostragem` abaixo (default false)
    opts.amostragem  1 = mede tudo em todos os frames (o de sempre); N = mede
                      o heatmap e os desvios 1 vez em cada N. `rapido` põe-no
                      a 6 (10 Hz a dt=1/60). Explícito ganha ao `rapido`.
    opts.medias      confrontos de médias a girar pelo lote, com troca de
                      lado a meio — `[[60,70],[70,80],[65,85]]` ou
                      `['60x70','70x80','65x85']`. Sem isto o lote corre com
                      o que o painel tem nas duas equipas (80 contra 80), e
                      nada no relatório diz se a skill vale alguma coisa.
                      Ver normalizarMedias e resumirConfrontos.

    O QUE **NÃO** É AMOSTRÁVEL, e porquê: `registarPermanencia` e
    `registarEstilos` fazem detecção de FLANCO — o primeiro abre e fecha
    episódios quando o estado da FSM muda, o segundo conta activações na
    transição de `styleAtivo`. Medi-los de 6 em 6 frames apagava os episódios
    curtos (o `PASS` dura 0,07 s de média e o `DRIBBLE` 0,02 s, ou seja menos
    de um intervalo de amostragem) e subcontava as activações. Continuam nos
    60 Hz. Só o heatmap e os desvios acumulam sem olhar para o frame anterior,
    e por isso só esses é que se podem amostrar sem mentir.
    */
    run: async function (opts) {
        opts = opts || {};
        if (this.running) { console.warn('Sim já está a correr.'); return null; }
        if (typeof Match === 'undefined' || typeof MatchStats === 'undefined') {
            console.error('Sim: Match/MatchStats ainda não estão prontos.');
            return null;
        }

        const nJogos = opts.jogos || 10;
        const duracaoSeg = opts.duracaoSeg || 300;
        const dt = opts.dt || 1 / 60;
        const rapido = !!opts.rapido;

        /*
        Ceder ao browser custa mais do que os 0 ms que o `setTimeout(0)` pede:
        a partir do quinto encadeamento o browser força um mínimo de ~4 ms.
        Com 300 passos por lote são ~5400 cedências num lote de 5 × 90 min, o
        que dá ~22 s de espera pura. Pouco em 2300 s, mas não é de graça, e em
        `rapido` a página não precisa de responder tão depressa.
        */
        const passosPorLote = opts.passosPorLote || (rapido ? 2000 : 300);

        // Explícito ganha ao `rapido`, para se poder pedir 60 Hz num lote
        // rápido (ou amostrar num lote normal) sem ter de mexer no resto.
        const amostragem = Math.max(1, Math.round(
            opts.amostragem || (rapido ? 6 : 1)));

        const calibrarEstilos = opts.calibrarEstilos !== false;
        const rotacionarFormacoes = calibrarEstilos && opts.rotacionarFormacoes !== false;

        /*
        As médias do lote. Guarda-se o que o painel tinha para repor no fim:
        um lote não deve deixar as equipas com a skill do último confronto.
        */
        const paresDeMedias = normalizarMedias(opts.medias);
        const skillsOriginais = paresDeMedias
            ? {
                painel: { TeamA: Object.assign({}, TeamSkills.TeamA), TeamB: Object.assign({}, TeamSkills.TeamB) },
                TeamA: guardarSkillsDaEquipa('TeamA'),
                TeamB: guardarSkillsDaEquipa('TeamB')
            }
            : null;
        if (paresDeMedias) {
            console.log('Sim: confrontos deste lote (com troca de lado a meio):',
                paresDeMedias.map(p => p[0] + 'x' + p[1]).join(', '));
        }

        this.running = true;
        this.resultados = [];
        this.heatmap = criarHeatmap(opts.cellSize);
        window.isPaused = false;

        // Telemetria do passe: acumula o LOTE inteiro (o MatchStats.reset
        // entre jogos não lhe toca), por isso limpa-se aqui no arranque.
        if (typeof MatchStats !== 'undefined') {
            MatchStats.amostrasPasse = [];
            MatchStats.relogio = 0;
        }

        const desvioStats = criarDesvioStats();
        const permanenciaStats = criarPermanenciaStats();

        /*
        Contagem de decisoes por ramo da arvore (ver BTStats em bt/core.js).
        Ligada so aqui: no jogo normal seriam 22 jogadores x 60 fps a escrever
        num objecto que ninguem le.
        */
        const contarRamos = (typeof BTStats !== 'undefined');
        if (contarRamos) { BTStats.reset(); BTStats.activo = true; }
        const vigia = criarVigia();
        const estiloStats = calibrarEstilos ? criarEstiloStats() : null;
        const estilosAnteriores = calibrarEstilos ? forcarEstilosLigados() : null;

        const planoCobertura = rotacionarFormacoes ? construirPlanoCobertura() : null;
        const formacaoOriginal = rotacionarFormacoes ? Tatics.formacao : null;
        const fixoOriginais = rotacionarFormacoes ? new Map() : null;

        const inicio = performance.now();
        this._porJogo = [];

        for (let jogo = 0; jogo < nJogos; jogo++) {
            /*
            Antes de qualquer coisa que indexe as listas: quem foi expulso no
            jogo anterior volta ao plantel. O `aplicarCoberturaNoJogo` abaixo
            indexa `Match.players[idx]` por posicao na lista, portanto com uma
            equipa reduzida a dez atribuia o estilo ao jogador errado — sem se
            queixar, que e o pior modo de falha possivel numa calibracao.
            */
            Match.reporExpulsos();

            if (planoCobertura) {
                const forma = FORM_CYCLE[jogo % FORM_CYCLE.length];
                Tatics.formacao = forma;
                aplicarCoberturaNoJogo(planoCobertura, forma, fixoOriginais);
                Match.assignFormations();
            }

            /*
            AS MÉDIAS DESTE JOGO, antes do resetPlay — o `assignFormations` e
            o arranque já leem TeamSkills.

            `viragem` é a troca de lado: passada a lista toda de confrontos
            uma vez, a volta seguinte corre-os com o forte na outra equipa.
            */
            let mediasDoJogo = null;
            if (paresDeMedias) {
                const par = paresDeMedias[jogo % paresDeMedias.length];
                const viragem = Math.floor(jogo / paresDeMedias.length) % 2 === 1;
                const mA = viragem ? par[1] : par[0];
                const mB = viragem ? par[0] : par[1];
                const efA = aplicarMediaNaEquipa('TeamA', mA, skillsOriginais.TeamA);
                const efB = aplicarMediaNaEquipa('TeamB', mB, skillsOriginais.TeamB);
                mediasDoJogo = {
                    TeamA: mA, TeamB: mB,
                    // Depois do clamp em [1, 99]: numa media muito baixa a
                    // efectiva sobe acima da pedida, e e ela que vale.
                    efectivaA: Number(efA.toFixed(1)), efectivaB: Number(efB.toFixed(1))
                };
            }

            reporEnergias();

            Match.resetPlay();
            MatchStats.reset();
            /*
            O `resumo().placar` le `Match.placarA/placarB`, que ninguem repunha
            entre jogos — o relatorio do lote trazia o placar ACUMULADO (jogo
            20 dizia "17-25" com 0 e 3 golos marcados nesse jogo). O
            `MatchStats.reset` zera as estatisticas, nao o marcador do Match.
            */
            Match.placarA = 0; Match.placarB = 0;
            /*
            E o RELOGIO, pelo mesmo motivo: ninguem o repunha, portanto ao 20.o
            jogo ja levava ~97 000 s acumulados. O `porJogo` escala por
            `5400 / segundosJogados`, logo o factor caia de 1.11 no primeiro
            jogo para 0.055 no ultimo e a tabela `mediaPorJogo` dava 0.52 golos
            por jogo quando as fichas mostravam 2 a 3.
            */
            Match.tempoDeJogo = 0;
            vigia.pos = null; vigia.parada = 0; vigia.jaRegistou = false;

            const totalPassos = Math.round(duracaoSeg / dt);
            let passosFeitos = 0;

            /*
            PROGRESSO. Um jogo de 25 minutos leva ~30 s reais e nao dizia nada
            ate acabar: o botao ficava em "A simular..." e a consola em
            silencio, o que se le como bloqueado. `opts.aoProgresso` recebe o
            jogo, o total e a fraccao feita deste jogo.
            */
            const aoProgresso = opts.aoProgresso;

            while (passosFeitos < totalPassos) {
                const lote = Math.min(passosPorLote, totalPassos - passosFeitos);
                for (let i = 0; i < lote; i++) {
                    Match.update(dt);

                    /*
                    A vigia fica em TODOS os frames: mede a distância que a bola
                    percorreu desde a última leitura, e saltar frames dava-lhe
                    saltos maiores do que o `raio` de 1,5 m — o cronómetro de
                    bola parada reiniciava sozinho e o encrave deixava de ser
                    detectado. É uma hipotenusa por frame, não é o custo.
                    */
                    vigiarEncrave(vigia, jogo + 1, passosFeitos * dt, dt);

                    // Só o heatmap e os desvios acumulam sem olhar para o frame
                    // anterior; ver a nota em cima sobre o que não é amostrável.
                    const medirAcumulados = (amostragem === 1) ||
                        ((passosFeitos + i) % amostragem === 0);

                    if (medirAcumulados) registarHeatmap(this.heatmap);
                    /*
                    Só com o nível 2 a correr. Ele é que escreve o slotTarget
                    contra o qual se mede o desvio do estilo; parado (golo,
                    bola fora, canto) o slot fica congelado no último frame de
                    jogo corrido, e o desvio medido é a distância a um ponto
                    velho — ruído somado aos números do relatório.
                    */
                    if (estiloStats && Match.nivel2Activo()) {
                        registarEstilos(estiloStats, Match.players);
                        registarEstilos(estiloStats, Match.opponents);
                    }
                    // O desvio por estado mede-se sempre (não depende dos
                    // estilos estarem a ser calibrados), pela mesma razão só
                    // com o nível 2 a correr.
                    if (medirAcumulados && Match.nivel2Activo()) {
                        registarDesvios(desvioStats, Match.players);
                        registarDesvios(desvioStats, Match.opponents);
                    }
                    registarPermanencia(permanenciaStats, Match.players, dt);
                    registarPermanencia(permanenciaStats, Match.opponents, dt);
                }
                passosFeitos += lote;
                if (aoProgresso) aoProgresso(jogo + 1, nJogos, passosFeitos / totalPassos);

                /*
                O painel de estatística vive no `animate()`, que faz `return` à
                cabeça enquanto o Sim corre — sem isto ficava congelado no que
                estivesse escrito quando o lote arrancou. Uma vez por lote de
                passos chega e sobra: são minutos de jogo entre chamadas.
                */
                if (typeof updatePainelEstatisticas === 'function') {
                    updatePainelEstatisticas(0, true);
                }

                await cederAoBrowser();
            }

            fecharPermanencias(permanenciaStats);

            const resumo = MatchStats.resumo();
            /*
            A FICHA CONTRA OS ALVOS, por jogo. O painel do browser já mostra
            isto ao vivo (ALVOS_ESTATISTICA em main.js), mas o lote só trazia
            as fichas cruas das 20 partidas — e é no lote que se calibra.

            `Match.tempoDeJogo` já vem multiplicado pelo MatchDuration.timeScale,
            portanto são segundos de RELÓGIO: é a escala certa para comparar com
            alvos de um jogo de 90 minutos.
            */
            if (MatchStats.porJogo) {
                this._porJogo.push(MatchStats.porJogo(Match.tempoDeJogo));
            }
            // O `placar` vem do resumo e e por jogo: sem ele o lote tinha as
            // estatisticas todas e nao dizia quem ganhou.
            this.resultados.push({
                jogo: jogo + 1, placar: resumo.placar,
                // Sem isto o relatório tinha as fichas e não dizia QUEM as fez:
                // com a troca de lado, TeamA não é sempre o mesmo nível.
                medias: mediasDoJogo,
                // O deposito medio no apito final, por equipa. Ver StaminaModel:
                // e este numero que diz se o cansaco esta calibrado.
                energiaFinal: {
                    TeamA: mediaDeEnergia(Match.players),
                    TeamB: mediaDeEnergia(Match.opponents)
                },
                TeamA: resumo.TeamA, TeamB: resumo.TeamB
            });
            console.log(`Sim: jogo ${jogo + 1}/${nJogos} concluído.`, resumo);
        }

        const duracaoReal = ((performance.now() - inicio) / 1000).toFixed(1);
        console.log(`Sim: ${nJogos} jogos concluídos em ${duracaoReal}s reais.`);

        this.running = false;

        if (planoCobertura) {
            Tatics.formacao = formacaoOriginal;
            for (const [p, valor] of fixoOriginais) p.playingStyleFixo = valor;
            Match.assignFormations();

            const sobrou = [];
            for (const key in planoCobertura.filas) {
                if (planoCobertura.filas[key].length) sobrou.push(...planoCobertura.filas[key].map(e => `${e} (${key})`));
            }
            if (sobrou.length) {
                console.warn(`Sim: ${sobrou.length} estilo(s) não couberam nos ${nJogos} jogos deste lote (aumente opts.jogos para cobrir todos):`, sobrou.join(', '));
            }
        }

        const relatorioDesvios = resumirDesvios(desvioStats, amostragem);
        if (relatorioDesvios.length) {
            console.log('Sim: desvio do alvo (dynamicTarget) ao slot do bloco, por estado');
            console.table(relatorioDesvios);
        }

        if (contarRamos) BTStats.activo = false;
        const relatorioRamos = contarRamos ? BTStats.resumo() : null;
        if (relatorioRamos && relatorioRamos.length) {
            console.log('Sim: decisoes por ramo da arvore (quem manda no jogador)');
            console.table(relatorioRamos);
        }

        const relatorioPermanencia = resumirPermanencia(permanenciaStats);
        if (relatorioPermanencia.length) {
            console.log('Sim: permanência contínua por estado da FSM (episódios, não frames)');
            console.table(relatorioPermanencia);
        }

        const relatorioPasses = (typeof MatchStats !== 'undefined') ? MatchStats.resumoPasses() : null;
        if (relatorioPasses && relatorioPasses.length) {
            console.log('Sim: passes por faixa de distância');
            console.table(relatorioPasses);
        }

        if (skillsOriginais) {
            TeamSkills.TeamA = skillsOriginais.painel.TeamA;
            TeamSkills.TeamB = skillsOriginais.painel.TeamB;
            reporSkillsDaEquipa('TeamA', skillsOriginais.TeamA);
            reporSkillsDaEquipa('TeamB', skillsOriginais.TeamB);
        }

        const relatorioConfrontos = paresDeMedias ? resumirConfrontos(this.resultados) : null;
        if (relatorioConfrontos && relatorioConfrontos.length) {
            console.log('Sim: confrontos por diferença de média (tudo do lado do MAIS FORTE)');
            console.table(relatorioConfrontos);
        }

        const relatorioMedia = montarMediaPorJogo(this._porJogo);
        if (relatorioMedia && relatorioMedia.length) {
            console.log('Sim: media por jogo contra os alvos (as duas equipas somadas)');
            console.table(relatorioMedia);
        }

        const relatorioEstilos = estiloStats ? resumirEstilos(estiloStats) : null;
        if (estilosAnteriores) restaurarEstilos(estilosAnteriores);
        if (relatorioEstilos) {
            console.table(relatorioEstilos);
            const semEfeito = relatorioEstilos.filter(l => l.semEfeito);
            const porDesenho = relatorioEstilos.filter(l => l.semDeslocacaoPorDesenho);
            if (porDesenho.length) {
                console.log('Sim: estilo(s) sem deslocacao POR DESENHO (nao e defeito):',
                    porDesenho.map(l => `${l.estilo} (${l.posicao})`).join(', '));
            }
            if (semEfeito.length) {
                console.warn('Sim: estilos que ATIVAM mas não deslocam o alvo (sem código de posicionamento por trás):',
                    semEfeito.map(l => `${l.estilo} (${l.posicao})`).join(', '));
            }
            const nuncaAtivou = relatorioEstilos.filter(l => l.ativacoes === 0);
            if (nuncaAtivou.length) {
                console.warn('Sim: estilos que NUNCA ativaram nesta simulação (gatilho não alcançado ou posição não usada na formação):',
                    nuncaAtivou.map(l => `${l.estilo} (${l.posicao})`).join(', '));
            }
        }

        const relatorio = {
            geradoEm: new Date().toISOString(),
            /*
            `amostragem` vai para o relatório porque muda o que os números
            querem dizer: com 6, o heatmap tem um sexto das contagens e os
            desvios um sexto das leituras. Comparar dois lotes com amostragens
            diferentes sem isto escrito seria comparar escalas diferentes.
            */
            parametros: {
                jogos: nJogos, duracaoSeg, dt, calibrarEstilos, rotacionarFormacoes,
                rapido, amostragem, passosPorLote,
                medias: paresDeMedias
            },
            duracaoRealSeg: Number(duracaoReal),
            /*
            Média das 20 fichas contra o alvo de cada métrica — a tabela que
            diz, numa linha por métrica, o que falta ao jogo para parecer
            futebol. Ver montarMediaPorJogo.
            */
            mediaPorJogo: relatorioMedia,
            /*
            O que a diferença de média compra, por confronto. Null quando o
            lote correu com as duas equipas iguais (o caso de sempre) — e aí
            a `mediaPorJogo` já diz tudo.

            ATENÇÃO à leitura: com `medias`, a `mediaPorJogo` mistura os
            confrontos todos, portanto compara-se contra os alvos com a
            ressalva de que metade das equipas não é de 80.
            */
            confrontos: relatorioConfrontos,
            resultados: this.resultados,
            heatmap: this.heatmap,
            estilos: relatorioEstilos,
            passes: relatorioPasses,
            desvios: relatorioDesvios,
            permanencia: relatorioPermanencia,
            /*
            Que ramo da arvore ganhou a decisao, e quantas vezes. `entradas` e
            o numero de decisoes; `frames` e quanto tempo cada uma mandou. Ver
            BTStats em bt/core.js.
            */
            ramos: relatorioRamos,
            /*
            Amostras cruas só a pedido (`opts.exportarAmostras`): são
            milhares, e enchiam o JSON exportado sem que a tabela resumo
            precise delas. Ficam sempre em MatchStats.amostrasPasse para
            quem as quiser cruzar na consola.
            */
            amostrasPasse: (opts.exportarAmostras && typeof MatchStats !== 'undefined')
                ? MatchStats.amostrasPasse : null,
            /*
            Retratos de jogo encravado, se houve algum. Vazio é o que se quer
            ver; com conteúdo, cada entrada diz o estado do Match, quem tinha
            a bola e o que os 22 jogadores estavam a fazer no momento.
            */
            encraves: vigia.registos
        };
        this.exportar(relatorio);
        return relatorio;
    },

    // Descarrega o relatório como .json.
    exportar: function (relatorio) {
        try {
            const blob = new Blob([JSON.stringify(relatorio)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'soccer-sim-results.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.warn('Sim: não consegui descarregar o ficheiro, resultado disponível em Sim.resultados / Sim.heatmap.', e);
        }
    }
};
