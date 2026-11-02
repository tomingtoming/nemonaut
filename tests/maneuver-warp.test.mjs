import test from 'node:test';
import assert from 'node:assert/strict';
import {maneuverWarpBudget, WARP_LEAD} from '../dist/maneuver-warp.js';
const f = {universalTime: 1000};
test('no automatic burn leaves warp unrestricted', () => {
  assert.equal(maneuverWarpBudget({owner: null}, f), Infinity);
  assert.equal(maneuverWarpBudget(null, f), Infinity);
});
test('a waiting burn allows warp until the alignment lead before its start', () => {
  const s = {owner: f, state: 'waiting', plan: {startTime: 1000 + WARP_LEAD + 600}};
  assert.equal(maneuverWarpBudget(s, f), 600);
  s.state = 'aligning';
  assert.equal(maneuverWarpBudget(s, f), 600, 'aligning early still allows warp');
  s.plan.startTime = 1000 + WARP_LEAD - 5;
  assert.equal(maneuverWarpBudget(s, f), 0, 'inside the lead: real time');
});
test('burning, another vessel or an unknown start time stop warp', () => {
  assert.equal(maneuverWarpBudget({owner: f, state: 'burning', plan: {startTime: 5000}}, f), 0);
  assert.equal(maneuverWarpBudget({owner: {}, state: 'waiting', plan: {startTime: 5000}}, f), 0);
  assert.equal(maneuverWarpBudget({owner: f, state: 'waiting', plan: {}}, f), 0);
});
