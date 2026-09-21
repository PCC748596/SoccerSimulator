/*
O PASSE VAI AOS PES DO ADVERSARIO, OU ELE E QUE O CORTA?

Relato: *"as vezes os jogadores dao os passes nos pes dos adversarios. Os
adversarios estao fazendo cortes mas com bolas que vao na direccao deles e nao
em bolas que vao passar ao lado e eles cortam levantando a perna ou dando
carrinho"*.

A diferenca mede-se: no INSTANTE em que o passe sai, a que distancia da LINHA
DO PASSE (segmento passador->alvo) estava o adversario que o veio a intercetar.

    afastamento ~ 0     a bola foi na direccao dele -- passe aos pes
    afastamento grande  ele teve de sair do sitio para a cortar -- corte

Mede-se tambem quanto ele ANDOU entre o passe e o corte: um corte a serio tem
deslocamento, um passe aos pes nao precisa de nenhum.

Corre com: node tools/scratch/passe_nos_pes.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 3600);
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

const linha = (p) => (p && p.role) || '?';

// Distancia de um ponto ao SEGMENTO a->b, em planta.
function distAoSegmento(px, pz, ax, az, bx, bz) {
    const vx = bx - ax, vz = bz - az;
    const L2 = vx * vx + vz * vz;
    if (L2 < 1e-9) return Math.hypot(px - ax, pz - az);
    let t = ((px - ax) * vx + (pz - az) * vz) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
}

const pendentes = [];
const cortes = [];

/*
O VETO (`folga < bloqueioDuro`) corre na DECISAO; a bola so sai 0.318 s depois.
Guarda-se tambem a foto no instante da DECISAO, para separar duas causas bem
diferentes: linha ja ocupada quando se decidiu (veto furado, ou passe vindo de
outro caminho) ou adversario que ENTROU na linha durante a armacao.
*/
const decisoes = new Map();
const Jog = Object.getPrototypeOf(Match.players[0]);
const origIni = Jog.initiatePass;
Jog.initiatePass = function (alvo) {
    if (alvo && alvo.model && this.model) {
        const advs = (this.team === 'TeamA') ? Match.opponents : Match.players;
        const f = new Map();
        for (const a of advs) {
            if (!a.model || a.role === 'gk') continue;
            f.set(a, { x: a.model.position.x, z: a.model.position.z });
        }
        decisoes.set(this, {
            ax: this.model.position.x, az: this.model.position.z,
            bx: alvo.model.position.x, bz: alvo.model.position.z, foto: f
        });
    }
    return origIni.apply(this, arguments);
};

const orig = global.executePassGameplay;
global.executePassGameplay = function (p) {
    const alvo = p.passTarget;
    const r = orig.apply(this, arguments);
    if (!alvo || !alvo.model) return r;
    const advs = (p.team === 'TeamA') ? Match.opponents : Match.players;
    // Foto de onde estava cada adversario no instante do passe.
    const foto = new Map();
    for (const a of advs) {
        if (!a.model || a.role === 'gk') continue;
        foto.set(a, { x: a.model.position.x, z: a.model.position.z });
    }
    pendentes.push({
        decisao: decisoes.get(p) || null,
        par: linha(p) + '->' + linha(alvo),
        equipa: p.team,
        ax: p.model.position.x, az: p.model.position.z,
        bx: alvo.model.position.x, bz: alvo.model.position.z,
        dist: p.model.position.distanceTo(alvo.model.position),
        foto, frames: 0
    });
    return r;
};

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (let k = pendentes.length - 1; k >= 0; k--) {
        const c = pendentes[k];
        c.frames++;
        const dono = Match.ballCarrier;
        if (dono && dono.team === c.equipa) { pendentes.splice(k, 1); continue; }
        if (dono && dono.team !== c.equipa) {
            const antes = c.foto.get(dono);
            if (antes) {
                let afastDecisao = null;
                if (c.decisao) {
                    const d0 = c.decisao.foto.get(dono);
                    if (d0) afastDecisao = distAoSegmento(d0.x, d0.z,
                        c.decisao.ax, c.decisao.az, c.decisao.bx, c.decisao.bz);
                }
                cortes.push({
                    afastDecisao,
                    par: c.par,
                    distPasse: c.dist,
                    // A que distancia da linha do passe ele ESTAVA.
                    afast: distAoSegmento(antes.x, antes.z, c.ax, c.az, c.bx, c.bz),
                    // E quanto andou ate cortar.
                    andou: Math.hypot(dono.model.position.x - antes.x,
                        dono.model.position.z - antes.z),
                    estado: (dono.fsm && dono.fsm.currentState) || '?',
                    tempo: c.frames / 60
                });
            }
            pendentes.splice(k, 1); continue;
        }
        if (c.frames > 300) pendentes.splice(k, 1);
    }
}

if (!cortes.length) { console.log('sem intercecoes'); process.exit(0); }

const med = (l, f) => l.reduce((a, c) => a + f(c), 0) / (l.length || 1);
console.log(cortes.length + ' passes perdidos para o adversario\n');
console.log('AFASTAMENTO do intercetador a LINHA DO PASSE, no instante do passe:');
for (const [lo, hi] of [[0, 0.5], [0.5, 1], [1, 2], [2, 4], [4, 99]]) {
    const l = cortes.filter(c => c.afast >= lo && c.afast < hi);
    console.log('  ' + (lo + '-' + hi + ' m').padEnd(10) + String(l.length).padStart(4) + '  ' +
        (100 * l.length / cortes.length).toFixed(0).padStart(3) + '%  ' +
        '#'.repeat(Math.round(34 * l.length / cortes.length)) +
        (l.length ? '   andou ' + med(l, c => c.andou).toFixed(1) + ' m' : ''));
}
console.log('  media ' + med(cortes, c => c.afast).toFixed(2) + ' m');

const nosPes = cortes.filter(c => c.afast < 1.0);
console.log('\n  PASSES AOS PES (adversario ja a menos de 1 m da linha): ' +
    nosPes.length + '/' + cortes.length + '  (' +
    (100 * nosPes.length / cortes.length).toFixed(0) + '%)');
console.log('    andou ate cortar: ' + med(nosPes, c => c.andou).toFixed(2) + ' m' +
    '   (os outros: ' + med(cortes.filter(c => c.afast >= 1), c => c.andou).toFixed(2) + ' m)');

console.log('\n  por par de linhas (so os pares com 8+ perdas):');
const porPar = new Map();
for (const c of cortes) {
    if (!porPar.has(c.par)) porPar.set(c.par, []);
    porPar.get(c.par).push(c);
}
for (const [par, l] of [...porPar.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (l.length < 8) continue;
    const pes = l.filter(c => c.afast < 1.0).length;
    console.log('    ' + par.padEnd(11) + String(l.length).padStart(4) + ' perdas   ' +
        'aos pes ' + (100 * pes / l.length).toFixed(0).padStart(3) + '%   ' +
        'afastamento medio ' + med(l, c => c.afast).toFixed(2) + ' m');
}

/*
E AGORA A SEPARACAO QUE INTERESSA.
*/
const comDec = cortes.filter(c => c.afastDecisao !== null);
if (comDec.length) {
    const BD = (typeof PassLineModel !== 'undefined') ? PassLineModel.bloqueioDuro : 0.9;
    console.log(String.fromCharCode(10) + 'AFASTAMENTO NA DECISAO vs NO CONTACTO (' +
        comDec.length + ' perdas com as duas fotos):');
    console.log('  bloqueioDuro = ' + BD + ' m (o veto do PassTypes.escolher)');
    const jaLa = comDec.filter(c => c.afastDecisao < BD);
    const entrou = comDec.filter(c => c.afastDecisao >= BD && c.afast < 1.0);
    console.log('  ja estava na linha QUANDO SE DECIDIU (veto devia ter cortado): ' +
        jaLa.length + '/' + comDec.length + '  (' +
        (100 * jaLa.length / comDec.length).toFixed(0) + '%)');
    console.log('  ENTROU na linha durante a armacao (decisao limpa, contacto nao): ' +
        entrou.length + '/' + comDec.length + '  (' +
        (100 * entrou.length / comDec.length).toFixed(0) + '%)');
    const med2 = (l, f) => l.reduce((a, c) => a + f(c), 0) / (l.length || 1);
    console.log('  afastamento medio: decisao ' + med2(comDec, c => c.afastDecisao).toFixed(2) +
        ' m  ->  contacto ' + med2(comDec, c => c.afast).toFixed(2) + ' m');
    if (entrou.length) {
        console.log('    quem entrou: estava a ' + med2(entrou, c => c.afastDecisao).toFixed(2) +
            ' m na decisao, ' + med2(entrou, c => c.afast).toFixed(2) + ' m no contacto');
    }
}
