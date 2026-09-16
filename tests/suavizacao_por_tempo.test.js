/*
A SUAVIZAÇÃO CONTA O TEMPO, E NÃO AS CHAMADAS.

`lerpTo(atual, alvo, v)` puxava 15% por CHAMADA. Quem o chama é o
`animateBones`, que corre dentro do `Match.update` — e o `Match.update` corre
uma ou duas vezes por frame, conforme o tempo do frame (ver `partirPasso`).
Medido no harness, antes desta correcção:

    1 passo de 16.7 ms    lArm.x 1.0000 -> 0.8500
    1 passo de  0.2 ms    lArm.x 1.0000 -> 0.8500    <- 80x menos tempo, mesmo salto
    2 passos de 16.7 ms   lArm.x 1.0000 -> 0.7225

Com o ritmo a depender do número de chamadas, a mesma animação avançava a
velocidades diferentes conforme os fps — o micro-atraso relatado.

A conversão é `v_ef = 1 - (1-v)^(dt*60)`: a 60 fps devolve exactamente o `v`
de sempre, portanto nenhum valor afinado à mão muda de significado.

Corre com: node tests/suavizacao_por_tempo.test.js
*/
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(RAIZ, 'js', 'utils.js'), 'utf8');

/*
Carrega o código de PRODUÇÃO, não uma cópia: o pedaço do utils.js que vai da
cache do factor até ao fim do `lerpTo` — estado incluído, que é parte do que
se está a testar.
*/
function fimDe(nome) {
    const i = src.indexOf('function ' + nome);
    if (i < 0) throw new Error(nome + ' não existe em js/utils.js');
    let nivel = 0, comecou = false;
    for (let k = i; k < src.length; k++) {
        if (src[k] === '{') { nivel++; comecou = true; }
        else if (src[k] === '}') { nivel--; if (comecou && nivel === 0) return k + 1; }
    }
    throw new Error(nome + ' sem fecho');
}
const inicio = src.indexOf('let _lerpDtCache');
if (inicio < 0) throw new Error('a cache do factor de suavização não existe em js/utils.js');
const codigo = src.slice(inicio, fimDe('lerpTo'));
const { fatorSuavizacao, lerpTo } = new Function(
    codigo + '; return { fatorSuavizacao: fatorSuavizacao, lerpTo: lerpTo };')();

let falhas = 0;
function exigir(cond, msg) {
    if (!cond) { console.log('FALHA: ' + msg); falhas++; }
    else console.log('ok: ' + msg);
}
const perto = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);

const DT60 = 1 / 60;

// 1. A 60 fps nada muda: é o contrato que deixa os valores afinados de pé.
{
    exigir(perto(fatorSuavizacao(0.15, DT60), 0.15, 1e-12), 'v=0.15 a 60 fps continua 0.15');
    exigir(perto(fatorSuavizacao(0.05, DT60), 0.05, 1e-12), 'v=0.05 a 60 fps continua 0.05');
    exigir(perto(lerpTo(1.0, 0, 0.15, DT60), 0.85, 1e-12), 'lArm 1.0000 -> 0.8500 como sempre');
}

// 2. O defeito, ao contrário: um passo minúsculo move quase nada.
{
    const depois = lerpTo(1.0, 0, 0.15, 0.0002);
    exigir(depois > 0.99, 'passo de 0.2 ms quase não mexe (' + depois.toFixed(4) + ')');
    exigir(depois < 1.0, 'mas mexe alguma coisa');
}

// 3. PARTIR O PASSO NÃO MUDA O RESULTADO — é isto que mata o micro-atraso:
//    dois meios-passos têm de dar o mesmo que um passo inteiro.
{
    const inteiro = lerpTo(1.0, 0, 0.15, DT60);
    const meio = lerpTo(lerpTo(1.0, 0, 0.15, DT60 / 2), 0, 0.15, DT60 / 2);
    exigir(perto(inteiro, meio, 1e-12),
        'um passo de 16.7 ms == dois de 8.3 ms (' + inteiro.toFixed(6) + ' vs ' + meio.toFixed(6) + ')');
}

// 4. Frame lento: o dobro do tempo aproxima mais, e nunca ultrapassa o alvo.
{
    const rapido = lerpTo(1.0, 0, 0.15, DT60);
    const lento = lerpTo(1.0, 0, 0.15, DT60 * 2);
    exigir(lento < rapido, 'frame de 33 ms aproxima mais do que o de 16.7 ms');
    exigir(lento >= 0, 'e nunca passa para o outro lado do alvo');
}

// 5. dt = 0 é tempo nenhum: não se mexe.
{
    exigir(perto(lerpTo(1.0, 0, 0.15, 0), 1.0), 'dt = 0 não mexe');
}

// 6. Sem dt nenhum (editor de animação, código fora do Match) assume 60 fps —
//    o comportamento de sempre, e não uma divisão por indefinido.
{
    exigir(perto(lerpTo(1.0, 0, 0.15), 0.85, 1e-12), 'sem dt, comporta-se como a 60 fps');
}

// 7. O encosto final mantém-se: a suavização exponencial nunca chega ao alvo
//    sozinha, e sem isto ficava eternamente a 0.0009 dele.
{
    exigir(lerpTo(0.0005, 0, 0.15, DT60) === 0, 'encosta ao alvo quando já lá está quase');
}

console.log(falhas === 0 ? 'PASSOU' : 'FALHOU (' + falhas + ')');
process.exit(falhas === 0 ? 0 : 1);
