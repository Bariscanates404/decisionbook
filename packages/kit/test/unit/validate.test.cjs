// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// what a schema tells is what is checked: a typed array told as a string could never pass the shape that follows it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createValidate } = require('../../index.cjs');

const shapes = { Shelf: { id: 'str', files: 'str[]', notes: 'str[]?', counts: 'int[]', tags: 'str{}', items: 'arr', seen: 'int?' } };
const validate = createValidate({ shapes, enums: {}, refuse: {}, isCode: () => true });

test('a typed array is told as an array of its type, required or not; a plain field stays as it was', () => {
  const { properties, required } = validate.jsonSchema('Shelf');
  assert.deepEqual(properties.files, { type: 'array', items: { type: 'string' } });
  assert.deepEqual(properties.notes, { type: 'array', items: { type: 'string' } });
  assert.deepEqual(properties.counts, { type: 'array', items: { type: 'integer' } });
  assert.deepEqual(properties.id, { type: 'string' });
  assert.deepEqual(properties.items, { type: 'array' });
  assert.deepEqual(properties.seen, { type: 'integer' });
  assert.deepEqual(required, ['id', 'files', 'counts', 'tags', 'items']);
});

test('a typed map is told as an object, never as its value type', () => {
  assert.deepEqual(validate.jsonSchema('Shelf').properties.tags, { type: 'object', additionalProperties: { type: 'string' } });
});

test('an answer written to the told schema passes the check that follows it', () => {
  const told = { id: 'a', files: ['x/**'], counts: [1], tags: { a: 'b' }, items: [] };
  assert.equal(validate.refusal('Shelf', told), null);
});
