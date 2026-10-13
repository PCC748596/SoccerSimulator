/*
UM COMPANHEIRO TOMA A BOLA AO PORTADOR.

Relato: *"os jogadores do time com a bola estão correndo meio que para as mesmas posições. Às vezes um
jogador está com a bola e vem outro do mesmo time, passa correndo por ele e toma a bola, em vez de se
posicionar para receber um passe"*.

Conta, por frame, as vezes em que o `ballCarrier` passa de A para B da MESMA equipa sem passe pelo meio
(a bola não andou mais que `distBola` m entre os dois frames e não havia `intendedReceiver`), e regista de
que ESTADO da FSM vinha B e a que distância estava de A. Mede também quantos companheiros do portador
estão a menos de `raioAglomerado` m uns dos outros (o "correr para o mesmo sítio").

Uso: node tools/headless/toma_do_colega.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 600);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const scene = new THREE.Scene();
Match.init(scene);

const dt = 1 / 60;
let ultimo = null, prev = null, prevEstadoB = new Map(), tomas = 0, trocasDeEquipa = 0, frames = 0;
const estados = {}, dists = [];
const estAlvo = {}, estPar = {}; let alvosNoPortador = 0, framesAlvoPortador = 0, paresMesmoAlvo = 0;
let aglomFrames = 0, aglomTot = 0, comBola = 0;

for (let i = 0; i < Math.round(segundos / dt); i++) {
    // estados ANTES do passo: é o que ele vinha a fazer quando tomou a bola
    const lista = Match.players.concat(Match.opponents);
    const antes = new Map();
    for (const p of lista) antes.set(p, p.fsm ? p.fsm.currentState : '?');
    const carrierAntes = Match.ballCarrier;
    const bolaAntes = Match.ball.position.clone();
    const tinhaRec = !!Match.intendedReceiver;
    Match.update(dt);
    frames++;
    const c = Match.ballCarrier;
    if (c) {
        comBola++;
        // aglomeração: companheiros (sem o portador) a menos de 6 m uns dos outros
        const mates = (c.team === 'TeamA' ? Match.players : Match.opponents).filter(p => p !== c && p.role !== 'gk' && p.model);
        let pares = 0;
        for (let a = 0; a < mates.length; a++) for (let b = a + 1; b < mates.length; b++) {
            if (mates[a].model.position.distanceTo(mates[b].model.position) < 6) pares++;
        }
        aglomTot += pares; if (pares >= 3) aglomFrames++;
        // ALVOS: companheiros cujo destino cai em cima do portador (<4 m) e pares com o mesmo destino (<3 m).
        const alvoNoPortador = [], tg = [];
        for (const m of mates) {
            const t = m.dynamicTarget; if (!t) continue;
            tg.push(m);
            if (Math.hypot(t.x - c.model.position.x, t.z - c.model.position.z) < 4 && m.model.position.distanceTo(c.model.position) > 4) {
                alvoNoPortador.push(m);
                const e = m.fsm ? m.fsm.currentState : '?';
                estAlvo[e] = (estAlvo[e] || 0) + 1;
            }
        }
        alvosNoPortador += alvoNoPortador.length; if (alvoNoPortador.length) framesAlvoPortador++;
        for (let a2 = 0; a2 < tg.length; a2++) for (let b2 = a2 + 1; b2 < tg.length; b2++) {
            const A = tg[a2].dynamicTarget, B = tg[b2].dynamicTarget;
            if (Math.hypot(A.x - B.x, A.z - B.z) < 3) { paresMesmoAlvo++; const k = (tg[a2].fsm ? tg[a2].fsm.currentState : '?') + '+' + (tg[b2].fsm ? tg[b2].fsm.currentState : '?'); estPar[k] = (estPar[k] || 0) + 1; }
        }
    }
    // O portador perde a bola (fica null) e outro pega nela pouco depois: toma, se não houve passe pelo meio.
    const agora = i * dt;
    if (carrierAntes && !c) { ultimo = { p: carrierAntes, t: agora, bola: bolaAntes, passe: false, estados: antes }; }
    if (ultimo && !c && Match.intendedReceiver) ultimo.passe = true;
    if (c && ultimo) {
        if (c !== ultimo.p && agora - ultimo.t < 1.2) {
            if (c.team === ultimo.p.team) {
                const moveu = ultimo.bola.distanceTo(Match.ball.position);
                if (!ultimo.passe && moveu < 4) {
                    tomas++;
                    const e = ultimo.estados.get(c) || '?';
                    estados[e] = (estados[e] || 0) + 1;
                    dists.push(ultimo.p.model.position.distanceTo(c.model.position));
                }
            } else trocasDeEquipa++;
        }
        ultimo = null;
    }
}
const min = Match.tempoDeJogo / 60;
dists.sort((a, b) => a - b);
console.log(`\nsemente ${semente}: ${min.toFixed(1)} min de jogo, ${comBola} frames com portador`);
console.log(`  tomas ao colega (sem passe): ${tomas}  = ${(tomas * 90 / min).toFixed(1)}/90 min   | posses trocadas com adversário: ${trocasDeEquipa}`);
console.log(`  estado de quem tomou, antes: ${JSON.stringify(estados)}`);
if (dists.length) console.log(`  distância ao portador (mediana): ${dists[Math.floor(dists.length / 2)].toFixed(2)} m`);
console.log(`  pares de companheiros a <6 m: média ${(aglomTot / Math.max(1, comBola)).toFixed(2)}; frames com >=3 pares: ${(100 * aglomFrames / Math.max(1, comBola)).toFixed(1)}%\n`);
console.log(`  companheiros com DESTINO em cima do portador (<4 m, estando a >4 m): média ${(alvosNoPortador / Math.max(1, comBola)).toFixed(2)}/frame; em ${(100 * framesAlvoPortador / Math.max(1, comBola)).toFixed(1)}% dos frames; estados ${JSON.stringify(estAlvo)}`);
console.log(`  pares de companheiros com o MESMO destino (<3 m): média ${(paresMesmoAlvo / Math.max(1, comBola)).toFixed(2)}/frame; estados ${JSON.stringify(Object.entries(estPar).sort((a, b) => b[1] - a[1]).slice(0, 6))}`);
