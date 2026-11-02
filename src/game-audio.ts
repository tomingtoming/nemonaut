import {storageKey} from './app-id.js';
import {FailureAudioCursor,type FailureFleet} from './failure-feedback.js';
import {PARTS,type PartCatalog} from './catalog.js';
import {floatingWindow} from './floating-window.js';

const KEY=storageKey('audio-v1');
export interface AudioSettingsInput{music?:unknown;effects?:unknown;muted?:unknown}
export interface AudioSettings{music:number;effects:number;muted:boolean}
export type SoundScene='center'|'workshop'|'flight'|'space';
export interface SoundState{scene:SoundScene;thrust:number;rolling:number;jets:number;crashed:boolean}
export interface SoundFlight{orbit?:{altitude?:number}|null;crashed?:boolean;lastThrust?:number;telemetry?:{contacts?:number}|null;parts:readonly {id:string;type:string}[];wheelMotion?:ReadonlyMap<string,{speed?:number}>|null;rcsJets?:readonly {level:number}[]|null}
export type GameAudioFlight=SoundFlight&FailureFleet&{pos:import('three').Vector3};
export interface GameAudio{play(kind:string,level?:number):void;update(flight:GameAudioFlight|null,center:boolean,paused?:boolean):void}
interface Voice{osc:OscillatorNode;gain:GainNode}
interface NoiseLoop{gain:GainNode;filter:BiquadFilterNode}
export function audioSettings(value:AudioSettingsInput|null={}):AudioSettings{
 const level=(v:unknown,fallback:number):number=>Number.isFinite(v)?Math.max(0,Math.min(1,v as number)):fallback;
 return {music:level(value?.music,.28),effects:level(value?.effects,.55),muted:value?.muted===true};
}
export function soundState(flight?:SoundFlight|null,center=false,paused=false):SoundState{
 return {scene:center?'center':!flight?'workshop':(flight.orbit?.altitude||0)>=70000?'space':'flight',
  thrust:flight&&!flight.crashed&&!paused?Math.min(1,Math.sqrt(Math.max(0,flight.lastThrust||0)/180000)):0,
  rolling:flight&&!paused&&(flight.telemetry?.contacts||0)>0?Math.min(1,Math.max(0,...flight.parts.filter(p=>(PARTS as PartCatalog)[p.type].wheel).map(p=>Math.abs(flight.wheelMotion?.get(p.id)?.speed||0)*(PARTS as PartCatalog)[p.type].size[1]/2))/18):0,
  jets:flight&&!flight.crashed&&!paused&&flight.rcsJets?.some(j=>j.level>.01)?1:0,crashed:!!flight?.crashed};
}
// Original four-bar motifs: MIDI pitches, one bar per chord. No external audio assets.
export const scores={
 center:[[48,55,59,62],[45,52,57,60],[41,48,55,60],[43,50,57,62]],
 workshop:[[48,55,60,64],[45,52,59,64],[41,48,57,60],[43,50,59,62]],
 flight:[[38,45,50,57],[41,48,53,60],[36,43,50,55],[43,50,57,62]],
 space:[[45,52,59,64],[41,48,55,62],[48,55,62,67],[43,50,57,64]]
};
const hz=(m:number):number=>440*2**((m-69)/12);

export function mountGameAudio():GameAudio{
 let settings:AudioSettings;try{settings=audioSettings(JSON.parse(localStorage.getItem(KEY) as string));}catch{settings=audioSettings();}
 let ctx:AudioContext,music:GainNode,effects:GainNode,master:GainNode,engine:NoiseLoop,jet:NoiseLoop,rolling:NoiseLoop,scene:SoundScene='center',next=0,bar=0,previous:{flight:GameAudioFlight|null;crashed:boolean;paused:boolean}|null=null,lastClick=0;
 const musicVoices=new Set<Voice>(),failureCursor=new FailureAudioCursor(),effectVoices=new Set<Voice>();
 const button=document.createElement('button');button.id='audioButton';button.textContent='♫';button.title='サウンド';document.body.append(button);
 const win=floatingWindow(document.body,{title:'サウンド',x:innerWidth-280,y:230,onClose:()=>{win.element.hidden=true;button.setAttribute('aria-expanded','false');}});
 win.element.classList.add('audioWindow');win.element.hidden=true;win.element.querySelector('[aria-label="窓を固定"]')!.remove();
 win.content.innerHTML='<label><input id="audioMute" type="checkbox">ミュート</label><label>BGM <input id="musicVolume" aria-label="BGM音量" type="range" min="0" max="100"></label><label>効果音 <input id="effectsVolume" aria-label="効果音音量" type="range" min="0" max="100"></label><output id="audioState"></output>';
 const mute=win.content.querySelector<HTMLInputElement>('#audioMute')!,mv=win.content.querySelector<HTMLInputElement>('#musicVolume')!,ev=win.content.querySelector<HTMLInputElement>('#effectsVolume')!,status=win.content.querySelector('output')!;
 const refresh=()=>{mute.checked=settings.muted;(mv as {value:string|number}).value=(settings.music*100);(ev as {value:string|number}).value=(settings.effects*100);button.setAttribute('aria-label',settings.muted?'サウンド：ミュート':'サウンド');button.textContent=settings.muted?'♪̸':'♫';status.textContent=!ctx?'操作すると再生':ctx.state==='running'?'再生中':ctx.state==='closed'?'音声を利用できません':'一時停止';};
 const gains=()=>{if(!ctx)return;master.gain.setTargetAtTime(settings.muted?0:.65,ctx.currentTime,.04);music.gain.setTargetAtTime(settings.music,ctx.currentTime,.08);effects.gain.setTargetAtTime(settings.effects,ctx.currentTime,.04);};
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}gains();refresh();};
 mute.onchange=()=>{settings.muted=mute.checked;save();mute.blur();};mv.oninput=()=>{settings.music=+mv.value/100;save();};ev.oninput=()=>{settings.effects=+ev.value/100;save();};
 button.onclick=()=>{win.element.hidden=!win.element.hidden;button.setAttribute('aria-expanded',String(!win.element.hidden));win.front();win.clamp();button.blur();};button.setAttribute('aria-expanded','false');
 function clearMusic(){
  if(!ctx)return;const now=ctx.currentTime;
  for(const {osc,gain} of musicVoices){gain.gain.cancelAndHoldAtTime(now);gain.gain.setTargetAtTime(0,now,.12);osc.stop(now+.6);}musicVoices.clear();
 }
 function tone(pitch:number,time:number,duration:number,volume:number,bus:AudioNode,type:OscillatorType='sine',endPitch:number|null=null,attack=.05):void{
  const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(pitch,time);if(endPitch)osc.frequency.exponentialRampToValueAtTime(endPitch,time+duration);
  gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+Math.min(attack,duration/5));gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
  const voice={osc,gain};if(bus===music)musicVoices.add(voice);else{if(effectVoices.size>=24){const old=effectVoices.values().next().value!;old.osc.stop();old.osc.disconnect();old.gain.disconnect();effectVoices.delete(old);}effectVoices.add(voice);}
  osc.connect(gain).connect(bus);osc.start(time);osc.stop(time+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();musicVoices.delete(voice);effectVoices.delete(voice);};
 }
 function noiseLoop(frequency:number):NoiseLoop{
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=frequency;gain.gain.value=0;source.connect(filter).connect(gain).connect(effects);source.start();return {gain,filter};
 }
 async function unlock(){
  if(document.hidden)return;
  try{if(!ctx){const Context=window.AudioContext||(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!Context){status.textContent='音声を利用できません';return;}ctx=new Context();master=ctx.createGain();const limiter=ctx.createDynamicsCompressor();master.connect(limiter).connect(ctx.destination);music=ctx.createGain();effects=ctx.createGain();music.connect(master);effects.connect(master);gains();engine=noiseLoop(300);jet=noiseLoop(2500);rolling=noiseLoop(180);ctx.onstatechange=refresh;}
   if(ctx.state==='suspended')await ctx.resume();refresh();
  }catch{status.textContent='音声を開始できません';}
 }
 document.addEventListener('pointerdown',unlock);document.addEventListener('keydown',unlock);
 document.addEventListener('visibilitychange',()=>{if(!ctx)return;if(document.hidden){clearMusic();ctx.suspend().catch(()=>{});}else{next=0;unlock();}});
 function play(kind:string,level=1):void{
  if(!ctx||ctx.state!=='running'||settings.muted||document.hidden)return;
  const t=ctx.currentTime;
  if(kind==='click'){if(t-lastClick<.07)return;lastClick=t;tone(700,t,.065,.035,effects,'sine',430);}
  if(kind==='stage'){tone(90,t,.5,.4,effects,'triangle',28);tone(1400,t,.09,.08,effects,'triangle',120);}
  if(kind==='dock'){[60,64,67,72].forEach((n,i)=>tone(hz(n),t+i*.1,.7,.14,effects));}
  if(kind==='fracture'){tone(720,t,.18,.12*level,effects,'triangle',110);tone(210,t,.4,.18*level,effects,'triangle',48);}
  if(kind==='fuel-burst'){tone(55,t,1.8,.5*level,effects,'sawtooth',18);tone(125,t,.6,.2*level,effects,'triangle',27);}
  if(kind==='crash'){tone(65,t,1.4,.5,effects,'sawtooth',22);tone(170,t,.55,.16,effects,'triangle',31);}
 }
 document.addEventListener('click',e=>{if((e.target as Element).closest('button')&&!(e.target as Element).closest('.audioWindow'))play('click');});
 refresh();
 return {play,update(flight:GameAudioFlight|null,center:boolean,paused=false):void{
  const state=soundState(flight,center,paused);
  const failures=failureCursor.update(center?null:flight,paused);for(const e of failures){const distance=Math.hypot(...e.position.map((n,i)=>n-flight!.pos.getComponent(i)));if(distance<800)play(e.effect==='fuel-burst'?'fuel-burst':'fracture',1/(1+distance/80));}
  if(paused&&!previous?.paused)for(const voice of effectVoices){voice.osc.stop();voice.osc.disconnect();voice.gain.disconnect();}if(paused)effectVoices.clear();
  if(previous?.flight===flight&&state.crashed&&!previous.crashed&&!flight?.failureEvents?.length)play('crash');previous={flight,crashed:state.crashed,paused};
  if(!ctx||ctx.state!=='running'||document.hidden)return;
  const t=ctx.currentTime;
  engine.gain.gain.setTargetAtTime(state.thrust*.48,t,.15);engine.filter.frequency.setTargetAtTime(100+state.thrust*850,t,.15);jet.gain.gain.setTargetAtTime(state.jets*.065,t,.04);rolling.gain.gain.setTargetAtTime(state.rolling*.09,t,.08);rolling.filter.frequency.setTargetAtTime(80+state.rolling*650,t,.08);
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
