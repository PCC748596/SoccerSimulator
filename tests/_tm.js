const m=(a)=>()=>{a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
require('../tools/headless/harness.js');
const estilo=process.argv[2]||'positional';Tatics.teamPlayStyle=estilo;Tatics.teamPlayStyleB=estilo;
const dt=1/60;const scene=new THREE.Scene();if(typeof Sim==='undefined')global.Sim={};Sim.running=true;
const res={posse5_proprio:0,posse5_adv:0,posse5_nenhuma:0,proprio:0,adv:0,sem:0,def:0,mid:0,atk:0};let pend=null;const dist=[];
EventBus.on('GOAL_KICK_TAKEN',e=>{pend={team:e.team,gk:e.gk,t:0,from:Match.lastTouchedPlayer};});
for(const s of [5,7,99,3,11,21,22,31,41,51,61,71]){Math.random=m(s);Match.init(scene);pend=null;
for(let i=0;i<60*60*20;i++){Match.update(dt);
 if(pend){pend.t+=dt;if(!pend.p5&&pend.t>=5){pend.p5=1;const c=Match.ballCarrier;if(!c)res.posse5_nenhuma++;else if(c.team===pend.team)res.posse5_proprio++;else res.posse5_adv++;}const lp=Match.lastTouchedPlayer;if(lp&&lp!==pend.gk&&pend.t>0.2){ if(lp.team===pend.team){res.proprio++;res[lp.role]=(res[lp.role]||0)+1;}else res.adv++;pend=null;}else if(pend.t>8){res.sem++;pend=null;}if(pend&&lp&&pend.p5&&pend.t>8)pend=null;}}}
console.log(estilo,JSON.stringify(res),'1o toque: proprio',(100*res.proprio/(res.proprio+res.adv+res.sem)).toFixed(0)+'%');
