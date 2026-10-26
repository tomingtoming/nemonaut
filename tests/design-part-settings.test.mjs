import test from 'node:test';import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';import {Flight} from '../dist/core.js';
import {editSymmetrySetting} from '../dist/symmetry.js';import {partSettings} from '../dist/part-settings.js';
import {appendDesign,readDesignLibrary,designForLaunch} from '../dist/design-library.js';import {freshLaunchParts} from '../dist/launch-fleet.js';
test('Design controls link symmetry, allow individual overrides, and survive library-to-flight without mutating originals',()=>{
 const original=preset('plane'),wings=original.filter(p=>p.type==='aileron');for(const p of wings)p.symmetryGroup='wings';const before=structuredClone(original);
 let parts=editSymmetrySetting(original,wings[0].id,'controlPitch',true);parts=editSymmetrySetting(parts,wings[0].id,'controlLimit',.25);parts=editSymmetrySetting(parts,wings[1].id,'controlRoll',false,false);
 const engine=parts.find(p=>p.type==='jet');parts=editSymmetrySetting(parts,engine.id,'thrustLimit',.5);
 assert.deepEqual(original,before);assert.ok(parts.filter(p=>p.type==='aileron').every(p=>p.controlPitch&&p.controlLimit===.25));assert.equal(parts.find(p=>p.id===wings[0].id).controlRoll,undefined);
 const saved=appendDesign({version:1,designs:[]},{name:'Settings test',parts,bay:'sph',environment:'runway'},'test',1),loaded=readDesignLibrary(JSON.parse(JSON.stringify(saved))),design=designForLaunch(loaded,'test','runway'),f=new Flight(freshLaunchParts(design.parts),'runway');
 try{assert.equal(f.parts.find(p=>p.type==='jet').thrustLimit,.5);assert.deepEqual(f.parts.filter(p=>p.type==='aileron').map(p=>[p.controlPitch,p.controlRoll,p.controlLimit]),[[true,undefined,.25],[true,false,.25]]);f.parts.find(p=>p.type==='jet').thrustLimit=0;assert.equal(saved.designs[0].parts.find(p=>p.type==='jet').thrustLimit,.5);}finally{f.dispose();}
});
test('Design settings reject unavailable equipment and invalid values, keeping legacy defaults aligned',()=>{
 const parts=preset('plane'),wing=parts.find(p=>p.type==='aileron'),engine=parts.find(p=>p.type==='jet');
 assert.deepEqual(partSettings(wing).filter(s=>['controlPitch','controlYaw','controlRoll'].includes(s.key)).map(s=>s.value),[false,false,true]);
 for(const value of [-.1,1.1,NaN,Infinity,'0.5',false])assert.throws(()=>editSymmetrySetting(parts,engine.id,'thrustLimit',value));
 assert.throws(()=>editSymmetrySetting(parts,engine.id,'controlPitch',true));assert.throws(()=>editSymmetrySetting(parts,wing.id,'thrustLimit',.5));assert.throws(()=>editSymmetrySetting(parts,wing.id,'controlPitch',1));assert.throws(()=>editSymmetrySetting(parts,wing.id,'engine',true));
});
