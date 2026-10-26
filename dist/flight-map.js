import {relativeOrbitPlane} from './relative-orbit-plane.js';
import {maneuverHandles,draggedComponent} from './maneuver-gizmo.js';
import {mapPointEpoch} from './maneuver.js';
import * as T from 'three';
import {PRIMARY,MOON,bodyState} from './celestial.js';
import {center} from './planet.js';
import {projectTrackingPoint} from './tracking-orbits.js';
export function mapConic(o,limit){
 if(o.normal.lengthSq()<.5||o.p<1)return [];
 const x=o.eccentricity>1e-7?o.evec.clone().normalize():o.r.clone().normalize(),y=o.normal.clone().cross(x).normalize(),points=[];
 for(let i=0;i<=720;i++){const a=i*Math.PI/360,den=1+o.eccentricity*Math.cos(a),r=o.p/den;points.push(den>0&&r>=o.body.radius&&r<=Math.min(limit,o.body.sphereOfInfluence??Infinity)?x.clone().multiplyScalar(r*Math.cos(a)).addScaledVector(y,r*Math.sin(a)).add(o.center):null);}return points;
}
export function mountFlightMap(canvas,onTarget=()=>{}){
 const ctx=canvas.getContext('2d');let current=null,preview=null,yaw=1.15,pitch=.4,extent=null,focus='body',drag=null,markers=[],orbitHits=[],handles=[],vessels=[];
 const overlay=document.querySelector('#orbitOverlay'),header=overlay.querySelector('.mapHeader');
 const toolbar=document.createElement('div');toolbar.className='mapToolbar';
 for(const [key,name]of [['body','現在の天体'],['craft','機体'],['planet','母星'],['moon','月'],['system','全体']]){const b=document.createElement('button');b.textContent=name;b.dataset.focus=key;b.onclick=()=>{focus=key;extent=null;draw();};toolbar.append(b);}header.append(toolbar);
 const targetPanel=document.createElement('div');targetPanel.className='mapTargets';const targetSelect=document.createElement('select');targetSelect.setAttribute('aria-label','マップの目標機体');const clear=document.createElement('button');clear.textContent='目標解除';const targetText=document.createElement('small');targetPanel.append(targetSelect,clear,targetText);overlay.append(targetPanel);targetSelect.onchange=()=>onTarget(targetSelect.value||null);clear.onclick=()=>onTarget(null);let targetSignature='';
 const status=document.createElement('span');status.id='mapScale';toolbar.append(status);
 canvas.title='ドラッグで回転 · ホイールで拡大縮小 · 軌道クリックで計画 · 色付きハンドルでΔv調整（Shiftで微調整）';
 canvas.addEventListener('pointerdown',e=>{const rect=canvas.getBoundingClientRect(),handle=handles.find(h=>Math.hypot(h.x-e.clientX+rect.left,h.y-e.clientY+rect.top)<12);drag={x:e.clientX,y:e.clientY,moved:false,handle,start:handle?Number(document.getElementById(handle.id).value):0};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved ||=Math.abs(dx)+Math.abs(dy)>2;if(drag.handle){const input=document.getElementById(drag.handle.id),others=['planDeltaV','planNormal','planRadial'].filter(id=>id!==drag.handle.id).map(id=>Number(document.getElementById(id).value));input.value=String(Number(draggedComponent(drag.start,dx,dy,drag.handle,others,e.shiftKey).toFixed(2)));input.dispatchEvent(new Event('input',{bubbles:true}));return;}yaw+=dx*.006;pitch=T.MathUtils.clamp(pitch+dy*.006,-1.5,1.5);drag.x=e.clientX;drag.y=e.clientY;draw();});
 canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved&&!drag.handle){const rect=canvas.getBoundingClientRect(),hit=markers.map(m=>({...m,d:Math.hypot(m.x-(e.clientX-rect.left),m.y-(e.clientY-rect.top))})).filter(m=>m.d<22).sort((a,b)=>a.d-b.d)[0];if(hit?.key?.startsWith('epoch:')){const select=document.querySelector('#planLocation');select.value='custom';select.dataset.epoch=hit.key.slice(6);document.querySelector('#planEnabled').checked=true;document.querySelector('#mapPlanPanel').open=true;select.dispatchEvent(new Event('input',{bubbles:true}));drag=null;return;}if(hit?.key?.startsWith('vessel:')){onTarget(hit.key.slice(7));drag=null;return;}if(hit?.key==='node'){const edit=document.querySelector('#editManeuver');if(!edit.disabled)edit.click();drag=null;return;}if(hit){document.querySelector('#planLocation').value=hit.key;document.querySelector('#planEnabled').checked=true;document.querySelector('#mapPlanPanel').open=true;document.querySelector('#planLocation').dispatchEvent(new Event('input',{bubbles:true}));}else{const x=e.clientX-rect.left,y=e.clientY-rect.top,near=orbitHits.map(p=>({...p,d:Math.hypot(p.x-x,p.y-y)})).sort((a,b)=>a.d-b.d)[0];if(near&&near.d<14){try{const epoch=mapPointEpoch(current,near.point),select=document.querySelector('#planLocation');select.dataset.epoch=String(epoch);select.value='custom';document.querySelector('#planEnabled').checked=true;document.querySelector('#mapPlanPanel').open=true;select.dispatchEvent(new Event('input',{bubbles:true}));}catch(error){document.querySelector('#mapPlanPanel').open=true;document.querySelector('#maneuverResult').textContent=error.message;}}}}drag=null;});
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
  const path=(points,color,dashed=false,pick=false)=>{ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash(dashed?[7,5]:[]);ctx.beginPath();let prior=false;for(const v of points){if(!v){prior=false;continue;}const [x,y,z]=project(v);const hidden=[[PRIMARY,center],[MOON,moon]].some(([b,p])=>{const [bx,by,bz]=project(p),r=b.radius*scale;return z<bz&&(x-bx)**2+(y-by)**2<r*r;});if(hidden){prior=false;continue;}if(pick)orbitHits.push({x,y,point:v});if(prior)ctx.lineTo(x,y);else ctx.moveTo(x,y);prior=true;}ctx.stroke();ctx.setLineDash([]);};
  const moonOrbit=[];for(let i=0;i<=180;i++){const a=i*Math.PI/90;moonOrbit.push(center.clone().add(new T.Vector3(0,MOON.orbitRadius*Math.cos(a),MOON.orbitRadius*Math.sin(a))));}
  for(const [b,pos]of [[PRIMARY,center],[MOON,moon]].sort((a,b)=>project(a[1])[2]-project(b[1])[2])){
   const [x,y]=project(pos),r=b.radius*scale;if(x+r<0||y+r<0||x-r>w||y-r>h)continue;
   const g=ctx.createRadialGradient(x-r*.4,y-r*.4,0,x,y,Math.max(1,r));g.addColorStop(0,b.id==='moon'?'#c2c1b8':'#628c83');g.addColorStop(.65,b.id==='moon'?'#656971':'#274c63');g.addColorStop(1,'#0a1726');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,Math.max(2,r),0,Math.PI*2);ctx.fill();
   if(b.atmosphereTop){ctx.strokeStyle='#5ea9d855';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,r*(1+b.atmosphereTop/b.radius),0,Math.PI*2);ctx.stroke();}
   ctx.fillStyle='#bdc8d5';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText(b.name,x,y+Math.max(2,r)+18);
  }
  for(const vessel of vessels)if(!vessel.stopped)path(mapConic(vessel.orbit,6e7),vessel.target?'#ee95e8':'#526e78',true);
  orbitHits=[];path(moonOrbit,'#49515c');path(mapConic(o,6e7),'#e5a45b',false,true);if(preview)path(mapConic(preview.orbit,6e7),'#7de6ef',true);
  const marker=(pos,label,color,key)=>{const [x,y,z]=project(pos);if(x<10||y<65||x>w-10||y>h-20)return;ctx.fillStyle=color;ctx.strokeStyle='#03070e';ctx.lineWidth=3;ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();const ly=label==='AN'||label==='DN'?y+24:y-13;ctx.strokeText(label,x,ly);ctx.fillText(label,x,ly);if(key)markers.push({x,y,key});};
  markers=[];for(const [i,v]of vessels.entries())marker(v.position,v.target?'◎ '+v.name:String(i+1),v.target?'#ee95e8':'#8fa7b0','vessel:'+v.id);
  if(o.eccentricity>1e-4&&o.normal.lengthSq()>.5){const axis=o.evec.clone().normalize();for(const [key,label,r,sign]of [['apoapsis','Ap',body.radius+o.apoapsis,-1],['periapsis','Pe',body.radius+o.periapsis,1]])if(Number.isFinite(r)&&r>=body.radius&&r<(body.sphereOfInfluence??Infinity))marker(axis.clone().multiplyScalar(r*sign).add(o.center),label+' '+((r-body.radius)/1000).toFixed(1)+' km','#b9dcff',key);}
  const target=vessels.find(v=>v.target&&!v.stopped),plane=relativeOrbitPlane(o,target?.orbit);if(plane)for(const node of plane.nodes)marker(node.position,node.label,'#bcf18c',node.epoch===null?null:'epoch:'+node.epoch);
  marker(o.r.clone().add(o.center),'◆ 機体','#fff');if(preview)marker(preview.orbit.r.clone().add(preview.orbit.center),'◇ 噴射','#7de6ef',preview.burnVel?null:'node');
  handles=[];if(preview?.burnVel&&document.querySelector('#planEnabled').checked){const [x,y]=project(preview.burnPos);for(const handle of maneuverHandles(preview,yaw,pitch)){const hx=x+handle.dx*60,hy=y+handle.dy*60;ctx.strokeStyle=handle.color;ctx.fillStyle='#15212b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(hx,hy);ctx.stroke();ctx.beginPath();ctx.arc(hx,hy,10,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=handle.color;ctx.font='10px sans-serif';ctx.fillText(handle.label,hx,hy+3);handles.push({...handle,x:hx,y:hy});}}
  status.textContent=(extent/1000).toFixed(0)+' km';for(const b of toolbar.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.focus===focus));
 }
 return {update(o,p,others=[]){vessels=others;const signature=JSON.stringify(others.map(v=>[v.id,v.name]));if(signature!==targetSignature){targetSelect.replaceChildren();const none=document.createElement('option');none.value='';none.textContent='目標未指定';targetSelect.append(none);for(const [i,v]of others.entries()){const option=document.createElement('option');option.value=v.id;option.textContent=(i+1)+'. '+v.name;targetSelect.append(option);}targetSignature=signature;}const target=others.find(v=>v.target);targetSelect.value=target?.id||'';const plane=target&&!target.stopped?relativeOrbitPlane(o,target.orbit):null;targetText.textContent=target?(target.distance/1000).toFixed(2)+' km · '+target.speed.toFixed(2)+' m/s'+(plane?' · 相対傾斜 '+plane.inclination.toFixed(2)+'°':''):'';clear.hidden=!target;if(current?.bodyId!==o.bodyId)extent=null;current=o;preview=p;draw();}};
}
export function mountMapPanels(){
 const edit=document.createElement('button');edit.id='editManeuver';edit.textContent='計画を編集';document.querySelector('#clearManeuver').before(edit);
 const cancel=document.createElement('button');cancel.id='cancelManeuverEdit';cancel.textContent='編集を取消';cancel.hidden=true;document.querySelector('#fixManeuver').after(cancel);

 const existing=document.querySelector('#planDeltaV');existing.closest('label').firstChild.textContent='順行 / 逆行（m/s）';existing.closest('label').title='＋順行、−逆行';
 for(const [id,name,title]of [['planNormal','軌道面 ＋ / −（m/s）','＋は位置×速度の方向、−はその逆'],['planRadial','外向き / 内向き（m/s）','速度に垂直な軌道面内方向。＋外向き、−内向き']]){const label=document.createElement('label');label.textContent=name;label.title=title;const input=document.createElement('input');input.type='number';input.id=id;input.min=-10000;input.max=10000;input.step=1;input.value=0;label.append(input);existing.closest('fieldset').insertBefore(label,document.querySelector('#maneuverResult'));}

 const option=document.createElement('option');option.value='custom';option.textContent='マップ上の指定地点';document.querySelector('#planLocation').append(option);
 const readings=document.querySelector('.mapReadings'),plan=document.createElement('details');plan.id='mapPlanPanel';const label=document.createElement('summary');label.textContent='マニューバ';plan.append(label,...readings.querySelectorAll('fieldset'));readings.prepend(plan);
 const info=document.createElement('details');info.id='mapOrbitPanel';const summary=document.createElement('summary');summary.textContent='軌道情報';info.append(summary);for(const id of ['orbitPeriod','apoapsisPlan','periapsisPlan','orbitPlanNote'])info.append(document.getElementById(id));readings.append(info);
 for(const small of plan.querySelectorAll('small')){small.previousElementSibling?.setAttribute('title',small.textContent);small.hidden=true;}
 const note=readings.querySelector(':scope>p:last-of-type');if(note&&!note.id)note.hidden=true;
 document.querySelector('.mapHeader h2').firstChild.textContent='';document.querySelector('#closeOrbitMap').textContent='飛行へ M';
}
