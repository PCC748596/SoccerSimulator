/*
O GUARDA-REDES DEPOIS DE A BOLA SAIR PELA LINHA DE FUNDO.

Dois relatos, o mesmo lance:

  1. *"Depois do chute, quando a bola sai pela linha de fundo, o goleiro é
     teletransportado de um lado para outro."*

     A montagem do tiro de meta punha-o no ponto de arranque com um
     `reporGuardaRedes`, que escreve `model.position` de uma vez. O ponto de
     arranque é a quina da pequena área DO LADO POR ONDE A BOLA SAIU — com ele
     no poste contrário, isso é um salto de até ~13 m atravessado à baliza,
     num frame. Agora vai a pé, durante os segundos que o lance já tinha.

  2. *"Depois do chute o goleiro está ficando de lado."*

     Ele olha para a bola todos os frames, e isso está certo — mas a bola sai
     pela linha de fundo e fica lá atrás durante a reposição. A olhar para ela,
     ele fica de perfil ou de costas para o campo. O `zDeOlharDoGuardaRedes`
     (utils.js) prende o ponto de olhar da linha dele para dentro.

Corre com: node tests/guarda_redes_tiro_de_meta.test.js
*/
const fs = require('fs');
const path = require('path');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { console.log('  X ' + m); falhas++; };

// A regra do olhar, tirada do ficheiro real.
const { zDeOlharDoGuardaRedes } = (new Function(
    ler('js/utils.js') + LF + 'return { zDeOlharDoGuardaRedes };'
))();

/* ------------------------------------------------------------------ */
console.log('1 — com a bola EM CAMPO o olhar nao e tocado');
{
    /*
    Guarda-redes do TeamA: a baliza dele em z = -53, e ele ataca +Z. Tudo o
    que esteja a frente da linha dele com folga tem de passar intacto, senao o
    clamp estaria a mexer no jogo corrido.
    */
    const golZ = -53, dirZ = 1;
    for (const z of [-40, -10, 0, 20, 52]) {
        const r = zDeOlharDoGuardaRedes(z, golZ, dirZ);
        if (Math.abs(r - z) > 1e-9) erro(`bola em z=${z} passou a ${r}`);
        else ok(`bola em z=${z}: olhar intacto`);
    }
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('2 — bola FORA pela linha de fundo: olha para dentro do campo');
{
    const golZ = -53, dirZ = 1;
    for (const z of [-53, -55, -60, -80]) {
        const r = zDeOlharDoGuardaRedes(z, golZ, dirZ);
        if ((r - golZ) * dirZ < 1.0 - 1e-9) {
            erro(`bola em z=${z}: o olhar ficou em ${r}, atras da linha`);
        } else ok(`bola em z=${z}: olha para ${r} (dentro do campo)`);
    }
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('3 — a mesma regra do outro lado do campo (dirZ = -1)');
{
    /*
    O guarda-redes do TeamB defende +Z e ataca -Z. Os sinais invertem-se todos,
    e e onde um clamp escrito a pensar so num dos lados se parte.
    */
    const golZ = 53, dirZ = -1;

    const dentro = zDeOlharDoGuardaRedes(10, golZ, dirZ);
    if (Math.abs(dentro - 10) > 1e-9) erro(`bola em campo (z=10) passou a ${dentro}`);
    else ok('bola em campo: olhar intacto');

    for (const z of [53, 56, 70]) {
        const r = zDeOlharDoGuardaRedes(z, golZ, dirZ);
        if ((r - golZ) * dirZ < 1.0 - 1e-9) {
            erro(`bola em z=${z}: o olhar ficou em ${r}, atras da linha`);
        } else ok(`bola em z=${z}: olha para ${r} (dentro do campo)`);
    }
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('4 — a margem e configuravel e o X nunca e tocado');
{
    const r = zDeOlharDoGuardaRedes(-60, -53, 1, 4.0);
    if (Math.abs(r - (-49)) > 1e-9) erro(`margem 4.0 devia dar -49, deu ${r}`);
    else ok('a margem manda: -49 com margem de 4 m');

    /*
    O X fica DE FORA de proposito: e ele que faz o guarda-redes virar para o
    lado por onde a bola saiu. Tirar-lho punha-o sempre de frente, que e tao
    errado como po-lo de costas. A funcao so devolve z — e a garantia.
    */
    if (zDeOlharDoGuardaRedes.length > 4) erro('a funcao passou a mexer em mais do que o z');
    else ok('so o z e corrigido; o X continua a seguir a bola');
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('5 — a montagem do tiro de meta ja nao o teletransporta');
{
    const src = ler('js/match/match_setpieces.js');
    const i = src.indexOf("} else if (type === 'GOAL_KICK') {");
    if (i < 0) erro('nao encontrei o ramo do GOAL_KICK');
    else {
        const bloco = src.slice(i, src.indexOf('formaDoTiroDeMeta', i));

        if (/this\.reporGuardaRedes\(/.test(bloco)) {
            erro('o GOAL_KICK voltou a CHAMAR o `reporGuardaRedes`: e ele que o teletransporta');
        } else ok('o GOAL_KICK nao chama o `reporGuardaRedes`');

        if (/gk\.model\.position\.set/.test(bloco)) {
            erro('o GOAL_KICK escreve a posicao do guarda-redes directamente');
        } else ok('nao escreve a posicao dele directamente');

        if (!/gk\.dynamicTarget\.set\(gk\.gkTiroAlvo\.x/.test(bloco)) {
            erro('deixou de publicar o alvo: ninguem sabe para onde ele vai');
        } else ok('publica o alvo no `dynamicTarget` e deixa-o ir a pe');
    }
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('6 — a caminhada le o sitio ONDE A BOLA VAI FICAR');
{
    /*
    Nos primeiros segundos a bola ainda esta a sair — so passados 3 s e puxada
    para a quina da pequena area (`golKickBolaAlvo`). A ler a posicao viva, ele
    caminhava atras de uma bola fora de campo, e de costas para o jogo.
    */
    const src = ler('js/player.js');
    const i = src.indexOf("this.gkEstado === 'tiro_meta_espera'");
    if (i < 0) erro('nao encontrei o estado tiro_meta_espera');
    else {
        const bloco = src.slice(i, src.indexOf("this.gkEstado === 'tiro_meta'", i + 10));

        if (!/Match\.golKickBolaAlvo/.test(bloco)) {
            erro('a caminhada voltou a ler a posicao viva da bola');
        } else ok('caminha para onde a bola vai ficar');

        if (!/tiroMetaCorrer/.test(bloco)) {
            erro('a travessia voltou a ser toda a passo de caminhada');
        } else ok('de longe vai a trote, de perto acaba a andar');
    }
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('7 — E A MEDIDA: nenhum salto de frame para frame, com o jogo a correr');
{
    /*
    As verificacoes acima leem o codigo; esta MEDE o jogo. E a unica que
    apanha o bug pelo sintoma — um guarda-redes que muda de sitio num frame.

    Oito minutos de jogo com semente fixa, a olhar para os dois guarda-redes
    em todos os frames de GOAL_KICK. Medido:

        antes da correccao    salto maximo  9.53 m  (o teleporte, num frame)
        depois                salto maximo  0.175 m (o avanco do clip do chute)

    O tecto fica em 0.5 m, bem acima do passo real e a uma ordem de grandeza
    do defeito. A 60 fps, 0.5 m por frame sao 30 m/s — nada que ande a pe
    chega la.
    */
    const mulberry32 = (a) => () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    Math.random = mulberry32(7);

    require('../tools/headless/harness.js');

    const dt = 1 / 60;
    const cena = new THREE.Scene();
    Match.init(cena);
    if (typeof Officials !== 'undefined' && Officials.init) Officials.init(cena);
    if (typeof Sim === 'undefined') global.Sim = {};
    Sim.running = true;

    const anterior = new Map();
    let maiorSalto = 0, ondeSaltou = '', tiros = 0, estadoAnt = '';

    for (let f = 0; f < 60 * 60 * 8; f++) {
        for (const p of [...Match.players, ...Match.opponents]) {
            if (p.role !== 'gk' || !p.model) continue;
            const a = anterior.get(p);
            if (a && Match.state === 'GOAL_KICK') {
                const d = Math.hypot(p.model.position.x - a.x, p.model.position.z - a.z);
                if (d > maiorSalto) { maiorSalto = d; ondeSaltou = p.gkEstado; }
            }
            anterior.set(p, { x: p.model.position.x, z: p.model.position.z });
        }
        if (Match.state === 'GOAL_KICK' && estadoAnt !== 'GOAL_KICK') tiros++;
        estadoAnt = Match.state;
        Match.update(dt);
    }

    console.log(`  ${tiros} tiros de meta | maior salto num frame: ` +
        `${maiorSalto.toFixed(3)} m (${ondeSaltou || 'sem saltos'})`);

    if (tiros < 2) erro(`amostra curta: so ${tiros} tiros de meta em 8 minutos`);
    else ok(`${tiros} tiros de meta medidos`);

    if (maiorSalto > 0.5) {
        erro(`o guarda-redes andou ${maiorSalto.toFixed(2)} m num frame (${ondeSaltou}) — voltou o teleporte`);
    } else ok(`maior deslocacao num frame: ${maiorSalto.toFixed(3)} m, a pe`);
}

console.log('');
console.log(falhas ? 'FALHOU: ' + falhas : 'OK: o guarda-redes vai a pe e nao fica de costas.');
process.exit(falhas ? 1 : 0);
