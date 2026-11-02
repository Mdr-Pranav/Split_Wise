import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrangeGroups, dropIndex, moveItem } from '../src/lib/order.js';

test('moveItem moves down and up without losing items', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveItem(['a', 'b'], 1, 1), ['a', 'b']);
  assert.deepEqual(moveItem(['a', 'b'], 0, 99), ['b', 'a']);
});

test('dropIndex counts the rows a dragged row has passed', () => {
  const rects = [0, 60, 120, 180].map((top) => ({ top, height: 60 }));
  assert.equal(dropIndex(rects, 0, 0), 0);
  assert.equal(dropIndex(rects, 0, 40), 0);
  assert.equal(dropIndex(rects, 0, 65), 1);
  assert.equal(dropIndex(rects, 0, 125), 2);
  assert.equal(dropIndex(rects, 3, -200), 0);
  assert.equal(dropIndex(rects, 2, -10), 2);
});

test('arrangeGroups splits pinned, others and archived, keeping order', () => {
  const g = (id, pinned = false, archived = false) => ({ id, pinned, archived });
  const { pinned, others, archived } = arrangeGroups([g('a', true), g('b'), g('c', false, true), g('d')]);
  assert.deepEqual(pinned.map((x) => x.id), ['a']);
  assert.deepEqual(others.map((x) => x.id), ['b', 'd']);
  assert.deepEqual(archived.map((x) => x.id), ['c']);
});
