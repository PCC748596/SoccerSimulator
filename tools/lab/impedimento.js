/*
IMPEDIMENTOS MARCADOS: estavam mesmo em fora-de-jogo?

Relato: *"A marcação de impedimento está errada. Foi marcado impedimento nesse
lance. Mas o jogador do Grêmio não está à frente do último marcador."*

    node tools/lab/impedimento.js [segundos] [semente]

Recalcula a Lei 11 no instante em que o jogo marca, a partir das posições
desse frame, e compara. As tres condicoes: estar no meio-campo adversario,
a frente da BOLA, e a frente do PENULTIMO adversario (guarda-redes incluido).

Mede tambem o INTERVALO entre o passe (onde a posicao se fixa) e a marcacao:
a regra avalia no momento do passe, portanto uma diferenca grande explica um
jogador que, quando a falta aparece no ecra, ja esta noutro sitio.
*/
require('../headless/harness.js');

const segundos = Number(process.argv[2] || 1800);
const semente = Number(process.argv[3] || 1);
let s = semente >>> 0;
Math.random = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = true;

let frame = 0, frameDaMarca = -1;
const regs = [];

// Quando as posicoes sao CONGELADAS (no passe).
const marcarOriginal = Officials.marcarPosicoesDeImpedimento;
Officials.marcarPosicoesDeImpedimento = function (passador, destinatario) {
    const r = marcarOriginal.call(this, passador, destinatario);
    if (this._impedidos && this._impedidos.length) {
        frameDaMarca = frame;
        /*
        A LINHA TAMBEM SE CONGELA, e nao so a posicao do jogador. A Lei 11
        avalia tudo no instante do passe; recalcular a linha no momento em que
        a falta e assinalada compara a posicao congelada de um com a posicao
        actual dos outros, e isso nao e a regra nenhuma.
        */
        const dir = passador.dirZ;
        const advs = (passador.team === 'TeamA') ? Match.opponents : Match.players;
        const zs = advs.filter(o => o && o.model).map(o => o.model.position.z * -dir).sort((a, b) => a - b);
        for (const m of this._impedidos) {
            m._linhaNoPasse = (zs.length >= 2) ? zs[1] * -dir * dir : 0;
            m._bolaNoPasse = Match.ball.position.z * dir;
        }
    }
    return r;
};

// Quando a infraccao e ASSINALADA.
const assinalarOriginal = Officials.assinalarImpedimento;
Officials.assinalarImpedimento = function (marca) {
    if (marca && marca.jogador && marca.jogador.model) {
        const p = marca.jogador;
        const dir = p.dirZ;
        const advs = (p.team === 'TeamA') ? Match.opponents : Match.players;

        // A Lei 11, recalculada AGORA a partir das posicoes deste frame.
        const zs = advs.filter(o => o && o.model).map(o => o.model.position.z * -dir).sort((a, b) => a - b);
        const linhaAgora = (zs.length >= 2) ? zs[1] * -dir * dir : 0;
        // A linha DO PASSE, que e a que a regra manda usar.
        const linhaNoPasse = (typeof marca._linhaNoPasse === 'number') ? marca._linhaNoPasse : linhaAgora;
        const zAgora = p.model.position.z * dir;
        const zCongelado = marca.z * dir;
        const bolaNoPasse = (typeof marca._bolaNoPasse === 'number')
            ? marca._bolaNoPasse : Match.ball.position.z * dir;

        regs.push({
            // A REGRA: posicao congelada contra a linha congelada.
            frenteDaLinhaCongelado: zCongelado > linhaNoPasse,
            // O QUE SE VE: posicao de agora contra a linha de agora.
            frenteDaLinhaAgora: zAgora > linhaAgora,
            frenteDaBola: zCongelado > bolaNoPasse,
            noMeioCampoAdv: zCongelado > 0,
            margemCongelado: zCongelado - linhaNoPasse,
            margemAgora: zAgora - linhaAgora,
            frames: (frameDaMarca >= 0) ? (frame - frameDaMarca) : -1
        });
    }
    return assinalarOriginal.call(this, marca);
};

const dt = 1 / 60;
for (let i = 0; i < segundos * 60; i++) { frame = i; Match.update(dt); }

const f = (n, d) => d ? (100 * n / d).toFixed(0) + '%' : '-';
console.log(`\n${segundos}s, semente ${semente} — impedimentos assinalados: ${regs.length}`);
if (!regs.length) { console.log('  (nenhum)'); process.exit(0); }

const maus = regs.filter(r => !r.frenteDaLinhaCongelado);
const mausAgora = regs.filter(r => !r.frenteDaLinhaAgora);
console.log(`  pela REGRA (tudo congelado no passe), NAO estavam impedidos  ${maus.length}  (${f(maus.length, regs.length)})`);
console.log(`  pelo que SE VE no ecra quando a falta aparece, nao estavam   ${mausAgora.length}  (${f(mausAgora.length, regs.length)})`);
console.log(`  nao estavam a frente da BOLA                            ${regs.filter(r => !r.frenteDaBola).length}`);
console.log(`  nao estavam no meio-campo adversario                    ${regs.filter(r => !r.noMeioCampoAdv).length}`);

const margens = regs.map(r => r.margemCongelado).sort((a, b) => a - b);
console.log(`\n  margem sobre a linha (congelada), em metros:`);
console.log(`    minima ${margens[0].toFixed(1)}   mediana ${margens[Math.floor(margens.length / 2)].toFixed(1)}   maxima ${margens[margens.length - 1].toFixed(1)}`);

const atrasos = regs.filter(r => r.frames >= 0).map(r => r.frames).sort((a, b) => a - b);
if (atrasos.length) {
    console.log(`\n  frames entre o passe e a marcacao (a posicao fixa-se no passe):`);
    console.log(`    mediana ${atrasos[Math.floor(atrasos.length / 2)]}   maxima ${atrasos[atrasos.length - 1]}` +
        `   (${(atrasos[atrasos.length - 1] / 60).toFixed(1)} s)`);
    const longe = regs.filter(r => r.frenteDaLinhaCongelado && !r.frenteDaLinhaAgora);
    console.log(`    marcados certos mas que JA NAO estavam a frente da linha quando a falta apareceu: ${longe.length}  (${f(longe.length, regs.length)})`);
}
