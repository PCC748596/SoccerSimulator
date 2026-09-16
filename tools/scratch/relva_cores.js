/*
QUE COR FICA EM CADA PONTO DO RELVADO.

Pedido: *"usa só a cor escura do gramado fora do campo de jogo"*. As faixas do
corte passaram a ser pintadas só dentro das linhas laterais e entre as linhas
de fundo — ver a construcao da textura no `createField` (match_setup.js).

COMO SE MEDE ISTO SEM ECRA: o canvas do harness headless e falso (o
`getImageData` devolve zeros, e uma primeira versao desta ferramenta deu tudo a
preto e "0 claras", que parecia certo e nao media nada). Aqui grava-se cada
`fillRect` com a cor que estava no `fillStyle`, e depois pergunta-se qual foi o
ultimo rectangulo a cobrir aquele pixel — que e exactamente o que o canvas faria.

Uso: node tools/scratch/relva_cores.js
*/
/*
UM REGISTO POR CANVAS, e nao um so: o jogo cria dezenas (as etiquetas dos
jogadores, o minimapa, a multidao). Uma primeira versao juntava tudo na mesma
lista e o pixel do relvado vinha `#e74c3c` — a cor da equipa vermelha, de uma
etiqueta pintada depois. Le-se so o registo do canvas que virou a textura da
relva.
*/
const registos = new Map();

// Intercepta o contexto 2d ANTES de o jogo construir a textura.
const harness = require('../headless/harness.js');
const criarOriginal = document.createElement.bind(document);
document.createElement = function (tag) {
    const el = criarOriginal(tag);
    if (String(tag).toLowerCase() !== 'canvas') return el;
    const ctxOriginal = el.getContext('2d');
    el.getContext = () => new Proxy(ctxOriginal, {
        get: (alvo, chave) => {
            if (chave === 'fillRect') {
                return (x, y, w, h) => {
                    if (!registos.has(el)) registos.set(el, []);
                    registos.get(el).push({ x, y, w, h, cor: el.__fill });
                };
            }
            return alvo[chave];
        },
        set: (alvo, chave, valor) => {
            if (chave === 'fillStyle') el.__fill = valor;
            alvo[chave] = valor;
            return true;
        }
    });
    return el;
};

const scene = new THREE.Scene();
Match.init(scene);

const cvs = window.relva.material.map.image;
const pintadas = registos.get(cvs) || [];
const LARG = cvs.width, ALT = cvs.height;
const gramaLarg = CAMPO_LARG + 52, gramaComp = CAMPO_COMP + 34;

// O ultimo rectangulo a cobrir o pixel e o que fica a vista.
const corEm = (x, z) => {
    const px = ((x + gramaLarg / 2) / gramaLarg) * LARG;
    const pz = ((z + gramaComp / 2) / gramaComp) * ALT;
    let cor = null;
    for (const r of pintadas) {
        if (px >= r.x && px < r.x + r.w && pz >= r.y && pz < r.y + r.h) cor = r.cor;
    }
    return cor ? String(cor).toLowerCase() : '(nada)';
};

const clara = RelvaCores.clara.toLowerCase(), escura = RelvaCores.escura.toLowerCase();
console.log('textura ' + LARG + 'x' + ALT + ' | ' + pintadas.length + ' rectangulos pintados');
console.log('clara=' + clara + '  escura=' + escura);

for (const [rot, x, z] of [
    ['dentro, meio do campo ', 0, 0],
    ['dentro, junto a lateral', 33, 10],
    ['FORA, ao lado da linha ', 36, 10],
    ['FORA, ao lado (longe)  ', 55, -20],
    ['FORA, atras da baliza  ', 0, 58],
    ['FORA, na esquina       ', 45, 60]
]) {
    console.log('  ' + rot + ' (' + String(x).padStart(3) + ',' + String(z).padStart(4) + ') -> ' + corEm(x, z));
}

let foraClaras = 0, foraEscuras = 0, dentroClaras = 0, dentroEscuras = 0;
for (let x = -58; x <= 58; x += 1) {
    for (let z = -68; z <= 68; z += 1) {
        const fora = (Math.abs(x) > CAMPO_LARG / 2 + 0.5 || Math.abs(z) > CAMPO_COMP / 2 + 0.5);
        const c = corEm(x, z);
        if (fora) { if (c === clara) foraClaras++; else foraEscuras++; }
        else { if (c === clara) dentroClaras++; else dentroEscuras++; }
    }
}
console.log('  FORA do campo: ' + foraEscuras + ' escuras, ' + foraClaras + ' claras  (claras tem de ser 0)');
console.log('  DENTRO:        ' + dentroEscuras + ' escuras, ' + dentroClaras +
    ' claras  (as duas > 0: e o corte as faixas)');
