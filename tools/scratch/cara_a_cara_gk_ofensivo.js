/*
COM O GUARDA-REDES OFENSIVO: quanto ele sai, e quando o avancado finaliza.

Dispara o cara a cara varias vezes e, em cada lance, regista frame a frame o
avanco do guarda-redes (metros a frente da propria linha) e o instante do
remate. No fim diz, no momento do remate: a distancia do avancado a baliza, o
avanco do guarda-redes, e quanto tempo o avancado deixou passar depois de o
guarda-redes ter saido mais de 5 m.

Uso: node tools/scratch/cara_a_cara_gk_ofensivo.js [lances]
*/
const N = Number(process.argv[2] || 12);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(Number(process.argv[3] || 20260915));
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const larg = (typeof LARGURA_BALIZA !== 'undefined') ? LARGURA_BALIZA : 7.32;
const linhas = [];
for (let n = 0; n < N; n++) {
    Match.init(scene);
    if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
    for (let i = 0; i < 30; i++) Match.update(dt);
    Match.triggerCaraACara('TeamA', (Math.random() * 2 - 1) * 30);
    const atk = Match.players.filter(p => p.role !== 'gk').find(p => p.hasBall) || Match.ballCarrier;
    const gk = Match.opponents.find(p => p.role === 'gk');
    if (!atk || !gk) continue;
    // Forca o traco ofensivo: e o caso do relato.
    gk.gkStyleBase = 'offensive';
    gk.gkStyle = 'offensive';

    let tSaiu = null, remate = null, avancoMax = 0;
    for (let i = 0; i < 60 * 8; i++) {
        Match.update(dt);
        const t = i * dt;
        const avancoGk = Math.abs(gk.ownGoalZ) - Math.abs(gk.model.position.z);
        avancoMax = Math.max(avancoMax, avancoGk);
        if (tSaiu === null && avancoGk > 5) tSaiu = t;
        if (!remate && atk.fsm.currentState === 'SHOOT') {
            const P = atk.model.position;
            remate = {
                t: t,
                dist: Math.hypot(P.x, atk.targetGoalZ - P.z),
                ang: anguloDaBaliza(P.x, P.z, atk.targetGoalZ, larg) * 180 / Math.PI,
                avancoGk: avancoGk,
                distAoGk: P.distanceTo(gk.model.position)
            };
        }
        if (Match.state !== 'PLAY' || (gk.gkEstado === 'segurando')) break;
    }
    linhas.push({ tSaiu, remate, avancoMax, gkEstado: gk.gkEstado });
}

console.log('lance  gk sai dos 5 m  remate em   espera   dist baliza  dist ao gk  gk adiantado  angulo');
let esperas = [], semRemate = 0;
for (let i = 0; i < linhas.length; i++) {
    const L = linhas[i];
    if (!L.remate) { semRemate++; console.log(String(i + 1).padStart(5) + '  ' + (L.tSaiu === null ? '   nunca' : L.tSaiu.toFixed(2).padStart(8)) + '   (sem remate; gk ' + L.gkEstado + ')'); continue; }
    const espera = (L.tSaiu === null) ? null : (L.remate.t - L.tSaiu);
    if (espera !== null) esperas.push(espera);
    console.log(String(i + 1).padStart(5) + '  ' + (L.tSaiu === null ? '   nunca' : L.tSaiu.toFixed(2).padStart(8)) +
        '   ' + L.remate.t.toFixed(2).padStart(7) + '  ' + (espera === null ? '    -' : espera.toFixed(2).padStart(6)) +
        '  ' + L.remate.dist.toFixed(1).padStart(10) + '  ' + L.remate.distAoGk.toFixed(1).padStart(9) +
        '  ' + L.remate.avancoGk.toFixed(1).padStart(11) + '  ' + L.remate.ang.toFixed(0).padStart(6));
}
if (esperas.length) {
    esperas.sort((a, b) => a - b);
    const soma = esperas.reduce((a, b) => a + b, 0);
    console.log('');
    console.log('espera media depois de o gk sair dos 5 m: ' + (soma / esperas.length).toFixed(2) +
        ' s (mediana ' + esperas[Math.floor(esperas.length / 2)].toFixed(2) + ', max ' +
        esperas[esperas.length - 1].toFixed(2) + ') | lances sem remate: ' + semRemate);
}
