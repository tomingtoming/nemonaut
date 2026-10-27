// End-to-end diagnostic: a normal runway departure and return, no airborne reset.
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset,PARTS} from '../dist/catalog.js';
import {PRIMARY,bodyAltitude} from '../dist/celestial.js';
import {fixedToInertial,inertialToFixed,launchSiteOrientation} from '../dist/surface-frame.js';
import {compassHeading} from '../dist/navigation.js';
import {runwayApproach} from '../dist/runway-navigation.js';
import {extendWheelTrack} from '../dist/runway-wheel-track.js';
import {TakeoffPrototype} from './takeoff-prototype.mjs';
import {LandingPrototype} from './landing-prototype.mjs';
import {rollServo} from './roll-servo.mjs';
const wrap=a=>((a+540)%360)-180;
export function runReturnFlight({kind='plane-large',fuelLoad=.5,seconds=1400,log=()=>{}}={}){
 const parts=preset(kind);for(const p of parts)if(PARTS[p.type].fuel)p.fuelLoad=fuelLoad;
 const f=new Flight(parts,'runway',161700),owner=f.vesselId;
 const takeoff=new TakeoffPrototype(f,{speed:90,altitude:600,rotation:12,integral:true,handoff:'attitude'});
 const route=[[5000,5000],[5000,-12000],[0,-12000],[0,-4000]];
 const orientation=launchSiteOrientation('runway'),inverse=orientation.clone().invert();
 let waypoint=-1,landing=null,departureTrack=null,everAirborne=false,handoff=null,previousPhase=null,unexpectedContact=null,landingTouch=null;
 const initialFuel=[...f.fuel.values()].reduce((a,b)=>a+b,0),initialParts=f.parts.length;
 const events=[];f.stageNext();
 try{
  for(let i=0;i<seconds*120&&!f.crashed;i++){
   const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),height=bodyAltitude(center,f.universalTime);
   const local=inertialToFixed(center,f.universalTime).applyQuaternion(inverse);
   const heading=compassHeading(new T.Vector3(0,0,1).applyQuaternion(f.q),center,f.universalTime);
   const runway=runwayApproach(center,f.universalTime,'09',f.vel);
   if(!landing&&takeoff.cruise){
    if(waypoint<0&&height>580&&Math.abs(takeoff.cruise.telemetry.vertical??99)<1)waypoint=0;
    if(waypoint>=0){
     const [x,z]=route[waypoint],distance=Math.hypot(local.x-x,local.z-z);
     if(distance<1000&&waypoint<route.length-1)waypoint++;
     const [tx,tz]=route[waypoint];
     const target=fixedToInertial(new T.Vector3(tx,PRIMARY.radius,tz).normalize().multiplyScalar(PRIMARY.radius+350).applyQuaternion(orientation),f.universalTime);
     takeoff.cruise.target.heading=waypoint===3?90-Math.atan2(runway.crossTrack,1500)*180/Math.PI:compassHeading(target.sub(center),center,f.universalTime);
     takeoff.cruise.target.altitude=waypoint>=1?350:600;
     if(waypoint===3&&Math.abs(runway.crossTrack)<200&&Math.abs(wrap(heading-90))<10&&runway.remaining>5000&&height<400){
      handoff={time:f.time,height,heading,remaining:runway.remaining,cross:runway.crossTrack,speed:f.telemetry.surfaceSpeed};
      landing=new LandingPrototype(f);
     }
    }
   }
   const phase=landing?`landing:${landing.phase}`:waypoint>=0?`return:${waypoint}`:`departure:${takeoff.phase}`;
   if(phase!==previousPhase){const event={time:f.time,phase,height,heading,x:local.x,z:local.z};events.push(event);log(event);previousPhase=phase;}
   if(i%(30*120)===0)log({time:f.time,phase,height,heading,x:local.x,z:local.z,speed:f.telemetry.surfaceSpeed});
   if(landing&&['stopped','failed','go-around'].includes(landing.phase))break;
   const commands=landing?landing.update(f,1/120):takeoff.update(f,1/120);
   if(!landing&&waypoint>=0&&takeoff.attitudeTarget){
    if(takeoff.lateralBias)takeoff.lateralBias.z=0;
    commands.roll=rollServo(f,takeoff.attitudeTarget,12);
   }
   f.step(1/120,commands);
   if(everAirborne&&f.telemetry.contacts){
    const contact={time:f.time,impact:f.telemetry.wheelImpactSpeed};
    if(landing)landingTouch??=contact;else unexpectedContact??=contact;
   }
   if(!everAirborne&&f.telemetry.contacts)departureTrack=extendWheelTrack(departureTrack,f.telemetry.wheelContacts);
   if(height>30&&!f.telemetry.contacts)everAirborne=true;
  }
  return {kind,fuelLoad,time:f.time,initialFuel,remainingFuel:[...f.fuel.values()].reduce((a,b)=>a+b,0),initialParts,remainingParts:f.parts.length,ownerUnchanged:f.vesselId===owner,crashed:f.crashed,landed:f.landed,everAirborne,unexpectedContact,departureTrack,handoff,waypoint,result:landing?.phase??'incomplete',abort:landing?.abort,landingTouch,landingTrack:landing?.track,final:landing?.telemetry,events};
 }finally{f.dispose();}
}
if(process.argv[1]?.endsWith('return-flight-profile.mjs'))console.log(JSON.stringify(runReturnFlight({kind:process.argv[2]??'plane-large',log:r=>console.log(JSON.stringify(r))})));
