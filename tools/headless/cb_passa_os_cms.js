/*
O CB QUE ULTRAPASSA OS CMs A CONDUZIR. Relato: *"o CB está ultrapassando os CMs na condução da bola para o ataque.
Isso cria um buraco no meio-campo, e os passes dos CBs saem nos pés dos adversários"*.
Mede, com um CB com a bola: o quanto ele está à frente da linha média dos CMs da equipa (>0 = à frente), a
fracção do tempo em que está à frente, o pior caso, e o fim de cada posse do CB (passe: para quem, interceptado?).
Uso: node tools/headless/cb_passa_os_cms.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 600);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
Match.init(new THREE.Scene());
if (process.env.SEMPISO) BlockShape.meiasComBola.aSeguirODefesa.activo = false;
const dt = 1 / 60;
const difs = []; let n = 0, adiante = 0, pior = -Infinity, posses = 0;
let ant = null;   // { p, t }
const estadosAdiante = {}; const zs = [];
let passes = 0, aoCM = 0, aoAtk = 0, aoOutro = 0, cortados = 0, pendente = null;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    const c = Match.ballCarrier;
    if (pendente) {
        if (Match.ballCarrier) {
            if (Match.ballCarrier.team !== pendente.team) cortados++;
            pendente = null;
        } else if (i - pendente.i > 60 * 4) pendente = null;
    }
    if (ant && c !== ant) {
        if (Match.intendedReceiver && Match.intendedReceiver !== ant) {
            passes++;
            const r = Match.intendedReceiver;
            if (r.pos === 'CM' || r.pos === 'LM' || r.pos === 'RM') aoCM++; else if (r.role === 'atk') aoAtk++; else aoOutro++;
            pendente = { team: ant.team, i };
        }
    }
    ant = (c && c.pos === 'CB') ? c : null;
    if (!c || c.pos !== 'CB' || Match.state !== 'PLAY' || i % 6 || c.model.position.z * c.dirZ > 5) continue;
    const lista = c.team === 'TeamA' ? Match.players : Match.opponents;
    const cms = lista.filter(p => p.pos === 'CM' && p.model);
    if (!cms.length) continue;
    const linha = cms.reduce((s, p) => s + p.model.position.z * p.dirZ, 0) / cms.length;
    const d = c.model.position.z * c.dirZ - linha;
    if (d > 5 && !global._dbg) { global._dbg = 1; console.log('DEBUG t', (i*dt).toFixed(0), 'CB', c.model.position.z.toFixed(1), 'dirZ', c.dirZ, 'state', Match.state, cms.map(m => [m.pos, m.model.position.z.toFixed(1), m.dynamicTarget ? m.dynamicTarget.z.toFixed(1) : '-', m.fsm.currentState, m.role].join('/')).join(' ')); }
    zs.push(Math.round(c.model.position.z * c.dirZ / 10) * 10);
    difs.push(d); n++; if (d > 0) { adiante++; const k = c.fsm.currentState + ' ' + (c.btAcao || c.lastAction || c.accaoBT || ''); estadosAdiante[k] = (estadosAdiante[k] || 0) + 1; } if (d > pior) pior = d;
}
difs.sort((a, b) => a - b);
const q = (f) => difs.length ? difs[Math.floor(f * (difs.length - 1))].toFixed(1) : '-';
console.log(`semente ${semente}: ${n} amostras com CB na bola; à frente dos CMs em ${(100 * adiante / Math.max(1, n)).toFixed(1)}% ; dif mediana ${q(0.5)} p90 ${q(0.9)} pior ${pior.toFixed(1)} m`);
console.log(`  passes do CB: ${passes} (CM/alas ${aoCM}, avançado ${aoAtk}, outros ${aoOutro}); cortados pelo adversário: ${cortados}`);
console.log('  estados à frente:', JSON.stringify(estadosAdiante));
const hz = {}; for (const z of zs) hz[z] = (hz[z]||0)+1; console.log('  avanco do CB (m, arredondado a 10):', JSON.stringify(hz));
