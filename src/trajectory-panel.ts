import {predictTrajectoryAsync,trajectoryAt} from './trajectory.js';
import {PLANET,center} from './planet.js';
import {MOON} from './celestial.js';
import {formatDuration} from './orbit-plan.js';
import {projectTrackingPoint} from './tracking-orbits.js';

export function predictionSummary(result){
 const reason={duration:'指定期間の計算完了',surface:'地表到達で打切り',atmosphere:'大気に入るため打切り（抗力は未予測）',budget:'計算量上限で打切り',resolution:'時刻精度の限界で打切り'}[result.reason];
 const encounter=result.events.filter(e=>e.type!=='burn').map(e=>(e.type==='enter-moon'?'月の重力圏へ進入':'月の重力圏を退出')+' ＋'+formatDuration(e.time-result.startTime)).join(' / ');
 const initial=result.points[0].bodyId==='moon'?'開始時は月の重力圏内。':'';
 return reason+' · 予測長 '+formatDuration(result.endTime-result.startTime)+'\n予測内の月最接近：約 '+(result.closest.altitude/1000).toFixed(1)+' km（地表から） · ＋'+formatDuration(result.closest.time-result.startTime)+(result.closest.atBoundary?' · 期間端の最小値、接近の底は未確認':'')+'\n'+initial+(encounter||'この予測範囲では重力圏の出入りなし。');
}

export function mountTrajectoryPanel(host,getSnapshot){
 const panel=document.createElement('details');panel.className='trajectoryPanel';panel.innerHTML='<summary>月への接近予測・計画比較</summary><div class="trajectoryControls"><label>予測期間<select aria-label="接近予測の期間"><option value="3600">1時間</option><option value="21600" selected>6時間</option><option value="86400">24時間</option></select></label><button type="button" data-action="predict">現在の状態から予測</button><button type="button" data-action="cancel" disabled>計算を中断</button><label>表示基準<select aria-label="接近予測の表示基準"><option value="planet">母星</option><option value="moon">月</option></select></label></div><p role="status" class="trajectoryStatus">予測ボタンで開始します。飛行は継続します。</p><canvas width="800" height="360" aria-label="月の未来位置と機体の予測軌跡"></canvas><label class="trajectoryCursor">予測内の時刻 <input aria-label="接近予測の表示時刻" type="range" min="0" max="1000" value="0"></label><p class="trajectoryEpoch"></p><div class="trajectoryResults"></div><small>橙＝無推力、水色＝予定噴射後、灰破線＝月。クリック時点の予測を保持します。操作・噴射・計画変更後は再計算してください。点は同じ時刻の位置です。球形天体・二体近似・瞬間噴射で、抗力・燃料不足・噴射中の姿勢変化は含みません。</small>';
 host.prepend(panel);const status=panel.querySelector('.trajectoryStatus'),results=panel.querySelector('.trajectoryResults'),canvas=panel.querySelector('canvas'),ctx=canvas.getContext('2d'),[duration,frame]=panel.querySelectorAll('select'),cursor=panel.querySelector('input'),predict=panel.querySelector<HTMLButtonElement>('[data-action=predict]'),cancel=panel.querySelector<HTMLButtonElement>('[data-action=cancel]'),epoch=panel.querySelector('.trajectoryEpoch');
 let controller=null,serial=0,data=null;
 function reset(){serial++;controller?.abort();controller=null;data=null;results.replaceChildren();ctx.clearRect(0,0,canvas.width,canvas.height);epoch.textContent='';status.textContent='機体を変更しました。現在の状態から予測してください。';cancel.disabled=true;}
 function draw(){if(!data)return;const records=[data.base,...(data.planned?[data.planned]:[])],moonFrame=frame.value==='moon';
  const relative=(p,moon=false)=>{const v=moon?p.moon:p.position,origin=moonFrame?p.moon:center.toArray();return v.map((n,i)=>n-origin[i]);};
  let extent=moonFrame?MOON.radius*1.5:PLANET.radius*1.5;for(const r of records)for(const p of r.points)extent=Math.max(extent,Math.hypot(...relative(p)),Math.hypot(...relative(p,true)));
  extent*=1.1;const scale=150/extent,project=v=>{const [x,y]=projectTrackingPoint(v,.6,.4);return [400+x*scale,180-y*scale];};
  ctx.fillStyle='#09151f';ctx.fillRect(0,0,800,360);ctx.font='13px sans-serif';
  const dot=(v,r,color)=>{const [x,y]=project(v);ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,Math.max(2,r*scale),0,Math.PI*2);ctx.fill();};
  dot([0,0,0],moonFrame?MOON.radius:PLANET.radius,moonFrame?'#898b8d':'#3f6d76');
  const line=(points,moon,color,dashed)=>{ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash(dashed?[5,5]:[]);ctx.beginPath();points.forEach((p,i)=>{const [x,y]=project(relative(p,moon));if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();ctx.setLineDash([]);};
  if(!moonFrame)line(data.base.points,true,'#8c9196',true);
  const target=data.base.startTime+(Math.max(...records.map(r=>r.endTime))-data.base.startTime)*Number(cursor.value)/1000;
  for(const [i,r]of records.entries()){const color=i?'#7de6ef':'#ffb675';line(r.points,false,color,false);const p=trajectoryAt(r,target);dot(relative(p),extent*.014,color);if(!moonFrame&&i===0)dot(relative(p,true),MOON.radius,'#b0b2b3');}
  ctx.fillStyle='#c6d6df';ctx.fillText((moonFrame?'月':'母星')+'基準 / 表示半径 '+(extent/1000).toFixed(0)+' km',16,25);
  epoch.textContent='予測開始 UT '+data.base.startTime.toFixed(1)+' s · 表示 UT '+target.toFixed(1)+' s（機体位置は補間。打切り後は最終点）';
 }
 predict.onclick=async()=>{const id=++serial;controller?.abort();controller=new AbortController();const signal=controller.signal;cancel.disabled=false;status.textContent='予測を計算中…操作は継続できます。';
  try{const snapshot=getSnapshot();if(!snapshot)throw Error('飛行中の機体がありません');const options={duration:Number(duration.value),signal};
   const base=await predictTrajectoryAsync(snapshot.position,snapshot.velocity,snapshot.time,options);let planned=null;
   if(snapshot.burn)planned=await predictTrajectoryAsync(snapshot.position,snapshot.velocity,snapshot.time,{...options,burn:snapshot.burn});
   if(id!==serial)return;data={base,planned};results.replaceChildren();for(const [label,r]of [['無推力',base],['予定噴射後',planned]])if(r){const p=document.createElement('p');p.textContent=label+'\n'+predictionSummary(r)+(label==='予定噴射後'&&!r.burnApplied?'\n予測範囲内では予定噴射に到達しません。':'');results.append(p);}
   status.textContent=snapshot.name+' · UT '+snapshot.time.toFixed(1)+' s時点の予測'+(snapshot.burn?' · 計画比較あり':' · 比較する将来の噴射計画なし')+(snapshot.note?' · '+snapshot.note:'');cursor.value='0';draw();
  }catch(error){if(id===serial)status.textContent=error.name==='AbortError'?'計算を中断しました。前回の結果があれば保持しています。':error.message;}
  finally{if(id===serial){cancel.disabled=true;controller=null;}}
 };
 cancel.onclick=()=>controller?.abort();frame.onchange=draw;cursor.oninput=draw;
 return {reset};
}
