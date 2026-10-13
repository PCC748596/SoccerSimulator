/*
O ORQUESTRADOR E A LINHA DOS DEFESAS. Relato: *"o meia está voltando 2 m atrás dos zagueiros para fazer o
quê? Mesmo sendo orquestrador não precisa voltar tanto quando o time tem a bola"*.

Mede, nos frames em que a equipa do orquestrador tem a bola: a distância dele à linha média dos defesas
(positivo = à frente deles) e a fracção do tempo em que está ATRÁS deles.
SEMCHAO=1 desliga o chão novo (`acimaDaDefesa`) e repõe o avanço -5, para comparar.

Uso: node tools/headless/orquestrador_recuado.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 400);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
Match.init(new THREE.Scene());
if (process.env.SEMCHAO) {
    delete PlayingStyles.orchestrator.faixaDeJogo.acimaDaDefesa;
    PlayingStyles.orchestrator.avanco = -5;
}
const dt = 1 / 60;
const difs = []; let atras = 0, n = 0;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 6) continue;
    for (const lista of [Match.players, Match.opponents]) {
        if (!lista.length) continue;
        const team = lista[0].team;
        if (Match.possessionTeam !== team || Match.state !== 'PLAY') continue;
        const defs = lista.filter(p => p.role === 'def' && p.model);
        if (!defs.length) continue;
        const linha = defs.reduce((s, p) => s + p.model.position.z * p.dirZ, 0) / defs.length;
        for (const p of lista) {
            if (p.playingStyle !== 'orchestrator' || !p.model) continue;
            const d = p.model.position.z * p.dirZ - linha;
            difs.push(d); n++; if (d < 0) atras++;
        }
    }
}
difs.sort((a, b) => a - b);
const q = (f) => difs.length ? difs[Math.floor(difs.length * f)].toFixed(1) : 'n/d';
console.log(`semente ${semente}${process.env.SEMCHAO ? ' (SEM chão)' : ''}: ${n} amostras de orquestrador com a equipa em posse`);
console.log(`  distância à linha dos defesas (m): p10 ${q(0.1)}  mediana ${q(0.5)}  p90 ${q(0.9)};  ATRÁS da linha: ${(100 * atras / Math.max(1, n)).toFixed(1)}%`);
