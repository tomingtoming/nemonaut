import test from 'node:test';
import assert from 'node:assert/strict';
import {FailureAudioCursor, failureHistory, failureDetail} from '../dist/failure-feedback.js';
const event = (id, time = 5) => ({id, time, type: 'tank', cause: 'impact', speed: 20, effect: 'fuel-burst'});
test('new damage sounds once, while restored, rewound and paused events stay silent', () => {
  const c = new FailureAudioCursor(),
    f = {universalTime: 5, failureEvents: [event('old')], detached: []};
  assert.deepEqual(c.update(f), []);
  f.universalTime = 5.1;
  f.failureEvents.push(event('new', 5.1));
  assert.equal(c.update(f).length, 1);
  assert.equal(c.update(f).length, 0);
  assert.equal(c.update(structuredClone(f)).length, 0);
  assert.equal(c.update(f).length, 0);
  f.universalTime = 4;
  assert.equal(c.update(f).length, 0);
  f.universalTime = 6;
  f.failureEvents.push(event('paused', 6));
  assert.equal(c.update(f, true).length, 0);
  assert.equal(c.update(f).length, 0);
});
test('split histories deduplicate by event identity, newest first, and bound sound bursts', () => {
  const c = new FailureAudioCursor(),
    f = {universalTime: 4, failureEvents: [], detached: []};
  c.update(f);
  f.universalTime = 5;
  f.failureEvents = Array.from({length: 8}, (_, i) => event(String(i)));
  f.detached.push({failureEvents: structuredClone(f.failureEvents), detached: []});
  assert.equal(failureHistory(f).length, 8);
  assert.equal(c.update(f).length, 4);
  assert.equal(c.update(f).length, 0);
  assert.match(failureDetail(event('a')), /衝突.*推進剤破裂.*20.0 m\/s/);
});
