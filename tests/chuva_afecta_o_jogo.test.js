/*
A CHUVA AFECTA O JOGO, E NAO SO O ECRA.

Pedido: *"o jogo tem que ser afetado pela chuva. Bola um pouco mais rapida.
Jogadores cansando mais. Etc."*

Ate aqui a chuva eram fios, respingos e luz: o relvado encharcado nao mudava
nada do que acontecia nele. Agora muda, e tudo o que muda vive num bloco so —
`ChuvaNoJogo` (js/config/physics.js).

Medido, 45 minutos de jogo com a mesma semente, seco contra chuva no maximo:

    bola rasteira largada a 12 m/s      15.6 m  ->  21.8 m
    energia media no fim                 0.766  ->   0.634
    defesas agarradas pelo guarda-redes    92%  ->     63%   (12 e 8 defesas)

O QUE ESTE TESTE PRENDE:

 1. Os tres valores do relvado sao GETTERS e apanham a chuva. E o que faz a
    mudanca chegar de uma vez a fisica, a previsao de onde a bola vai parar e
    a balistica do passe — se so mudasse a fisica, os jogadores corriam para
    onde a bola ja nao ia.
 2. O sentido de cada um: a bola corre mais, patina mais no quique e ressalta
    menos.
 3. A intensidade conta: meio aguaceiro e meio efeito.
 4. Sem chuva, e com `activo: false`, o jogo e exactamente o seco — que e o
    que todas as outras medicoes do repositorio assumem.
 5. O cansaco e as maos do guarda-redes estao ligados.

Corre com: node tests/chuva_afecta_o_jogo.test.js
*/
const fs = require('fs');
const path = require('path');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { console.log('  X ' + m); falhas++; };

require('./../tools/headless/harness.js');

// Clima de mentira: so o que o `chuvaNoRelvado` le.
const clima = { chove: false, intensidade: 1.0 };
global.Weather = {
    aChover: () => clima.chove,
    get intensidadeChuva() { return clima.intensidade; },
    respingo: () => {},
    update: () => {}
};
global.window.Weather = global.Weather;

const seco = () => { clima.chove = false; };
const chuva = (i) => { clima.chove = true; clima.intensidade = (i === undefined) ? 1.0 : i; };

/* ------------------------------------------------------------------ */
console.log('1 — sem chuva o jogo e o de sempre');
{
    seco();
    const B = BallPhysics;
    if (B.atritoRolamento !== B.atritoRolamentoSeco) erro('o atrito de rolamento mudou com o campo seco');
    else ok(`atrito de rolamento ${B.atritoRolamento} (o seco)`);
    if (B.atritoRessalto !== B.atritoRessaltoSeco) erro('o quique mudou com o campo seco');
    else ok(`atrito do quique ${B.atritoRessalto} (o seco)`);
    if (B.restituicao !== B.restituicaoSeco) erro('o ressalto mudou com o campo seco');
    else ok(`ressalto ${B.restituicao} (o seco)`);
    if (chuvaNoRelvado() !== 0) erro('ha chuva no relvado sem estar a chover');
    else ok('chuvaNoRelvado() = 0');
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('2 — a chover, cada valor anda para o lado certo');
{
    chuva(1.0);
    const B = BallPhysics, C = ChuvaNoJogo;

    console.log(`  rolamento ${B.atritoRolamentoSeco} -> ${B.atritoRolamento.toFixed(3)} | ` +
        `quique ${B.atritoRessaltoSeco} -> ${B.atritoRessalto.toFixed(3)} | ` +
        `ressalto ${B.restituicaoSeco} -> ${B.restituicao.toFixed(3)}`);

    // A relva molhada TRAVA MENOS: o atrito de rolamento desce.
    if (!(B.atritoRolamento < B.atritoRolamentoSeco)) {
        erro('a bola nao corre mais na chuva');
    } else ok('a bola corre mais: o atrito de rolamento desce');

    /*
    O `atritoRessalto` e o que a bola GUARDA da velocidade horizontal em cada
    quique, e por isso SOBE com a chuva: molhada, ela morde menos o relvado e
    patina para a frente. O sinal e o contrario dos outros dois, e e de
    proposito — dai a conta em `1 - (1 - seco) * ...`.
    */
    if (!(B.atritoRessalto > B.atritoRessaltoSeco)) {
        erro('a bola nao patina mais no quique');
    } else ok('a bola patina mais no quique: guarda mais velocidade');
    if (B.atritoRessalto > 1) erro('a bola ganha velocidade no quique: isso nao e patinar, e impulso');
    else ok('e nunca ganha velocidade com o quique');

    // E sobe menos: o relvado encharcado absorve.
    if (!(B.restituicao < B.restituicaoSeco)) erro('a bola nao ressalta menos');
    else ok('a bola ressalta menos');
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('3 — meio aguaceiro, meio efeito');
{
    /*
    A intensidade da chuva (ver `chuvaAguaceiro` em js/weather.js) passeia
    durante o jogo, e o efeito no relvado tem de a acompanhar: com ela a
    aliviar, o campo volta devagar ao que era.
    */
    chuva(0.5);
    const meio = BallPhysics.atritoRolamento;
    chuva(1.0);
    const cheio = BallPhysics.atritoRolamento;
    const seco_ = BallPhysics.atritoRolamentoSeco;

    console.log(`  rolamento: seco ${seco_} | meio aguaceiro ${meio.toFixed(3)} | aguaceiro ${cheio.toFixed(3)}`);
    const esperado = seco_ - (seco_ - cheio) / 2;
    if (Math.abs(meio - esperado) > 1e-9) {
        erro(`a meio aguaceiro devia dar ${esperado.toFixed(3)}, deu ${meio.toFixed(3)}`);
    } else ok('a metade da intensidade corresponde a metade do efeito');
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('4 — a bola corre mesmo mais, medida no relvado');
{
    const dt = 1 / 60;
    const cena = new THREE.Scene();
    Match.init(cena);
    if (typeof Sim === 'undefined') global.Sim = {};
    Sim.running = true;

    const correr = () => {
        Match.state = 'PLAY';
        Match.ballCarrier = null;
        Match.ball.position.set(0, BallPhysics.raio, 0);
        Match.ballVel.set(0, 0, 12);
        let d = 0;
        for (let i = 0; i < 60 * 12; i++) {
            const z0 = Match.ball.position.z;
            Match.delta = dt;
            Match.updateBall();
            d += Math.abs(Match.ball.position.z - z0);
            if (Match.ballVel.lengthSq() < 0.0001) break;
        }
        return d;
    };

    seco();
    const dSeco = correr();
    chuva(1.0);
    const dChuva = correr();
    console.log(`  bola rasteira a 12 m/s: ${dSeco.toFixed(1)} m no seco, ${dChuva.toFixed(1)} m na chuva`);

    if (dChuva <= dSeco) erro('a bola nao corre mais na chuva');
    else ok(`corre mais ${(dChuva - dSeco).toFixed(1)} m (${Math.round(100 * (dChuva / dSeco - 1))}%)`);

    /*
    "UM POUCO mais rapida", disse o pedido. Se a bola passasse a correr o
    dobro, o jogo deixava de ser o mesmo — este tecto e o que separa um
    relvado molhado de um campo de gelo.
    */
    if (dChuva > dSeco * 1.8) {
        erro(`corre ${Math.round(100 * (dChuva / dSeco - 1))}% mais: ja nao e "um pouco"`);
    } else ok('e continua a ser um relvado, nao uma pista de gelo');
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('5 — os jogadores cansam-se mais');
{
    const src = ler('js/player.js');
    const i = src.indexOf('actualizarEnergia(dt) {');
    const corpo = src.slice(i, src.indexOf('this.energia = Math.max(S.minimo', i));
    if (!/ChuvaNoJogo\.cansaco \* chuvaNoRelvado\(\)/.test(corpo)) {
        erro('o gasto de deposito deixou de contar com a chuva');
    } else ok('o gasto de deposito conta com a chuva');

    // E na direccao certa: mais gasto, nao menos.
    if (!(ChuvaNoJogo.cansaco > 0)) erro('`cansaco` nao acrescenta nada');
    else ok(`com a chuva no maximo gasta-se +${Math.round(100 * ChuvaNoJogo.cansaco)}%`);
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('6 — a bola molhada escapa das maos do guarda-redes');
{
    const M = GkCatchModel;
    const caso = {
        tipo: 'mergulho', gk: 70, tec: 60, vChegada: M.vRef,
        extensao: 0.3, altura: 0.2, dist: 25, rnd: 0.0
    };
    /*
    O `rnd` nao serve aqui: o que se mede e a PROBABILIDADE, e ela nao sai da
    funcao. Mede-se pela frequencia, com a mesma sequencia de sorteios nos dois
    casos — assim a diferenca e so do relvado.
    */
    const frequencia = () => {
        let agarra = 0;
        for (let i = 0; i < 2000; i++) {
            const r = resolverDefesaGK(Object.assign({}, caso, { rnd: i / 2000 }));
            if (r.resultado === 'agarra') agarra++;
        }
        return agarra / 2000;
    };

    seco();
    const fSeco = frequencia();
    chuva(1.0);
    const fChuva = frequencia();
    console.log(`  agarra ${Math.round(100 * fSeco)}% no seco, ${Math.round(100 * fChuva)}% na chuva`);

    if (!(fChuva < fSeco)) erro('o guarda-redes agarra o mesmo com a bola molhada');
    else ok(`agarra menos ${Math.round(100 * (fSeco - fChuva))} pontos`);

    // Mas continua a ser guarda-redes: nao pode deixar de agarrar de todo.
    if (fChuva <= 0) erro('deixou de agarrar por completo na chuva');
    else ok('continua a agarrar, so que menos');
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('7 — desligar devolve o jogo seco');
{
    /*
    `activo: false` tem de apagar TODOS os efeitos de uma vez: e a porta de
    saida se um dia isto atrapalhar uma medicao ou um pedido.
    */
    chuva(1.0);
    ChuvaNoJogo.activo = false;
    const B = BallPhysics;
    const tudoSeco = B.atritoRolamento === B.atritoRolamentoSeco &&
        B.atritoRessalto === B.atritoRessaltoSeco &&
        B.restituicao === B.restituicaoSeco &&
        chuvaNoRelvado() === 0;
    ChuvaNoJogo.activo = true;

    if (!tudoSeco) erro('com `activo: false` o jogo nao volta ao seco');
    else ok('`activo: false` devolve o jogo seco, com a chuva na mesma no ecra');
}

console.log('');
console.log(falhas ? 'FALHOU: ' + falhas : 'OK: a chuva chegou ao jogo.');
process.exit(falhas ? 1 : 0);
