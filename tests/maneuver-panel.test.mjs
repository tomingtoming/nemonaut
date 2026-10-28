import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {preserveManualControlEdit} from '../dist/manual-control-edit.js';

// Exercise the real capture listener with a minimal DOM and a controller double.
// Physics and controller lifecycle are covered by maneuver-session.test.mjs.
function harness(kind='maneuver'){
 const listeners=new Map();let session,control;
 class Session{constructor(){session=this;this.owner={};}stop(){this.owner=null;}}
 const root={createElement:()=>({}),querySelector:()=>({append(){}}),addEventListener:(type,fn)=>listeners.set(type,fn)};
 const context=vm.createContext({ManeuverSession:Session,AscentSession:Session,preserveManualControlEdit,window:{addEventListener(){}},floatingWindow(){throw Error('unused');},acceptsFlightKey:()=>true});
 const name=kind==='maneuver'?'mountManeuverPanel':'mountOrbitalAscent';
 const source=readFileSync(new URL(kind==='maneuver'?'../dist/maneuver-panel.js':'../dist/orbital-ascent-panel.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function '+name,'function '+name);
 vm.runInContext(source,context);
 context[name](root,()=>({}),{claim(){},sync(){control.value='0';control.checked=true;}});
 return {edit(id,value,checked){control={value,checked,closest:selectors=>selectors.split(',').includes('#'+id)};listeners.get('click')({target:control});return {control,session};}};
}

for(const kind of ['maneuver','ascent'])test(`${kind}: manual actuator and throttle edits survive release synchronization`,()=>{
 for(const [id,value,checked]of [['rcsEnabled','on',false],['reactionEnabled','on',false],['throttle','62',undefined]]){
  const result=harness(kind).edit(id,value,checked);
  assert.equal(result.session.owner,null,id+' releases control');
  assert.equal(result.control.value,value,id+' preserves pending value');
  if(checked!==undefined)assert.equal(result.control.checked,checked,id+' preserves pending toggle');
 }
});
test('unrelated UI does not interrupt a scheduled burn',()=>{
 const result=harness().edit('camera','orbit',undefined);
 assert.notEqual(result.session.owner,null);
 assert.equal(result.control.value,'orbit');
});

test('aircraft return release preserves the throttle edit through stop and update',()=>{
 const listeners=new Map(),control={value:'62',closest:selectors=>selectors.split(',').includes('#throttle')};let returning,syncs=0;
 class IdleSession{constructor(){this.state='idle';}cancel(){}stop(){}}
 class Returning{constructor(){returning=this;this.owner={};this.landing={pilot:null};}stop(){this.owner=null;}}
 const root={createElement:()=>({}),querySelector:()=>({append(){}}),addEventListener:(type,fn)=>listeners.set(type,fn)};
 const context=vm.createContext({preserveManualControlEdit,TakeoffSession:IdleSession,LandingSession:IdleSession,ReturnSession:Returning,TakeoffPreviewClient:class{},LandingPlanClient:class{},runwaySelection:{subscribe(){},bind(){}},window:{addEventListener(){}}});
 const source=readFileSync(new URL('../dist/cruise-panel.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',"'file:///unused/'").replace('export function mountCruisePanel','function mountCruisePanel');
 vm.runInContext(source,context);
 context.mountCruisePanel(root,()=>({flight:null}),{claim(){},sync(){syncs++;control.value='0';}});
 listeners.get('input')({target:control});
 assert.equal(returning.owner,null);assert.equal(syncs,1);assert.equal(control.value,'62');
});
