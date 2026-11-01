import {fleet} from './fleet.js';
import {centerOfVessel,relativeState} from './relative-navigation.js';
import {bodyOrbitState} from './celestial.js';
export function mapVessels(root){return fleet(root).filter(v=>v!==root).map((v,i)=>{const position=centerOfVessel(v),relative=relativeState(root,v);return {id:v.vesselId,name:v.vesselName||'機体 '+(i+1),position,orbit:bodyOrbitState(position,v.vel,v.universalTime),stopped:v.landed||v.crashed,target:root.navigationTarget===v,distance:relative.distance,speed:relative.speed};});}
