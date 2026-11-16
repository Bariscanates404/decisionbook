// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Consent is a home record, never env. Black box: the public entry, kit and fake io. No test dials: the net is a spy.
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: kitIo, testing: { memoryFs, fixedClock }, trace: { tracePath }, errors: { fail } } = require('@atlasbound/kit');
require('./address.cjs');
const telemetry = require('@atlasbound/telemetry');
const { declaredHere, packageDataOf } = require('./declared.cjs');

const { send, optIn, optOut, status, debug, CONSENT_PATH, INGEST_URL, SCHEMA, codes } = telemetry;
const ctx = { run: 'job-run', version: '1.2.3' };
// Only a person at a terminal opts in.
const asPerson = { ...ctx, ask: async () => assert.fail('opting in asks nothing') };
const HOSTILE_URL = 'https://attacker.example/steal';
// Every name a repository could plausibly set to open the door or move it.
const PLAUSIBLE_ON = [
  'ATLASBOUND_TELEMETRY', 'ATLASBOUND_TELEMETRY_ENABLED', 'ATLASBOUND_TELEMETRY_OPT_IN', 'ATLASBOUND_TELEMETRY_OPTIN', 'ATLASBOUND_OPT_IN',
  'ATLASBOUND_CONSENT', 'ATLASBOUND_PUMP', 'TELEMETRY', 'TELEMETRY_ENABLED', 'ENABLE_TELEMETRY', 'DO_TRACK',
];
const PLAUSIBLE_URL = [
  'ATLASBOUND_TELEMETRY_URL', 'ATLASBOUND_TELEMETRY_ENDPOINT', 'ATLASBOUND_CLOUD_URL', 'ATLASBOUND_INGEST_URL', 'ATLASBOUND_URL', 'ATLASBOUND_ENDPOINT',
  'TELEMETRY_URL', 'TELEMETRY_ENDPOINT', 'OTEL_EXPORTER_OTLP_ENDPOINT',
];
const EVERY_NAME = {
  ...Object.fromEntries(PLAUSIBLE_ON.map((name) => [name, '1'])),
  ...Object.fromEntries(PLAUSIBLE_URL.map((name) => [name, HOSTILE_URL])),
};

const envOf = (values) => ({ get: (name) => values[name] ?? null });
// a step of a package every install has
const row = (over) => ({
  v: 1, pkg: 'handoff', run: 'r1', seq: 1, step: 'start', at: '2026-11-02T05:00:00.000Z', ms: 10, ok: true, in: null, out: null,
  n: {}, codes: {}, ref: null, err: null, ...over,
});
const traceFile = () => ({ [tracePath('r1')]: `${JSON.stringify(row({}))}\n` });
const RECORD_ON = JSON.stringify({ schema: SCHEMA.consent, on: true, at: '2026-11-03T00:00:00.000Z' });

function world({ env = {}, home = {}, noHome = false } = {}) {
  const fs = memoryFs(traceFile());
  const clock = fixedClock();
  const trace = kitIo.createTrace({ fs, clock }).forPackage(telemetry.PKG, telemetry.vocabulary);
  return { fs, clock, home: noHome ? null : memoryFs(home), trace, env: envOf(env), packageData: packageDataOf(declaredHere()) };
}
function spyNet() {
  const calls = [];
  return { calls, post: async (url, body) => { calls.push({ url, body }); return { status: 200 }; } };
}
const reachOut = async (io) => {
  const net = spyNet();
  return { res: await send(io, { ...ctx, net }), net };
};

test('[I-13] with every plausible env name set and no record: off, and the net port is never called', async () => {
  for (const [name, value] of Object.entries(EVERY_NAME)) {
    const { res, net } = await reachOut(world({ env: { [name]: value } }));
    assert.deepEqual([name, res.sent, res.code, net.calls.length], [name, false, 'telemetry-off', 0]);
  }
  const { res, net } = await reachOut(world({ env: EVERY_NAME }));
  assert.deepEqual([res.sent, res.code, net.calls.length], [false, 'telemetry-off', 0]);
});

test('[I-13] the record opens it, and only the built-in URL is dialled whatever env says', async () => {
  assert.match(INGEST_URL, /^https:\/\//);
  const { res, net } = await reachOut(world({ env: EVERY_NAME, home: { [CONSENT_PATH]: RECORD_ON } }));
  assert.equal(res.sent, true);
  assert.deepEqual(net.calls.map((call) => call.url), [INGEST_URL]);
});

test('[I-13] the wall is the same with or without env: the decision reads no env name but the hard-off switches', async () => {
  const asked = [];
  const home = memoryFs({ [CONSENT_PATH]: JSON.stringify({ schema: SCHEMA.consent, on: true }) });
  await status({ ...world({}), home, env: { get: (name) => { asked.push(name); return null; } } }, { run: 'consent-run' });
  assert.deepEqual([...new Set(asked)].sort(), ['ATLASBOUND_PUMP', 'DO_NOT_TRACK', 'MCP_OBS_DISABLED']);
});

for (const [name, text] of [
  ['the old file\'s shape', '{"enabled":true}'],
  ['on as a word', JSON.stringify({ schema: 'ab-consent/1', on: 'true' })],
  ['on as a number', JSON.stringify({ schema: 'ab-consent/1', on: 1 })],
  ['an unknown major', JSON.stringify({ schema: 'ab-consent/2', on: true })],
  ['no schema', JSON.stringify({ on: true })],
  ['an array', '[true]'],
  ['null', 'null'],
]) {
  test(`[I-14] a record holding ${name} reads off and never dials`, async () => {
    const { res, net } = await reachOut(world({ home: { [CONSENT_PATH]: text } }));
    assert.deepEqual([res.sent, res.code, net.calls.length], [false, 'telemetry-off', 0]);
  });
}

test('[I-14] a record that is not JSON is off, by its own code, with the file named in nothing that leaves', async () => {
  const { res, net } = await reachOut(world({ home: { [CONSENT_PATH]: '{"on":tr' } }));
  assert.deepEqual([res.sent, res.code, net.calls.length], [false, 'telemetry-consent-unreadable', 0]);
  assert.ok(codes.isCode(res.code));
});

test('doctor measures the stored choice: a torn record is a problem naming its code and its file; a readable one is a fact', async () => {
  const torn = await telemetry.doctor({ ...world({ home: { [CONSENT_PATH]: '{"on":tr' } }), run: 'doctor-run' });
  assert.deepEqual(torn, { ok: false, says: `off: telemetry-consent-unreadable: the stored choice could not be read; telemetry stays off until atlasbound telemetry on or off writes it again (~/${CONSENT_PATH})` },
    'telemetry answers doctor itself, so a torn choice is a problem, never "not measured"');
  assert.deepEqual(await telemetry.doctor({ ...world({ home: { [CONSENT_PATH]: JSON.stringify({ schema: SCHEMA.consent, on: true }) } }), run: 'doctor-run' }),
    { ok: true, says: `on: telemetry-on: ${codes.shortOf('telemetry-on')}` });
  assert.deepEqual(await telemetry.doctor({ ...world(), run: 'doctor-run' }), { ok: true, says: `off: telemetry-off: ${codes.shortOf('telemetry-off')}` });
});

test('[I-14] a record that is refused for being a link is off, not a crash', async () => {
  const io = world();
  io.home.readText = () => { throw fail('path-link', 'a planted link'); };
  const { res, net } = await reachOut(io);
  assert.deepEqual([res.sent, res.code, net.calls.length], [false, 'telemetry-consent-unreadable', 0]);
});

test('[I-15] .atlasbound/telemetry.json is not read: enabled:true does not open it, enabled:false does not stop an opt-in', async () => {
  const OLD = '.atlasbound/telemetry.json';
  assert.notEqual(CONSENT_PATH, OLD);
  assert.equal((await reachOut(world({ home: { [OLD]: '{"enabled":true}' } }))).net.calls.length, 0);
  assert.equal((await reachOut(world({ home: { [OLD]: '{"enabled":false}', [CONSENT_PATH]: RECORD_ON } }))).net.calls.length, 1);
});

test('[I-16] telemetry on writes the record, status reads it, off closes it; each says so', async () => {
  const io = world();
  assert.deepEqual((await status(io, ctx)).consent.code, 'telemetry-off');
  const on = await optIn(io, asPerson);
  assert.deepEqual([on.consent.on, on.consent.code, on.url], [true, 'telemetry-on', INGEST_URL]);
  assert.equal(JSON.parse(io.home.store.get(CONSENT_PATH)).on, true);
  assert.equal((await status(io, ctx)).consent.on, true);
  assert.equal((await reachOut(io)).net.calls.length, 1);
  const off = await optOut(io, ctx);
  assert.deepEqual([off.consent.on, off.consent.code], [false, 'telemetry-off']);
  assert.equal(JSON.parse(io.home.store.get(CONSENT_PATH)).on, false);
  assert.equal((await reachOut(io)).net.calls.length, 0);
});

test('[I-16] nothing is written to the repository by on or off, and status writes no record', async () => {
  const io = world();
  await status(io, ctx);
  assert.equal(io.home.store.has(CONSENT_PATH), false);
  await optIn(io, asPerson);
  await optOut(io, ctx);
  assert.deepEqual([...io.fs.store.keys()].filter((key) => key.includes('consent')), []);
});

test('[I-16] a kill switch set after on wins, status says so, and off still works', async () => {
  const io = world({ env: { DO_NOT_TRACK: '1' }, home: { [CONSENT_PATH]: RECORD_ON } });
  assert.equal((await status(io, ctx)).consent.code, 'telemetry-killed');
  assert.equal((await reachOut(io)).net.calls.length, 0);
  assert.equal((await optOut(io, ctx)).consent.on, false);
});

test('[I-16] a machine with no home: off, status says why, and on is refused by code', async () => {
  const io = world({ noHome: true });
  assert.equal((await status(io, ctx)).consent.code, 'telemetry-no-home');
  assert.equal((await reachOut(io)).net.calls.length, 0);
  await assert.rejects(() => optIn(io, asPerson), (err) => err.code === 'telemetry-no-home');
});

test('[I-16] debug telemetry and status read the same consent as send', async () => {
  const io = world({ home: { [CONSENT_PATH]: RECORD_ON } });
  assert.equal((await debug.telemetry(io, ctx)).consent.on, true);
  assert.equal((await status(io, ctx)).consent.on, true);
  assert.ok(debug.render(await status(io, ctx)).includes('telemetry-on'));
});

test('[I-16] every consent verb leaves its trace, with its code', async () => {
  const io = world();
  await optIn(io, asPerson);
  await optOut(io, ctx);
  await status(io, ctx);
  const rows = io.fs.store.get(tracePath(ctx.run)).trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(rows.map((one) => one.step), ['consent-on', 'consent-off', 'consent-status']);
  assert.deepEqual(rows[0].codes, { 'telemetry-on': 1 });
  assert.deepEqual(rows[1].codes, { 'telemetry-off': 1 });
});
