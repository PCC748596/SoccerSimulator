/*
O LADO FRACO FECHA (BlockShape.fechamentoLadoFraco). Mede, com a equipa em posse e a bola numa ala:
  . a distância mediana ao eixo (|x|) dos jogadores do lado CONTRÁRIO e fora do corredor do meio;
  . quantas vezes por 10 min o estado da equipa troca de lado (a abrir e fechar), que o atraso de 5-10 s deve conter.
OFF=1 desliga a regra, para comparar.

Uso: node tools/headless/lado_fraco.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 600);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
Match.init(new THREE.Scene());
if (process.env.OFF) BlockShape.fechamentoLadoFraco.activo = false;
const dt = 1 / 60;
const ks = [], alv = []; const xs = []; let trocas = 0, ult = {}, n = 0;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const lista of [Match.players, Match.opponents]) {
        const team = lista[0] && lista[0].team;
        const bb = (typeof TeamAI !== 'undefined') ? TeamAI.get(team) : null;
        const e = bb && bb._fechEst;
        if (e) {
            if (ult[team] !== undefined && ult[team] !== e.lado) trocas++;
            ult[team] = e.lado;
        }
        if (i % 6 || Match.possessionTeam !== team || Match.state !== 'PLAY') continue;
        const bx = Match.ball.position.x;
        if (Math.abs(bx) < 14) continue;                // bola numa ala
        for (const p of lista) {
            if (p.role === 'gk' || !p.model) continue;
            const x = p.model.position.x;
            if (Math.sign(x) !== -Math.sign(bx) || Math.abs(x) < 10) continue;   // lado contrário, fora do meio
            xs.push(Math.abs(x)); n++;
            if (e) { ks.push(e.k); alv.push(Math.abs(p.dynamicTarget.x)); }
        }
    }
}
xs.sort((a, b) => a - b);
const min = Match.tempoDeJogo / 60;
console.log(`semente ${semente}${process.env.OFF ? ' (OFF)' : ''}: ${n} amostras do lado fraco; |x| mediana ${xs.length ? xs[Math.floor(xs.length / 2)].toFixed(1) : 'n/d'} m, p25 ${xs.length ? xs[Math.floor(xs.length * 0.25)].toFixed(1) : 'n/d'}; trocas de lado do estado: ${trocas} (${(trocas * 10 / min).toFixed(1)} por 10 min de jogo)`);
if (ks.length) { ks.sort((a, b) => a - b); alv.sort((a, b) => a - b); console.log(`  k mediano ${ks[Math.floor(ks.length / 2)].toFixed(2)}; alvo |x| mediana ${alv[Math.floor(alv.length / 2)].toFixed(1)} p25 ${alv[Math.floor(alv.length / 4)].toFixed(1)}`); }
