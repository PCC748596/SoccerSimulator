/*
O GUARDA-REDES ATIRA-SE A BOLAS QUE NUNCA ALCANCA?

Relato: *"o goleiro esta pulando na bola mesmo com a bola a mais de uns 5 metros
dele... contando a passada, o impulso e o pulo, dificilmente um goleiro chega
numa bola a mais de 5 metros"*. Ver GoalkeeperDive.alcanceLateralMax e
.distanciaMaxParaMergulhar (config/goalkeeper.js).

MEDE AS DUAS DISTANCIAS, e a diferenca entre elas foi o erro desta medicao:

  LATERAL   o que ELE tem de cobrir. E o que o relato descreve — "contando a
            passada, o impulso e o pulo" — e ja estava dentro dos 5 m (maximo
            3.03). Medir so isto dava o problema como inexistente.
  A BOLA    a distancia a que a bola esta no instante do salto. E o que se VE, e
            era aqui que estava: 92% dos mergulhos arrancavam a mais de 5 m dela,
            mediana 9.9, maximo 20.5.

Mede tambem o atraso de reaccao contra o numero de corpos que lhe tapam a bola
(GoalkeeperDive.atrasoPorHomemNaVisao).

A defesa DESENHADA (penalti, falta directa) e separada: nessa o desfecho foi
sorteado e o gesto e para se ver, portanto nao passa pelas regras do alcance.

Uso: node tools/scratch/gk_mergulho.js [segundos]
*/
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const mergulhos = [];
const atrasos = [];

// O atraso e armado num sitio so (ver a nota do armarGuardaRedes, utils.js).
const origArmar = global.armarGuardaRedes;
if (typeof origArmar === 'function') {
    global.armarGuardaRedes = function (gk, skill, dist) {
        const r = origArmar.apply(this, arguments);
        if (gk && gk.model) {
            const n = (typeof homensNaVisaoDoGuardaRedes === 'function')
                ? homensNaVisaoDoGuardaRedes(gk.model.position, Match.ball.position,
                    Match.players.concat(Match.opponents), gk, GoalkeeperDive.visaoLargura)
                : 0;
            atrasos.push({ atraso: gk.gkDelayReacao, homens: n, dist: dist });
        }
        return r;
    };
}

const antesEstado = {};
const segundos = Number(process.argv[2] || 1800);
for (let i = 0; i < segundos / dt; i++) {
    Match.update(dt);
    for (const gk of [Match.players[0], Match.opponents[0]]) {
        if (!gk) continue;
        if (gk.gkEstado === 'mergulho' && antesEstado[gk.team] !== 'mergulho') {
            const alvoX = (gk.gkAlvoX !== undefined) ? gk.gkAlvoX : gk.model.position.x;
            mergulhos.push({
                lateral: Math.abs(alvoX - gk.model.position.x),
                dBola: Math.hypot(Match.ball.position.x - gk.model.position.x,
                    Match.ball.position.z - gk.model.position.z),
                desenhado: !!gk.isPenaltyDive
            });
        }
        antesEstado[gk.team] = gk.gkEstado;
    }
}

const q = (a, f) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * f)];
const livres = mergulhos.filter(m => !m.desenhado);
console.log(mergulhos.length + ' mergulhos em ' + (segundos / 60).toFixed(0) + ' min (' +
    livres.length + ' de jogo corrido, ' + (mergulhos.length - livres.length) + ' desenhados)');

if (livres.length) {
    const ls = livres.map(m => m.lateral);
    console.log('  distancia LATERAL a cobrir: mediana ' + q(ls, 0.5).toFixed(2) +
        ' | p90 ' + q(ls, 0.9).toFixed(2) + ' | max ' + q(ls, 0.999).toFixed(2) +
        ' m   (tecto ' + GoalkeeperDive.alcanceLateralMax + ')');
    const ds = livres.map(m => m.dBola);
    console.log('  distancia a BOLA no salto: mediana ' + q(ds, 0.5).toFixed(1) +
        ' | p90 ' + q(ds, 0.9).toFixed(1) + ' | max ' + q(ds, 0.999).toFixed(1) +
        ' m   (tecto ' + GoalkeeperDive.distanciaMaxParaMergulhar + ')');
    for (const lim of [5, 8, 12, 20]) {
        const n = livres.filter(m => m.dBola > lim).length;
        console.log('    bola a mais de ' + lim + ' m quando ele salta: ' + n +
            ' (' + (100 * n / livres.length).toFixed(0) + '%)');
    }
}

if (atrasos.length) {
    const comHomens = atrasos.filter(a => a.homens > 0);
    console.log('  remates armados: ' + atrasos.length + ', com gente na visao: ' +
        comHomens.length + ' (' + (100 * comHomens.length / atrasos.length).toFixed(0) + '%)');
    const sem = atrasos.filter(a => a.homens === 0).map(a => a.atraso);
    if (sem.length) console.log('    atraso com campo limpo: mediana ' + q(sem, 0.5).toFixed(3) + ' s');
    if (comHomens.length) {
        console.log('    atraso com visao tapada: mediana ' +
            q(comHomens.map(a => a.atraso), 0.5).toFixed(3) + ' s (mediana de ' +
            q(comHomens.map(a => a.homens), 0.5) + ' corpos)');
    }
}
