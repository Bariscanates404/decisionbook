// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What a choice covers is pinned per policy: the core's collection shape (the envelope, the core metrics, the default's words, retention,
// address set or not) and each open namespace's (metric names, types, dimension names, bucket edges, the count each reads: its step,
// name and code; and which steps are timed) hash to the digest pinned beside its policy (wire.json `lock`, a descriptor's `lock`). A
// changed shape under an unchanged policy fails here: raise the policy, so no earlier choice covers it, and pin the new digest. A new
// step or code word changes no shape: it raises `schema` only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hash } = require('@atlasbound/kit');
const { ENVELOPE } = require('../../contracts/wire.cjs');
const { spacesIn } = require('../../contracts/rules.cjs');
const { WIRE } = require('../../contracts/shapes.cjs');

const HERE = path.join(__dirname, '..', '..', '..');
const OPEN = ['cli', 'decisionbook', 'handoff', 'kit', 'telemetry'].map((name) => ({ name,
  text: fs.readFileSync(path.join(HERE, name, 'contracts', 'telemetry.json'), 'utf8') }));
const CORE = ['step', 'step_ms', 'code', 'failure', 'decision'];
const read = (from) => (from ? [from.step, from.n, from.code] : null);
const shapeOf = (metrics, names = Object.keys(metrics)) => Object.fromEntries(names.map((name) => [name, [metrics[name].type,
  Object.keys({ ...metrics[name].dims, ...metrics[name].opt }).sort(), metrics[name].edges ?? null, read(metrics[name].from) ?? metrics[name].computed ?? null]]));
const untimed = (space) => [...space.steps.entries()].filter(([, step]) => step.measured && !step.timed).map(([key]) => key).sort();
function keysOf(rows, wire = WIRE) {
  const spaces = spacesIn({ packageData: () => rows }).spaces;
  const plain = spaces.find((space) => !space.event);
  return { core: hash.digest({ envelope: ENVELOPE.map(([key]) => key), core: shapeOf(plain.metrics, CORE), unchosen: wire.unchosen,
    betaUntil: wire.betaUntil, betaModules: wire.betaModules, retention: wire.retention, periodDays: wire.periodDays, address: Boolean(wire.url) }),
  spaces: Object.fromEntries(spaces.map((space) => [space.ns, hash.digest({ metrics: shapeOf(space.metrics), untimed: untimed(space) })])) };
}
const swap = (name, over) => OPEN.map((row) => (row.name === name ? { name, text: JSON.stringify({ ...JSON.parse(row.text), ...over(JSON.parse(row.text)) }) }
  : row));

test('the core\'s and each open namespace\'s collection key equals the digest pinned beside its policy', () => {
  const keys = keysOf(OPEN);
  assert.equal(keys.core, WIRE.lock[WIRE.policy], 'the core changed what it collects: raise wire.json policy and pin the new key');
  for (const { name, text } of OPEN.filter((row) => JSON.parse(row.text).namespace)) {
    const descriptor = JSON.parse(text);
    assert.equal(keys.spaces[descriptor.namespace], descriptor.lock[descriptor.policy], `${name}: raise its policy and pin the new key`);
  }
});

test('a widened shape changes its key, a new word does not; the address, betaUntil and the default change the core\'s', () => {
  const pinned = keysOf(OPEN);
  const db = (over) => keysOf(swap('decisionbook', over)).spaces.db;
  assert.notEqual(db((one) => ({ metrics: { ...one.metrics, more: { step: 'decisionbook.add', n: 'records' } } })), pinned.spaces.db);
  assert.notEqual(db((one) => ({ metrics: { ...one.metrics, ready_unmet: { ...one.metrics.ready_unmet, buckets: [0, 1, 2] } } })), pinned.spaces.db);
  assert.notEqual(db((one) => ({ metrics: { ...one.metrics, answers_bound: { step: 'decisionbook.create', n: 'bound' } } })), pinned.spaces.db,
    'the same count name read from another step');
  assert.notEqual(db((one) => ({ metrics: { ...one.metrics, phase_seconds: { step: 'plan.phase', n: 'seconds', buckets: one.metrics.phase_seconds.buckets } } })),
    pinned.spaces.db, 'a count losing its code filter');
  assert.notEqual(keysOf(swap('cli', (one) => ({ steps: { ...one.steps, setup: 'measured' } }))).spaces.cli, pinned.spaces.cli,
    'a step that asks a person becoming timed');
  assert.equal(db((one) => ({ codes: [...one.codes, 'a-new-code'], steps: { ...one.steps, 'decisionbook.new': 'measured' } })), pinned.spaces.db);
  for (const over of [{ url: 'https://telemetry.example/v1/reports' }, { betaUntil: '2027-12-31' }, { unchosen: 'on' }]) {
    assert.notEqual(keysOf(OPEN, { ...WIRE, ...over }).core, pinned.core, JSON.stringify(over));
  }
});
