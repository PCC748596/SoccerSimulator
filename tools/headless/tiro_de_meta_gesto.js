/*
O GESTO DO TIRO DE META SEGUE A DECISAO. Relato: *"se o goleiro vai dar um passe curto tem que executar a animacao
de passe curto; se for chutar para a frente, a do lancamento. Esta dando bico em todo tiro de meta"*.
Para cada tiro de meta mede: o gesto que arrancou (gkKickClipNome: 'pass' | 'lancamento' | 'goalKick') e o que a
bola fez (distancia ao fim de 1 s e se o receptor previsto e um defesa). Curto deve dar 'pass'; longo 'lancamento'.
Uso: node tools/headless/tiro_de_meta_gesto.js [quantos] [semente]
*/
const quantos = Number(process.argv[2] || 12);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(777 + semente * 31);
require('./harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const cont = { pass: 0, lancamento: 0, goalKick: 0 }; const incoerentes = [];
for (let n = 0; n < quantos; n++) {
    for (let i = 0; i < 300; i++) Match.update(dt);
    const equipa = (n % 2 === 0) ? 'TeamA' : 'TeamB';
    const lista = equipa === 'TeamA' ? Match.players : Match.opponents;
    const gk = lista.find(p => p.role === 'gk');
    const attDir = lista[0].dirZ;
    Match.ball.position.set(20 * (n % 3 - 1), 0.2, -attDir * (CAMPO_COMP / 2 + 1));
    Match.ballVel.set(0, 0, 0);
    Match.setupSetPiece('GOAL_KICK', equipa);
    let gesto = null, modo = null, v0 = null, alvoPos = null;
    for (let f = 0; f < 60 * 25; f++) {
        Match.update(dt);
        if (!gesto && gk.gkEstado === 'chutando') { gesto = gk.gkKickClipNome; modo = gk.gkModoTM; }
        if (gesto && Match.state === 'PLAY' && v0 === null) { v0 = Match.ballVel.length(); alvoPos = Match.intendedReceiver ? Match.intendedReceiver.pos : null; break; }
    }
    if (gesto) cont[gesto]++;
    console.log(`  #${n + 1} ${equipa}: gesto ${gesto} | modo planeado ${modo} | vel inicial da bola ${v0 === null ? '-' : v0.toFixed(1)} m/s | receptor ${alvoPos}`);
    const esperado = modo === 'curto' ? 'pass' : modo === 'longo' ? 'lancamento' : 'goalKick';
    if (gesto && gesto !== esperado) incoerentes.push(n + 1);
    Match.state = 'PLAY';
}
console.log(`semente ${semente}: gestos ${JSON.stringify(cont)}; gestos que nao seguem o modo: ${incoerentes.length}`);
