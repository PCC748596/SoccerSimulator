/*
O SALTO NO ANGULO: ate onde o guarda-redes chega quando a bola vai alta.

Relato: "quando o jogador da o chute em cima e e gol, queria que o goleiro
pulasse na direccao da bola mas nao tocasse. O goleiro esta pulando em baixo,
deslizando para o lado da bola mas por baixo."

Mede, em cada mergulho: o tipo escolhido, o alvo em Y, a velocidade vertical
do impulso, se ela bateu no tecto `vySubidaMax`, e a ALTURA MAXIMA que o
ombro dele atinge no voo contra a altura da bola.

Uso: node tools/headless/gk_salto_alto.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 1080);
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

const D = GoalkeeperDive;
const _maoW = new THREE.Vector3();
const mergulhos = [];
let activo = null;

const origIniciar = GkDive.iniciar.bind(GkDive);
GkDive.iniciar = function (p, alvoX, alvoY, tipo, dirX) {
    const r = origIniciar(p, alvoX, alvoY, tipo, dirX);
    /*
    QUANTO TEMPO FALTA A BOLA PARA CHEGAR, no instante em que ele salta. E a
    pergunta do relato: "as vezes a bola nem passa pela defesa e o goleiro ja
    esta caido".
    */
    let tChegada = null, distBola = null;
    if (Match.ball && Math.abs(Match.ballVel.z) > 0.5) {
        tChegada = Math.abs(p.model.position.z - Match.ball.position.z) / Math.abs(Match.ballVel.z);
        distBola = p.model.position.distanceTo(Match.ball.position);
    }
    activo = { p: p, tipo: tipo, alvoY: alvoY, alvoX: alvoX, tChegada: tChegada, distBola: distBola,
        yMax: p.model.position.y, y0: p.model.position.y,
        v0y: null, tecto: false, deslizou: false, diveRef: null };
    mergulhos.push(activo);
    return r;
};
const origLancar = GkDive.lancar.bind(GkDive);
GkDive.lancar = function (p) {
    const r = origLancar(p);
    if (activo && activo.p === p && p.dive) {
        activo.v0y = p.dive.v0y;
        activo.tVoo = p.dive.tVoo;
        activo.diveRef = p.dive;
        // Bateu no tecto? Repete-se a conta sem o clamp (formula nova: a MAO
        // no apice a altura da bola).
        const g = BallPhysics.gravidade;
        const subida = activo.alvoY - (D.ombroY * 0.5 + D.alcanceVertical) - p.model.position.y;
        const semTecto = Math.sqrt(2 * g * Math.max(0, subida));
        activo.v0yPedido = semTecto;
        activo.tecto = semTecto > D.vySubidaMax + 1e-6;
    }
    return r;
};

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    // CRONOLOGIA do primeiro mergulho alto: fase e altura, frame a frame.
    if (activo && activo.tipo === 'alto' && activo.p.dive && !global.__traceFeito) {
        activo.trace = activo.trace || [];
        if (activo.trace.length < 60) {
            activo.trace.push(`${activo.p.dive.fase}:${activo.p.model.position.y.toFixed(2)}`);
        } else { global.__traceFeito = activo; }
    }
    for (const m of mergulhos) {
        // So o mergulho a que este registo pertence: o `p.dive` e substituido
        // a cada mergulho novo e sem isto os registos velhos continuavam a
        // somar frames do seguinte.
        if (!m.diveRef || m.p.dive !== m.diveRef) continue;
        const y = m.p.model.position.y;
        if (y > m.yMax) m.yMax = y;
        if (m.p.dive.fase === 'chao') m.deslizou = true;
        // POR QUANTO E QUE ELE FALHA: a menor distancia da mao a bola durante
        // o mergulho, e se chegou a tocar-lhe.
        if (Match.state === 'PLAY' && Match.ballVel.lengthSq() > 1) {
            for (const nome of ['lHand', 'rHand']) {
                const mao = m.p.rig && m.p.rig[nome];
                if (!mao) continue;
                mao.getWorldPosition(_maoW);
                const d = _maoW.distanceTo(Match.ball.position);
                if (d < (m.maoMin === undefined ? Infinity : m.maoMin)) m.maoMin = d;
            }
        }
        if (m.p.dive.tocou) m.tocou = true;
        /*
        O INSTANTE QUE INTERESSA: quando a bola cruza o plano z do guarda-redes.
        A media sobre o mergulho inteiro e enganadora — leva os remates que vao
        para fora, onde ninguem tinha nada a fazer.
        */
        if (m.cruzou === undefined) {
            const dz = (Match.ball.position.z - m.p.model.position.z) * m.p.dirZ;
            if (m.dzAnterior !== undefined && m.dzAnterior > 0 && dz <= 0) {
                m.cruzou = true;
                m.xNoPlano = Match.ball.position.x;
                m.yNoPlano = Match.ball.position.y;
                let dm = Infinity;
                for (const nome of ['lHand', 'rHand']) {
                    const mao = m.p.rig && m.p.rig[nome];
                    if (!mao) continue;
                    mao.getWorldPosition(_maoW);
                    dm = Math.min(dm, _maoW.distanceTo(Match.ball.position));
                }
                m.maoNoPlano = dm;
                m.dentroDaBaliza = Math.abs(m.xNoPlano) < LARGURA_BALIZA / 2 &&
                    m.yNoPlano < ALTURA_BALIZA;
            }
            m.dzAnterior = dz;
        }
        // Quem lhe rouba o estado a meio do voo, e em que estado de jogo.
        if (!m.roubado && m.p.gkEstado !== 'mergulho') {
            m.roubado = `${Match.state}/${m.p.gkEstado}`;
        }
        if (m.p.dive.fase === 'voo') m.tVooReal = (m.tVooReal || 0) + dt;
        m.faseFinal = m.p.dive.fase;
    }
}

const por = (lista) => {
    if (!lista.length) return '  (nenhum)';
    const med = f => (lista.reduce((s, m) => s + f(m), 0) / lista.length);
    const noTecto = lista.filter(m => m.tecto).length;
    return `  n=${lista.length}  alvoY ${med(m => m.alvoY).toFixed(2)}  ` +
        `v0y ${med(m => m.v0y || 0).toFixed(2)} (pedida ${med(m => m.v0yPedido || 0).toFixed(2)})  ` +
        `no tecto ${(100 * noTecto / lista.length).toFixed(0)}%  ` +
        `ombro no apice ${med(m => m.yMax + D.ombroY * 0.5).toFixed(2)} m  ` +
        `falta ${med(m => m.alvoY - (m.yMax + D.ombroY * 0.5)).toFixed(2)} m  ` +
        `| voo real ${med(m => m.tVooReal || 0).toFixed(2)}s de ${med(m => m.tVoo || 0).toFixed(2)}s  ` +
        `apice teorico ${med(m => (m.v0y || 0) * (m.v0y || 0) / (2 * 9.81)).toFixed(2)} m  ` +
        `subida real ${med(m => m.yMax - m.y0).toFixed(2)} m`;
};
const comLancamento = mergulhos.filter(m => m.v0y !== null);
/*
CONGELADOS: o voo mais longo que a parabola permite e o `vooMax` (0.85 s). Um
registo com mais do que isso e um mergulho que deixou de ser actualizado -- o
`gkEstado` saiu de 'mergulho' com o `dive` ainda de pe, e o corpo fica onde
estava, no ar.
*/
const congelados = comLancamento.filter(m => (m.tVooReal || 0) > 1.2);
{
    const porQuem = {};
    for (const m of congelados) {
        const k = m.roubado || '(ninguem: o update parou)';
        porQuem[k] = (porQuem[k] || 0) + 1;
    }
    const l = Object.entries(porQuem).map(([k, v]) => `${k} x${v}`);
    if (l.length) console.log('  quem lhes rouba o estado: ' + l.join('  '));
}
console.log(`  congelados a meio do voo: ${congelados.length} de ${comLancamento.length}` +
    (congelados.length ? `  (o pior ficou ${Math.max(...congelados.map(m => m.tVooReal)).toFixed(1)} s no ar)` : ''));
console.log(`semente ${semente}  |  ${mergulhos.length} mergulhos, ${comLancamento.length} chegaram a saltar`);
for (const t of ['alto', 'meio', 'baixo']) {
    console.log(`  ${t.padEnd(6)}` + por(comLancamento.filter(m => m.tipo === t)));
}
{
    const noAlvo = mergulhos.filter(m => m.cruzou && m.dentroDaBaliza && m.maoNoPlano !== undefined);
    const med4 = a => a.length ? (a.reduce((s, v) => s + v, 0) / a.length) : NaN;
    console.log(`  remates que cruzaram o plano DENTRO da moldura: ${noAlvo.length}` +
        (noAlvo.length ? `  |  mao a ${med4(noAlvo.map(m => m.maoNoPlano)).toFixed(2)} m da bola nesse instante` +
            `  |  tocou em ${noAlvo.filter(m => m.tocou).length}` : ''));
}
{
    const comMao = mergulhos.filter(m => m.maoMin !== undefined);
    const med2 = a => a.length ? (a.reduce((s, v) => s + v, 0) / a.length) : NaN;
    const falhados = comMao.filter(m => !m.tocou);
    console.log(`  mao mais perto da bola no mergulho: media ${med2(comMao.map(m => m.maoMin)).toFixed(2)} m` +
        `  |  tocaram ${comMao.filter(m => m.tocou).length} de ${comMao.length}` +
        `  |  nos falhados faltavam ${med2(falhados.map(m => m.maoMin)).toFixed(2)} m`);
}
{
    const t = mergulhos.filter(m => m.tChegada !== null && m.tChegada !== undefined);
    const med3 = a => a.length ? (a.reduce((s, v) => s + v, 0) / a.length) : NaN;
    const mediana3 = a => { const o = a.slice().sort((x, y) => x - y); return o.length ? o[Math.floor(o.length / 2)] : NaN; };
    console.log(`  ao saltar, faltavam a bola ${med3(t.map(m => m.tChegada)).toFixed(2)} s ` +
        `(mediana ${mediana3(t.map(m => m.tChegada)).toFixed(2)}) e ela estava a ` +
        `${med3(t.map(m => m.distBola)).toFixed(1)} m dele`);
}
console.log(`  tecto vySubidaMax = ${D.vySubidaMax} m/s, vooMax = ${D.vooMax} s`);

const alvo = global.__traceFeito || mergulhos.find(m => m.trace && m.trace.length);
if (alvo) {
    console.log('  cronologia (fase:y) do primeiro mergulho alto:');
    console.log('    ' + alvo.trace.join(' '));
}
