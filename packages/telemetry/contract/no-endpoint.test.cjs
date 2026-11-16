// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The address row as shipped: empty: no address is set. This file does NOT fill it. The net is a spy that fails the test if touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: kitIo, testing: { memoryFs, fixedClock }, trace: { tracePath } } = require('@atlasbound/kit');
const telemetry = require('@atlasbound/telemetry');
const { declaredHere, packageDataOf } = require('./declared.cjs');

const { send, optIn, status, debug, CONSENT_PATH, SENT_PATH, SCHEMA, INGEST_URL, codes } = telemetry;
const ctx = { run: 'job-run', version: '1.2.3' };
// Only a person at a terminal opts in.
const asPerson = { ...ctx, ask: async () => assert.fail('opting in asks nothing') };
const ON = JSON.stringify({ schema: SCHEMA.consent, on: true, at: '2026-11-03T00:00:00.000Z' });
const ROW = {
  v: 1, pkg: 'handoff', run: 'r1', seq: 1, step: 'start', at: '2026-11-02T05:00:00.000Z', ms: 10, ok: true, in: null, out: null,
  n: { lines: 1 }, codes: {}, ref: null, err: null,
};

function world({ opted = true, env = {} } = {}) {
  const clock = fixedClock();
  const fs = memoryFs({ [tracePath('r1')]: `${JSON.stringify(ROW)}\n` });
  const home = memoryFs(opted ? { [CONSENT_PATH]: ON } : {});
  const trace = kitIo.createTrace({ fs, clock }).forPackage(telemetry.PKG, telemetry.vocabulary);
  return { fs, clock, home, trace, env: { get: (name) => env[name] ?? null }, packageData: packageDataOf(declaredHere()) };
}
const untouchable = { post: async () => assert.fail('dialled'), get: async () => assert.fail('dialled') };

test('[I-20] the address row ships empty, and that is a code people can read', () => {
  assert.equal(INGEST_URL, null);
  assert.ok(codes.isCode('no-endpoint'));
  assert.match(codes.shortOf('no-endpoint'), /nothing was dialled/);
});

test('[I-20] opted in with news to send: nothing dialled, no-endpoint, nothing recorded as sent', async () => {
  const io = world();
  const res = await send(io, { ...ctx, net: untouchable });
  assert.deepEqual(res, { sent: false, code: 'no-endpoint' });
  assert.equal(io.fs.store.has(SENT_PATH), false);
});

test('[I-20] a closed door keeps its own reason: no-endpoint is said only to someone who opted in', async () => {
  assert.equal((await send(world({ opted: false }), { ...ctx, net: untouchable })).code, 'telemetry-off');
  assert.equal((await send(world({ env: { DO_NOT_TRACK: '1' } }), { ...ctx, net: untouchable })).code, 'telemetry-killed');
});

test('[I-20] on and status say on and name no address, and the debug view says so beside the bytes', async () => {
  const io = world({ opted: false });
  const on = await optIn(io, asPerson);
  assert.deepEqual([on.consent.on, on.url], [true, null]);
  assert.equal((await status(io, ctx)).url, null);
  const said = debug.render(on);
  assert.match(said, /no-endpoint/);
  assert.doesNotMatch(said, /counts would go to|null/);
  const view = await debug.telemetry(world(), ctx);
  assert.match(debug.render(view), /no-endpoint: /);
});

test('debug telemetry says what all sends add up to, and an unchanged state, only where an installed package declares them', async () => {
  const over = (rows) => ({ ...world(), packageData: packageDataOf(rows) });
  const view = await debug.telemetry(over(declaredHere({ shipped: true })), ctx);
  assert.deepEqual([view.whole.taken, view.whole.says, view.local.unchanged, view.local.state], [null, null, null, null],
    'nothing here counts them: not measured, never 0');
  assert.doesNotMatch(debug.render(view), /all sends together|unchanged since/);
  const events = { toy_run: { form: 'run', whole: { step: 'tick', sum: 'items', scale: 100, says: ['ticks', 'items stated', 'none stated'] } },
    toy_state: { form: 'state', says: 'the toy state', bands: ['things'] } };
  const toy = { name: 'toy', text: JSON.stringify({ steps: { tick: 'toy_run', look: 'toy_state' }, codes: [], events }) };
  const said = debug.render(await debug.telemetry(over([...declaredHere({ shipped: true }), toy]), ctx));
  assert.match(said, /^all sends together: 0 ticks, none stated$/m);
  assert.match(said, /^ {2}the toy state, unchanged since this repository's last send: 0 events$/m);
});
