/*
A QUE DISTANCIA DO GUARDA-REDES E QUE A BOLA E REBATIDA.

Relato, com captura: *"o goleiro caiu para defender a bola mas a bola foi
rebatida a uns 2 metros do goleiro"*.

Nao instrumenta um caminho em particular: observa a BOLA. Guarda a velocidade
antes do frame e, se ela mudar de direccao de forma brusca sem ninguem de campo
por perto, mede onde estava a bola em relacao as MAOS e ao CORPO do
guarda-redes mais proximo. E o que se ve no ecra, venha o toque de que ramo
vier.

Corre com: node tools/scratch/gk_defesa_distancia.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 600);
const semente = Number(process.argv[3] || 4242);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(semente);
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const _v = new THREE.Vector3();
const antes = new THREE.Vector3();
const posAntes = new THREE.Vector3();

const guardaRedes = () => Match.players.concat(Match.opponents).filter(p => p.role === 'gk');

// Distancia da bola a mao mais proxima e ao corpo (coluna vertical nos pes).
function medir(gk, bola) {
    let mao = Infinity;
    for (const nome of ['lHand', 'rHand']) {
        const m = gk.rig && gk.rig[nome];
        if (!m) continue;
        m.getWorldPosition(_v);
        const d = _v.distanceTo(bola);
        if (d < mao) mao = d;
    }
    const alt = (typeof GkCatchModel !== 'undefined' && GkCatchModel.alturaCorpo) || 1.85;
    const py = gk.model.position.y;
    const yFechado = Math.max(py, Math.min(py + alt, bola.y));
    const corpo = Math.hypot(bola.x - gk.model.position.x,
        yFechado - bola.y, bola.z - gk.model.position.z);
    return { mao, corpo };
}

/*
QUEM E QUE TOCOU. Marca-se o ramo a medida que ele corre, para o toque poder
ser atribuido em vez de adivinhado.
*/
let ramo = null;
const Jog = Object.getPrototypeOf(Match.players.find(p => p.role === 'gk'));
const origMaos = Jog.resolverDefesaComMaos;
Jog.resolverDefesaComMaos = function (tipo, ext) { ramo = 'maos:' + tipo; return origMaos.call(this, tipo, ext); };
if (typeof GkDive !== 'undefined' && GkDive.defender) {
    const origDef = GkDive.defender.bind(GkDive);
    GkDive.defender = function (p, rig) { const antesTocou = p.dive && p.dive.tocou; const r = origDef(p, rig);
        if (p.dive && p.dive.tocou && !antesTocou) ramo = 'mergulho'; return r; };
}
if (typeof Jog.saidaAoCruzamento === 'function') {
    const origSai = Jog.saidaAoCruzamento;
    Jog.saidaAoCruzamento = function () { const r = origSai.apply(this, arguments); if (r) ramo = 'saida_cruzamento'; return r; };
}
/*
A ARMACAO E A REDE TAMBEM MUDAM A DIRECCAO DA BOLA, e vivem em cima do
guarda-redes. Sem as marcar, qualquer bola no poste era contada como defesa
dele -- que foi o erro da primeira passagem desta ferramenta.
*/
const _vAntesBal = new THREE.Vector3();
const origBaliza = Match.colidirComBaliza.bind(Match);
Match.colidirComBaliza = function () { _vAntesBal.copy(Match.ballVel); const r = origBaliza();
    if (!_vAntesBal.equals(Match.ballVel)) ramo = 'armacao (poste/travessa)'; return r; };
const origRede = Match.colidirComRede.bind(Match);
Match.colidirComRede = function (z) { _vAntesBal.copy(Match.ballVel); const r = origRede(z);
    if (!_vAntesBal.equals(Match.ballVel)) ramo = 'rede'; return r; };
const origContacto = Match.resolveBallContact.bind(Match);
Match.resolveBallContact = function () { _vAntesBal.copy(Match.ballVel); const r = origContacto();
    if (!ramo && !_vAntesBal.equals(Match.ballVel)) ramo = 'resolveBallContact'; return r; };

const casos = [];
for (let i = 0; i < Math.round(segundos / dt); i++) {
    ramo = null;
    antes.copy(Match.ballVel);
    posAntes.copy(Match.ball.position);
    const vAntes = antes.length();
    Match.update(dt);
    if (vAntes < 6) continue;                       // so remates a serio
    const vDepois = Match.ballVel.length();
    if (vDepois < 0.001) continue;
    /*
    Mudanca de direccao brusca = alguem lhe tocou -- mas medida SO NA
    HORIZONTAL. Um ressalto no relvado inverte o `y` e mais nada, e com o
    angulo em 3D contava como toque: era metade dos casos "longe de tudo" da
    primeira passagem desta ferramenta, com a bola a 7-8 m/s e o guarda-redes
    a cinco metros.
    */
    const hAntesX = antes.x, hAntesZ = antes.z;
    const hA = Math.hypot(hAntesX, hAntesZ);
    const hD = Math.hypot(Match.ballVel.x, Match.ballVel.z);
    if (hA < 1e-3 || hD < 1e-3) continue;
    const cos = (hAntesX * Match.ballVel.x + hAntesZ * Match.ballVel.z) / (hA * hD);
    if (cos > 0.85) continue;

    // O guarda-redes mais proximo, e so se for ele o mais perto de todos.
    let gk = null, dGk = Infinity;
    for (const g of guardaRedes()) {
        const d = g.model.position.distanceTo(posAntes);
        if (d < dGk) { dGk = d; gk = g; }
    }
    if (!gk || dGk > 6) continue;
    let outro = Infinity;
    for (const p of Match.players.concat(Match.opponents)) {
        if (p.role === 'gk') continue;
        const d = p.model.position.distanceTo(posAntes);
        if (d < outro) outro = d;
    }
    if (outro < dGk) continue;                      // foi um jogador de campo

    const m = medir(gk, posAntes);
    casos.push({ mao: m.mao, corpo: m.corpo, estado: gk.gkEstado || '?', vAntes, dGk,
        ramo: ramo || 'NENHUM (fisica/resolveBallContact)' });
}

if (!casos.length) { console.log('sem defesas em ' + segundos + ' s'); process.exit(0); }

const alcMao = (typeof GkCatchModel !== 'undefined' && GkCatchModel.alcanceContacto) || 0.55;
const raioMao = (typeof GoalkeeperDive !== 'undefined' && GoalkeeperDive.raioMao) || 0.42;
const raioBola = BallPhysics.raio;
console.log('alcanceContacto (maos, de pe) ' + alcMao.toFixed(2) +
    '   raioMao (mergulho) ' + raioMao.toFixed(2) + ' + bola ' + raioBola.toFixed(2) +
    ' = ' + (raioMao + raioBola).toFixed(2));

console.log('\n' + casos.length + ' toques do guarda-redes. Distancia da BOLA no instante do toque:');
const ord = casos.slice().sort((a, b) => b.mao - a.mao);
console.log('\n  os 12 mais longe da mao:');
console.log('    mao     corpo   estado            vel bola');
for (const c of ord.slice(0, 12)) {
    console.log('   ' + c.mao.toFixed(2).padStart(5) + '   ' + c.corpo.toFixed(2).padStart(5) +
        '   ' + c.estado.padEnd(12) + c.ramo.padEnd(28) + c.vAntes.toFixed(1).padStart(5) + ' m/s' +
        (c.mao > 1.0 && c.corpo > 0.9 ? '   <<< longe de tudo' : ''));
}

const med = f => casos.reduce((a, c) => a + f(c), 0) / casos.length;
const conta = f => casos.filter(f).length;
console.log('\n  mao: media ' + med(c => c.mao).toFixed(2) + ' m, maxima ' +
    Math.max(...casos.map(c => c.mao)).toFixed(2) + ' m');
console.log('  corpo: media ' + med(c => c.corpo).toFixed(2) + ' m, maxima ' +
    Math.max(...casos.map(c => c.corpo)).toFixed(2) + ' m');
console.log('  toques com a bola a mais de 1 m da mao E do corpo: ' +
    conta(c => c.mao > 1.0 && c.corpo > 0.9) + ' de ' + casos.length);
console.log('  toques com a bola a mais de 2 m da mao E do corpo: ' +
    conta(c => c.mao > 2.0 && c.corpo > 2.0) + ' de ' + casos.length);

const porRamo = new Map();
for (const c of casos) { if (!porRamo.has(c.ramo)) porRamo.set(c.ramo, []); porRamo.get(c.ramo).push(c); }
console.log(String.fromCharCode(10) + '  por ramo que mudou a direccao da bola:');
for (const par of [...porRamo.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const lista = par[1];
    const mm = lista.reduce((a, c) => a + c.mao, 0) / lista.length;
    console.log('    ' + par[0].padEnd(34) + String(lista.length).padStart(4) + ' toques   ' +
        'mao media ' + mm.toFixed(2) + ' m   maxima ' +
        Math.max(...lista.map(c => c.mao)).toFixed(2) + ' m');
}

const porEstado = new Map();
for (const c of casos) {
    if (!porEstado.has(c.estado)) porEstado.set(c.estado, []);
    porEstado.get(c.estado).push(c);
}
console.log('\n  por estado do guarda-redes:');
for (const [e, lista] of [...porEstado.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const mm = lista.reduce((a, c) => a + c.mao, 0) / lista.length;
    console.log('    ' + e.padEnd(16) + String(lista.length).padStart(4) + ' toques   ' +
        'mao media ' + mm.toFixed(2) + ' m   maxima ' +
        Math.max(...lista.map(c => c.mao)).toFixed(2) + ' m');
}
