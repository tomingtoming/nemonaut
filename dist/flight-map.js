import * as T from 'three';
import {PRIMARY,MOON,bodyState} from './celestial.js';
import {center} from './planet.js';
import {projectTrackingPoint} from './tracking-orbits.js';
export function mapConic(o,limit){
 if(o.normal.lengthSq()<.5||o.p<1)return [];
 const x=o.eccentricity>1e-7?o.evec.clone().normalize():o.r.clone().normalize(),y=o.normal.clone().cross(x).normalize(),points=[];
 for(let i=0;i<=720;i++){const a=i*Math.PI/360,den=1+o.eccentricity*Math.cos(a),r=o.p/den;points.push(den>0&&r>=o.body.radius&&r<=Math.min(limit,o.body.sphereOfInfluence??Infinity)?x.clone().multiplyScalar(r*Math.cos(a)).addScaledVector(y,r*Math.sin(a)).add(o.center):null);}return points;
}
export function mountFlightMap(canvas){
 const ctx=canvas.getContext('2d');let current=null,preview=null,yaw=1.15,pitch=.4,extent=null,focus='body',drag=null,markers=[];
 const overlay=document.querySelector('#orbitOverlay'),header=overlay.querySelector('.mapHeader');
 const toolbar=document.createElement('div');toolbar.className='mapToolbar';
 for(const [key,name]of [['body','現在の天体'],['craft','機体'],['planet','母星'],['moon','月'],['system','全体']]){const b=document.createElement('button');b.textContent=name;b.dataset.focus=key;b.onclick=()=>{focus=key;extent=null;draw();};toolbar.append(b);}header.append(toolbar);
 const status=document.createElement('span');status.id='mapScale';toolbar.append(status);
 canvas.title='ドラッグで回転 · ホイールで拡大縮小 · Ap/Peをクリックして計画';
 canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved ||=Math.abs(dx)+Math.abs(dy)>2;yaw+=dx*.006;pitch=T.MathUtils.clamp(pitch+dy*.006,-1.5,1.5);drag.x=e.clientX;drag.y=e.clientY;draw();});
 canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved){const rect=canvas.getBoundingClientRect(),hit=markers.find(m=>Math.hypot(m.x-(e.clientX-rect.left),m.y-(e.clientY-rect.top))<22);if(hit){document.querySelector('#planLocation').value=hit.key;document.querySelector('#planEnabled').checked=true;document.querySelector('#mapPlanPanel').open=true;document.querySelector('#planLocation').dispatchEvent(new Event('change',{bubbles:true}));}}drag=null;});
 canvas.addEventListener('pointercancel',()=>drag=null);
 canvas.addEventListener('wheel',e=>{e.preventDefault();extent=T.MathUtils.clamp(extent*Math.exp(e.deltaY*.001),10000,6e7);draw();},{passive:false});
 new ResizeObserver(()=>draw()).observe(canvas);
 function draw(){
  if(!current||overlay.hidden)return;const trajectory=overlay.querySelector('.trajectoryPanel');if(trajectory&&trajectory.parentElement!==overlay.querySelector('.mapReadings'))overlay.querySelector('.mapReadings').append(trajectory);const o=current,time=o.universalTime??0,moon=bodyState(MOON,time).position,body=o.body,w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const origin=focus==='system'||focus==='planet'?center:focus==='moon'?moon:focus==='craft'?o.r.clone().add(o.center):o.center;
  if(extent===null)extent=focus==='system'?MOON.orbitRadius*1.25:focus==='moon'?MOON.radius*3:focus==='planet'?PRIMARY.radius*2:Math.max(body.radius*1.5,Math.min(body.sphereOfInfluence??2e7,Number.isFinite(o.apoapsis)?body.radius+o.apoapsis:o.radius*2))*1.15;
  const scale=Math.min(w,h)*.42/extent,cx=w/2,cy=h/2;
  const project=v=>{const p=projectTrackingPoint(v.clone().sub(origin).toArray(),yaw,pitch);return [cx+p[0]*scale,cy-p[1]*scale,p[2]];};
  ctx.fillStyle='#03070e';ctx.fillRect(0,0,w,h);
  for(let i=0;i<180;i++){ctx.fillStyle=i%7?'#586574':'#bac3cf';ctx.fillRect((i*7919%1009)/1009*w,(i*3571%997)/997*h,i%7?1:1.5,1);}
  const path=(points,color,dashed=false)=>{ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash(dashed?[7,5]:[]);ctx.beginPath();let prior=false;for(const v of points){if(!v){prior=false;continue;}const [x,y,z]=project(v);const hidden=[[PRIMARY,center],[MOON,moon]].some(([b,p])=>{const [bx,by,bz]=project(p),r=b.radius*scale;return z<bz&&(x-bx)**2+(y-by)**2<r*r;});if(hidden){prior=false;continue;}if(prior)ctx.lineTo(x,y);else ctx.moveTo(x,y);prior=true;}ctx.stroke();ctx.setLineDash([]);};
  const moonOrbit=[];for(let i=0;i<=180;i++){const a=i*Math.PI/90;moonOrbit.push(center.clone().add(new T.Vector3(0,MOON.orbitRadius*Math.cos(a),MOON.orbitRadius*Math.sin(a))));}
  for(const [b,pos]of [[PRIMARY,center],[MOON,moon]].sort((a,b)=>project(a[1])[2]-project(b[1])[2])){
   const [x,y]=project(pos),r=b.radius*scale;if(x+r<0||y+r<0||x-r>w||y-r>h)continue;
   const g=ctx.createRadialGradient(x-r*.4,y-r*.4,0,x,y,Math.max(1,r));g.addColorStop(0,b.id==='moon'?'#c2c1b8':'#628c83');g.addColorStop(.65,b.id==='moon'?'#656971':'#274c63');g.addColorStop(1,'#0a1726');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,Math.max(2,r),0,Math.PI*2);ctx.fill();
   if(b.atmosphereTop){ctx.strokeStyle='#5ea9d855';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,r*(1+b.atmosphereTop/b.radius),0,Math.PI*2);ctx.stroke();}
   ctx.fillStyle='#bdc8d5';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText(b.name,x,y+Math.max(2,r)+18);
  }
  path(moonOrbit,'#49515c');path(mapConic(o,6e7),'#e5a45b');if(preview)path(mapConic(preview.orbit,6e7),'#7de6ef',true);
  const marker=(pos,label,color,key)=>{const [x,y,z]=project(pos);if(x<10||y<65||x>w-10||y>h-20)return;ctx.fillStyle=color;ctx.strokeStyle='#03070e';ctx.lineWidth=3;ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.strokeText(label,x,y-13);ctx.fillText(label,x,y-13);if(key)markers.push({x,y,key});};
  markers=[];
  if(o.eccentricity>1e-4&&o.normal.lengthSq()>.5){const axis=o.evec.clone().normalize();for(const [key,label,r,sign]of [['apoapsis','Ap',body.radius+o.apoapsis,-1],['periapsis','Pe',body.radius+o.periapsis,1]])if(Number.isFinite(r)&&r>=body.radius&&r<(body.sphereOfInfluence??Infinity))marker(axis.clone().multiplyScalar(r*sign).add(o.center),label+' '+((r-body.radius)/1000).toFixed(1)+' km','#b9dcff',key);}
  marker(o.r.clone().add(o.center),'◆ 機体','#fff');if(preview)marker(preview.orbit.r.clone().add(preview.orbit.center),'◇ 噴射','#7de6ef');
  status.textContent=(extent/1000).toFixed(0)+' km';for(const b of toolbar.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.focus===focus));
 }
 return {update(o,p){if(current?.bodyId!==o.bodyId)extent=null;current=o;preview=p;draw();}};
}
export function mountMapPanels(){
 const readings=document.querySelector('.mapReadings'),plan=document.createElement('details');plan.id='mapPlanPanel';const label=document.createElement('summary');label.textContent='マニューバ';plan.append(label,...readings.querySelectorAll('fieldset'));readings.prepend(plan);
 const info=document.createElement('details');info.id='mapOrbitPanel';const summary=document.createElement('summary');summary.textContent='軌道情報';info.append(summary);for(const id of ['orbitPeriod','apoapsisPlan','periapsisPlan','orbitPlanNote'])info.append(document.getElementById(id));readings.append(info);
 for(const small of plan.querySelectorAll('small')){small.previousElementSibling?.setAttribute('title',small.textContent);small.hidden=true;}
 const note=readings.querySelector(':scope>p:last-of-type');if(note&&!note.id)note.hidden=true;
 document.querySelector('.mapHeader h2').firstChild.textContent='';document.querySelector('#closeOrbitMap').textContent='飛行へ M';
}
