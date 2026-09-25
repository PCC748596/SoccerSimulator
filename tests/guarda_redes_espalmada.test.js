/*
A ESPALMADA SAI PELA MAO, E NAO POR TELEPORTE.

BUG, com captura: *"mostra o goleiro defendendo a bola sem encostar nela e bem
longe dela. Nao esta funcionando a animacao procedural do goleiro tentando
colocar as maos na bola."*

A animacao procedural estava boa e o contacto tambem. Medido a rastrear os
toques, a distancia REAL da mao a bola no frame da defesa:

    mao a bola no instante do contacto    0.34 m     (contacto legitimo)
    a bola no mesmo frame, depois         2.50 m da mao
    ou seja, a bola SALTOU                2.70 m

O `GkDive.espalmar` escrevia `bola.x` e `bola.y` directamente para a por fora
do poste ou por cima do travessao. No ecra, o guarda-redes atira-se, a bola
salta tres metros e ve-se uma defesa sem contacto nenhum. De caminho desfazia
o trabalho do `defender`, que repoe a bola no ponto exacto do toque para o
ressalto sair de onde deve sair.

O destino passou a resolver-se em VELOCIDADE: a bola fica onde a mao lhe
tocou e leva o que precisa para estar do lado de fora quando chegar a linha.

E ISSO OBRIGOU A TRAVAR O AVANCO. O z inteiro do remate forte de perto so
fazia sentido com o teleporte (a bola ja estava fora, o z so a tirava de campo
mais depressa). Sem ele, a espalmada acontece a 1.2-2.1 m da linha com 16-26
m/s de z — 0.08 a 0.23 s para percorrer 2.5-3.3 m de lado, ou seja 22 a 34 m/s
de lateral, que nenhuma mao imprime. Nao travar o z fazia entrar 3 de 7
espalmadas. Uma espalmada mata o grosso da velocidade e redirecciona o resto,
que e o que o `espalmarForaZ` passou a fazer sempre.

Corre com: node tests/guarda_redes_espalmada.test.js
*/
const fs = require('fs');
const path = require('path');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { console.log('  X ' + m); falhas++; };

/* ------------------------------------------------------------------ */
console.log('1 — o espalmar nao escreve a posicao da bola');
{
    const src = ler('js/gk_dive.js');
    const i = src.indexOf('espalmar(p, d, qualidade, semAgarrar) {');
    if (i < 0) erro('nao encontrei o espalmar');
    else {
        const corpo = src.slice(i, src.indexOf(LF + '    poseCarregar', i));

        /*
        `bola` e o alias de `Match.ball.position` dentro desta funcao: escrever
        `bola.x` ou `bola.y` E o teleporte. Ler (`bola.x` a direita de um
        igual) continua a ser preciso — e dai que sai o lado do poste.
        */
        const escreve = corpo.match(/bola\.[xyz]\s*=[^=]/g);
        if (escreve) erro(`o espalmar voltou a escrever a posicao da bola: ${escreve.join(', ')}`);
        else ok('nao escreve `bola.x/y/z` — a bola fica onde a mao lhe tocou');

        if (!/ballVel\.z \*= D\.espalmarForaZ/.test(corpo)) {
            erro('o avanco deixou de ser travado: a bola nao tem tempo de sair e entra');
        } else ok('trava o avanco, sempre');

        if (/semAgarrar \? 1\.0 : D\.espalmarForaZ/.test(corpo)) {
            erro('o tiro forte de perto voltou a guardar o z inteiro — 3 de 7 acabam em golo');
        } else ok('nem o tiro forte de perto guarda o z inteiro');
    }
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('2 — E A MEDIDA, com o jogo a correr');
{
    /*
    Tres coisas, por cada espalmada de um jogo inteiro:

      . A BOLA NAO SALTA no frame do toque — e o sintoma da captura.
      . A MAO ESTAVA LA: a distancia real da mao a bola no instante do
        contacto, contra o alcance de contacto do modelo.
      . E A ESPALMADA SERVE PARA ALGUMA COISA: nenhuma delas acaba em golo,
        que e o que a correccao nao pode custar.
    */
    const mulberry32 = (a) => () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    require('../tools/headless/harness.js');

    /*
    VARIAS SEMENTES, E NAO UMA. As espalmadas sao poucas — de 1 a 7 num jogo,
    conforme a semente — e qualquer mudanca no guarda-redes muda quais
    acontecem. Com uma semente so, este bloco reprovava por amostra curta a
    cada retoque, sem que nada do que ele mede estivesse errado.
    */
    const SEMENTES = [7, 99, 1234, 555, 20260911, 42];
    const dt = 1 / 60;
    const cena = new THREE.Scene();
    if (typeof Sim === 'undefined') global.Sim = {};
    Sim.running = true;

    const _v = new THREE.Vector3();
    const distMao = (p) => {
        let m = Infinity;
        p.model.updateWorldMatrix(true, true);
        for (const nome of ['lHand', 'rHand']) {
            const mao = p.rig && p.rig[nome];
            if (!mao) continue;
            mao.getWorldPosition(_v);
            m = Math.min(m, _v.distanceTo(Match.ball.position));
        }
        return m;
    };

    let maiorSalto = 0, maiorMao = 0, espalmadas = 0;
    let golo = 0, fora = 0, outro = 0;
    let vivo = null;

    // O toque: a mao esta la? (corre ANTES de o desfecho mexer na bola)
    const origDefender = GkDive.defender.bind(GkDive);
    GkDive.defender = function (p, rig) {
        const jaTocou = p.dive && p.dive.tocou;
        origDefender(p, rig);
        /*
        A DISTANCIA MEDE-SE DEPOIS, e nao antes.

        Antes daqui media-se a mao contra a posicao da bola no FIM do frame, e
        isso nao e o contacto: o `defender` decide pelo TRAJECTO do frame (a
        1/60 s e 25 m/s a bola anda 42 cm) e depois repoe a bola no ponto em
        que a mao esteve mais perto. Medida antes, a bola aparecia ate 0.75 m
        da mao num contacto perfeitamente legitimo, e o teste dava-o como
        defesa a distancia.

        Medida DEPOIS, a bola esta no ponto do contacto — que e o que este
        bloco quer prender: se defendeu, a mao estava mesmo la.
        */
        if (!jaTocou && p.dive && p.dive.tocou) {
            const d = distMao(p);
            if (isFinite(d)) maiorMao = Math.max(maiorMao, d);
        }
    };

    // A espalmada: a bola salta? e como acaba?
    const origEspalmar = GkDive.espalmar.bind(GkDive);
    GkDive.espalmar = function (p, d, q, sa) {
        const antes = Match.ball.position.clone();
        origEspalmar(p, d, q, sa);
        espalmadas++;
        maiorSalto = Math.max(maiorSalto, Match.ball.position.distanceTo(antes));
        vivo = { golZ: p.ownGoalZ, dir: p.dirZ, ultimo: Match.lastTouchedPlayer, f: 0 };
    };

    for (const semente of SEMENTES) {
    Math.random = mulberry32(semente);
    Match.init(cena);
    if (typeof Officials !== 'undefined' && Officials.init) Officials.init(cena);
    vivo = null;
    for (let f = 0; f < 60 * 60 * 30; f++) {
        Match.update(dt);
        if (!vivo) continue;
        vivo.f++;
        const b = Match.ball.position;
        // Ja cruzou o plano da linha de fundo dele?
        if ((b.z - vivo.golZ) * vivo.dir <= -BallPhysics.raio) {
            const naMoldura = Math.abs(b.x) < LARGURA_BALIZA / 2 && b.y < ALTURA_BALIZA;
            if (naMoldura) golo++; else fora++;
            vivo = null;
        } else if (Match.lastTouchedPlayer !== vivo.ultimo || Match.ballCarrier) {
            outro++; vivo = null;
        } else if (vivo.f > 240 || Match.state !== 'PLAY') { outro++; vivo = null; }
    }
    }

    const alcance = GoalkeeperDive.raioMao + BallPhysics.raio;
    console.log(`  ${espalmadas} espalmadas em ${SEMENTES.length} sementes | ` +
        `salto maximo da bola no toque ${maiorSalto.toFixed(3)} m | ` +
        `mao a bola no contacto, maximo ${maiorMao.toFixed(2)} m (alcance ${alcance.toFixed(2)})`);
    console.log(`  desfecho: golo ${golo}, sai ${fora}, outro apanha ${outro}`);

    /*
    QUANTAS ESPERAR. Medido, espalmadas em 45 minutos por semente:

        7: 2 | 99: 2 | 1234: 6 | 555: 2 | 20260911: 5 | 42: 4    (21 ao todo)

    Sao poucas e mudam de lance com qualquer retoque no guarda-redes — dai as
    seis sementes e os 30 minutos cada. O piso em 5 fica bem abaixo do que a
    medicao da e bem acima de zero, que e o que este guarda existe para
    apanhar: uma medicao que nao mediu nada e passa por boa.
    */
    if (espalmadas < 5) erro(`amostra curta: so ${espalmadas} espalmadas`);
    else ok(`${espalmadas} espalmadas medidas`);

    /*
    O tecto do salto e 0.01 m e nao zero por prudencia numerica; o valor
    medido e exactamente 0. Antes da correccao era 2.70 m.
    */
    if (maiorSalto > 0.01) {
        erro(`a bola saltou ${maiorSalto.toFixed(2)} m no frame da espalmada — voltou o teleporte`);
    } else ok('a bola fica onde a mao lhe tocou');

    if (maiorMao > alcance + 0.01) {
        erro(`defendeu com a mao a ${maiorMao.toFixed(2)} m da bola (alcance ${alcance.toFixed(2)})`);
    } else ok('a mao estava mesmo la, em todos os contactos');

    if (golo > 0) {
        erro(`${golo} espalmada(s) acabaram em golo: a bola nao tem tempo de sair`);
    } else ok('nenhuma espalmada acabou em golo');
}

console.log('');
console.log(falhas ? 'FALHOU: ' + falhas : 'OK: a espalmada sai pela mao.');
process.exit(falhas ? 1 : 0);
