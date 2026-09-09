/*
OS TRÊS RELATOS DO PÉ NO CHÃO.

  1. "Um pouco antes do início do jogo, o goleiro que estava na posição correcta
     fica um pouco acima do solo. Isso ANTES do apito inicial."
  2. "Depois de alguns segundos de jogo, outros jogadores já não encostam no
     chão na animação de andar."
  3. "Uns jogadores estão no chão, mas quando giram para um lado ou para o
     outro, levantam do chão."

Os três são do `assentarNoChao` (player.js), e os três apontam a sítios
diferentes dele — por isso medem-se juntos, com a mesma corrida:

  - o GUARDA-REDES, que o `flutuar.js` da sessão anterior salta de propósito
    (`if (p.role === 'gk') continue`) e por isso nunca foi medido;
  - o ESTADO DO JOGO, para separar o que se passa antes do apito (KICKOFF) do
    jogo corrido;
  - a VELOCIDADE ANGULAR do boneco, que é o que o relato 3 nomeia;
  - e QUAL DAS GUARDAS do `assentarNoChao` recusou o assento, contada por
    jogador e por frame. Sem isto discute-se se a correcção é pequena de mais
    ou se ela nem sequer corre.

Como no `flutuar.js`, a medida é a SOLA DA BOTA no mundo (não o
`model.position.y`: o corpo pode estar na base e ser a pose a levantar o
boneco) e o caminho é o do BROWSER (`Sim.running = false`), senão o lote
escreve `y = ALTURA_BASE_Y` à mão e tapa tudo.

Uso: node tools/headless/assento_tres_relatos.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 300);
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
global.Sim = { running: false };

// SUAVIZACAO=<0..1> para varrer sem tocar no config de producao.
if (process.env.SUAVIZACAO) AssentoNoChao.suavizacao = Number(process.env.SUAVIZACAO);
// CORRECCAOMAX=<metros> para varrer o tecto por frame.
if (process.env.CORRECCAOMAX) AssentoNoChao.correccaoMax = Number(process.env.CORRECCAOMAX);

/*
TREMOR. A suavizacao existe para o corpo nao saltar. Se ela subir, tem de se
medir o que ela protegia: a variacao da altura do corpo de um frame para o
outro, em quem nao esta a saltar nem a mergulhar. E o numero que diz se a
correccao inteira estraga o desenho.
*/
const tremor = [];
const yAnterior = new Map();

/*
QUAL DAS GUARDAS RECUSA O ASSENTO. O `assentarNoChao` tem seis saídas
antecipadas e nenhuma deixa rasto. Repete-se aqui a mesma cadeia de condições,
pela mesma ordem, e conta-se a primeira que dispara — é a leitura que diz se o
defeito é a correcção ser fraca ou o assento nem correr.
*/
const recusas = {};
const motivoDaRecusa = (p) => {
    const A = (typeof AssentoNoChao !== 'undefined') ? AssentoNoChao : null;
    if (!A || !A.activo) return 'config desligada';
    if (!p.rig || !p.rig.lBota || !p.rig.rBota) return 'sem rig';
    if (p.jumpTimer > 0) return 'salto';
    if (p.peitoHopTimer > 0) return 'peito';
    if (p.role === 'gk' && p.gkEstado && p.gkEstado !== 'idle') return `gkEstado=${p.gkEstado}`;
    const st = p.fsm ? p.fsm.currentState : null;
    if (st === 'SLIDE_TACKLE') return 'carrinho';
    if (p.velocity.length() > A.velMax) return `velocidade>${A.velMax}`;
    return null;    // o assento correu
};

const _v = new THREE.Vector3();
const solaY = (p) => {
    const rig = p.rig;
    if (!rig || !rig.lBota || !rig.rBota) return null;
    let min = Infinity;
    for (const bota of [rig.lBota, rig.rBota]) {
        const geo = bota.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const b = geo.boundingBox;
        bota.updateWorldMatrix(true, false);
        for (let ix = 0; ix < 2; ix++) for (let iy = 0; iy < 2; iy++) for (let iz = 0; iz < 2; iz++) {
            _v.set(ix ? b.max.x : b.min.x, iy ? b.max.y : b.min.y, iz ? b.max.z : b.min.z);
            _v.applyMatrix4(bota.matrixWorld);
            if (_v.y < min) min = _v.y;
        }
    }
    return isFinite(min) ? min : null;
};

const todos = () => Match.players.concat(Match.opponents);
const med = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const f2 = (a) => med(a).toFixed(3);

// --- RELATO 1: o guarda-redes, e o que se passa antes do apito.
const gkPorEstadoDoJogo = {};
// --- RELATO 2: a andar, ao longo do tempo.
const andarPorMinuto = {};
// --- RELATO 3: a girar.
const porGiro = {
    'parado de frente (<20 graus/s)': [],
    'a girar 20-90 graus/s': [],
    'a girar 90-180 graus/s': [],
    'a girar > 180 graus/s': []
};
const faixaDeGiro = (g) => (g < 20) ? 'parado de frente (<20 graus/s)'
    : (g < 90) ? 'a girar 20-90 graus/s'
        : (g < 180) ? 'a girar 90-180 graus/s' : 'a girar > 180 graus/s';

const yawAnterior = new Map();

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);

    const minuto = Math.floor(Match.tempoDeJogo / 60);
    const estadoJogo = Match.state || '?';

    for (const p of todos()) {
        const sola = solaY(p);
        if (sola === null) continue;

        // Velocidade angular do boneco, em graus por segundo.
        const yaw = p.model.rotation.y;
        const ant = yawAnterior.get(p);
        yawAnterior.set(p, yaw);
        let giro = 0;
        if (ant !== undefined) {
            let d = yaw - ant;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            giro = Math.abs(d) / dt * 180 / Math.PI;
        }

        const yAgora = p.model.position.y;
        const yAnt = yAnterior.get(p);
        yAnterior.set(p, yAgora);
        if (yAnt !== undefined && p.jumpTimer <= 0 && p.peitoHopTimer <= 0 &&
            p.velocity.length() < 4.0) {
            tremor.push(Math.abs(yAgora - yAnt));
        }

        const motivo = motivoDaRecusa(p);
        const chaveR = `${p.role === 'gk' ? 'GR' : 'campo'} | ${motivo || 'assento CORREU'}`;
        recusas[chaveR] = (recusas[chaveR] || 0) + 1;

        if (p.role === 'gk') {
            const k = estadoJogo;
            (gkPorEstadoDoJogo[k] || (gkPorEstadoDoJogo[k] = [])).push(sola);
            continue;
        }

        const v = p.velocity.length();
        // A ANDAR: entre parado e trote, que é a faixa que o relato nomeia.
        if (v > 0.6 && v < 3.0 && estadoJogo === 'PLAY') {
            (andarPorMinuto[minuto] || (andarPorMinuto[minuto] = [])).push(sola);
        }
        // A GIRAR: só a pé parado ou devagar, senão a fase de voo da passada
        // domina a leitura e mede-se a corrida em vez do giro.
        if (v < 1.5 && p.jumpTimer <= 0 && p.peitoHopTimer <= 0) {
            porGiro[faixaDeGiro(giro)].push(sola);
        }
    }
}

console.log(`\n${(Match.tempoDeJogo / 60).toFixed(1)} min de relogio (semente ${semente})`);
console.log('Altura da SOLA sobre o relvado, em metros. 0.00 = encostado.\n');

console.log('RELATO 1 — O GUARDA-REDES, por estado do jogo');
for (const [k, v] of Object.entries(gkPorEstadoDoJogo).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${k.padEnd(14)} sola media ${f2(v).padStart(7)}   ` +
        `max ${Math.max(...v).toFixed(3).padStart(7)}   n=${v.length}`);
}

console.log('\nRELATO 2 — A ANDAR (0.6-3.0 m/s, jogo corrido), minuto a minuto');
const mins = Object.keys(andarPorMinuto).map(Number).sort((a, b) => a - b);
for (const m of mins) {
    const v = andarPorMinuto[m];
    if (v.length < 30) continue;
    console.log(`  minuto ${String(m).padStart(2)}   sola media ${f2(v).padStart(7)}   ` +
        `max ${Math.max(...v).toFixed(3).padStart(7)}   n=${v.length}`);
}

console.log('\nRELATO 3 — A GIRAR (so a pe parado ou devagar)');
for (const [k, v] of Object.entries(porGiro)) {
    if (!v.length) continue;
    console.log(`  ${k.padEnd(32)} sola media ${f2(v).padStart(7)}   ` +
        `max ${Math.max(...v).toFixed(3).padStart(7)}   n=${v.length}`);
}

console.log('\nQUAL DAS GUARDAS RECUSOU O ASSENTO (leituras)');
const totalR = Object.values(recusas).reduce((a, b) => a + b, 0);
for (const [k, v] of Object.entries(recusas).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(34)} ${String(v).padStart(8)}  ${(100 * v / totalR).toFixed(1)}%`);
}
console.log(`
TREMOR da altura do corpo entre frames (quem nao salta, abaixo de 4 m/s)`);
console.log(`  media ${med(tremor).toFixed(4)} m/frame   ` +
    `max ${Math.max(...tremor).toFixed(4)} m/frame   n=${tremor.length}`);
/*
A DISTRIBUICAO, e nao so a media. O que se ve no ecra e o salto GRANDE: um
corpo a descer 1 cm num frame nao e visivel, um a descer 10 cm e um pulo. E o
tecto por frame e o `correccaoMax`.
*/
const acima = (x) => (100 * tremor.filter(t => t > x).length / tremor.length).toFixed(2);
console.log(`  frames acima de 2 cm: ${acima(0.02)}%   ` +
    `5 cm: ${acima(0.05)}%   10 cm: ${acima(0.10)}%   20 cm: ${acima(0.20)}%`);
console.log('');
