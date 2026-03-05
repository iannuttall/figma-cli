import test from 'node:test';
import assert from 'node:assert/strict';
import { getResolvedNodeColors, collectNodeColors } from '../dist/commands/styles.js';

test('getResolvedNodeColors returns unique visible solid fill/stroke colors', () => {
  const node = {
    id: '1:1',
    name: 'Button',
    type: 'FRAME',
    fills: [
      { type: 'SOLID', color: { r: 0, g: 0.615686, b: 0.505882, a: 1 } },
      { type: 'SOLID', color: { r: 0, g: 0.615686, b: 0.505882, a: 1 } },
      { type: 'SOLID', visible: false, color: { r: 1, g: 0, b: 0, a: 1 } },
      { type: 'GRADIENT_LINEAR', color: { r: 1, g: 1, b: 1, a: 1 } },
    ],
    strokes: [
      { type: 'SOLID', color: { r: 0, g: 0.427451, b: 0.792157, a: 1 } },
      { type: 'SOLID', opacity: 0.5, color: { r: 0, g: 0.427451, b: 0.792157, a: 1 } },
    ],
  };

  const resolved = getResolvedNodeColors(node);
  assert.deepEqual(resolved.fills, ['#009d81']);
  assert.deepEqual(resolved.strokes, ['#006dca', '#006dca80']);
});

test('collectNodeColors respects depth', () => {
  const root = {
    id: '1:1',
    name: 'Root',
    type: 'FRAME',
    fills: [{ type: 'SOLID', color: { r: 0, g: 0.615686, b: 0.505882, a: 1 } }],
    children: [
      {
        id: '1:2',
        name: 'Child',
        type: 'TEXT',
        fills: [{ type: 'SOLID', color: { r: 0, g: 0.427451, b: 0.792157, a: 1 } }],
        children: [
          {
            id: '1:3',
            name: 'Grandchild',
            type: 'RECTANGLE',
            strokes: [{ type: 'SOLID', color: { r: 0.235294, g: 0.235294, b: 0.235294, a: 1 } }],
          },
        ],
      },
    ],
  };

  const depthOne = collectNodeColors(root, 1);
  assert.equal(depthOne.length, 2);
  assert.deepEqual(depthOne.map((item) => item.nodeId), ['1:1', '1:2']);

  const depthTwo = collectNodeColors(root, 2);
  assert.equal(depthTwo.length, 3);
  assert.deepEqual(depthTwo.map((item) => item.nodeId), ['1:1', '1:2', '1:3']);
  assert.deepEqual(depthTwo[2].strokes, ['#3c3c3c']);
});
