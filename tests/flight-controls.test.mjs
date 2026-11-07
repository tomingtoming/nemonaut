import test from 'node:test';
import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';
import {Flight} from '../dist/core.js';
import {selectVessel} from '../dist/fleet.js';
import {updateFlightControls} from '../dist/flight-controls.js';

function controls() {
  const elements = new Map();
  return {
    querySelector(id) {
      if (!elements.has(id))
        elements.set(id, {disabled: false, checked: false, hidden: false, parentElement: {hidden: false}});
      return elements.get(id);
    }
  };
}

test('flight controls follow real separation and vessel switching without changing actuator settings', () => {
  const parts = preset('launcher').filter(p => p.type !== 'parachute'),
    separator = parts.find(p => p.type === 'decoupler');
  for (const type of ['wheel', 'rcs', 'ballast', 'probe', 'parachute'])
    parts.push({
      ...structuredClone(parts[0]),
      id: crypto.randomUUID(),
      type,
      parent: separator.id,
      pos: [2, -6, 0]
    });
  let flight = new Flight(parts, 'orbit');
  const ui = controls();
  try {
    flight.rcsEnabled = true;
    flight.driveEnabled = false;
    updateFlightControls(ui, flight);
    assert.equal(ui.querySelector('#driveEnabled').parentElement.hidden, false);
    assert.equal(ui.querySelector('#driveEnabled').checked, false);
    assert.equal(ui.querySelector('#rcsEnabled').checked, true);
    assert.equal(ui.querySelector('#ballastControl').hidden, false);
    assert.equal(ui.querySelector('#armChutes').hidden, false);
    flight.stageNext();
    flight.stageNext();
    const child = flight.detached[0];
    assert.ok(child.parts.some(p => p.type === 'wheel'));
    updateFlightControls(ui, flight);
    for (const id of ['#driveEnabled', '#steeringEnabled', '#rcsEnabled']) {
      assert.equal(ui.querySelector(id).parentElement.hidden, true);
      assert.equal(ui.querySelector(id).disabled, true);
    }
    assert.equal(ui.querySelector('#armChutes').hidden, true);
    assert.equal(ui.querySelector('#armChutes').disabled, true);
    assert.equal(ui.querySelector('#ballastControl').hidden, true);
    assert.equal(ui.querySelector('#reactionEnabled').parentElement.hidden, false);
    assert.equal(ui.querySelector('#stage').disabled, false);
    assert.equal(flight.rcsEnabled, true);
    assert.equal(flight.driveEnabled, false);
    flight = selectVessel(flight, child);
    updateFlightControls(ui, flight);
    assert.equal(ui.querySelector('#armChutes').hidden, false);
    assert.equal(ui.querySelector('#armChutes').disabled, false);
    assert.equal(ui.querySelector('#driveEnabled').parentElement.hidden, false);
    assert.equal(ui.querySelector('#driveEnabled').disabled, false);
    assert.equal(ui.querySelector('#driveEnabled').checked, false);
    assert.equal(ui.querySelector('#rcsEnabled').checked, true);
    assert.equal(ui.querySelector('#ballastControl').hidden, false);
    flight.crashed = true;
    updateFlightControls(ui, flight);
    for (const id of ['#stage', '#throttle', '#sas', '#driveEnabled', '#rcsEnabled', '#autoLaunch'])
      assert.equal(ui.querySelector(id).disabled, true);
  } finally {
    flight.dispose();
  }
});

test('observing an uncontrolled separated stage disables commands even with RCS hardware', () => {
  const parts = preset('launcher'),
    separator = parts.find(p => p.type === 'decoupler');
  parts.push({...structuredClone(parts[0]), id: crypto.randomUUID(), type: 'rcs', parent: separator.id});
  const flight = new Flight(parts, 'orbit'),
    ui = controls();
  try {
    flight.stageNext();
    flight.stageNext();
    updateFlightControls(ui, flight.detached[0]);
    assert.equal(ui.querySelector('#rcsEnabled').parentElement.hidden, false);
    assert.equal(ui.querySelector('#rcsEnabled').disabled, true);
    assert.equal(ui.querySelector('#stage').disabled, true);
  } finally {
    flight.dispose();
  }
});
