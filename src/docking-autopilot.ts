import * as T from 'three';
import {PARTS} from './catalog.js';
import {partCenter} from './aero.js';
import {canControl,fleet} from './fleet.js';
import {bodyOrbitState} from './celestial.js';
import {centerOfVessel,type DockingPortPair} from './relative-navigation.js';
import {portGuidance,type PortGuidance} from './port-navigation.js';
import {dockingStatus} from './docking.js';

// Automatic docking with RCS. The structure follows MechJeb2's docking autopilot (design only,
// no code: MechJeb2 is GPL-3.0): align the own port with the target port, keep clear of the
// target on a safety sphere, move around it to a standby point on the port axis, then approach
// along the axis with a speed that shrinks with distance. Commands are target-port-frame
// translations (portForward/Right/Up); the existing docking wait performs the actual coupling.
export const DOCKING_AUTOPILOT={margin:2,standbyMin:8,routeSpeed:1,routeGain:.25,approachSpeed:.5,finalSpeed:.15,lateralGain:.15,velocityGain:2,
 holdTolerance:1,holdSpeed:.08,corridor:.5,timeLimit:1800,startRange:500,startSpeed:1};
type Flight=import('./core.js').Flight;
/** Target-port-frame translation commands (FlightInput portForward/portRight/portUp). */
export interface DockingCommands{portForward:number;portRight:number;portUp:number}
export type DockingAutopilotState='idle'|'aligning'|'routing'|'holding'|'approaching'|'docking'|'complete'|'cancelled'|'failed';
/** Safety sphere around the target and the standby point on the port axis. */
export interface DockingPlan{center:T.Vector3;radius:number;standby:number;point:T.Vector3}
const zero=():DockingCommands=>({portForward:0,portRight:0,portUp:0});
const clamp=(x:number,a=1)=>T.MathUtils.clamp(x,-a,a);
const fuelAvailable=(f:Flight)=>f.parts.some(p=>PARTS[p.type].rcsThrust&&p.fuelEnabled!==false&&(f.fuel.get(p.id)||0)>0);
const signature=(f:Flight)=>JSON.stringify(f.parts.map(p=>[p.id,p.p,p.r,p.fuelEnabled]));
// Farthest material point from `point`, using each part's bounding sphere.
function reach(v:Flight,point:T.Vector3):number{
 return v.parts.reduce((r,p)=>Math.max(r,partCenter(p).applyQuaternion(v.q).add(v.pos).distanceTo(point)+Math.hypot(...PARTS[p.type].size)/2),0);
}
export class DockingAutopilot{
 declare elapsed:number;declare state:DockingAutopilotState;declare held:number;declare message:string;declare ownParts:Set<string>;declare ownShape:string;declare owner:Flight|null;declare peak:{speed:number};declare ports:DockingPortPair;declare previous:Pick<Flight,'sas'|'sasMode'|'rcsEnabled'|'portTranslationEnabled'>;declare stable:number;declare target:Flight;declare targetShape:string;
 constructor(){this.owner=null;this.state='idle';this.message='待機';}
 get active():boolean{return !!this.owner;}
 start(f:Flight|null|undefined):void{
  if(this.owner)throw Error('自動ドッキングを中止してから開始してください');
  const target=f?.navigationTarget,ports=f?.dockingPorts;
  if(!f||!canControl(f)||!target||target.crashed||!fleet(f).includes(target)||!ports)throw Error('操作可能な機体と、目標機のポートを選択してください');
  if(f.throttle!==0)throw Error('主エンジンを停止してください');
  if(!fuelAvailable(f))throw Error('供給可能なRCS推進剤が必要です');
  const own=bodyOrbitState(centerOfVessel(f),f.vel,f.universalTime),other=bodyOrbitState(centerOfVessel(target),target.vel,target.universalTime);
  if(own.bodyId!==other.bodyId||own.altitude<Math.max(1000,own.body.atmosphereTop??0)||other.altitude<Math.max(1000,other.body.atmosphereTop??0))throw Error('同じ天体の大気圏外で開始してください');
  const nav=portGuidance(f,ports.own,target,ports.target);
  if(!nav||nav.own.position.distanceTo(nav.target.position)>DOCKING_AUTOPILOT.startRange||nav.speed>DOCKING_AUTOPILOT.startSpeed)throw Error('目標ポートまで500 m以内、相対速度1 m/s以下にしてから開始してください');
  if(target.omega.length()>.03)throw Error('目標機の回転を止めてください');
  this.previous={sas:f.sas,sasMode:f.sasMode,rcsEnabled:f.rcsEnabled,portTranslationEnabled:f.portTranslationEnabled};
  this.owner=f;this.target=target;this.ports={...ports};this.ownParts=new Set(f.parts.map(p=>p.id));this.ownShape=signature(f);this.targetShape=signature(target);
  this.elapsed=0;this.stable=0;this.held=0;this.state='aligning';this.message='ポート整列';this.peak={speed:0};
 }
 stop(state:DockingAutopilotState='cancelled',message='中止'):void{
  if(!this.owner)return;
  if(state!=='complete'){Object.assign(this.owner,this.previous);this.owner.holdQ=this.owner.q.clone();}
  this.owner=null;this.state=state;this.message=message;
 }
 // Geometry of the route: safety sphere around the target and the standby point on the port axis.
 plan(f:Flight,nav:PortGuidance):DockingPlan{
  const center=centerOfVessel(this.target),radius=reach(this.target,center)+reach(f,nav.own.position)+DOCKING_AUTOPILOT.margin;
  const depth=nav.target.position.clone().sub(center).dot(nav.outward),standby=Math.max(DOCKING_AUTOPILOT.standbyMin,radius-depth+1);
  return {center,radius,standby,point:nav.target.position.clone().addScaledVector(nav.outward,standby)};
 }
 step(f:Flight,dt:number):DockingCommands{
  if(!this.owner)return zero();
  if(f!==this.owner){
   // The docking wait replaced the flight with the coupled vessel.
   if(this.owner.parts.every(p=>f.parts.some(q=>q.id===p.id))&&[...this.ownParts].every(id=>f.parts.some(p=>p.id===id))&&f.parts.length>this.ownParts.size){this.owner=null;this.state='complete';this.message='結合完了';}
   else this.stop('cancelled','機体切替');
   return zero();
  }
  if(!Number.isFinite(dt)||dt<0){this.stop('failed','無効な時間刻み');return zero();}if(dt===0)return zero();
  if(!canControl(f)||f.navigationTarget!==this.target||this.target.crashed||f.crashed||!fleet(f).includes(this.target)||JSON.stringify(f.dockingPorts)!==JSON.stringify(this.ports)||signature(f)!==this.ownShape||signature(this.target)!==this.targetShape){this.stop('cancelled','機体またはポートが変更されました');return zero();}
  if(f.throttle!==0){this.stop('cancelled','主エンジン操作');return zero();}
  if(this.elapsed>0&&(!f.sas||f.sasMode!=='dock'||!f.rcsEnabled||!f.portTranslationEnabled)){
   const changed=Object.fromEntries(Object.entries({sas:true,sasMode:'dock',rcsEnabled:true,portTranslationEnabled:true}).filter(([k,v])=>f[k as keyof DockingAutopilot['previous']]!==v).map(([k])=>[k,f[k as keyof DockingAutopilot['previous']]]));
   this.stop('cancelled','操縦設定の変更');Object.assign(f,changed);return zero();
  }
  if(!fuelAvailable(f)){this.stop('failed','RCS推進剤不足');return zero();}
  if(this.target.omega.length()>.03){this.stop('failed','目標機が回転しています');return zero();}
  const nav=portGuidance(f,this.ports.own,this.target,this.ports.target);
  if(!nav){this.stop('cancelled','ポートを失いました');return zero();}
  this.elapsed+=dt;this.peak.speed=Math.max(this.peak.speed,nav.speed);
  if(this.elapsed>DOCKING_AUTOPILOT.timeLimit||nav.speed>2.5||nav.own.position.distanceTo(nav.target.position)>DOCKING_AUTOPILOT.startRange+50){this.stop('failed','接近範囲を維持できませんでした');return zero();}
  if(dockingStatus(f,this.ports.own,this.target,this.ports.target).ready){this.state='docking';this.message='結合条件成立';return zero();}
  f.sas=true;f.sasMode='dock';f.rcsEnabled=true;f.portTranslationEnabled=true;
  const aligned=nav.angle<5*Math.PI/180&&f.omega.clone().sub(this.target.omega).length()<.03;
  this.stable=aligned?this.stable+dt:0;
  const relative=nav.outward.clone().multiplyScalar(-nav.closing).addScaledVector(nav.right,nav.horizontalSpeed).addScaledVector(nav.top,nav.verticalSpeed);
  const plan=this.plan(f,nav),port=nav.own.position,fromCenter=port.clone().sub(plan.center),distance=fromCenter.length();
  let desired=new T.Vector3();
  if(this.stable<.5){
   // Hold relative position while the port turns; back away if already inside the safety sphere.
   this.state='aligning';this.message='ポート整列';
   if(distance<plan.radius)desired.copy(fromCenter).normalize().multiplyScalar(.3);
   if(this.elapsed>90&&nav.angle>10*Math.PI/180){this.stop('failed','ポートを整列できませんでした');return zero();}
  }else{
   const inCorridor=nav.axial>0&&nav.lateral<Math.max(DOCKING_AUTOPILOT.corridor,nav.axial*.1)&&(this.state==='approaching'||nav.axial<=plan.standby+DOCKING_AUTOPILOT.holdTolerance);
   const atStandby=port.distanceTo(plan.point)<DOCKING_AUTOPILOT.holdTolerance&&relative.length()<DOCKING_AUTOPILOT.holdSpeed;
   if(this.state==='approaching'||inCorridor&&(this.state==='holding'||atStandby||nav.lateral<DOCKING_AUTOPILOT.corridor)){
    // Final approach on the port axis: lateral errors are removed first, speed shrinks with distance.
    this.state='approaching';this.message='最終接近 '+nav.axial.toFixed(1)+' m';
    const lateral=nav.right.clone().multiplyScalar(clamp(-nav.horizontal*DOCKING_AUTOPILOT.lateralGain,.3)).addScaledVector(nav.top,clamp(-nav.vertical*DOCKING_AUTOPILOT.lateralGain,.3));
    const cap=nav.axial<2?DOCKING_AUTOPILOT.finalSpeed:DOCKING_AUTOPILOT.approachSpeed,forward=nav.lateral>Math.max(.2,nav.axial*.05)?0:Math.min(cap,Math.max(.05,nav.axial*.12));
    desired.copy(lateral).addScaledVector(nav.outward,-forward);
   }else if(atStandby||this.state==='holding'&&port.distanceTo(plan.point)<DOCKING_AUTOPILOT.holdTolerance*2){
    this.held=this.state==='holding'?this.held+dt:0;this.state='holding';this.message='待機点で静止';
    desired.copy(plan.point).sub(port).multiplyScalar(.3);
   }else{
    // Route to the standby point, staying on or outside the safety sphere.
    this.state='routing';
    const toGoal=plan.point.clone().sub(port),remaining=toGoal.length(),speed=Math.max(.1,Math.min(DOCKING_AUTOPILOT.routeSpeed,remaining*DOCKING_AUTOPILOT.routeGain));
    const out=fromCenter.clone().normalize(),clear=segmentClear(port,plan.point,plan.center,plan.radius);
    if(distance<plan.radius){this.message='目標機から離れる';desired.copy(out).multiplyScalar(Math.min(speed,.5));}
    else if(clear){this.message='待機点へ移動 '+remaining.toFixed(1)+' m';desired.copy(toGoal).normalize().multiplyScalar(speed);}
    else{
     this.message='目標機を回り込み '+remaining.toFixed(1)+' m';
     const tangent=toGoal.clone().addScaledVector(out,-toGoal.dot(out));
     if(tangent.lengthSq()<1e-6)tangent.copy(nav.right).addScaledVector(out,-nav.right.dot(out));
     desired.copy(tangent.normalize()).multiplyScalar(speed).addScaledVector(out,clamp((plan.radius+1-distance)*.3,.3));
    }
   }
  }
  const error=desired.sub(relative),gain=DOCKING_AUTOPILOT.velocityGain;
  return {portForward:clamp(-error.dot(nav.outward)*gain),portRight:clamp(error.dot(nav.right)*gain),portUp:clamp(error.dot(nav.top)*gain)};
 }
}
// True when the straight segment a→b stays outside the sphere (center, radius).
export function segmentClear(a:T.Vector3,b:T.Vector3,center:T.Vector3,radius:number):boolean{
 const ab=b.clone().sub(a),t=ab.lengthSq()>0?T.MathUtils.clamp(center.clone().sub(a).dot(ab)/ab.lengthSq(),0,1):0;
 return a.clone().addScaledVector(ab,t).distanceTo(center)>=radius;
}
