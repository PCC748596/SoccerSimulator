/*
QUANTAS VEZES O GUARDA-REDES PODIA TOCAR NA BOLA JA ATRAS DA LINHA.

Conta, por jogo simulado, os instantes em que: o jogo esta em PLAY, a bola ja
cruzou a linha de fundo da baliza dele (mas ainda dentro da tolerancia de 1 m
que a regra antiga usava) e uma das maos dele estava ao alcance de contacto.
E a popula\u00e7ao que a regra antiga deixava espalmar de volta para o campo.
*/
const segundos = Number(process.argv[2] || 1800);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 31337));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const _v = new THREE.Vector3();
let episodios = 0, dentro = 0;
let anterior = false;
const alcance = (typeof GkCatchModel !== 'undefined' && typeof GkCatchModel.alcanceContacto === 'number')
    ? GkCatchModel.alcanceContacto : 0.55;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (Match.state !== 'PLAY') { anterior = false; continue; }
    let agora = false;
    for (const gk of [Match.players[0], Match.opponents[0]]) {
        if (!gk || gk.role !== 'gk' || !gk.rig) continue;
        const atras = (Match.ball.position.z - gk.ownGoalZ) * gk.dirZ;
        if (atras > -BallPhysics.raio || atras < -1.0) continue;
        for (const nome of ['lHand', 'rHand']) {
            const mao = gk.rig[nome];
            if (!mao) continue;
            mao.getWorldPosition(_v);
            if (_v.distanceTo(Match.ball.position) <= alcance) agora = true;
        }
        // Estava dentro da moldura? (se sim, teria sido golo antes disto)
        if (agora && Math.abs(Match.ball.position.x) < LARGURA_BALIZA / 2 &&
            Match.ball.position.y < ALTURA_BALIZA) dentro++;
    }
    if (agora && !anterior) episodios++;
    anterior = agora;
}
console.log(episodios + ' episodios em ' + (segundos / 60).toFixed(0) + ' min de jogo simulado' +
    ' (bola ja atras da linha, ao alcance da mao, com o lance ainda em PLAY)');
console.log('  dos quais dentro da moldura: ' + dentro + ' frames');
