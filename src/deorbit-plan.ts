import {maneuverPreview} from './maneuver.js';
import {bodyOrbitState} from './celestial.js';
// Instantaneous preview only. Actual finite burns and entry survival remain the
// pilot's responsibility; no staging, throttle or saved node is changed here.
export function deorbitPlan(pos,vel,time,{periapsis=25000,delay=60}={}){
 const o=bodyOrbitState(pos,vel,time);
 if(o.bodyId!=='planet'||!o.stable||o.energy>=0)throw Error('母星の大気外周回軌道から計画してください');
 if(!Number.isFinite(periapsis)||periapsis<10000||periapsis>=o.body.atmosphereTop)throw Error('帰還目標近点は10〜70 km未満です');
 if(!Number.isFinite(delay)||delay<1||delay>=o.period)throw Error('噴射時刻は次の1周以内にしてください');
 const location={universalTime:time+delay},base=maneuverPreview(pos,vel,location,0,time);
 let low=-base.burnVel.length()*.99,high=0;
 const preview=dv=>maneuverPreview(pos,vel,location,dv,time);
 if(preview(low).orbit.periapsis>periapsis)throw Error('この軌道の帰還案を作成できません');
 for(let i=0;i<50;i++){const mid=(low+high)/2;if(preview(mid).orbit.periapsis<periapsis)low=mid;else high=mid;}
 const prograde=(low+high)/2,result=preview(prograde);
 if(Math.abs(result.orbit.periapsis-periapsis)>.1)throw Error('目標近点に収束しませんでした');
 return {location,components:{prograde,normal:0,radial:0},preview:result};
}
