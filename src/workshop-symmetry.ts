export const RADIAL_COUNTS=[1,2,3,4,6,8];
export function nextSymmetry(value:string,mode:string,reverse=false):string{
 const values=mode==='mirror'?['1','mirror']:RADIAL_COUNTS.map(String);
 const i=Math.max(0,values.indexOf(value));return values[(i+(reverse?-1:1)+values.length)%values.length];
}
export interface WorkshopSymmetry{toggle():void;cycle(reverse?:boolean):void;setBay(bay:string):void}
export function mountWorkshopSymmetry(select:HTMLSelectElement,button:HTMLElement):WorkshopSymmetry{
 let mode='radial',radial='1';
 function render(value:string){
  select.innerHTML=mode==='mirror'?'<option value="1">なし</option><option value="mirror">鏡面 ×2</option>':RADIAL_COUNTS.map(n=>`<option value="${n}">${n===1?'なし':'軸対称 ×'+n}</option>`).join('');
  select.value=value;button.textContent=(mode==='mirror'?'鏡面':'軸対称')+' R';
 }
 select.onchange=()=>{if(mode==='radial')radial=select.value;};
 function toggle(){if(select.disabled)return;if(mode==='radial'){radial=select.value;mode='mirror';render('mirror');}else{mode='radial';render(radial);}}
 button.onclick=toggle;render('1');
 return {toggle,cycle(reverse=false){if(select.disabled)return;select.value=nextSymmetry(select.value,mode,reverse);(select.onchange as ()=>void)();},setBay(bay:string){mode=bay==='sph'?'mirror':'radial';render(mode==='mirror'?'mirror':radial);}};
}
