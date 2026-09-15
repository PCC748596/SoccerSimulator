/*
A SAIDA AO CRUZAMENTO: quantas vezes acontece, e o que da.

Conta as saidas (projeccao dentro da pequena area), e o desfecho: agarrou,
escapou-lhe, ou socou. No soco mede o angulo entre a saida da bola e a
trajectoria invertida - tem de ficar dentro dos 10 graus pedidos.

Uso: node tools/scratch/gk_saida_cruzamento.js [segundos]
EOF_DOC */
const segundos = Number(process.argv[2] || 2400);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260923));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let saidas = 0, agarrou = 0, escapou = 0, socou = 0;
const angulos = [];
const proto = Object.getPrototypeOf(Match.players[0]);
const orig = proto.resolverSaidaAoCruzamento;
proto.resolverSaidaAoCruzamento = function () {
    const velAntes = { x: Match.ballVel.x, z: Match.ballVel.z };
    const tinha = this.hasBall;
    const r = orig.apply(this, arguments);
    if (!r) return r;
    saidas++;
    if (this.hasBall && !tinha) agarrou++;
    else {
        const v = Math.hypot(Match.ballVel.x, Match.ballVel.z);
        const vAnt = Math.hypot(velAntes.x, velAntes.z);
        // Soco: a bola inverteu o sentido. Escape: manteve.
        const dot = (Match.ballVel.x * velAntes.x + Match.ballVel.z * velAntes.z) / Math.max(1e-6, v * vAnt);
        if (dot < 0) {
            socou++;
            const ang = Math.acos(Math.max(-1, Math.min(1, -dot))) * 180 / Math.PI;
            angulos.push(ang);
        } else escapou++;
    }
    return r;
};

let framesFlag = 0, episodiosFlag = 0, saltos = 0;
let antFlag = false, antSalto = false;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    const gks = [Match.players[0], Match.opponents[0]];
    const flag = gks.some(g => g && g.gkSaiuAoCruzamento);
    const salto = gks.some(g => g && g.gkEstado === 'salto_alto');
    if (flag) { framesFlag++; if (!antFlag) episodiosFlag++; }
    if (salto && !antSalto) saltos++;
    antFlag = flag; antSalto = salto;
}
console.log('bandeira de saida activa em ' + episodiosFlag + ' episodios (' + framesFlag + ' frames)');
console.log('saltos altos: ' + saltos);

console.log(saidas + ' saidas ao cruzamento em ' + (segundos / 60).toFixed(0) + ' min');
console.log('  agarrou ' + agarrou + ' | escapou ' + escapou + ' | socou ' + socou);
if (angulos.length) {
    angulos.sort((a, b) => a - b);
    console.log('  desvio do soco face a trajectoria invertida: medio ' +
        (angulos.reduce((a, b) => a + b, 0) / angulos.length).toFixed(1) +
        ' graus | maximo ' + angulos[angulos.length - 1].toFixed(1) + ' (limite 10)');
}
