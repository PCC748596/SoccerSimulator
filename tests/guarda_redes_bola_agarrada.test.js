/*
DEPOIS DE AGARRAR: A BOLA AO PEITO, E OS DOIS BRACOS FECHADOS SOBRE ELA.

Relato, com capturas: *"o goleiro esta defendendo a bola corretamente com as
maos. Mas de repente o braco da uma volta. Depois de segurar a bola o goleiro
fica equilibrado sobre a bola e deslizando sobre a bola. O goleiro levanta todo
duro, somente girando com pivo na grama. A bola deveria estar no peito do
goleiro e com os bracos encaixando a bola como um braco so."*

Eram tres defeitos com a mesma raiz — a bola agarrada ficava colada a MAO:

  1. A mao esta na ponta do braco esticado, e com o corpo deitado a escorregar
     a bola acabava POR BAIXO dele. Medido: a bola a 0.54-0.72 m do peito (ate
     1.08 m) e a descer aos -0.13 m, ou seja ENTERRADA no relvado.

  2. No voo, o IK continuava a resolver o braco PARA A BOLA — que agora era a
     propria mao. A cadeia a perseguir-se a si mesma e uma singularidade, e o
     braco rodava: saltos de 5.91 rad num frame, 13 frames deles num lance.

  3. Os bracos ficavam em poses diferentes (um no IK, outro esticado): medida a
     assimetria das duas maos a bola, 1.11 m. Nada que leia como um encaixe.

Agora a bola ancora no PEITO (GoalkeeperDive.bolaNoPeito), o IK para assim que
ele agarra, e os dois bracos tomam a mesma pose fechada sobre ela
(`poseAbracoBola`, angulos em GoalkeeperDive.abracoBola).

Corre com: node tests/guarda_redes_bola_agarrada.test.js
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
console.log('1 — a bola agarrada nao e colada a mao, e o IK para');
{
    const src = ler('js/gk_dive.js');

    if (/rig\[d\.maoAgarrou[^\]]*\]\.getWorldPosition/.test(src)) {
        erro('a bola voltou a ser colada a mao que a agarrou');
    } else ok('a bola nao e colada a mao');

    if (!/D\.bolaNoPeito/.test(src)) erro('deixou de ancorar a bola no peito');
    else ok('a bola ancora no peito');

    /*
    O IK NAO PODE CORRER DEPOIS DE AGARRAR — e a singularidade que faz o braco
    rodar. No voo o `mirarBola` tem de estar debaixo de uma guarda do
    `agarrou`; na fase de chao ja estava.
    */
    const i = src.indexOf("case 'voo': {");
    const bloco = src.slice(i, src.indexOf("case 'chao': {", i));
    if (!/if \(!d\.agarrou\) \{[\s\S]*?this\.mirarBola\(p, rig\)/.test(bloco)) {
        erro('no voo o `mirarBola` voltou a correr com a bola ja agarrada');
    } else ok('no voo o IK para assim que ele agarra');

    if (!/poseAbracoBola/.test(bloco)) erro('o voo nao poe os bracos no abraco');
    else ok('e os bracos fecham-se sobre ela');
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('2 — os angulos do abraco poem as maos SOBRE a bola');
{
    /*
    Geometria pura, sem jogo: monta-se a pose do abraco num guarda-redes e
    le-se onde as maos caem no espaco do PEITO, contra o ponto onde a bola
    fica. Sao os angulos que a `abracoBola` guarda, e este bloco e a razao de
    eles serem esses e nao outros.
    */
    require('../tools/headless/harness.js');
    const cena = new THREE.Scene();
    Match.init(cena);

    const gk = [...Match.players].find(p => p.role === 'gk');
    const P = GoalkeeperDive.abracoBola;
    const BP = GoalkeeperDive.bolaNoPeito;

    // Sem a configuracao nao ha pose para medir — falha limpa, e nao um
    // rebentamento a meio que leva os blocos seguintes atras.
    if (!P || !BP) {
        erro('faltam o `abracoBola` e/ou o `bolaNoPeito` no GoalkeeperDive');
        console.log('');
        console.log('FALHOU: ' + falhas);
        process.exit(1);
    }

    gk.resetBonesToDefault();
    for (const lado of [['lArm', 'lElbow', 1], ['rArm', 'rElbow', -1]]) {
        gk.rig[lado[0]].rotation.set(P.ombroX, 0, lado[2] * P.ombroZ);
        if (gk.rig[lado[1]]) gk.rig[lado[1]].rotation.x = P.cotovelo;
    }
    gk.model.updateWorldMatrix(true, true);

    const pPeito = new THREE.Vector3(), qPeito = new THREE.Quaternion();
    gk.rig.chest.getWorldPosition(pPeito);
    gk.rig.chest.getWorldQuaternion(qPeito);
    const noPeito = (nome) => {
        const m = new THREE.Vector3();
        gk.rig[nome].getWorldPosition(m);
        return m.sub(pPeito).applyQuaternion(qPeito.clone().invert());
    };

    const l = noPeito('lHand'), r = noPeito('rHand');
    const dist = (h) => Math.hypot(h.x - BP.x, h.y - BP.y, h.z - BP.z);
    console.log(`  lHand no peito (${l.x.toFixed(2)}, ${l.y.toFixed(2)}, ${l.z.toFixed(2)}) | ` +
        `rHand (${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.z.toFixed(2)}) | ` +
        `bola (${BP.x.toFixed(2)}, ${BP.y.toFixed(2)}, ${BP.z.toFixed(2)})`);

    // Uma de cada lado da bola: os x com sinais opostos.
    if (l.x * r.x >= 0) erro('as duas maos ficaram do mesmo lado da bola');
    else ok('uma mao de cada lado da bola');

    // E a encostar-lhe: meio metro e um braco a apontar, nao um encaixe.
    const dl = dist(l), dr = dist(r);
    if (Math.max(dl, dr) > 0.30) {
        erro(`maos a ${dl.toFixed(2)} / ${dr.toFixed(2)} m da bola: isso nao e um encaixe`);
    } else ok(`maos a ${dl.toFixed(2)} / ${dr.toFixed(2)} m da bola`);

    // Simetricas — e o que as faz ler "como um braco so".
    if (Math.abs(dl - dr) > 0.05) erro(`as duas maos nao estao simetricas (${Math.abs(dl - dr).toFixed(2)} m)`);
    else ok('simetricas');
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('3 — E A MEDIDA, com o jogo a correr');
{
    /*
    Um jogo inteiro, a olhar so para os frames em que um guarda-redes tem a
    bola agarrada a meio de um mergulho. Antes / depois, duas sementes:

        bola ao peito, media      0.54-0.72 m (ate 1.08)  ->  0.31 m
        assimetria das maos       1.11 m                  ->  0.22-0.27 m
        altura minima da bola     -0.13 m (enterrada)     ->  0.11 m (o raio)
        frames com salto > 0.5 rad   6 e 13              ->  1 por agarrada
        maior salto num frame     5.91 rad                ->  um corte so
    */
    const mulberry32 = (a) => () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    /*
    VARIAS SEMENTES, E NAO UMA.

    Os mergulhos com bola agarrada sao poucos — de 0 a 3 num jogo, conforme a
    semente — e qualquer retoque no guarda-redes muda quais acontecem. Com uma
    semente so, este bloco reprovava por "amostra curta" a cada mudanca, sem
    que nada do que ele mede estivesse errado.
    */
    const SEMENTES = [99, 7, 1234, 555, 20260911];
    const dt = 1 / 60;
    const cena = new THREE.Scene();
    if (typeof Sim === 'undefined') global.Sim = {};
    Sim.running = true;

    const _v = new THREE.Vector3();
    const guardas = () => [...Match.players, ...Match.opponents].filter(p => p.role === 'gk');

    let frames = 0, agarradas = 0, grandes = 0;
    let somPeito = 0, maxPeito = 0, minY = Infinity;
    let somMao = 0, maxAssim = 0, maxSalto = 0;
    const ant = new Map();

    for (const semente of SEMENTES) {
    Math.random = mulberry32(semente);
    Match.init(cena);
    if (typeof Officials !== 'undefined' && Officials.init) Officials.init(cena);
    ant.clear();
    for (let f = 0; f < 60 * 60 * 20; f++) {
        Match.update(dt);
        for (const p of guardas()) {
            const d = p.dive;
            if (!d || !d.agarrou) { ant.delete(p); continue; }
            if (!ant.has(p)) agarradas++;
            frames++;

            p.model.updateWorldMatrix(true, true);
            p.rig.chest.getWorldPosition(_v);
            const dPeito = _v.distanceTo(Match.ball.position);
            somPeito += dPeito;
            maxPeito = Math.max(maxPeito, dPeito);
            minY = Math.min(minY, Match.ball.position.y);

            const dm = [];
            for (const n of ['lHand', 'rHand']) {
                p.rig[n].getWorldPosition(_v);
                dm.push(_v.distanceTo(Match.ball.position));
            }
            somMao += Math.min(dm[0], dm[1]);
            maxAssim = Math.max(maxAssim, Math.abs(dm[0] - dm[1]));

            const a = p.rig.lArm.rotation, b = p.rig.rArm.rotation;
            const agora = [a.x, a.y, a.z, b.x, b.y, b.z];
            const antes = ant.get(p);
            if (antes) {
                let salto = 0;
                for (let i = 0; i < 6; i++) salto = Math.max(salto, Math.abs(agora[i] - antes[i]));
                maxSalto = Math.max(maxSalto, salto);
                if (salto > 0.5) grandes++;
            }
            ant.set(p, agora);
        }
    }
    }

    const mediaPeito = somPeito / Math.max(1, frames);
    console.log(`  ${agarradas} bolas agarradas em ${SEMENTES.length} sementes, ` +
        `${frames} frames com ela na mao`);
    console.log(`  bola->peito: media ${mediaPeito.toFixed(2)} m, max ${maxPeito.toFixed(2)} m | ` +
        `altura minima ${minY.toFixed(2)} m (raio ${BallPhysics.raio})`);
    console.log(`  mao mais perto: media ${(somMao / Math.max(1, frames)).toFixed(2)} m | ` +
        `assimetria max ${maxAssim.toFixed(2)} m | saltos > 0.5 rad: ${grandes} (max ${maxSalto.toFixed(2)} rad)`);

    if (agarradas < 1) erro('nenhuma bola agarrada: a medida nao mediu nada');
    else ok(`${agarradas} bolas agarradas medidas`);

    // Ao peito, e nao a um braco de distancia.
    if (maxPeito > 0.45) erro(`a bola chegou a ${maxPeito.toFixed(2)} m do peito`);
    else ok(`a bola fica ao peito (max ${maxPeito.toFixed(2)} m)`);

    // E nunca debaixo do relvado — era o "deslizando sobre a bola".
    if (minY < BallPhysics.raio - 0.001) {
        erro(`a bola desceu a ${minY.toFixed(2)} m: passou por baixo do relvado`);
    } else ok('nunca passa por baixo do relvado');

    // Os dois bracos iguais: e isso que os faz ler como um so.
    if (maxAssim > 0.5) erro(`assimetria de ${maxAssim.toFixed(2)} m entre as duas maos`);
    else ok(`as duas maos ficam simetricas (max ${maxAssim.toFixed(2)} m)`);

    /*
    UM CORTE POR AGARRADA, e mais nenhum. O frame em que ele agarra troca a
    pose do IK pela do abraco de uma vez — e um corte, e e de proposito (ver a
    nota do `poseAbracoBola`). O que nao pode haver sao saltos REPETIDOS: esses
    sao o braco a rodar.
    */
    if (grandes > agarradas) {
        erro(`${grandes} saltos de angulo para ${agarradas} agarradas — o braco volta a rodar`);
    } else ok(`${grandes} salto(s) para ${agarradas} agarradas: so o corte da entrada`);
}

console.log('');
console.log(falhas ? 'FALHOU: ' + falhas : 'OK: bola ao peito, bracos fechados sobre ela.');
process.exit(falhas ? 1 : 0);
