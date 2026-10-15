/*
A PONTE (js/narracao/ponte.js) em modo OCULTO, ao ritmo maximo: inicia uma partida com equipas "do manager" (mensagem `iniciar`), recebe os
eventos narrados e o resultado final. Confere: a mensagem `iniciada`; eventos com o texto da linha; o `fim` traz o placar que bate com os golos,
a posse soma ~100%, os cartoes e o relato; e que as mensagens podem viajar por JSON (sem referencias ao motor).
Para ser rapido a partida acaba aos 50 minutos de relogio (`fimEmMinutos`), depois do intervalo.
*/
require('../tools/headless/harness.js');
const { FORM, equipaMgr } = require('../tools/headless/fixtures_manager.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(11);
Match.init(new THREE.Scene());
Officials.arbitro = null; Officials.init(new THREE.Scene());
const c = equipaMgr('Flamengo-RJ', FORM['4-3-3'], { style: 'Offensive' });
const f = equipaMgr('Palmeiras-SP', FORM['3-5-2']);
const recebidas = [];
let resolver;
const fim = new Promise((resolve) => { resolver = resolve; });
// As mensagens tem de sobreviver a um JSON, como no postMessage de verdade.
Ponte.saida = (m) => {
    const copia = JSON.parse(JSON.stringify(m));
    recebidas.push(copia);
    if (copia.tipo === 'fim' || copia.tipo === 'erro') resolver(copia);
};
Ponte.aoMensagem({
    para: 'simulador3d', tipo: 'iniciar', modo: 'oculto', ritmo: 'maximo', fimEmMinutos: 50, taticaDe: 'casa',
    casa: { equipa: c.equipa, jogadoresPorId: c.porId, formacao: { nome: '4-3-3', slots: FORM['4-3-3'] } },
    fora: { equipa: f.equipa, jogadoresPorId: f.porId, formacao: { nome: '3-5-2', slots: FORM['3-5-2'] } }
});
const limite = setTimeout(() => { erro('a partida nao acabou a tempo'); process.exit(1); }, 280000);
fim.then((m) => {
    clearTimeout(limite);
    if (m.tipo === 'erro') { erro('a ponte deu erro: ' + m.mensagem); process.exit(1); }
    const tipos = recebidas.map(x => x.tipo);
    if (tipos[0] !== 'iniciada') erro('a primeira mensagem devia ser iniciada: ' + tipos[0]);
    const eventos = recebidas.filter(x => x.tipo === 'evento');
    if (eventos.length < 5) erro('poucos eventos: ' + eventos.length);
    for (const e of eventos) { if (!e.evento || typeof e.evento.minuto !== 'number') erro('evento sem minuto'); }
    if (eventos.filter(e => e.linha && typeof e.linha.texto === 'string' && e.linha.texto.length).length < 3) erro('quase nenhuma linha narrada');
    const r = m.resultado;
    const golosCasa = r.golos.filter(g => g.equipa === 'casa').length, golosFora = r.golos.filter(g => g.equipa === 'fora').length;
    if (golosCasa !== r.placar.casa || golosFora !== r.placar.fora) erro('os golos (' + golosCasa + 'x' + golosFora + ') nao batem com o placar (' + r.placar.casa + 'x' + r.placar.fora + ')');
    if (Math.abs(r.posse.casa + r.posse.fora - 100) > 0.5) erro('a posse nao soma 100: ' + (r.posse.casa + r.posse.fora));
    if (!Array.isArray(r.relato) || r.relato.length < 3) erro('relato vazio');
    if (!r.estatisticas || !r.estatisticas.TeamA) erro('sem estatisticas');
    if (!tipos.includes('fim')) erro('sem mensagem fim');
    if (!r.eventos.find(e => e.tipo === 'INTERVALO')) erro('o intervalo nao aparece no registo');
    console.log('  ' + eventos.length + ' eventos enviados; placar ' + r.placar.casa + 'x' + r.placar.fora + '; ' + r.cartoes.length + ' cartoes; posse ' + r.posse.casa + '%; ' + r.relato.length + ' linhas de relato');
    if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
    console.log('OK ponte_manager');
    process.exit(0);
});
