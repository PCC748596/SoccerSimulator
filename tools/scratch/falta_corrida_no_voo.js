/*
QUEM CORRE ATRAS DA BOLA ENQUANTO ELA VOA, NA FALTA DIRECTA.

Relato: *"durante a falta directa tem 2 jogadores tentando correr atras da
bola. A menos que o goleiro rebata a bola ou ela pegue na trave ou em algum
outro jogador"*.

Segue cada falta desde a batida ate ao PRIMEIRO contacto da bola (guarda-redes,
poste ou outro jogador). Nesse intervalo ninguem devia ir atras dela.
*/
const segundos = Number(process.argv[2] || 2400);
const semente = Number(process.argv[3] || 4242);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(semente);
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const todos = () => Match.players.concat(Match.opponents);
let seguindo = null;
const lances = [];
const _vAntes = new THREE.Vector3();
let tocou = false;

// Qualquer coisa que mude a direccao da bola conta como contacto.
const origBaliza = Match.colidirComBaliza.bind(Match);
Match.colidirComBaliza = function () {
    _vAntes.copy(Match.ballVel); const r = origBaliza();
    if (!_vAntes.equals(Match.ballVel)) tocou = true; return r;
};
const origContacto = Match.resolveBallContact.bind(Match);
Match.resolveBallContact = function () {
    _vAntes.copy(Match.ballVel); const r = origContacto();
    if (!_vAntes.equals(Match.ballVel)) tocou = true; return r;
};

// A batida da falta: o instante em que a bola parte de uma bola parada.
let eraFalta = false, velAntes = 0;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    const naFalta = (Match.state === 'FREE_KICK');
    velAntes = Match.ballVel.length();
    tocou = false;
    Match.update(dt);
    const vel = Match.ballVel.length();

    /*
    SO AS FALTAS DIRECTAS. A maioria das faltas e cobrada em PASSE, e ai
    mandar alguem a bola e o que tem de acontecer -- alguem a vai receber.
    O relato e sobre a falta DIRECTA (remate a baliza), que e a que cria o
    `faltaDirectaPlano`. Sem este filtro a amostra eram 52 faltas de todos os
    tipos e o numero nao dizia nada sobre o defeito.
    */
    if (naFalta && velAntes < 0.5 && vel > 4 && Match.faltaDirectaPlano) {
        seguindo = { frames: 0, soma: 0, pior: 0, nomes: new Set() };
        continue;
    }
    if (!seguindo) { eraFalta = naFalta; continue; }

    // Acabou: alguem tocou, ou a bola parou, ou o lance mudou.
    if (tocou || vel < 1.0 || Match.state === 'GOAL' || Match.state === 'GOAL_KICK' ||
        Match.state === 'CORNER_KICK' || seguindo.frames > 180) {
        lances.push(seguindo);
        seguindo = null;
        continue;
    }

    /*
    PERSEGUIDOR ELEITO, e nao "quem se move na direccao da bola" -- foi o erro
    da primeira versao desta ferramenta. Numa falta a bola voa para a baliza,
    portanto TODA a gente que converge para a area conta como a ir atras dela:
    dava 3.4 por frame, com os estados a serem MOVE_TO_POS e MARKING, que sao
    deslocacoes normais e nao perseguicao.

    Quem define "correr atras da bola" e o `chaser` de cada equipa
    (`TeamAI`/team_bt.js). E esse que nao devia existir enquanto a bola voa
    sem ter tocado em nada.
    */
    const aCorrer = todos().filter(p => {
        if (p.role === 'gk' || !p.model) return false;
        const bb = (typeof TeamAI !== 'undefined' && TeamAI.get)
            ? TeamAI.get(p.team) : null;
        return !!(bb && bb.chaser === p);
    });
    seguindo.frames++;
    seguindo.soma += aCorrer.length;
    if (aCorrer.length > seguindo.pior) seguindo.pior = aCorrer.length;
    for (const p of aCorrer) seguindo.nomes.add((p.pos || p.role) + ':' + (p.fsm && p.fsm.currentState));
}

if (!lances.length) { console.log('sem faltas seguidas'); process.exit(0); }
const comFrames = lances.filter(l => l.frames > 0);
console.log(lances.length + ' faltas DIRECTAS batidas; ' + comFrames.length + ' com voo a seguir\n');
const medias = comFrames.map(l => l.soma / l.frames);
const m = medias.reduce((a, b) => a + b, 0) / (medias.length || 1);
console.log('ENQUANTO A BOLA VOA, ANTES DE QUALQUER CONTACTO:');
console.log('  jogadores a correr atras dela, media por frame: ' + m.toFixed(2));
console.log('  lances com 1 ou mais a correr: ' +
    comFrames.filter(l => l.pior >= 1).length + '/' + comFrames.length);
console.log('  lances com 2 ou mais a correr: ' +
    comFrames.filter(l => l.pior >= 2).length + '/' + comFrames.length);
const quem = new Map();
for (const l of comFrames) for (const n of l.nomes) quem.set(n, (quem.get(n) || 0) + 1);
console.log('\n  quem (posicao:estado), em numero de lances:');
for (const [k, n] of [...quem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log('    ' + k.padEnd(28) + n);
}
