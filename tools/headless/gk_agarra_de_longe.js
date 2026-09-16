/*
A QUE DISTANCIA E QUE O GUARDA-REDES AGARRA A BOLA.

Relato, com tres capturas: "o goleiro esta 'pegando' a bola sem pular nela. A
quase 2 metros de distancia a bola e teletransportada para as maos do goleiro.
O goleiro deveria pular em baixo e segurar a bola (GK_Low)."

Mede, em cada `grabBall`: onde estava a bola em relacao ao CORPO e as MAOS
dele, e em que estado ele estava. A diferenca entre as duas distancias e o
teletransporte -- se a bola estava a 1.8 m da mao e apareceu nela, andou 1.8 m
sozinha.

Uso: node tools/headless/gk_agarra_de_longe.js [segundos] [semente]
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

const registos = [];
const _w = new THREE.Vector3();
const proto = Object.getPrototypeOf(Match.players[0]);
const orig = proto.grabBall;
proto.grabBall = function () {
    if (this.role === 'gk' && Match.ball) {
        const bola = Match.ball.position;
        let mao = Infinity;
        for (const nome of ['lHand', 'rHand']) {
            const m = this.rig && this.rig[nome];
            if (!m) continue;
            m.getWorldPosition(_w);
            mao = Math.min(mao, _w.distanceTo(bola));
        }
        registos.push({
            corpo: this.model.position.distanceTo(bola),
            mao: (mao === Infinity) ? null : mao,
            alturaBola: bola.y,
            lateral: Math.abs(bola.x - this.model.position.x),
            estado: this.gkEstado,
            vBola: Match.ballVel.length()
        });
    }
    return orig.call(this);
};

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

const med = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const p90 = a => { const o = a.slice().sort((x, y) => x - y); return o.length ? o[Math.floor(o.length * 0.9)] : NaN; };

console.log(`semente ${semente}  |  ${registos.length} bolas agarradas`);
const comMao = registos.filter(r => r.mao !== null);
console.log(`  distancia da bola ao CORPO: media ${med(registos.map(r => r.corpo)).toFixed(2)} m, ` +
    `p90 ${p90(registos.map(r => r.corpo)).toFixed(2)}, maximo ${Math.max(...registos.map(r => r.corpo)).toFixed(2)}`);
console.log(`  distancia da bola a MAO   : media ${med(comMao.map(r => r.mao)).toFixed(2)} m, ` +
    `p90 ${p90(comMao.map(r => r.mao)).toFixed(2)}, maximo ${Math.max(...comMao.map(r => r.mao)).toFixed(2)}`);
console.log(`  teletransportadas de mais de 1 m da mao: ` +
    `${comMao.filter(r => r.mao > 1.0).length} de ${comMao.length}`);
const porEstado = {};
for (const r of registos) porEstado[r.estado || '?'] = (porEstado[r.estado || '?'] || 0) + 1;
console.log('  estado em que agarrou: ' + Object.entries(porEstado).map(([k, v]) => `${k} ${v}`).join('  '));
const baixas = registos.filter(r => r.alturaBola < 1.0);
console.log(`  bolas BAIXAS (y < 1 m): ${baixas.length}, dessas a mais de 1.2 m ao lado dele: ` +
    `${baixas.filter(r => r.lateral > 1.2).length}`);
