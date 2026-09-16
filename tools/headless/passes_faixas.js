/*
PASSES POR FAIXA, com semente fixa.

É a mesma tabela que o lote mostra (`MatchStats.resumoPasses`), mas com semente
— para se poder correr antes e depois de uma alteração e comparar sem ruído.

Foi escrita para o preço do `PassClip`: o gesto do passe passou de 0.2 s sem
animação para 0.35 s com pé de apoio, e a bola sai 0.12 s mais tarde. Nesse
tempo um adversário anda ~0.9 m, e os passes cortados são 40% das posses
perdidas. Se o `pctCortado` subir, o gesto tem de encurtar.

DURACAOPASSE=<segundos> sobrepõe `ActionAnimClips.pass.duration`, para varrer o
preço sem tocar no config.

Uso: node tools/headless/passes_faixas.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 900);
const semente = Number(process.argv[3] || 0);

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(1000 + semente * 977);

require('./harness.js');

if (process.env.DURACAOPASSE) {
    ActionAnimClips.pass.duration = Number(process.env.DURACAOPASSE);
}

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

const A = MatchStats.TeamA, B = MatchStats.TeamB;
const min = Match.tempoDeJogo / 60;
const por90 = (n) => (n * 90 / min).toFixed(2);

console.log(`\nsemente ${semente} | gesto do passe = ${ActionAnimClips.pass.duration} s ` +
    `(bola sai aos ${(ActionAnimClips.pass.duration * ActionAnimClips.pass.contactTime).toFixed(3)} s)\n`);
console.log('  faixa      n    certo  cortado  dominioFalhado  ninguem');
for (const l of MatchStats.resumoPasses()) {
    console.log(`  ${l.faixa.padEnd(8)} ${String(l.n).padStart(4)}   ` +
        `${String(l.pctCerto).padStart(3)}%    ${String(l.pctCortado).padStart(3)}%      ` +
        `${String(l.pctDominioFalhado).padStart(3)}%          ${String(l.pctNinguemTocou).padStart(3)}%`);
}
const certos = A.passes.certos + B.passes.certos;
const tent = A.passes.tentados + B.passes.tentados;
console.log(`\n  passes certos ${(100 * certos / Math.max(1, tent)).toFixed(1)}%  ` +
    `| golos ${por90(A.remates.golos + B.remates.golos)}/90  ` +
    `| ataques perigosos ${por90(A.ataques.perigosos + B.ataques.perigosos)}/90\n`);
