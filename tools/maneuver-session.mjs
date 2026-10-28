import * as T from 'three';
import {canControl} from '../dist/fleet.js';
import {PARTS} from '../dist/catalog.js';
import {bodyOrbitState} from '../dist/celestial.js';
import {captureBurnEstimate} from '../dist/lunar-capture.js';
import {maneuverDirection,validateManeuverNode} from '../dist/maneuver-node.js';
import {maneuverExecutionPlan,maneuverExecutionThrottle} from './maneuver-execution-plan.mjs';

const planKey=n=>JSON.stringify([n.universalTime,n.time,n.impulse,n.plannedThrottle,n.tolerance,n.capture,n.returnPlan,n.departure]);
const craftKey=f=>JSON.stringify([f.stage,[...f.active],f.parts.map(p=>[p.id,p.thrustLimit,p.fuelEnabled,p.fuelCrossfeed])]);
export class ManeuverSession{
 constructor(){this.owner=null;this.state='idle';this.message='待機';}
 start(f,settings={}){
  if(this.owner)throw Error('実行中の噴射を停止してください');
  if(!f||!canControl(f)||!f.rocketAxes)throw Error('制御可能なロケットが必要です');
  if(f.throttle!==0)throw Error('スロットルを0にしてください');
  const orbit=bodyOrbitState(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),f.vel,f.universalTime);
  if(orbit.altitude<Math.max(1000,orbit.body.atmosphereTop??0))throw Error('大気圏外で開始してください');
  const n=validateManeuverNode(f.maneuver);if(!n||n.complete)throw Error('未実行のマニューバを固定してください');
  if(new T.Vector3(...n.remaining).distanceTo(new T.Vector3(...n.impulse))>1e-5)throw Error('噴射済みの計画は再実行できません');
  const estimate=captureBurnEstimate(f,new T.Vector3(...n.remaining).length());
  if(!estimate.enough)throw Error('現在の点火段の燃料が不足しています');
  this.plan=maneuverExecutionPlan(n,f.universalTime,estimate.duration,settings);
  this.previous={sas:f.sas,sasMode:f.sasMode,navigationAuto:f.navigationAuto,navigationFrame:f.navigationFrame};
  this.node=f.maneuver;this.previousStop=this.node.stopAtTarget;
  this.signature=planKey(this.node);this.craft=craftKey(f);this.body=orbit.bodyId;
  this.owner=f;this.state='aligning';this.message='姿勢合わせ';this.stable=0;this.offAxis=0;this.lit=false;
 }
 stop(state='cancelled',message='中止'){
  const f=this.owner;if(!f)return;
  f.throttle=0;Object.assign(f,this.previous);f.holdQ=f.q.clone();
  if(!f.maneuver&&f.sasMode==='maneuver')f.sasMode='hold';
  if(this.previousStop===undefined)delete this.node.stopAtTarget;else this.node.stopAtTarget=this.previousStop;
  this.owner=null;this.state=state;this.message=message;
 }
 step(f,dt){
  if(!this.owner)return;
  if(f!==this.owner){this.stop('cancelled','機体切替');return;}
  if(!Number.isFinite(dt)||dt<0){this.stop('failed','無効な時間刻み');return;}if(dt===0)return;
  if(!canControl(f)){this.stop('failed','機体の制御を失いました');return;}
  if(f.maneuver!==this.node||planKey(this.node)!==this.signature||craftKey(f)!==this.craft){this.stop('cancelled','機体または計画が変更されました');return;}
  if(this.node.complete){this.stop('complete','予定噴射を完了しました');return;}
  const orbit=bodyOrbitState(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),f.vel,f.universalTime);
  if(orbit.bodyId!==this.body||orbit.altitude<Math.max(1000,orbit.body.atmosphereTop??0)){this.stop('failed','噴射の適用範囲を外れました');return;}
  if(f.universalTime>this.plan.startTime+this.plan.duration*2+60){this.stop('failed','予定噴射を完了できませんでした');return;}
  f.sas=true;f.sasMode='maneuver';f.navigationAuto=false;f.navigationFrame='orbit';this.node.stopAtTarget=true;
  const angle=new T.Vector3(0,1,0).applyQuaternion(f.q).angleTo(maneuverDirection(this.node));
  const aligned=angle<2*Math.PI/180&&f.omega.length()<.03;this.stable=aligned?this.stable+dt:0;
  f.throttle=0;
  if(f.universalTime<this.plan.startTime){this.state=aligned?'waiting':'aligning';this.message=aligned?'噴射待機':'姿勢合わせ';return;}
  if(!this.lit){
   if(this.stable<.5){if(f.universalTime>this.plan.startTime+2)this.stop('failed','開始時刻に姿勢が整いませんでした');return;}
   this.lit=true;
  }
  if(angle>5*Math.PI/180){this.offAxis+=dt;this.message='方向ずれで噴射停止';if(this.offAxis>5)this.stop('failed','噴射方向を維持できませんでした');return;}this.offAxis=0;
  const engines=f.parts.filter(p=>f.active.has(p.id)&&PARTS[p.type].thrust&&!PARTS[p.type].air&&!PARTS[p.type].water);
  if(!engines.some(p=>f.networks.network.get(p.id)?.tanks.some(t=>(f.fuel.get(t.id)||0)>0))){this.stop('failed','燃料切れ · 噴射未達');return;}
  this.state='burning';this.message='予定噴射';f.throttle=maneuverExecutionThrottle(this.node,this.plan,new T.Vector3(...this.node.remaining).length());
 }
}
