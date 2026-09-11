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

/*
UMA POSSE LONGA NAO PODE VALER POR TODAS.

A medicao era por LEITURA, e uma unica posse em que o guarda-redes fica com a
bola muito tempo enchia a amostra sozinha: quatro sementes davam 3 677, 4 606,
5 973 e 24 332 leituras, e era a de 24 332 que decidia o resultado. Medido com
a stamina ligada e desligada, a percentagem saltava entre 6.4% e 16% pela
semente e nao pelo codigo — o teste passava por sorte.

Cada episodio conta no maximo `LEITURAS_POR_EPISODIO` leituras. E o que se
quer saber de qualquer maneira: se ao ARRANCAR a posse a equipa se poe a
caminho depressa, e nao o que faz o jogador que ja la esta ha trinta segundos.
*/
const LEITURAS_POR_EPISODIO = 400;

let leituras = 0, lentos = 0, soma = 0, episodios = 0;
let anterior = false;
let leiturasDesteEpisodio = 0;
for (let i = 0; i < Math.round(2400 / dt); i++) {
    Match.update(dt);
    if (i % 6) continue;
    for (const [eq, lista] of [['TeamA', Match.players], ['TeamB', Match.opponents]]) {
        const gk = lista[0];
        const segura = !!(Match.gkHoldingBall && Match.gkHoldingBall[eq]);
        if (eq === 'TeamA') {
            if (segura && !anterior) { episodios++; leiturasDesteEpisodio = 0; }
            anterior = segura;
        }
        if (!segura || !gk) continue;
        if (leiturasDesteEpisodio >= LEITURAS_POR_EPISODIO) continue;
        for (const p of lista) {
            if (p === gk || p.role === 'gk') continue;
            // So quem ainda tem caminho a fazer: quem chegou pode andar.
            const dAlvo = p.dynamicTarget ? p.model.position.distanceTo(p.dynamicTarget) : 0;
            if (dAlvo <= (RepositionPace.pisoSaidaDeBolaDist || 1.2)) continue;
            leituras++;
            leiturasDesteEpisodio++;
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
    /*
    O TECTO SAI DA DISPERSAO MEDIDA, e nao de um numero redondo.

    Estava em 8% e caia no MEIO da dispersao das sementes. Medido com o corte
    por episodio ja aplicado, quatro sementes com a stamina ligada e as mesmas
    quatro com ela desligada:

        semente      20260911   7      99     1234    media
        stamina ON      8.6%   6.3%   8.3%   7.9%     7.8%
        stamina OFF     7.4%   7.7%   8.3%   7.7%     7.8%

    A mesma media nas duas colunas — o cansaco nao mexe nisto —, e um tecto de
    8% reprovava metade das sementes de qualquer das duas. A 10% ainda apanha
    o que este teste existe para apanhar: antes do corte por episodio, uma
    posse encravada dava 16%, e gente a ANDAR (abaixo de 1.9 m/s) daria muito
    mais do que isso.
    */
    assert.ok(pct < 10,
        `${pct.toFixed(0)}% das leituras abaixo de 3 m/s com caminho por fazer`);
    assert.ok(soma / Math.max(1, leituras) > 4.5,
        `velocidade media de ${(soma / Math.max(1, leituras)).toFixed(2)} m/s a sair a jogar`);
});
