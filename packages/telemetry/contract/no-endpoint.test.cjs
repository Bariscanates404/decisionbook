// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// I-20: the address row as shipped is empty. Opted in, due and sent: nothing is dialled, the answer is no-endpoint, and the reports
// are still made and shown. The same row filled (as an opening release fills it, as data) posts once. The net is a spy that fails if touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const telemetry = require('@atlasbound/telemetry');
const { internals, kitTraceRow, spyPort, addressFilled, turnedOnWorld } = require('./world.cjs');

const { WIRE, PATHS } = internals;
const { debug } = telemetry;
const untouchable = { post: async () => assert.fail('dialled') };
const opted = () => turnedOnWorld({ trace: [kitTraceRow({ at: '2026-11-17T09:00:00.000Z' }), kitTraceRow({ pkg: 'handoff', step: 'keep', at: '2026-11-17T09:30:00.000Z' })] });

test('[I-20] the address and the forget address ship empty, and that is a code people can read', () => {
  assert.deepEqual([WIRE.url, WIRE.forget], ['', '']);
  assert.match(telemetry.debug.render({ code: 'no-endpoint' }), /^telemetry: no-endpoint: .*nothing was dialled/);
});

test('[I-20] as shipped: opted in, due and send dial nothing and answer no-endpoint; next and history still show the reports', async () => {
  const io = await opted();
  assert.equal((await telemetry.due(io, { net: untouchable })).code, 'no-endpoint');
  assert.equal((await telemetry.send(io, { net: untouchable })).code, 'no-endpoint');
  const next = await telemetry.next(io, {});
  assert.deepEqual(JSON.parse(next.body).reports.map((one) => one.module), ['db', 'handoff']);
  assert.deepEqual((await telemetry.history(io, {})).reports.map((one) => one.state), ['prepared', 'prepared']);
  const said = debug.render(next);
  assert.match(said, /this build has no address: nothing is sent, whatever is chosen/);
  assert.match(debug.render(await telemetry.send(io, { net: untouchable })), /^telemetry: no-endpoint: this build has no address; nothing was dialled/);
  assert.equal((await telemetry.due(io, { net: untouchable })).code, 'telemetry-not-due', 'once a day');
});

test('[I-20] a forget with no address answers at once and dials nothing; status never names an address', async () => {
  const io = await opted();
  assert.equal((await telemetry.reset(io, { flags: { forget: true }, net: untouchable })).code, 'forget-none');
  io.home.writeAtomic(PATHS.period, JSON.stringify({ schema: 'ab-period/1', id: 'a'.repeat(32), token: 'b'.repeat(64), at: '2026-11-17T00:00:00.000Z',
    sent: true, past: [], forget: [], expired: 0 }));
  assert.equal((await telemetry.reset(io, { flags: { forget: true }, net: untouchable })).code, 'forget-unreachable');
  assert.doesNotMatch(debug.render(await telemetry.status(io, {})), /goes to:/);
});

test('[I-20] the same row filled: one post, to that address alone', async () => {
  addressFilled('https://telemetry.example/v1/reports', '');
  try {
    const io = await opted();
    const net = spyPort();
    assert.equal((await telemetry.due(io, { net })).code, 'telemetry-sent');
    assert.deepEqual(net.calls.map((call) => call.url), ['https://telemetry.example/v1/reports']);
    assert.match(debug.render(await telemetry.status(io, {})), /^goes to: https:\/\/telemetry\.example\/v1\/reports, once a day/m);
  } finally {
    addressFilled('', '');
  }
});
