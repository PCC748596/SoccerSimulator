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

const merge = ler('js/utils.js').match(/function mergeNonIndexedGeometries[\s\S]*?\n}\n/)[0];
const mod = new Function('THREE', 'console',
    `${merge}
     ${ler('js/crowd.js')}
     ${ler('js/config/cidade.js')}
     ${ler('js/cidade.js')}
     ${ler('js/cidade_gente.js')}
     return { Cidade, CidadeConfig, CidadeGente, Crowd };`)(THREE, console);
const { Cidade, CidadeConfig: C, CidadeGente: G } = mod;

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

// 2b. fachada: fecha as bancadas e cabe dentro do estacionamento
const fach = grupo.getObjectByName('FachadaEstadio');
ok(!!fach, 'falta a fachada');
if (fach) {
    fach.geometry.computeBoundingBox();
    const bb = fach.geometry.boundingBox;
    ok(bb.max.x > E.meiaX && bb.max.x < E.meiaX + C.estacionamento.recuoEstadio, 'fachada fora da zona: x ' + bb.max.x);
    ok(bb.max.z > E.meiaZ && bb.max.z < E.meiaZ + C.estacionamento.recuoEstadio, 'fachada fora da zona: z ' + bb.max.z);
    ok(bb.max.y > 26 && bb.max.y < 30, 'altura da fachada: ' + bb.max.y);
}
ok(inv.arvoresEsplanada >= 30, 'poucas árvores na esplanada: ' + inv.arvoresEsplanada);

// 3. custo: tudo fundido
let malhas = 0, tris = 0;
grupo.traverse(o => { if (o.isMesh) { malhas++; tris += (o.geometry.attributes.position.count / 3) * (o.isInstancedMesh ? o.count : 1); } });
console.log('malhas (draw calls):', malhas, ' triângulos ~', Math.round(tris));
ok(malhas <= 40, 'draw calls a mais: ' + malhas);

// 4. determinismo
const assinatura = g => {
    let s = 0;
    g.traverse(o => { if (o.isMesh) { const a = o.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 37) s += a[i]; s += a.length; if (o.isInstancedMesh) { const m = o.instanceMatrix.array; for (let i = 0; i < m.length; i += 29) s += m[i]; s += o.count; } } });
    return s;
};
const a1 = assinatura(grupo);
Cidade.construir(null);
ok(assinatura(Cidade.grupo) === a1, 'duas construções saíram diferentes');
ok(cena.children.length === 0, 'o remover deixou lixo na cena');

// 4b. a gente
ok(G._modelo === 'jogador', 'a gente não usa o modelo do jogador: ' + G._modelo);
console.log('grafo:', G.nos.length, 'nós;', G.agentes.length, 'pessoas; portões', G.portoes.length);
ok(G.agentes.length === C.gente.total, 'total de pessoas');
let semAdj = G.adj.filter(a => a.length === 0).length;
ok(semAdj === 0, semAdj + ' nós isolados');
const raizNo = G.nosChao[0];
const alcancaveis = id => !!G.caminho(raizNo, id);
ok(G.portoes.every(g => alcancaveis(g.noId)), 'portão inalcançável');
ok(G.bocas.every(b => alcancaveis(b.noFrente)), 'boca de metrô inalcançável');
ok(cena.children.length === 0, 'cena');
ok(Cidade.dados.paradas.every(p => alcancaveis(p.noEspera)), 'parada inalcançável');
ok(alcancaveis(G.plat['-1'].nos[0]) && alcancaveis(G.plat['1'].nos[6]), 'plataforma inalcançável');
ok(G.nosLote.every(id => alcancaveis(id)), 'corredor de estacionamento inalcançável');
ok(Cidade.dados.passarelas.length === 4, 'passarelas nos dados');

// a simulação: 5 minutos a 10 Hz. O comboio pára 10 s na estação; as trocas acontecem.
Cidade.construir(null);
const t0 = Cidade._trens[0];
let paradoMax = 0, ciclo = 0, estPrev = t0.userData.estado, tPar = 0, maxV = 0, nan = 0, chegouParar = null, distParou = null;
for (let i = 0; i < 3000; i++) {
    Cidade.update(0.1);
    const u = t0.userData;
    maxV = Math.max(maxV, u.v);
    if (u.estado === 'parado') { tPar += 0.1; if (chegouParar === null) { chegouParar = i * 0.1; distParou = Math.abs(t0.position.x - u.paragemX); } }
    else if (estPrev === 'parado') { paradoMax = Math.max(paradoMax, tPar); tPar = 0; ciclo++; }
    estPrev = u.estado;
    for (const a of Cidade.gente.agentes) if (!isFinite(a.x + a.y + a.z)) nan++;
}
console.log('comboio: chegou a parar aos', chegouParar && chegouParar.toFixed(1), 's; parado', paradoMax.toFixed(1), 's; vmax', maxV, 'ciclos', ciclo);
console.log('trocas:', JSON.stringify(Cidade.gente.estat));
ok(nan === 0, 'posições inválidas nas pessoas');
ok(chegouParar !== null && chegouParar < 40, 'o comboio demorou a chegar: ' + chegouParar);
ok(distParou < 0.05, 'o comboio não parou no sítio: ' + distParou);
ok(paradoMax >= 9.9 && paradoMax <= 10.3, 'tempo parado: ' + paradoMax);
ok(maxV >= 25, 'velocidade máxima baixa: ' + maxV);
const E2 = Cidade.gente.estat;
ok(E2.embTrem > 0 && E2.desTrem > 0, 'ninguém entrou/saiu do comboio');
ok(E2.embOnibus + E2.embTaxi > 0 && E2.desOnibus + E2.desTaxi > 0, 'ninguém entrou/saiu de ônibus/táxi');
ok(E2.carros === 0, 'carros do estacionamento não devem sair');
ok(E2.bocas > 0 && E2.estadio > 0, 'bocas/estádio sem uso');
// o trânsito só anda nas vias de ponta a ponta, longe da esplanada, e é denso
const veiculos = Cidade._veiculos.reduce((n, g) => n + g.lista.length, 0);
ok(veiculos >= 250, 'pouco trânsito: ' + veiculos);
ok(Cidade._veiculos.every(g => g.lista.every(c => c.v.a <= -C.meia + 1 && c.v.b >= C.meia - 1)), 'veículo numa via curta');
const lim = C.esplanada;
let dentroDaEsplanada = 0;
for (let i = 0; i < 600; i++) {
    Cidade.update(0.1);
    for (const g of Cidade._veiculos) for (const c of g.lista) if (Math.abs(c.x) < lim.meiaX - 4 && Math.abs(c.z) < lim.meiaZ - 4) dentroDaEsplanada++;
}
ok(dentroDaEsplanada === 0, dentroDaEsplanada + ' veículos dentro do estacionamento');
const emFila = Cidade.gente.agentes.filter(a => a.modo === 'fila').length;
console.log('em fila agora:', emFila);
ok(emFila > 20, 'poucas pessoas em fila: ' + emFila);

// 5. o update mexe sem rebentar e traz os comboios para dentro
Cidade.update(1 / 60);
for (const t of Cidade._trens) ok(Math.abs(t.position.x) <= R + 200, 'comboio fugiu');

if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK cidade');
