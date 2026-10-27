import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptsFlightKey} from '../dist/flight-keyboard.js';

test('focused sliders allow piloting but retain native range keys',()=>{
 const range={tagName:'INPUT',type:'range'};
 for(const code of ['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','KeyZ','KeyX','KeyP','KeyF','CapsLock'])assert.equal(acceptsFlightKey(range,code),true);
 for(const code of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Space','Tab'])assert.equal(acceptsFlightKey(range,code),false);
});
test('typing and selecting never becomes flight input',()=>{
 for(const target of [{tagName:'INPUT',type:'text'},{tagName:'INPUT',type:'number'},{tagName:'SELECT'},{tagName:'TEXTAREA'},{tagName:'DIV',isContentEditable:true}])assert.equal(acceptsFlightKey(target,'KeyS'),false);
 assert.equal(acceptsFlightKey({tagName:'BODY'},'KeyS'),true);
});
