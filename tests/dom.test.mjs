import test from 'node:test';
import assert from 'node:assert/strict';
import {setText, setTitle, signatureChanged} from '../dist/dom.js';

test('setText and setTitle write only when the source text changes', () => {
  let writes = 0;
  const node = {
    shown: '',
    set textContent(value) {
      writes++;
      this.shown = value;
    },
    set title(value) {
      writes++;
    }
  };
  setText(node, '燃料 50%');
  setText(node, '燃料 50%');
  assert.equal(writes, 1);
  // A translator may have rewritten what the node shows; the comparison is against the source text.
  node.shown = 'Fuel 50%';
  setText(node, '燃料 50%');
  assert.equal(writes, 1);
  setText(node, '燃料 49%');
  assert.equal(writes, 2);
  assert.equal(node.shown, '燃料 49%');
  setTitle(node, 'a');
  setTitle(node, 'a');
  setTitle(node, 'b');
  assert.equal(writes, 4);
});
test('signatureChanged reports a change once per host', () => {
  const a = {},
    b = {};
  assert.equal(signatureChanged(a, 'x'), true);
  assert.equal(signatureChanged(a, 'x'), false);
  assert.equal(signatureChanged(b, 'x'), true);
  assert.equal(signatureChanged(a, 'y'), true);
  assert.equal(signatureChanged(a, 'x'), true);
});
