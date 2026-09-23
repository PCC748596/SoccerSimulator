/*
FALTAS DE CONTACTO: quem é marcado como infractor, e de que lado veio o toque?

Relato: *"Um atacante estava com a bola, quase dentro da área, e na hora que ia
chutar foi marcado falta contra ele. O marcador estava atrás dele, ninguem à
frente. Como pode ter uma falta contra ele?"*

    node tools/lab/falta_pelas_costas.js [segundos] [semente]

O `Officials._avaliarContactos` escolhe o infractor por VELOCIDADE — "quem
entra é quem vai mais depressa". Um atacante a arrancar para rematar vai mais
depressa do que o defesa que o persegue, portanto é ele o infractor mesmo
levando o toque pelas costas.

Aqui envolve-se o `marcarFalta` para registar, em cada falta de contacto, se o
infractor tinha a bola e de que lado veio o outro.
*/
require('../headless/harness.js');

const segundos = Number(process.argv[2] || 1800);
const semente = Number(process.argv[3] || 1);
let s = semente >>> 0;
Math.random = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = true;

const regs = [];
const original = Officials.marcarFalta;
Officials.marcarFalta = function (infractor, vitima, dados) {
    if (infractor && vitima && dados && dados.tipo === 'contacto') {
        /*
        DE QUE LADO veio o infractor, visto pela VÍTIMA: 0 rad de frente,
        PI pelas costas. É a mesma conta do `_anguloDeAtaque` do jogo.
        */
        const ang = (typeof this._anguloDeAtaque === 'function')
            ? this._anguloDeAtaque(infractor, vitima) : null;
        /*
        E O MESMO ANGULO AO CONTRARIO: de que lado estava a VITIMA, vista pelo
        INFRACTOR. E este que descreve o caso relatado — o portador punido com
        o adversario atras DELE. Medir so o primeiro dava 0 casos, porque
        media o lado errado.
        */
        const angInverso = (typeof this._anguloDeAtaque === 'function')
            ? this._anguloDeAtaque(vitima, infractor) : null;
        regs.push({
            infractorTinhaBola: (Match.ballCarrier === infractor),
            vitimaTinhaBola: (Match.ballCarrier === vitima),
            angulo: ang,
            anguloInverso: angInverso,
            vInf: infractor.velocity ? infractor.velocity.length() : 0,
            vVit: vitima.velocity ? vitima.velocity.length() : 0
        });
    }
    return original.call(this, infractor, vitima, dados);
};

const dt = 1 / 60;
for (let i = 0; i < segundos * 60; i++) Match.update(dt);

const f = (n, d) => d ? (100 * n / d).toFixed(0) + '%' : '-';
const comBola = regs.filter(r => r.infractorTinhaBola);
const pelasCostas = regs.filter(r => r.angulo !== null && r.angulo > Math.PI * 0.6);
// O CASO RELATADO: quem tinha a bola foi punido, e o outro vinha ATRAS dele.
const oPiorCaso = regs.filter(r => r.infractorTinhaBola &&
    r.anguloInverso !== null && r.anguloInverso > Math.PI * 0.6);

console.log(`\n${segundos}s, semente ${semente} — faltas de CONTACTO: ${regs.length}`);
console.log(`  o infractor era quem TINHA A BOLA          ${comBola.length}  (${f(comBola.length, regs.length)})`);
console.log(`  o toque veio PELAS COSTAS da vitima        ${pelasCostas.length}  (${f(pelasCostas.length, regs.length)})`);
console.log(`  O CASO RELATADO: o portador foi punido`);
console.log(`  com o adversario ATRAS dele               ${oPiorCaso.length}  (${f(oPiorCaso.length, regs.length)})`);
if (comBola.length) {
    console.log('');
    console.log('  das faltas em que o portador foi punido, de que lado estava o outro:');
    for (const b of [[0, 0.3, 'a frente dele'], [0.3, 0.6, 'ao lado'], [0.6, 1.0, 'ATRAS dele']]) {
        const g = comBola.filter(r => r.anguloInverso !== null &&
            r.anguloInverso >= b[0] * Math.PI && r.anguloInverso < b[1] * Math.PI);
        console.log(`    ${b[2].padEnd(16)} ${String(g.length).padStart(3)}`);
    }
}

console.log('\npor angulo de onde veio o infractor (visto pela vitima):');
for (const b of [[0, 0.3], [0.3, 0.6], [0.6, 1.0]]) {
    const g = regs.filter(r => r.angulo !== null &&
        r.angulo >= b[0] * Math.PI && r.angulo < b[1] * Math.PI);
    const nome = b[0] === 0 ? 'de frente' : (b[0] === 0.3 ? 'de lado' : 'pelas costas');
    console.log(`  ${nome.padEnd(14)} ${String(g.length).padStart(4)} faltas, ` +
        `o infractor tinha a bola em ${f(g.filter(r => r.infractorTinhaBola).length, g.length)}`);
}
