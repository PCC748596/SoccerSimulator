/*
RECUO PARA O GUARDA-REDES (Lei 12) — e o que ele faz quando não pode pegar.

A metade que já existia: um passe DELIBERADO com o PÉ de um companheiro marca
`Match.recuoParaGR`, e `maosProibidasNoRecuo` impede as mãos. A cabeçada e a
matada no peito não passam pelo `executePassGameplay`, portanto não marcam nada
— é exactamente a distinção que a regra faz.

O que este teste fixa é a metade que faltava: com as mãos proibidas e um
adversário a menos de `GkRecuoModel.distPressao`, o guarda-redes CHUTA para a
frente em vez de ficar em cima da bola.

Corre com: node tests/recuo_com_o_pe.test.js
*/
const fs = require('fs');
const path = require('path');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { console.log('  X ' + m); falhas++; };

/* =====================================================================
   1 — A REGRA DAS MÃOS: só o passe com o PÉ as proíbe
   ===================================================================== */
console.log('1 — quem marca o recuo é o passe com o pé');
{
    const src = ler('js/utils.js');
    const m = src.match(/function maosProibidasNoRecuo[\s\S]*?\n\}/);
    if (!m) {
        erro('não encontrei maosProibidasNoRecuo em utils.js');
    } else {
        const fn = (new Function(m[0] + '\nreturn maosProibidasNoRecuo;'))();
        if (fn('TeamA', 'TeamA') !== true) erro('recuo da própria equipa devia proibir as mãos');
        else ok('recuo do próprio companheiro: mãos proibidas');
        if (fn('TeamB', 'TeamA') !== false) erro('recuo da OUTRA equipa não proíbe nada');
        else ok('bola vinda do adversário: mãos livres');
        if (fn(null, 'TeamA') !== false) erro('sem recuo não há proibição');
        else ok('sem recuo: mãos livres');
    }

    /*
    E QUEM ESCREVE A MARCA É UMA FUNÇÃO SÓ.

    A marca era posta à mão dentro do `executePassGameplay`, e com a condição
    `passTarget.role === 'gk'` — só o passe ENDEREÇADO ao guarda-redes contava.
    Um alívio para trás, ou um toque de condução que sobra, chegavam-lhe às mãos
    sem infracção nenhuma. Agora quem decide é o `registarToqueComPe` (marca o
    toque com o pé) mais o `avaliarRecuoParaGR` (que, por frame, vê se a bola
    andou para TRÁS), e a marca não é escrita à mão em mais lado nenhum.
    */
    for (const nome of ['registarToqueComPe', 'limparRecuoParaGR', 'avaliarRecuoParaGR']) {
        if (!src.includes('function ' + nome)) erro('falta ' + nome + ' em utils.js');
        else ok(nome + ' está em utils.js');
    }
    const escritas = [];
    for (const f of ['js/fsm.js', 'js/player.js', 'js/bt/player_bt.js']) {
        const n = (ler(f).match(/recuoParaGR\s*=/g) || []).length;
        if (n) escritas.push(f + ' (' + n + ')');
    }
    if (escritas.length) {
        erro('`Match.recuoParaGR` voltou a ser escrito à mão em ' + escritas.join(', '));
    } else ok('a marca só se escreve pelas funções do utils.js');

    // A bola atrasada é medida pela DIRECÇÃO, e a folga tem de existir.
    const gkSrc = ler('js/config/goalkeeper.js');
    const mAtraso = gkSrc.match(/atrasoMin:\s*([\d.]+)/);
    if (!mAtraso || Number(mAtraso[1]) <= 0 || Number(mAtraso[1]) > 5) {
        erro('GkRecuoModel.atrasoMin fora do que separa um recuo de um toque de lado');
    } else ok('atrasoMin = ' + mAtraso[1] + ' m');

    const headerSrc = ler('js/player.js');
    if (!/executeHeader[\s\S]{0,400}limparRecuoParaGR/.test(headerSrc)) {
        erro('a cabeçada deixou de devolver as mãos ao guarda-redes');
    } else ok('a cabeçada devolve as mãos (pode ser agarrada)');
    if (!/controlarNoPeito[\s\S]{0,1400}limparRecuoParaGR/.test(headerSrc)) {
        erro('a matada no peito deixou de devolver as mãos ao guarda-redes');
    } else ok('o peito devolve as mãos');
}

/* =====================================================================
   2 — COM AS MÃOS PROIBIDAS E UM ADVERSÁRIO EM CIMA: CHUTA
   ===================================================================== */
console.log('');
console.log('2 — recuo com o pé e adversário perto: chuta como no tiro de meta');
{
    const src = ler('js/player.js');

    const mAperta = src.match(/adversarioAperta\(\) \{[\s\S]*?\n    \}/);
    const mChuta = src.match(/chutarRecuoDeUrgencia\(\) \{[\s\S]*?\n    \}/);
    if (!mAperta || !mChuta) {
        erro('faltam adversarioAperta / chutarRecuoDeUrgencia em player.js');
    } else {
        // Ambiente mínimo para correr os dois métodos isolados.
        const GkRecuoModel = { distPressao: 5.0, distToque: 1.4 };
        const chamadas = [];
        let contacto = null;
        const ActionState = function (nome, opts) { chamadas.push(nome); contacto = opts.onContact; };

        const jogador = (team, x, z, role) => ({
            team, role: role || 'cf', model: { position: { x, z } }
        });
        const Match = {
            ball: { position: { x: 0, z: 50, distanceTo() { return 0; } } },
            players: [], opponents: [],
            recuoParaGR: 'TeamA'
        };

        /*
        Os dois métodos são de classe (`nome() { ... }`), portanto embrulham-se
        num objecto literal para poderem ser avaliados fora dela.
        */
        /*
        As funções da regra vêm do utils.js de produção: o chuto de urgência já
        não põe `recuoParaGR = null` à mão — regista o toque, e é o
        `avaliarRecuoParaGR` que vê a bola a sair para a frente e limpa.
        */
        const utilsSrc = ler('js/utils.js');
        const trecho = (nome) => {
            const i = utilsSrc.indexOf('function ' + nome + '(');
            if (i < 0) throw new Error('não encontrei ' + nome + ' em utils.js');
            return utilsSrc.slice(i, utilsSrc.indexOf(LF + '}', i) + 2);
        };
        const regras = (new Function('Match', 'GkRecuoModel',
            trecho('registarToqueComPe') + trecho('avaliarRecuoParaGR') +
            '; return { registarToqueComPe, avaliarRecuoParaGR };'))(Match, GkRecuoModel);

        const proto = (new Function('GkRecuoModel', 'Match', 'ActionState', 'registarToqueComPe',
            'return {' + mAperta[0] + ',' + mChuta[0] + '};'
        ))(GkRecuoModel, Match, ActionState, regras.registarToqueComPe);

        const gk = {
            team: 'TeamA', role: 'gk',
            model: { position: { x: 0, z: 52, distanceTo: () => 0.8 } },
            gkKickAction: null, gkEstado: 'normal',
            kickFromGround() { chamadas.push('kickFromGround'); }
        };
        Object.assign(gk, proto);

        // Sem ninguém por perto: não há aperto.
        Match.opponents = [jogador('TeamB', 0, 20)];
        if (gk.adversarioAperta()) erro('adversário a 30 m não aperta ninguém');
        else ok('adversário longe: sem aperto');

        // Adversário a 3 m da bola: aperta.
        Match.opponents = [jogador('TeamB', 0, 47)];
        if (!gk.adversarioAperta()) erro('adversário a 3 m devia apertar');
        else ok('adversário a 3 m: aperta');

        // O guarda-redes adversário não conta — ele está na outra baliza.
        Match.opponents = [jogador('TeamB', 0, 47, 'gk')];
        if (gk.adversarioAperta()) erro('o guarda-redes adversário não é pressão');
        else ok('o guarda-redes adversário não conta');

        // E o chute: mesmo gesto do tiro de meta, e o recuo acaba no contacto.
        Match.opponents = [jogador('TeamB', 0, 47)];
        gk.chutarRecuoDeUrgencia();
        if (chamadas[0] !== 'gkPuntChao') {
            erro('devia usar o clip do tiro de meta (gkPuntChao), usou ' + chamadas[0]);
        } else ok('usa o gesto do tiro de meta');
        if (gk.gkEstado !== 'chutando') erro('devia ficar no estado chutando');
        else ok('estado chutando');

        contacto();
        if (chamadas.indexOf('kickFromGround') < 0) {
            erro('no contacto devia resolver com a balística do tiro de meta');
        } else ok('no contacto, a mesma balística do tiro de meta');
        /*
        A bola saiu do pé dele PARA A FRENTE: no frame seguinte a marca cai
        sozinha, porque ela só vale enquanto a bola andar para trás.
        */
        Match.ball.position.z = 40;      // 10 m à frente, no referencial dele
        regras.avaliarRecuoParaGR(Match);
        if (Match.recuoParaGR !== null) erro('a bola saiu do pé dele: o recuo acabou');
        else ok('o recuo termina quando a bola sai');

        // Não dispara duas vezes.
        const antes = chamadas.length;
        gk.chutarRecuoDeUrgencia();
        if (chamadas.length !== antes) erro('não pode iniciar um segundo chute a meio do primeiro');
        else ok('não repete o gesto enquanto o primeiro corre');
    }
}

console.log('');
console.log(falhas ? 'FALHOU: ' + falhas : 'OK: recuo com o pé, mãos proibidas e chutão sob pressão.');
process.exit(falhas ? 1 : 0);
