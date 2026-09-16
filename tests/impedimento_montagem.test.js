/*
A MONTAGEM DA COBRANCA DO IMPEDIMENTO.

Relato, com captura: "a posicao dos jogadores na cobranca dos impedimentos nao
esta boa. Uns de um lado do campo e os outros do outro lado. Isso nao faz
nenhum sentido."

E o que o codigo fazia, e por construcao: no livre por impedimento quem bate e
a equipa que DEFENDIA, e do lado dela so o batedor era colocado -- os outros
nove ficavam onde a jogada os tinha deixado, junto a propria linha defensiva. A
outra equipa levava a `formaDaDefesaNoLivre`, que a arruma de 9.15 a 34 m da
bola NA DIRECCAO DA BALIZA QUE ELA DEFENDE -- e essa baliza esta no outro
extremo do campo. Resultado: dois grupos, um em cada metade, e o meio-campo
vazio.

Pedido, para quem bate (4-4-2):

    primeira linha de 4   os dois laterais 5 m a frente da grande area
    segunda linha de 4    os dois meias 15 m a frente da linha de defesa
    terceira linha de 2   5 m depois da linha de meio-campo

E a equipa adversaria marca a partir da linha de meio-campo -- ou seja, recua
para a propria metade em vez de ficar espalhada pela do adversario.

Corre com: node --test tests/impedimento_montagem.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(20260910);

require('../tools/headless/harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

// Uns segundos de jogo para ninguem estar na formacao inicial.
for (let i = 0; i < 600; i++) Match.update(dt);

/*
O impedimento e marcado contra o TeamB: a bola fica onde o impedido estava (no
meio-campo do TeamA, que e quem vai bater) e o livre e do TeamA.
*/
const bate = Match.players;      // TeamA
const marca = Match.opponents;   // TeamB
const attDir = bate.find(p => p.role !== 'gk').dirZ;

Match.ball.position.set(6.0, BallPhysics.raio, -attDir * 30.0);
Match.ballVel.set(0, 0, 0);
Match.faltaIndirecta = true;   // e a bandeira do fora-de-jogo
Match.setupSetPiece('FREE_KICK', 'TeamA');

const zAtk = p => p.model.position.z * attDir;
const linhas = {
    def: bate.filter(p => p.role === 'def'),
    mid: bate.filter(p => p.role === 'mid'),
    atk: bate.filter(p => p.role === 'atk')
};
const med = a => a.reduce((s, v) => s + v, 0) / a.length;

test('a equipa que bate forma tres linhas, e nao um monte', () => {
    const S = OffsideRestartShape;
    assert.ok(linhas.def.length >= 3 && linhas.mid.length >= 3,
        'a formacao lida nao tem linhas para medir');

    const zDef = med(linhas.def.filter(p => p !== Match.setPieceTaker).map(zAtk));
    const zMid = med(linhas.mid.filter(p => p !== Match.setPieceTaker).map(zAtk));
    const zAtq = med(linhas.atk.filter(p => p !== Match.setPieceTaker).map(zAtk));

    // A linha de defesa em metros da PROPRIA linha de fundo.
    const defDaLinha = zDef + LINHA_FUNDO;
    console.log(`  defesa a ${defDaLinha.toFixed(1)} m da propria linha de fundo  |  ` +
        `medios a ${(zMid - zDef).toFixed(1)} m a frente dela  |  ` +
        `avancados a ${zAtq.toFixed(1)} m do meio-campo`);

    assert.ok(Math.abs(defDaLinha - S.linhaDefesa) < 2.5,
        `linha de defesa a ${defDaLinha.toFixed(1)} m (pedido ${S.linhaDefesa})`);
    assert.ok(Math.abs((zMid - zDef) - S.espacoParaOsMedios) < 2.5,
        `medios a ${(zMid - zDef).toFixed(1)} m da defesa (pedido ${S.espacoParaOsMedios})`);
    assert.ok(Math.abs(zAtq - S.avancadosAlemDoMeio) < 2.5,
        `avancados a ${zAtq.toFixed(1)} m do meio-campo (pedido ${S.avancadosAlemDoMeio})`);
});

test('os laterais e os meias de ala ficam abertos', () => {
    const largos = linhas.def.filter(p => Math.abs(p.baseTarget.x) > 15);
    assert.ok(largos.length >= 2, 'a formacao nao tem laterais para medir');
    for (const p of largos) {
        if (p === Match.setPieceTaker) continue;
        assert.ok(Math.abs(p.model.position.x) > 12,
            `${p.pos} ficou a ${p.model.position.x.toFixed(1)} m do eixo: a linha fechou`);
    }
});

test('a equipa adversaria marca a partir do meio-campo, e nao do outro extremo', () => {
    const S = OffsideRestartShape;
    const zNoAtaqueDeles = marca.filter(p => p.role !== 'gk')
        .map(p => p.model.position.z * p.dirZ);
    const maisAdiantado = Math.max(...zNoAtaqueDeles);
    const maisRecuado = Math.min(...zNoAtaqueDeles);
    console.log(`  adversario entre ${maisRecuado.toFixed(1)} e ${maisAdiantado.toFixed(1)} m ` +
        `no eixo de ataque dele (0 = meio-campo)`);

    /*
    "Pode avancar um pouco mais. Ta muito recuado" -- segunda passagem do
    relato. A linha da frente deles passa `avancoAlemDoMeio` para dentro do
    campo de quem bate, e o bloco tem `blocoAdversario` de profundidade a
    contar dai.
    */
    assert.ok(maisAdiantado <= S.avancoAlemDoMeio + 2.0,
        `o adversario tem gente a ${maisAdiantado.toFixed(1)} m dentro do campo de quem bate`);
    assert.ok(maisAdiantado >= S.avancoAlemDoMeio - 2.0,
        `o adversario parou a ${maisAdiantado.toFixed(1)} m: continua recuado`);
    assert.ok(maisRecuado > S.avancoAlemDoMeio - (S.blocoAdversario + 6),
        `o adversario recuou ate ${maisRecuado.toFixed(1)} m: foi para cima da propria baliza`);
});

test('e os dois blocos nao ficam em metades opostas', () => {
    const centroBate = med(bate.filter(p => p.role !== 'gk').map(zAtk));
    const centroMarca = med(marca.filter(p => p.role !== 'gk').map(p => p.model.position.z * attDir));
    console.log(`  centro de quem bate ${centroBate.toFixed(1)} m, ` +
        `de quem marca ${centroMarca.toFixed(1)} m (eixo de ataque de quem bate)`);
    assert.ok(Math.abs(centroBate - centroMarca) < 40,
        `os dois blocos estao a ${Math.abs(centroBate - centroMarca).toFixed(1)} m um do outro`);
});
