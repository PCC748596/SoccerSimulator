require('./harness.js');
const dt=1/60; const scene=new THREE.Scene(); Match.init(scene);
const TERCO=106/6;
const razoes={chamadas:0, gk:0, mult:0, tec:0, jaDribla:0, defesa:0, role:0, semOpp:0, semEspaco:0, ok:0};
// reimplementa a contagem envolvendo as condicoes: instrumenta por wrapper
const orig = podeDriblar;
global.podeDriblar = function(ctx){
  const p=ctx.p; const noTerco = p.model && (p.model.position.z*p.dirZ > TERCO);
  const r = orig(ctx);
  if (noTerco && p.hasBall) { razoes.chamadas++; if(r) razoes.ok++; }
  return r;
};
let dribles=0; const ant=new Map();
for(let f=0;f<60*1800;f++){
  Match.update(dt);
  for(const p of Match.players.concat(Match.opponents)){
    const e=p.fsm&&p.fsm.currentState; const a=ant.get(p); ant.set(p,e);
    if(e==='DRIBBLE'&&a!=='DRIBBLE'&&p.model.position.z*p.dirZ>TERCO) dribles++;
  }
}
console.log('chamadas no terco com bola:',razoes.chamadas,' true:',razoes.ok,' entradas DRIBBLE no terco:',dribles);
