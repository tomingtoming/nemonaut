import {surfaceRelativeVelocity} from './surface-frame.js';
import * as T from 'three';
import {bodyUp,relativeMotion} from './celestial.js';
type NavigationFrame=import('./navigation-frame.js').NavigationFrame;
export const SAS_MODES={dock:'ポート面を整列',target:'目標方向',relativeRetrograde:'相対速度を減らす方向',maneuver:'予定噴射',hold:'姿勢保持',prograde:'順行',retrograde:'逆行',radial:'天頂',antiradial:'天底',normal:'軌道面＋',antinormal:'軌道面−'};
export interface NavDirections{radial:T.Vector3;antiradial:T.Vector3;prograde:T.Vector3|null;retrograde:T.Vector3|undefined;normal:T.Vector3|null;antinormal:T.Vector3|null}
export interface NavFrame{forward:T.Vector3;right:T.Vector3;top:T.Vector3}
export interface CompassFrame{north:T.Vector3;east:T.Vector3}
export interface NavballReadout{heading:number|null;pitch:number}
export function navigationVelocity(pos:T.Vector3,vel:T.Vector3,time=0,frame:NavigationFrame='orbit'):T.Vector3{return frame==='surface'?surfaceRelativeVelocity(pos,vel,time):relativeMotion(pos,vel,time).velocity;}
export function navDirections(pos:T.Vector3,vel:T.Vector3,time=0,frame:NavigationFrame='orbit'):NavDirections{const velocity=navigationVelocity(pos,vel,time,frame),radial=bodyUp(pos,time),prograde=velocity.length()>.5?velocity.clone().normalize():null,normal=prograde?radial.clone().cross(prograde):null;if(normal&&normal.lengthSq()>1e-8)normal.normalize();else if(normal)normal.set(0,0,0);return {radial,antiradial:radial.clone().negate(),prograde,retrograde:prograde?.clone().negate(),normal:normal?.lengthSq()?normal:null,antinormal:normal?.lengthSq()?normal.clone().negate():null};}
export function attitudeTarget(q:T.Quaternion,forward:T.Vector3,target:T.Vector3|null|undefined):T.Quaternion|null{if(!target)return null;return new T.Quaternion().setFromUnitVectors(forward.clone().applyQuaternion(q).normalize(),target.clone().normalize()).multiply(q).normalize();}
export function navFrame(q:T.Quaternion,rocket:boolean):NavFrame{const forward=new T.Vector3(0,rocket?1:0,rocket?0:1).applyQuaternion(q),right=new T.Vector3(1,0,0).applyQuaternion(q),top=forward.clone().cross(right);return {forward,right,top};}
// +X is celestial north, matching the rotating surface frame. Longitude is
// undefined at the poles: omit compass labels and heading there.
export function compassFrame(pos:T.Vector3,time=0):CompassFrame|null{
 const up=bodyUp(pos,time),north=new T.Vector3(1,0,0).addScaledVector(up,-up.x);
 if(north.lengthSq()<1e-10)return null;
 north.normalize();return {north,east:north.clone().cross(up).normalize()};
}
export function compassHeading(forward:T.Vector3,pos:T.Vector3,time=0):number|null{const frame=compassFrame(pos,time);if(!frame)return null;const n=forward.dot(frame.north),e=forward.dot(frame.east);return n*n+e*e<1e-8?null:(Math.atan2(e,n)*180/Math.PI+360)%360;}
export function drawNavball(canvas:HTMLCanvasElement,q:T.Quaternion,rocket:boolean,pos:T.Vector3,vel:T.Vector3,time=0,frame:NavigationFrame='orbit'):NavballReadout{const ctx=canvas.getContext('2d');if(!ctx)throw Error('2D描画を初期化できません');const w=canvas.width,c=w/2,r=c-4,{forward,right,top}=navFrame(q,rocket),directions=navDirections(pos,vel,time,frame),up=directions.radial,ux=right.dot(up),uy=top.dot(up),uz=forward.dot(up),img=ctx.createImageData(w,w);for(let y=0;y<w;y++)for(let x=0;x<w;x++){const nx=(x-c)/r,ny=(c-y)/r,d=nx*nx+ny*ny;if(d>1)continue;const nz=Math.sqrt(1-d),h=nx*ux+ny*uy+nz*uz,elevation=Math.asin(T.MathUtils.clamp(h,-1,1)),line=Math.abs(h)<.018||Math.abs(Math.sin(elevation*6))<.035,sky=h>=0,color=line?[190,209,213]:sky?[37,96,133]:[136,78,43],shade=.55+.45*nz,i=(y*w+x)*4;img.data[i]=color[0]*shade;img.data[i+1]=color[1]*shade;img.data[i+2]=color[2]*shade;img.data[i+3]=255;}ctx.putImageData(img,0,0);
 const compass=compassFrame(pos,time);
 if(compass){ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3;
  for(const [label,v]of [['N',compass.north],['E',compass.east],['S',compass.north.clone().negate()],['W',compass.east.clone().negate()]] as const){
   if(v.dot(forward)<-.01)continue;const x=c+(r-10)*v.dot(right),y=c-(r-14)*v.dot(top)+12;ctx.strokeStyle='#14212b';ctx.strokeText(label,x,y);ctx.fillStyle=label==='N'?'#ffcf86':'#fff1d8';ctx.fillText(label,x,y);
  }
 }
 for(const [name,color,label]of [['prograde','#b5f778','＋'],['retrograde','#b5f778','×'],['radial','#7de6ef','↑'],['antiradial','#7de6ef','↓'],['normal','#dba2ff','△'],['antinormal','#dba2ff','▽']] as const){const v=directions[name];if(!v||v.dot(forward)<0)continue;const x=c+r*v.dot(right),y=c-r*v.dot(top);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.stroke();ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,x,y);}ctx.strokeStyle='#ffbf68';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(c-25,c);ctx.lineTo(c-9,c);ctx.lineTo(c,c+5);ctx.lineTo(c+9,c);ctx.lineTo(c+25,c);ctx.stroke();ctx.strokeStyle='#8babb4';ctx.beginPath();ctx.arc(c,c,r,0,2*Math.PI);ctx.stroke();return {heading:compassHeading(forward,pos,time),pitch:Math.asin(T.MathUtils.clamp(forward.dot(up),-1,1))*180/Math.PI};}
