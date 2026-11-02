import * as T from 'three';
import {floatingWindow} from './floating-window.js';
import {PARTS} from './catalog.js';
import {buoyancyBalance,type BuoyantPart} from './buoyancy.js';

/** The design state the buoyancy panel reads on each update. */
export interface BuoyancyPanelState{parts:readonly BuoyantPart[];flight:unknown;atCenter:unknown}
export interface BuoyancyPanel{update():void}
export function mountBuoyancyPanel(document:Document,scene:T.Object3D,getState:()=>BuoyancyPanelState,baseComMarker:{material:T.Material}):BuoyancyPanel{
 const button=document.createElement('button');button.textContent='浮力中心';button.title='全没時の浮力中心と重心';button.setAttribute('aria-pressed','false');document.querySelector('.viewactions')!.append(button);
 const window=floatingWindow(document.body,{title:'浮力中心 · 全没時',x:document.documentElement.clientWidth-280,y:112,onClose:()=>{open=false;button.classList.remove('active');button.setAttribute('aria-pressed','false');update();}}),panel=window.content;panel.classList.add('buoyancyPanel');
 panel.innerHTML='<label>バラスト <output>0%</output><input type="range" min="0" max="100" value="0" aria-label="設計時のバラスト注水率"></label><div class="buoyancyLegend"><span>● 重心</span><span>◇ 浮力中心</span></div><dl><dt>質量</dt><dd></dd><dt>排水量</dt><dd></dd><dt>浮力中心 − 重心（高さ）</dt><dd></dd></dl>';

 const group=new T.Group();group.name='design-buoyancy';scene.add(group);
 const marker=(radius:number,color:string,wireframe:boolean)=>{const m=new T.Mesh(new T.SphereGeometry(radius,16,12),new T.MeshBasicMaterial({color,wireframe,depthTest:false,depthWrite:false}));m.renderOrder=31;group.add(m);return m;};
 const massMarker=marker(.1,'#e7cf4c',false),buoyMarker=marker(.21,'#bf8dff',true),input=panel.querySelector('input')!,values=panel.querySelectorAll('dd');let open=false;
 function update(){
  const {parts,flight,atCenter}=getState(),visible=open&&!flight&&!atCenter;window.element.hidden=!visible;group.visible=visible;baseComMarker.material.visible=!visible;if(!visible)return;
  const hasBallast=parts.some(p=>PARTS[p.type].ballast);input.closest('label')!.hidden=!hasBallast;const ballast=hasBallast?Number(input.value)/100:0,b=buoyancyBalance(parts,ballast);
  panel.querySelector('output')!.textContent=Math.round(ballast*100)+'%';massMarker.position.copy(b.com);buoyMarker.position.copy(b.center);group.visible=parts.length>0;
  values[0].textContent=(b.mass/1000).toFixed(2)+' t';values[1].textContent=(b.displacement/1000).toFixed(2)+' t';const delta=b.center.y-b.com.y;values[2].textContent=(delta>=0?'+':'')+delta.toFixed(2)+' m';
 }
 button.onclick=()=>{open=!open;button.classList.toggle('active',open);button.setAttribute('aria-pressed',String(open));update();};input.oninput=update;
 massMarker.renderOrder=32;update();return {update};
}
