import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNodeId, parseNodeIdsCsv, findNodePath, toTree } from '../dist/utils/nodes.js';

const sampleDocument = {
  id: '0:0',
  name: 'Document',
  type: 'DOCUMENT',
  children: [
    {
      id: '1:1',
      name: 'Page A',
      type: 'CANVAS',
      children: [
        {
          id: '2:1',
          name: 'Frame',
          type: 'FRAME',
          children: [
            { id: '3:1', name: 'Title', type: 'TEXT', characters: 'hello' },
          ],
        },
      ],
    },
  ],
};

test('normalizeNodeId converts dash to colon', () => {
  assert.equal(normalizeNodeId('2070-20929'), '2070:20929');
});

test('parseNodeIdsCsv normalizes multiple ids', () => {
  assert.deepEqual(parseNodeIdsCsv('1-2, 3:4,5-6'), ['1:2', '3:4', '5:6']);
});

test('findNodePath returns parent, ancestors, and page', () => {
  const result = findNodePath(sampleDocument, '3-1');
  assert.ok(result);
  assert.equal(result.node.name, 'Title');
  assert.equal(result.parent?.id, '2:1');
  assert.equal(result.page?.id, '1:1');
  assert.deepEqual(result.ancestors.map((node) => node.id), ['0:0', '1:1', '2:1']);
});

test('toTree respects depth', () => {
  const tree = toTree(sampleDocument, 2);
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].name, 'Page A');
  assert.equal(tree.children[0].children.length, 0);
});

