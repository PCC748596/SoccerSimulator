/*
A DISTRIBUICAO DAS ALTURAS sobre os plantéis reais, para calibrar a faixa.

    node tools/lab/alturas.js [min] [max] [media] [sigma] [factor]

Sem argumentos mede o que esta no `AlturaJogador` (config/physics.js). Com
argumentos simula outra calibracao sem tocar no ficheiro — e foi assim que a
faixa [1.65, 1.90] foi calibrada.

O NUMERO QUE DECIDE e o de COLADOS: jogadores cortados pelo `min`/`max`, que
ficam todos com exactamente a mesma altura. Um clamp que actua e uma
distribuicao achatada, e e o que se quer evitar.

O `factor` multiplica as quatro parcelas que enchem a distribuicao (bonus de
posto, bonus de estilo, penalizacao da velocidade e ruido) — ver a nota do
`min`/`max` em config/physics.js para o porque de elas terem de encolher
quando a faixa encolhe.
*/
require('../headless/harness.js');
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();

const A = AlturaJogador;
if (process.argv[2]) A.min = Number(process.argv[2]);
if (process.argv[3]) A.max = Number(process.argv[3]);
if (process.argv[4]) A.media = Number(process.argv[4]);
if (process.argv[5]) A.sigma = Number(process.argv[5]);
/*
FACTOR DE ESCALA das parcelas (argv[6]). A faixa encolheu, e as parcelas que a
enchiam — bonus de posto, bonus de estilo, penalizacao da velocidade e ruido —
tem de encolher com ela, senao empurram toda a gente contra os limites e a
distribuicao achata.
*/
const k = Number(process.argv[6] || 1);
if (k !== 1) {
    for (const t of ['bonusPosto', 'bonusEstilo'])
        for (const n in A[t]) A[t][n] = +(A[t][n] * k).toFixed(4);
    A.penalVelocidade = +(A.penalVelocidade * k).toFixed(4);
    A.sigma = +(A.sigma * k).toFixed(4);
}
console.log(`  (parcelas x${k}: GK ${A.bonusPosto.GK}, penalVel ${A.penalVelocidade}, sigma ${A.sigma})`);

const todos = Match.players.concat(Match.opponents);
for (const p of todos) delete p._alturaCache;       // a altura e cacheada
const hs = todos.map(p => alturaDoJogador(p)).sort((a, b) => a - b);

const media = hs.reduce((s, h) => s + h, 0) / hs.length;
const noPiso = hs.filter(h => Math.abs(h - A.min) < 0.0005).length;
const noTecto = hs.filter(h => Math.abs(h - A.max) < 0.0005).length;

console.log(`faixa [${A.min}, ${A.max}]  media nominal ${A.media}  sigma ${A.sigma}`);
console.log(`  jogadores ${hs.length}`);
console.log(`  media realizada ${media.toFixed(3)} m`);
console.log(`  minimo ${hs[0].toFixed(3)}   mediana ${hs[Math.floor(hs.length / 2)].toFixed(3)}   maximo ${hs[hs.length - 1].toFixed(3)}`);
console.log(`  COLADOS ao piso ${noPiso}   ao tecto ${noTecto}   (${(100 * (noPiso + noTecto) / hs.length).toFixed(0)}% achatados)`);
const faixas = [[0, 1.70], [1.70, 1.75], [1.75, 1.80], [1.80, 1.85], [1.85, 9]];
console.log('  distribuicao:');
for (const [a, b] of faixas) {
    const n = hs.filter(h => h >= a && h < b).length;
    console.log(`    ${a === 0 ? '  ate 1.70' : (b === 9 ? '1.85 e mais' : a.toFixed(2) + ' a ' + b.toFixed(2))}  ${'#'.repeat(n)} ${n}`);
}
