// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The registry's handle, pure: exactly increment and observe over the metrics its namespace registered; any other call counts nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const telemetry = require('@atlasbound/telemetry');
const { handleFor } = require('../../core/registry.cjs');
const { spacesIn, schemaOf } = require('../../contracts/rules.cjs');
const { WIRE } = require('../../contracts/shapes.cjs');

const EXTRA = { namespace: 'extra', schema: 1, policy: 1, lock: { 1: '0'.repeat(64) }, says: 'a toy', codes: ['toy-said'],
  steps: { tick: 'measured', look: 'local-only' }, metrics: { ticks: { step: 'tick', n: 'items', buckets: [0, 1, 5] }, items: { step: 'tick', n: 'items' } } };
const one = (name, descriptor) => [{ name, text: JSON.stringify(descriptor) }];
const handleOf = (rows) => handleFor(spacesIn({ packageData: () => rows }).spaces[0], { cap: WIRE.limits.countCap });

test('register grants nothing: a handle is exactly increment and observe, and sends, writes or reads nothing', () => {
  const handle = handleOf(one('toy', EXTRA));
  assert.deepEqual(Object.keys(handle).sort(), ['increment', 'observe']);
  assert.ok(Object.isFrozen(handle));
  for (const value of Object.values(handle)) assert.equal(typeof value, 'function');
  assert.equal(JSON.stringify(handle), '{}', 'no id, address, client or data hangs on it');
  assert.ok(!Object.keys(telemetry).some((name) => /count|tall/u.test(name)), 'what it counted is not reachable from the entry');
});

test('an unknown metric, a dimension it does not have, a word outside a closed list, a bad number: nothing counts', () => {
  const handle = handleOf(one('toy', EXTRA));
  const spy = schemaOf(spacesIn({ packageData: () => one('toy', EXTRA) }).spaces, WIRE).modules.extra[1].metrics;
  assert.ok(spy.step && spy.ticks && spy.items);
  for (const call of [() => handle.increment('nope', {}), () => handle.increment('items', { file: 'a.js' }), () => handle.increment('items', {}, -1),
    () => handle.increment('items', {}, 1.5), () => handle.observe('ticks', {}, -2), () => handle.observe('ticks', {}, Number.NaN),
    () => handle.increment('ticks', {}), () => handle.observe('items', {}, 1), () => handle.increment('step', { step: 'tick' })]) {
    assert.doesNotThrow(call);
  }
  assert.equal(handleOf(one('toy', { ...EXTRA, metrics: { bad: { step: 'nowhere', n: 'x' } } })), null, 'a descriptor that does not read');
  assert.equal(handleOf(one('toy', { codes: [] })), null, 'no namespace: nothing registers');
});
