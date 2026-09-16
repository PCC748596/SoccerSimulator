/* Um remate forte e de perto ainda e agarrado? */
require('../headless/harness.js');
const N = 2000;
function amostra(dist, vel) {
    let a = 0, e = 0, r = 0;
    for (let i = 0; i < N; i++) {
        const d = resolverDefesaGK({ tipo: 'mergulho', gk: 70, tec: 60, vChegada: vel,
            extensao: 0.3, altura: 0.2, dist: dist });
        if (d.resultado === 'agarra') a++; else if (d.resultado === 'espalma') e++; else r++;
    }
    console.log('  ' + String(dist).padStart(4) + ' m a ' + String(vel).padStart(4) + ' m/s: agarra ' +
        (100 * a / N).toFixed(0) + '%  espalma ' + (100 * e / N).toFixed(0) + '%  roca ' + (100 * r / N).toFixed(0) + '%');
}
console.log('corte: ' + GkCatchModel.semAgarrar.distMax + ' m / ' + GkCatchModel.semAgarrar.velMin + ' m/s');
amostra(5, 28); amostra(5, 18); amostra(12, 28); amostra(20, 30); amostra(7.5, 22);
