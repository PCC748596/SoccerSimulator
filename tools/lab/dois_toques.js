/*
SEGUNDO TOQUE DE QUEM REPÔS A BOLA.

Conta, em jogo a sério, quantas reposições (canto, lateral, falta, penálti,
tiro de meta) acabaram com o PRÓPRIO batedor a voltar a tocar na bola antes de
qualquer outro jogador — o que a Lei não permite e o jogo permitia.

    node tools/lab/dois_toques.js [segundos] [semente] [--sem-regra]

Com `--sem-regra` a marca do repositor e apagada a cada frame, o que reproduz
o comportamento de ANTES da correccao. E assim que se mede se a regra esta a
fazer alguma coisa: sem ela tem de aparecer segundo toque, com ela zero.

Como se mede: no instante em que o estado passa a PLAY vindo de uma bola
parada, guarda-se o batedor (`Match.lastTouchedPlayer`). A partir daí observa-se
quem toca a seguir: se for ele outra vez, é falta; se for outro, o lance
seguiu e a contagem daquele lance fecha.
*/
require('../headless/harness.js');

const segundos = Number(process.argv[2] || 600);
const semente = Number(process.argv[3] || 1);
const semRegra = process.argv.indexOf('--sem-regra') !== -1;
/*
`--forcar` poe a bola EM CIMA do batedor meio segundo depois de ele a repor.

Existe porque o defeito e raro: em 30 min de jogo livre e 75 reposicoes nao
aparece uma unica vez. E preciso que a bola lhe volte ao pe — um canto curto,
um cruzamento que bate na barreira — e isso nao acontece de encomenda. Este
modo cria a condicao em vez de esperar por ela, e mede o que o jogo faz com
ela: sem a regra o batedor ganha a bola, com a regra nao lhe toca.
*/
const forcar = process.argv.indexOf('--forcar') !== -1;
let aForcar = null, tForcar = 0;
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

const PARADAS = ['CORNER_KICK', 'THROW_IN', 'FREE_KICK', 'PENALTY', 'GOAL_KICK'];
const dt = 1 / 60;
let estadoAnt = Match.state;
let batedor = null, lanceDe = null, tocouAnt = Match.lastTouchedPlayer;
const lances = {}, faltas = {};

for (const n of PARADAS) { lances[n] = 0; faltas[n] = 0; }

for (let i = 0; i < segundos * 60; i++) {
    // Reproduz o jogo de antes da regra: a marca nunca chega a valer.
    if (semRegra && Match.repositor) Match.libertarRepositor();
    Match.update(dt);
    if (semRegra && Match.repositor) Match.libertarRepositor();

    // Reposição acabada de bater: o estado saiu de uma bola parada para PLAY.
    if (Match.state === 'PLAY' && PARADAS.indexOf(estadoAnt) !== -1) {
        batedor = Match.lastTouchedPlayer;
        lanceDe = estadoAnt;
        if (batedor) lances[lanceDe]++;
        tocouAnt = batedor;
    }
    estadoAnt = Match.state;

    if (forcar && batedor && aForcar !== batedor) { aForcar = batedor; tForcar = 0; }
    if (forcar && aForcar) {
        tForcar += dt;
        if (tForcar > 0.5 && tForcar < 0.55) {
            // A bola cai-lhe em cima, parada, ao alcance do pe.
            Match.ball.position.set(aForcar.model.position.x,
                BallPhysics.raio, aForcar.model.position.z + 0.3);
            Match.ballVel.set(0, 0, 0);
        }
        if (tForcar > 2.5) aForcar = null;
    }

    if (batedor) {
        /*
        DUAS MANEIRAS DE APANHAR O SEGUNDO TOQUE, porque so o
        `lastTouchedPlayer` nao chega: ha caminhos que dao a bola a alguem sem
        passar por onde essa variavel e escrita. O relato e *"o batedor saiu
        JOGANDO"*, portanto o `ballCarrier` e o sinal mais directo.
        */
        const agora = Match.lastTouchedPlayer;
        if (Match.ballCarrier === batedor) {
            faltas[lanceDe]++;
            batedor = null; lanceDe = null;
        } else if (agora && agora !== tocouAnt) {
            // Mudou de dono: ou foi o batedor outra vez, ou o lance seguiu.
            if (agora === batedor) faltas[lanceDe]++;
            batedor = null; lanceDe = null;
        }
        // Uma bola parada nova fecha o lance anterior sem segundo toque.
        if (PARADAS.indexOf(Match.state) !== -1) { batedor = null; lanceDe = null; }
    }
}

console.log(`\n${segundos}s de jogo, semente ${semente}`);
console.log('lance            reposicoes   com 2o toque do batedor');
let tot = 0, totF = 0;
for (const n of PARADAS) {
    tot += lances[n]; totF += faltas[n];
    console.log(`  ${n.padEnd(14)} ${String(lances[n]).padStart(6)} ${String(faltas[n]).padStart(20)}`);
}
console.log(`  ${'TOTAL'.padEnd(14)} ${String(tot).padStart(6)} ${String(totF).padStart(20)}`);
process.exit(totF > 0 ? 1 : 0);
