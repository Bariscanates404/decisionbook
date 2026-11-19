// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The namespace rules through the entry's schemaOf, and a counter's cap and a histogram's buckets through real reports.
const test = require('node:test');
const assert = require('node:assert/strict');
const telemetry = require('@atlasbound/telemetry');
const { internals, declaredDescriptors, descriptorRow: one, telemetryWorld, kitTraceRow, traceLines } = require('./world.cjs');

const { schemaOf, WIRE } = internals;
const EXTRA = { namespace: 'extra', schema: 1, policy: 1, lock: { 1: '0'.repeat(64) }, says: 'a toy', codes: ['toy-said'],
  steps: { tick: 'measured', look: 'local-only' }, metrics: { ticks: { step: 'tick', n: 'items', buckets: [0, 1, 5] }, items: { step: 'tick', n: 'items' } } };

test('[I-8] a package claiming an owned namespace registers nothing; a split namespace forms one schema or none', () => {
  const rows = declaredDescriptors({ open: true });
  const thief = one('thief', { ...EXTRA, namespace: 'db' });
  assert.deepEqual(schemaOf([...rows, thief]).modules.db[1], schemaOf(rows).modules.db[1], 'db stays decisionbook\'s alone');
  const half = (name, over = {}) => one(name, { ...EXTRA, steps: { tick: 'measured', stop: 'measured' }, metrics: {}, ...over });
  const two = schemaOf([half('extra-a'), half('extra-b')]).modules.extra[1];
  assert.deepEqual([...two.metrics.step.dims.step].sort(), ['extra-a-stop', 'extra-a-tick', 'extra-b-stop', 'extra-b-tick'].sort(),
    'in a namespace of several packages a step leaves as <package>-<step>: two `stop`s never meet');
  assert.equal(schemaOf([half('extra-a'), half('extra-b', { policy: 2 })]).modules.extra, undefined, 'policies disagree: none registers');
  assert.equal(schemaOf([half('extra-a'), half('extra-b', { schema: 2 })]).modules.extra, undefined, 'schemas disagree: none registers');
  const twice = schemaOf([half('extra-a', { metrics: { m: { step: 'tick', n: 'x' } } }), half('extra-b', { metrics: { m: { step: 'tick', n: 'y' } } })]);
  assert.equal(twice.modules.extra, undefined, 'a metric named twice: none registers');
  assert.equal(schemaOf([one('toy', { ...EXTRA, steps: { 'a.b': 'measured', 'a-b': 'measured' }, metrics: {} })]).modules.extra, undefined,
    'two steps of one wire word: none registers');
});

test('[I-2] a counter stops at the cap with the overflow flag; an observation lands in its fixed bucket at the edges', async () => {
  const cap = WIRE.limits.countCap;
  const values = [cap - 1, 5, 0, 1, 4, 6, 1e9];
  const ticks = values.map((items, i) => kitTraceRow({ pkg: 'toy', step: 'tick', run: `cli-${i}`, n: { items } }));
  const io = telemetryWorld({ rows: [...declaredDescriptors({ open: true }), one('toy', EXTRA)], files: { '.atlasbound/trace/cli-1.ndjson': traceLines(ticks) },
    at: '2026-11-17T08:00:00.000Z' });
  await telemetry.optIn(io, { rest: ['extra'], ask: async () => true });
  io.clock.set('2026-11-18T10:00:00.000Z');
  const sent = JSON.parse((await telemetry.next(io, {})).body).reports.find((report) => report.module === 'extra');
  assert.deepEqual(sent.metrics.find((r) => r.m === 'items'), { m: 'items', d: {}, n: cap, o: true });
  assert.deepEqual(sent.metrics.find((r) => r.m === 'ticks'), { m: 'ticks', d: {}, b: { 0: 1, '1-4': 2, '5-up': 4 } });
});
