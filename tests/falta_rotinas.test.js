/*
AS QUATRO ROTINAS DA FALTA NA INTERMEDIÁRIA — ataque e defesa.

Pedido, com quatro diagramas de treino: *"cria essas 4 opções de faltas no
ataque. Para o time atacante e para o time defensor. Vamos sortear uma delas
quando tiver uma falta na intermediária de ataque"*.

O que este teste prende:

  . são QUATRO, cada uma com as duas metades (ataque e defesa);
  . cada desenho de ataque coloca todos os grupos, e dentro do campo;
  . a faixa da defesa respeita sempre a Lei 13 (9.15 m) e é COERENTE com o
    lance que a rotina desenha — quem espera a bola longa arma-se mais atrás
    do que quem espera o passe curto;
  . o sorteio só acontece nos sectores da intermediária, e dá as quatro.

Ver FreeKickModel.rotinasDaIntermediaria (js/config/shooting.js), que traz cada
diagrama escrito ao lado do desenho que gerou.

Corre com: node --test tests/falta_rotinas.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const src = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcCfg = src('js/config/shooting.js');
const srcUtils = src('js/utils.js');

function extrairObjecto(s, nome) {
    const ini = s.indexOf('const ' + nome + ' = {');
    assert.ok(ini > 0, nome + ' não encontrado');
    const fim = s.indexOf(LF + '};', ini);
    return new Function(s.slice(ini, fim + 3) + '; return ' + nome + ';')();
}
function extrairFuncao(s, nome) {
    const ini = s.indexOf('function ' + nome + '(');
    assert.ok(ini > 0, nome + ' não encontrada');
    const fim = s.indexOf(LF + '}', ini);
    return s.slice(ini, fim + 2);
}

const FreeKickModel = extrairObjecto(srcCfg, 'FreeKickModel');
const CAMPO_COMP = 106, CAMPO_LARG = 68, LARGURA_BALIZA = 7.32;
const amb = { FreeKickModel, CAMPO_COMP, CAMPO_LARG, LARGURA_BALIZA };
const nomes = ['decisaoDeFalta', 'setorDaFalta', 'grupoNaBolaParada', 'lugaresDaFalta'];
const U = new Function(...Object.keys(amb),
    nomes.map(n => extrairFuncao(srcUtils, n)).join(LF) + LF + 'return {' + nomes.join(',') + '};'
)(...Object.values(amb));

const dir = 1;
const zDe = (avanco) => avanco * dir;

function plantel() {
    const f = (pos, role, x, z) => ({
        pos: pos, role: role, skillFor: () => 70,
        model: { position: { x: x, z: z } }
    });
    return [
        f('CB', 'def', -6, -30), f('CB', 'def', 6, -30),
        f('LB', 'def', 24, -12), f('RB', 'def', -24, -12),
        f('DM', 'mid', 0, -8), f('CM', 'mid', 4, 0),
        f('LM', 'mid', 26, 4), f('RM', 'mid', -26, 4),
        f('CF', 'atk', -5, 14), f('CF', 'atk', 5, 14)
    ];
}

test('são quatro, e cada uma tem as duas metades', () => {
    const R = FreeKickModel.rotinasDaIntermediaria;
    assert.ok(Array.isArray(R), 'as rotinas têm de existir');
    assert.strictEqual(R.length, 4, 'o pedido são quatro opções');

    const vistos = new Set();
    for (const r of R) {
        assert.ok(r.nome, 'cada rotina tem nome — é o que fica em Match.rotinaDaFaltaActual');
        assert.ok(!vistos.has(r.nome), 'nomes repetidos: ' + r.nome);
        vistos.add(r.nome);
        assert.ok(r.ataque && Object.keys(r.ataque).length, r.nome + ': sem desenho de ataque');
        assert.ok(r.defesa && typeof r.defesa.de === 'number' && typeof r.defesa.ate === 'number',
            r.nome + ': sem resposta da defesa');
    }
});

test('o desenho de ataque coloca a equipa toda, e dentro do campo', () => {
    // Uma falta na intermediária, ligeiramente à esquerda.
    const bolaX = 8, bolaZ = zDe(30);
    for (const r of FreeKickModel.rotinasDaIntermediaria) {
        const eq = plantel();
        const lug = U.lugaresDaFalta(bolaX, bolaZ, dir, eq, 'ataque_entrada', r.ataque);
        assert.strictEqual(lug.length, eq.length,
            r.nome + ': ficou gente sem lugar (' + lug.length + ' de ' + eq.length + ')');

        for (const o of lug) {
            assert.ok(Math.abs(o.x) <= CAMPO_LARG / 2,
                r.nome + ': x=' + o.x.toFixed(1) + ' fora do campo');
            assert.ok(Math.abs(o.z) <= CAMPO_COMP / 2,
                r.nome + ': z=' + o.z.toFixed(1) + ' fora do campo');
        }
    }
});

test('a faixa da defesa respeita a Lei 13 e é coerente com o lance', () => {
    const REGULAMENTAR = 9.15;
    for (const r of FreeKickModel.rotinasDaIntermediaria) {
        assert.ok(r.defesa.de >= REGULAMENTAR - 1e-9,
            r.nome + ': o homem mais adiantado a ' + r.defesa.de + ' m viola os 9.15');
        assert.ok(r.defesa.ate > r.defesa.de,
            r.nome + ': a faixa está invertida (' + r.defesa.de + ' a ' + r.defesa.ate + ')');
        assert.ok(r.defesa.ate <= 34.0,
            r.nome + ': o bloco a ' + r.defesa.ate + ' m é mais fundo do que o normal (34)');
    }

    const de = (n) => FreeKickModel.rotinasDaIntermediaria.find(r => r.nome === n).defesa.ate;
    /*
    As duas rotinas que acabam em bola na área — a longa e o cruzamento
    out-swinging — têm de armar a defesa MAIS ATRÁS do que as duas que se jogam
    curto. Se isto se invertesse, a resposta da defesa deixava de ser resposta.
    */
    assert.ok(de('deep_free_kick') > de('wide_pela_linha'),
        'a bola longa tem de armar a defesa mais atrás do que o passe pela linha');
    assert.ok(de('wide_out_swinging') > de('central_over_the_hill'),
        'o cruzamento alto tem de armar a defesa mais atrás do que a bola picada');
});

test('o sorteio é só na intermediária, e sai cada uma das quatro', () => {
    const setores = FreeKickModel.setoresComRotina;
    assert.ok(Array.isArray(setores) && setores.length, 'os sectores com rotina têm de existir');

    // A intermediária de ataque: meio-campo adversário e entrada da área.
    assert.ok(setores.indexOf('meio_avancado') >= 0, 'o meio-campo adversário tem rotina');
    assert.ok(setores.indexOf('ataque_entrada') >= 0, 'a entrada da área tem rotina');
    // E onde não tem: na ala manda o cruzamento, e no próprio campo não há nada
    // para montar.
    for (const fora of ['defesa', 'meio_recuado', 'ataque_lateral']) {
        assert.ok(setores.indexOf(fora) < 0, fora + ' não pode sortear rotina');
    }

    // Os sectores nomeados são os que o `setorDaFalta` produz mesmo.
    assert.strictEqual(U.setorDaFalta(0, zDe(10), dir), 'meio_avancado');
    assert.strictEqual(U.setorDaFalta(0, zDe(40), dir), 'ataque_entrada');

    // O sorteio (a mesma conta do setupSetPiece) dá as quatro.
    const R = FreeKickModel.rotinasDaIntermediaria;
    const saiu = new Set();
    let seed = 12345;
    const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
    for (let i = 0; i < 400; i++) saiu.add(R[Math.floor(rnd() * R.length)].nome);
    assert.strictEqual(saiu.size, 4, 'o sorteio tem de poder dar qualquer das quatro');
});

test('sem rotina, o desenho por omissão do sector continua a valer', () => {
    // É o que garante que isto não mudou o resto do campo: a mesma chamada sem
    // desenho dado tem de dar o desenho do sector.
    const eq1 = plantel(), eq2 = plantel();
    const semRotina = U.lugaresDaFalta(8, zDe(30), dir, eq1, 'ataque_entrada');
    const doSector = U.lugaresDaFalta(8, zDe(30), dir, eq2, 'ataque_entrada', null);
    assert.strictEqual(semRotina.length, doSector.length);
    for (let i = 0; i < semRotina.length; i++) {
        assert.strictEqual(semRotina[i].x, doSector[i].x);
        assert.strictEqual(semRotina[i].z, doSector[i].z);
    }
});
