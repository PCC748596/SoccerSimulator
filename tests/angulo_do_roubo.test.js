/*
DE QUE ÂNGULO SE PODE TIRAR A BOLA A QUEM A TEM.

Relato: *"O Atacante está roubando a bola do goleiro por trás do goleiro. Com o
corpo do goleiro entre ele e a bola. Isso é impossível de acontecer... Só é
possivel roubar a bola em uma marcação normal se o jogador adversário estiver
num angulo de até 45 de frente com o jogador que tem a bola e de 46-80 graus
utilizando o carrinho. Fora isso tem que ser impossível roubar a bola do
adversário."*

HAVIA UMA GUARDA, E ESTAVA EM UM DOS TRÊS CAMINHOS. Tirar a bola a alguém
acontece em três sítios, e só o primeiro a verificava:

    resolveBallContact  (match_physics.js)  a disputa por proximidade
    TACKLE              (fsm.js)            o desarme em pé
    SLIDE_TACKLE        (fsm.js)            o deslize

Os dois desarmes resolvem o roubo À MÃO e nunca passam pela disputa. Medido com
`tools/lab/roubo_angulo.js`: dos roubos fora do ângulo permitido com a bola
ainda no pé do dono, **14 em 22 mudavam de dono por um caminho que a guarda não
via**.

E os limites eram mais largos do que o pedido:

    disputa      cos -0.5   = 120 graus
    desarme      dotAngle >= 0 = 90 graus, escrito a mão
    deslize      idem
    pedido       45 sem carrinho, 80 com

Medido em 15 min, três sementes, antes e depois:

                                    antes         depois
    sem carrinho acima de 45 graus   29%      20 a 21%
    com carrinho acima de 80 graus    3%       0 a 2%
    roubos ao guarda-redes fora
    do angulo                        —        0 em todas

Os 20% que sobram não são infracções: a maioria tem a bola **já sobrada** do
pé do dono (acima de `rouboPorTras.bolaSolta`), e aí ela é de quem chegar — é
a diferença entre tirar a bola do pé a alguém e recolher uma que já lhe fugiu.
Dos que restam, quase todos são a diferença de um frame entre o instante do
contacto (onde a guarda mede) e o instante em que o dono muda (onde o medidor
mede).

Este teste prende a forma da regra, não os números do lote.

Corre com: node tests/angulo_do_roubo.test.js
*/
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const erro = (m) => { falhas++; console.error('  X ' + m); };
const ok = (m) => console.log('  . ' + m);

const graus = (cos) => Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;

/* ------------------------------------------------------------------ */
console.log(LF + '1 — os dois limites sao os pedidos');
{
    const cfg = ler('js/config/player_behavior.js');
    /*
    A DEFINICAO, e nao a palavra: ancorada no inicio da linha e com a virgula
    no fim. O comentario que explica a guarda traz um `anguloCos: -2` como
    exemplo de como a desligar, e sem a ancora era esse que o teste lia — cos
    -2 da 180 graus, e o teste acusava um limite que nao existe no codigo.
    */
    const semCarrinho = Number((cfg.match(/^\s*anguloCos:\s*(-?[\d.]+),/m) || [])[1]);
    const comCarrinho = Number((cfg.match(/^\s*anguloCosCarrinho:\s*(-?[\d.]+),/m) || [])[1]);

    if (!isFinite(semCarrinho)) erro('o rouboPorTras ficou sem `anguloCos`');
    else {
        const g = graus(semCarrinho);
        ok(`sem carrinho: cos ${semCarrinho} = ${g.toFixed(0)} graus`);
        if (Math.abs(g - 45) > 2) erro(`sem carrinho devia ser 45 graus, e ${g.toFixed(0)}`);
        else ok('sao os 45 graus pedidos');
    }

    if (!isFinite(comCarrinho)) erro('o rouboPorTras ficou sem `anguloCosCarrinho`');
    else {
        const g = graus(comCarrinho);
        ok(`com carrinho: cos ${comCarrinho} = ${g.toFixed(0)} graus`);
        if (Math.abs(g - 80) > 2) erro(`com carrinho devia ser 80 graus, e ${g.toFixed(0)}`);
        else ok('sao os 80 graus pedidos');
    }

    if (isFinite(semCarrinho) && isFinite(comCarrinho) && comCarrinho >= semCarrinho)
        erro('o limite do carrinho nao e mais largo que o normal — o carrinho deixa de servir para nada');
    else if (isFinite(semCarrinho) && isFinite(comCarrinho))
        ok('o carrinho abre o angulo, como a regra manda');
}

/* ------------------------------------------------------------------ */
console.log(LF + '2 — a regra vive num sitio so, e os tres caminhos usam-na');
{
    const utils = ler('js/utils.js');
    if (!/function podeTirarABola/.test(utils))
        erro('nao existe `podeTirarABola` — a regra volta a estar copiada por tres sitios');
    else ok('existe o `podeTirarABola` em utils.js');
    if (!/function emCarrinho/.test(utils))
        erro('nao existe `emCarrinho`, que distingue qual dos dois limites vale');
    else ok('existe o `emCarrinho`');

    for (const [ficheiro, nome] of [
        ['js/match/match_physics.js', 'a disputa por proximidade'],
        ['js/fsm.js', 'os desarmes da FSM'],
    ]) {
        if (!/podeTirarABola\(/.test(ler(ficheiro)))
            erro(`${nome} (${ficheiro}) nao chama o podeTirarABola`);
        else ok(`${nome} chama o podeTirarABola`);
    }

    /*
    OS DOIS DESARMES, cada um por si: o desarme em pé e o deslize sao ramos
    diferentes da FSM, e tapar so um deixava o outro a roubar de qualquer
    angulo. Foi assim que o defeito sobreviveu a primeira correccao.
    */
    const fsm = ler('js/fsm.js');
    const chamadas = (fsm.match(/podeTirarABola\(/g) || []).length;
    if (chamadas < 2)
        erro(`a fsm.js so chama o podeTirarABola ${chamadas} vez(es): ` +
            'o desarme em pe e o deslize sao dois ramos e precisam os dois da guarda');
    else ok(`a fsm.js chama-o ${chamadas} vezes (desarme em pe e deslize)`);

    // E os limiares escritos a mao nao podem voltar.
    if (/const venceuTackle = dotAngle >= 0 &&/.test(fsm))
        erro('o desarme em pe voltou ao limite de 90 graus escrito a mao');
    else ok('o desarme em pe ja nao tem o limite escrito a mao');
    if (/slideAngleOk = \(cFwd\.x \* toDef\.x \+ cFwd\.z \* toDef\.z\) >= 0;/.test(fsm))
        erro('o deslize voltou ao limite de 90 graus escrito a mao');
    else ok('o deslize ja nao tem o limite escrito a mao');
}

/* ------------------------------------------------------------------ */
console.log(LF + '3 — a conta, exercitada');
{
    // O utils.js instancia vectores do THREE ao carregar.
    const amb = { console, window: {}, THREE: require('three') };
    const mod = new Function(...Object.keys(amb),
        ler('js/config/physics.js') + LF +
        ler('js/config/gait.js') + LF +
        ler('js/config/player_behavior.js') + LF +
        ler('js/utils.js') + LF +
        'return { podeTirarABola, BallControl };')(...Object.values(amb));

    // Dono parado a olhar para +z; o ladrao colocado a um angulo dado.
    const dono = {
        model: { position: { x: 0, z: 0 }, rotation: { y: 0 } },
        velocity: { x: 0, z: 0, lengthSq: () => 0 }
    };
    const ladraoA = (g) => {
        const r = g * Math.PI / 180;
        return { model: { position: { x: Math.sin(r) * 2, z: Math.cos(r) * 2 } } };
    };

    const casos = [
        [0, false, true, 'de frente, sem carrinho'],
        [40, false, true, '40 graus, sem carrinho'],
        [50, false, false, '50 graus, sem carrinho'],
        [70, false, false, '70 graus, sem carrinho'],
        [70, true, true, '70 graus, COM carrinho'],
        [85, true, false, '85 graus, com carrinho'],
        [180, false, false, 'pelas costas, sem carrinho'],
        [180, true, false, 'pelas costas, com carrinho'],
    ];
    for (const [g, carrinho, esperado, nome] of casos) {
        const r = mod.podeTirarABola(dono, ladraoA(g), carrinho);
        if (r !== esperado)
            erro(`${nome}: devia ${esperado ? 'PODER' : 'NAO poder'} tirar a bola, e ${r ? 'pode' : 'nao pode'}`);
        else ok(`${nome}: ${esperado ? 'pode' : 'nao pode'}`);
    }
}

console.log(LF + (falhas
    ? 'FALHOU: ' + falhas + ' problema(s)'
    : 'OK: 45 graus sem carrinho, 80 com, e a mesma regra nos tres caminhos.'));
process.exit(falhas ? 1 : 0);
