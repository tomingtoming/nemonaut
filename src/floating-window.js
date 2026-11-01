// @ts-nocheck: typing debt (BACKLOG 4d). Remove this line once tsc passes the file.
let top=30;
export function floatingWindow(host,{title,x,y,onClose}){
 const element=document.createElement('section');element.className='floatingWindow';element.setAttribute('role','dialog');element.setAttribute('aria-label',title);
 const header=document.createElement('header'),name=document.createElement('b'),pin=document.createElement('button'),close=document.createElement('button'),content=document.createElement('div');name.textContent=title;content.className='floatingContent';pin.textContent='⌖';pin.setAttribute('aria-label','窓を固定');pin.setAttribute('aria-pressed','false');close.textContent='×';close.setAttribute('aria-label','閉じる');header.append(name,pin,close);element.append(header,content);host.append(element);
 let pinned=false,drag=null;const front=()=>element.style.zIndex=++top;
 const position=(left,up)=>{element.style.left=Math.max(4,Math.min(left,innerWidth-element.offsetWidth-4))+'px';element.style.top=Math.max(4,Math.min(up,innerHeight-element.offsetHeight-4))+'px';};
 position(x,y);front();element.addEventListener('pointerdown',front);
 pin.onclick=()=>{pinned=!pinned;pin.setAttribute('aria-pressed',String(pinned));};close.onclick=onClose;
 header.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,left:element.offsetLeft,top:element.offsetTop};header.setPointerCapture(e.pointerId);e.preventDefault();});
 header.addEventListener('pointermove',e=>{if(drag)position(drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y);});
 for(const type of ['pointerup','pointercancel'])header.addEventListener(type,()=>drag=null);
 element.addEventListener('keydown',e=>{if(e.code==='Escape'){onClose();e.preventDefault();}e.stopPropagation();});
 const resize=()=>position(element.offsetLeft,element.offsetTop);window.addEventListener('resize',resize);
 return {element,content,get pinned(){return pinned;},front,clamp:resize,remove(){window.removeEventListener('resize',resize);element.remove();}};
}
