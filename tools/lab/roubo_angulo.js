/*
DE QUE ÂNGULO SE ROUBA A BOLA?

Relato: *"O Atacante está roubando a bola do goleiro por trás do goleiro. Com o
corpo do goleiro entre ele e a bola. Isso é impossível de acontecer... Só é
possivel roubar a bola em uma marcação normal se o jogador adversário estiver
num angulo de até 45 de frente com o jogador que tem a bola e de 46-80 graus
utilizando o carrinho."*

    node tools/lab/roubo_angulo.js [segundos] [semente]

Mede cada mudança de dono entre adversários e regista o ÂNGULO de onde vinha
quem roubou — 0 graus de frente para o portador, 180 pelas costas — e se houve
carrinho. É a mesma conta que o jogo usa nas duas guardas
(`BallControl.rouboPorTras` e o `podeDesarmar` do player_bt.js), para os
números serem comparáveis com os limiares.
*/
require('../headless/harness.js');

const segundos = Number(process.argv[2] || 900);
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

/*
A FRENTE do portador: para onde ANDA, e so parado e que vale a orientacao do
modelo. E a convencao das duas guardas do jogo.
*/
function anguloDeQuemVem(dono, ladrao) {
    let fx, fz;
    if (dono.velocity && dono.velocity.lengthSq() > 0.1) {
        const n = Math.hypot(dono.velocity.x, dono.velocity.z) || 1;
        fx = dono.velocity.x / n; fz = dono.velocity.z / n;
    } else {
        fx = Math.sin(dono.model.rotation.y); fz = Math.cos(dono.model.rotation.y);
    }
    const ax = ladrao.model.position.x - dono.model.position.x;
    const az = ladrao.model.position.z - dono.model.position.z;
    const da = Math.hypot(ax, az);
    if (da < 0.001) return 0;
    const cos = Math.max(-1, Math.min(1, (fx * ax + fz * az) / da));
    return Math.acos(cos) * 180 / Math.PI;
}

/*
POR ONDE PASSOU A MUDANCA DE DONO. A guarda do angulo vive no
`resolveBallContact` (match_physics.js); se o roubo chegar por outro caminho,
ela nao tem como o ver. Marca-se o frame em que o `resolveBallContact` deu a
bola a alguem, para separar os dois casos.
*/
let frameDoContacto = -1, frameActual = 0;
const contactoOriginal = Match.resolveBallContact.bind(Match);
Match.resolveBallContact = function () {
    const antes = Match.lastTouchedPlayer;
    const r = contactoOriginal();
    if (Match.lastTouchedPlayer !== antes) frameDoContacto = frameActual;
    return r;
};

const dt = 1 / 60;
let donoAnt = null, dBolaAntes = 0, estadoLadrao = {};
const roubos = [];

for (let i = 0; i < segundos * 60; i++) {
    frameActual = i;
    /*
    A DISTANCIA DA BOLA AO DONO, LIDA ANTES do update — e o valor que a guarda
    do jogo vai ver neste frame. A guarda desliga-se acima de
    `rouboPorTras.bolaSolta`, e e por ai que os roubos fora da regra passam.
    */
    if (donoAnt && donoAnt.model && Match.ball) {
        dBolaAntes = Math.hypot(Match.ball.position.x - donoAnt.model.position.x,
            Match.ball.position.z - donoAnt.model.position.z);
    }
    Match.update(dt);
    const dono = Match.lastTouchedPlayer;
    if (dono && donoAnt && dono !== donoAnt && dono.team !== donoAnt.team &&
        dono.model && donoAnt.model) {
        const d = dono.model.position.distanceTo(donoAnt.model.position);
        // So conta como ROUBO se estavam perto: um passe interceptado longe
        // nao e tirar a bola do pe a ninguem.
        /*
        O BLOQUEIO DE REMATE NAO E UM ROUBO, e era o maior falso positivo
        desta medicao: o defesa mete o corpo a frente da bola e o toque passa
        a ser dele, o que e legitimo de qualquer angulo. Media-se como roubo
        pelas costas e enchia a coluna dos "fora da regra" — 10 dos 13
        primeiros casos que investiguei eram isto.
        */
        const remate = (donoAnt.fsm && donoAnt.fsm.currentState === 'SHOOT') ||
            (dono.fsm && dono.fsm.currentState === 'SHOOT');
        if (d < 3.0 && !remate) {
            roubos.push({
                angulo: anguloDeQuemVem(donoAnt, dono),
                carrinho: !!(dono.fsm && /TACKLE|SLIDE|CARRINHO/i.test(dono.fsm.currentState || '')),
                aoGk: donoAnt.role === 'gk',
                dBola: dBolaAntes,
                porContacto: (frameDoContacto === i)
            });
        }
    }
    if (dono) donoAnt = dono;
}

const f = (n, d) => d ? (100 * n / d).toFixed(0) + '%' : '-';
console.log(`\n${segundos}s, semente ${semente} — roubos a menos de 3 m: ${roubos.length}`);
console.log('  faixa de angulo      roubos   com carrinho');
for (const b of [[0, 45], [45, 80], [80, 120], [120, 181]]) {
    const g = roubos.filter(r => r.angulo >= b[0] && r.angulo < b[1]);
    const nome = b[0] === 0 ? '0 a 45 (de frente)'
        : (b[0] === 45 ? '46 a 80 (de lado)'
            : (b[0] === 80 ? '81 a 120' : '121 a 180 (de tras)'));
    console.log(`  ${nome.padEnd(20)} ${String(g.length).padStart(6)} ${String(g.filter(r => r.carrinho).length).padStart(14)}`);
}
const forbiddenSemCarrinho = roubos.filter(r => !r.carrinho && r.angulo > 45);
const forbiddenComCarrinho = roubos.filter(r => r.carrinho && r.angulo > 80);
console.log(`\n  FORA DA REGRA PEDIDA:`);
console.log(`    sem carrinho, acima de 45 graus   ${forbiddenSemCarrinho.length}  (${f(forbiddenSemCarrinho.length, roubos.length)})`);
console.log(`    com carrinho, acima de 80 graus   ${forbiddenComCarrinho.length}  (${f(forbiddenComCarrinho.length, roubos.length)})`);
console.log(`    roubos ao GUARDA-REDES            ${roubos.filter(r => r.aoGk).length}` +
    `  (dos quais acima de 45 graus: ${roubos.filter(r => r.aoGk && r.angulo > 45).length})`);

/*
ONDE ESTAVA A BOLA. A guarda do angulo so corre enquanto a bola estiver a
menos de `rouboPorTras.bolaSolta` do dono; acima disso o jogo considera-a
sobrada e de quem chegar. Se os roubos fora da regra estiverem quase todos
desse lado, o limiar e que manda, nao o angulo.
*/
const solta = (BallControl.rouboPorTras && BallControl.rouboPorTras.bolaSolta) || 1.6;
const fora = roubos.filter(r => (!r.carrinho && r.angulo > 45) || (r.carrinho && r.angulo > 80));
const foraComBolaPerto = fora.filter(r => r.dBola <= solta);
console.log(`
  dos ${fora.length} fora da regra:`);
console.log(`    com a bola a MENOS de ${solta} m do dono (guarda activa)   ${foraComBolaPerto.length}`);
console.log(`    com a bola ja sobrada (guarda desligada)              ${fora.length - foraComBolaPerto.length}`);
const ds = roubos.map(r => r.dBola).sort((a, b) => a - b);
console.log(`    distancia da bola ao dono: mediana ${ds[Math.floor(ds.length / 2)].toFixed(2)} m`);

const foraPertoPorContacto = foraComBolaPerto.filter(r => r.porContacto);
console.log(`
  dos ${foraComBolaPerto.length} fora da regra COM a guarda activa:`);
console.log(`    passaram pelo resolveBallContact (onde a guarda vive)   ${foraPertoPorContacto.length}`);
console.log(`    mudaram de dono por OUTRO caminho                      ${foraComBolaPerto.length - foraPertoPorContacto.length}`);
