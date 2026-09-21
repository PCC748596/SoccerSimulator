/*
O QUE ACONTECE A BOLA QUANDO O GUARDA-REDES LHE TOCA.

Relato: *"ele nao esta segurando a bola. A bola toca na mao do goleiro e ela
vai instantaneamente para o gramado"*.

Conta os desfechos do `resolverDefesaGK` -- agarrar, espalmar, rocar -- por
tipo de defesa, e mede a velocidade com que a bola SAI quando nao e agarrada.
*/
const segundos = Number(process.argv[2] || 2400);
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

const contas = new Map();   // tipo -> { agarrou, espalmou, rocou }
const orig = global.resolverDefesaGK;
global.resolverDefesaGK = function (o) {
    const r = orig.apply(this, arguments);
    const t = (o && o.tipo) || '?';
    if (!contas.has(t)) contas.set(t, { agarrou: 0, espalmou: 0, rocou: 0, outros: 0, n: 0 });
    const c = contas.get(t);
    c.n++;
    // O `resolverDefesaGK` devolve `resultado` com 'agarra' | 'espalma' | 'roca'.
    const d = r && (r.resultado || r.desfecho);
    if (d === 'agarra') c.agarrou++;
    else if (d === 'roca') c.rocou++;
    else if (d === 'espalma') c.espalmou++;
    else c.outros++;
    return r;
};

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

if (!contas.size) { console.log('sem defesas'); process.exit(0); }
console.log('DESFECHO DAS DEFESAS (resolverDefesaGK):\n');
console.log('  tipo         n    agarrou   rocou   espalmou   outros');
let tot = { n: 0, agarrou: 0 };
for (const [t, c] of contas) {
    tot.n += c.n; tot.agarrou += c.agarrou;
    console.log('  ' + t.padEnd(11) + String(c.n).padStart(3) + '   ' +
        (100 * c.agarrou / c.n).toFixed(0).padStart(5) + '%  ' +
        (100 * c.rocou / c.n).toFixed(0).padStart(5) + '%  ' +
        (100 * c.espalmou / c.n).toFixed(0).padStart(7) + '%  ' +
        (100 * c.outros / c.n).toFixed(0).padStart(6) + '%');
}
console.log('\n  no total: ' + (100 * tot.agarrou / tot.n).toFixed(0) + '% agarradas de ' + tot.n);
console.log('\n  chaves do config: alcanceContacto ' + GkCatchModel.alcanceContacto +
    '   base.maos ' + GkCatchModel.base.maos + '   base.mergulho ' + GkCatchModel.base.mergulho);
