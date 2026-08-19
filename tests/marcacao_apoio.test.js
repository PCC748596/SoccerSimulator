/*
Tabela de distâncias de marcação (Defensive Pressure x setor) e tecto de
jogadores por estado de apoio.

Ambos são lidos do código-fonte real e executados num sandbox: os ficheiros
js/config.js e js/bt/player_bt.js são scripts de browser (globais, sem
module.exports), por isso extrai-se o bloco em causa em vez de o requerer.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const PLAYER_BT = fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8');

// Recorta `const NOME = { ... };` do topo do ficheiro (chaveta equilibrada).
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

/* ------------------------------------------------------------------ */

function montarApoio(distanciasAoLongoDoZ) {
    // Bola na origem; cada jogador a `d` metros dela, todos do mesmo lado.
    const bola = { x: 0, y: 0, z: 0 };
    const equipa = distanciasAoLongoDoZ.map((d, i) => ({
        id: i,
        role: 'mid',
        dirZ: 1,
        model: {
            position: {
                x: d, y: 0, z: 10,
                distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
            }
        }
    }));
    const sandbox = { Match: { ball: { position: bola }, ballCarrier: null } };
    vm.createContext(sandbox);
    // Um só script: `const` dentro do vm é lexical e não vira propriedade do
    // sandbox, por isso o modelo e a função têm de partilhar o mesmo scope.
    vm.runInContext(
        recortarConst(CONFIG, 'SupportModel') + '\n' +
        recortarFuncao(PLAYER_BT, 'distDisputaApoio') + '\n' +
        recortarFuncao(PLAYER_BT, 'temVagaDeApoio') +
        '\nthis.f = temVagaDeApoio; this.SM = SupportModel;', sandbox);
    const ctx = (p) => ({ p, teammates: equipa, bb: { ballZ: 0 } });
    return { equipa, temVaga: (p) => sandbox.f(ctx(p), true), max: sandbox.SM.maxPorLado, sandbox };
}

test('apoio: tecto é 2 por lado', () => {
    assert.strictEqual(montarApoio([1]).max, 2);
});

test('apoio: só os 2 mais perto da bola ficam com vaga', () => {
    // Distâncias crescentes: 0 e 1 são os mais perto.
    const { equipa, temVaga } = montarApoio([1, 2, 3, 4, 5]);
    const comVaga = equipa.filter(temVaga).map(p => p.id);
    assert.deepStrictEqual(comVaga, [0, 1]);
});

test('apoio: ordem da lista não altera quem fica com a vaga', () => {
    const { equipa, temVaga } = montarApoio([5, 1, 4, 2, 3]);
    const comVaga = equipa.filter(temVaga).map(p => p.id);
    assert.deepStrictEqual(comVaga, [1, 3]); // os de distância 1 e 2
});

test('apoio: empate exacto desempata pelo id e não dá 3 vagas', () => {
    const { equipa, temVaga } = montarApoio([2, 2, 2, 2]);
    const comVaga = equipa.filter(temVaga).map(p => p.id);
    assert.deepStrictEqual(comVaga, [0, 1]);
});

test('apoio: com 2 ou menos candidatos todos têm vaga', () => {
    const { equipa, temVaga } = montarApoio([3, 7]);
    assert.strictEqual(equipa.filter(temVaga).length, 2);
});

test('apoio: o portador não ocupa vaga', () => {
    const { equipa, temVaga, sandbox } = montarApoio([1, 2, 3, 4]);
    // Sem portador, os dois mais perto (0 e 1) levam as vagas.
    assert.deepStrictEqual(equipa.filter(temVaga).map(p => p.id), [0, 1]);
    // Com o 0 a conduzir, ele deixa de contar e a vaga dele passa ao 2.
    // (O próprio portador nunca chega aqui no jogo — o BT manda-o para o
    // ramo ComBola muito antes do actHoldPosition — por isso a pergunta só
    // se faz aos restantes.)
    sandbox.Match.ballCarrier = equipa[0];
    const semPortador = equipa.filter(p => p !== equipa[0]);
    assert.deepStrictEqual(semPortador.filter(temVaga).map(p => p.id), [1, 2]);
});

test('apoio: jogadores do outro lado da bola não gastam vaga', () => {
    const { equipa, temVaga } = montarApoio([1, 2, 3, 4]);
    // Todos estão em z=10 > ballZ=0, logo do mesmo lado (aFrenteDaBola=true).
    // Empurrar dois para trás da bola liberta as vagas deles.
    equipa[0].model.position.z = -10;
    equipa[1].model.position.z = -10;
    const comVaga = equipa.filter(p => p.model.position.z > 0).filter(temVaga).map(p => p.id);
    assert.deepStrictEqual(comVaga, [2, 3]);
});

/* ------------------------------------------------------------------ */

/*
Apoio junto da bola: alvoDeApoio encurta o raio ao slot do bloco, e a
vantagem do ocupante impede a vaga de trocar de dono a meio da corrida.
*/
function montarAlvoApoio(alvoX, alvoZ, dirZ) {
    const p = {
        dirZ: dirZ === undefined ? 1 : dirZ,
        dynamicTarget: {
            x: alvoX, y: 0, z: alvoZ,
            set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        }
    };
    const sandbox = {
        Math,
        ALTURA_BASE_Y: 0,
        Match: { ball: { position: { x: 0, y: 0, z: 0 } } }
    };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'SupportModel') + '\n' +
        recortarFuncao(PLAYER_BT, 'alvoDeApoio') +
        '\nthis.f = alvoDeApoio; this.SM = SupportModel;', sandbox);
    return { p, aplicar: (aFrente) => sandbox.f(p, aFrente), SM: sandbox.SM };
}

const distBola = (p) => Math.hypot(p.dynamicTarget.x, p.dynamicTarget.z);

test('apoio: raio máximo à bola é 7m', () => {
    const { SM } = montarAlvoApoio(0, 0);
    assert.strictEqual(SM.raioMax, 7.0);
});

test('apoio: alvo a 20m da bola é puxado para 7m', () => {
    const { p, aplicar } = montarAlvoApoio(0, 20);
    aplicar(true);
    assert.ok(Math.abs(distBola(p) - 7) < 1e-9, 'ficou a ' + distBola(p));
});

test('apoio: encurtar mantém a direcção do slot', () => {
    // slot na diagonal: 15m em x e 15m em z
    const { p, aplicar } = montarAlvoApoio(15, 15);
    aplicar(true);
    assert.ok(Math.abs(distBola(p) - 7) < 1e-9);
    // x e z continuam iguais entre si -> mesma direcção
    assert.ok(Math.abs(p.dynamicTarget.x - p.dynamicTarget.z) < 1e-9);
    assert.ok(p.dynamicTarget.x > 0 && p.dynamicTarget.z > 0);
});

test('apoio: alvo demasiado colado à bola é afastado para o mínimo', () => {
    const { p, aplicar, SM } = montarAlvoApoio(0, 1.0);
    aplicar(true);
    assert.ok(Math.abs(distBola(p) - SM.raioMin) < 1e-9, 'ficou a ' + distBola(p));
});

test('apoio: alvo já dentro da janela não é mexido', () => {
    const { p, aplicar } = montarAlvoApoio(0, 5);
    aplicar(true);
    assert.ok(Math.abs(distBola(p) - 5) < 1e-9);
});

test('apoio: alvo em cima da bola resolve pela frente de ataque', () => {
    const frente = montarAlvoApoio(0, 0, 1);
    frente.aplicar(true);
    assert.ok(frente.p.dynamicTarget.z > 0, 'apoio da frente fica à frente');

    const tras = montarAlvoApoio(0, 0, 1);
    tras.aplicar(false);
    assert.ok(tras.p.dynamicTarget.z < 0, 'apoio de trás fica atrás');
});

test('apoio: com dirZ negativo a frente é o outro lado', () => {
    const { p, aplicar } = montarAlvoApoio(0, 0, -1);
    aplicar(true);
    assert.ok(p.dynamicTarget.z < 0);
});

/* ------------------------------------------------------------------ */

function montarDisputa() {
    const sandbox = { Math };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'SupportModel') + '\n' +
        recortarFuncao(PLAYER_BT, 'distDisputaApoio') +
        '\nthis.f = distDisputaApoio; this.SM = SupportModel;', sandbox);
    const bola = { x: 0, y: 0, z: 0 };
    const jog = (d, ocupante) => ({
        apoioAtivo: !!ocupante,
        model: { position: { x: d, y: 0, z: 0,
            distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); } } }
    });
    return { d: (dist, ocup) => sandbox.f(jog(dist, ocup), bola), SM: sandbox.SM };
}

test('apoio: ocupante conta como estando 2.5m mais perto', () => {
    const { d, SM } = montarDisputa();
    assert.strictEqual(SM.bonusOcupante, 2.5);
    assert.strictEqual(d(10, false), 10);
    assert.strictEqual(d(10, true), 7.5);
});

test('apoio: quem já apoia só perde a vaga para alguém bem mais perto', () => {
    const { d } = montarDisputa();
    // rival a 8m não tira a vaga a quem apoia de 10m
    assert.ok(d(8, false) > d(10, true), 'nao devia trocar por 2m de diferenca');
    // rival a 7m já tira
    assert.ok(d(7, false) < d(10, true), 'devia trocar com 3m de diferenca');
});
