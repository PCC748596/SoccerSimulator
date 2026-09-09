/*
OS JOGADORES A FLUTUAR NO CAMPO.

Relato, com captura: "por algum motivo, no meio do jogo, os jogadores ficam
flutuando no campo" — o boneco acima do relvado, com a sombra por baixo.

O `assentarNoChao` (player.js) mede a bota mais baixa e SOMA uma correcção ao
`model.position.y` todos os frames. A altura base é escrita noutro sítio, dentro
do `animateBones`; se houver um ramo que não a escreva, a correcção acumula.

O headless não chama o `animateBones` (é animação), por isso chama-se aqui à
mão, como o vibracao_pose.js faz — é o mesmo que o browser faz.

Mede a altura do corpo por jogador e por estado, e diz quem passa do limiar.

Uso: node tools/headless/flutuar.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 600);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);

require('./harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
/*
CAMINHO DO BROWSER, e nao o do lote: `Sim.running = false`.

E a diferenca que importa. No lote, quem nao passa pelo `animateBones` — o
guarda-redes, o LATERAL, o SHOOT e o BALL_CONTROL_RIGHT com clip — leva
`y = ALTURA_BASE_Y` a mao (ver o `else` do headless em player.update). No
browser esse `else` nao existe: quem escreve a altura e o clip, e se ele parar
de correr a altura fica onde ficou. Medir com o lote e medir o jogo com uma
rede de seguranca que o browser nao tem.
*/
global.Sim = { running: false };

const LIMIAR = 0.15;   // metros acima do relvado a que já se vê o boneco no ar

/*
A MEDIDA E A SOLA DA BOTA, e nao o `model.position.y`.

A primeira versao media so a altura do corpo — e nao apanhava nada, porque o
corpo pode estar na base e a POSE levantar o boneco: o `pelvis.position.y` e as
rotacoes das pernas tambem sobem o desenho, e e isso que se ve no ecra. A
sola da bota no mundo e a unica medida que responde a pergunta do relato.

E a mesma conta do `assentarNoChao` (player.js), que e quem devia corrigir isto.
*/
const _bb = new THREE.Vector3();
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
            _bb.set(ix ? b.max.x : b.min.x, iy ? b.max.y : b.min.y, iz ? b.max.z : b.min.z);
            _bb.applyMatrix4(bota.matrixWorld);
            if (_bb.y < min) min = _bb.y;
        }
    }
    return isFinite(min) ? min : null;
};
const todos = () => Match.players.concat(Match.opponents);
const porEstado = {}; const causas = {}; const faixas = {}; const grave = []; const paradosDetalhe = [];
let amostras = 0, acimaDoLimiar = 0, pior = 0, piorQuem = '', piorEstado = '';
const tempoNoAr = new Map();
const maisTempo = { s: 0, quem: '', estado: '' };

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 6) continue;

    for (const p of todos()) {
        if (p.role === 'gk') continue;
        const sola = solaY(p);
        if (sola === null) continue;
        const alt = sola;   // altura da sola sobre o relvado
        const st = p.fsm ? p.fsm.currentState : '?';
        amostras++;
        porEstado[st] = porEstado[st] || { n: 0, soma: 0, max: 0 };
        porEstado[st].n++;
        porEstado[st].soma += alt;
        if (alt > porEstado[st].max) porEstado[st].max = alt;

        if (alt > LIMIAR) {
            acimaDoLimiar++;
            const v = p.velocity.length();
            const faixa = alt < 0.25 ? '0.15-0.25 (passada)' : (alt < 0.40 ? '0.25-0.40' : '> 0.40 (flutua)');
            faixas[faixa] = (faixas[faixa] || 0) + 1;
            if (v < 0.5 && p.jumpTimer <= 0 && p.peitoHopTimer <= 0 && paradosDetalhe.length < 10) {
                paradosDetalhe.push(`${p.pos} ${st} sola=${alt.toFixed(2)} corpo=${(p.model.position.y - ALTURA_BASE_Y).toFixed(2)} ` +
                    `pelvisY=${p.rig.pelvis.position.y.toFixed(2)} coxaL=${p.rig.lLeg.rotation.x.toFixed(2)} joelhoL=${p.rig.lKnee.rotation.x.toFixed(2)} ` +
                    `clip=${p.actionState ? 'sim' : 'nao'} t=${(i * dt).toFixed(0)}s`);
            }
            if (alt > 0.40) {
                grave.push(`${p.pos} ${st} v=${v.toFixed(1)} sola=${alt.toFixed(2)} corpo=${(p.model.position.y - ALTURA_BASE_Y).toFixed(2)} pelvis=${p.rig.pelvis.position.y.toFixed(2)} salto=${p.jumpTimer > 0}`);
            }
            const faixaV = (v < 0.1) ? 'parado' : (v < 4.0 ? 'a andar/trote (<4 m/s)' : 'a correr (>4 m/s)');
            const chave = `${faixaV} | salto ${p.jumpTimer > 0 ? 'sim' : 'nao'} | peito ${p.peitoHopTimer > 0 ? 'sim' : 'nao'}`;
            causas[chave] = (causas[chave] || 0) + 1;
            const t = (tempoNoAr.get(p) || 0) + dt * 6;
            tempoNoAr.set(p, t);
            if (t > maisTempo.s) { maisTempo.s = t; maisTempo.quem = p.pos; maisTempo.estado = st; }
            if (alt > pior) { pior = alt; piorQuem = p.pos; piorEstado = st; }
        } else {
            tempoNoAr.set(p, 0);
        }
    }
}

console.log(`\n${(Match.tempoDeJogo / 60).toFixed(0)} min | ${amostras} leituras de jogador de campo`);
console.log(`acima de ${LIMIAR} m do chao: ${(100 * acimaDoLimiar / amostras).toFixed(1)}% das leituras`);
console.log(`pior caso: ${pior.toFixed(2)} m (${piorQuem}, estado ${piorEstado})`);
console.log(`mais tempo seguido no ar: ${maisTempo.s.toFixed(1)} s (${maisTempo.quem}, ${maisTempo.estado})`);
if (paradosDetalhe.length) {
    console.log('\nPARADOS no ar (sem salto e sem peito) — é este o caso do relato:');
    for (const d of paradosDetalhe) console.log('  ' + d);
}
console.log('\npor faixa de altura da sola:');
for (const [k, v] of Object.entries(faixas).sort()) console.log(`  ${k}: ${v}`);
if (grave.length) {
    console.log('\nos piores (sola acima de 40 cm), primeiros 8:');
    for (const g of grave.slice(0, 8)) console.log('  ' + g);
}
console.log('\nquem estava no ar, e com que gesto em curso:');
for (const [k, v] of Object.entries(causas).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log('\naltura media por estado (m acima da base):');
for (const [k, v] of Object.entries(porEstado).sort((a, b) => b[1].soma / b[1].n - a[1].soma / a[1].n)) {
    if (v.n < 20) continue;
    console.log(`  ${k.padEnd(20)} media ${(v.soma / v.n).toFixed(3)}  max ${v.max.toFixed(2)}  n=${v.n}`);
}
