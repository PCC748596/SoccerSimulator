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

SEGUNDA PASSAGEM, e a razao por que este teste passou a varrer o campo.

A montagem que respondeu ao pedido acima ancorou as linhas em sitios FIXOS: a
de tras a 21.5 m da propria linha de fundo, os avancados 5 m alem do
meio-campo, o bloco de quem marca no meio-campo. Nenhum numero olhava para
onde a BOLA estava, portanto a montagem so se lia bem quando o impedimento
calhava perto dessas linhas -- e era exactamente esse o unico caso que este
teste exercitava, com a bola sempre em z = -attDir * 30.

O mesmo relato voltou: *"o posicionamento dos jogadores na cobranca de
impedimento ainda nao faz sentido; tem BUG, uns jogadores de um lado do campo
e outros do outro"*. Medido com `tools/scratch/impedimento_sintetico.js`, a
distancia media a bola de quem COBRA: 54 m com a bola em z -40, 37 m em -20,
22 m no centro. O teste nao podia apanhar isto porque so media um ponto.

Por isso agora a montagem e feita em VARIOS pontos do campo, e o que se mede
e a distancia a BOLA -- nao a linhas absolutas.

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

// Varre-se o campo: a montagem tem de fazer sentido em qualquer ponto.
const PONTOS = [-40, -20, 0, 20, 40];

function montar(bolaZ) {
    Match.ball.position.set(6.0, BallPhysics.raio, bolaZ);
    Match.ballVel.set(0, 0, 0);
    Match.faltaIndirecta = true;   // e a bandeira do fora-de-jogo
    Match.setupSetPiece('FREE_KICK', 'TeamA');
}
const distBola = p => Math.hypot(
    p.model.position.x - Match.ball.position.x,
    p.model.position.z - Match.ball.position.z);

// A montagem de referencia, para os testes que so precisam de uma.
montar(-attDir * 30.0);

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

    /*
    AS TRES LINHAS MEDEM-SE DA BOLA, e nao de linhas do campo -- ver a segunda
    passagem no cabecalho. Estas tres assercoes liam `S.linhaDefesa`,
    `S.espacoParaOsMedios` e `S.avancadosAlemDoMeio`, que eram distancias a
    propria linha de fundo e ao meio-campo, e eram elas que davam por boa a
    montagem que mandava a equipa para a outra metade.
    */
    const bolaAtk = Match.ball.position.z * attDir;

    /*
    A LINHA DE TRAS JA NAO E A DEFESA TODA: so os `S.atrasDaBola` mais
    recuados da formacao ficam atras da bola (ver OffsideRestartShape). A
    media dos quatro defesas deixou de medir o que quer que seja — mede-se
    agora quem esta mesmo la atras.
    */
    const atrasDaBola = bate
        .filter(p => p.role !== 'gk' && p !== Match.setPieceTaker)
        .filter(p => zAtk(p) < bolaAtk);
    assert.ok(atrasDaBola.length > 0, 'ninguem ficou atras da bola');
    const zTras = med(atrasDaBola.map(zAtk));
    assert.ok(Math.abs((bolaAtk - zTras) - S.defesaAtrasDaBola) < 2.5,
        `linha de tras a ${(bolaAtk - zTras).toFixed(1)} m atras da bola (pedido ${S.defesaAtrasDaBola})`);
    assert.ok(Math.abs((zMid - bolaAtk) - S.mediosAFrenteDaBola) < 2.5,
        `medios a ${(zMid - bolaAtk).toFixed(1)} m da bola (pedido ${S.mediosAFrenteDaBola})`);
    assert.ok(Math.abs((zAtq - bolaAtk) - S.avancadosAFrenteDaBola) < 2.5,
        `avancados a ${(zAtq - bolaAtk).toFixed(1)} m da bola (pedido ${S.avancadosAFrenteDaBola})`);
});

/*
=====================================================================
QUANTOS FICAM ENTRE A BOLA E A PROPRIA BALIZA
=====================================================================
Pedido: *"na cobranca do impedimento eu quero somente 2 jogadores atras da
linha da bola, entre a bola e o gol defendido, se o impedimento for marcado
ate a linha da grande area. Se for dentro da linha da grande area para tras,
todos os jogadores a frente da linha da bola."*

Antes ficava atras da bola a linha de defesa INTEIRA — quatro —, porque a
profundidade saia so do posto.

Dois nao contam para a conta, e o teste exclui-os pela mesma razao por que a
montagem os exclui: o GUARDA-REDES fica na baliza e nao e colocado por esta
montagem, e o BATEDOR espera 3 m atras da bola (`FreeKickModel.recuoBatedor`)
porque e de la que vem bate-la.
=====================================================================
*/
test('so dois atras da bola, e nenhum se a marca for dentro da grande area', () => {
    const S = OffsideRestartShape;
    // A linha da grande area dele, no referencial de ataque dele.
    const linhaArea = -LINHA_FUNDO + Area.profundidade;

    const contar = () => {
        const bolaAtk = Match.ball.position.z * attDir;
        return bate
            .filter(p => p.role !== 'gk' && p !== Match.setPieceTaker)
            .filter(p => zAtk(p) < bolaAtk - 0.01).length;
    };

    // Da linha da grande area PARA FORA: dois, e so dois.
    for (const zA of [-5, -20, -30, linhaArea + 1.0]) {
        montar(zA * attDir);
        const n = contar();
        console.log(`  bola a ${zA.toFixed(1)} (linha da area ${linhaArea.toFixed(1)}): ` +
            `${n} atras da bola`);
        assert.strictEqual(n, S.atrasDaBola,
            `bola a ${zA.toFixed(1)}: ${n} atras da bola, pedido ${S.atrasDaBola}`);
    }

    // Da linha da grande area PARA TRAS: ninguem.
    for (const zA of [linhaArea - 0.5, -42, -50]) {
        montar(zA * attDir);
        const n = contar();
        console.log(`  bola a ${zA.toFixed(1)} (dentro da area): ${n} atras da bola`);
        assert.strictEqual(n, S.atrasDaBolaNaArea,
            `bola a ${zA.toFixed(1)}: ${n} atras da bola, pedido ${S.atrasDaBolaNaArea}`);
    }

    montar(-attDir * 30.0);
});

/*
O TESTE QUE FALTAVA: a montagem tem de servir em QUALQUER ponto do campo.

Com as linhas absolutas isto reprovava com folga -- quem cobra ficava a 54 m
de media da bola com ela em z -40, e sete dos dez na outra metade do campo.
*/
test('em qualquer ponto do campo ninguem fica a meio campo da bola', () => {
    for (const z of PONTOS) {
        montar(z);
        for (const par of [['quem bate', bate], ['quem marca', marca]]) {
            const nome = par[0];
            const campo = par[1].filter(p => p.role !== 'gk');
            const ds = campo.map(distBola);
            const media = med(ds), longe = Math.max(...ds);
            console.log(`  bola z ${String(z).padStart(4)}  ${nome}: media ` +
                `${media.toFixed(1)} m, mais longe ${longe.toFixed(1)} m`);
            assert.ok(media < 32,
                `bola em z ${z}: ${nome} ficou a ${media.toFixed(1)} m de media da bola`);
            assert.ok(longe < 45,
                `bola em z ${z}: ${nome} tem alguem a ${longe.toFixed(1)} m da bola`);
        }
    }
    montar(-attDir * 30.0);
});

/*
E A LEI 13: ninguem de quem marca a menos de 9.15 m da bola, em ponto nenhum.
*/
test('quem marca respeita os 9.15 m em qualquer ponto do campo', () => {
    const minDist = FreeKickModel.afastaAdversarios || 9.15;
    for (const z of PONTOS) {
        montar(z);
        for (const p of marca) {
            if (p.role === 'gk') continue;
            const d = distBola(p);
            assert.ok(d >= minDist - 0.5,
                `bola em z ${z}: ${p.pos} a ${d.toFixed(1)} m (minimo ${minDist})`);
        }
    }
    montar(-attDir * 30.0);
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

test('a equipa adversaria marca a partir da BOLA, e nao do outro extremo', () => {
    const S = OffsideRestartShape;
    const zNoAtaqueDeles = marca.filter(p => p.role !== 'gk')
        .map(p => p.model.position.z * p.dirZ);
    const maisAdiantado = Math.max(...zNoAtaqueDeles);
    const maisRecuado = Math.min(...zNoAtaqueDeles);
    console.log(`  adversario entre ${maisRecuado.toFixed(1)} e ${maisAdiantado.toFixed(1)} m ` +
        `no eixo de ataque dele (0 = meio-campo)`);

    /*
    A linha da frente deles nasce a distancia regulamentar DA BOLA, e o bloco
    tem `blocoAdversario` de profundidade a contar dai. Ancorava no meio-campo
    -- ver a segunda passagem no cabecalho.
    */
    const minDist = FreeKickModel.afastaAdversarios || 9.15;
    const dirM = marca.find(p => p.role !== 'gk').dirZ;
    const bolaNoAtaqueDeles = Match.ball.position.z * dirM;
    const frente = bolaNoAtaqueDeles - minDist;
    assert.ok(maisAdiantado <= frente + 2.0,
        `o adversario tem gente a ${(bolaNoAtaqueDeles - maisAdiantado).toFixed(1)} m da bola`);
    assert.ok(maisAdiantado >= frente - 2.0,
        `o adversario parou a ${(bolaNoAtaqueDeles - maisAdiantado).toFixed(1)} m da bola: continua recuado`);
    assert.ok(maisRecuado > frente - (S.blocoAdversario + 6),
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
