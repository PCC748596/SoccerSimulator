/*
O GUARDA-REDES NAO CORRE MAIS DO QUE UM HUMANO, E NAO ARRANCA AO LEVANTAR-SE.

Relato: *"a bola passa pelo goleiro em uma velocidade elevada e o goleiro
consegue ir atras da bola numa velocidade maior que a bola e alcancar a bola.
O goleiro quando cai levanta praticamente instantaneamente e sai atras da bola.
Isso nao existe no futebol."*

O QUE ESTAVA MEDIDO, em 900 s de jogo:

    velocidade planar        p50     p99    maximo
    guarda-redes            0.68    7.50    17.01
    jogadores de campo      3.81    8.42    23.96

E a conta do config explicava-o: o ramo de reaccao ao remate da
`3.0 + ((85-50)/50)*6.0 = 7.2` m/s e a agilidade multiplica por
`1.5 * (1 + 0.7*0.25) = 1.76` — 12.7 m/s, sem nada por cima. Pior era o estado
'maos', que ficou com o lerp exponencial (`lerpTo(x, alvo, 0.12)`) que os
outros ramos ja tinham perdido: 12% do que falta por frame, com o alvo a 3 m,
da 0.36 m NUM frame, ou seja 21.6 m/s. Medido: 22.75.

O QUE ESTE TESTE FIXA:

1. O tecto existe na configuracao e esta em valores humanos.
2. Os DOIS ramos que deslocam o guarda-redes o respeitam — o de
   reposicionamento e o do estado 'maos'. Era a divergencia entre ramos que
   criou o defeito da primeira vez.
3. Um mergulho deixa-o a recompor-se: ao levantar-se nao arranca a 100%.

Corre com: node tests/gk_velocidade_humana.test.js
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

const srcCfg = ler('js/config/goalkeeper.js');
const srcPlayer = ler('js/player.js');
const srcDive = ler('js/gk_dive.js');

const numero = (src, nome) => {
    const m = src.match(new RegExp(nome + ':\\s*([0-9.]+)'));
    return m ? Number(m[1]) : null;
};

console.log('');
console.log('1 — o tecto existe, e e humano');
{
    const base = numero(srcCfg, 'velMaxCorrida');
    const porSkill = numero(srcCfg, 'velMaxCorridaSkill');
    if (base === null) {
        erro('GoalkeeperPose.velMaxCorrida desapareceu — sem ele nao ha tecto nenhum');
    } else if (base < 6.0) {
        erro(`tecto de ${base} m/s: e mais lento do que um defesa a trotar`);
    } else if (base > 9.0) {
        erro(`tecto de ${base} m/s: acima disto volta a ser sobre-humano (p99 dos jogadores de campo e 8.4)`);
    } else ok(`tecto a ${base} m/s, +/- ${porSkill} pela skill`);

    // O maximo absoluto, com GK 100.
    const tectoMax = base + (porSkill || 0);
    if (tectoMax > 9.5) {
        erro(`a GK 100 o tecto vai a ${tectoMax.toFixed(1)} m/s — Usain Bolt faz 12.4 em pico`);
    } else ok(`a GK 100 o tecto e ${tectoMax.toFixed(1)} m/s`);
}

console.log('');
console.log('2 — os DOIS ramos que o deslocam respeitam o tecto');
{
    const usos = (srcPlayer.match(/velMaxCorrida/g) || []).length;
    if (usos < 2) {
        erro(`so ${usos} sitio(s) leem o tecto — foi a divergencia entre ramos que criou o defeito`);
    } else ok(`${usos} leituras do tecto no player.js`);

    /*
    O ramo 'maos' nao pode voltar ao lerp exponencial puro: e o que dava os
    22.75 m/s medidos.
    */
    const iMaos = srcPlayer.indexOf("gkEstado === 'maos'");
    const bloco = srcPlayer.slice(iMaos, iMaos + 3000);
    if (/position\.x = lerpTo\(gkCorpo\.position\.x, this\.gkAlvoX/.test(bloco)) {
        erro("o estado 'maos' voltou ao lerp exponencial sem limite de velocidade");
    } else ok("o estado 'maos' anda com passo limitado");
}

console.log('');
console.log('3 — quem mergulha levanta-se a recompor-se');
{
    const rec = numero(srcCfg, 'recuperacao');
    const recVel = numero(srcCfg, 'recuperacaoVel');
    if (rec === null || recVel === null) {
        erro('GoalkeeperDive.recuperacao/recuperacaoVel desapareceram');
    } else if (rec <= 0) {
        erro('recuperacao a zero: levanta-se e arranca no mesmo frame, que e o relato');
    } else if (recVel >= 1) {
        erro(`recuperacaoVel a ${recVel}: arranca a 100%, ou seja nao ha recuperacao nenhuma`);
    } else ok(`${rec} s a recompor-se, a arrancar a ${(recVel * 100).toFixed(0)}%`);

    // E o fim do mergulho tem de a escrever, senao a configuracao nao vale nada.
    if (!/gkRecuperacao\s*=/.test(srcDive)) {
        erro('o fim do mergulho nao escreve o gkRecuperacao — a janela nunca comeca');
    } else ok('o fim do mergulho arma a janela');

    if (!/this\.gkRecuperacao > 0/.test(srcPlayer)) {
        erro('o updateGK nao gasta a janela — ela ficaria armada para sempre');
    } else ok('o updateGK gasta a janela e escala a velocidade');
}

console.log('');
if (falhas) {
    console.log(`gk_velocidade_humana: ${falhas} falha(s).`);
    process.exit(1);
}
console.log('OK: o guarda-redes corre como gente, e levanta-se como gente.');
