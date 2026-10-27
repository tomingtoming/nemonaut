// Experimental rollout control. 6 m/s² and 75 m are conservative planning
// assumptions, not a guarantee of braking performance for arbitrary aircraft.
export class RolloutControl{
 constructor(){this.elapsed=0;this.braking=false;}
 step({speed,pitchRate,remaining},dt){
  if(![speed,pitchRate,remaining,dt].every(Number.isFinite)||speed<0||dt<0){this.braking=true;return {brake:true,pitch:0,invalid:true};}
  const delay=Math.max(0,1-this.elapsed);
  const required=speed*speed/12+speed*delay+75;
  // Once braking is required, never release it because speed subsequently fell.
  if(dt>0){this.braking||=delay===0||remaining<=required;this.elapsed+=dt;}
  return {brake:this.braking,pitch:Math.max(-.5,Math.min(.5,pitchRate*.12)),required,delay};
 }
}
