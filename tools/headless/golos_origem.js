/*
DE ONDE VÊM OS GOLOS.

O headless dá ~6.5 golos por 90 min de relógio (alvo ~2.5) e os relatórios não
dizem porquê: "remates" e "no alvo" são contadores de INTENÇÃO (o ponto visado)
e o golo é medido na baliza, portanto as duas contas nem sequer falam do mesmo.

Aqui mede-se o lance: o último toque antes de a bola entrar, a que distância e
com que velocidade, se houve remate mesmo antes do golo ou se a bola entrou
sozinha, e o que o guarda-redes estava a fazer.

Uso: node tools/headless/golos_origem.js [segundos] [semente]
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

/*
REMATES REAIS: o `tipoDeRemate` corre uma vez por remate executado, e nesse
instante o `Match.ballCarrier` ainda é quem remata. É o unico sitio onde o
remate se ve sem passar pelos contadores.
*/
let ultimoRemate = null;
const remates = [];
{
    const orig = global.tipoDeRemate;
    global.tipoDeRemate = function (o) {
        const t = orig(o);
        const p = Match.ballCarrier || Match.lastTouchedPlayer;
        if (p && p.model) {
            const baliza = p.dirZ * (CAMPO_COMP / 2);
            ultimoRemate = {
                tipo: t,
                t: Match.tempoDeJogo,
                dist: Math.hypot(p.model.position.x, baliza - p.model.position.z),
                pos: p.pos,
                team: p.team
            };
            remates.push(ultimoRemate);
        }
        return t;
    };
}

const golos = [];
let defesas = 0;
{
    const orig = global.resolverDefesaGK;
    if (orig) {
        global.resolverDefesaGK = function (o) {
            const r = orig(o);
            if (r && (r.resultado === 'agarra' || r.resultado === 'espalma')) defesas++;
            return r;
        };
    }
    const credit = Match.creditarGolo.bind(Match);
    Match.creditarGolo = function (zSinal) {
        const marcou = (zSinal < 0) ? 'TeamB' : 'TeamA';
        const gk = (zSinal < 0) ? Match.players[0] : Match.opponents[0];
        golos.push({
            marcou: marcou,
            // Houve remate nos ultimos 4 s de relogio? Se nao, a bola entrou
            // sem ninguem a rematar — deflexao, passe, ou o proprio GK.
            remate: (ultimoRemate && (Match.tempoDeJogo - ultimoRemate.t) < 4 * MatchDuration.timeScale)
                ? ultimoRemate : null,
            gkEstado: gk ? gk.gkEstado : '?',
            gkDist: gk ? Math.hypot(gk.model.position.x - Match.ball.position.x,
                gk.model.position.z - Match.ball.position.z) : -1,
            vBola: Match.ballVel.length(),
            entradaX: Match.ball.position.x,
            entradaY: Match.ball.position.y
        });
        return credit(zSinal);
    };
}

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

const min = Match.tempoDeJogo / 60;
const por90 = (n) => (n * 90 / min).toFixed(2);
const med = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';

console.log(`\n${min.toFixed(0)} min de relogio | ${golos.length} golos (${por90(golos.length)}/90) | ` +
    `${remates.length} remates (${por90(remates.length)}/90) | ${defesas} defesas (${por90(defesas)}/90)`);

const comRemate = golos.filter(g => g.remate);
console.log(`\ngolos com remate identificado: ${comRemate.length}/${golos.length}`);
console.log(`  distancia media do remate: ${med(comRemate.map(g => g.remate.dist))} m`);
const porTipo = {};
for (const g of comRemate) porTipo[g.remate.tipo] = (porTipo[g.remate.tipo] || 0) + 1;
console.log('  por tipo de remate:', Object.entries(porTipo).map(([k, v]) => `${k} ${v}`).join('  '));
const porPos = {};
for (const g of comRemate) porPos[g.remate.pos] = (porPos[g.remate.pos] || 0) + 1;
console.log('  por posicao:', Object.entries(porPos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  '));

console.log(`\nsem remate nos 4 s anteriores: ${golos.length - comRemate.length}`);
console.log(`velocidade da bola a entrar: ${med(golos.map(g => g.vBola))} m/s`);
console.log(`|x| do ponto de entrada: ${med(golos.map(g => Math.abs(g.entradaX)))} m (baliza tem ${(LARGURA_BALIZA / 2).toFixed(2)} de meia-largura)`);
console.log(`altura do ponto de entrada: ${med(golos.map(g => g.entradaY))} m`);
console.log(`distancia do GK a bola no golo: ${med(golos.map(g => g.gkDist))} m`);
const estadosGK = {};
for (const g of golos) estadosGK[g.gkEstado] = (estadosGK[g.gkEstado] || 0) + 1;
console.log('estado do GK no golo:', Object.entries(estadosGK).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  '));

const A = MatchStats.TeamA, B = MatchStats.TeamB;
console.log(`
CONTADORES  remates ${A.remates.tentados + B.remates.tentados} | noAlvo ${A.remates.noAlvo + B.remates.noAlvo} | ` +
    `golos ${A.remates.golos + B.remates.golos} | defesas ${A.defesas + B.defesas} | bloqueios ${(A.bloqueiosFeitos || 0) + (B.bloqueiosFeitos || 0)}`);

const dists = remates.map(r => r.dist);
const faixa = (a, b) => remates.filter(r => r.dist >= a && r.dist < b).length;
console.log(`\nREMATES por distancia: 0-6m ${faixa(0, 6)} | 6-12m ${faixa(6, 12)} | 12-18m ${faixa(12, 18)} | 18-25m ${faixa(18, 25)} | 25m+ ${faixa(25, 999)}`);
console.log(`distancia media do remate: ${med(dists)} m`);
console.log(`golos por remate: ${(100 * golos.length / Math.max(1, remates.length)).toFixed(0)}%`);
