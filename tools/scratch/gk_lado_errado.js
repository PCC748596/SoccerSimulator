/*
O GUARDA-REDES MERGULHA PARA O LADO CERTO?

No instante em que decide mergulhar, compara o lado do ponto LIDO (com erro)
com o lado do ponto REAL de cruzamento. Conta as vezes em que os dois ficam em
lados opostos do corpo dele - o mergulho ao contrario da bola.

Uso: node tools/scratch/gk_lado_errado.js [segundos]
*/
const segundos = Number(process.argv[2] || 2400);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260922));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let total = 0, ladoErrado = 0, somaErro = 0;
const piores = [];
const origIniciar = GkDive.iniciar.bind(GkDive);
GkDive.iniciar = function (p, alvoX, alvoY, tipo, dirX) {
    // O ponto REAL onde a bola cruza o plano dele, sem erro nenhum.
    const real = (typeof pontoDeIntercepcaoGK === 'function')
        ? pontoDeIntercepcaoGK(Match.ball.position.x, Match.ball.position.y, Match.ball.position.z,
            Match.ballVel.x, Match.ballVel.y, Match.ballVel.z,
            p.model.position.z, BallPhysics.gravidade)
        : null;
    if (real) {
        total++;
        const lateralLido = alvoX - p.model.position.x;
        const lateralReal = real.x - p.model.position.x;
        const erro = Math.abs(alvoX - real.x);
        somaErro += erro;
        // So conta como "lado errado" se os dois estiverem a mais de meio metro
        // do corpo: com a bola em cima dele o lado nao quer dizer nada.
        if (Math.abs(lateralReal) > 0.5 && Math.abs(lateralLido) > 0.5 &&
            Math.sign(lateralLido) !== Math.sign(lateralReal)) {
            ladoErrado++;
            piores.push({ lido: lateralLido, real: lateralReal, erro: erro, t: real.t });
        }
    }
    return origIniciar(p, alvoX, alvoY, tipo, dirX);
};

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

console.log(total + ' mergulhos | erro de leitura medio ' + (somaErro / Math.max(1, total)).toFixed(2) + ' m');
console.log('  para o LADO ERRADO: ' + ladoErrado + ' (' + (100 * ladoErrado / Math.max(1, total)).toFixed(0) + '%)');
for (const c of piores.slice(0, 6)) {
    console.log('    leu ' + c.lido.toFixed(2) + ' m, a bola ia a ' + c.real.toFixed(2) +
        ' m | erro ' + c.erro.toFixed(2) + ' m | faltavam ' + c.t.toFixed(2) + ' s');
}
