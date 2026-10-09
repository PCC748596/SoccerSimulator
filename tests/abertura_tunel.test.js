/*
A ABERTURA DO JOGO PELO TUNEL (js/abertura.js, js/tunel.js, config/tunel.js).

Pedido: ao carregar a pagina os jogadores entram pelo tunel no centro da arquibancada: o juiz (com a bola) e os 2
bandeirinhas a frente, os dois times em filas indianas atras; formam uma fila (um time de cada lado do trio), ficam
10 s alinhados e vao para as posicoes de inicio de jogo. ESC salta direto para a formacao inicial de sempre.

Corre com: node tests/abertura_tunel.test.js
*/
const assert = require('assert');
require('../tools/headless/harness.js');

const dt = 1 / 60;
let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { console.log('  X ' + m); falhas++; };
const verifica = (cond, bom, mau) => { if (cond) ok(bom); else erro(mau); };

if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = false;      // a abertura so existe no browser (nao nos lotes)
const cena = new THREE.Scene();
Match.init(cena);
Officials.init(cena);

console.log('1 — o tunel existe e esta configurado');
verifica(typeof TunelJogadores === 'object' && TunelJogadores.activo, 'TunelJogadores activo', 'TunelJogadores desapareceu');
verifica(TunelJogadores.xBoca < -40 && TunelJogadores.xFundo < TunelJogadores.xBoca,
    `boca em x=${TunelJogadores.xBoca}, fundo em x=${TunelJogadores.xFundo}`, 'o tunel nao fica na bancada do lado -X');
let tem = false;
cena.traverse(o => { if (o.name === 'tunel_jogadores') tem = true; });
verifica(tem, 'a caixa do tunel esta na cena', 'a caixa do tunel nao foi construida no createField');
verifica(TunelJogadores.bloqueia(-39, 0.5) && !TunelJogadores.bloqueia(-39, 8) && !TunelJogadores.bloqueia(39, 0),
    'o pessoal do estadio fica fora do corredor do tunel', 'bloqueia() errada');

console.log('2 — a entrada acaba com o trio ao centro e um time de cada lado');
verifica(Abertura.iniciar() === true && Match.state === 'ABERTURA', 'a abertura arranca no estado ABERTURA', 'a abertura nao arrancou');
const estados = [];
let tEspera = -1;
for (let i = 0; i < Math.round(120 / dt); i++) {
    Match.update(dt);
    const k = Match.state + '/' + (Abertura.fase || '-');
    if (!estados.length || estados[estados.length - 1] !== k) estados.push(k);
    if (Abertura.activa && Abertura.fase === 'espera' && tEspera < 0) {
        tEspera = i * dt;
        const pa = Match.players.map(p => p.model.position), pb = Match.opponents.map(p => p.model.position);
        const x = AberturaModel.xFila * (-TunelJogadores.lado);
        verifica([...pa, ...pb].every(p => Math.abs(p.x - x) < 0.6), 'os 22 estao na mesma fila (x)', 'a fila nao esta alinhada em x');
        // Cada time fica no lado da linha mais perto da propria metade (a da sua baliza).
        const sa = -Math.sign(Lados.dirDe('TeamA'));
        verifica(pa.every(p => p.z * sa > 2.5) && pb.every(p => p.z * -sa > 2.5),
            'cada time no lado da sua metade do campo, um de cada lado do trio', 'os times nao ficaram um de cada lado / do lado certo');
        const dzs = pa.map(p => p.z).sort((a, b) => a - b);
        verifica(dzs.every((z, j) => j === 0 || Math.abs(z - dzs[j - 1] - AberturaModel.passoNaFila) < 0.3),
            'espacamento regular na fila', 'o espacamento da fila nao e regular');
        const arb = Officials.arbitro.model.position;
        verifica(Math.abs(arb.z) < 0.5 && Math.abs(arb.x - (x - TunelJogadores.lado * AberturaModel.adiantoJuiz)) < 0.6,
            'o juiz esta ao centro da fila, um pouco a frente dos assistentes', 'o juiz nao esta ao centro / a frente');
        const l0 = Officials.assistentes[0].model.position;
        verifica(Math.abs(l0.x - x) < 0.6 && Math.abs(arb.x - l0.x) > 0.5, 'os assistentes ficam atras do juiz', 'o juiz nao esta a frente dos assistentes');
        const b = Match.ball.position;
        verifica(Math.hypot(b.x - arb.x, b.z - arb.z) < 1.2 && b.y > 0.5, 'a bola esta na mao do juiz', 'a bola nao esta com o juiz');
        verifica([...Match.players, ...Match.opponents].every(p => p.model.visible), 'todos visiveis', 'alguem ficou invisivel');
    }
    if (Match.state === 'PLAY') break;
}
verifica(tEspera > 0 && tEspera < 60, `alinhados aos ${tEspera.toFixed(0)} s`, 'nunca chegaram a fila (ou so pelo prazo)');
verifica(estados.join(' > ') .indexOf('ABERTURA/entrada > ABERTURA/espera > GOAL/- > PLAY/-') === 0,
    'entrada > espera (10 s) > caminhada para as posicoes > jogo', 'sequencia de estados errada: ' + estados.join(' > '));
verifica(Match.state === 'PLAY' && Match.kickoffActive, 'o jogo arranca com a saida de bola', 'o jogo nao arrancou: ' + Match.state);

console.log('3 — ESC salta para a formacao inicial');
Match.init(new THREE.Scene());
Officials.arbitro = null; Officials.init(new THREE.Scene());
Abertura.jaCorreu = false;
Abertura.iniciar();
for (let i = 0; i < 60 * 8; i++) Match.update(dt);
verifica(Abertura.activa, 'ainda a meio da entrada aos 8 s', 'a abertura acabou cedo de mais');
Abertura.cancelar();
verifica(!Abertura.activa && Match.state === 'PLAY' && Match.kickoffActive, 'ESC: estado PLAY com a saida de bola montada', 'ESC nao devolveu o jogo');
verifica([...Match.players, ...Match.opponents].every(p => p.model.visible && !p.aberturaOrdem),
    'todos visiveis e livres da coreografia', 'alguem ficou preso a abertura');
verifica([...Match.players, ...Match.opponents].every(p => Math.abs(p.model.position.x) < 35 && Math.abs(p.model.position.z) < 53),
    'todos dentro do campo', 'alguem ficou fora do campo');

console.log('4 — a volta do intervalo: ordem aleatoria, direto para os postos, sem grito de golo');
{
    Match.init(new THREE.Scene());
    Officials.arbitro = null; Officials.init(new THREE.Scene());
    Abertura.activa = false;
    for (let i = 0; i < 60; i++) Match.update(dt);
    Match.iniciarIntervalo();
    Match.intervaloTimer = 0.01;
    const estados2 = [];
    const ordem = [];
    let viuGoalComFesta = false;
    for (let i = 0; i < Math.round(150 / dt); i++) {
        Match.update(dt);
        const k = Match.state + '/' + (Abertura.modo === 'segundo' && Abertura.activa ? 'abertura2' : '-');
        if (!estados2.length || estados2[estados2.length - 1] !== k) estados2.push(k);
        if (Abertura.activa && Abertura.modo === 'segundo') {
            for (const s of Abertura.partes) if (s.tipo === 'jog' && s.spawned && ordem.indexOf(s) < 0) ordem.push(s);
        }
        if (Match.state === 'GOAL' && !Match.semFestaDeGolo) viuGoalComFesta = true;
        if (Match.state === 'PLAY' && Match.kickoffActive) break;
    }
    verifica(estados2.join(' > ').indexOf('ABERTURA/abertura2') >= 0 && Match.state === 'PLAY',
        'intervalo > saida pelo tunel > caminhada > jogo', 'sequencia errada: ' + estados2.join(' > '));
    verifica(ordem.length === 22, 'os 22 sairam do tunel', 'sairam ' + ordem.length);
    const idx = ordem.map(s => Match.players.indexOf(s.obj) >= 0 ? Match.players.indexOf(s.obj) : 100 + Match.opponents.indexOf(s.obj));
    const crescente = idx.every((v, j) => j === 0 || v > idx[j - 1]);
    verifica(!crescente, 'ordem aleatoria (nao a do plantel)', 'saiu na ordem do plantel');
    verifica(!viuGoalComFesta, 'sem festa de golo no estado GOAL', 'o estado GOAL correu sem a marca semFestaDeGolo');
    verifica([...Match.players, ...Match.opponents].every(p => p.model.visible && !p.aberturaOrdem), 'todos visiveis e livres', 'alguem preso');
}

console.log(falhas ? '\nFALHOU: ' + falhas : '\nOK: a abertura pelo tunel funciona.');
process.exit(falhas ? 1 : 0);
