/*
O PASSE EM PROFUNDIDADE PARA UM PONTO DISPUTADO.

O mapa das posses (tools/headless/onde_morrem_ataques.js) diz que 40% de todas
as sequências morrem num passe cortado — o maior bloco isolado. E o detalhe por
tipo (tools/headless/passes.js, 600 s) diz qual:

    tipo       recebeu  outro colega  cortado  adversário na linha à saída
    direct       61%        20%         13%            24%
    space        68%        16%          5%             4%
    leading      63%        12%         22%            31%

O `leading` é o que mais se perde — e **os cortes acontecem a 98% do percurso**.
Não é a linha tapada a meio: é o adversário a ganhar a bola NO PONTO DE QUEDA.

O `PassTypes.escolher` media a folga da LINHA e descartava quem tinha alguém em
cima da recta; nunca perguntou quem chegava primeiro ao sítio onde a bola ia
cair. É a mesma pergunta do `maiorToqueSeguro` (o toque de condução), e a
resposta é `pontoDisputado` (utils.js).

Cheguei a somar aqui o relógio da BOLA — "só conta quem lá esteja quando ela
cair". Está errado, e fica escrito porque é o género de termo que parece
sofisticado: é uma condição A MAIS, portanto estreita o teste, e um defesa que
chega ao ponto antes do destinatário ganha a bola quer ela já lá esteja quer
chegue a seguir. O tempo de voo não muda quem ganha a corrida.

Corre com: node tests/passe_ponto_disputado.test.js
*/
const fs = require('fs');
const path = require('path');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { console.log('  X ' + m); falhas++; };

const srcUtils = ler('js/utils.js');
const i = srcUtils.indexOf('function pontoDisputado');
if (i < 0) throw new Error('pontoDisputado não encontrada em utils.js');
const pontoDisputado = (new Function(
    srcUtils.slice(i, srcUtils.indexOf(LF + '}', i) + 2) + '; return pontoDisputado;'))();

// Os números de produção.
const srcCfg = ler('js/config/passing.js');
const mCfg = srcCfg.match(/disputaDoPonto:\s*\{([\s\S]*?)\}/);
if (!mCfg) throw new Error('disputaDoPonto não encontrado em config/passing.js');
const cfg = (new Function('return {' + mCfg[1] + '};'))();

console.log('1 — quem chega primeiro ao ponto de queda');
{
    /*
    Cenário: ponto de queda em (0, 12), destinatário 6 m atrás dele — 0.92 s de
    corrida. Um defesa só ganha se lá chegar em menos disso.
    */
    // Defesa colado ao ponto: chega lá muito antes do homem.
    if (!pontoDisputado(0, 12, 0, 6, [{ x: 1, z: 13 }], cfg)) {
        erro('defesa em cima do ponto de queda devia dar disputado');
    } else ok('defesa em cima do ponto: disputado');

    // Defesa longe: não chega a tempo, o passe é bom.
    if (pontoDisputado(0, 12, 0, 6, [{ x: 25, z: 30 }], cfg)) {
        erro('defesa a 25 m não pode tornar o ponto disputado');
    } else ok('defesa longe: livre');

    // Destinatário praticamente em cima do ponto: ganha ele.
    if (pontoDisputado(0, 12, 0, 11.5, [{ x: 4, z: 14 }], cfg)) {
        erro('com o homem a meio metro do ponto, o defesa a 4 m não ganha');
    } else ok('homem em cima do ponto: livre');

    // Sem adversários não há disputa nenhuma.
    if (pontoDisputado(0, 12, 0, 6, [], cfg)) erro('sem adversários não há disputa');
    else ok('campo livre: livre');
}

console.log('');
console.log('2 — a regra está ligada ao escolher, e desce a DIRECTO');
{
    const srcPT = ler('js/pass_types.js');
    if (!/pontoDisputado\(/.test(srcPT)) {
        erro('o PassTypes.escolher deixou de perguntar quem chega ao ponto');
    } else ok('o escolher pergunta pela disputa do ponto');

    const iUso = srcPT.indexOf('pontoDisputado(');
    const bloco = srcPT.slice(iUso, iUso + 400);
    if (!/tipo: this\.DIRECT/.test(bloco)) {
        erro('com o ponto disputado o candidato tem de descer a passe DIRECTO, não morrer');
    } else ok('ponto disputado: desce a passe directo ao homem');

    for (const n of ['velReceptor', 'velAdversario', 'margem']) {
        if (typeof cfg[n] !== 'number') erro(`falta ${n} em disputaDoPonto`);
    }
    ok(`números do config: receptor ${cfg.velReceptor}, adversário ${cfg.velAdversario}, margem ${cfg.margem}`);
}

console.log('');
if (falhas) {
    console.log(`passe_ponto_disputado: ${falhas} falha(s).`);
    process.exit(1);
}
console.log('OK: já não se passa para a corrida do adversário.');
