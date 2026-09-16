/*
TIRO DE META: ONDE FICAM AS DUAS EQUIPAS.

Relato: "esse é o ajuste do tiro de meta, completamente sem sentido — um time
deveria estar no meio campo e o time do batedor um pouco antes". A captura
mostra os 22 amontoados junto à baliza de quem bate.

O `setupSetPiece` escreve os alvos UMA vez, mas o `nivel2Activo()` inclui o
GOAL_KICK: o bloco é recalculado a cada frame à volta da BOLA, que está na
quina da pequena área, e a mola de coesão puxa toda a gente para lá.

Mede, no instante em que o guarda-redes vai bater: a profundidade de cada
equipa no referencial de ataque de quem bate (z*attDir), o mais recuado, o mais
adiantado e a mediana.

Uso: node tools/headless/tiro_de_meta.js [quantos]
*/
const quantos = Number(process.argv[2] || 6);

require('./harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const med = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const p50 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const amostras = { bate: [], recebe: [] };
const extremos = { bate: [], recebe: [] };

for (let n = 0; n < quantos; n++) {
    // Uns segundos de jogo para as equipas saírem da formação inicial.
    for (let i = 0; i < 600; i++) Match.update(dt);

    const equipaQueBate = (n % 2 === 0) ? 'TeamA' : 'TeamB';
    const bate = (equipaQueBate === 'TeamA') ? Match.players : Match.opponents;
    const recebe = (equipaQueBate === 'TeamA') ? Match.opponents : Match.players;
    const attDir = bate[0].dirZ;

    // Bola atrás da linha de fundo de quem bate, fora dos postes.
    Match.ball.position.set(20, 0.2, -attDir * (CAMPO_COMP / 2 + 1));
    Match.ballVel.set(0, 0, 0);
    Match.setupSetPiece('GOAL_KICK', equipaQueBate);

    /*
    Mede-se COM O LANCE AINDA DE PÉ. Deixar correr até o estado sair de
    GOAL_KICK media o jogo já a recomeçar — o nível 2 volta a ligar no mesmo
    frame e toda a gente arranca do sítio.
    */
    let frames = 0;
    while (frames < 60 * 12 && Match.state === 'GOAL_KICK') {
        Match.update(dt);
        frames++;
        if (frames > 60 * 5) break;   // 5 s: a bola já assentou e ninguém bateu ainda
    }

    for (const [nome, lista] of [['bate', bate], ['recebe', recebe]]) {
        const campo = lista.filter(p => p.role !== 'gk');
        const alvo = campo.map(p => p.dynamicTarget.z * attDir);
        const falta = campo.map(p => p.model.position.distanceTo(p.dynamicTarget));
        console.log(`   ${nome}: alvo medio ${(alvo.reduce((a,b)=>a+b,0)/alvo.length).toFixed(1)} | ` +
            `falta andar ${(falta.reduce((a,b)=>a+b,0)/falta.length).toFixed(1)} m | estado ${campo[0].fsm.currentState}`);
        const zs = campo.map(p => p.model.position.z * attDir);
        amostras[nome].push(med(zs));
        extremos[nome].push({ min: Math.min(...zs), max: Math.max(...zs), p50: p50(zs) });
    }
}

console.log('\nProfundidade no referencial de ataque de quem bate (z*attDir):');
console.log('  -52 = linha de fundo dele | -35.5 = risco da grande área | 0 = meio-campo | +52 = baliza adversária\n');
for (const nome of ['bate', 'recebe']) {
    const e = extremos[nome];
    console.log(`  equipa que ${nome.padEnd(7)} | média ${med(amostras[nome]).toFixed(1)} m | ` +
        `mais recuado ${med(e.map(x => x.min)).toFixed(1)} | mediana ${med(e.map(x => x.p50)).toFixed(1)} | ` +
        `mais adiantado ${med(e.map(x => x.max)).toFixed(1)}`);
}
