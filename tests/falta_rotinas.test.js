/*
AS QUATRO ROTINAS DA FALTA QUE NAO E DIRECTA — FK2, FK3, FK5, FK6.

Pedido, com quatro diagramas de treino: atacantes pretos, barreira azul clara, tracejado = movimento
antes da cobranca, setas = passes, circulos verdes = alvos; depois de ajustar o ataque, a defesa marca
nos outros lugares fora da barreira. O desenho de cada uma esta em FaltaRotinas
(js/config/falta_rotinas.js).

O que este teste prende:

  . sao QUATRO (fk2_wide, fk3_triple, fk5_over_the_hill, fk6_crossfire), uma "wide" e tres "central";
  . cada uma poe os numeros 2 a 11 (o batedor incluido) e todos os passos referem numeros que existem;
  . todos os pontos, dos dois lados e a qualquer distancia, ficam dentro do campo;
  . o espelho e simetrico (a bola em x > 0 dá o desenho invertido);
  . a atribuicao dos numeros nao repete jogadores;
  . num jogo montado: sai um plano, a barreira tem o numero de homens da rotina e a cadeia de passes
    chega ao fim pelo menos numa das sementes.

Corre com: node tests/falta_rotinas.test.js
*/
const { FaltaRotinas, pontoDaRotina, ladoDaRotina, atribuirNumerosDaRotina } = require('../js/config/falta_rotinas.js');
let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { falhas++; console.log('  X ' + m); };
const COMP = 106, LARG = 68;

const nomes = FaltaRotinas.rotinas.map(r => r.nome).sort().join(',');
if (nomes === 'fk2_wide,fk3_triple,fk5_over_the_hill,fk6_crossfire') ok('as quatro rotinas: ' + nomes);
else erro('rotinas: ' + nomes);
const tipos = FaltaRotinas.rotinas.map(r => r.tipo).sort().join(',');
if (tipos === 'central,central,central,wide') ok('uma wide e tres central');
else erro('tipos: ' + tipos);

for (const r of FaltaRotinas.rotinas) {
    const falta = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(n => !r.lugares[n]);
    if (falta.length) erro(`${r.nome}: sem lugar para ${falta}`);
    else ok(`${r.nome}: os numeros 2 a 11 tem lugar`);
    if (!r.lugares[r.batedor]) erro(`${r.nome}: o batedor ${r.batedor} nao tem lugar`);
    for (const o of r.opcoes) {
        const mau = o.passos.filter(s => !r.lugares[s.de] || (s.para && !r.lugares[s.para]));
        if (mau.length) erro(`${r.nome}: passo com numero inexistente`);
        if (o.passos[0].de !== r.batedor) erro(`${r.nome}: o primeiro passo nao e do batedor`);
        for (const n of Object.keys(o.corridas || {})) if (!r.lugares[n]) erro(`${r.nome}: corrida do ${n} sem lugar`);
    }
    // Pontos dentro do campo, dos dois lados e de varias distancias.
    let fora = 0;
    for (const bx of [-30, -14, -5, 0.5, 5, 14, 30]) {
        for (const zd of [15, 28, 42]) {
            for (const dir of [1, -1]) {
                const bola = { x: bx, z: dir * (COMP / 2 - zd) };
                const lado = ladoDaRotina(bx);
                const alvos = Object.values(r.lugares).concat(...r.opcoes.map(o => Object.values(o.corridas || {})))
                    .concat(...r.opcoes.map(o => o.passos.map(s => s.alvo).filter(Boolean)));
                for (const l of alvos) {
                    const p = pontoDaRotina(l, bola, dir, lado, COMP, LARG);
                    if (Math.abs(p.x) > LARG / 2 || Math.abs(p.z) > COMP / 2) fora++;
                }
            }
        }
    }
    if (fora) erro(`${r.nome}: ${fora} pontos fora do campo`);
    else ok(`${r.nome}: todos os pontos ficam dentro do campo`);
}

// Espelho: a bola em x > 0 inverte o lado.
{
    const lugar = { x: 5, z: 12 };
    const a = pontoDaRotina(lugar, { x: -10, z: 20 }, 1, ladoDaRotina(-10), COMP, LARG);
    const b = pontoDaRotina(lugar, { x: 10, z: 20 }, 1, ladoDaRotina(10), COMP, LARG);
    if (Math.abs(a.x + b.x) < 1e-9 && a.z === b.z) ok('o espelho inverte x e mantem z');
    else erro('espelho: ' + JSON.stringify([a, b]));
}

// Atribuicao: sem repeticoes.
{
    const r = FaltaRotinas.rotinas[1];
    const mk = (pos, x, z) => ({ pos: pos, model: { position: { x: x, z: z } } });
    const grupo = p => ({ CB: 'cb', LB: 'lat', RB: 'lat', CM: 'mc', LM: 'ml', RM: 'ml', CF: 'ata' }[p.pos]);
    const todos = ['LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'LM', 'RM', 'CF', 'CF'].map((p, i) => mk(p, i * 3 - 12, 10));
    const batedor = mk('CM', 0, 0);
    const num = atribuirNumerosDaRotina(r, batedor, todos, n => ({ x: 0, z: 0 }), grupo, FaltaRotinas);
    const usados = Object.values(num);
    if (new Set(usados).size === usados.length && usados.length === 10) ok('a atribuicao dos numeros nao repete jogadores');
    else erro('atribuicao: ' + usados.length + ' / ' + new Set(usados).size);
}

// Jogo montado.
{
    require('../tools/headless/harness.js');
    if (typeof Sim === 'undefined') global.Sim = {};
    Sim.running = false;
    let completas = 0, planos = 0;
    for (const semente of [2, 3, 5, 8]) {
        let s = semente; Math.random = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        Match.init(new THREE.Scene());
        Match.state = 'PLAY'; Match.kickoffActive = false; Match.kickoffPendingPassToDef = false;
        Match.ball.position.set(-4, 0.11, COMP / 2 - 33); Match.ballVel.set(0, 0, 0);
        Match.lastTouchedTeam = 'TeamB';
        Match.setupSetPiece('FREE_KICK', 'TeamA');
        const pl = Match.rotinaPlano;
        if (!pl) continue;
        planos++;
        const barreira = (Match.faltaDirectaBarreira || []).length;
        if (barreira !== pl.rotina.barreira) erro(`${pl.rotina.nome}: barreira de ${barreira}, a rotina pede ${pl.rotina.barreira}`);
        let maxFase = 0;
        for (let f = 0; f < 60 * 25; f++) {
            Match.delta = 1 / 60; Match.update(1 / 60);
            if (Match.rotinaPlano) maxFase = Math.max(maxFase, Match.rotinaPlano.fase);
            else if (maxFase) break;
        }
        if (maxFase >= pl.passos.length || !Match.rotinaPlano) completas++;
    }
    if (planos === 4) ok('numa falta de passe ao centro sai sempre um plano'); else erro('planos: ' + planos + '/4');
    if (completas >= 1) ok(`a cadeia chegou ao fim em ${completas} de ${planos} jogos`); else erro('nenhuma cadeia chegou ao fim');
}

console.log(falhas ? 'FALHOU: ' + falhas : 'OK: as quatro rotinas montam, correm e respeitam o campo.');
process.exit(falhas ? 1 : 0);
