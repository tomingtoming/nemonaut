import test from 'node:test';
import assert from 'node:assert/strict';
import {attitudeCommands} from '../dist/flight-input.js';
test('precision changes manual attitude without changing drive or translation input',()=>{
 const input={precision:true,pitch:-1,yaw:.6,roll:-.8,drive:1,translateX:1};
 const before=structuredClone(input);
 assert.deepEqual(attitudeCommands(input),{pitch:-.25,yaw:.15,roll:-.2});
 assert.deepEqual(input,before);
 assert.deepEqual(attitudeCommands({...input,precision:false}),{pitch:-1,yaw:.6,roll:-.8});
 assert.deepEqual(attitudeCommands(input,true),{pitch:-.25,yaw:-.2,roll:.15});
 assert.deepEqual(attitudeCommands(),{pitch:0,yaw:0,roll:0});
});
