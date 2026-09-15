/*
De que lado vem quem tira a bola ao portador?

So conta o que e mesmo um ROUBO: a posse passa ao adversario dentro de meio
segundo e o ladrao estava a menos de 3 m do portador no instante em que ele
perdeu a bola. Passes interceptados a 15 m ficam de fora.

Uso: node tools/scratch/_roubo_angulo.js [segundos]
*/
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const JANELA = 30;     // frames (0.5 s) entre perder a bola e o adversario ficar com ela
const PERTO = 3.0;     // m entre os dois no instante da perda
const roubos = [];
let ult = null;

for (let i = 0; i < (Number(process.argv[2] || 1200)) / dt; i++) {
    const antes = Match.ballCarrier;
    Match.update(dt);
    const agora = Match.ballCarrier;

    if (antes && Match.state === 'PLAY') {
        let fx, fz;
        if (antes.velocity && antes.velocity.lengthSq() > 0.1) {
            const n = Math.hypot(antes.velocity.x, antes.velocity.z) || 1;
            fx = antes.velocity.x / n; fz = antes.velocity.z / n;
        } else {
            fx = Math.sin(antes.model.rotation.y); fz = Math.cos(antes.model.rotation.y);
        }
        const rivais = (antes.team === 'TeamA') ? Match.opponents : Match.players;
        ult = {
            p: antes, team: antes.team, fx: fx, fz: fz, idade: 0,
            x: antes.model.position.x, z: antes.model.position.z,
            rivais: rivais.map(o => ({ p: o, x: o.model.position.x, z: o.model.position.z }))
        };
    } else if (ult) {
        ult.idade++;
        if (ult.idade > JANELA) ult = null;
    }

    if (!ult || !agora || agora === ult.p || agora.team === ult.team) continue;

    const reg = ult.rivais.find(r => r.p === agora);
    const guardado = ult;
    ult = null;
    if (!reg) continue;

    const dx = reg.x - guardado.x, dz = reg.z - guardado.z;
    const d = Math.hypot(dx, dz);
    if (d > PERTO || d < 0.001) continue;      // longe: foi intercepcao, nao roubo

    const cos = (guardado.fx * dx + guardado.fz * dz) / d;
    roubos.push({
        ang: Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI,
        d: d,
        estado: agora.fsm ? agora.fsm.currentState : '?'
    });
}

if (!roubos.length) {
    console.log('sem roubos');
} else {
    const ord = roubos.map(r => r.ang).sort((a, b) => a - b);
    const q = (f) => ord[Math.floor(ord.length * f)];
    console.log(roubos.length + ' roubos (adversario a menos de ' + PERTO + ' m, em ' +
        (Number(process.argv[2] || 1200) / 60).toFixed(0) + ' min)');
    console.log('  angulo do ladrao vs frente do portador: p10 ' + q(0.1).toFixed(0) +
        ' | mediana ' + q(0.5).toFixed(0) + ' | p90 ' + q(0.9).toFixed(0) + ' graus');
    const faixas = [['pela FRENTE (0-60)', 0, 60], ['de LADO (60-120)', 60, 120],
        ['por TRAS (120-180)', 120, 181]];
    for (const [nome, lo, hi] of faixas) {
        const n = roubos.filter(r => r.ang >= lo && r.ang < hi).length;
        console.log('    ' + nome.padEnd(20) + ': ' + n + ' (' + (100 * n / roubos.length).toFixed(0) + '%)');
    }
    const atras = roubos.filter(r => r.ang >= 120);
    const est = {};
    atras.forEach(r => { est[r.estado] = (est[r.estado] || 0) + 1; });
    console.log('  os de tras, por estado de quem rouba: ' + JSON.stringify(est));
    if (atras.length) {
        const dd = atras.map(r => r.d).sort((a, b) => a - b);
        console.log('  e a que distancia estavam: mediana ' +
            dd[Math.floor(dd.length / 2)].toFixed(2) + ' m');
    }
}
