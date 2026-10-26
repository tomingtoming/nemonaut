import {floatingWindow} from './floating-window.js';

const KEY='orbital-foundry-audio-v1';
export function audioSettings(value={}){
 const level=(v,fallback)=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):fallback;
 return {music:level(value?.music,.28),effects:level(value?.effects,.55),muted:value?.muted===true};
}
export function soundState(flight,center=false){
 return {scene:center?'center':!flight?'workshop':(flight.orbit?.altitude||0)>=70000?'space':'flight',
  thrust:flight&&!flight.crashed?Math.min(1,Math.sqrt(Math.max(0,flight.lastThrust||0)/180000)):0,
  jets:flight&&!flight.crashed&&flight.rcsJets?.some(j=>j.level>.01)?1:0,crashed:!!flight?.crashed};
}
// Original four-bar motifs: MIDI pitches, one bar per chord. No external audio assets.
export const scores={
 center:[[48,55,59,62],[45,52,57,60],[41,48,55,60],[43,50,57,62]],
 workshop:[[48,55,60,64],[45,52,59,64],[41,48,57,60],[43,50,59,62]],
 flight:[[38,45,50,57],[41,48,53,60],[36,43,50,55],[43,50,57,62]],
 space:[[45,52,59,64],[41,48,55,62],[48,55,62,67],[43,50,57,64]]
};
const hz=m=>440*2**((m-69)/12);

export function mountGameAudio(){
 let settings;try{settings=audioSettings(JSON.parse(localStorage.getItem(KEY)));}catch{settings=audioSettings();}
 let ctx,music,effects,master,engine,jet,scene='center',next=0,bar=0,previous=null,lastClick=0;
 const musicVoices=new Set();
 const button=document.createElement('button');button.id='audioButton';button.textContent='♫';button.title='サウンド';document.body.append(button);
 const win=floatingWindow(document.body,{title:'サウンド',x:innerWidth-280,y:230,onClose:()=>{win.element.hidden=true;button.setAttribute('aria-expanded','false');}});
 win.element.classList.add('audioWindow');win.element.hidden=true;win.element.querySelector('[aria-label="窓を固定"]').remove();
 win.content.innerHTML='<label><input id="audioMute" type="checkbox">ミュート</label><label>BGM <input id="musicVolume" aria-label="BGM音量" type="range" min="0" max="100"></label><label>効果音 <input id="effectsVolume" aria-label="効果音音量" type="range" min="0" max="100"></label><output id="audioState"></output>';
 const mute=win.content.querySelector('#audioMute'),mv=win.content.querySelector('#musicVolume'),ev=win.content.querySelector('#effectsVolume'),status=win.content.querySelector('output');
 const refresh=()=>{mute.checked=settings.muted;mv.value=settings.music*100;ev.value=settings.effects*100;button.setAttribute('aria-label',settings.muted?'サウンド：ミュート':'サウンド');button.textContent=settings.muted?'♪̸':'♫';status.textContent=!ctx?'操作すると再生':ctx.state==='running'?'再生中':ctx.state==='closed'?'音声を利用できません':'一時停止';};
 const gains=()=>{if(!ctx)return;master.gain.setTargetAtTime(settings.muted?0:.65,ctx.currentTime,.04);music.gain.setTargetAtTime(settings.music,ctx.currentTime,.08);effects.gain.setTargetAtTime(settings.effects,ctx.currentTime,.04);};
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}gains();refresh();};
 mute.onchange=()=>{settings.muted=mute.checked;save();mute.blur();};mv.oninput=()=>{settings.music=+mv.value/100;save();};ev.oninput=()=>{settings.effects=+ev.value/100;save();};
 button.onclick=()=>{win.element.hidden=!win.element.hidden;button.setAttribute('aria-expanded',String(!win.element.hidden));win.front();win.clamp();button.blur();};button.setAttribute('aria-expanded','false');
 function clearMusic(){
  if(!ctx)return;const now=ctx.currentTime;
  for(const {osc,gain} of musicVoices){gain.gain.cancelAndHoldAtTime(now);gain.gain.setTargetAtTime(0,now,.12);osc.stop(now+.6);}musicVoices.clear();
 }
 function tone(pitch,time,duration,volume,bus,type='sine',endPitch=null,attack=.05){
  const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(pitch,time);if(endPitch)osc.frequency.exponentialRampToValueAtTime(endPitch,time+duration);
  gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+Math.min(attack,duration/5));gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
  const voice={osc,gain};if(bus===music)musicVoices.add(voice);
  osc.connect(gain).connect(bus);osc.start(time);osc.stop(time+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();musicVoices.delete(voice);};
 }
 function noiseLoop(frequency){
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=frequency;gain.gain.value=0;source.connect(filter).connect(gain).connect(effects);source.start();return {gain,filter};
 }
 async function unlock(){
  if(document.hidden)return;
  try{if(!ctx){const Context=window.AudioContext||window.webkitAudioContext;if(!Context){status.textContent='音声を利用できません';return;}ctx=new Context();master=ctx.createGain();const limiter=ctx.createDynamicsCompressor();master.connect(limiter).connect(ctx.destination);music=ctx.createGain();effects=ctx.createGain();music.connect(master);effects.connect(master);gains();engine=noiseLoop(300);jet=noiseLoop(2500);ctx.onstatechange=refresh;}
   if(ctx.state==='suspended')await ctx.resume();refresh();
  }catch{status.textContent='音声を開始できません';}
 }
 document.addEventListener('pointerdown',unlock);document.addEventListener('keydown',unlock);
 document.addEventListener('visibilitychange',()=>{if(!ctx)return;if(document.hidden){clearMusic();ctx.suspend().catch(()=>{});}else{next=0;unlock();}});
 function play(kind){
  if(!ctx||ctx.state!=='running'||settings.muted||document.hidden)return;
  const t=ctx.currentTime;
  if(kind==='click'){if(t-lastClick<.07)return;lastClick=t;tone(700,t,.065,.035,effects,'sine',430);}
  if(kind==='stage'){tone(90,t,.5,.4,effects,'triangle',28);tone(1400,t,.09,.08,effects,'triangle',120);}
  if(kind==='dock'){[60,64,67,72].forEach((n,i)=>tone(hz(n),t+i*.1,.7,.14,effects));}
  if(kind==='crash'){tone(65,t,1.4,.5,effects,'sawtooth',22);tone(170,t,.55,.16,effects,'triangle',31);}
 }
 document.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('.audioWindow'))play('click');});
 refresh();
 return {play,update(flight,center){
  const state=soundState(flight,center);
  if(previous?.flight===flight&&state.crashed&&!previous.crashed)play('crash');previous={flight,crashed:state.crashed};
  if(!ctx||ctx.state!=='running'||document.hidden)return;
  const t=ctx.currentTime;
  engine.gain.gain.setTargetAtTime(state.thrust*.48,t,.15);engine.filter.frequency.setTargetAtTime(100+state.thrust*850,t,.15);jet.gain.gain.setTargetAtTime(state.jets*.065,t,.04);
  if(scene!==state.scene){clearMusic();scene=state.scene;bar=0;next=t+.1;}
  if(settings.muted||settings.music===0){clearMusic();next=0;return;}
  if(next<t-.5)next=t+.05;
  if(next<t+.15){const chord=scores[scene][bar%4],slow=scene==='space',length=slow?8:6;
   chord.forEach((n,i)=>tone(hz(n),next+i*.06,length*.95,.085,music,'sine',null,.9));
   if(scene!=='flight')for(let i=0;i<4;i++)tone(hz(chord[(bar+i)%4]+12),next+.5+i*length/4,slow?2.8:1.2,.09,music);
   next+=length;bar++;
  }
 }};
}
