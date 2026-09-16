/*
O TOQUE DE CONDUÇÃO: ele adianta a bola, ou leva-a colada ao pé?

Relato: "quando o jogador tem a bola dominada no meio campo ele dá pequenas
adiantadas no meio de um monte de adversários; mas quando recebe a bola na
frente ou tem alguém atrás dele, não adianta para poder ter mais velocidade".

Mede, em cada passagem pelo ramo do toque (estado CARRY): que toque as faixas
de distância pediram, o que a validação por disputa (`maiorToqueSeguro`)
deixou, e com que adversários à volta — à frente e ATRÁS.

Uso: node tools/headless/toque_conducao.js [segundos] [semente]
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

const pedidos = [];
const dados = [];
{
    const orig = global.maiorToqueSeguro;
    global.maiorToqueSeguro = function (px, pz, dirX, dirZ, vel, leadInicial, advs) {
        const r = orig.apply(this, arguments);
        // Quem está à frente e quem está atrás, no referencial da corrida.
        let atras = 0, frente = 0, maisPertoAtras = 999, maisPertoFrente = 999;
        for (const o of advs) {
            const proj = (o.x - px) * dirX + (o.z - pz) * dirZ;
            const d = Math.hypot(o.x - px, o.z - pz);
            if (proj < 0) { atras++; maisPertoAtras = Math.min(maisPertoAtras, d); }
            else { frente++; maisPertoFrente = Math.min(maisPertoFrente, d); }
        }
        dados.push({ pedido: leadInicial, dado: r, vel: vel, atras: maisPertoAtras, frente: maisPertoFrente });
        pedidos.push(leadInicial);
        return r;
    };
}

let toques = 0;
{
    // Um toque a sério: a bola sai do pé com velocidade.
    const orig = FootballPlayer.prototype.aguardarPassada;
    // (nada a embrulhar aqui — o toque conta-se pelos `dado > 0`)
}

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

const med = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : '-';
const conta = (f) => dados.filter(f).length;

console.log(`\n${(Match.tempoDeJogo / 60).toFixed(0)} min | ${dados.length} decisões de toque`);
const porPedido = {};
for (const d of dados) porPedido[d.pedido.toFixed(2)] = (porPedido[d.pedido.toFixed(2)] || 0) + 1;
console.log('toque PEDIDO pelas faixas:', Object.entries(porPedido).sort((a, b) => Number(b[0]) - Number(a[0])).map(([k, v]) => `${k}m:${v}`).join('  '));
const porDado = {};
for (const d of dados) porDado[d.dado.toFixed(2)] = (porDado[d.dado.toFixed(2)] || 0) + 1;
console.log('toque DADO pela disputa: ', Object.entries(porDado).sort((a, b) => Number(b[0]) - Number(a[0])).map(([k, v]) => `${k}m:${v}`).join('  '));
console.log(`cortados a zero: ${conta(d => d.dado === 0)}/${dados.length} (${(100 * conta(d => d.dado === 0) / Math.max(1, dados.length)).toFixed(0)}%)`);

const soAtras = dados.filter(d => d.atras < 6 && d.frente > 12);
console.log(`\nCOM ALGUEM ATRAS (<6 m) E O CAMPO ABERTO A FRENTE (>12 m): ${soAtras.length} casos`);
console.log(`  pediram ${med(soAtras.map(d => d.pedido))} m, levaram ${med(soAtras.map(d => d.dado))} m | cortados a zero: ${soAtras.filter(d => d.dado === 0).length}`);
