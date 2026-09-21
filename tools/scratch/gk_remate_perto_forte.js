/*
REMATE FORTE DE MUITO PERTO: ONDE ACABA A BOLA?

Pedido: *"chute forte de muito perto o goleiro tem que colocar para escanteio"*.

O config ja tem a nocao: `GkCatchModel.semAgarrar` ({distMax, velMin}) poe a
hipotese de AGARRAR a zero nesse caso. O que nao existe e a segunda metade --
para onde vai a bola. Hoje a espalmada so sai pela linha de fundo se vier perto
do poste (`espalmarForaMargem`) ou alta (`espalmarAltaY`); o resto volta ao
campo.

Isto apanha os remates que caem na faixa `semAgarrar` e segue o desfecho.
*/
const segundos = Number(process.argv[2] || 5400);
const semente = Number(process.argv[3] || 4242);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(semente);
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const SA = GkCatchModel.semAgarrar;
const casos = [];

// Apanha a DECISAO do guarda-redes e guarda se caiu na faixa "sem agarrar".
const orig = global.resolverDefesaGK;
global.resolverDefesaGK = function (o) {
    const r = orig.apply(this, arguments);
    // As chaves reais sao `dist` (de onde saiu o remate) e `vChegada`.
    const perto = (typeof o.dist === 'number') ? o.dist : null;
    const v = (typeof o.vChegada === 'number') ? o.vChegada : null;
    const naFaixa = (perto !== null && v !== null &&
        perto <= SA.distMax && v >= SA.velMin);
    /*
    Cada defesa e seguida por si. A versao anterior guardava so a ULTIMA
    (`aSeguir`) e, sempre que outra acontecia antes desta resolver, o desfecho
    ficava por preencher -- davam 67% de "?" e o numero nao dizia nada.
    */
    const caso = {
        naFaixa, dist: perto, vel: v, resultado: r && r.resultado,
        frames: 0, desfecho: null
    };
    casos.push(caso);
    pendentes.push(caso);
    return r;
};
const pendentes = [];

for (let i = 0; i < Math.round(segundos / dt); i++) {
    const estadoAntes = Match.state;
    Match.update(dt);
    const st = Match.state;
    for (let k = pendentes.length - 1; k >= 0; k--) {
        const c = pendentes[k];
        c.frames++;
        if (st !== estadoAntes) {
            if (st === 'CORNER_KICK') c.desfecho = 'canto';
            else if (st === 'GOAL_KICK') c.desfecho = 'tiro_de_meta';
            else if (st === 'GOAL') c.desfecho = 'golo';
            else if (st === 'THROW_IN') c.desfecho = 'lateral';
        }
        if (!c.desfecho && c.frames > 240) c.desfecho = 'seguiu_em_jogo';
        if (c.desfecho) pendentes.splice(k, 1);
    }
}

const faixa = casos.filter(c => c.naFaixa);
console.log('semAgarrar: distMax ' + SA.distMax + ' m, velMin ' + SA.velMin + ' m/s\n');
console.log(casos.length + ' defesas no total; ' + faixa.length + ' na faixa FORTE E DE PERTO\n');
function most(lista, titulo) {
    if (!lista.length) { console.log(titulo + ': nenhuma'); return; }
    const m = new Map();
    for (const c of lista) m.set(c.desfecho || '?', (m.get(c.desfecho || '?') || 0) + 1);
    console.log(titulo + ' (' + lista.length + '):');
    for (const [k, n] of [...m.entries()].sort((a, b) => b[1] - a[1])) {
        console.log('   ' + String(k).padEnd(16) + String(n).padStart(3) + '  ' +
            (100 * n / lista.length).toFixed(0) + '%');
    }
}
most(faixa, 'DESFECHO dos remates FORTES E DE PERTO');
console.log('');
most(casos.filter(c => !c.naFaixa), 'DESFECHO dos outros');

/*
E A DISTRIBUICAO, que e o que diz se a faixa e alcancavel. Zero casos pode ser
"nunca acontece" ou "o `dist` nem chega aqui".
*/
console.log('\nDISTRIBUICAO das defesas (dist do remate x velocidade de chegada):');
const semDist = casos.filter(c => c.dist === null).length;
console.log('  sem `dist` definido: ' + semDist + '/' + casos.length);
const comDist = casos.filter(c => c.dist !== null);
if (comDist.length) {
    const ds = comDist.map(c => c.dist).sort((a, b) => a - b);
    const vs = comDist.map(c => c.vel).sort((a, b) => a - b);
    console.log('  dist  min ' + ds[0].toFixed(1) + '  mediana ' +
        ds[Math.floor(ds.length / 2)].toFixed(1) + '  max ' + ds[ds.length - 1].toFixed(1));
    console.log('  vel   min ' + vs[0].toFixed(1) + '  mediana ' +
        vs[Math.floor(vs.length / 2)].toFixed(1) + '  max ' + vs[vs.length - 1].toFixed(1));
    console.log('\n  quantas cumprem cada metade:');
    console.log('    dist <= 6 m:            ' + comDist.filter(c => c.dist <= 6).length);
    console.log('    vel  >= 22 m/s:         ' + comDist.filter(c => c.vel >= 22).length);
    console.log('    as duas (a faixa):      ' + comDist.filter(c => c.dist <= 6 && c.vel >= 22).length);
    console.log('\n  as 8 mais perto:');
    for (const c of comDist.slice().sort((a, b) => a.dist - b.dist).slice(0, 8)) {
        console.log('    dist ' + c.dist.toFixed(1).padStart(5) + ' m   vel ' +
            c.vel.toFixed(1).padStart(5) + ' m/s   -> ' + c.resultado);
    }
}
