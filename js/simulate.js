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
        const passosPorLote = opts.passosPorLote || 300;

        this.running = true;
        this.resultados = [];
        this.heatmap = criarHeatmap(opts.cellSize);
        window.isPaused = false;

        const inicio = performance.now();

        for (let jogo = 0; jogo < nJogos; jogo++) {
            Match.resetPlay();
            MatchStats.reset();

            const totalPassos = Math.round(duracaoSeg / dt);
            let passosFeitos = 0;

            while (passosFeitos < totalPassos) {
                const lote = Math.min(passosPorLote, totalPassos - passosFeitos);
                for (let i = 0; i < lote; i++) {
                    Match.update(dt);
                    registarHeatmap(this.heatmap);
                }
                passosFeitos += lote;
                await cederAoBrowser();
            }

            const resumo = MatchStats.resumo();
            this.resultados.push({ jogo: jogo + 1, TeamA: resumo.TeamA, TeamB: resumo.TeamB });
            console.log(`Sim: jogo ${jogo + 1}/${nJogos} concluído.`, resumo);
        }

        const duracaoReal = ((performance.now() - inicio) / 1000).toFixed(1);
        console.log(`Sim: ${nJogos} jogos concluídos em ${duracaoReal}s reais.`);

        this.running = false;

        const relatorio = {
            geradoEm: new Date().toISOString(),
            parametros: { jogos: nJogos, duracaoSeg, dt },
            duracaoRealSeg: Number(duracaoReal),
            resultados: this.resultados,
            heatmap: this.heatmap
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
