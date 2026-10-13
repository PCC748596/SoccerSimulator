/*
A cidade à volta do estádio (js/cidade.js, config `CidadeConfig`).

Corre a construção a sério com o `three` de node e mede o que o pedido diz:

  - 500 m x 500 m, e tudo o que pediu existe: casas, prédios, ruas e avenidas,
    paradas de ônibus, metrô (viaduto, estação, comboios, bocas), passarelas,
    estacionamentos, faixas de pedestres, calçadas (quarteirões), postes;
  - nada se constrói em cima do estádio, da esplanada, de uma via, nem de uma
    reserva (rampa de passarela, escada do metrô);
  - dois edifícios nunca se sobrepõem;
  - a cidade custa poucos draw calls (é geometria fundida);
  - é determinista (duas construções saem iguais).
*/
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const mod = new Function('THREE', 'console',
    `${ler('js/config/cidade.js')}
     ${ler('js/cidade.js')}
     return { Cidade, CidadeConfig };`)(THREE, console);
const { Cidade, CidadeConfig: C } = mod;

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = (c, m) => { if (!c) erro(m); };

const cena = new THREE.Scene();
const grupo = Cidade.construir(cena);
const inv = Cidade.inventario;
console.log('inventário:', JSON.stringify(inv));
ok(cena.children.includes(grupo), 'o grupo da cidade não entrou na cena');

// 1. o que o pedido enumera
ok(inv.casas >= 80, 'poucas casas: ' + inv.casas);
ok(inv.predios >= 50, 'poucos prédios: ' + inv.predios);
ok(inv.quarteiroes >= 40, 'poucos quarteirões (calçadas): ' + inv.quarteiroes);
ok(Cidade.vias.some(v => v.avenida) && Cidade.vias.some(v => !v.avenida), 'falta avenida ou rua');
ok(inv.paradasOnibus >= 8, 'poucas paradas de ônibus: ' + inv.paradasOnibus);
ok(inv.metro.pilares >= 10 && inv.metro.estacoes >= 1 && inv.metro.trens >= 1 && inv.metro.bocas >= 1, 'metrô incompleto');
ok(inv.passarelas === 4, 'passarelas: ' + inv.passarelas);
ok(inv.estacionamentos === 4 && inv.vagas >= 500 && inv.carrosParados >= 300, 'estacionamentos fracos: ' + inv.vagas + ' vagas');
ok(inv.faixasPedestres >= 60, 'poucas faixas de pedestres: ' + inv.faixasPedestres);
ok(inv.postes >= 200, 'poucos postes: ' + inv.postes);
ok(inv.semaforos >= 20, 'poucos semáforos: ' + inv.semaforos);
ok(inv.arvores >= 100, 'poucas árvores: ' + inv.arvores);
ok(inv.parques === 4, 'parques: ' + inv.parques);

// 2. as pegadas
const E = C.estadio, X = C.esplanada, R = C.meia;
const cruza = (a, b, m) => a.x1 > b.x0 - m && a.x0 < b.x1 + m && a.z1 > b.z0 - m && a.z0 < b.z1 + m;
const predios = Cidade.edificios.filter(e => e.tipo !== 'parque');
ok(predios.length === inv.casas + inv.predios, 'pegadas a menos');
let dentro = 0, naVia = 0, naReserva = 0, sobrepoe = 0, fora = 0;
for (let i = 0; i < predios.length; i++) {
    const e = predios[i];
    if (e.x0 < -R || e.x1 > R || e.z0 < -R || e.z1 > R) fora++;
    if (cruza(e, { x0: -X.meiaX, x1: X.meiaX, z0: -X.meiaZ, z1: X.meiaZ }, 0)) dentro++;
    if (Cidade.vias.some(v => cruza(e, v, 0))) naVia++;
    if (Cidade.reservas.some(r => r.lote && cruza(e, r, 0))) naReserva++;
    for (let j = i + 1; j < predios.length; j++) if (cruza(e, predios[j], -0.01)) sobrepoe++;
}
ok(fora === 0, fora + ' edifícios fora dos 500 m');
ok(dentro === 0, dentro + ' edifícios na esplanada/estádio');
ok(naVia === 0, naVia + ' edifícios em cima de uma via');
ok(naReserva === 0, naReserva + ' edifícios em cima de uma reserva');
ok(sobrepoe === 0, sobrepoe + ' edifícios sobrepostos');
ok(E.meiaX < X.meiaX && E.meiaZ < X.meiaZ, 'a pegada do estádio tem de caber na esplanada');

// 3. custo: tudo fundido
let malhas = 0, tris = 0;
grupo.traverse(o => { if (o.isMesh) { malhas++; tris += (o.geometry.attributes.position.count / 3) * (o.isInstancedMesh ? o.count : 1); } });
console.log('malhas (draw calls):', malhas, ' triângulos ~', Math.round(tris));
ok(malhas <= 40, 'draw calls a mais: ' + malhas);

// 4. determinismo
const assinatura = g => {
    let s = 0;
    g.traverse(o => { if (o.isMesh) { const a = o.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 37) s += a[i]; s += a.length; } });
    return s;
};
const a1 = assinatura(grupo);
Cidade.construir(null);
ok(assinatura(Cidade.grupo) === a1, 'duas construções saíram diferentes');
ok(cena.children.length === 0, 'o remover deixou lixo na cena');

// 5. o update mexe sem rebentar e traz os comboios para dentro
Cidade.update(1 / 60);
for (const t of Cidade._trens) ok(Math.abs(t.position.x) <= R + 200, 'comboio fugiu');

if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK cidade');
