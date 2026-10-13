/*
OS ÂNGULOS DO APOIO SAEM DO MODELO, E PODEM SER DIFERENTES POR POSIÇÃO.

O leque de pontos de apoio em volta do portador (`atribuirApoios`, utils.js) tinha
os ângulos escritos dentro da função: [-150, -110, ..., 150] para toda a gente.
Agora vêm do `SupportModel.circulacao.angulos`, e `angulosPorPosicao` deixa um
lateral ter um leque diferente do de um médio.

Duas garantias:
  1. SEM restrição, o comportamento é o de sempre (mesmo leque de nove ângulos);
  2. COM `angulos` no candidato, o ponto escolhido só sai desses ângulos.

Corre com: node tests/apoio_angulos_por_posicao.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcUtils = ler('js/utils.js');
const srcPassing = ler('js/config/passing.js');

function extrairObjecto(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    if (i < 0) throw new Error(`${nome} não encontrado`);
    const f = src.indexOf(LF + '};', i);
    return new Function(`${src.slice(i, f + 3)}; return ${nome};`)();
}

function corpoDaFuncao(src, nome) {
    const i = src.indexOf(`function ${nome}(`);
    if (i < 0) throw new Error(`${nome} não encontrada`);
    return src.slice(i, src.indexOf(LF + '}', i) + 2);
}

const apoios = new Function(
    ['linhaLivre', 'folgaDaLinha', 'notaPontoDeApoio', 'atribuirApoios']
        .map(n => corpoDaFuncao(srcUtils, n)).join(LF) + LF + 'return atribuirApoios;'
)();

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

const S = extrairObjecto(srcPassing, 'SupportModel');
const C = S.circulacao;

// --- o modelo ---------------------------------------------------------------
const antigos = [-150, -110, -70, -35, 0, 35, 70, 110, 150];
if (!Array.isArray(C.angulos) || C.angulos.join() !== antigos.join()) {
    erro('SupportModel.circulacao.angulos deve ser o leque de sempre: ' + antigos.join(', '));
} else ok('angulos por omissão = leque de sempre');

if (!C.angulosPorPosicao || typeof C.angulosPorPosicao !== 'object') {
    erro('SupportModel.circulacao.angulosPorPosicao em falta');
} else ok('angulosPorPosicao existe');

// --- a função ---------------------------------------------------------------
const base = angulos => ({
    portador: { x: 0, z: 0, dirZ: 1 },
    candidatos: [{ id: 1, slotX: 0, slotZ: 14, apoioActual: null, angulos: angulos }],
    adversarios: [],
    offsideLimitDir: null,
    maxApoios: 3, raioMin: 10, raioMax: 18, desvioMax: 100,
    margemLinha: 2, margemAdversario: 3,
    pesos: { pesoFolgaLinha: 1.2, pesoFolgaPonto: 1.0, pesoCusto: 0.5, folgaCap: 8 }
});
const grauDe = p => Math.round(Math.atan2(p.x, p.z) * 180 / Math.PI);

const livre = apoios(base(undefined));
if (livre.length !== 1) erro('sem restrição devia escolher um ponto');
else if (grauDe(livre[0]) !== 0) erro('sem restrição, o slot à frente devia dar o ponto a 0°, deu ' + grauDe(livre[0]) + '°');
else ok('sem restrição: ponto a 0° (como antes)');

const atras = apoios(base([-150, 150]));
if (atras.length !== 1) erro('com leque -150/150 devia escolher um ponto');
else if (Math.abs(grauDe(atras[0])) !== 150) erro('com leque -150/150 o ponto devia sair a ±150°, deu ' + grauDe(atras[0]) + '°');
else ok('leque -150/150: ponto a ' + grauDe(atras[0]) + '°');

const vazio = apoios(base([]));
if (vazio.length !== 0) erro('leque vazio não devia dar ponto nenhum');
else ok('leque vazio: sem apoio');

if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK');
