/*
O QUE O GUARDA-REDES FAZ MESMO COM A BOLA NA MAO: lanca ou chuta?

Relato: *"quando o goleiro pega a bola tem um jogador com pontuacao de passe
maior que 1000 mas mesmo assim o goleiro chuta pra frente"*. Ver
GoalkeeperDistribution.notaSempreSair (config/goalkeeper.js).

MEDE O DESFECHO, E NAO A INTENCAO — foi o erro da primeira versao desta
ferramenta. O `gkSaida` diz o que ele DECIDIU; com a decisao em 'laterais' e
sem destinatario ao fim do prazo, ele chutava na mesma. So a transicao de
'segurando' para 'lancando'/'chutando' diz o que aconteceu.

E separa as duas razoes de um chutao: "decidiu chutar" (a decisao) e "sem
destinatario ao prazo" (o executor). Sao dois sitios diferentes do codigo e
foram precisos os dois.

A nota NA DECISAO e a do momento em que ele escolheu, e nao a do momento em que
largou: a decisao e tomada quando ele agarra a bola, com a equipa ainda
desorganizada, e as notas sobem nos segundos seguintes. Comparar as duas e o
que mostra se ele ignorou uma boa opcao ou se ela ainda nao existia.

Uso: node tools/scratch/gk_saida.js [segundos]
*/
require('../headless/harness.js');
const dt=1/60; const scene=new THREE.Scene(); Match.init(scene); Officials.init(scene);
if (typeof Sim==='undefined') global.Sim={}; Sim.running=true;
window.showPlayerPoints = true;
const saidas=[];
const ant={};
for (let i=0;i<(Number(process.argv[2]||3600))/dt;i++) {
  Match.update(dt);
  for (const gk of [Match.players[0], Match.opponents[0]]) {
    if (!gk) continue;
    const e = gk.gkEstado;
    if ((e === 'lancando' || e === 'chutando') && ant[gk.team] === 'segurando') {
      gk.findPassTarget();
      const n = gk._notasPasse || [];
      saidas.push({ tipo: e, nota: n.length ? n[0].score : null, pos: n.length ? n[0].pos : '-',
        // Porque e que foi chutao: a decisao, ou a falta de destinatario?
        razao: (e !== 'chutando') ? '-' :
          (gk.gkSaida !== 'laterais' ? 'decidiu chutar' : 'sem destinatario ao prazo'),
        temAlvo: !!gk.gkThrowTarget, notaDecisao: gk._notaNaDecisao });
    }
    ant[gk.team] = e;
  }
}
console.log(saidas.length + ' relancamentos em ' + ((Number(process.argv[2]||3600))/60).toFixed(0) + ' min');
const chuta = saidas.filter(s => s.tipo === 'chutando');
const lanca = saidas.filter(s => s.tipo === 'lancando');
console.log('  lancou com a mao: ' + lanca.length + ' (' + (100*lanca.length/Math.max(1,saidas.length)).toFixed(0) + '%)');
console.log('  chutou para a frente: ' + chuta.length + ' (' + (100*chuta.length/Math.max(1,saidas.length)).toFixed(0) + '%)');
const maus = chuta.filter(s => s.nota !== null && s.nota > 1000);
console.log('  chutoes com uma opcao acima de 1000: ' + maus.length + '   <- o relato');
const porRazao = {};
chuta.forEach(c => { porRazao[c.razao] = (porRazao[c.razao]||0)+1; });
console.log('  razao dos chutoes: ' + JSON.stringify(porRazao));
chuta.forEach(c => console.log('    chutao | nota na DECISAO ' +
  (typeof c.notaDecisao === 'number' ? c.notaDecisao.toFixed(0) : '?') +
  ' | nota ao LARGAR ' + (c.nota === null ? '-' : c.nota.toFixed(0))));
const q = a => a.slice().sort((x,y)=>x-y);

