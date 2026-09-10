/*
O GUARDA-REDES SALTA QUANDO A BOLA CHEGA, E NAO NO INSTANTE DO REMATE.

Relato: "tem lances que o goleiro pula na hora do chute. As vezes a bola nem
passa pela defesa mas o goleiro ja esta caido. O goleiro tem que pular quando a
bola esta mais perto dele. Nao pode pular no exato instante do chute. Ele pode
ate se movimentar um pouco para os lados, mas pular so quando a bola estiver ao
alcance do pulo com os bracos esticados. Seja para fazer a defesa ou nao."

Medido antes (tools/headless/gk_salto_alto.js, 2 sementes): no instante em que
ele larga o chao faltavam a bola **0.55 a 0.90 s** e ela estava a **13-16 m**
dele. O gesto inteiro ate ao contacto da mao dura 0.17 s (agachar e estender)
mais `fracContacto` do voo -- 0.3 a 0.6 s. Ou seja: ele caia, deslizava, e a
bola chegava depois.

A regra passa a ser o TEMPO DO PROPRIO GESTO: so se atira quando o que falta a
bola cabe no que ele demora a la chegar. Antes disso continua a ler o lance e a
deslocar-se de pe para o lado do alvo (o `gkAlvoX` ja o fazia).

Corre com: node --test tests/gk_salta_no_momento.test.js
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

const saltos = [];
const origIniciar = GkDive.iniciar.bind(GkDive);
GkDive.iniciar = function (p, alvoX, alvoY, tipo, dirX) {
    /*
    So conta a bola que VEM A CAMINHO. Medido um mergulho a marcar 1.43 s com a
    bola em z = -53.3 contra o guarda-redes em -52.0, a AFASTAR-SE a 0.93 m/s:
    ja tinha passado a linha, e o `|z| / |vz|` ali nao e tempo de chegada
    nenhum, e uma divisao por uma velocidade de fuga. Um mergulho a uma bola
    solta atras dele nao e o defeito que este teste guarda.
    */
    const aproxima = (Match.ball.position.z - p.model.position.z) * Math.sign(Match.ballVel.z) < 0;
    if (Math.abs(Match.ballVel.z) > 0.5 && aproxima) {
        saltos.push({
            t: Math.abs(p.model.position.z - Match.ball.position.z) / Math.abs(Match.ballVel.z),
            d: p.model.position.distanceTo(Match.ball.position)
        });
    }
    return origIniciar(p, alvoX, alvoY, tipo, dirX);
};

for (let i = 0; i < Math.round(1800 / dt); i++) Match.update(dt);

const mediana = a => { const o = a.slice().sort((x, y) => x - y); return o.length ? o[Math.floor(o.length / 2)] : NaN; };
const med = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;

test('a antecipacao do mergulho vive na configuracao', () => {
    assert.strictEqual(typeof GoalkeeperDive.margemAntecipacao, 'number',
        'GoalkeeperDive.margemAntecipacao desapareceu');
    assert.ok(GoalkeeperDive.margemAntecipacao >= 0 && GoalkeeperDive.margemAntecipacao < 0.3,
        `margemAntecipacao = ${GoalkeeperDive.margemAntecipacao}: nao e uma margem, e uma antecipacao`);
});

test('ninguem se atira com a bola ainda longe', () => {
    const ts = saltos.map(s => s.t);
    const ds = saltos.map(s => s.d);
    console.log(`  ${saltos.length} mergulhos | faltavam a bola: media ${med(ts).toFixed(2)} s, ` +
        `mediana ${mediana(ts).toFixed(2)}, pior ${Math.max(...ts).toFixed(2)} | ` +
        `distancia media ${med(ds).toFixed(1)} m`);
    assert.ok(saltos.length >= 10, `amostra curta: ${saltos.length}`);

    /*
    O tecto e o proprio gesto: agachar e estender (`tempoLer` + `tempoImpulso`)
    mais o voo ate ao contacto da mao, no maximo do voo. Mais do que isso e
    saltar cedo de mais -- que e o relato.
    */
    const D = GoalkeeperDive;
    const tecto = D.tempoLer + D.tempoImpulso + D.fracContacto * D.vooMax + D.margemAntecipacao;
    assert.ok(med(ts) <= tecto,
        `salta em media com ${med(ts).toFixed(2)} s por chegar, e o gesto so precisa de ${tecto.toFixed(2)}`);
    assert.ok(Math.max(...ts) <= tecto + 0.15,
        `houve um mergulho com ${Math.max(...ts).toFixed(2)} s por chegar (tecto ${tecto.toFixed(2)})`);
});
