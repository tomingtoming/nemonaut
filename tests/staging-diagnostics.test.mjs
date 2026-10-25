import test from 'node:test';
import assert from 'node:assert/strict';
import {PARTS,preset} from '../dist/catalog.js';
import {Flight} from '../dist/core.js';
import {fleet,canControl} from '../dist/fleet.js';
import {stagingDiagnostics} from '../dist/staging-diagnostics.js';
import {moveStage} from '../dist/staging.js';
import {moveBranch} from '../dist/assembly-branch.js';

test('Normal returner stages remain operable from capsule; simultaneous firing precedes separation',()=>{
 const parts=preset('returner'),before=structuredClone(parts),d=stagingDiagnostics(parts);
 assert.ok(d.actions.length>5);assert.ok(d.actions.every(a=>a.status==='reference'));assert.deepEqual(parts,before);
});

test('Moving booster ignition after separation exposes uncommandable engines and undo clears it',()=>{
 const parts=preset('launcher'),moved=moveStage(parts,0,1),d=stagingDiagnostics(moved);
 const warnings=d.actions.filter(a=>a.status!=='reference');assert.equal(warnings.length,4);
 for(const a of warnings){assert.equal(a.status,'uncontrolled');assert.equal(a.stage,1);assert.equal(a.separatedAt,0);assert.deepEqual(a.controlIds,[]);}
 assert.ok(stagingDiagnostics(moveStage(moved,1,-1)).actions.every(a=>a.status==='reference'));
});

function nestedCraft(){
 const make=(id,type,parent,stage,y)=>({id,type,parent,stage,p:[0,y,0],r:[0,0,0]});
 return [make('core','probe',null,0,5),make('outer','decoupler','core',0,4),make('childCore','probe','outer',0,3),make('inner','decoupler','childCore',1,2),make('engine','engine','inner',2,1),make('chute','parachute','childCore',2,3)];
}

test('Nested controlled vessels forecast switching and later uncontrolled payloads against live Flight',()=>{
 const parts=nestedCraft(),d=stagingDiagnostics(parts,'core'),f=new Flight(parts,'orbit');
 try{
  for(let stage=0;stage<=2;stage++){
   const now=fleet(f),reference=now.find(v=>v.parts.some(p=>p.id==='core'));
   for(const a of d.actions.filter(a=>a.stage===stage)){
    const actual=now.find(v=>v.parts.some(p=>p.id===a.id));
    assert.equal(a.status,!canControl(actual)?'uncontrolled':actual===reference?'reference':'switch');
    assert.deepEqual(a.controlIds,actual.parts.filter(p=>PARTS[p.type].control).map(p=>p.id));
   }
   for(const v of now)if(canControl(v))v.stageNext();
  }
 }finally{f.dispose();}
 const inner=d.actions.find(a=>a.id==='inner');assert.equal(inner.status,'switch');assert.equal(inner.separatedAt,0);
 const engine=d.actions.find(a=>a.id==='engine');assert.equal(engine.status,'uncontrolled');
 const child=stagingDiagnostics(parts,'childCore');assert.equal(child.actions.find(a=>a.id==='chute').status,'reference');assert.equal(child.actions.find(a=>a.id==='engine').separatedAt,1);
});

test('Same-stage nested separators fire before partitioning; crewless branches never receive later commands',()=>{
 const parts=nestedCraft();parts.find(p=>p.id==='inner').stage=0;
 let d=stagingDiagnostics(parts);assert.equal(d.actions.find(a=>a.id==='inner').status,'reference');
 parts.splice(parts.findIndex(p=>p.id==='childCore'),1);parts.find(p=>p.id==='inner').parent='outer';parts.find(p=>p.id==='chute').parent='outer';parts.find(p=>p.id==='inner').stage=1;
 d=stagingDiagnostics(parts);assert.equal(d.actions.find(a=>a.id==='inner').status,'uncontrolled');assert.equal(d.actions.find(a=>a.id==='chute').status,'uncontrolled');
});

test('Missing/deleted reference falls back to available control; no control is explicit',()=>{
 const parts=nestedCraft();assert.equal(stagingDiagnostics(parts,'gone').referenceId,'core');
 const noControl=parts.filter(p=>!PARTS[p.type].control).map(p=>({...p,parent:null}));
 const d=stagingDiagnostics(noControl);assert.equal(d.referenceId,null);assert.ok(d.actions.every(a=>a.status==='uncontrolled'));
});

test('Reattaching a delayed engine across the separator updates diagnosis without changing its stage',()=>{
 const parts=preset('twin'),engine=parts[6];assert.equal(stagingDiagnostics(parts).actions.find(a=>a.id===engine.id).status,'switch');
 const result=moveBranch(parts,engine.id,{position:[2,3,0],rotation:[0,0,0],parent:parts[1].id});
 assert.equal(result.parts.find(p=>p.id===engine.id).stage,2);
 assert.equal(stagingDiagnostics(result.parts).actions.find(a=>a.id===engine.id).status,'reference');
 assert.equal(stagingDiagnostics(parts).actions.find(a=>a.id===engine.id).status,'switch');
});
