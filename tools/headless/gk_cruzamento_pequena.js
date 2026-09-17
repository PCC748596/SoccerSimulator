/*
O GUARDA-REDES SAI AO CRUZAMENTO QUE CAI NA PEQUENA AREA?

Relato: *"quando a bola for cruzada na pequena area o goleiro tem que tentar
pegar ou socar a bola. Ja tinha passado isso. Verifica."*

O comportamento existe (GkSaidaCruzamento no config/goalkeeper.js, o ramo
`isCross` do updateGK e o `resolverSaidaAoCruzamento`). Isto MEDE se ele
dispara: conta os voos de bola que iam cair na pequena area e, de cada um, o
que o guarda-redes fez.

Um VOO conta como cruzamento para a pequena area quando, em algum frame,
`preverQuedaDaBola()` o poe dentro da pequena area do guarda-redes que defende
esse lado, com a bola no ar e sem dono. E o mesmo teste que o updateGK usa.

De cada voo guarda-se:
  bandeira     o `gkSaiuAoCruzamento` chegou a ser levantado
  resolvido    o `resolverSaidaAoCruzamento` correu (agarrou, socou ou roçou)
  distMin      o mais perto que ele chegou da bola durante o voo
  altura       a altura da bola quando ele chegou mais perto

Uso: node tools/headless/gk_cruzamento_pequena.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 2700);
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

const S = GkSaidaCruzamento;

// Conta as chamadas reais ao gesto, por guarda-redes.
const resolvidos = new Map();
const original = FootballPlayer.prototype.resolverSaidaAoCruzamento;
FootballPlayer.prototype.resolverSaidaAoCruzamento = function () {
    const antes = this.gkEstado;
    const r = original.call(this);
    if (r) {
        const como = (this.gkEstado === 'segurando') ? 'agarrou'
            : (antes === 'salto_alto' ? 'socou/rocou (no ar)' : 'socou/rocou');
        resolvidos.set(this, (resolvidos.get(this) || []).concat(como));
    }
    return r;
};

const gkDe = (equipa) => (equipa === 'TeamA' ? Match.players : Match.opponents)
    .find(p => p.role === 'gk');

let voo = null;           // o voo em curso
const voos = [];

const frames = Math.round(segundos / dt);
for (let f = 0; f < frames; f++) {
    Match.update(dt);

    const bola = Match.ball.position;
    const noAr = bola.y > 0.35 && !Match.ballCarrier && Match.state === 'PLAY';

    // De quem e a baliza para onde isto vai?
    const alvoGK = (bola.z > 0) ? gkDe('TeamB') : gkDe('TeamA');
    const defende = alvoGK && (Math.sign(alvoGK.ownGoalZ) === Math.sign(bola.z));

    let paraPequena = false;
    if (noAr && defende && typeof preverQuedaDaBola === 'function') {
        const q = preverQuedaDaBola();
        paraPequena = !!q &&
            Math.abs(q.x) <= Area.pequenaMeiaLargura &&
            Math.abs(alvoGK.ownGoalZ - q.z) <= Area.pequenaProfundidade &&
            Math.sign(q.z) === Math.sign(alvoGK.ownGoalZ);
    }

    if (paraPequena && !voo) {
        resolvidos.delete(alvoGK);
        voo = {
            gk: alvoGK, bandeira: false, distMin: 99, alturaNoMinimo: 0,
            alturaInicial: bola.y, vy: Match.ballVel.y, frames: 0
        };
    }

    if (voo) {
        voo.frames++;
        if (voo.gk.gkSaiuAoCruzamento) voo.bandeira = true;
        const d = voo.gk.model.position.distanceTo(bola);
        if (d < voo.distMin) { voo.distMin = d; voo.alturaNoMinimo = bola.y; }

        // O voo acaba quando a bola aterra, ganha dono ou o jogo para.
        const acabou = bola.y <= 0.35 || !!Match.ballCarrier || Match.state !== 'PLAY';
        if (acabou) {
            voo.resolvido = resolvidos.get(voo.gk) || [];
            voo.dono = Match.ballCarrier
                ? (Match.ballCarrier === voo.gk ? 'o proprio GK'
                    : (Match.ballCarrier.team === voo.gk.team ? 'colega' : 'adversario'))
                : 'ninguem';
            voos.push(voo);
            voo = null;
        }
    }
}

const n = voos.length;
const comBandeira = voos.filter(v => v.bandeira).length;
const comGesto = voos.filter(v => v.resolvido.length).length;
const agarrou = voos.filter(v => v.resolvido.includes('agarrou')).length;
const socou = voos.filter(v => v.resolvido.some(r => r.startsWith('socou'))).length;
const chegouPerto = voos.filter(v => v.distMin <= S.alcanceSaida).length;

const pc = (k) => n ? (100 * k / n).toFixed(0) + '%' : '--';

console.log(`\n${Math.round(segundos / 60)} minutos de jogo, semente ${semente}`);
console.log(`voos a cair na pequena area: ${n}`);
console.log(`  com a bandeira levantada : ${comBandeira} (${pc(comBandeira)})`);
console.log(`  chegou a ${S.alcanceSaida} m da bola  : ${chegouPerto} (${pc(chegouPerto)})`);
console.log(`  gesto executado          : ${comGesto} (${pc(comGesto)})`);
console.log(`     agarrou               : ${agarrou}`);
console.log(`     socou / rocou         : ${socou}`);

/*
A TAXA QUE INTERESSA e o gesto DENTRO dos voos em que a bandeira se levantou:
os outros ou sao voos curtos lidos no ultimo frame, ou bolas que alguem
disputou antes. E esta a medida que compara duas afinacoes.
*/
const gestoComBandeira = voos.filter(v => v.bandeira && v.resolvido.length).length;
console.log(`  gesto entre os que sairam : ${gestoComBandeira}/${comBandeira}` +
    (comBandeira ? ` (${(100 * gestoComBandeira / comBandeira).toFixed(0)}%)` : ''));
const dm = voos.filter(v => v.bandeira).map(v => v.distMin).sort((a, b) => a - b);
if (dm.length) {
    console.log(`  distancia minima (saidas) : mediana ${dm[Math.floor(dm.length / 2)].toFixed(2)} m, ` +
        `melhor ${dm[0].toFixed(2)}, pior ${dm[dm.length - 1].toFixed(2)}`);
}

const falhados = voos.filter(v => !v.resolvido.length);
if (falhados.length) {
    console.log(`\nos ${Math.min(10, falhados.length)} primeiros voos SEM gesto:`);
    for (const v of falhados.slice(0, 10)) {
        console.log(`  bandeira=${v.bandeira ? 'sim' : 'NAO '} distMin=${v.distMin.toFixed(2)} m ` +
            `alturaNoMinimo=${v.alturaNoMinimo.toFixed(2)} m frames=${v.frames} ` +
            `ficou com=${v.dono}`);
    }
}
