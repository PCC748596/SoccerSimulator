/*
COMO O GUARDA-REDES CAI E COMO SE LEVANTA.

Relato, com tres fotografias: *"o goleiro ainda esta caindo de lado. O goleiro
tem que cair de peito para baixo. Os bracos estao entrando na grama quase de
lado. O goleiro esta ficando apoiado na mao, e fica uns 3 ou 4 segundos apoiado
na mao. O ideal era o goleiro ficar de 4 para levantar."*

Medido antes, em 30 minutos de jogo, na fase de chao do mergulho:

    barriga para baixo                35 graus   (0 = de lado, 90 = de brucos)
    osso mais fundo                   -0.87 m    (dentro do relvado)
    osso mais BAIXO, por frequencia   lHand 74%, rHand 23%

Ou seja: caia de lado a meio caminho, os bracos enterravam-se, e o corpo ficava
pendurado na ponta de um braco — o `assentarDeitado` sobe o corpo ate o osso
mais baixo tocar o relvado, e com as MAOS na lista desse calculo o osso mais
baixo era quase sempre uma delas.

ESTE TESTE NAO JOGA UM JOGO. Monta um mergulho a mao e corre-o frame a frame,
sempre o mesmo. Foi uma licao cara desta sessao: medido por jogo, qualquer
retoque no guarda-redes muda QUAIS mergulhos acontecem, e as medias mudam sem
que nada tenha piorado — dois testes reprovaram assim antes de este existir.
Aqui nao ha semente nem divergencia: o mesmo mergulho, os mesmos numeros.

Corre com: node tests/guarda_redes_queda.test.js
*/
const fs = require('fs');
const path = require('path');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { console.log('  X ' + m); falhas++; };

require('../tools/headless/harness.js');

const cena = new THREE.Scene();
Match.init(cena);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
/*
FORA DE 'PLAY' de proposito: o teste da defesa (`GkDive.defender`) so corre em
jogo, e aqui nao ha bola nenhuma para defender — o que se mede e o CORPO.
*/
Match.state = 'PARADO';

const dt = 1 / 60;
const OSSOS = ['pelvis', 'chest', 'neck', 'lArm', 'rArm', 'lHand', 'rHand',
    'lLeg', 'rLeg', 'lKnee', 'rKnee', 'lFoot', 'rFoot', 'lBota', 'rBota'];
const _v = new THREE.Vector3(), _f = new THREE.Vector3();

/*
Um mergulho, do agachar ao levantar. Devolve as fases, cada uma com:
  picada   media do angulo da barriga (0 = de lado, 90 = de brucos)
  sob      frames com algum osso ABAIXO do relvado
  apoios   quantas vezes cada osso foi o mais baixo
  h        altura media de cada osso que interessa
  joelho   flexao maxima do joelho (para a pose de gatas)
*/
function mergulhar(tipo, dirX, alvoY) {
    const gk = Match.players[0];
    gk.gkEstado = 'mergulho';
    gk.dive = null;
    gk.model.position.set(0, ALTURA_BASE_Y, gk.ownGoalZ + gk.dirZ * 0.5);
    gk.model.quaternion.identity();
    gk.resetBonesToDefault();
    gk.gkAlvoX = dirX * 2.5;
    gk.gkAlvoY = alvoY;
    GkDive.iniciar(gk, gk.gkAlvoX, alvoY, tipo, dirX);

    const fases = {};
    for (let i = 0; i < 60 * 6; i++) {
        /*
        O `Match.delta` TEM DE ESTAR POSTO. Todas as poses do mergulho passam
        pelo `lerpTo`, e ele tira o passo de tempo daqui (ver `fatorSuavizacao`,
        utils.js). Depois de um `Match.init` o delta e ZERO, e com zero o factor
        de suavizacao e zero: as poses ficam congeladas e o banco de ensaio
        media um boneco que nunca se mexia. Custou uma tarde.
        */
        Match.delta = dt;
        const vivo = GkDive.update(gk, dt, gk.model, gk.rig);
        const d = gk.dive;
        if (!vivo || !d) break;

        gk.model.updateWorldMatrix(true, true);
        _f.set(0, 0, 1).applyQuaternion(gk.model.quaternion);
        const picada = Math.asin(Math.max(-1, Math.min(1, -_f.y))) * 180 / Math.PI;

        let baixo = null, baixoY = Infinity;
        const alt = {};
        for (const n of OSSOS) {
            const o = gk.rig[n];
            if (!o) continue;
            o.getWorldPosition(_v);
            alt[n] = _v.y;
            if (_v.y < baixoY) { baixoY = _v.y; baixo = n; }
        }

        // No voo interessa distinguir o principio (de lado) do fim (a virar).
        let chave = d.fase;
        if (d.fase === 'voo') {
            chave = 'voo' + (d.t / Math.max(0.001, d.tVoo) < 0.5 ? '_inicio' : '_fim');
        }
        const f = fases[chave] || (fases[chave] = { n: 0, pic: 0, sob: 0, apoios: {}, h: {}, joelho: 0 });
        f.n++;
        f.pic += picada;
        if (baixoY < 0) f.sob++;
        f.apoios[baixo] = (f.apoios[baixo] || 0) + 1;
        for (const n of ['lHand', 'rHand', 'chest', 'pelvis']) {
            (f.h[n] = f.h[n] || { s: 0, n: 0 }).s += alt[n];
            f.h[n].n++;
        }
        f.joelho = Math.max(f.joelho, Math.abs(gk.rig.lKnee.rotation.x), Math.abs(gk.rig.rKnee.rotation.x));
    }
    return fases;
}

const media = (f, n) => f.h[n].s / f.h[n].n;
const picada = f => f.pic / f.n;
const maosNoApoio = (f) => ((f.apoios.lHand || 0) + (f.apoios.rHand || 0)) / f.n;

/*
DOIS MERGULHOS e nao um: o rasteiro e o alto nao passam pelos mesmos ramos (o
alto fica segundos no chao, `tempoChaoAlto`) e o lado do mergulho troca qual e
o braco lider. Um defeito de sinal so aparece num dos dois.
*/
const baixo = mergulhar('baixo', 1, 0.5);
const alto = mergulhar('alto', -1, 1.9);
const casos = [['mergulho rasteiro, para a direita', baixo], ['mergulho alto, para a esquerda', alto]];

/* ------------------------------------------------------------------ */
console.log('1 — sai de LADO e so vira a barriga no fim do voo');
{
    /*
    Isto e o pedido ANTERIOR, e continua a valer: *"o correcto e ele saltar
    para o lado com o corpo de lado e virar para baixo somente no final"*. A
    viragem so entra a partir de `fracFrente` do voo.
    */
    for (const [nome, f] of casos) {
        const ini = f.voo_inicio;
        if (!ini) { erro(`${nome}: nao houve voo`); continue; }
        console.log(`  ${nome}: barriga ${picada(ini).toFixed(0)} graus no inicio do voo`);
        if (picada(ini) > 25) erro(`${nome}: ja sai de brucos (${picada(ini).toFixed(0)} graus)`);
        else ok(`${nome}: sai de lado`);
    }
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('2 — e ATERRA DE PEITO PARA BAIXO');
{
    for (const [nome, f] of casos) {
        const c = f.chao;
        if (!c) { erro(`${nome}: nao chegou ao chao`); continue; }
        console.log(`  ${nome}: barriga ${picada(c).toFixed(0)} graus no chao`);
        /*
        Media medida antes: 35 graus. Agora 68 (rasteiro) e 76 (alto). O corte
        em 55 fica no meio dos dois mundos e nao exige os 90 exactos — um
        guarda-redes que se atira para o lado nao acaba a direito.
        */
        if (picada(c) < 55) {
            erro(`${nome}: continua a cair de lado (${picada(c).toFixed(0)} graus, era preciso 55+)`);
        } else ok(`${nome}: cai de peito (${picada(c).toFixed(0)} graus)`);
    }
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('3 — NAO fica apoiado na mao');
{
    for (const [nome, f] of casos) {
        const c = f.chao;
        if (!c) continue;
        const frac = maosNoApoio(c);
        const top = Object.keys(c.apoios).sort((a, b) => c.apoios[b] - c.apoios[a])[0];
        console.log(`  ${nome}: o osso mais baixo e uma mao em ${Math.round(100 * frac)}% ` +
            `dos frames no chao (mais frequente: ${top})`);
        /*
        Antes: 97% (lHand 74% + rHand 23%). O corpo ficava pendurado na ponta
        de um braco durante os segundos todos da fase.
        */
        if (frac > 0.5) erro(`${nome}: apoiado na mao em ${Math.round(100 * frac)}% dos frames`);
        else ok(`${nome}: o corpo assenta no tronco e nas pernas`);
    }
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('4 — os bracos nao entram na relva');
{
    for (const [nome, f] of casos) {
        const c = f.chao;
        if (!c) continue;
        const l = media(c, 'lHand'), r = media(c, 'rHand');
        console.log(`  ${nome}: maos a ${l.toFixed(2)} / ${r.toFixed(2)} m no chao, ` +
            `${c.sob} de ${c.n} frames com algum osso sob a relva`);

        if (l < 0 || r < 0) erro(`${nome}: uma mao vive dentro do relvado (${l.toFixed(2)} / ${r.toFixed(2)})`);
        else ok(`${nome}: as maos ficam a superficie`);

        /*
        Alguns frames de transicao no instante da aterragem sao inevitaveis: a
        rotacao do frame e escrita antes de o corpo assentar. O que nao pode
        haver e o corpo a viver enterrado — antes eram 0.87 m de profundidade.
        */
        if (c.sob > c.n * 0.15) {
            erro(`${nome}: ${c.sob} de ${c.n} frames com osso enterrado`);
        } else ok(`${nome}: so ${c.sob} frames de transicao enterrados`);
    }
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('5 — levanta-se DE GATAS');
{
    const G = GoalkeeperDive.poseGatas;
    for (const [nome, f] of casos) {
        const lv = f.levantar;
        if (!lv) { erro(`${nome}: nao chegou a levantar-se`); continue; }
        console.log(`  ${nome}: joelho chega a ${lv.joelho.toFixed(2)} rad (pose de gatas ${G.joelho}) | ` +
            `${lv.sob} frames com osso sob a relva`);

        /*
        A PASSAGEM PELAS QUATRO APOIOS mede-se pelo joelho: de gatas ele fecha
        quase por completo, e e isso que traz a perna para baixo do corpo. Sem
        ela, o que havia era o corpo a rodar de deitado para de pe — o "pivo na
        grama" do relato.
        */
        if (lv.joelho < G.joelho * 0.5) {
            erro(`${nome}: o joelho so chega a ${lv.joelho.toFixed(2)} rad: nao passa por de gatas`);
        } else ok(`${nome}: passa pela posicao de gatas`);

        if (lv.sob > 0) erro(`${nome}: ${lv.sob} frames enterrados a levantar`);
        else ok(`${nome}: levanta-se sem entrar na relva`);
    }
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('6 — as guardas do codigo');
{
    const src = ler('js/gk_dive.js');

    if (/_ossosDeitado: \[[^\]]*'lHand'/.test(src)) {
        erro('as MAOS voltaram a lista do `assentarDeitado`: o corpo volta a ficar pendurado nelas');
    } else ok('as maos estao fora do calculo do assento');

    if (!/maosForaDoRelvado/.test(src)) erro('deixou de haver correccao das maos enterradas');
    else ok('ha correccao para as maos nao entrarem na relva');

    if (!/poseGatas/.test(src)) erro('o levantar deixou de passar pela pose de gatas');
    else ok('o levantar le a pose de gatas');

    const D = GoalkeeperDive;
    if (!(D.anguloFrente > 1.0)) {
        erro(`anguloFrente = ${D.anguloFrente}: com menos do que 1 rad ele nao chega a ficar de peito`);
    } else ok(`anguloFrente = ${D.anguloFrente} rad`);
}

console.log('');
console.log(falhas ? 'FALHOU: ' + falhas : 'OK: cai de peito, nao se enterra, levanta-se de gatas.');
process.exit(falhas ? 1 : 0);
