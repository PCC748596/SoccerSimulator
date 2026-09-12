/*
A BOLA NAO ESTA NUM PONTO — ESTA NUM SEGMENTO.

O teste da defesa media `mao.distanceTo(bola.position)`: a mao contra a posicao
DAQUELE frame. A 25 m/s a bola anda 0.42 m entre frames e o raio de contacto
sao ~0.53 m (raioMao + raio da bola); nos remates fortes ela salta por cima da
mao sem nunca ficar perto em frame nenhum.

Isto nao se via enquanto o guarda-redes defendia com os bracos colados ao corpo
— a mao ficava em cima da linha da bola. Com os bracos a FRENTE (a pose
correcta, medida no rig) a mao passou a estar meio metro a frente do peito, e
o salto entre frames passou a decidir defesas: medido no lote de 30 jogos, a
conversao de remate enquadrado subiu de 44.3% para 57.1%.

Medido depois, no lab_gk com semente, tres sementes de 300 remates:

    varrimento    semente 0   1       2       media
    COM             20.5%   30.6%   38.3%   29.8%
    SEM (ponto)     31.3%   36.1%   37.5%   35.0%

Corre com: node tests/gk_varre_o_trajecto.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

const srcUtils = ler('js/utils.js');
const i = srcUtils.indexOf('function distanciaAoSegmento');
if (i < 0) throw new Error('distanciaAoSegmento nao encontrada em js/utils.js');
const distanciaAoSegmento = (new Function(
    srcUtils.slice(i, srcUtils.indexOf(LF + '}', i) + 2) + '; return distanciaAoSegmento;'))();

console.log('');
console.log('1 — a geometria');
{
    // Ponto em cima do segmento.
    const emCima = distanciaAoSegmento(0, 0, 5, 0, 0, 0, 0, 0, 10);
    if (Math.abs(emCima) > 1e-9) erro(`ponto no meio do segmento devia dar 0 e deu ${emCima}`);
    else ok('ponto sobre o segmento: 0');

    // Perpendicular ao meio.
    const lado = distanciaAoSegmento(2, 0, 5, 0, 0, 0, 0, 0, 10);
    if (Math.abs(lado - 2) > 1e-9) erro(`perpendicular de 2 m deu ${lado}`);
    else ok('perpendicular ao meio: a distancia certa');

    // Alem da ponta: passa a valer a distancia A PONTA, nao a recta infinita.
    const alem = distanciaAoSegmento(0, 0, 20, 0, 0, 0, 0, 0, 10);
    if (Math.abs(alem - 10) > 1e-9) erro(`alem da ponta devia dar 10 e deu ${alem}`);
    else ok('alem da ponta: mede-se a ponta, nao a recta');

    // Bola parada: o segmento degenera no ponto.
    const parada = distanciaAoSegmento(3, 0, 0, 0, 0, 0, 0, 0, 0);
    if (Math.abs(parada - 3) > 1e-9) erro(`com a bola parada devia dar 3 e deu ${parada}`);
    else ok('segmento degenerado: e o ponto');
}

console.log('');
console.log('2 — o caso que motivou isto: a bola que salta a mao');
{
    /*
    Remate forte ao longo de z, a passar a 52 cm do lado da mao — dentro do
    raio de contacto de 53 cm, portanto uma defesa. Num frame de 1/60 s a bola
    anda 0.60 m: comeca 30 cm ANTES da mao e acaba 30 cm DEPOIS dela, e em
    NENHUM dos dois instantes esta a menos de 0.60 m. E este o furo.
    */
    const maoX = 0.52, maoY = 1.0, maoZ = 0;
    const az = -0.30, bz = 0.30;

    const porPonto = Math.min(
        Math.hypot(maoX - 0, maoY - 1.0, maoZ - az),
        Math.hypot(maoX - 0, maoY - 1.0, maoZ - bz));
    const porSegmento = distanciaAoSegmento(maoX, maoY, maoZ, 0, 1.0, az, 0, 1.0, bz);

    const raioContacto = 0.53;   // GoalkeeperDive.raioMao + BallPhysics.raio
    if (!(porPonto > raioContacto)) {
        erro(`o cenario nao reproduz o defeito: por ponto deu ${porPonto.toFixed(2)} m, dentro do raio`);
    } else ok(`pela posicao do frame: ${porPonto.toFixed(2)} m — fora do raio de ${raioContacto}, nao defende`);

    if (!(porSegmento <= raioContacto)) {
        erro(`pelo trajecto deu ${porSegmento.toFixed(2)} m: continua a escapar`);
    } else ok(`pelo trajecto: ${porSegmento.toFixed(2)} m — dentro do raio, defende`);
}

console.log('');
console.log('3 — os dois sitios da defesa varrem o trajecto');
{
    const srcDive = ler('js/gk_dive.js');
    const srcPlayer = ler('js/player.js');

    if (!/distanciaAoSegmento/.test(srcDive)) {
        erro('o mergulho (GkDive.defender) voltou a medir contra a posicao do frame');
    } else ok('o mergulho varre o trajecto');

    // Ancora no proprio calculo, e nao no inicio do estado: o bloco do 'maos'
    // e grande e a fatia por tamanho fixo nao chegava la.
    const iMao = srcPlayer.indexOf('let distMaoM = Infinity;');
    const bloco = (iMao < 0) ? '' : srcPlayer.slice(Math.max(0, iMao - 1200), iMao + 800);
    if (!/distanciaAoSegmento/.test(bloco)) {
        erro("a defesa de pe (estado 'maos') voltou a medir contra a posicao do frame");
    } else ok("a defesa de pe varre o trajecto");
}

console.log('');
if (falhas) {
    console.log(`gk_varre_o_trajecto: ${falhas} falha(s).`);
    process.exit(1);
}
console.log('OK: a defesa mede-se contra o caminho da bola, e nao contra uma fotografia dela.');
