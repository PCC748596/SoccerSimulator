/*
A BOLA NA GRANDE ÁREA.

O lote de 30 jogos dá 5 `toquesNaArea` por equipa por jogo contra os 25-30
reais, com 30 entradas no último terço e 15 remates. Quinze remates com cinco
toques na área não existe em futebol nenhum, portanto uma das duas contas está
errada — e o contador (`MatchStats.medirComBola`) exige `Match.ballCarrier`,
que é exactamente o defeito que já apareceu no contador de ataques: um
cruzamento, um ressalto ou um remate de primeira não têm portador.

Aqui mede-se pela BOLA, que não depende de ninguém ter a posse:

  - ENTRADAS: a bola cruza para dentro da grande área adversária. Conta uma vez
    por entrada (tem de SAIR para voltar a contar), com a fase de jogo ao lado.
  - TEMPO: segundos de bola dentro da área.
  - ONDE PARA: para cada sequência que chega ao último terço, a distância
    mínima que a bola conseguiu da baliza, e o que acabou a sequência.
  - REMATES: a distância a que se remata e quantos saem de dentro da área.

O contador `toquesNaArea` é lido no fim da MESMA corrida, para se poder dizer
quanto do buraco é medição e quanto é jogo.

Uso: node tools/headless/area_entradas.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 900);
const semente = Number(process.argv[3] || 0);

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(1000 + semente * 977);

require('./harness.js');

// Varrimento: FOLGA=<metros> sobrepoe `BlockShape.folgaAtrasDaBola`.
if (process.env.FOLGA) BlockShape.folgaAtrasDaBola = Number(process.env.FOLGA);

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

// --- REMATES REAIS: o `tipoDeRemate` corre uma vez por remate executado.
const remates = [];
{
    const orig = global.tipoDeRemate;
    global.tipoDeRemate = function (o) {
        const t = orig(o);
        const p = Match.ballCarrier || Match.lastTouchedPlayer;
        if (p && p.model) {
            const baliza = p.dirZ * LINHA_FUNDO;
            remates.push({
                tipo: t,
                dist: Math.hypot(p.model.position.x, baliza - p.model.position.z),
                naArea: Area.contem(p.model.position.x, p.model.position.z, baliza),
                pos: p.pos
            });
        }
        return t;
    };
}

/*
Uma equipa ataca para `dirZ * LINHA_FUNDO`. Guarda-se o dirZ de cada equipa uma
vez: no headless as equipas trocam de lado ao intervalo, portanto lê-se por
frame a partir de um jogador de campo.
*/
const dirDe = (team) => {
    const lista = (team === 'TeamA') ? Match.players : Match.opponents;
    for (const p of lista) if (p && p.role !== 'gk') return p.dirZ;
    return (team === 'TeamA') ? 1 : -1;
};

const equipas = ['TeamA', 'TeamB'];
const estado = {
    TeamA: { dentro: false, entradas: 0, frames: 0, framesComPortador: 0, toques: 0, atacantes: [], defesas: [], tercoAtacantes: [] },
    TeamB: { dentro: false, entradas: 0, frames: 0, framesComPortador: 0, toques: 0, atacantes: [], defesas: [], tercoAtacantes: [] }
};

const jogadoresDe = (team) => (team === 'TeamA') ? Match.players : Match.opponents;

/*
QUANTA GENTE ESTÁ LÁ. Com a bola na área adversária conta-se quantos atacantes
(sem o guarda-redes) estão dentro dela e quantos defensores. Num cruzamento
real são 3 a 5 atacantes contra 5 a 7 defensores.
*/
const dentroDaArea = (lista, alvoZ) => {
    let n = 0;
    for (const p of lista) {
        if (!p || p.role === 'gk' || !p.model) continue;
        if (Area.contem(p.model.position.x, p.model.position.z, alvoZ)) n++;
    }
    return n;
};

/*
O TOQUE HONESTO. O `registarRecepcao` corre no `resolveBallContact`, uma vez
por contacto de qualquer jogador com a bola. É o que a estatística real chama
"toque na área" — não depende de haver portador nomeado, que é justamente o que
o contador do jogo exige.
*/
{
    const orig = MatchStats.registarRecepcao.bind(MatchStats);
    MatchStats.registarRecepcao = function (jogador, dominou) {
        if (jogador && jogador.model && jogador.role !== 'gk') {
            const alvoZ = jogador.dirZ * LINHA_FUNDO;
            const b = Match.ball.position;
            if (Area.contem(b.x, b.z, alvoZ)) estado[jogador.team].toques++;
        }
        return orig(jogador, dominou);
    };
}

/*
SEQUÊNCIAS: uma sequência começa quando a posse muda de equipa e acaba quando
volta a mudar. Para cada uma guarda-se a maior aproximação da BOLA à baliza
adversária e se chegou ao último terço — é a conta que diz "chegam ao terço mas
não à área".
*/
let seqEquipa = null;
let seqMin = 999;      // menor distância da bola à baliza adversária
let seqTerco = false;
let seqArea = false;
const sequencias = [];

const fecharSequencia = () => {
    if (seqEquipa && seqTerco) {
        sequencias.push({ equipa: seqEquipa, minDist: seqMin, area: seqArea });
    }
    seqMin = 999; seqTerco = false; seqArea = false;
};

const posseDe = () => {
    const p = Match.ballCarrier || Match.lastTouchedPlayer;
    return p ? p.team : null;
};

let ultimaPosse = null;

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);

    const b = Match.ball && Match.ball.position;
    if (!b) continue;

    // --- ENTRADAS E TEMPO NA ÁREA, pela bola
    for (const team of equipas) {
        const alvoZ = dirDe(team) * LINHA_FUNDO;
        const dentro = Area.contem(b.x, b.z, alvoZ);
        const e = estado[team];
        if (dentro) {
            e.frames++;
            const port = Match.ballCarrier;
            if (port && port.team === team) e.framesComPortador++;
            if (!e.dentro) {
                e.entradas++; e.dentro = true;
                // Amostra no INSTANTE da entrada: é aí que se decide o lance.
                e.atacantes.push(dentroDaArea(jogadoresDe(team), alvoZ));
                e.defesas.push(dentroDaArea(
                    jogadoresDe(team === 'TeamA' ? 'TeamB' : 'TeamA'), alvoZ));
            }
        } else {
            e.dentro = false;
        }
        // Com a bola no último terço, quantos atacantes já estão na área?
        const avanco = b.z * Math.sign(alvoZ);
        if (avanco > CAMPO_COMP / 6) e.tercoAtacantes.push(dentroDaArea(jogadoresDe(team), alvoZ));
    }

    // --- SEQUÊNCIAS
    const posse = posseDe();
    if (posse && posse !== ultimaPosse) {
        fecharSequencia();
        seqEquipa = posse;
        ultimaPosse = posse;
    }
    if (seqEquipa) {
        const alvoZ = dirDe(seqEquipa) * LINHA_FUNDO;
        const d = Math.hypot(b.x, alvoZ - b.z);
        if (d < seqMin) seqMin = d;
        // último terço: a bola passou a linha a 1/3 do campo da baliza
        const avanco = b.z * Math.sign(alvoZ);
        if (avanco > CAMPO_COMP / 6) seqTerco = true;
        if (Area.contem(b.x, b.z, alvoZ)) seqArea = true;
    }
}
fecharSequencia();

// =========================================================================
const min = Match.tempoDeJogo / 60;
const por90 = (n) => (n * 90 / min).toFixed(1);
const med = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';

console.log(`\n${min.toFixed(0)} min de relogio (semente ${semente})`);

console.log('\nA BOLA NA GRANDE AREA (medida pela bola, por equipa e por 90)');
for (const team of equipas) {
    const e = estado[team];
    console.log(`  ${team}  entradas ${por90(e.entradas).padStart(6)}   ` +
        `tempo dentro ${por90(e.frames * dt).padStart(6)} s   ` +
        `TOQUES ${por90(e.toques).padStart(6)}   ` +
        `com portador ${(100 * e.framesComPortador / Math.max(1, e.frames)).toFixed(0)}% do tempo`);
    console.log(`         no instante da entrada: ${med(e.atacantes)} atacantes ` +
        `contra ${med(e.defesas)} defensores dentro da area` +
        `   (real: 3-5 contra 5-7)`);
    console.log(`         com a bola no ultimo terco: ${med(e.tercoAtacantes)} atacantes na area`);
}

const A = MatchStats.TeamA, B = MatchStats.TeamB;
console.log('\nO CONTADOR toquesNaArea, na MESMA corrida (por 90)');
console.log(`  TeamA ${por90(A.toquesNaArea)}   TeamB ${por90(B.toquesNaArea)}` +
    `   (alvo real: 25-30)`);

console.log('\nSEQUENCIAS QUE CHEGAM AO ULTIMO TERCO');
console.log(`  total ${sequencias.length} (${por90(sequencias.length)}/90)`);
const comArea = sequencias.filter(s => s.area);
console.log(`  chegaram a AREA: ${comArea.length} = ` +
    `${(100 * comArea.length / Math.max(1, sequencias.length)).toFixed(0)}%`);
console.log(`  distancia minima da bola a baliza: mediana ` +
    `${(() => {
        const v = sequencias.map(s => s.minDist).sort((a, b) => a - b);
        return v.length ? v[Math.floor(v.length / 2)].toFixed(1) : '-';
    })()} m   (media ${med(sequencias.map(s => s.minDist))})`);
const faixaSeq = (a, b) => sequencias.filter(s => s.minDist >= a && s.minDist < b).length;
console.log(`  por faixa: <11m ${faixaSeq(0, 11)} | 11-16m ${faixaSeq(11, 16.5)} | ` +
    `16-25m ${faixaSeq(16.5, 25)} | 25-35m ${faixaSeq(25, 35)} | 35m+ ${faixaSeq(35, 999)}`);

console.log('\nREMATES');
const faixa = (a, b) => remates.filter(r => r.dist >= a && r.dist < b).length;
console.log(`  total ${remates.length} (${por90(remates.length)}/90)`);
console.log(`  de dentro da area: ${remates.filter(r => r.naArea).length} = ` +
    `${(100 * remates.filter(r => r.naArea).length / Math.max(1, remates.length)).toFixed(0)}%` +
    `   (real: ~60-70%)`);
console.log(`  por distancia: 0-6m ${faixa(0, 6)} | 6-12m ${faixa(6, 12)} | ` +
    `12-18m ${faixa(12, 18)} | 18-25m ${faixa(18, 25)} | 25m+ ${faixa(25, 999)}`);
console.log(`  distancia media ${med(remates.map(r => r.dist))} m`);
const porPos = {};
for (const r of remates) porPos[r.pos] = (porPos[r.pos] || 0) + 1;
console.log('  por posicao: ' + Object.entries(porPos).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`).join('  '));

console.log(`\nCONTADORES  remates ${A.remates.tentados + B.remates.tentados} | ` +
    `noAlvo ${A.remates.noAlvo + B.remates.noAlvo} | golos ${A.remates.golos + B.remates.golos} | ` +
    `cantos ${A.cantos + B.cantos}\n`);
