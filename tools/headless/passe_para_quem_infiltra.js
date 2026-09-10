/*
QUEM INFILTRA RECEBE O PASSE? Relato: "os jogadores infiltrando nao estao com
nenhuma prioridade para receber o passe."

Mede, em cada escolha de alvo de passe:

  - quantas vezes HAVIA um companheiro em RUN_INTO_SPACE entre os candidatos
    possiveis (a mesma janela de distancia que o findPassTarget usa);
  - e em quantas dessas ele foi mesmo o escolhido.

A razao entre as duas e a prioridade real. Sem isto so se sabe que o bonus
existe no codigo, nao que ele decide alguma coisa.

Uso: node tools/headless/passe_para_quem_infiltra.js [segundos] [semente]
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

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let comInfiltrado = 0, escolheuInfiltrado = 0, totalEscolhas = 0;
let passesFeitos = 0, passesParaInfiltrado = 0;

const proto = Object.getPrototypeOf(Match.players[0]);
const orig = proto.findPassTarget;
proto.findPassTarget = function (filtro) {
    const alvo = orig.call(this, filtro);
    if (alvo) {
        totalEscolhas++;
        const colegas = (this.team === 'TeamA') ? Match.players : Match.opponents;
        /*
        "Havia um infiltrado ao alcance": o mesmo tecto de distancia do
        findPassTarget (skill de passe * 0.6, minimo 10 m).
        */
        const maxDist = Math.max(10, this.skillFor('PASS') * 0.6);
        const houve = colegas.some(c => c !== this && c.fsm &&
            c.fsm.currentState === 'RUN_INTO_SPACE' &&
            this.model.position.distanceTo(c.model.position) <= maxDist);
        if (houve) {
            comInfiltrado++;
            if (alvo.fsm && alvo.fsm.currentState === 'RUN_INTO_SPACE') escolheuInfiltrado++;
        }
    }
    return alvo;
};

// E o que sai mesmo do pe, que e o que se ve no jogo.
if (typeof global.executePassGameplay === 'function') {
    const origPasse = global.executePassGameplay;
    global.executePassGameplay = function (p) {
        const alvo = p.passTarget;
        if (alvo) {
            passesFeitos++;
            if (alvo.fsm && alvo.fsm.currentState === 'RUN_INTO_SPACE') passesParaInfiltrado++;
        }
        return origPasse(p);
    };
}

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';
console.log(`semente ${semente}  (${segundos}s)`);
console.log(`  escolhas de alvo: ${totalEscolhas}, ` +
    `com um infiltrado ao alcance: ${comInfiltrado} (${pct(comInfiltrado, totalEscolhas)})`);
console.log(`  e nessas o infiltrado foi escolhido ${escolheuInfiltrado} vezes (${pct(escolheuInfiltrado, comInfiltrado)})`);
console.log(`  passes executados: ${passesFeitos}, para quem infiltrava: ` +
    `${passesParaInfiltrado} (${pct(passesParaInfiltrado, passesFeitos)})`);
