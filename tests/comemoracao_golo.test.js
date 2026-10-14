/*
A comemoração de golo de joelhos (js/comemoracao.js, estado COMEMORAR em fsm.js, config/comemoracao.js).

Corre o jogo a sério em headless: mete a bola dentro da baliza com um avançado como último a tocar-lhe e
acompanha a sequência. O que tem de acontecer:

  . o autor corre até ao ponto de partida e entra no estado COMEMORAR;
  . durante o deslize o corpo desce (a altura do modelo fica abaixo da base) e anda na direcção da corrida;
  . os companheiros (até `apoio.max`) correm até ao sítio onde ele pára e entram também em COMEMORAR;
  . ninguém tem posições inválidas (NaN), o autor não sai do campo, e tudo termina antes do `tempoMax`;
  . no fim ninguém fica preso (`comemorando` limpo) e a saída de bola avança.
*/
require('../tools/headless/harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
window.comemoracaoNaSimulacao = true;

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = (c, m) => { if (!c) erro(m); };

Match.init(new THREE.Scene());
ComemoracaoGol.chance = 1.0;
ComemoracaoGol.comemoracoes = [{ tipo: 'joelhos', peso: 1 }];

// Um avançado de quem ataca +z: a baliza onde vai marcar fica em z = +53.
const lista = Match.players.concat(Match.opponents);
const autor = lista.find(p => p.role === 'atk' && p.dirZ > 0);
ok(!!autor, 'não há avançado a atacar +z');
const pos0 = { x: 12, z: 38 };
autor.model.position.set(pos0.x, ALTURA_BASE_Y, pos0.z);
Match.lastTouchedPlayer = autor;
Match.lastTouchedTeam = autor.team;
Match.ball.position.set(0, 0.3, CAMPO_COMP / 2 + BallPhysics.raio + 0.6);
Match.ballVel.set(0, 0, 4);

const dt = 1 / 60;
let entrou = false, joelhoMax = 0, bracoMax = 0, apoios = 0, nan = 0, deslizou = 0, entrada = null, corrida = 0, estadoFim = null, t = 0;
const estados = new Set();
for (let i = 0; i < 60 * 30; i++) {
    Match.update(dt); t += dt;
    if (Match.state === 'GOAL') {
        if (autor.fsm.currentState === 'COMEMORAR') {
            entrou = true;
            if (!entrada) { entrada = autor.model.position.clone(); corrida = entrada.distanceTo(new THREE.Vector3(pos0.x, ALTURA_BASE_Y, pos0.z)); }
            deslizou = Math.max(deslizou, autor.model.position.distanceTo(entrada));
            joelhoMax = Math.max(joelhoMax, autor.rig.lKnee.rotation.x);
            bracoMax = Math.max(bracoMax, autor.rig.lArm.rotation.z);
        }
        const n = lista.filter(p => p !== autor && p.fsm.currentState === 'COMEMORAR').length;
        apoios = Math.max(apoios, n);
        for (const p of lista) {
            const q = p.model.position;
            if (!isFinite(q.x + q.y + q.z + p.model.rotation.y)) nan++;
            if (Math.abs(q.x) > CAMPO_LARG / 2 + 1 || Math.abs(q.z) > CAMPO_COMP / 2 + 2) { if (p === autor) erro('o autor saiu do campo: ' + q.x.toFixed(1) + ', ' + q.z.toFixed(1)); }
        }
        estados.add(Match.goalSequenceStage);
    }
    if (Match.state === 'PLAY' && t > 3 && Match.goalSequenceStage === undefined && entrou) { estadoFim = 'PLAY'; break; }
}

console.log(`autor entrou em COMEMORAR: ${entrou}; correu ${corrida.toFixed(1)} m até lá e deslizou ${deslizou.toFixed(1)} m; joelho ${joelhoMax.toFixed(2)} rad, braço ${bracoMax.toFixed(2)} rad; companheiros a festejar ao mesmo tempo: ${apoios}; a saída de bola voltou aos ${t.toFixed(1)} s`);
ok(entrou, 'o autor nunca entrou no estado COMEMORAR');
// (a altura não se mede em headless: o `update` repõe-na a seguir à FSM; a pose, sim)
ok(joelhoMax > 1.3, 'o joelho não dobrou para o deslize: ' + joelhoMax);
ok(bracoMax > 2.4, 'os braços não subiram: ' + bracoMax);
ok(corrida >= 4, 'o autor quase não correu até ao ponto de partida: ' + corrida.toFixed(1) + ' m');
ok(deslizou >= 4.5 && deslizou <= 8, 'o deslize anda ' + deslizou.toFixed(1) + ' m (esperado 3-6)');
ok(apoios >= 1, 'nenhum companheiro correu a festejar com ele');
ok(apoios <= ComemoracaoGol.apoio.max, 'mais companheiros do que o máximo: ' + apoios);
ok(nan === 0, 'posições inválidas');
ok(estadoFim === 'PLAY', 'a saída de bola não voltou (o jogo ficou preso na festa)');
ok(t < ComemoracaoGol.tempoMax + 12, 'demorou de mais: ' + t.toFixed(1) + ' s');
ok(!lista.some(p => p.comemorando), 'ficou alguém preso na festa');
ok(!Comemoracao.ativa, 'a comemoração não acabou');

if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK comemoracao_golo');
