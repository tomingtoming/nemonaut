import {PARTS} from './catalog.js';
import {partSettings,type SettablePart} from './part-settings.js';
import {symmetryTargets} from './symmetry.js';
import {floatingWindow,type FloatingWindow} from './floating-window.js';
export type PartRangeInput=Omit<HTMLInputElement,'min'|'max'|'step'>&{min:string|number;max:string|number;step:string|number};
export interface DesignPartWindowRow{input:PartRangeInput;state:HTMLElement;value:HTMLSpanElement}
export interface DesignPartWindow extends FloatingWindow{rows:Map<string,DesignPartWindowRow>;link:HTMLInputElement}
export type DesignPartChange=(id:string,key:string,value:boolean|number,linked:boolean)=>void;
export interface DesignPartWindows{open(id:string,x:number,y:number):void;update():void;clear():void}
export function mountDesignPartWindows(getParts:()=>SettablePart[]|null|undefined,change:DesignPartChange,highlight:(id:string|null)=>void=()=>{}):DesignPartWindows{
 const host=document.createElement('div');host.id='designPartWindows';document.body.append(host);const windows=new Map<string,DesignPartWindow>();
 const close=(id:string):void=>{windows.get(id)?.remove();windows.delete(id);highlight(null);};
 function clear(){for(const id of windows.keys())close(id);}
 function update(){const parts=getParts();if(!parts){clear();return;}
  for(const [id,w]of windows){const p=parts.find(p=>p.id===id);if(!p){close(id);continue;}const group=symmetryTargets(parts,id),targets=symmetryTargets(parts,id,w.link.checked);w.link.parentElement!.hidden=group.length<2;
   for(const s of partSettings(p)){const row=w.rows.get(s.key);if(!row)continue;const mixed=targets.some(q=>partSettings(q).find(a=>a.key===s.key)?.value!==s.value);row.state.textContent=mixed?'混在':'';
    if(s.type==='boolean'){row.input.checked=s.value;row.input.indeterminate=mixed;}else{row.input.value=String(s.value*s.max);row.value.textContent=(s.unit==='°'?Number(row.input.value).toFixed(1):Math.round(Number(row.input.value)))+s.unit;}
   }
  }
 }
 function open(id:string,x:number,y:number):void{const parts=getParts(),p=parts?.find(p=>p.id===id);if(!p)return;if(windows.has(id)){windows.get(id)!.front();return;}for(const [other,w]of windows)if(!w.pinned)close(other);
  const w=floatingWindow(host,{title:PARTS[p.type].name+' · '+(parts!.indexOf(p)+1),x:x+12,y:y+12,onClose:()=>close(id)}) as DesignPartWindow;windows.set(id,w);w.rows=new Map<string,DesignPartWindowRow>();w.element.onpointerenter=()=>highlight(id);w.element.onpointerleave=()=>highlight(null);
  const link=document.createElement('label');w.link=document.createElement('input');w.link.type='checkbox';w.link.checked=true;link.append('対称配置に適用',w.link);w.content.append(link);w.link.onchange=update;
  for(const s of partSettings(p)){const label=document.createElement('label'),input=document.createElement('input') as PartRangeInput,state=document.createElement('small'),value=document.createElement('span');input.setAttribute('aria-label',s.label);const name=document.createElement('span');name.append(s.label,state);label.append(name);
   if(s.type==='boolean')input.type='checkbox';else{label.className='partThrustLimit';input.type='range';input.min=0;input.max=s.max;input.step=s.step;label.append(value);input.oninput=()=>{value.textContent=Number(input.value).toFixed(s.unit==='°'?1:0)+s.unit;};}
   label.append(input);w.content.append(label);w.rows.set(s.key,{input,state,value});input.onchange=()=>{change(id,s.key,s.type==='boolean'?input.checked:Number(input.value)/s.max,w.link.checked);update();};
  }
  if(!w.rows.size){const text=document.createElement('output');text.textContent='設定なし';w.content.append(text);}update();w.clamp();
 }
 return {open,update,clear};
}
