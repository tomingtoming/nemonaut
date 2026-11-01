import * as T from 'three';

// r × F reproduces only the torque perpendicular to F. The parallel
// component is a free couple and must never be disguised as a line offset.
export interface ThrustBalance{force:T.Vector3Tuple;torque:T.Vector3Tuple;com:T.Vector3Tuple}
export interface ThrustLine{point:T.Vector3Tuple;direction:T.Vector3Tuple;offset:T.Vector3Tuple;axialTorque:number}
export function equivalentThrustLine(balance:ThrustBalance):ThrustLine|null{
 const force=new T.Vector3(...balance.force),torque=new T.Vector3(...balance.torque),com=new T.Vector3(...balance.com);
 if(force.lengthSq()<1e-16)return null;
 const direction=force.clone().normalize(),offset=force.clone().cross(torque).divideScalar(force.lengthSq());
 return {point:com.clone().add(offset).toArray(),direction:direction.toArray(),offset:offset.toArray(),axialTorque:torque.dot(direction)};
}

export interface ThrustOverlay{update(balance:ThrustBalance|null|undefined):void;dispose():void}
export function mountThrustOverlay(scene:T.Object3D):ThrustOverlay{
 const group=new T.Group();group.name='design-thrust-overlay';scene.add(group);
 function clear(){for(const child of [...group.children]){child.traverse((o:T.Object3D&{geometry?:T.BufferGeometry;material?:T.Material|T.Material[]})=>{o.geometry?.dispose();if(o.material)for(const m of [o.material].flat())m.dispose();});group.remove(child);}}
 function line(points:T.Vector3[],color:number){const material=new T.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.9}),mesh=new T.Line(new T.BufferGeometry().setFromPoints(points),material);mesh.renderOrder=30;group.add(mesh);}
 function update(balance:ThrustBalance|null|undefined){clear();group.visible=!!balance;if(!balance)return;
  const com=new T.Vector3(...balance.com),size=.4;
  for(const axis of [new T.Vector3(1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,0,1)])line([com.clone().addScaledVector(axis,-size),com.clone().addScaledVector(axis,size)],0xff70dd);
  const ring=[];for(let i=0;i<=48;i++)ring.push(com.clone().add(new T.Vector3(Math.cos(i/48*Math.PI*2)*size,Math.sin(i/48*Math.PI*2)*size,0)));line(ring,0xff70dd);
  const result=equivalentThrustLine(balance);if(!result)return;
  const point=new T.Vector3(...result.point),direction=new T.Vector3(...result.direction),length=4;
  line([com,point],0xff70dd);line([point.clone().addScaledVector(direction,-length),point.clone().addScaledVector(direction,length)],0xffa43b);
  const side=new T.Vector3(Math.abs(direction.x)<.8?1:0,Math.abs(direction.x)<.8?0:1,0).cross(direction).normalize();
  const tip=point.clone().addScaledVector(direction,length),base=tip.clone().addScaledVector(direction,-.55);
  line([base.clone().addScaledVector(side,.22),tip,base.clone().addScaledVector(side,-.22)],0xffa43b);
 }
 return {update,dispose(){clear();scene.remove(group);}};
}
