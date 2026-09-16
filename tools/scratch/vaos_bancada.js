/*
OS VAOS DA BANCADA — ha buracos no anel de cadeiras a volta do campo?

Relato: *"fecha os vaos das arquibancadas"*. Apareceram quando as bancadas
foram afastadas para 12 m: as rectas acabavam nos limites do CAMPO e os arcos
das esquinas tinham ido para fora com o recuo. Ver `cornerX`/`cornerZ` no
createField (match_setup.js), que e de onde as rectas tiram ate onde vao.

Ordena a primeira faixa de cadeiras por angulo a volta do centro e mede a
distancia entre vizinhas. Os corredores de escadas (2 colunas a cada 22) sao de
proposito e dao ~2.8 m; acima de 3 m e buraco.

Uso: node tools/scratch/vaos_bancada.js
*/
require('../headless/harness.js');
const scene = new THREE.Scene();
Match.init(scene);

const pts = [];
scene.traverse(o => {
    if (!o.isInstancedMesh) return;
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m); v.setFromMatrixPosition(m);
        if (v.y < 0.3 || v.y > 1.6) continue;      // so as filas de baixo
        pts.push({ x: v.x, z: v.z, a: Math.atan2(v.z, v.x) });
    }
});
pts.sort((a, b) => a.a - b.a);

const vaos = [];
for (let i = 1; i < pts.length; i++) {
    vaos.push({ d: Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z), p: pts[i - 1] });
}
vaos.sort((a, b) => b.d - a.d);

console.log(pts.length + ' lugares na faixa baixa');
console.log('  maior vao: ' + vaos[0].d.toFixed(2) + ' m');
const grandes = vaos.filter(v => v.d > 3.0);
console.log('  vaos acima de 3 m: ' + grandes.length + '   (tem de ser 0)');
grandes.slice(0, 12).forEach(v =>
    console.log('    ' + v.d.toFixed(1) + ' m em (' + v.p.x.toFixed(0) + ', ' + v.p.z.toFixed(0) + ')'));
