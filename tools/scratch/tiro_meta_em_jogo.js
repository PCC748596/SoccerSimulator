/*
QUEM ESTA DENTRO DA PEQUENA AREA NOS TIROS DE META, EM JOGO REAL.

O caminho sintetico (setupSetPiece com a bola ja colocada) sai limpo; em jogo o
lance nasce no `triggerGoalKick`, com a bola ainda a sair e um atraso ate ela
ser colocada. Isto amostra o estado GOAL_KICK como ele acontece.
*/
const segundos = Number(process.argv[2] || 1800);
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

// A pequena area do lado de quem bate.
function naPequena(p, linhaZ, dir) {
    const dz = (p.model.position.z - linhaZ) * dir;
    return dz >= -1.0 && dz <= Area.pequenaProfundidade &&
        Math.abs(p.model.position.x) <= Area.pequenaMeiaLargura;
}
function naGrande(p, linhaZ, dir) {
    const dz = (p.model.position.z - linhaZ) * dir;
    return dz >= -1.0 && dz <= Area.profundidade &&
        Math.abs(p.model.position.x) <= Area.meiaLargura;
}

let frames = 0, somaPeq = 0, somaGrandeAdv = 0, piorPeq = 0;
const porPos = new Map();
let lances = 0, anterior = null, tDesde = 0;
const perfil = [];

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    const st = Match.state;
    if (st !== 'GOAL_KICK') { anterior = st; continue; }
    if (anterior !== 'GOAL_KICK') { lances++; tDesde = 0; }
    anterior = st;

    const team = Match.setPieceTeam;
    if (!team) continue;
    const bate = (team === 'TeamA') ? Match.players : Match.opponents;
    const outros = (team === 'TeamA') ? Match.opponents : Match.players;
    const dir = bate.find(p => p.role !== 'gk').dirZ;
    const linhaZ = -dir * (CAMPO_COMP / 2);

    const dentroPeq = bate.concat(outros)
        .filter(p => p.role !== 'gk' && naPequena(p, linhaZ, dir));
    const advGrande = outros.filter(p => p.role !== 'gk' && naGrande(p, linhaZ, dir));

    // Perfil no tempo: quantos frames desde que o lance comecou.
    tDesde++;
    const balde = Math.min(9, Math.floor(tDesde / 60));
    if (!perfil[balde]) perfil[balde] = { n: 0, soma: 0, max: 0 };
    perfil[balde].n++;
    perfil[balde].soma += dentroPeq.length;
    if (dentroPeq.length > perfil[balde].max) perfil[balde].max = dentroPeq.length;

    frames++;
    somaPeq += dentroPeq.length;
    somaGrandeAdv += advGrande.length;
    if (dentroPeq.length > piorPeq) piorPeq = dentroPeq.length;
    for (const p of dentroPeq) {
        const k = (p.team === team ? 'bate:' : 'defende:') + (p.pos || p.role);
        porPos.set(k, (porPos.get(k) || 0) + 1);
    }
}

console.log(lances + ' tiros de meta, ' + frames + ' frames em GOAL_KICK');
if (!frames) process.exit(0);
console.log('\n  jogadores de campo dentro da PEQUENA area:');
console.log('    media por frame ' + (somaPeq / frames).toFixed(2) +
    '   pior frame ' + piorPeq);
console.log('    frames com pelo menos um: ' +
    (100 * [...porPos.values()].length ? '' : '') );
console.log('  adversarios dentro da GRANDE area: media ' +
    (somaGrandeAdv / frames).toFixed(2) + ' por frame');
console.log('\n  quem aparece la dentro (frames):');
for (const [k, n] of [...porPos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log('    ' + k.padEnd(20) + String(n).padStart(6) + '  (' +
        (100 * n / frames).toFixed(1) + '% dos frames)');
}

console.log(String.fromCharCode(10) + '  perfil no tempo (segundos desde o inicio do lance):');
for (let b = 0; b < perfil.length; b++) {
    if (!perfil[b]) continue;
    console.log('    ' + (b + '-' + (b + 1) + ' s').padEnd(9) +
        'media ' + (perfil[b].soma / perfil[b].n).toFixed(2).padStart(5) +
        '   pior ' + String(perfil[b].max).padStart(2) +
        '   (' + perfil[b].n + ' frames)');
}

/*
E QUEM SAO, EXACTAMENTE. Ao terceiro segundo de um lance, o estado da FSM, o
alvo que lhes foi escrito e a distancia a ele. Se o alvo estiver fora da area e
eles la dentro parados, o problema e a FSM nao os estar a levar.
*/
Math.random = mulberry32(semente + 1);
let visto = 0, dentroLance = 0;
let ant2 = null;
for (let i = 0; i < Math.round(1800 / dt) && visto < 3; i++) {
    Match.update(dt);
    if (Match.state !== 'GOAL_KICK') { ant2 = Match.state; dentroLance = 0; continue; }
    if (ant2 !== 'GOAL_KICK') dentroLance = 0;
    ant2 = 'GOAL_KICK';
    dentroLance++;
    if (dentroLance !== 180) continue;         // 3 s dentro do lance
    const team = Match.setPieceTeam;
    const bate = (team === 'TeamA') ? Match.players : Match.opponents;
    const dir = bate.find(p => p.role !== 'gk').dirZ;
    const linhaZ = -dir * (CAMPO_COMP / 2);
    const dentro = Match.players.concat(Match.opponents)
        .filter(p => p.role !== 'gk' && naPequena(p, linhaZ, dir));
    visto++;
    console.log(String.fromCharCode(10) + 'LANCE ' + visto + ', aos 3 s -- ' +
        dentro.length + ' na pequena area (bate = ' + team + ')');
    for (const p of dentro) {
        const t = p.dynamicTarget;
        const dz = (p.model.position.z - linhaZ) * dir;
        console.log('   ' + (p.team === team ? 'bate' : 'def ') + ' ' + (p.pos || p.role).padEnd(4) +
            ' estado ' + String(p.fsm && p.fsm.currentState).padEnd(16) +
            ' esta a ' + dz.toFixed(1) + ' m da linha' +
            '   alvo z ' + (t ? ((t.z - linhaZ) * dir).toFixed(1) : '?') +
            '   falta ' + (t ? p.model.position.distanceTo(t).toFixed(1) : '?') + ' m');
    }
}
