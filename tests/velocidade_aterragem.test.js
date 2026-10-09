/*
VELOCIDADE MAXIMA +10% E A RECUPERACAO DEPOIS DO CABECEIO.

Pedido (9 de Outubro de 2026): *"aumenta so a velocidade dos jogadores e reduz a velocidade de quem pula na cabeca por
uns 3 s depois que volta ao solo"*. (O modelo de aceleracao e a finta de arranque foram desfeitos: os jogadores
deslizavam e a performance caiu.)

Corre com: node tests/velocidade_aterragem.test.js
*/
require('../tools/headless/harness.js');
let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { console.log('  X ' + m); falhas++; };
const verifica = (c, bom, mau) => { if (c) ok(bom); else erro(mau); };
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
const dt = 1 / 60;
Match.init(new THREE.Scene());
Match.state = 'PLAY';

console.log('1 — velocidade maxima +10%');
verifica(Math.abs(VelocidadeHumana.maximo - 10.45) < 1e-9 && Math.abs(VelocidadeHumana.amplitude - 2.42) < 1e-9,
    'maximo 10.45 e amplitude 2.42', `maximo ${VelocidadeHumana.maximo}, amplitude ${VelocidadeHumana.amplitude}`);
verifica(typeof AceleracaoModel === 'undefined', 'sem modelo de aceleracao (desfeito)', 'AceleracaoModel ainda existe');
verifica(!DribbleModel.finta, 'sem finta de arranque (desfeita)', 'DribbleModel.finta ainda existe');

console.log('2 — a aterragem do cabeceio tira velocidade durante ~3 s');
const p = Match.players[7];
const A = SaltoCabeceio.aterragem;
verifica(A && A.activo && A.duracaoFalhou === 3.0 && A.duracaoTocou === 3.0, 'recuperacao de 3 s configurada', 'SaltoCabeceio.aterragem errada');
for (const tocou of [false, true]) {
    p.aterragemT = 0; p.jumpTimer = 0.001; p.hasHeaderedInJump = tocou;
    p.avaliarSaltoDeCabeceio(0.02);
    verifica(Math.abs(p.aterragemT - 3.0) < 0.05, `${tocou ? 'a tocar' : 'sem tocar'}: ${p.aterragemT.toFixed(2)} s`, `${tocou ? 'a tocar' : 'sem tocar'}: ${p.aterragemT}`);
}
const correr = (rec, t) => {
    p.model.position.set(0, ALTURA_BASE_Y, 0); p.velocity.set(0, 0, 0);
    p.aterragemT = rec ? 3.0 : 0; p.aterragemDur = 3.0;
    const alvo = new THREE.Vector3(0, ALTURA_BASE_Y, 200);
    for (let i = 0; i < Math.round(t / dt); i++) { Match.delta = dt; p.steerArrive(alvo, 10, 0); p.model.position.addScaledVector(p.velocity, dt); }
    return p.velocity.length();
};
const norm1 = correr(false, 1.0), lento1 = correr(true, 1.0), lento35 = correr(true, 3.6), norm35 = correr(false, 3.6);
verifica(lento1 < norm1 * 0.75, `1 s depois de aterrar: ${lento1.toFixed(2)} m/s contra ${norm1.toFixed(2)} sem recuperacao`, `nao abrandou (${lento1.toFixed(2)} vs ${norm1.toFixed(2)})`);
verifica(Math.abs(lento35 - norm35) < 0.3, `passados os 3 s volta ao normal (${lento35.toFixed(2)} vs ${norm35.toFixed(2)})`, `nao recuperou (${lento35.toFixed(2)} vs ${norm35.toFixed(2)})`);

console.log(falhas ? '\nFALHOU: ' + falhas : '\nOK');
process.exit(falhas ? 1 : 0);
