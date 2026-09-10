/*
COM A BOLA NAS MAOS DELE, NINGUEM ANDA.

Relato: "quando o goleiro pega a bola os jogadores do time tem que se
posicionar mais rapido para dar opcao de passes. Tem jogadores andando em
campo."

A pressa ja existia (`RepositionPace.bonusSaidaDeBola`, 1.25x) e a marca chega
a toda a gente -- medido, 100% das leituras com a bola nas maos dele tinham a
marca. O que faltava era o fim do percurso: o ritmo sai da DISTANCIA ao alvo
(RepositionPace.escaloes) e abaixo dos 2 m o escalao e o de ANDAR, 1.73 m/s.
Medido (tools/headless/saida_do_guarda_redes.js, 74 min):

    velocidade media       4.35 m/s
    abaixo de 3 m/s        25% das leituras
    e desses, a mais de 5 m do proprio alvo   6%

Ou seja: quem esta longe ja corre (5.71 m/s de media); quem anda e quem ja esta
quase no sitio. Sao esses os "jogadores andando em campo", e sao os que ainda
tem de acabar de se oferecer.

Entra um PISO de velocidade enquanto ele segura a bola: os ultimos metros
fazem-se a trote, e so se anda quando se chegou mesmo.

Corre com: node --test tests/saida_de_bola_ritmo.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(20260911);

require('../tools/headless/harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let leituras = 0, lentos = 0, soma = 0, episodios = 0;
let anterior = false;
for (let i = 0; i < Math.round(2400 / dt); i++) {
    Match.update(dt);
    if (i % 6) continue;
    for (const [eq, lista] of [['TeamA', Match.players], ['TeamB', Match.opponents]]) {
        const gk = lista[0];
        const segura = !!(Match.gkHoldingBall && Match.gkHoldingBall[eq]);
        if (eq === 'TeamA') {
            if (segura && !anterior) episodios++;
            anterior = segura;
        }
        if (!segura || !gk) continue;
        for (const p of lista) {
            if (p === gk || p.role === 'gk') continue;
            // So quem ainda tem caminho a fazer: quem chegou pode andar.
            const dAlvo = p.dynamicTarget ? p.model.position.distanceTo(p.dynamicTarget) : 0;
            if (dAlvo <= (RepositionPace.pisoSaidaDeBolaDist || 1.2)) continue;
            leituras++;
            const v = p.velocity ? p.velocity.length() : 0;
            soma += v;
            if (v < 3.0) lentos++;
        }
    }
}

test('o piso do ritmo da saida de bola existe na configuracao', () => {
    assert.strictEqual(typeof RepositionPace.pisoSaidaDeBola, 'number',
        'RepositionPace.pisoSaidaDeBola desapareceu');
    assert.ok(RepositionPace.pisoSaidaDeBola >= 3.5,
        `piso de ${RepositionPace.pisoSaidaDeBola} m/s ainda e andar`);
    assert.ok(RepositionPace.pisoSaidaDeBola <= 6.0,
        `piso de ${RepositionPace.pisoSaidaDeBola} m/s: toda a gente a sprintar`);
});

test('ninguem com caminho a fazer anda enquanto ele segura a bola', () => {
    const pct = 100 * lentos / Math.max(1, leituras);
    console.log(`  ${episodios} episodios | ${leituras} leituras de quem ainda tem caminho | ` +
        `velocidade media ${(soma / Math.max(1, leituras)).toFixed(2)} m/s | abaixo de 3 m/s: ${pct.toFixed(0)}%`);
    assert.ok(leituras > 200, `amostra curta: ${leituras}`);
    assert.ok(pct < 8,
        `${pct.toFixed(0)}% das leituras abaixo de 3 m/s com caminho por fazer`);
    assert.ok(soma / Math.max(1, leituras) > 4.5,
        `velocidade media de ${(soma / Math.max(1, leituras)).toFixed(2)} m/s a sair a jogar`);
});
