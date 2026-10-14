/*
RITMO DAS ARRANCADAS E DISTANCIA ENTRE LINHAS. Relatos: o jogo parece lento (mais trote do que corrida rapida, ou
velocidade alta-baixa-alta intercalada) e a linha do meio fica ate 20 m da linha de ataque (o ideal: 5-15 m).
Mede, em jogo corrido:
  . histograma da velocidade dos jogadores de campo quando se mexem (> 1 m/s): faixas de m/s;
  . "arrancadas": episodios de aceleracao (de < 2 para > 6 m/s) e quanto tempo se mantem acima de 6 m/s depois;
  . oscilacao: numero de vezes por minuto-jogador em que a velocidade sobe e desce > 2 m/s em menos de 1.5 s;
  . distancia (m, referencial de ataque) entre a linha do meio (media dos meias) e a linha de ataque (media dos
    avancados), com a equipa com a bola e sem ela: media, p90, e % acima de 15 m (e de 20 m).
Uso: node tools/headless/ritmo_e_linhas.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 300);
const semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
Match.init(new THREE.Scene());
const dt = 1 / 60;
const faixas = [[1, 3], [3, 5], [5, 7], [7, 9], [9, 99]]; const hist = faixas.map(() => 0); let movendo = 0;
const hist_v = new Map();   // p -> amostras recentes {t, v}
let osc = 0, jogMin = 0, arranc = 0, arrancLongas = 0, tAlto = [];
const estado = new Map();    // p -> { fase, t0 }
const linhas = { ataca: [], defende: [] };
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (Match.state !== 'PLAY') continue;
    const t = i * dt;
    if (i % 3 === 0) {
        for (const p of Match.players.concat(Match.opponents)) {
            if (p.role === 'gk' || !p.velocity) continue;
            const v = Math.hypot(p.velocity.x, p.velocity.z);
            if (v > 1) { movendo++; faixas.forEach((f, k) => { if (v >= f[0] && v < f[1]) hist[k]++; }); }
            jogMin += 3 * dt / 60;
            // oscilacao: janela de 1.5 s
            let h = hist_v.get(p); if (!h) { h = []; hist_v.set(p, h); }
            h.push({ t, v }); while (h.length && t - h[0].t > 1.5) h.shift();
            if (h.length > 4) {
                let mn = 99, mx = 0, imn = 0, imx = 0;
                h.forEach((s, k) => { if (s.v < mn) { mn = s.v; imn = k; } if (s.v > mx) { mx = s.v; imx = k; } });
                const e = estado.get(p) || { ultimo: -9 };
                if (mx - mn > 2.0 && t - e.ultimo > 1.5) { osc++; e.ultimo = t; estado.set(p, e); }
            }
            // arrancadas
            const a = estado.get(p) || { ultimo: -9 };
            if (!a.fase && v < 2) { a.fase = 'parado'; }
            if (a.fase === 'parado' && v > 6) { a.fase = 'alto'; a.t0 = t; arranc++; }
            else if (a.fase === 'alto' && v < 5) { tAlto.push(t - a.t0); a.fase = v < 2 ? 'parado' : 'medio'; }
            else if (a.fase === 'medio' && v < 2) a.fase = 'parado';
            else if (a.fase === 'medio' && v > 6) { a.fase = 'alto'; a.t0 = t; arranc++; }
            estado.set(p, a);
        }
    }
    if (i % 12 === 0) {
        const c = Match.possessionTeam;
        for (const lista of [Match.players, Match.opponents]) {
            if (!lista[0]) continue;
            const mid = lista.filter(p => p.role === 'mid' && p.model), atk = lista.filter(p => p.role === 'atk' && p.model);
            if (!mid.length || !atk.length) continue;
            const mz = mid.reduce((s, p) => s + p.model.position.z * p.dirZ, 0) / mid.length;
            const az = atk.reduce((s, p) => s + p.model.position.z * p.dirZ, 0) / atk.length;
            (lista[0].team === c ? linhas.ataca : linhas.defende).push(az - mz);
        }
    }
}
const tot = Math.max(1, movendo);
console.log(`semente ${semente}: velocidade quando se mexem (${movendo} amostras):`);
faixas.forEach((f, k) => console.log(`   ${String(f[0]).padStart(2)}-${f[1] === 99 ? '+' : f[1]} m/s: ${(100 * hist[k] / tot).toFixed(0)}%`));
tAlto.sort((a, b) => a - b);
console.log(`   arrancadas (de <2 para >6 m/s): ${arranc}; fica acima de 5 m/s em media ${(tAlto.reduce((a, b) => a + b, 0) / Math.max(1, tAlto.length)).toFixed(1)} s (mediana ${tAlto.length ? tAlto[Math.floor(tAlto.length / 2)].toFixed(1) : '-'} s)`);
console.log(`   oscilacoes (sobe/desce > 2 m/s em 1.5 s): ${(osc / Math.max(1e-6, jogMin)).toFixed(1)} por minuto-jogador`);
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(f * (s.length - 1))] : NaN; };
for (const [nome, a] of Object.entries(linhas)) {
    console.log(`   distancia meio->ataque, equipa que ${nome}: n=${a.length} media ${(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(1)} m | p50 ${q(a, .5).toFixed(1)} | p90 ${q(a, .9).toFixed(1)} | acima de 15 m: ${(100 * a.filter(x => x > 15).length / Math.max(1, a.length)).toFixed(0)}% | acima de 20 m: ${(100 * a.filter(x => x > 20).length / Math.max(1, a.length)).toFixed(0)}% | abaixo de 5 m: ${(100 * a.filter(x => x < 5).length / Math.max(1, a.length)).toFixed(0)}%`);
}
