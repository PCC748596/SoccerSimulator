/*
A MATADA NO PEITO EXISTE?

Relato: *"em um frame a bola esta no ar, no outro no chao. A matada no peito
propriamente dita nao existe. A bola tem que amortecer no peito do jogador pra
depois cair no pe dele."*

Conta os dominios no peito e segue a ALTURA DA BOLA desde o contacto.
*/
const segundos = Number(process.argv[2] || 3600);
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

const lances = [];
let aSeguir = null;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    const noPeito = Match.players.concat(Match.opponents)
        .find(p => p.fsm && p.fsm.currentState === 'CHEST_CONTROL');
    if (noPeito) {
        if (!aSeguir || aSeguir.p !== noPeito) {
            aSeguir = { p: noPeito, alturas: [], cola: [] };
            lances.push(aSeguir);
        }
        aSeguir.alturas.push(Match.ball.position.y);
        aSeguir.cola.push(noPeito.peitoCola || 0);
    } else if (aSeguir) {
        aSeguir = null;
    }
}

console.log('BallControl.peitoCola = ' + BallControl.peitoCola +
    '   peitoDur = ' + BallControl.peitoDur + '\n');
if (!lances.length) { console.log('NENHUM dominio no peito em ' + segundos + ' s'); process.exit(0); }
console.log(lances.length + ' dominios no peito em ' + (segundos / 60).toFixed(0) + ' min\n');
const dur = lances.map(l => l.alturas.length / 60);
console.log('  duracao do gesto: media ' + (dur.reduce((a, b) => a + b, 0) / dur.length).toFixed(2) +
    ' s   min ' + Math.min(...dur).toFixed(2) + '   max ' + Math.max(...dur).toFixed(2));
console.log('\n  altura da bola ao longo do gesto (3 primeiros lances):');
for (const l of lances.slice(0, 3)) {
    const amostra = l.alturas.filter((_, k) => k % 4 === 0).slice(0, 14);
    console.log('    ' + amostra.map(a => a.toFixed(2)).join(' '));
}
// Quantos frames a bola passa acima do joelho (ou seja "no peito") ?
let acima = 0, total = 0;
for (const l of lances) for (const a of l.alturas) { total++; if (a > 0.5) acima++; }
console.log('\n  frames com a bola acima de 0.5 m: ' + acima + '/' + total +
    '  (' + (100 * acima / total).toFixed(0) + '%)');
