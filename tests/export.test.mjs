import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCropRect, resolveExportScale } from '../dist/commands/export.js';

test('parseCropRect parses valid crop value', () => {
  const rect = parseCropRect('0,10,800,120');
  assert.deepEqual(rect, { x: 0, y: 10, width: 800, height: 120 });
});

test('parseCropRect rejects invalid formats', () => {
  assert.throws(() => parseCropRect('0,10,800'));
  assert.throws(() => parseCropRect('0,10,a,120'));
  assert.throws(() => parseCropRect('0,10,0,120'));
});

test('resolveExportScale validates finite range and retina fallback', () => {
  assert.equal(resolveExportScale(undefined, true), 3);
  assert.equal(resolveExportScale(2, false), 2);
  assert.throws(() => resolveExportScale(Number.NaN, false));
  assert.throws(() => resolveExportScale(0, false));
  assert.throws(() => resolveExportScale(5, false));
});
