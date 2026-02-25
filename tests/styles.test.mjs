import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStyleDetails } from '../dist/commands/styles.js';

test('buildStyleDetails uses explicit padding when present', () => {
  const node = {
    id: '1:1',
    name: 'Card',
    type: 'FRAME',
    paddingTop: 12,
    paddingRight: 16,
    paddingBottom: 12,
    paddingLeft: 16,
    children: [],
  };

  const details = buildStyleDetails(node);
  assert.equal(details.layout.padding.source, 'explicit');
  assert.equal(details.css.padding, '12px 16px 12px 16px');
});

test('buildStyleDetails infers padding from child bounds', () => {
  const node = {
    id: '2:1',
    name: 'Card',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    children: [
      {
        id: '2:2',
        name: 'Content',
        type: 'FRAME',
        absoluteBoundingBox: { x: 10, y: 20, width: 80, height: 60 },
        children: [],
      },
    ],
  };

  const details = buildStyleDetails(node);
  assert.equal(details.layout.padding.source, 'inferred');
  assert.equal(details.css.padding, '20px 10px 20px 10px');
});

