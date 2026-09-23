/*
REGRESSÃO: na repetição do golo a bola não rolava e a rede não balançava.

Relato: *"No replay a bola não está rolando e a rede não balança."*

Eram dois defeitos diferentes, e por isso são dois blocos de teste:

  1. A BOLA. Quem a faz rolar é o `MatchPhysics`, que escreve o quaternião na
     MALHA (`Match.ballVisual`), filha do nó de posição. O replay gravava e
     repunha `Match.ball.quaternion` — o pai, em cuja rotação ninguém toca em
     todo o jogo. Gravavam-se quatro números sempre iguais a (0, 0, 0, 1) e
     repunha-se a identidade.

  2. A REDE. O `NetWave.update` e o `NetWave.bater` vivem os dois dentro do
     `Match.update`, que NÃO corre durante a repetição — é disso que a
     repetição vive. A rede ficava imóvel na deformação em que o jogo a
     deixou, enquanto a bola entrava outra vez à frente dela.

O buffer do replay é um Float32Array lido e escrito POR ÍNDICE à mão, com um
`pIdx++` por valor. Um valor a mais ou a menos não dá erro nenhum: desalinha
tudo o que vem a seguir e corrompe o frame seguinte. Daí o terceiro bloco.
*/
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);
const srcReplay = ler('js/match/match_replay.js');

let falhas = 0;
const erro = (m) => { falhas++; console.error('  X ' + m); };
const ok = (m) => console.log('  . ' + m);

/* ------------------------------------------------------------------ */
console.log(LF + '1 — a bola: o replay grava a rotacao da MALHA, nao a do no de posicao');
{
    const n = (srcReplay.match(/Match\.ballVisual\s*\?\s*Match\.ballVisual\.quaternion/g) || []).length;
    if (n < 2) erro('esperava o quaterniao do ballVisual no recordFrame E no restoreFrame, encontrei ' + n);
    else ok('recordFrame e restoreFrame usam Match.ballVisual.quaternion');

    // O defeito antigo, escrito a letra, nao pode voltar.
    if (/buffer\[pIdx\+\+\] = Match\.ball\.quaternion\./.test(srcReplay))
        erro('recordFrame voltou a gravar Match.ball.quaternion (o no de posicao nao roda)');
    else ok('ja nao grava Match.ball.quaternion');

    // E a fisica continua a escrever onde o replay agora le.
    if (!/this\.ballVisual\.quaternion\.premultiply/.test(ler('js/match/match_physics.js')))
        erro('o MatchPhysics deixou de rodar o ballVisual — o replay esta a ler o sitio errado');
    else ok('o MatchPhysics roda o ballVisual, que e o que o replay grava');
}

/* ------------------------------------------------------------------ */
console.log(LF + '2 — a rede: estado guardado e reposto, sem re-simular');
{
    /*
    O config/physics.js pendura coisas no `window` e usa o THREE para uns
    vectores de trabalho. Nada disso interessa aqui — o que se quer sao as
    constantes do `GoalNet`, que a onda le.
    */
    const amb = { console, window: {}, THREE: require('three') };
    const NetWave = new Function(...Object.keys(amb),
        ler('js/config/physics.js') + LF + ler('js/goal_net.js') + LF + 'return NetWave;')(...Object.values(amb));

    const nu = 2, nv = 2, nVerts = (nu + 1) * (nv + 1);
    const faceFalsa = (zSinal) => {
        const arr = new Float32Array(nVerts * 3);
        for (let i = 0; i < nVerts; i++) { arr[i * 3] = i; arr[i * 3 + 2] = zSinal; }
        return { geometry: { attributes: { position: { array: arr, needsUpdate: false } } } };
    };
    NetWave.faces = [];
    for (const z of [-1, 1]) NetWave.registarFace(faceFalsa(z), z, { x: 0, y: 0, z: 1 }, nu, nv);

    const repouso = NetWave.faces.map((f) => Float32Array.from(f.attr.array));
    const desviou = (i) => {
        const a = NetWave.faces[i].attr.array, b = repouso[i];
        for (let k = 0; k < a.length; k++) if (Math.abs(a[k] - b[k]) > 1e-9) return true;
        return false;
    };

    if (typeof NetWave.estado !== 'function' || typeof NetWave.repor !== 'function') {
        erro('o NetWave nao expoe estado()/repor() — o replay nao tem o que gravar');
    } else {
        ok('o NetWave expoe estado() e repor()');

        const e0 = NetWave.estado();
        if (e0.length !== 4 || e0.some((v) => v !== 0)) erro('em repouso o estado devia ser [0,0,0,0], veio [' + e0 + ']');
        else ok('em repouso o estado sao quatro zeros');

        NetWave.bater(-1, 20);
        NetWave.update(0.05);
        const e1 = NetWave.estado();
        if (!(e1[0] > 0 && e1[1] > 0)) erro('depois de bater e correr, a baliza -1 devia ter t e amplitude > 0, veio [' + e1 + ']');
        else ok('depois de bater, a baliza que levou traz t e amplitude');
        if (e1[2] !== 0 || e1[3] !== 0) erro('bater numa baliza mexeu no estado da outra');
        else ok('a outra baliza fica a zero');
        if (!desviou(0)) erro('a face que levou nao se deformou');
        else ok('a face que levou esta deformada');

        /*
        O ROUND-TRIP, que e o que o replay faz frame a frame: pôr a rede no
        repouso e repor o estado guardado tem de dar a MESMA geometria.
        */
        const deformada = Float32Array.from(NetWave.faces[0].attr.array);
        NetWave.repor(0, 0, 0, 0);
        if (desviou(0)) erro('repor(0,0,0,0) nao devolveu a rede ao repouso');
        else ok('repor a zeros devolve a rede ao repouso');

        NetWave.repor(e1[0], e1[1], e1[2], e1[3]);
        let igual = true;
        for (let k = 0; k < deformada.length; k++)
            if (Math.abs(NetWave.faces[0].attr.array[k] - deformada[k]) > 1e-6) { igual = false; break; }
        if (!igual) erro('repor o estado guardado nao reproduziu a mesma deformacao');
        else ok('repor o estado guardado reproduz a deformacao exacta');

        /*
        O CASO QUE MAIS FALHA: a onda acaba ENTRE dois frames da repeticao. Se
        a face ficar simplesmente inactiva, congela na ultima deformacao em vez
        de voltar ao pano esticado.
        */
        NetWave.repor(0, 0, 0, 0);
        if (desviou(0)) erro('a onda a acabar deixou a rede congelada deformada');
        else ok('quando a onda acaba, a rede volta ao repouso e nao congela');

        // E o `update` continua a desenhar — nao so a avancar o relogio.
        NetWave.bater(1, 20);
        NetWave.update(0.05);
        if (!desviou(1)) erro('o update deixou de desenhar depois de ser partido em avancar + aplicar');
        else ok('o update continua a desenhar as faces activas');
    }
}

/* ------------------------------------------------------------------ */
console.log(LF + '3 — o buffer: a rede cabe la dentro e nao desalinha o frame');
{
    const ctes = {};
    for (const m of srcReplay.matchAll(/^const (FLOATS_PER_PLAYER|CORPOS_POR_FRAME|FLOATS_PER_REDE) = (\d+)/gm))
        ctes[m[1]] = Number(m[2]);

    for (const n of ['FLOATS_PER_PLAYER', 'CORPOS_POR_FRAME', 'FLOATS_PER_REDE'])
        if (ctes[n] === undefined) erro('constante ' + n + ' nao encontrada');

    if (ctes.FLOATS_PER_REDE !== 4)
        erro('FLOATS_PER_REDE devia ser 4 (t e amplitude por baliza), e ' + ctes.FLOATS_PER_REDE);
    else ok('FLOATS_PER_REDE = 4: t e amplitude por cada baliza');

    const decl = srcReplay.match(/^const FLOATS_PER_FRAME = ([^;]+);/m);
    if (!decl) erro('nao encontrei a declaracao do FLOATS_PER_FRAME');
    else {
        const valor = new Function(...Object.keys(ctes), 'return ' + decl[1] + ';')(...Object.values(ctes));
        const esperado = 7 + ctes.CORPOS_POR_FRAME * ctes.FLOATS_PER_PLAYER + ctes.FLOATS_PER_REDE;
        if (valor !== esperado)
            erro('FLOATS_PER_FRAME da ' + valor + ', mas 7 da bola + ' + ctes.CORPOS_POR_FRAME +
                ' corpos + ' + ctes.FLOATS_PER_REDE + ' da rede sao ' + esperado);
        else ok('FLOATS_PER_FRAME = ' + valor + ' inclui os ' + ctes.FLOATS_PER_REDE + ' da rede');
    }

    /*
    O record ESCREVE os quatro e o restore AVANCA os quatro. Se um deles faltar,
    o frame seguinte fica desalinhado por quatro floats — e nada avisa.
    */
    const corpoDe = (nome) => {
        const i = srcReplay.indexOf('    ' + nome + '(');
        if (i < 0) return '';
        return srcReplay.slice(i, srcReplay.indexOf(LF + '    }', i));
    };
    const record = corpoDe('recordFrame'), restore = corpoDe('restoreFrame');

    const escreveRede = (record.match(/this\.buffer\[pIdx\+\+\] = rede\[\d\]/g) || []).length;
    if (escreveRede !== 4) erro('recordFrame escreve ' + escreveRede + ' valores da rede, deviam ser 4');
    else ok('recordFrame escreve os 4 valores da rede');

    if (!/NetWave\.repor\(/.test(restore)) erro('restoreFrame nao repoe a rede');
    else ok('restoreFrame repoe a rede');

    if (!/pIdx \+= FLOATS_PER_REDE/.test(restore))
        erro('restoreFrame nao avanca o pIdx pelos floats da rede — o proximo frame fica desalinhado');
    else ok('restoreFrame avanca o pIdx pelos floats da rede');
}

console.log(LF + (falhas
    ? 'FALHOU: ' + falhas + ' problema(s)'
    : 'OK: a bola roda e a rede balanca na repeticao, e o buffer esta alinhado.'));
process.exit(falhas ? 1 : 0);
