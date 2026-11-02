// Local Y is the fuselage axis; local +Z is the cargo opening.
export interface CargoBox{center:number[];size:number[];rotation?:number[]}
export interface CargoBayDefinition{size:readonly number[];cargoBay:{wall:number};massCenter?:readonly number[]}
/** Narrows a catalogue definition to one with a cargo bay (the check the callers already make). */
export function hasCargoBay<D extends {cargoBay?:{wall:number}}>(d:D):d is D&{cargoBay:{wall:number}}{return !!d.cargoBay;}
export function cargoShellBoxes(d:CargoBayDefinition,open=false):CargoBox[]{
 const [w,l,h]=d.size,t=d.cargoBay.wall,r=w/2-t/2,N=24,boxes:CargoBox[]=[];
 for(let i=0;i<N;i++){
  const theta=(i+.5)*2*Math.PI/N,x=r*Math.sin(theta),z=r*Math.cos(theta),side=Math.sign(x);
  boxes.push({center:[x+(open&&z>0?side*w/2:0),0,z],size:[2*r*Math.tan(Math.PI/N),l,t],rotation:[0,theta,0]});
 }
 boxes.push({center:[0,0,-2.38],size:[3,9.2,.16]});
 return boxes;
}
export function cargoMassCenter(d:CargoBayDefinition):number[]{
 const result=[0,0,0];let total=0;
 for(const b of cargoShellBoxes(d)){const v=b.size.reduce((a,b)=>a*b,1);total+=v;b.center.forEach((n,i)=>result[i]+=n*v);}
 return result.map(n=>n/total);
}
export function cargoCollisionBoxes(d:CargoBayDefinition,open=false):CargoBox[]{return cargoShellBoxes(d,open).map(b=>({...b,center:b.center.map((n,i)=>n-(d.massCenter?.[i]||0))}));}
export function syncCargoVisual(visual:import('three').Object3D,p:{cargoOpen?:boolean},d:{cargoBay?:unknown;size:readonly number[]}):void{
 if(!d.cargoBay)return;
 for(const [name,side]of [['CargoDoorLeft',-1],['CargoDoorRight',1]] as const){
  const door=visual.getObjectByName(name);if(door)door.position.x=side*(p.cargoOpen?d.size[0]/2:0);
 }
}
