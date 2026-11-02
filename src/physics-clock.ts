import {coastSurfaceMargin,type CoastMarginVessel} from './coast-flight.js';

export interface PhysicsClockFlight extends CoastMarginVessel{crashed?:boolean;landed?:boolean;universalTime:number;orbit?:Pick<import('./celestial.js').OrbitState,'bodyId'|'periapsis'|'vertical'|'altitude'>|null;maneuver?:{complete?:boolean;universalTime:number}|null;transferGuide?:{firstBurnTime:number|null;startTime:number}|null}
export interface PhysicsClockLimits{step?:number;maxSteps?:number}
export interface PhysicsClockAdvance{steps:number;advanced:number;limited:boolean;effectiveRate:number}
export type PhysicsClockStep=(step:number)=>boolean|void;

// Frame scheduling only: simulated time advances exclusively through step().
// Overload discards wall-clock demand, never integrates a larger physics step.
export function physicalWarpStop(flight:PhysicsClockFlight,input=false):string{
 if(input)return '操縦入力';
 if(flight.crashed)return '機体損傷';
 if(flight.landed)return '着地';
 const orbit=flight.orbit;
 // Physical warp still integrates collisions, but must return control before
 // a lunar landing needs braking. Use the same speed/thrust margin as coast.
 if(orbit?.bodyId==='moon'&&orbit.periapsis<1000&&orbit.vertical< -5&&orbit.altitude<=coastSurfaceMargin(flight))return '月面降下の減速準備';
 const node=flight.maneuver;
 if(node&&!node.complete&&node.universalTime-flight.universalTime<=60)return '予定噴射の直前';
 const transfer=flight.transferGuide;
 if(transfer&&transfer.firstBurnTime===null&&transfer.startTime-flight.universalTime<=15)return '月遷移噴射の直前';
 return '';
}
export class PhysicsClock {
 declare maxSteps:number;declare remainder:number;declare step:number;
 constructor({step=1/120,maxSteps=64}:PhysicsClockLimits={}){
  if(!Number.isFinite(step)||step<=0||!Number.isInteger(maxSteps)||maxSteps<1)throw Error('Invalid physics clock limits');
  this.step=step;this.maxSteps=maxSteps;this.remainder=0;
 }
 reset():void{this.remainder=0;}
 advance(elapsed:number,rate:number,step:PhysicsClockStep):PhysicsClockAdvance{
  if(!Number.isFinite(elapsed)||elapsed<0||!Number.isFinite(rate)||rate<1||typeof step!=='function')throw Error('Invalid physics clock input');
  const requested=this.remainder+elapsed*rate;
  if(!Number.isFinite(requested))throw Error('Physics clock demand overflow');
  const count=Math.min(this.maxSteps,Math.floor((requested+this.step*1e-9)/this.step));
  let completed=0;
  for(;completed<count;completed++)if(step(this.step)===false){completed++;break;}
  const advanced=completed*this.step,remaining=Math.max(0,requested-advanced);
  const limited=remaining>=this.step;
  // Keep substep precision, but do not bank a long catch-up after overload or stop.
  this.remainder=limited?remaining%this.step:remaining;
  return {steps:completed,advanced,limited,effectiveRate:elapsed>0?advanced/elapsed:0};
 }
}
