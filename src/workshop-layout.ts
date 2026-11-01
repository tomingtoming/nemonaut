import * as T from 'three';

export interface WorkshopLayout{origin:number[];roomScale:number[];platformScale:number;gridSize:number}
export interface WorkshopFrame{target:T.Vector3;distance:number;maxDistance:number;fogNear:number;fogFar:number}
export function workshopLayout(bounds:T.Box3,fov=40,aspect=1):WorkshopLayout{
 if(bounds.isEmpty())return {origin:[0,0,0],roomScale:[1,1,1],platformScale:1,gridSize:80};
 const size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 const x=Math.round(center.x),z=Math.round(center.z),floor=Math.min(0,bounds.min.y-.2);
 const width=2*Math.max(Math.abs(bounds.min.x-x),Math.abs(bounds.max.x-x));
 const depth=2*Math.max(Math.abs(bounds.min.z-z),Math.abs(bounds.max.z-z));
 // Keep the framing camera inside the hangar, including the narrower viewport axis.
 const clearance=workshopFrame(bounds,fov,aspect)!.distance+2;
 const roomScale=[Math.max(1,(width+8)/36,clearance/18),Math.max(1,(bounds.max.y-floor+4)/18,(center.y-floor+clearance)/19),Math.max(1,(depth+12)/40,clearance/20)];
 return {origin:[x,floor,z],roomScale,platformScale:Math.max(1,(Math.hypot(width,depth)/2+.8)/4.9),gridSize:Math.ceil(Math.max(80,width+30,depth+30)/2)*2};
}

export function workshopFrame(bounds:T.Box3,fov:number,aspect:number):WorkshopFrame|null{
 if(bounds.isEmpty())return null;
 const target=bounds.getCenter(new T.Vector3()),radius=bounds.getSize(new T.Vector3()).length()/2;
 const vertical=T.MathUtils.degToRad(fov)/2,horizontal=Math.atan(Math.tan(vertical)*Math.max(.01,aspect));
 const distance=Math.max(7,radius/Math.sin(Math.min(vertical,horizontal))*1.15);
 return {target,distance,maxDistance:Math.max(80,distance*3),fogNear:Math.max(55,distance*1.2),fogFar:Math.max(135,distance*4)};
}
