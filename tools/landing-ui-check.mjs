import {landingFixture} from './landing-profile.mjs';
import {mountCruisePanel} from '../dist/cruise-panel.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
import {bodyAltitude} from '../dist/celestial.js';
let f=landingFixture({kind:'transport-cargo'}),paused=true,ticks=0;
const out=document.querySelector('#result');
const controls=mountCruisePanel(document,()=>({flight:f,atCenter:false}),{claim(){},sync(){document.querySelector('#sas').textContent=f.sas?'SAS ON':'SAS OFF';}});
document.querySelector('#run').onclick=()=>{paused=!paused;document.querySelector('#run').textContent=paused?'飛行を進める':'一時停止';};
document.querySelector('#reset').onclick=()=>{controls.stop();f.dispose();f=landingFixture({kind:'transport-cargo'});paused=true;document.querySelector('#run').textContent='飛行を進める';controls.update();};
setInterval(()=>{
 ticks++;
 if(!paused)for(let i=0;i<2*Number(document.querySelector('#rate').value);i++)f.step(1/120,controls.step(f,1/120)||{});
 controls.update();
 const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
 out.textContent=JSON.stringify({uiTicks:ticks,time:f.time,paused,active:controls.active,height:bodyAltitude(center,f.universalTime),speed:surfaceRelativeVelocity(center,f.vel,f.universalTime).length(),throttle:f.throttle,sas:f.sas,landed:f.landed,crashed:f.crashed,parts:f.parts.length},null,2);
},16);
controls.update();
