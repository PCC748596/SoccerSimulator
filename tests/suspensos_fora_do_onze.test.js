/*
OS SUSPENSOS NAO ENTRAM NO ONZE (Match.suspensos, createTeams). Pedido: jogadores suspensos por cartao ficam fora dos
jogos. Escolhe uma equipa real, suspende o guarda-redes titular e dois titulares de campo, refaz as equipas e confere
que nenhum dos tres joga, que o onze continua a ter 11 (com 1 GR) e que sem suspensos tudo volta como era.
*/
require('../tools/headless/harness.js');
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = true;
let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

Match.init(new THREE.Scene());
const equipa = SquadsData.equipas.find(e => e.nome === 'Palmeiras-SP') || SquadsData.equipas[0];
const outra = SquadsData.equipas.find(e => e !== equipa);
Match.suspensos = null;
Match.trocarEquipas({ A: equipa.id, B: outra.id });
const ids = (lista) => lista.map(p => p.skills && p.skills.id);
const titulares = ids(Match.players);
if (Match.players.length !== 11) erro('onze da casa nao tem 11: ' + Match.players.length);
const gk = Match.players.find(p => p.role === 'gk').skills.id;
const campo = Match.players.filter(p => p.role !== 'gk').slice(0, 2).map(p => p.skills.id);
const fora = new Set([gk, ...campo]);

Match.suspensos = { A: fora, B: new Set() };
Match.trocarEquipas({ A: equipa.id, B: outra.id });
const com = ids(Match.players);
for (const id of fora) if (com.indexOf(id) >= 0) erro('o suspenso ' + id + ' jogou');
if (Match.players.length !== 11) erro('com suspensos o onze nao tem 11: ' + Match.players.length);
if (Match.players.filter(p => p.role === 'gk').length !== 1) erro('o onze nao tem exactamente um guarda-redes');
if (ids(Match.opponents).some(id => id === undefined)) erro('a outra equipa ficou sem skills');

Match.suspensos = null;
Match.trocarEquipas({ A: equipa.id, B: outra.id });
if (JSON.stringify(ids(Match.players)) !== JSON.stringify(titulares)) erro('sem suspensos o onze devia voltar a ser o de antes');

if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK suspensos_fora_do_onze');
