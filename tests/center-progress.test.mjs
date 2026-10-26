import test from 'node:test';
import assert from 'node:assert/strict';
import {centerGuidance} from '../dist/center-facilities.js';
import {launchWorld} from '../dist/world-operations.js';
import {worldFromFlight} from '../dist/world-save.js';
import {preset} from '../dist/catalog.js';

test('center does not infer progress from existing craft, designs, practice placement or ordinary recovery',()=>{
 const context={partCount:29,designCount:13,vesselCount:23};
 const legacy=centerGuidance(context);assert.ok(legacy.every(s=>!s.completed));
 assert.ok(legacy.every(s=>s.title.includes('記録なし')));assert.match(legacy[0].text,/13 設計/);
 const practice=launchWorld(worldFromFlight(null),{parts:preset('rocket'),name:'Practice',environment:'orbit'});
 assert.ok(centerGuidance({...context,history:practice.history}).every(s=>!s.completed));
 const world=launchWorld(worldFromFlight(null),{parts:preset('rover'),name:'Surface survey',environment:'land'});
 const history=[...world.history,{type:'recover',name:'Surface survey',universalTime:3}],before=structuredClone(history);
 const guide=centerGuidance({...context,history});assert.deepEqual(guide.map(s=>s.completed),[true,false,false]);
 assert.match(guide[0].text,/Surface survey/);assert.deepEqual(history,before);
 const broken=centerGuidance({...context,history,libraryError:true});assert.equal(broken[0].completed,true);assert.match(broken[0].text,/保存設計を確認できません/);
});
