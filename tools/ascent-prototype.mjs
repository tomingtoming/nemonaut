import {engineMaxThrust} from '../dist/resources.js';
import * as T from 'three';
import {PARTS} from '../dist/catalog.js';
import {localUp,orbitState} from '../dist/planet.js';
const Y=new T.Vector3(0,1,0);
// Independent target-altitude experiment, not connected to the product UI.
// Commands only the existing actuators. Based on this repository's demonstration pilot.
// Optional demonstration pilot: commands the same throttle, staging and attitude actuators as the player.
export class AscentPrototype{
 constructor({altitude=90000,tolerance=2000}={}){if(!Number.isFinite(altitude)||altitude<80000||altitude>500000)throw Error('Target altitude outside 80–500 km');if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>5000)throw Error('Invalid orbit tolerance');this.altitude=altitude;this.tolerance=tolerance;this.completionMessage='周回達成。実演を終了しました。月遷移計画を作成できます。';this.phase='離昇';this.done=false;this.message='自動実演：離昇';}
 update(f){f.navigationAuto=false;f.navigationFrame='orbit';if(this.done||f.crashed){f.throttle=0;return;}if(!f.started)f.stageNext();const active=[...f.active].filter(id=>f.parts.some(p=>p.id===id));if(!active.length||active.every(id=>{const g=f.networks.network.get(id);return !g||g.tanks.every(p=>(f.fuel.get(p.id)||0)<.001);})){f.throttle=0;const next=f.parts.filter(p=>PARTS[p.type].thrust&&p.stage>f.stage).map(p=>p.stage);if(!next.length){this.done=true;this.phase='燃料切れ';this.completionMessage='燃料切れのため自動実演を終了しました。軌道投入は未達です。';this.message=this.completionMessage;return;}f.stageNext();}
 const com=f.stats.com.clone().applyQuaternion(f.q).add(f.pos),o=orbitState(com,f.vel),up=localUp(com),tangent=new T.Vector3(0,0,1).addScaledVector(up,-up.z).normalize();if(f.vel.clone().addScaledVector(up,-o.vertical).length()>50)tangent.copy(f.vel).addScaledVector(up,-o.vertical).normalize();let angle;
 if(o.altitude<35000){angle=T.MathUtils.clamp((o.altitude-800)/34200,0,1)*Math.PI/3;this.phase='重力ターン';}
 else{const thrust=f.parts.filter(p=>f.active.has(p.id)).reduce((s,p)=>s+engineMaxThrust(p),0),a=thrust/f.stats.mass,vt=f.vel.dot(tangent),target=T.MathUtils.clamp((this.altitude-o.altitude)/50,-100,500),ar=(target-o.vertical)/12+o.gravity-vt*vt/o.radius;
 // Command acceleration, not full thrust: powerful boosters must stop adding
 // orbital energy while they are still climbing out of the atmosphere.
 const at=T.MathUtils.clamp((o.circularSpeed-vt)/20,-20,30);
 angle=Math.atan2(at,ar);f.throttle=T.MathUtils.clamp(Math.hypot(ar,at)/Math.max(a,.01),0,1);this.phase='軌道投入';}
 f.holdQ=new T.Quaternion().setFromUnitVectors(Y,up.clone().multiplyScalar(Math.cos(angle)).addScaledVector(tangent,Math.sin(angle)));f.sas=true;f.sasMode='hold';if(o.altitude<35000)f.throttle=1;
 if(o.periapsis>=this.altitude-this.tolerance&&o.apoapsis<=this.altitude+this.tolerance&&o.energy<0){f.throttle=0;this.done=true;this.phase='周回達成';}
 this.message='自動実演：'+this.phase;
 }
}
