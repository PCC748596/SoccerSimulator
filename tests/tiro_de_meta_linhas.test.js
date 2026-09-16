/*
O TIRO DE META TEM LINHAS, E A MARCACAO NAO E EM CIMA DA AREA.

Relato, com captura: "a posicao dos jogadores no tiro de meta nao esta boa. Sem
linhas definidas do time batedor. Marcacao muito alta do time adversario."

O `formaDoTiroDeMeta` espalhava as duas equipas por um CONTINUO -- cada jogador
num ponto proporcional a ordem do posto dele na formacao, entre `bateDe` e
`bateAte`. Dez pontos diferentes ao longo de 36 metros nao sao linhas nenhumas.
Medido antes (tools/headless/tiro_de_meta.js, 8 lances):

    equipa que bate     media -11.0 m, de -28.4 a +9.5   (0 = meio-campo)
    equipa que recebe   media  +5.0 m, o mais recuado a -16.5

E o mais recuado de quem recebe vinha do `recebeDe: -28`, ou seja 25 m da linha
de fundo de quem bate: marcacao colada a area.

Agora e o mesmo desenho da cobranca do impedimento -- tres linhas por `role`
(def/mid/atk) -- e o bloco de quem recebe tem uma linha da frente propria, em
metros da linha de fundo de quem bate.

Corre com: node --test tests/tiro_de_meta_linhas.test.js
*/
const test = require('node:test');
const assert = require('node:assert');

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(20260911);

require('../tools/headless/harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

for (let i = 0; i < 600; i++) Match.update(dt);

Match.setupSetPiece('GOAL_KICK', 'TeamA');
// Uns segundos para os corpos chegarem aos alvos escritos pela forma.
for (let i = 0; i < 60 * 6 && Match.state === 'GOAL_KICK'; i++) Match.update(dt);

const bate = Match.players.filter(p => p.role !== 'gk');
const recebe = Match.opponents.filter(p => p.role !== 'gk');
const attDir = bate[0].dirZ;
const zAtk = p => p.dynamicTarget.z * attDir;      // o ALVO que a forma escreve
const med = a => a.reduce((s, v) => s + v, 0) / a.length;
const porRole = r => bate.filter(p => p.role === r);

test('quem bate forma tres linhas, e nao uma escada de dez degraus', () => {
    const S = GoalKickShape;
    const zDef = med(porRole('def').map(zAtk));
    const zMid = med(porRole('mid').map(zAtk));
    const zAtq = med(porRole('atk').map(zAtk));
    const defDaLinha = zDef + LINHA_FUNDO;

    console.log(`  defesa a ${defDaLinha.toFixed(1)} m da propria linha de fundo | ` +
        `medios +${(zMid - zDef).toFixed(1)} | avancados a ${zAtq.toFixed(1)} do meio-campo`);

    assert.ok(Math.abs(defDaLinha - S.linhaDefesa) < 2.0,
        `linha de defesa a ${defDaLinha.toFixed(1)} m (pedido ${S.linhaDefesa})`);
    assert.ok(Math.abs((zMid - zDef) - S.espacoParaOsMedios) < 2.0,
        `medios a ${(zMid - zDef).toFixed(1)} m da defesa (pedido ${S.espacoParaOsMedios})`);
    assert.ok(Math.abs(zAtq - S.avancadosAlemDoMeio) < 2.0,
        `avancados a ${zAtq.toFixed(1)} m do meio-campo (pedido ${S.avancadosAlemDoMeio})`);

    // E cada linha e mesmo uma linha: os seus estao todos a mesma profundidade.
    for (const r of ['def', 'mid', 'atk']) {
        const zs = porRole(r).map(zAtk);
        if (zs.length < 2) continue;
        const espalha = Math.max(...zs) - Math.min(...zs);
        assert.ok(espalha < 1.0,
            `a linha ${r} esta espalhada por ${espalha.toFixed(1)} m: nao e uma linha`);
    }
});

test('a marcacao adversaria deixa de estar colada a area', () => {
    const S = GoalKickShape;
    const maisAdiantado = Math.min(...recebe.map(zAtk));   // o mais dentro do campo de quem bate
    const daLinhaDeFundo = maisAdiantado + LINHA_FUNDO;
    console.log(`  adversario mais adiantado a ${daLinhaDeFundo.toFixed(1)} m da linha de fundo de quem bate`);

    assert.ok(Math.abs(daLinhaDeFundo - S.frenteDoBloco) < 2.5,
        `o mais adiantado esta a ${daLinhaDeFundo.toFixed(1)} m (pedido ${S.frenteDoBloco})`);
    assert.ok(daLinhaDeFundo > Area.profundidade + 8,
        `marcacao a ${daLinhaDeFundo.toFixed(1)} m: ainda em cima da area`);
});

test('e ninguem do adversario dentro da grande area (Lei 16)', () => {
    const linhaZ = -attDir * LINHA_FUNDO;
    const dentro = recebe.filter(p =>
        Area.contem(p.model.position.x, p.model.position.z, linhaZ));
    assert.deepStrictEqual(dentro.map(p => p.pos), [],
        'adversarios dentro da area no tiro de meta');
});
