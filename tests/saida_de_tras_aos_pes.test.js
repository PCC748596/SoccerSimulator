/*
A SAÍDA DE TRÁS JOGA-SE AOS PÉS.

Relato: "os zagueiros estão chutando longos lançamentos para frente na
mentalidade equilibrada com vários jogadores de meio, meio pela lateral e
laterais para sair jogando".

Medido, 20 minutos de jogo (Equilibrada / Positional), com a distância do passe
tomada até ao PONTO DE MIRA e não até ao companheiro:

    CB   63 passes   média 21.4 m   33% >= 25 m   57% no espaço
    RB   33 passes   média 19.0 m   24% >= 25 m   67% no espaço

Um central a jogar 57% das bolas para o espaço à frente de alguém não está a
sair a jogar — está a pô-la lá à frente. A causa não estava na escolha de QUEM
recebe, mas na de COMO: o `PassTypeModel.regras` não tinha regra nenhuma para
a origem no terço defensivo, e a saída de trás caía no `centroParaCentro` /
`misturaPadrao`, que valem 0.30 de bola aos pés — ou seja 70% no espaço. Essas
duas foram afinadas para a progressão no meio-campo, onde o receptor já está
em movimento; atrás, o receptor está parado, de frente e sem pressão, e joga-se
ao pé dele.

A regra `defParaAtk` continua por cima desta: um central que salta o meio-campo
inteiro está a fazer uma bola longa de propósito, e essa não se joga aos pés a
40 m. O que esta regra apanha é o resto — def->def e def->mid, que é a saída a
jogar.

Corre com: node tests/saida_de_tras_aos_pes.test.js
*/
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const cfg = fs.readFileSync(path.join(RAIZ, 'js', 'config', 'passing.js'), 'utf8');
const tipos = fs.readFileSync(path.join(RAIZ, 'js', 'pass_types.js'), 'utf8');

// PassTypeModel de produção (tem `quando` a referir-se a si próprio pelo nome).
const iModelo = cfg.indexOf('const PassTypeModel');
if (iModelo < 0) throw new Error('PassTypeModel não existe em js/config/passing.js');
const fimModelo = cfg.indexOf('\n};', iModelo);
const codigoModelo = cfg.slice(iModelo, fimModelo + 3);

// `misturaPara` de produção, tal e qual.
const iMistura = tipos.indexOf('misturaPara: function');
if (iMistura < 0) throw new Error('misturaPara não existe em js/pass_types.js');
const fimMistura = tipos.indexOf('\n    },', iMistura);
const corpoMistura = tipos.slice(iMistura, fimMistura + 6).replace('misturaPara: function', 'function misturaPara');

const { PassTypeModel, misturaPara } = new Function(
    codigoModelo + '\n' + corpoMistura.replace(/,\s*$/, '') +
    '\n; return { PassTypeModel: PassTypeModel, misturaPara: misturaPara };')();

let falhas = 0;
function exigir(cond, msg) {
    if (!cond) { console.log('FALHA: ' + msg); falhas++; }
    else console.log('ok: ' + msg);
}
const zona = (sector, corredor, avanco) => ({ sector, corredor, avanco });
const aosPes = m => (m.direct || 0);
const noEspaco = m => (m.space || 0) + (m.leading || 0);

// 1. O CASO DO RELATO: central no terço defensivo a tocar no médio.
{
    const m = misturaPara(zona('def', 'centro', -40), zona('mid', 'centro', -5));
    exigir(aosPes(m) >= 0.6,
        'def->mid pelo centro joga-se aos pés (direct=' + aosPes(m).toFixed(2) + ', era 0.30)');
    exigir(noEspaco(m) <= 0.4, 'e o espaço fica minoritário (' + noEspaco(m).toFixed(2) + ')');
}

// 2. Central para o lateral que abriu — a mesma coisa: saída a jogar.
{
    const m = misturaPara(zona('def', 'centro', -40), zona('def', 'lado', -38));
    exigir(aosPes(m) >= 0.6, 'def->def para o lado joga-se aos pés (' + aosPes(m).toFixed(2) + ')');
}

// 3. E o lateral a devolver para dentro, ainda no terço de trás.
{
    const m = misturaPara(zona('def', 'lado', -35), zona('mid', 'lado', -8));
    exigir(aosPes(m) >= 0.6, 'lateral a progredir pela ala joga aos pés (' + aosPes(m).toFixed(2) + ')');
}

// 4. A BOLA LONGA DE PROPÓSITO continua a existir: central a saltar o
//    meio-campo inteiro não joga aos pés a 40 m.
{
    const m = misturaPara(zona('def', 'centro', -40), zona('atk', 'centro', 25));
    exigir(aosPes(m) < 0.2,
        'def->atk continua a ser bola no espaço (direct=' + aosPes(m).toFixed(2) + ')');
}

// 5. O PASSE PARA TRÁS mantém-se aos pés — a regra `recuo` é a primeira de
//    todas e não pode ser roubada pela nova.
{
    const m = misturaPara(zona('def', 'centro', -30), zona('def', 'centro', -40));
    exigir(aosPes(m) >= 0.8, 'recuo continua 0.85 aos pés (' + aosPes(m).toFixed(2) + ')');
}

// 6. O MEIO-CAMPO NÃO MUDA. Foi afinado com o relato do "jogo travado a cada
//    passe", e esta correcção não lhe toca.
{
    const meio = misturaPara(zona('mid', 'centro', -5), zona('mid', 'centro', 5));
    exigir(Math.abs(aosPes(meio) - 0.30) < 1e-9,
        'mid->mid pelo centro fica nos 0.30 de sempre (' + aosPes(meio).toFixed(2) + ')');
    const ataque = misturaPara(zona('atk', 'centro', 25), zona('atk', 'centro', 30));
    exigir(Math.abs(aosPes(ataque) - 0.25) < 1e-9,
        'origemAtaque fica nos 0.25 de sempre (' + aosPes(ataque).toFixed(2) + ')');
}

// 7. A MENTALIDADE MANDA NA SAÍDA DE TRÁS.
//    Era o outro buraco do mesmo relato: a Mentalidade tocava na escolha de
//    passe num sítio só (o `aggression` dentro do bónus de progressão) e só
//    para a AUMENTAR — não havia caminho por onde Equilibrada pedisse menos
//    bola para a frente do que Ataque.
{
    const de = zona('def', 'centro', -40), para = zona('mid', 'centro', -5);
    const MUITO_DEFENSIVA = 0.20, EQUILIBRADA = 0.50, MUITO_OFENSIVA = 0.80;

    const def = misturaPara(de, para, MUITO_DEFENSIVA);
    const eq = misturaPara(de, para, EQUILIBRADA);
    const ofe = misturaPara(de, para, MUITO_OFENSIVA);

    exigir(aosPes(def) > aosPes(eq) && aosPes(eq) > aosPes(ofe),
        'quanto mais ofensiva, menos bola aos pés (' +
        aosPes(def).toFixed(2) + ' > ' + aosPes(eq).toFixed(2) + ' > ' + aosPes(ofe).toFixed(2) + ')');
    exigir(Math.abs(aosPes(eq) - 0.70) < 1e-9,
        'Equilibrada é exactamente a tabela fixa da regra (' + aosPes(eq).toFixed(2) + ')');
    exigir(aosPes(ofe) > 0.5,
        'mesmo em Muito Ofensiva o central joga mais aos pés do que ao espaço (' +
        aosPes(ofe).toFixed(2) + ')');

    for (const [nome, m] of [['Muito Defensiva', def], ['Equilibrada', eq], ['Muito Ofensiva', ofe]]) {
        const s = (m.direct || 0) + (m.space || 0) + (m.leading || 0);
        exigir(Math.abs(s - 1) < 1e-9, nome + ' soma 1 (' + s.toFixed(6) + ')');
    }
}

// 8. Sem agressão nenhuma, a tabela fixa manda — quem não a passa não muda de
//    comportamento, e o resto do jogo chama isto sem ela.
{
    const semNada = misturaPara(zona('def', 'centro', -40), zona('mid', 'centro', -5));
    exigir(Math.abs(aosPes(semNada) - 0.70) < 1e-9,
        'sem agressão é a tabela fixa (' + aosPes(semNada).toFixed(2) + ')');
}

// 9. A mentalidade não vaza para as outras regras: só a saída de trás a lê.
{
    const meioOfensivo = misturaPara(zona('mid', 'centro', -5), zona('mid', 'centro', 5), 0.80);
    exigir(Math.abs(aosPes(meioOfensivo) - 0.30) < 1e-9,
        'mid->mid ignora a agressão (' + aosPes(meioOfensivo).toFixed(2) + ')');
}

// 10. Toda a mistura continua a somar 1: um sorteio que soma menos cai no
//    DIRECT por arredondamento, e isso esconderia um erro de tabela.
{
    let todasSomam = true;
    for (const r of PassTypeModel.regras) {
        const s = (r.mistura.direct || 0) + (r.mistura.space || 0) + (r.mistura.leading || 0);
        if (Math.abs(s - 1) > 1e-9) { todasSomam = false; console.log('   regra ' + r.nome + ' soma ' + s); }
    }
    const p = PassTypeModel.misturaPadrao;
    const sp = (p.direct || 0) + (p.space || 0) + (p.leading || 0);
    exigir(todasSomam && Math.abs(sp - 1) < 1e-9, 'todas as misturas somam 1');
}

console.log(falhas === 0 ? 'PASSOU' : 'FALHOU (' + falhas + ')');
process.exit(falhas === 0 ? 0 : 1);
