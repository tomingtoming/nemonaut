import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptsFlightKey, throttleDown, throttleAdjustLabel} from '../dist/flight-keyboard.js';

test('focused sliders allow piloting but retain native range keys', () => {
  const range = {tagName: 'INPUT', type: 'range'};
  for (const code of [
    'KeyW',
    'KeyS',
    'KeyA',
    'KeyD',
    'KeyQ',
    'KeyE',
    'KeyZ',
    'KeyX',
    'KeyP',
    'KeyF',
    'CapsLock'
  ])
    assert.equal(acceptsFlightKey(range, code), true);
  for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Space', 'Tab'])
    assert.equal(acceptsFlightKey(range, code), false);
});
test('typing and selecting never becomes flight input', () => {
  for (const target of [
    {tagName: 'INPUT', type: 'text'},
    {tagName: 'INPUT', type: 'number'},
    {tagName: 'SELECT'},
    {tagName: 'TEXTAREA'},
    {tagName: 'DIV', isContentEditable: true}
  ])
    assert.equal(acceptsFlightKey(target, 'KeyS'), false);
  assert.equal(acceptsFlightKey({tagName: 'BODY'}, 'KeyS'), true);
});
test('throttle down is C; Ctrl is not a flight key, so browser shortcuts stay with the browser', () => {
  assert.deepEqual([...throttleDown.codes], ['KeyC']);
  assert.equal(throttleAdjustLabel, 'Shift / C');
  const range = {tagName: 'INPUT', type: 'range'};
  assert.equal(acceptsFlightKey(range, 'KeyC'), true);
  for (const code of ['ControlLeft', 'ControlRight']) assert.equal(acceptsFlightKey(range, code), false);
});
test('a focused button passes every key on: floating windows keep only the keys of fields', () => {
  for (const code of ['KeyW', 'Space', 'KeyM', 'KeyP', 'KeyV', 'Enter'])
    assert.equal(acceptsFlightKey({tagName: 'BUTTON'}, code), true);
  assert.equal(acceptsFlightKey({tagName: 'INPUT', type: 'checkbox'}, 'KeyW'), false);
});
