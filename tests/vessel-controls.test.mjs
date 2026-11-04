import test from 'node:test';
import assert from 'node:assert/strict';
import {
  vesselControls,
  hasPoweredWheel,
  hasNextStage,
  releaseBrakeForDrive,
  launchHint
} from '../dist/vessel-controls.js';
import {Flight} from '../dist/core.js';
import {preset, part} from '../dist/catalog.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';

const actions = rows => rows.map(r => r.action);
const row = (rows, action) => rows.find(r => r.action === action);
const KEY_LETTER = /(^|[\s/·])[A-Z](?=[\s/·]|$)/;

test('the rover lists driving, steering and the brake, and no throttle or Space', () => {
  const rows = vesselControls(preset('rover'));
  assert.equal(row(rows, '前後に走る').how, 'W / S');
  assert.equal(row(rows, '曲がる').how, 'A / D');
  assert.equal(row(rows, 'ブレーキ').how, 'B');
  assert.equal(row(rows, '全推力 / 停止'), undefined, 'no engine, no throttle row');
  assert.ok(!actions(rows).some(a => /次段|始動/.test(a)), 'nothing to stage on a wheels-only rover');
  for (const a of ['一時停止', '軌道マップ', 'カメラを機体に合わせる']) assert.ok(row(rows, a), a);
});
test('the rocket lists throttle, the Space start and attitude, and no driving', () => {
  const rows = vesselControls(preset('rocket'));
  assert.equal(row(rows, '全推力 / 停止').how, 'Z / X');
  assert.equal(row(rows, '推力を少しずつ').how, 'Shift / Ctrl');
  assert.equal(row(rows, 'エンジン始動 / 次段').how, 'Space');
  assert.equal(row(rows, '向きを変える').how, 'W/S · A/D · Q/E');
  assert.equal(row(rows, '前後に走る'), undefined);
  assert.equal(row(rows, 'ブレーキ'), undefined);
});
test('a screw adds the water note; ballast and parachute rows come from their parts', () => {
  const sub = vesselControls(preset('sub'));
  assert.equal(row(sub, 'スクリュー').how, '水中でだけ働く');
  assert.ok(row(sub, '全推力 / 停止'));
  assert.ok(row(sub, '浮く / 沈む'));
  assert.ok(row(vesselControls(preset('recovery')), 'パラシュート待機'));
  assert.equal(row(vesselControls(preset('rocket')), 'スクリュー'), undefined);
});
test('steerable gear without a drive wheel steers on the ground only; RCS adds its rows', () => {
  const plane = vesselControls(preset('plane'));
  assert.equal(row(plane, '前後に走る'), undefined);
  assert.equal(row(plane, '地上で曲がる').how, 'A / D');
  assert.ok(row(plane, 'ブレーキ'));
  const rcs = vesselControls(preset('rcs'));
  assert.equal(row(rcs, 'RCS 入 / 切').how, 'R');
  assert.equal(row(rcs, 'RCSで平行移動').how, 'I/K · J/L · U/O');
});
test('Space shows only while a later stage has something to run', () => {
  const parts = preset('rocket');
  assert.equal(hasNextStage(parts, -1), true);
  const last = Math.max(...parts.map(p => p.stage));
  assert.equal(hasNextStage(parts, last), false);
  assert.ok(!actions(vesselControls(parts, {stage: last})).some(a => /次段/.test(a)));
});
test('on touch the rows name on-screen controls and no key letters', () => {
  for (const kind of ['rover', 'rocket', 'sub', 'rcs', 'plane', 'recovery', 'courier']) {
    const rows = vesselControls(preset(kind), {touch: true});
    for (const r of rows) assert.doesNotMatch(r.how, KEY_LETTER, `${kind}: ${r.action} ${r.how}`);
    for (const r of rows) assert.doesNotMatch(r.how, /Space|Shift|Ctrl/, `${kind}: ${r.how}`);
  }
  assert.match(row(vesselControls(preset('rover'), {touch: true}), '前後に走る').how, /「走行」スティック/);
  assert.match(row(vesselControls(preset('rocket'), {touch: true}), '全推力 / 停止').how, /「全推力」/);
});
test('the launch hint follows the parts: wheels drive, engines start with Space', () => {
  assert.match(launchHint(preset('rover')), /W\/S/);
  assert.doesNotMatch(launchHint(preset('rover')), /Space/);
  assert.match(launchHint(preset('rocket')), /Space/);
  assert.doesNotMatch(launchHint(preset('rocket')), /W\/S/);
  assert.doesNotMatch(launchHint(preset('rover'), true), /W|S\b/);
});
test('a drive wheel switched off per part is not a powered wheel', () => {
  const parts = preset('rover').map(p => (p.type === 'wheel' ? {...p, driveEnabled: false} : p));
  assert.equal(hasPoweredWheel(preset('rover')), true);
  assert.equal(hasPoweredWheel(parts), false);
  assert.equal(row(vesselControls(parts), '前後に走る'), undefined);
});
test('W/S releases the brake only with a powered wheel and drive enabled', () => {
  const v = {brake: true, driveEnabled: true, parts: preset('rover')};
  assert.equal(releaseBrakeForDrive(v, 0), false);
  assert.equal(v.brake, true, 'no drive input, brake stays');
  assert.equal(releaseBrakeForDrive(v, -1), true);
  assert.equal(v.brake, false);
  assert.equal(releaseBrakeForDrive(v, 1), false, 'already off');
  const off = {brake: true, driveEnabled: false, parts: preset('rover')};
  assert.equal(releaseBrakeForDrive(off, 1), false);
  assert.equal(off.brake, true);
  const rocket = {brake: true, driveEnabled: true, parts: preset('rocket')};
  assert.equal(releaseBrakeForDrive(rocket, 1), false);
  assert.equal(rocket.brake, true);
  const plane = {brake: true, driveEnabled: true, parts: preset('plane')};
  assert.equal(releaseBrakeForDrive(plane, 1), false, 'free-rolling gear does not release the brake');
});

const surfaceSpeed = f =>
  surfaceRelativeVelocity(
    f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
    f.vel,
    f.universalTime
  ).length();
test('powered wheels drive without the Space start once the brake is off', () => {
  const f = new Flight(preset('rover'), 'land');
  try {
    for (let i = 0; i < 240; i++) f.step(1 / 120, {drive: 1});
    assert.equal(f.started, false);
    assert.ok(surfaceSpeed(f) < 0.05, 'brake on: no drive');
    assert.equal(releaseBrakeForDrive(f, 1), true);
    for (let i = 0; i < 360; i++) f.step(1 / 120, {drive: 1});
    assert.equal(f.started, false, 'driving does not stage');
    assert.ok(surfaceSpeed(f) > 0.5, `moves: ${surfaceSpeed(f)}`);
  } finally {
    f.dispose();
  }
});
test('unstarted wheels ignore the throttle without a drive input; engines still need their stage', () => {
  const f = new Flight(preset('rover'), 'land');
  try {
    f.brake = false;
    f.throttle = 1;
    for (let i = 0; i < 360; i++) f.step(1 / 120);
    assert.ok(surfaceSpeed(f) < 0.05, `no drive input before start: ${surfaceSpeed(f)}`);
  } finally {
    f.dispose();
  }
  const g = new Flight([part('probe', [0, 1, 0]), part('engine', [0, 0, 0])], 'land');
  try {
    g.brake = false;
    g.throttle = 1;
    for (let i = 0; i < 120; i++) g.step(1 / 120, {drive: 1});
    assert.equal(g.lastThrust, 0, 'no thrust before staging');
  } finally {
    g.dispose();
  }
});
