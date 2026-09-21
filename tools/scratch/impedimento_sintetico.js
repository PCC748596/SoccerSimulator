/*
A MONTAGEM DO IMPEDIMENTO CONTRA A POSICAO DA BOLA.

Em vez de esperar por um impedimento ao calhas, provoca-se um em varios pontos
do campo e mede-se onde ficam as 22 pessoas. O que se quer ver: a distancia de
cada equipa a bola, e se as duas acabam em metades opostas.
*/
require('../headless/harness.js');
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

// A equipa que cobra e sempre a TeamB (o impedimento foi da TeamA).
function montar(bolaX, bolaZ) {
    Match.ball.position.set(bolaX, BallPhysics.raio, bolaZ);
    Match.ballVel.set(0, 0, 0);
    Match.ballCarrier = null;
    Match.faltaIndirecta = true;
    Match.setupSetPiece('FREE_KICK', 'TeamB');

    const bola = Match.ball.position;
    const r = {};
    for (const [nome, lista] of [['cobra(TeamB)', Match.opponents], ['marca(TeamA)', Match.players]]) {
        const campo = lista.filter(p => p.role !== 'gk');
        const ds = campo.map(p => Math.hypot(p.model.position.x - bola.x, p.model.position.z - bola.z));
        const zs = campo.map(p => p.model.position.z);
        r[nome] = {
            perto: Math.min(...ds), longe: Math.max(...ds),
            media: ds.reduce((a, b) => a + b, 0) / ds.length,
            zMin: Math.min(...zs), zMax: Math.max(...zs),
            // quantos estao na metade do campo OPOSTA a da bola
            outraMetade: campo.filter(p => Math.sign(p.model.position.z) !== Math.sign(bolaZ) && bolaZ !== 0).length
        };
    }
    return r;
}

console.log('CAMPO_COMP ' + CAMPO_COMP + '  (linha de fundo em z = +-' + (CAMPO_COMP / 2) + ')');
console.log('\n                      quem COBRA (TeamB)              quem MARCA (TeamA)');
console.log(' bola z    perto  media  longe  noutra   |   perto  media  longe  noutra');
for (const z of [-40, -30, -20, -10, 0, 10, 20, 30, 40]) {
    const r = montar(0, z);
    const c = r['cobra(TeamB)'], m = r['marca(TeamA)'];
    console.log('  ' + String(z).padStart(4) + '    ' +
        c.perto.toFixed(1).padStart(5) + '  ' + c.media.toFixed(1).padStart(5) + '  ' +
        c.longe.toFixed(1).padStart(5) + '   ' + String(c.outraMetade).padStart(2) + '/10' +
        '   |   ' +
        m.perto.toFixed(1).padStart(5) + '  ' + m.media.toFixed(1).padStart(5) + '  ' +
        m.longe.toFixed(1).padStart(5) + '   ' + String(m.outraMetade).padStart(2) + '/10');
}
