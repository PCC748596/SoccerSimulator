/*
QUANTOS DRIBLES ACONTECEM NO ULTIMO TERCO?

Pedido: *"tem que aumentar os dribles no ultimo terco em 50%"*. Para aumentar
50% e preciso saber de quanto — e isto conta.

Um DRIBLE e uma entrada no estado DRIBBLE (a FSM; o gesto do 1v1, ver
DribbleModel). Conta-se onde ele COMECA, no referencial de ataque de quem
dribla: `z * dirZ > tercoZ` e ultimo terco.

Imprime tambem os dribles fora do ultimo terco e o total, porque o pedido e
sobre uma zona so: se os dois subirem na mesma proporcao, o que mudou foi a
vontade de driblar em todo o lado e nao o que foi pedido.

Uso: node tools/headless/dribles_ultimo_terco.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 2700);
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

// O terco final comeca a um sexto do campo a partir do meio (CAMPO_COMP/6),
// que e a mesma fronteira que o publico usa (CrowdModel.tercoZ).
const TERCO = (typeof CAMPO_COMP === 'number' ? CAMPO_COMP : 106) / 6;

let noTerco = 0, fora = 0;
const anterior = new Map();

const frames = Math.round(segundos / dt);
for (let f = 0; f < frames; f++) {
    Match.update(dt);

    for (const p of Match.players.concat(Match.opponents)) {
        if (!p || !p.fsm) continue;
        const estado = p.fsm.currentState;
        const antes = anterior.get(p);
        anterior.set(p, estado);
        if (estado !== 'DRIBBLE' || antes === 'DRIBBLE') continue;

        if (p.model.position.z * p.dirZ > TERCO) noTerco++;
        else fora++;
    }
}

const minutos = segundos / 60;
console.log(`\n${Math.round(minutos)} minutos, semente ${semente}`);
console.log(`dribles no ultimo terco : ${noTerco} (${(noTerco / minutos * 90).toFixed(1)} por 90 min)`);
console.log(`dribles fora do terco   : ${fora} (${(fora / minutos * 90).toFixed(1)} por 90 min)`);
console.log(`total                   : ${noTerco + fora}`);
