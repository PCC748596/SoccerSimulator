/*
DE ONDE SAEM OS CARTOES: para cada falta marcada, a gravidade, se travou ataque, o tipo, e o cartao dado.
Imprime o histograma da gravidade e quantos amarelos/vermelhos vieram de cada regra (gravidade, falta tatica, reincidencia).
Uso: node tools/headless/cartoes_origem2.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 300), semente = Number(process.argv[3] || 0);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(1000 + semente * 977);
require('./harness.js');
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = true;
Match.init(new THREE.Scene());
const F = RefereeModel.faltas;
const h = {}; let faltas = 0, porGrav = { amarelo: 0, vermelho: 0 }, porTatica = 0, porReinc = 0, tipos = {}, tat = 0, semCartao = 0;
const origGrav = Officials.gravidadeDaFalta.bind(Officials);
let ultima = null;
Officials.gravidadeDaFalta = function (o) { const g = origGrav(o); ultima = { g, tipo: o.tipo, tat: !!o.travouAtaque }; return g; };
const origDec = Officials.decidirCartao.bind(Officials);
Officials.decidirCartao = function (g, j, tat) { const c = origDec(g, j, tat); if (ultima) { faltas++; const b = Math.floor(g * 10) / 10; h[b] = (h[b] || 0) + 1; tipos[ultima.tipo] = (tipos[ultima.tipo] || 0) + 1; if (tat) tat++; if (c === 'amarelo') { if (g >= F.limiarAmarelo) porGrav.amarelo++; else if (tat) porTatica++; } else if (c === 'vermelho') porGrav.vermelho++; else semCartao++; } return c; };
const origRe = Officials._reincidente.bind(Officials);
Officials._reincidente = function (j) { const r = origRe(j); if (r) porReinc++; return r; };
const dt = 1 / 60;
for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);
console.log(`semente ${semente}: ${faltas} faltas; tipos ${JSON.stringify(tipos)}`);
console.log('gravidade (por 0.1):', Object.keys(h).sort().map(k => k + ':' + h[k]).join(' '));
console.log(`amarelos por gravidade>=${F.limiarAmarelo}: ${porGrav.amarelo}; vermelhos (decidirCartao): ${porGrav.vermelho}; reincidencia a disparar: ${porReinc}; faltas sem cartao pelo decidirCartao: ${semCartao}`);
console.log(`cartoes finais: ${MatchStats.TeamA.cartoes.amarelos + MatchStats.TeamB.cartoes.amarelos} amarelos, ${MatchStats.TeamA.cartoes.vermelhos + MatchStats.TeamB.cartoes.vermelhos} vermelhos`);
