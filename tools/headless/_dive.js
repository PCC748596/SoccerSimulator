require('./harness.js');
const dt=1/60; const scene=new THREE.Scene(); Match.init(scene);
if (typeof Officials!=='undefined'&&Officials.init) Officials.init(scene);
if (typeof Sim==='undefined') global.Sim={}; Sim.running=true;
let obs=null, n=0;
const ot=global.tipoDeRemate;
global.tipoDeRemate=function(o){ const t=ot(o); const p=Match.ballCarrier||Match.lastTouchedPlayer;
  if(p&&n<2){ obs={gk:(p.team==='TeamA')?Match.opponents[0]:Match.players[0], t:0, log:[]}; n++; }
  return t; };
for(let i=0;i<Math.round(900/dt);i++){
  Match.update(dt);
  if(obs){ obs.t+=dt;
    const g=obs.gk;
    obs.log.push(`${obs.t.toFixed(2)} est=${g.gkEstado} tMerg=${(g.gkTempoMergulho||0).toFixed(2)} alvoX=${(g.gkAlvoX||0).toFixed(1)} gkx=${g.model.position.x.toFixed(1)} fase=${g.dive?g.dive.fase:'-'} bola=(${Match.ball.position.x.toFixed(1)},${Match.ball.position.z.toFixed(1)}) v=(${Match.ballVel.x.toFixed(1)},${Match.ballVel.z.toFixed(1)}) dono=${Match.ballCarrier?Match.ballCarrier.pos:'-'} reagiu=${g.gkReagiu}`);
    if(obs.t>1.2){ console.log('--- lance'); console.log(obs.log.filter((_,i)=>i%3===0).join('\n')); obs=null; }
  }
}
