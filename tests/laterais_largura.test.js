/*
OS LATERAIS DÃO A LARGURA — e não acabam entre os dois centrais.

O relato foi "os laterais ainda estão fechando demais; às vezes ficam mais no
meio que os zagueiros", com uma captura de um lateral a marcar o CF entre os
dois centrais.

Medido fase a fase no `tickFinal`, o |x| do alvo do lateral: 19.9 m no posto,
18.2 m depois da mola de coesão... e 10.4 m depois da separação lateral↔meia.
A regra corria sempre que os dois estivessem a menos de 6 m um do outro EM X,
sem olhar à profundidade — o meia 20 m à frente contava como embolamento — e
tinha piso ZERO, portanto com o meia fechado o lateral era mandado para o eixo.

Este teste corre o jogo e mede o resultado, que é o que o relato descreve.

Corre com: node tests/laterais_largura.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

/*
SEMENTE FIXA. Sem isto o teste corre com o `Math.random` do Node e uma medição
de jogo — que depende de 600 s de simulação antes do lance — passa ou falha
conforme o dia. O mulberry32 é o mesmo das ferramentas em tools/headless.
*/
const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(1000);

require('../tools/headless/harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const alvoX = [];
let porDentroDosCentrais = 0, amostras = 0;

for (let i = 0; i < Math.round(240 / dt); i++) {
    Match.update(dt);
    if (i % 12 || Match.state !== 'PLAY') continue;

    for (const lista of [Match.players, Match.opponents]) {
        const centrais = lista.filter(p => p.pos === 'CB');
        for (const p of lista) {
            if (p.pos !== 'LB' && p.pos !== 'RB') continue;
            amostras++;
            if (p.tacticalTarget) alvoX.push(Math.abs(p.tacticalTarget.x));

            // Mais por dentro do que o central mais interior do lado dele.
            const meuLado = Math.sign(p.baseTarget.x) || 1;
            const cbs = centrais.map(c => c.model.position.x * meuLado);
            if (cbs.length >= 2 && p.model.position.x * meuLado < Math.max(...cbs)) porDentroDosCentrais++;
        }
    }
}

const media = alvoX.reduce((a, b) => a + b, 0) / alvoX.length;
const pctDentro = 100 * porDentroDosCentrais / Math.max(1, amostras);

test('o alvo do lateral fica na banda, não no corredor central', () => {
    assert.ok(amostras > 500, `só ${amostras} amostras — a medição não vale nada`);
    /*
    O slot da formação põe-no a ~19 m; medido, o alvo dava 10.4 m antes da
    correcção e 17.8 m depois. 14 m é o chão: abaixo disso ele já não é a
    largura da equipa, é um terceiro médio-centro.
    */
    assert.ok(media > 14.0, `|x| médio do alvo do lateral = ${media.toFixed(2)} m: fechou para o meio`);
});

test('e quase nunca fica por dentro dos dois centrais', () => {
    /*
    Medido: 12.7% antes, 0.4-4.4% depois conforme a semente. Não é zero de
    propósito — recuar para dentro dos centrais a tapar um cruzamento, ou a
    fechar uma bola dentro da área, é jogo e acontece. O que o teste apanha é a
    outra coisa: o lateral a VIVER lá, que é o que dava 12.7%.
    */
    assert.ok(pctDentro < 7.0,
        `lateral por dentro do central mais interior em ${pctDentro.toFixed(1)}% das leituras`);
});
