import * as T from 'three';
import {PARTS} from '../dist/catalog.js';
import {canControl,fleet} from '../dist/fleet.js';
import {bodyOrbitState} from '../dist/celestial.js';
import {centerOfVessel} from '../dist/relative-navigation.js';
import {portGuidance} from '../dist/port-navigation.js';
import {dockingStatus} from '../dist/docking.js';

const zero=()=>({portForward:0,portRight:0,portUp:0});
const clamp=x=>T.MathUtils.clamp(x,-1,1);
const fuelAvailable=f=>f.parts.some(p=>PARTS[p.type].rcsThrust&&p.fuelEnabled!==false&&(f.fuel.get(p.id)||0)>0);
const signature=f=>JSON.stringify(f.parts.map(p=>[p.id,p.p,p.r,p.fuelEnabled]));

// Prototype for the final, front-side approach. Orbit transfer and a route
// around the target are separate guidance phases, not position corrections.
export class DockingSession{
 constructor(){this.owner=null;this.state='idle';this.message='待機';}
 start(f){
  if(this.owner)throw Error('接近制御を停止してください');
  const target=f?.navigationTarget,ports=f?.dockingPorts;
  if(!f||!canControl(f)||!target||target.crashed||!fleet(f).includes(target)||!ports)throw Error('操作可能な機体と相手のポートを選択してください');
  if(f.throttle!==0)throw Error('主エンジンを停止してください');
  if(!fuelAvailable(f))throw Error('供給可能なRCS推進剤が必要です');
  const ownOrbit=bodyOrbitState(centerOfVessel(f),f.vel,f.universalTime),otherOrbit=bodyOrbitState(centerOfVessel(target),target.vel,target.universalTime);
  if(ownOrbit.bodyId!==otherOrbit.bodyId||ownOrbit.altitude<Math.max(1000,ownOrbit.body.atmosphereTop??0)||otherOrbit.altitude<Math.max(1000,otherOrbit.body.atmosphereTop??0))throw Error('同じ天体の大気圏外で開始してください');
  const nav=portGuidance(f,ports.own,target,ports.target);
  if(!nav||nav.own.position.distanceTo(nav.target.position)>500||nav.speed>1)throw Error('500 m以内で相対速度を1 m/s以下にしてください');
  if(nav.axial<0||nav.lateral>1&&nav.axial<20)throw Error('相手ポートの正面20 m以上へ回り込んでください');
  if(target.omega.length()>.03)throw Error('相手機の回転を止めてください');
  this.previous={sas:f.sas,sasMode:f.sasMode,rcsEnabled:f.rcsEnabled,portTranslationEnabled:f.portTranslationEnabled};
  this.owner=f;this.target=target;this.ports={...ports};this.ownShape=signature(f);this.targetShape=signature(target);
  this.elapsed=0;this.stable=0;this.state='aligning';this.message='ポート整列';
 }
 stop(state='cancelled',message='中止'){
  if(!this.owner)return;
  Object.assign(this.owner,this.previous);this.owner.holdQ=this.owner.q.clone();
  this.owner=null;this.state=state;this.message=message;
 }
 step(f,dt){
  if(!this.owner)return zero();
  if(f!==this.owner){this.stop('cancelled','機体切替');return zero();}
  if(!Number.isFinite(dt)||dt<0){this.stop('failed','無効な時間刻み');return zero();}if(dt===0)return zero();
  if(!canControl(f)||f.navigationTarget!==this.target||this.target.crashed||!fleet(f).includes(this.target)||JSON.stringify(f.dockingPorts)!==JSON.stringify(this.ports)||signature(f)!==this.ownShape||signature(this.target)!==this.targetShape){this.stop('cancelled','機体またはポートが変更されました');return zero();}
  if(f.throttle!==0){this.stop('cancelled','主エンジン操作');return zero();}
  if(this.elapsed>0&&(!f.sas||f.sasMode!=='dock'||!f.rcsEnabled||!f.portTranslationEnabled)){
   const changed=Object.fromEntries(Object.entries({sas:true,sasMode:'dock',rcsEnabled:true,portTranslationEnabled:true}).filter(([k,v])=>f[k]!==v).map(([k])=>[k,f[k]]));
   this.stop('cancelled','操縦設定の変更');Object.assign(f,changed);return zero();
  }
  if(!fuelAvailable(f)){this.stop('failed','RCS推進剤不足');return zero();}
  if(this.target.omega.length()>.03){this.stop('failed','相手機が回転しています');return zero();}
  const nav=portGuidance(f,this.ports.own,this.target,this.ports.target);
  if(!nav){this.stop('cancelled','ポートを失いました');return zero();}
  this.elapsed+=dt;
  if(this.elapsed>900||nav.speed>2||nav.own.position.distanceTo(nav.target.position)>550||nav.axial<-.15){this.stop('failed','接近範囲を維持できませんでした');return zero();}
  if(dockingStatus(f,this.ports.own,this.target,this.ports.target).ready){this.stop('complete','結合条件成立');return zero();}
  f.sas=true;f.sasMode='dock';f.rcsEnabled=true;f.portTranslationEnabled=true;
  const aligned=nav.angle<5*Math.PI/180&&f.omega.clone().sub(this.target.omega).length()<.03;
  this.stable=aligned?this.stable+dt:0;
  if(this.stable<.5){this.state='aligning';this.message='ポート整列';if(this.elapsed>60&&nav.angle>10*Math.PI/180)this.stop('failed','ポートを整列できませんでした');return zero();}
  this.state=nav.lateral>1?'translating':'approaching';this.message=nav.lateral>1?'横ずれ修正':'最終接近';
  const forward=clamp((nav.axial-(nav.lateral>1?20:0))*.12)*.6;
  return {portForward:clamp((forward-nav.closing)*2),portRight:clamp((clamp(-nav.horizontal*.15)*.6-nav.horizontalSpeed)*2),portUp:clamp((clamp(-nav.vertical*.15)*.6-nav.verticalSpeed)*2)};
 }
}
