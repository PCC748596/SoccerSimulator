/*
OS PASSES DA DEFESA PARA O MEIO-CAMPO: quantos falham, e COMO falham.

Suspeita: *"tem muito erro bobo de passe da defesa para o meio campo"*.

O lote de jogos da a taxa global de passes certos, mas nao diz de quem para
quem. Isto separa por PAR DE LINHAS (def->mid, def->def, mid->atk, ...) e, nos
que falham, diz o que aconteceu -- interceptado, foi para ninguem, saiu do
campo, ou o destinatario nao chegou la.

Corre com: node tools/scratch/passe_defesa_meio.js [segundos] [semente]
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

const linha = (p) => {
    if (!p) return '?';
    if (p.role === 'gk') return 'gk';
    if (p.role === 'def') return 'def';
    if (p.role === 'mid') return 'mid';
    if (p.role === 'atk') return 'atk';
    return p.role || '?';
};

const pares = new Map();   // "def->mid" -> { n, ok, falhas: Map }
const pendentes = [];

function registar(par, ok, motivo, dist, caso) {
    if (par === 'def->mid' && caso) defMid.push({ ok, motivo, dist, alt: caso.alternativa });
    if (!pares.has(par)) pares.set(par, { n: 0, ok: 0, falhas: new Map(), somaDist: 0 });
    const r = pares.get(par);
    r.n++; r.somaDist += dist;
    if (ok) r.ok++;
    else r.falhas.set(motivo, (r.falhas.get(motivo) || 0) + 1);
}

const orig = global.executePassGameplay;
global.executePassGameplay = function (p) {
    const alvo = p.passTarget;
    const r = orig.apply(this, arguments);
    if (!alvo || !alvo.model) return r;
    // A alternativa que existia: o medio LIVRE mais perto (ninguem do outro
    // lado a menos de 3 m dele e linha de passe mais curta).
    let maisPerto = Infinity;
    if (linha(p) === 'def') {
        const colegas = (p.team === 'TeamA') ? Match.players : Match.opponents;
        const advs = (p.team === 'TeamA') ? Match.opponents : Match.players;
        for (const m of colegas) {
            if (m === p || linha(m) !== 'mid' || !m.model) continue;
            let marcado = false;
            for (const a of advs) {
                if (!a.model || a.role === 'gk') continue;
                if (a.model.position.distanceTo(m.model.position) < 3.0) { marcado = true; break; }
            }
            if (marcado) continue;
            const d = p.model.position.distanceTo(m.model.position);
            if (d < maisPerto) maisPerto = d;
        }
    }
    pendentes.push({
        de: p, para: alvo,
        par: linha(p) + '->' + linha(alvo),
        dist: p.model.position.distanceTo(alvo.model.position),
        alternativa: maisPerto,
        equipa: p.team,
        frames: 0
    });
    return r;
};
const defMid = [];

for (let i = 0; i < Math.round(segundos / dt); i++) {
    const estadoAntes = Match.state;
    Match.update(dt);
    for (let k = pendentes.length - 1; k >= 0; k--) {
        const c = pendentes[k];
        c.frames++;

        // Chegou a quem era? Conta como certo.
        if (Match.ballCarrier === c.para) {
            registar(c.par, true, null, c.dist, c); pendentes.splice(k, 1); continue;
        }
        // Outro da mesma equipa: o passe nao foi para quem devia, mas a equipa
        // ficou com a bola. Nao e "erro bobo" -- conta a parte.
        if (Match.ballCarrier && Match.ballCarrier.team === c.equipa) {
            registar(c.par, true, null, c.dist, c); pendentes.splice(k, 1); continue;
        }
        // Adversario: perdeu-se.
        if (Match.ballCarrier && Match.ballCarrier.team !== c.equipa) {
            registar(c.par, false, 'intercetado', c.dist, c); pendentes.splice(k, 1); continue;
        }
        // Bola fora.
        if (Match.state !== estadoAntes &&
            ['THROW_IN', 'GOAL_KICK', 'CORNER_KICK'].indexOf(Match.state) !== -1) {
            registar(c.par, false, 'saiu_do_campo', c.dist, c); pendentes.splice(k, 1); continue;
        }
        // Ficou pelo caminho e ninguem a agarrou.
        if (c.frames > 300) {
            registar(c.par, false, 'bola_solta', c.dist, c); pendentes.splice(k, 1);
        }
    }
}

const ordem = [...pares.entries()].sort((a, b) => b[1].n - a[1].n);
let totN = 0, totOk = 0;
for (const [, r] of ordem) { totN += r.n; totOk += r.ok; }
console.log('PASSES POR PAR DE LINHAS (' + totN + ' passes, ' +
    (100 * totOk / totN).toFixed(0) + '% certos no total)\n');
console.log('  par          n     certos   dist media   principais falhas');
for (const [par, r] of ordem) {
    if (r.n < 5) continue;
    const f = [...r.falhas.entries()].sort((a, b) => b[1] - a[1])
        .map(([k, v]) => k + ' ' + v).join(', ');
    console.log('  ' + par.padEnd(11) + String(r.n).padStart(4) + '   ' +
        (100 * r.ok / r.n).toFixed(0).padStart(5) + '%   ' +
        (r.somaDist / r.n).toFixed(1).padStart(6) + ' m   ' + f);
}

// E o foco do pedido.
const dm = pares.get('def->mid');
if (dm) {
    console.log('\nDEFESA -> MEIO-CAMPO em detalhe:');
    console.log('  ' + dm.n + ' passes, ' + (100 * dm.ok / dm.n).toFixed(0) + '% certos, ' +
        (dm.somaDist / dm.n).toFixed(1) + ' m de distancia media');
    for (const [k, v] of [...dm.falhas.entries()].sort((a, b) => b[1] - a[1])) {
        console.log('    ' + k.padEnd(16) + String(v).padStart(4) + '  ' +
            (100 * v / dm.n).toFixed(0) + '% de todos os def->mid');
    }
}

/*
O "ERRO BOBO": o defensor tinha um medio LIVRE mais perto e escolheu o longo?

Para cada def->mid guarda-se a distancia escolhida e a do medio livre mais
proximo no momento do passe. Se os falhados forem sistematicamente muito mais
longos do que a alternativa que existia, e escolha, nao azar.
*/

if (defMid.length) {
    const faixas = [[0, 12], [12, 18], [18, 25], [25, 99]];
    console.log(String.fromCharCode(10) + '  def->mid por DISTANCIA do passe:');
    console.log('    faixa        n    certos');
    for (const [lo, hi] of faixas) {
        const l = defMid.filter(c => c.dist >= lo && c.dist < hi);
        if (!l.length) continue;
        const ok = l.filter(c => c.ok).length;
        console.log('    ' + (lo + '-' + hi + ' m').padEnd(11) + String(l.length).padStart(4) +
            '   ' + (100 * ok / l.length).toFixed(0).padStart(5) + '%');
    }
    const comAlt = defMid.filter(c => isFinite(c.alt));
    if (comAlt.length) {
        const maus = comAlt.filter(c => !c.ok);
        const med = (l, f) => l.reduce((a, c) => a + f(c), 0) / (l.length || 1);
        console.log(String.fromCharCode(10) + '  havia medio LIVRE mais perto? (' + comAlt.length + ' passes com alternativa)');
        console.log('    nos CERTOS:   escolheu ' + med(comAlt.filter(c => c.ok), c => c.dist).toFixed(1) +
            ' m, o livre mais perto estava a ' + med(comAlt.filter(c => c.ok), c => c.alt).toFixed(1) + ' m');
        console.log('    nos FALHADOS: escolheu ' + med(maus, c => c.dist).toFixed(1) +
            ' m, o livre mais perto estava a ' + med(maus, c => c.alt).toFixed(1) + ' m');
        const ignorou = maus.filter(c => c.dist > c.alt + 6);
        console.log('    falhados em que ignorou um livre 6+ m mais perto: ' +
            ignorou.length + '/' + maus.length);
    }
}
