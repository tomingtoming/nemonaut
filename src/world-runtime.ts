import {fleet} from './fleet.js';
import type {Flight,FlightInput} from './core.js';
import type {CoastOptions,CoastResult} from './coast-flight.js';
import {resolveWorldTargets} from './relative-navigation.js';
import {advanceWorldPhysics} from './world-physics.js';
import {advanceWorldCoast} from './coast-flight.js';

// Flight trees remain an adapter for staging/docking and existing saves. Only
// this registry and clock are used to schedule live normal/coast simulation.
export class WorldRuntime{
 declare activeVesselId:string;declare universalTime:number;declare vessels:Map<string,Flight>;
 constructor(root:Flight){this.universalTime=root.universalTime;this.replace(root);}
 replace(root:Flight):void{
  const vessels=fleet(root),next=new Map<string,Flight>();
  for(const v of vessels){
   if(next.has(v.vesselId)||v.universalTime!==this.universalTime)throw Error('機体登録のIDまたは世界時刻が不一致です');
   next.set(v.vesselId,v);
  }
  this.vessels=next;this.activeVesselId=root.vesselId;
 }
 get active():Flight|undefined{return this.vessels.get(this.activeVesselId);}
 step(dt:number,input:FlightInput={}):void{
  const vessels=[...this.vessels.values()];resolveWorldTargets(vessels);
  const root=this.active;this.universalTime=advanceWorldPhysics(vessels,this.universalTime,dt,this.activeVesselId,input);if(!root)throw Error('操縦中の機体が見つかりません');this.replace(root);
 }
 coast(duration:number,options:CoastOptions={}):CoastResult{
  const result=advanceWorldCoast([...this.vessels.values()],this.universalTime,this.activeVesselId,duration,options);
  this.universalTime=result.universalTime;return result;
 }
}
