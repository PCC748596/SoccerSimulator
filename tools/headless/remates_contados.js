/*
O CONTADOR DE REMATES CONTA GESTOS, NÃO REMATES.

O `initiateShoot` incrementa `remates.tentados` no ARRANQUE do gesto; a bola só
sai `contactTime` depois, dentro do ActionState. Entre os dois, o gesto pode:

  - resolver-se com a bola no pé  -> remate a sério (executeShotGameplay);
  - resolver-se sem bola          -> `furados`, já contado à parte;
  - ser CANCELADO — qualquer `changeState` limpa o `actionState` — e aí não há
    remate nenhum, mas o contador já somou. Silencioso.

Mede os três, para se saber quanto do "remates" dos relatórios é gesto.

Uso: node tools/headless/remates_contados.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 900);
const semente = Number(process.argv[3] || 0);

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(1000 + semente * 977);

require('./harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let gestos = 0, executados = 0;
const emCurso = new Set();
{
    const orig = FootballPlayer.prototype.initiateShoot;
    FootballPlayer.prototype.initiateShoot = function () {
        gestos++;
        emCurso.add(this);
        return orig.apply(this, arguments);
    };
    const ex = global.executeShotGameplay;
    global.executeShotGameplay = function (p) {
        executados++;
        emCurso.delete(p);
        return ex.apply(this, arguments);
    };
}

/*
E os remates que NAO passam pelo gesto do pe: a cabecada dentro do raio de
remate, a falta directa e o penalti. Sao remates a serio e tem de entrar na
conta, senao a "inflacao" media o que nao e.
*/
let cabecadas = 0, bolaParada = 0;
{
    // Falta directa e penalti: tambem sao remates, e tambem incrementam.
    for (const nome of ['executarFalta', 'baterPenalti']) {
        const of = FootballPlayer.prototype[nome];
        if (!of) continue;
        FootballPlayer.prototype[nome] = function () {
            const antes = MatchStats[this.team].remates.tentados;
            const r = of.apply(this, arguments);
            if (MatchStats[this.team].remates.tentados > antes) bolaParada++;
            return r;
        };
    }
    const oh = FootballPlayer.prototype.executeHeader;
    FootballPlayer.prototype.executeHeader = function () {
        const antes = MatchStats[this.team].remates.tentados;
        const r = oh.apply(this, arguments);
        if (MatchStats[this.team].remates.tentados > antes) cabecadas++;
        return r;
    };
}

// Um gesto morre quando o jogador sai do estado SHOOT sem ter havido contacto.
let abortados = 0;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const p of Array.from(emCurso)) {
        if (p.fsm.currentState !== 'SHOOT') { abortados++; emCurso.delete(p); }
    }
}

const A = MatchStats.TeamA, B = MatchStats.TeamB;
const contados = A.remates.tentados + B.remates.tentados;
const furados = A.remates.furados + B.remates.furados;
const min = Match.tempoDeJogo / 60;
const por90 = (n) => (n * 90 / min).toFixed(1);

console.log(`\n${min.toFixed(0)} min de relogio`);
console.log(`gestos de remate iniciados : ${gestos}  (${por90(gestos)}/90)`);
console.log(`  com bola no pe (remate)  : ${executados}  (${por90(executados)}/90)`);
console.log(`  furados (gesto sem bola) : ${furados}`);
console.log(`  ABORTADOS (nem uma coisa nem outra): ${abortados}`);
console.log(`cabecadas ao golo          : ${cabecadas}`);
console.log(`bola parada (falta/penalti): ${bolaParada}`);
console.log(`contador remates.tentados  : ${contados}  (${por90(contados)}/90)`);
const reais = executados + cabecadas + bolaParada;
console.log(`remates REAIS (bola batida): ${reais}  (${por90(reais)}/90)`);
console.log(`\na mais no contador: ${contados - reais} (${(100 * (contados - reais) / Math.max(1, reais)).toFixed(0)}%) — furados ${furados}, abortados ${abortados}`);
