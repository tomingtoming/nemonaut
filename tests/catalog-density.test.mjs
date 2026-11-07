import test from 'node:test';
import assert from 'node:assert/strict';
import {PARTS, part} from '../dist/catalog.js';
import {partMass} from '../dist/aero.js';
import {createFuel} from '../dist/resources.js';
import {displacedVolume, WATER_DENSITY} from '../dist/buoyancy.js';
import {cargoShellBoxes} from '../dist/cargo-geometry.js';

const volume = ([x, y, z]) => x * y * z;
const catalog = Object.entries(PARTS);

// Outward-rounded regression bands for this catalog, in kg/m³ unless specified.
// Re-evaluate these observed ranges when introducing a new construction or resource.
function inBand(value, low, high, label) {
  assert.ok(value >= low - 1e-9 && value <= high + 1e-9, label + ': ' + value);
}

test('propellant tanks retain dry and fueled envelope densities at actual load settings', () => {
  const tanks = catalog.filter(([, d]) => d.fuel > 0);
  assert.ok(tanks.length);
  for (const [type, d] of tanks) {
    const p = part(type),
      box = volume(d.size);
    for (const fill of [0, 0.5, 1]) {
      p.fuelLoad = fill;
      const mass = partMass(p, createFuel([p]));
      assert.equal(mass, d.mass + fill * d.fuel, type);
      if (fill === 0) inBand(mass / box, 10, 64, type + ' dry');
      if (fill === 1) inBand(mass / box, 141, 640, type + ' full');
    }
  }
});

test('thin surfaces retain both envelope density and dry mass per lifting area', () => {
  const wings = catalog.filter(([, d]) => d.wing > 0);
  assert.ok(wings.length);
  for (const [type, d] of wings) {
    const mass = partMass(part(type), 0);
    inBand(mass / volume(d.size), 20, 447, type);
    inBand(mass / d.wing, 16, 32, type + ' kg/m²');
  }
});

test('sealed floats and ballast use displaced volume to determine neutral buoyancy', () => {
  const floats = catalog.filter(([, d]) => d.volume > 0);
  assert.ok(floats.some(([, d]) => d.ballast));
  assert.ok(floats.some(([, d]) => !d.ballast));
  for (const [type, d] of floats) {
    const p = part(type),
      box = volume(d.size),
      displacement = displacedVolume(p);
    const empty = partMass(p, 0, 0),
      flooded = partMass(p, 0, 1);
    assert.ok(displacement > 0 && displacement <= box, type);
    inBand(empty / box, 35, 71, type + ' empty envelope');
    assert.ok(empty / displacement < WATER_DENSITY, type);
    if (d.ballast) {
      const neutralFill = (WATER_DENSITY * displacement - empty) / d.ballast;
      assert.ok(neutralFill > 0 && neutralFill < 1, type);
      assert.ok(Math.abs(partMass(p, 0, neutralFill) / displacement - WATER_DENSITY) < 1e-9, type);
      assert.ok(flooded / displacement > WATER_DENSITY, type);
    } else assert.equal(flooded, empty, type);
  }
});

test('empty cargo bay envelope includes its cavity and door motion preserves shell box volume', () => {
  const bays = catalog.filter(([, d]) => d.cargoBay);
  assert.ok(bays.length);
  for (const [type, d] of bays) {
    const box = volume(d.size);
    const shellVolume = open => cargoShellBoxes(d, open).reduce((sum, piece) => sum + volume(piece.size), 0);
    const closed = shellVolume(false);
    assert.ok(closed > 0 && closed < box, type);
    assert.equal(shellVolume(true), closed, type);
    inBand(partMass(part(type), 0) / box, 12, 13, type + ' empty envelope');
  }
});
