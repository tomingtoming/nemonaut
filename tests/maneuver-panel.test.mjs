import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the real capture listener with a minimal DOM and a controller double.
// Physics and controller lifecycle are covered by maneuver-session.test.mjs.
function harness(){
 const listeners=new Map();let session,control;
 class Session{constructor(){session=this;this.owner={};}stop(){this.owner=null;}}
 const root={createElement:()=>({}),querySelector:()=>({append(){}}),addEventListener:(type,fn)=>listeners.set(type,fn)};
 const context=vm.createContext({ManeuverSession:Session,window:{addEventListener(){}},floatingWindow(){throw Error('unused');},acceptsFlightKey:()=>true});
 const source=readFileSync(new URL('../dist/maneuver-panel.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function mountManeuverPanel','function mountManeuverPanel');
 vm.runInContext(source,context);
 context.mountManeuverPanel(root,()=>({}),{claim(){},sync(){control.value='0';control.checked=true;}});
 return {edit(id,value,checked){control={value,checked,closest:selectors=>selectors.split(',').includes('#'+id)};listeners.get('click')({target:control});return {control,session};}};
}

test('manual actuator and throttle edits survive autopilot release synchronization',()=>{
 for(const [id,value,checked]of [['rcsEnabled','on',false],['reactionEnabled','on',false],['throttle','62',undefined]]){
  const result=harness().edit(id,value,checked);
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
