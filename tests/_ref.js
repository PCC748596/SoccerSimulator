const m=(a)=>()=>{a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
require('../tools/headless/harness.js');
const dt=1/60;const scene=new THREE.Scene();
if(typeof Sim==='undefined')global.Sim={};Sim.running=false;
const errs={};let cards=0,vis=0,back=0,fr=0;
for(const s of [5,7,99]){Math.random=m(s);Match.init(scene);if(Officials.init)Officials.init(scene);
for(let i=0;i<Math.round(1500/dt);i++){try{Match.update(dt);}catch(e){const k=String(e.stack).split('\n').slice(0,3).join('|');errs[k]=(errs[k]||0)+1;if(Object.keys(errs).length>3)break;}
 const o=Officials;if(o.cartaoEmCurso){cards++;if(o._cartaoMesh&&o._cartaoMesh.visible)vis++;}
 const a=o.arbitro;if(a&&a.model){const p=a.model.position;if(globalThis._pp){const dx=p.x-_pp.x,dz=p.z-_pp.z;const sp=Math.hypot(dx,dz)/dt;if(sp>1.5){const f=new THREE.Vector3(0,0,1).applyQuaternion(a.model.quaternion);fr++;if((f.x*dx+f.z*dz)/Math.hypot(dx,dz)<-0.3)back++;}}globalThis._pp=p.clone();}}}
console.log('cartaoFrames',cards,'visiveis',vis,'arbitroDeCostasFrames',back,'/',fr);console.log(JSON.stringify(errs));
