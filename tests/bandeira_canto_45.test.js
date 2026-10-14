/*
A BANDEIRA NO CANTO A 45 GRAUS. Pedido: na sinalizacao do corner o bandeirinha aponta a bandeira para o corner num
angulo de 45 graus para baixo. Mede, com o assistente a apontar, a haste (eixo -y da mao direita): a elevacao tem de
ser 45 +- 3 graus abaixo da horizontal e o azimute apontar ao canto (+- 3 graus), nos quatro cantos.
(O tiro de meta continua como estava: braco quase horizontal.)
*/
require('../tools/headless/harness.js');
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = false;
let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const cena = new THREE.Scene(); Match.init(cena); Officials.arbitro = null; Officials.init(cena);

for (const [cx, cz] of [[34, 52.5], [-34, 52.5], [34, -52.5], [-34, -52.5]]) {
    Match.state = 'CORNER_KICK';
    const o = Officials.assistentes[cx > 0 ? 0 : 1];
    Officials.apontarBandeira('CORNER_KICK', { x: cx, z: cz });
    let medido = null;
    for (let i = 0; i < 60 * 3 && !medido; i++) {
        Match.delta = 1 / 60; Officials.update(1 / 60);
        if (o.bandeira && o.bandeira.fase === 'horizontal' && o.bandeira.t > 0.8) {
            o.model.updateMatrixWorld(true);
            const q = new THREE.Quaternion(); o.rig.rHand.getWorldQuaternion(q);
            const d = new THREE.Vector3(0, -1, 0).applyQuaternion(q);
            const elev = Math.asin(THREE.MathUtils.clamp(-d.y, -1, 1)) * 180 / Math.PI;
            const p = o.model.position, azC = Math.atan2(cx - p.x, cz - p.z), azH = Math.atan2(d.x, d.z);
            medido = { elev, dif: Math.abs(Math.atan2(Math.sin(azH - azC), Math.cos(azH - azC))) * 180 / Math.PI };
        }
    }
    if (!medido) { erro(`canto (${cx}, ${cz}): o assistente nunca chegou a apontar`); continue; }
    console.log(`canto (${cx}, ${cz}): haste ${medido.elev.toFixed(1)} graus abaixo da horizontal, desvio do azimute ${medido.dif.toFixed(1)}`);
    if (Math.abs(medido.elev - 45) > 3) erro(`canto (${cx}, ${cz}): elevacao ${medido.elev.toFixed(1)} (esperado 45)`);
    if (medido.dif > 3) erro(`canto (${cx}, ${cz}): a haste desvia ${medido.dif.toFixed(1)} graus do canto`);
    o.bandeira = null; Match.state = 'PLAY';
}
if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK bandeira_canto_45');
