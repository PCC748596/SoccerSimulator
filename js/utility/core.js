/*
=============================================================================
UTILITY AI — MOTOR
=============================================================================
Motor de decisão por pontuação, partilhado pelo nível 3. Substitui o Selector
do Behavior Tree, que testava os ramos por ordem e executava o primeiro que
passasse — nunca comparando opções entre si.

Aqui todas as acções aplicáveis são pontuadas no MESMO frame, na MESMA escala
(0..1), e a escolha é feita entre elas.

Este ficheiro não sabe nada de futebol: não refere THREE, Match, window nem
nenhuma constante de config.js. É por isso o único testável em Node sem stubs
(ver tests/utility_core.test.js). Tudo o que é do jogo entra por `ctx`.
=============================================================================
*/

function clamp01(x) {
    if (!(x > 0)) return 0;        // apanha NaN também
    return x > 1 ? 1 : x;
}

/*
Curvas de resposta. Cada considerando normaliza uma medida do jogo para 0..1
e passa-a por uma destas.

A `logistica` é a que substitui a maior parte dos `if` binários do BT antigo:
uma zona de remate deixa de ser sim/não e passa a valer 0.35 aos 24 m e 0.9
aos 12 m.
*/
const Curvas = {
    linear: function (x, m, k) {
        return clamp01((m === undefined ? 1 : m) * x + (k === undefined ? 0 : k));
    },
    quad: function (x, m, k) {
        return clamp01((m === undefined ? 1 : m) * x * x + (k === undefined ? 0 : k));
    },
    inv: function (x, m, k) {
        return clamp01((k === undefined ? 1 : k) - (m === undefined ? 1 : m) * x);
    },
    logistica: function (x, k, c) {
        const kk = (k === undefined) ? 10 : k;
        const cc = (c === undefined) ? 0.5 : c;
        return clamp01(1 / (1 + Math.exp(-kk * (x - cc))));
    }
};

/*
Combina os considerandos por PRODUTO, não por soma.

Com soma, um considerando a zero é abafado pelos outros — é assim que se chega
a rematar de 40 m porque "estou livre" e "estou virado para o golo" somam alto.
Com produto, um zero mata a acção, que é o comportamento pretendido.

O produto puro tem o defeito simétrico: uma acção com quatro considerandos a
0.8 daria 0.41, pior do que duas a 0.7 (0.49), só por ter mais termos. A
compensação (Dave Mark, "Behavioral Mathematics") corrige isso — quantos mais
termos, mais o resultado é puxado de volta para cima.
*/
function combinarConsiderandos(valores) {
    const n = valores.length;
    if (!n) return 0;

    let produto = 1;
    for (let i = 0; i < n; i++) produto *= valores[i];
    if (produto === 0) return 0;

    const compensacao = 1 - 1 / n;
    const modificacao = (1 - produto) * compensacao;
    return clamp01(produto + modificacao * produto);
}

/*
Pontua UMA acção. A pré-condição é dura: se falhar, score 0 e nem se avaliam
os considerandos (é o que impede, por exemplo, calcular o alvo de cruzamento
para um central dentro da sua própria área).

Devolve sempre o mapa de considerandos avaliados — é o que o painel de debug
mostra para se perceber POR QUE é que uma acção perdeu, e não só que perdeu.
*/
function avaliarAccao(accao, ctx) {
    const detalhe = {};
    if (accao.pre && !accao.pre(ctx)) {
        return { nome: accao.nome, score: 0, accao: accao, considerandos: detalhe };
    }

    const valores = [];
    for (const chave in accao.considerandos) {
        const v = clamp01(accao.considerandos[chave](ctx));
        detalhe[chave] = v;
        valores.push(v);
    }

    return {
        nome: accao.nome,
        score: combinarConsiderandos(valores),
        accao: accao,
        considerandos: detalhe
    };
}

/*
Escolhe entre as candidatas: top-N dentro de uma margem do topo, e depois
sorteio ponderado pelo próprio score.

Isto substitui todos os `Math.random()` espalhados pelas folhas do BT antigo
(CrossModel.chanceMax, PassModel.carryChance, PassModel.throughBallChance, as
taxas por segundo do carrinho e do desarme). Lá, o sorteio decidia SE uma
opção acontecia, sem saber se era boa. Aqui só entram no sorteio as opções que
já provaram ser boas — a aleatoriedade dá variedade, não decide.

`margem = 1.0` reduz isto a argmax puro, útil para depurar sem tocar no código.
`rng` é injectável para os testes serem determinísticos.
*/
function escolherAccao(candidatas, margem, tamanhoPool, rng) {
    const sortear = rng || Math.random;

    const validas = candidatas.filter(c => c.score > 0.02);
    if (!validas.length) return null;

    validas.sort((a, b) => b.score - a.score);

    const corte = validas[0].score * margem;
    const pool = validas.filter(c => c.score >= corte).slice(0, tamanhoPool);
    if (pool.length === 1) return pool[0];

    let total = 0;
    for (const c of pool) total += c.score;

    let r = sortear() * total;
    for (const c of pool) {
        r -= c.score;
        if (r <= 0) return c;
    }
    return pool[0];
}

// Inerte no browser (`module` é undefined); serve o runner de testes do Node.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { clamp01, Curvas, combinarConsiderandos, avaliarAccao, escolherAccao };
}
