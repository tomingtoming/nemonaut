import {PLANET} from './planet.js';
import {projectTrackingPoint} from './tracking-orbits.js';
export const TRACKING_COLORS=['#ffc18a','#7de6ef','#b6ec91','#daafff','#ff9db2','#eee29e'];
export function mountTrackingMap(host,rows,onSelect){
 const wrap=document.createElement('section');wrap.className='trackingMap';
 wrap.innerHTML='<canvas width="900" height="490" aria-label="全機体の軌道と位置。下の機体一覧で選択できます。"></canvas><div class="trackingMapControls"><label>方位 <input aria-label="軌道図の方位" type="range" min="-180" max="180" value="35"></label><label>傾き <input aria-label="軌道図の傾き" type="range" min="-89" max="89" value="25"></label><button type="button">視点を戻す</button></div><p class="trackingMapLegend"></p><small>現在の位置・速度から求めた二体軌道。大気抵抗と噴射は含みません。惑星の裏側の機体は白い破線で表示。表示範囲外の軌道は省略します。</small>';
 host.append(wrap);const canvas=wrap.querySelector('canvas'),ctx=canvas.getContext('2d'),inputs=wrap.querySelectorAll('input'),legend=wrap.querySelector('p');
 let selected=rows[0]?.id,markers=[];
 const radius=rows.reduce((max,r)=>r.segments.reduce((extent,s)=>Math.max(extent,...s.map(p=>Math.hypot(...p)*1.08)),Math.max(max,Math.hypot(...r.position)*1.15)),PLANET.radius*1.3);
 function draw(){
  const w=canvas.width,h=canvas.height,scale=(h/2-38)/radius,cx=w/2,cy=h/2,yaw=+inputs[0].value*Math.PI/180,pitch=+inputs[1].value*Math.PI/180,pr=PLANET.radius*scale;
  const project=p=>{const [x,y,z]=projectTrackingPoint(p,yaw,pitch);return [cx+x*scale,cy-y*scale,z];};
  ctx.fillStyle='#0d1a23';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#233946';ctx.lineWidth=1;
  for(let i=-4;i<=4;i++){ctx.beginPath();ctx.moveTo(cx+i*50,15);ctx.lineTo(cx+i*50,h-15);ctx.stroke();}
  const grad=ctx.createRadialGradient(cx-pr*.35,cy-pr*.4,0,cx,cy,pr);grad.addColorStop(0,'#38616a');grad.addColorStop(1,'#152f40');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(cx,cy,pr,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#56848f';ctx.beginPath();ctx.arc(cx,cy,pr*(1+PLANET.atmosphereTop/PLANET.radius),0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#92aeb8';ctx.font='12px sans-serif';ctx.fillText('惑星半径 600 km / 大気上限 70 km',18,24);ctx.fillText('表示半径 '+(radius/1000).toFixed(0)+' km',18,h-18);
  for(const [index,row] of rows.entries()){
   ctx.strokeStyle=TRACKING_COLORS[index%TRACKING_COLORS.length];ctx.lineWidth=row.id===selected?2.5:1;ctx.globalAlpha=row.id===selected?1:.5;ctx.beginPath();
   for(const segment of row.segments){const a=project(segment[0]),b=project(segment[1]),mx=(a[0]+b[0])/2-cx,my=(a[1]+b[1])/2-cy,mz=(a[2]+b[2])/2;if(mz<0&&mx*mx+my*my<pr*pr)continue;ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}ctx.stroke();
  }
  ctx.globalAlpha=1;markers=[];
  for(const [index,row] of rows.entries()){
   const [x,y,z]=project(row.position),back=z<0&&(x-cx)**2+(y-cy)**2<pr*pr,color=TRACKING_COLORS[index%TRACKING_COLORS.length];markers.push({x,y,id:row.id});
   ctx.strokeStyle=back?'#edf7fa':color;ctx.fillStyle=color;ctx.lineWidth=row.id===selected?3:1.5;ctx.setLineDash(back?[3,3]:[]);ctx.beginPath();ctx.arc(x,y,row.id===selected?8:5,0,Math.PI*2);if(!back)ctx.fill();ctx.stroke();ctx.setLineDash([]);
   ctx.font='bold 12px sans-serif';ctx.fillStyle=color;ctx.fillText(String(index+1),Math.min(w-22,x+12),Math.max(40,y-8));
  }
  const selectedRow=rows.find(r=>r.id===selected);legend.textContent=selectedRow?'選択：'+selectedRow.name+' · '+selectedRow.status+' · 高度 '+(selectedRow.altitude/1000).toFixed(2)+' km':'進行中の機体はありません。';
 }
 function select(id){selected=id;draw();}
 for(const input of inputs)input.oninput=draw;
 wrap.querySelector('button').onclick=()=>{inputs[0].value=35;inputs[1].value=25;draw();};
 canvas.onclick=e=>{const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*canvas.width/rect.width,y=(e.clientY-rect.top)*canvas.height/rect.height,hit=markers.map(m=>({...m,d:Math.hypot(m.x-x,m.y-y)})).filter(m=>m.d<18).sort((a,b)=>a.d-b.d)[0];if(hit){select(hit.id);onSelect(hit.id);}};
 draw();return {select};
}
