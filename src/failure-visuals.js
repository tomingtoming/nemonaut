import * as T from 'three';
import {fleet} from './fleet.js';
import {bodyUp} from './celestial.js';
import {PARTS} from './catalog.js';

export function failureEnvelope(event,now){
 const age=now-event.time,hot=event.effect==='fuel-burst';
 const radius=hot?Math.min(12,.8+Math.cbrt(event.fuel)*.65):.25;
 return {age,radius,alive:age>=0&&age<(hot?8:2),flash:Math.max(0,1-age/.5),smoke:hot?Math.max(0,1-age/8):0};
}
export function markWreckVisual(object,vessel){
 if(!vessel.failureDynamics||object.userData.wreckTinted)return;
 object.userData.wreckTinted=true;
 const event=vessel.failureEvents?.find(e=>e.partId===object.userData.partId),burned=event?.effect==='fuel-burst'||event?.cause==='thermal';
 object.traverse(o=>{if(!o.isMesh)return;o.userData.wreckMaterials=true;const tint=m=>{const copy=m.clone();if(copy.color)copy.color.multiplyScalar(burned?.18:.55);if(copy.emissive)copy.emissive.set(0);return copy;};o.material=Array.isArray(o.material)?o.material.map(tint):tint(o.material);});
}
export function disposeWreckVisual(object){object.traverse(o=>{if(!o.userData.wreckMaterials)return;for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();delete o.userData.wreckMaterials;});}
function plumeTexture(){
 const size=64,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const dx=(x+.5)/size*2-1,dy=(y+.5)/size*2-1,r=Math.hypot(dx,dy),i=(y*size+x)*4;
  const cloud=.85+.15*Math.sin(dx*17+Math.sin(dy*11))*Math.cos(dy*19);
  data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(255*Math.max(0,1-r)**1.4*cloud);
 }
 const texture=new T.DataTexture(data,size,size);texture.needsUpdate=true;return texture;
}
// Bounded cosmetic particles only. Actual parts remain owned by physics.
export class FailureVisuals{
 constructor(scene){this.scene=scene;this.items=new Map();this.texture=plumeTexture();}
 clear(){for(const id of [...this.items.keys()])this.remove(id);}
 remove(id){const item=this.items.get(id);if(!item)return;this.scene.remove(item.root);for(const m of item.materials)m.dispose();this.items.delete(id);}
 update(f){
  if(!f){this.clear();return;}
  const now=f.universalTime,events=[...new Map(fleet(f).flatMap(v=>v.failureEvents??[]).map(e=>[e.id,e])).values()].filter(e=>failureEnvelope(e,now).alive).sort((a,b)=>a.time-b.time).slice(-16),live=new Set(events.map(e=>e.id));
  for(const id of this.items.keys())if(!live.has(id))this.remove(id);
  for(const e of events){
   let item=this.items.get(e.id);const env=failureEnvelope(e,now);
   if(!item){
    const root=new T.Group(),materials=[],particles=[];
    for(let i=0;i<32;i++){
     const smoke=e.effect==='fuel-burst'&&i>=20;
     const material=new T.SpriteMaterial({map:this.texture,color:smoke?'#4b4844':i%3?'#ff6a10':e.effect==='fuel-burst'?'#ffbd46':'#fff3b0',transparent:true,depthWrite:false,toneMapped:false,blending:T.NormalBlending});materials.push(material);
     const mesh=new T.Sprite(material);root.add(mesh);
     const y=1-2*(i+.5)/32,theta=i*2.3999632297,r=Math.sqrt(1-y*y);
     particles.push({mesh,smoke,direction:new T.Vector3(Math.cos(theta)*r,y,Math.sin(theta)*r)});
    }
    item={root,materials,particles};this.scene.add(root);this.items.set(e.id,item);
   }
   const age=env.age,up=bodyUp(new T.Vector3(...e.position),e.time);
   item.root.position.fromArray(e.position).addScaledVector(new T.Vector3(...e.velocity),age);
   for(const {mesh,smoke,direction}of item.particles){
    const life=smoke?env.smoke:Math.max(0,1-age/(e.effect==='fuel-burst'?1.6:1.1));
    mesh.visible=life>0;mesh.material.opacity=life*(smoke?.45:.9);
    const shell=e.effect==='fragments'?Math.max(...(PARTS[e.type]?.size??[1]))*.55:0;
    mesh.position.copy(direction).multiplyScalar(shell+(smoke?.45:4)*env.radius*age).addScaledVector(up,smoke?age*env.radius*.35:-age*age*.35);
    mesh.scale.setScalar(smoke?env.radius*(.35+age*.14):e.effect==='fuel-burst'?env.radius*(.12+env.flash*.45):.05+.04*(1-life));
   }
  }
 }
 dispose(){this.clear();this.texture.dispose();}
}
