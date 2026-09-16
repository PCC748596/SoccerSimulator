/*
LARGURA DOS LATERAIS — |x| do alvo e da posição real, e quantas vezes o
lateral fica mais por dentro do que os dois centrais do mesmo bloco.

Uso: node tools/headless/laterais_largura.js [segundos]
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 300);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const med = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const dados = {};
const reg = (k, v) => { (dados[k] = dados[k] || []).push(v); };
let porDentro = 0, amostras = 0, marcCentral = 0, marcTotal = 0;
const marcados = {};

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 12) continue;
    if (Match.state !== 'PLAY') continue;

    for (const eq of ['TeamA', 'TeamB']) {
        const lista = (eq === 'TeamA') ? Match.players : Match.opponents;
        const bb = TeamAI.get(eq); if (!bb) continue;
        const laterais = lista.filter(p => p.pos === 'LB' || p.pos === 'RB');
        const cbs = lista.filter(p => p.pos === 'CB');
        for (const p of laterais) {
            amostras++;
            reg('posX', Math.abs(p.model.position.x));
            if (p.dynamicTarget) reg('alvoX', Math.abs(p.dynamicTarget.x));
            if (p.slotTarget) reg('slotX', Math.abs(p.slotTarget.x));
            if (p.baseTarget) reg('baseX', Math.abs(p.baseTarget.x));
            if (p.postoBase) reg('postoX', Math.abs(p.postoBase.x));
            if (p.postoBase && typeof molaParaABola === 'function') {
                const M = MolaDeCoesao;
                const forca = bb.isAttacking ? M.forcaComBola : M.forcaSemBola;
                const pux = molaParaABola(p.postoBase.x, p.postoBase.z, Match.ball.position.x, Match.ball.position.z, forca, M.distMin, M.puxaoMax);
                reg('molaX', Math.abs(pux.x));
            }
            reg('bolaX', Math.abs(Match.ball.position.x));
            // Mais por dentro do que os dois centrais (do lado dele)?
            const meuLado = Math.sign(p.baseTarget.x) || 1;
            const cbsLado = cbs.map(c => c.model.position.x * meuLado);
            if (cbsLado.length >= 2 && p.model.position.x * meuLado < Math.max(...cbsLado)) porDentro++;
            if (p.marcRef) {
                marcTotal++;
                marcados[p.marcRef.pos] = (marcados[p.marcRef.pos] || 0) + 1;
                if (['CF', 'ST', 'SS', 'CM', 'AM', 'DM', 'CB'].includes(p.marcRef.pos)) marcCentral++;
            }
        }
    }
}

const f = (k) => med(dados[k] || []).toFixed(2);
console.log(`amostras de lateral: ${amostras}`);
console.log(`|x| posicao real : ${f('posX')}`);
console.log(`|x| dynamicTarget: ${f('alvoX')}`);
console.log(`|x| slotTarget   : ${f('slotX')}`);
console.log(`|x| baseTarget   : ${f('baseX')}`);
console.log(`|x| postoBase(estilo): ${f('postoX')}`);
console.log(`|x| pos+mola     : ${f('molaX')}`);
console.log(`|x| bola         : ${f('bolaX')}`);
console.log(`por dentro do CB mais interior: ${(100 * porDentro / Math.max(1, amostras)).toFixed(1)}%`);
console.log(`com marcacao: ${(100 * marcTotal / Math.max(1, amostras)).toFixed(1)}% | dessas, homem central: ${(100 * marcCentral / Math.max(1, marcTotal)).toFixed(1)}%`);
console.log('quem marcam:', Object.entries(marcados).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join('  '));
