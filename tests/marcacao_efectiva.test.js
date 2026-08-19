/*
A marcação tem de ACONTECER, não só ser calculada.

Medido antes: com o homem a 15 m do slot do bloco, o marcador acabava a
9.9 m dele; a 25 m, acabava a 19 m. O tecto de desvio comia a marcação toda,
e só marcava quem já tivesse o homem ao lado. Em campo isso lê-se como "não
há marcação, toda a gente corre para a bola".

Depois disso a marcação deixou de ser um desvio e passou a ser A REGRA, num
sítio só (PositionAI.commit): quem tem homem atribuído fica sobre a recta
homem -> própria baliza, a MarkingModel.distancia metros dele. Sem tectos,
sem folha nenhuma a poder decidir que hoje não marca.

Estes testes correm essa geometria e verificam a posição FINAL.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const POS = fs.readFileSync(path.join(raiz, 'js', 'bt', 'position_bt.js'), 'utf8');

function recortarConst(src, nome) {
    const i = src.indexOf('const ' + nome + ' = {');
    assert.ok(i >= 0, 'const ' + nome + ' nao encontrado');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1) + ';';
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

function recortarFuncao(src, nome) {
    const i = src.indexOf('function ' + nome + '(');
    assert.ok(i >= 0, 'function ' + nome + ' nao encontrada');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

function montar(pressao) {
    const sandbox = {
        Math, CAMPO_COMP: 105,
        Tatics: { pressaoDefensiva: pressao || 'balanced' }
    };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'MarkingModel') + '\n' +
        recortarFuncao(POS, 'goalSide') +
        '\nthis.goalSide = goalSide; this.M = MarkingModel;', sandbox);
    return sandbox;
}

// Marcador em `slot`, homem em `homem`. Devolve o ponto onde ele acaba.
function alvoDeMarcacao(s, homem, ownGoalZ) {
    const p = { dirZ: ownGoalZ < 0 ? 1 : -1, ownGoalZ };
    const alvo = { model: { position: { x: homem[0], y: 0, z: homem[1] } } };
    const m = s.goalSide(p, alvo, s.M.distancia);
    return [m.x, m.z];
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* ------------------------------------------------------------------
   A distância pedida é a distância obtida — venha o homem de onde vier.
   ------------------------------------------------------------------ */

test('fica exactamente à distância pedida, esteja o homem onde estiver', () => {
    const s = montar();
    for (const homem of [[0, -30], [15, -10], [25, 5], [-30, 40], [2, -50]]) {
        const alvo = alvoDeMarcacao(s, homem, -52.5);
        assert.ok(Math.abs(dist(alvo, homem) - s.M.distancia) < 1e-9,
            'homem em ' + homem + ': ficou a ' + dist(alvo, homem).toFixed(2) + 'm');
    }
});

test('o caso que falhava: homem a 25m do slot', () => {
    // Antes o tecto de desvio deixava o marcador a 19 m do homem. A marcação
    // já não tem tecto: a distância é a mesma esteja ele perto ou longe.
    const s = montar();
    const alvo = alvoDeMarcacao(s, [15, -10], -52.5);
    assert.ok(Math.abs(dist(alvo, [15, -10]) - s.M.distancia) < 1e-9);
});

test('a distância de marcação é a mesma em qualquer Defensive Pressure', () => {
    // Passou a ser um número só (MarkingModel.distancia), a pedido, enquanto
    // se valida a marcação. Se voltar a diferenciar, este teste inverte-se.
    const dLow = dist(alvoDeMarcacao(montar('low'), [6, -25], -52.5), [6, -25]);
    const dHigh = dist(alvoDeMarcacao(montar('high'), [6, -25], -52.5), [6, -25]);
    assert.ok(Math.abs(dHigh - dLow) < 1e-9,
        'low (' + dLow.toFixed(2) + ') e high (' + dHigh.toFixed(2) + ') deviam ser iguais');
});

/* ------------------------------------------------------------------
   POR TRÁS: entre o homem e a NOSSA baliza. Não ao lado, não à frente.
   ------------------------------------------------------------------ */

test('o marcador fica do lado da PRÓPRIA baliza, não em cima do homem', () => {
    const s = montar();
    const homem = [4, -24];
    const alvo = alvoDeMarcacao(s, homem, -52.5);
    assert.ok(alvo[1] < homem[1], 'ficou à frente do homem em vez de atrás');
});

test('por trás vale para os dois sentidos de ataque', () => {
    const s = montar();
    const homem = [4, 24];
    const alvo = alvoDeMarcacao(s, homem, 52.5);   // equipa que defende o +Z
    assert.ok(alvo[1] > homem[1], 'ficou à frente do homem em vez de atrás');
});

test('está sobre a recta homem -> baliza, não só mais atrás em Z', () => {
    /*
    Para um homem em frente à baliza tanto faz, mas para um homem aberto no
    corredor um desvio só em Z põe o marcador AO LADO dele, com o caminho da
    baliza livre nas costas. O ponto tem de estar na recta.
    */
    const s = montar();
    const homem = [28, -20];
    const baliza = [0, -52.5];
    const alvo = alvoDeMarcacao(s, homem, -52.5);

    // Área do triângulo homem-baliza-alvo: zero se os três forem colineares.
    const area = Math.abs(
        (baliza[0] - homem[0]) * (alvo[1] - homem[1]) -
        (baliza[1] - homem[1]) * (alvo[0] - homem[0])) / 2;
    assert.ok(area < 1e-9, 'o marcador não está na recta homem-baliza');

    // E entre os dois, não do outro lado do homem.
    assert.ok(dist(alvo, baliza) < dist(homem, baliza),
        'o marcador está mais longe da baliza do que o homem');
});

/* ------------------------------------------------------------------
   A regra é única: não sobrou nenhuma folha a decidir se marca.
   ------------------------------------------------------------------ */

test('nenhuma folha do nível 2 marca por sua conta', () => {
    // Sem os comentários: a nota que explica a mudança fala em marcar().
    const semBloco = POS.split('/*').map((parte, i) => i === 0 ? parte : parte.split('*/').slice(1).join('*/')).join('');
    const codigo = semBloco.split('\n').map(l => l.split('//')[0]).join('\n');
    assert.ok(!codigo.includes('marcar(ctx'),
        'voltou a haver folhas a chamar marcar() — a marcação tem de viver só no commit');
});

test('o commit põe o marcador atrás do homem, sem condições', () => {
    const i = POS.indexOf('commit: function');
    const j = POS.indexOf('const dt =', i);
    assert.ok(i >= 0 && j > i);
    const corpo = POS.slice(i, j);
    assert.ok(/if \(p\.markingTarget\)/.test(corpo), 'o commit deixou de tratar a marcação');
    assert.ok(/goalSide\(p, p\.markingTarget, MarkingModel\.distancia\)/.test(corpo),
        'o commit não usa o goalSide com a distância do modelo');
});
