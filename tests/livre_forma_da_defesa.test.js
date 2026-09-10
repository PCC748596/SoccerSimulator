/*
NUM LIVRE, A EQUIPA QUE DEFENDE TAMBÉM É COLOCADA.

Relato, com captura de campo inteiro: "o posicionamento dos jogadores na batida
do impedimento tá bem ruim. Uns de um lado do campo e outros do outro."

O `setupSetPiece` do FREE_KICK escrevia a posição do batedor, arrumava os dez
companheiros dele, e da equipa que defende colocava **só a barreira**. O resto
levava um empurrão para fora dos 9.15 m e mais nada. Com a falta longe da
baliza a barreira é UM jogador, portanto nove ficavam onde a jogada anterior os
tinha deixado — e como o FREE_KICK está fora do `nivel2Activo()` de propósito,
ninguém os vinha arrumar no frame seguinte.

Medido em 6 livres (`tools/headless/livre_impedimento.js`):

    equipa            colocados pelo setup   dist. media a bola
    que recebe, antes        1.0 / 10              39.0 m
    que recebe, depois       9.8 / 10              24.7 m

**O CENÁRIO DEIXOU DE SER UM FORA-DE-JOGO** (10 de Setembro): a cobrança do
impedimento passou a ter montagem própria — as duas equipas voltam à forma, sem
barreira, e quem marca recua para a própria metade (ver
`Match.formaDoLivreDeImpedimento` e `tests/impedimento_montagem.test.js`). Com
a bandeira `faltaIndirecta` de pé este teste media essa outra montagem e
falhava por bons motivos: quem marca fica mesmo a mais de 53 m da bola num
fora-de-jogo fundo, e barreira não há nenhuma.

O que este teste guarda continua a valer para o LIVRE DE FALTA, que é a maioria
deles: a equipa que defende é colocada, e não fica onde a jogada a deixou.

Corre com: node tests/livre_forma_da_defesa.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

require('../tools/headless/harness.js');

const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const dt = 1 / 60;

/*
Monta um livre de FALTA com a bola no meio-campo defensivo de quem bate — a
distância a que a barreira ainda é um homem só, que é o caso em que o defeito
aparecia.
*/
const montarLivre = (equipaQueBate) => {
    for (let i = 0; i < 300; i++) Match.update(dt);

    const bate = (equipaQueBate === 'TeamA') ? Match.players : Match.opponents;
    const recebe = (equipaQueBate === 'TeamA') ? Match.opponents : Match.players;
    const attDir = bate[0].dirZ;

    Match.ball.position.set(-18, BallPhysics.raio, -attDir * 25);
    Match.ballVel.set(0, 0, 0);

    const antes = new Map();
    for (const p of bate.concat(recebe)) antes.set(p, p.model.position.clone());

    Match.faltaIndirecta = false;   // livre de falta: ver o cabeçalho
    Match.setupSetPiece('FREE_KICK', equipaQueBate);

    const bola = Match.ball.position;
    const campo = recebe.filter(p => p.role !== 'gk');
    return {
        bola, campo, antes, attDir,
        dists: campo.map(p => Math.hypot(
            p.model.position.x - bola.x, p.model.position.z - bola.z)),
        movidos: campo.filter(p =>
            antes.get(p).distanceTo(p.model.position) > 1.0).length
    };
};

test('a equipa que defende o livre é toda colocada, e não só a barreira', () => {
    for (const equipa of ['TeamA', 'TeamB']) {
        const r = montarLivre(equipa);
        assert.ok(r.movidos >= 8,
            `com ${equipa} a bater, só ${r.movidos} de ${r.campo.length} defensores ` +
            `foram colocados. Antes era 1 — a barreira — e os outros ficavam onde ` +
            `a jogada anterior os deixou.`);
    }
});

test('ninguém fica a meio campo de distância da bola', () => {
    for (const equipa of ['TeamA', 'TeamB']) {
        const r = montarLivre(equipa);
        const longe = r.dists.filter(d => d > 53);
        assert.strictEqual(longe.length, 0,
            `com ${equipa} a bater, ${longe.length} defensores ficaram a mais de ` +
            `53 m da bola (o pior a ${Math.max(...r.dists).toFixed(1)} m). ` +
            `É o "uns de um lado do campo e outros do outro" do relato.`);
    }
});

test('a Lei 13 continua a valer: ninguém a menos de 9.15 m da bola', () => {
    /*
    A distância regulamentar é `FreeKickShape.de`, e é ela que põe o primeiro
    homem do bloco. A barreira é a excepção: fica em `FreeKickModel.distanciaBarreira`,
    que é a mesma distância medida na linha bola-baliza.
    */
    for (const equipa of ['TeamA', 'TeamB']) {
        const r = montarLivre(equipa);
        const perto = r.campo.filter((p, i) => !p.naBarreiraFalta && r.dists[i] < 9.0);
        assert.strictEqual(perto.length, 0,
            `com ${equipa} a bater, ${perto.length} defensores fora da barreira ` +
            `ficaram a menos de 9 m da bola.`);
    }
});

test('a barreira nao e desfeita pela forma', () => {
    /*
    A `formaDaDefesaNoLivre` corre DEPOIS de a barreira estar montada e tem de
    a saltar — a posição dela é a Lei 13 e não uma escolha de bloco.
    */
    const r = montarLivre('TeamA');
    const recebe = Match.opponents.filter(p => p.role !== 'gk');
    const naBarreira = recebe.filter(p => p.naBarreiraFalta);
    assert.ok(naBarreira.length >= 1, 'ha barreira montada');
    for (const p of naBarreira) {
        const d = Math.hypot(p.model.position.x - r.bola.x, p.model.position.z - r.bola.z);
        assert.ok(Math.abs(d - FreeKickModel.distanciaBarreira) < 1.0,
            `um jogador da barreira ficou a ${d.toFixed(1)} m da bola, e a barreira ` +
            `e a ${FreeKickModel.distanciaBarreira} m — a forma do bloco pisou-a.`);
    }
});
