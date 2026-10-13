/*
PASSES PARA NINGUÉM. Relato: *"toda hora o zagueiro pega a bola e toca no meio de campo para ninguém;
os atacantes estão muito na frente e os meias ainda não foram para o meio"*.

Por passe (contexto do `registarPasseIniciado`): quem passou (papel/posição, via `initiatePass`), o estado
do jogo, o destino e a distância do COMPANHEIRO mais perto do destino. "Para ninguém" = ninguém do time a
menos de `raio` m do destino (e o passe com mais de 12 m).

Uso: node tools/headless/passe_para_ninguem.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 600);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
Match.init(new THREE.Scene());

const RAIO = 8;
let ultimoPassador = null, ultimoEstado = null, ultimoModo = '';
const orig0 = FootballPlayer.prototype.initiatePass;
FootballPlayer.prototype.initiatePass = function () { ultimoPassador = this; ultimoEstado = Match.state; ultimoModo = this.isCross ? 'cruz' : this.isThroughBall ? 'lancamento' : this.isPasseEspaco ? 'espaco' : 'pe'; return orig0.apply(this, arguments); };

const lista = [];
const orig = MatchStats.registarPasseIniciado.bind(MatchStats);
MatchStats.registarPasseIniciado = function (team, tipo, dados) {
    if (dados && dados.destino && dados.origem) {
        const mates = (team === 'TeamA' ? Match.players : Match.opponents).filter(p => p.role !== 'gk' && p.model && p !== ultimoPassador);
        let d = 1e9;
        for (const m of mates) d = Math.min(d, Math.hypot(m.model.position.x - dados.destino.x, m.model.position.z - dados.destino.z));
        lista.push({ team, tipo, pos: ultimoPassador ? ultimoPassador.pos : '?', role: ultimoPassador ? ultimoPassador.role : '?',
            estado: ultimoEstado, modo: ultimoModo, dist: dados.dist, nada: d, dirZ: dados.dirZ, dz: (dados.destino.z - dados.origem.z) * dados.dirZ,
            zOrig: dados.origem.z * dados.dirZ, zDest: dados.destino.z * dados.dirZ });
    }
    return orig(team, tipo, dados);
};

const dt = 1 / 60;
// DESFECHO: quem toca a seguir na bola — um colega, um adversário, ou ninguém (a bola sai/para).
const desfechos = [];
let pend = null;
const origReg = MatchStats.registarPasseIniciado;
MatchStats.registarPasseIniciado = function (team, tipo, dados) {
    const r = origReg.apply(this, arguments);
    if (dados && dados.destino) pend = { passador: ultimoPassador, team, role: ultimoPassador ? ultimoPassador.role : '?', modo: ultimoModo, dist: dados.dist, t: 0 };
    return r;
};
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (pend) {
        pend.t += dt;
        const lt = Match.lastTouchedPlayer;
        if (lt && lt !== pend.passador) { desfechos.push({ ...pend, res: lt.team === pend.team ? 'colega' : 'rival' }); pend = null; }
        else if (Match.state !== 'PLAY' || pend.t > 8) { desfechos.push({ ...pend, res: 'ninguem' }); pend = null; }
    }
}

const longos = lista.filter(p => p.dist > 12);
const nada = longos.filter(p => p.nada > RAIO);
console.log(`\nsemente ${semente}: ${lista.length} passes, ${longos.length} com mais de 12 m, ${nada.length} para ninguém (nenhum colega a <${RAIO} m do destino)`);
const por = (arr, f) => { const o = {}; for (const p of arr) { const k = f(p); o[k] = (o[k] || 0) + 1; } return JSON.stringify(o); };
console.log('  para ninguém, por posição de quem passa:', por(nada, p => p.pos));
console.log('  para ninguém, por tipo de passe:        ', por(nada, p => p.modo));
console.log('  longos, por tipo de passe:              ', por(longos, p => p.modo));
console.log('  para ninguém, por estado do jogo:       ', por(nada, p => p.estado));
console.log('  todos os longos, por estado:            ', por(longos, p => p.estado));
const def = nada.filter(p => p.role === 'def');
if (def.length) {
    const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.log(`  zagueiros/laterais para ninguém: ${def.length}; distância mediana ${med(def.map(p => p.dist)).toFixed(1)} m, ao colega mais perto ${med(def.map(p => p.nada)).toFixed(1)} m; origem z ${med(def.map(p => p.zOrig)).toFixed(1)} -> destino z ${med(def.map(p => p.zDest)).toFixed(1)} (0 = meio-campo, referencial de ataque)`);
}
console.log('');
{
    const lg = desfechos.filter(d => d.dist > 12);
    const tab = (arr) => { const o = { colega: 0, rival: 0, ninguem: 0 }; for (const d of arr) o[d.res]++; const n = arr.length || 1; return `n=${arr.length} colega ${(100 * o.colega / n).toFixed(0)}%  rival ${(100 * o.rival / n).toFixed(0)}%  ninguém ${(100 * o.ninguem / n).toFixed(0)}%`; };
    console.log('  DESFECHO dos passes longos (>12 m):', tab(lg));
    for (const modo of ['pe', 'espaco', 'lancamento']) console.log('    ' + modo.padEnd(11), tab(lg.filter(d => d.modo === modo)));
    console.log('    zagueiros/laterais (def):', tab(lg.filter(d => d.role === 'def')), '| def + espaço:', tab(lg.filter(d => d.role === 'def' && d.modo === 'espaco')));
}
