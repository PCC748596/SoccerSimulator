/*
A QUE VELOCIDADE SE CHEGA A UM CARRINHO.

O `fsm.js` escreve a velocidade do deslize POR CIMA da que o defensor trazia:

    p.velocity.copy(_v2).multiplyScalar(S.velocidade * (1 - tSlide / S.deslize));

`S.velocidade` é 9.0 para toda a gente. Um defensor a sprintar e outro que se
atira parado deslizam exactamente à mesma velocidade — e como a falta é sempre
avaliada na mesma fase do gesto, a `velocidade` que chega ao árbitro é uma
CONSTANTE: 8.2 m/s, média igual ao máximo em todas as sementes
(`tools/headless/cartoes_origem.js`).

Isso trava a gravidade da falta num tecto de 0.73, contra os 0.95 do vermelho
directo — e o pior é que apaga a coisa certa: um carrinho lançado em
contra-ataque tem de contar mais do que um dado a passo.

Aqui mede-se a velocidade REAL de aproximação, no frame em que ele entra em
SLIDE_TACKLE e antes de o deslize a reescrever. É o número que o deslize devia
herdar, e é preciso conhecê-lo antes de escolher a fórmula.

Uso: node tools/headless/carrinho_velocidade.js [segundos] [semente]
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

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

/*
O INSTANTE CERTO é a ENTRADA no estado: um frame depois o `case 'SLIDE_TACKLE'`
já escreveu a velocidade do deslize por cima, e mede-se a constante em vez da
aproximação.
*/
const aproximacao = [];
{
    const orig = PlayerFSM.prototype.changeState;
    PlayerFSM.prototype.changeState = function (novo) {
        if (novo === 'SLIDE_TACKLE' && this.p && this.p.velocity &&
            this.currentState !== 'SLIDE_TACKLE') {
            aproximacao.push({
                v: this.p.velocity.length(),
                pos: this.p.pos,
                vel: this.p.skillFor ? this.p.skillFor('SPEED') : 50
            });
        }
        return orig.call(this, novo);
    };
}

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

const vs = aproximacao.map(a => a.v);
const med = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const pct = (a, p) => {
    if (!a.length) return 0;
    const o = [...a].sort((x, y) => x - y);
    return o[Math.min(o.length - 1, Math.floor(p * o.length))];
};

console.log(`\nsemente ${semente} | ${(Match.tempoDeJogo / 60).toFixed(0)} min | ` +
    `${aproximacao.length} carrinhos\n`);
console.log(`  velocidade de aproximacao: media ${med(vs).toFixed(2)} m/s`);
console.log(`    minimo ${Math.min(...vs).toFixed(2)}  |  p25 ${pct(vs, 0.25).toFixed(2)}  |  ` +
    `mediana ${pct(vs, 0.50).toFixed(2)}  |  p75 ${pct(vs, 0.75).toFixed(2)}  |  ` +
    `maximo ${Math.max(...vs).toFixed(2)}`);

const faixa = (a, b) => vs.filter(v => v >= a && v < b).length;
console.log(`\n  por faixa: <2 ${faixa(0, 2)} | 2-4 ${faixa(2, 4)} | 4-6 ${faixa(4, 6)} | ` +
    `6-8 ${faixa(6, 8)} | 8+ ${faixa(8, 99)}`);

console.log(`\n  o deslize escreve ${SlideTackleModel.velocidade} m/s por cima disto, ` +
    `para toda a gente.\n`);
