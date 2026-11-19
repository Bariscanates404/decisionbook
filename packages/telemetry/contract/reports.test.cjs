// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Reports end to end through the public verbs, a spy port and the address filled as an opening release would fill it: only closed days
//, a killed close, next = wire = history, a lost ack, the bounds, every answer of the server, the drops before a dial
// (a report from before a since, of another period or policy pair; the period marked at the attempt), reset and forget, and a broken store file.
const test = require('node:test');
const assert = require('node:assert/strict');
const { errors: { fail } } = require('@atlasbound/kit');
const telemetry = require('@atlasbound/telemetry');
const { internals, declaredDescriptors, descriptorRow, telemetryWorld, kitTraceRow, traceLines, spyPort, addressFilled, turnedOnWorld } = require('./world.cjs');

const { PATHS, WIRE, SCHEMA } = internals;
const DAY = '2026-11-17';
const NEXT_DAY = '2026-11-18T10:00:00.000Z';
const dayAt = (time, day = DAY) => `${day}T${time}.000Z`;
const ROWS = [
  kitTraceRow({ step: 'decisionbook.add', at: dayAt('09:00:00'), codes: { 'answer-bound': 1 }, n: { bound: 1 } }),
  kitTraceRow({ step: 'decisionbook.add', at: dayAt('09:01:00'), ok: false, err: { code: 'aside-not-asked', msg: 'src/secret/path.ts' } }),
  kitTraceRow({ step: 'decisionbook.gate', at: dayAt('09:02:00'), n: { decision_ask: 1 }, codes: { 'plan-outside': 1 } }),
  kitTraceRow({ step: 'decisionbook.create', at: dayAt('09:03:00'), n: { records: 3 }, codes: { 'plan-created': 1 } }),
  kitTraceRow({ step: 'plan.phase', at: dayAt('09:04:00'), n: { seconds: 120, turns: 3 }, codes: { 'phase-ready': 1 } }),
  kitTraceRow({ step: 'decisionbook.ready', at: dayAt('09:05:00'), n: { unmet: 2 } }),
  kitTraceRow({ pkg: 'cli', run: 'hook-1', step: 'hook.in', at: dayAt('10:00:00'), ms: null, ref: { event: 'PreToolUse', session: 'secret-session' } }),
  kitTraceRow({ pkg: 'cli', run: 'hook-1', step: 'hook.handler', at: dayAt('10:00:00'), ms: 30, ref: { event: 'PreToolUse' } }),
  kitTraceRow({ pkg: 'cli', run: 'hook-1', step: 'hook.out', at: dayAt('10:00:01'), ms: null, ref: { event: 'PreToolUse' } }),
  kitTraceRow({ pkg: 'cli', run: 'hook-2', step: 'hook.in', at: dayAt('11:00:00'), ms: null, ref: { event: 'Stop' } }),
  kitTraceRow({ pkg: 'cli', run: 'hook-3', step: 'hook.in', at: dayAt('23:59:59'), ms: null, ref: { event: 'SessionStart' } }),
  kitTraceRow({ pkg: 'cli', run: 'cli-2', step: 'setup', at: dayAt('12:00:00'), ms: 9000 }),
  kitTraceRow({ pkg: 'cli', run: 'cli-2', step: 'actor', at: dayAt('12:00:00') }),
  kitTraceRow({ pkg: 'handoff', run: 'cli-3', step: 'handoff', at: dayAt('13:00:00'), n: { kept: 7, messages: 12 }, codes: { 'note-built': 1 } }),
  kitTraceRow({ pkg: 'unregistered', run: 'cli-4', step: 'ask', at: dayAt('13:00:00'), n: { asks: 1 } }),
  kitTraceRow({ pkg: 'telemetry', run: 'cli-5', step: 'send', at: dayAt('13:00:00') }),
  kitTraceRow({ step: 'decisionbook.add', at: dayAt('07:00:00'), codes: { 'before-since': 1 } }),
  kitTraceRow({ step: 'decisionbook.add', at: '2026-11-18T09:00:00.000Z', codes: { today: 1 } }),
];
const LATE_OUT = kitTraceRow({ pkg: 'cli', run: 'hook-3', step: 'hook.out', at: '2026-11-18T00:00:01.000Z', ms: null, ref: { event: 'SessionStart' } });
const files = (rows = ROWS) => ({ '.atlasbound/trace/cli-1.ndjson': traceLines(rows), '.atlasbound/trace/hooks-2026-11-18.ndjson': traceLines([LATE_OUT]) });

/** A world whose person turned everything on at 08:00 of DAY, moved to the next morning. */
const reportingWorld = (over = {}) => turnedOnWorld({ at: dayAt('08:00:00'), files: files(), then: NEXT_DAY, ...over });
const reportsOf = (body) => JSON.parse(body).reports;
const metricRows = (report, m) => report.metrics.filter((one) => one.m === m);
const reportKeys = (io) => [...io.fs.store.keys()].filter((key) => key.startsWith(PATHS.reports)).sort();
const attemptNow = (io) => JSON.parse(io.fs.store.get(PATHS.attempt));
const moveTo = (io, ms) => io.clock.set(new Date(ms).toISOString());

test.beforeEach(() => addressFilled());

test('[I-5] only closed days report: today, rows before since, local-only steps and packages without a namespace never do', async () => {
  const io = await reportingWorld();
  const reports = reportsOf((await telemetry.next(io, {})).body);
  assert.deepEqual(reports.map((one) => [one.module, one.day]), [['cli', DAY], ['db', DAY], ['handoff', DAY]]);
  const bytes = JSON.stringify(reports);
  for (const never of ['before-since', 'today', 'actor', 'unregistered', 'telemetry', 'secret', 'src/']) assert.ok(!bytes.includes(never), never);
  const [cli, db, handoff] = reports;
  assert.deepEqual(metricRows(db, 'failure'), [{ m: 'failure', d: { code: 'aside-not-asked', step: 'decisionbook-add' }, n: 1 }]);
  assert.deepEqual(metricRows(db, 'decision'), [{ m: 'decision', d: { code: 'plan-outside', step: 'decisionbook-gate', verdict: 'ask' }, n: 1 }]);
  assert.deepEqual([metricRows(db, 'ready_unmet')[0].b, metricRows(db, 'phase_seconds')[0].b, metricRows(db, 'answers_bound')[0].n], [{ '1-2': 1 }, { '60-299': 1 }, 1]);
  assert.deepEqual(metricRows(handoff, 'note_kept')[0].b, { '5-19': 1 });
  assert.deepEqual(metricRows(cli, 'hook_incomplete'), [{ m: 'hook_incomplete', d: { event: 'Stop' }, n: 1 }], 'a pair over midnight is complete');
  assert.deepEqual(metricRows(cli, 'step_ms').map((one) => one.d), [{ event: 'PreToolUse', step: 'hook-handler' }], 'setup asks a person: untimed');
  assert.ok(metricRows(cli, 'step').some((one) => one.d.step === 'setup'));
});

test('[I-5] a close killed before closed.json: closing again keeps one report per namespace and day, the same bytes', async () => {
  const io = await reportingWorld();
  await telemetry.next(io, {});
  const first = reportKeys(io).map((key) => io.fs.store.get(key).split('\n')[0]);
  io.fs.remove(PATHS.closed);
  await telemetry.next(io, {});
  assert.deepEqual(reportKeys(io).map((key) => io.fs.store.get(key).split('\n')[0]), first);
  io.fs.writeAtomic(PATHS.closed, '{torn');
  io.fs.store.forEach((_, key) => key.startsWith(PATHS.reports) && io.fs.remove(key));
  await telemetry.next(io, {});
  assert.deepEqual(reportKeys(io), [], 'an unreadable closed.json never folds a day twice');
});

test('[I-6] next, then send: the posted body is next\'s byte for byte, and history\'s lines joined', async () => {
  const io = await reportingWorld();
  const shown = (await telemetry.next(io, {})).body;
  const net = spyPort();
  assert.equal((await telemetry.send(io, { net })).code, 'telemetry-sent');
  assert.equal(net.calls.length, 1);
  assert.equal(net.calls[0].body, shown);
  const kept = (await telemetry.history(io, {})).reports;
  assert.equal(`{"protocol":"${WIRE.protocol}","reports":[${kept.map((one) => one.line).join(',')}]}`, shown);
  assert.deepEqual(kept.map((one) => one.state), ['received', 'received', 'received']);
  assert.equal((await telemetry.send(io, { net })).code, 'telemetry-nothing', 'nothing leaves twice');
});

test('[I-6] a lost ack: the resend is the same ids and bytes; the period is marked sent at the attempt', async () => {
  const io = await reportingWorld();
  const net = spyPort((body, n) => (n === 1 ? { status: 200, retryAfterS: null, text: '' } : spyPort().post('', body)));
  await telemetry.send(io, { net });
  assert.deepEqual((await telemetry.history(io, {})).reports.map((one) => one.state), ['attempted', 'attempted', 'attempted']);
  assert.equal(JSON.parse(io.home.store.get(PATHS.period)).sent, true);
  await telemetry.send(io, { net });
  assert.equal(net.calls[1].body, net.calls[0].body);
});

test('[I-7] the answers: 429 waits its Retry-After; 5xx backs off, retried once at the next due; other 4xx never retried', async () => {
  const io = await reportingWorld();
  const now = Date.parse(NEXT_DAY);
  const answers = [{ status: 429, retryAfterS: 48 * 3600 }, { status: 500 }, { status: 503 }, { status: 400 }];
  const net = spyPort((body, n) => ({ retryAfterS: null, text: '', ...answers[n - 1] }));
  assert.equal((await telemetry.send(io, { net })).code, 'telemetry-throttled');
  assert.equal(attemptNow(io).nextAt, now + 48 * 3600 * 1000);
  assert.equal((await telemetry.send(io, { net })).code, 'telemetry-throttled', 'a person\'s send honours it too');
  assert.equal((await telemetry.due(io, { net })).code, 'telemetry-not-due');
  moveTo(io, now + 49 * 3600 * 1000);
  assert.equal((await telemetry.due(io, { net })).code, 'telemetry-failed');
  const first = attemptNow(io);
  assert.ok(first.nextAt >= Date.parse(io.clock.now()) + 24 * 3600e3 && first.nextAt <= Date.parse(io.clock.now()) + 25 * 3600e3);
  assert.equal((await telemetry.due(io, { net })).code, 'telemetry-not-due');
  moveTo(io, first.nextAt);
  assert.equal((await telemetry.due(io, { net })).code, 'telemetry-failed');
  assert.equal(attemptNow(io).fails, 2);
  assert.ok(attemptNow(io).nextAt >= Date.parse(io.clock.now()) + 48 * 3600e3, 'the wait doubles');
  moveTo(io, attemptNow(io).nextAt);
  assert.equal((await telemetry.due(io, { net })).code, 'telemetry-rejected');
  assert.deepEqual(new Set((await telemetry.history(io, {})).reports.map((one) => one.state)), new Set(['rejected']));
  moveTo(io, attemptNow(io).nextAt);
  assert.equal((await telemetry.due(io, { net })).code, 'telemetry-nothing');
  assert.equal(net.calls.length, 4, 'one dial per attempt, none for a refused batch');
  assert.deepEqual(JSON.parse(io.fs.store.get(PATHS.health)), { send_failed: 2, rejected: 1 });
});

test('[I-7] the choice is read again before the post: turned off after the close, nothing dialled, the queue deleted', async () => {
  const io = await reportingWorld();
  const make = io.fs.createExclusive;
  io.fs.createExclusive = (key, text) => {
    io.home.writeAtomic(PATHS.consent, JSON.stringify({ schema: SCHEMA.consent, at: NEXT_DAY, all: 'off', modules: {}, noticed: null }));
    return make(key, text);
  };
  const net = spyPort();
  await telemetry.send(io, { net });
  assert.deepEqual([net.calls.length, reportKeys(io)], [0, []]);
});

test('[I-7] off m deletes only m\'s waiting reports; reset deletes what waited under the old id and makes a new one', async () => {
  const io = await reportingWorld();
  await telemetry.next(io, {});
  await telemetry.optOut(io, { rest: ['db'] });
  assert.deepEqual(reportKeys(io).map((key) => key.split('/').pop()), [`${DAY}-cli.json`, `${DAY}-handoff.json`]);
  const before = JSON.parse(io.home.store.get(PATHS.period)).id;
  const reset = await telemetry.reset(io, { flags: {} });
  assert.deepEqual([reset.code, reset.deleted, reportKeys(io)], ['telemetry-reset', 2, []]);
  assert.notEqual(JSON.parse(io.home.store.get(PATHS.period)).id, before);
});

test('[I-7] a report from before its namespace\'s since, or made under another policy pair, is dropped before any dial', async () => {
  const b = await reportingWorld();
  await telemetry.next(b, {});
  assert.equal(reportKeys(b).length, 3, 'repository B holds the reports of a day it was on');
  await telemetry.optOut({ ...telemetryWorld({ at: NEXT_DAY }), home: b.home }, {}); // off, typed in repository A: B's queue is not touched
  await telemetry.optIn(b, { ask: async () => true }); // on again, later: since is now
  const net = spyPort();
  assert.deepEqual([(await telemetry.send(b, { net })).code, net.calls.length, reportKeys(b)], ['telemetry-nothing', 0, []]);
  const raised = await reportingWorld();
  await telemetry.next(raised, {});
  WIRE.policy += 1; // the opened release: its core policy is raised, and the person says yes to it
  try {
    await telemetry.optIn(raised, { ask: async () => true });
    assert.deepEqual([(await telemetry.send(raised, { net })).code, net.calls.length], ['telemetry-nothing', 0]);
  } finally {
    WIRE.policy -= 1;
  }
});

test('[I-7] the bounds: an unsent report older than 14 days goes; over 1 MiB the oldest go and are counted lost', async () => {
  const io = await reportingWorld({ at: '2026-10-30T08:00:00.000Z' });
  await telemetry.next(io, {});
  const period = JSON.parse(io.home.store.get(PATHS.period)).id;
  const fake = (day, pad) => [`${PATHS.reports}/${day}-db.json`,
    `${JSON.stringify({ id: 'f'.repeat(32), period, policy: WIRE.policy, module_policy: 1, pad: 'x'.repeat(pad) })}\n{"state":"prepared","attempts":0,"at":"${NEXT_DAY}"}\n`];
  io.fs.writeAtomic(...fake('2026-11-01', 10));
  for (let i = 10; i <= 16; i += 1) io.fs.writeAtomic(...fake(`2026-11-${i}`, 200000));
  await telemetry.next(io, {});
  const left = reportKeys(io).map((key) => key.split('/').pop());
  assert.ok(!left.includes('2026-11-01-db.json') && !left.includes('2026-11-10-db.json') && left.includes('2026-11-16-db.json'), left.join(' '));
  assert.equal(JSON.parse(io.fs.store.get(PATHS.health)).lost, 3);
});

test('[I-7] forget: off first, pending while the server is down, done at the next due, 14 tries; no address: answered at once', async () => {
  const io = await reportingWorld();
  await telemetry.send(io, { net: spyPort() });
  const down = spyPort(() => ({ status: 503, retryAfterS: null, text: '' }));
  const pending = await telemetry.reset(io, { flags: { forget: true }, net: down });
  assert.equal(pending.code, 'forget-pending');
  assert.deepEqual(new Set((await telemetry.status(io, {})).states.map((one) => one.code)), new Set(['telemetry-off']));
  assert.deepEqual(JSON.parse(down.calls[0].body), { protocol: WIRE.protocol, forget: { period: JSON.parse(io.home.store.get(PATHS.period)).forget[0].id,
    token: JSON.parse(io.home.store.get(PATHS.period)).forget[0].token } });
  assert.ok(!down.calls[0].url.includes(JSON.parse(io.home.store.get(PATHS.period)).forget[0].id), 'the id is never in a URL');
  const up = spyPort(() => ({ status: 200, retryAfterS: null, text: '' }));
  moveTo(io, attemptNow(io).nextAt);
  await telemetry.due(io, { net: up });
  assert.deepEqual([up.calls.length, JSON.parse(io.home.store.get(PATHS.period)).forget], [1, []]);
  const never = await reportingWorld();
  await telemetry.send(never, { net: spyPort() });
  await telemetry.reset(never, { flags: { forget: true }, net: down });
  for (let day = 0; day < 14; day += 1) {
    moveTo(never, Date.parse(never.clock.now()) + 8 * 24 * 3600e3);
    await telemetry.due(never, { net: down });
  }
  assert.deepEqual([JSON.parse(never.home.store.get(PATHS.period)).forget, JSON.parse(never.home.store.get(PATHS.period)).expired], [[], 1]);
  addressFilled('', '');
  assert.equal((await telemetry.reset(telemetryWorld(), { flags: { forget: true } })).code, 'forget-none');
});

test('[I-7] a broken report file is skipped and counted; the rest still leaves', async () => {
  const io = await reportingWorld();
  await telemetry.next(io, {});
  io.fs.writeAtomic(`${PATHS.reports}/2026-11-16-db.json`, '{torn');
  const net = spyPort();
  assert.equal((await telemetry.send(io, { net })).code, 'telemetry-sent');
  assert.equal(reportsOf(net.calls[0].body).length, 3);
  assert.equal(JSON.parse(io.fs.store.get(PATHS.health)).unreadable, 1);
});

test('[I-7] a network failure (DNS, TLS, a refused socket) is a failed attempt: backed off, its reports wait as attempted', async () => {
  const io = await reportingWorld();
  const cut = spyPort(() => Promise.reject(fail('net-failed', 'TypeError')));
  assert.equal((await telemetry.send(io, { net: cut })).code, 'telemetry-failed');
  assert.deepEqual([...new Set((await telemetry.history(io, {})).reports.map((one) => one.state))], ['attempted']);
  assert.equal(JSON.parse(io.fs.store.get(PATHS.health)).send_failed, 1);
});

test('[I-7] a module removed from the install takes its waiting reports with it; the others still leave', async () => {
  const extra = descriptorRow('extra', { namespace: 'extra', schema: 1, policy: 1, lock: {}, says: 'a later module', codes: [],
    steps: { tick: 'measured' }, metrics: {} });
  const rows = [...declaredDescriptors({ open: true }), extra];
  const trace = [...ROWS, kitTraceRow({ pkg: 'extra', step: 'tick', at: dayAt('10:30:00') })];
  const io = await turnedOnWorld({ trace, at: dayAt('08:00:00'), then: NEXT_DAY, rows });
  assert.ok(JSON.parse((await telemetry.next(io, {})).body).reports.some((one) => one.module === 'extra'));
  const without = { ...io, packageData: () => rows.slice(0, -1) };
  const net = spyPort();
  await telemetry.send(without, { net });
  assert.deepEqual(JSON.parse(net.calls[0].body).reports.map((one) => one.module), ['cli', 'db', 'handoff']);
  assert.ok(!reportKeys(io).some((key) => key.endsWith('-extra.json')));
});

test('[I-7] received reports leave only by the history bounds: next after off m, after reset, or under a switch deletes none', async () => {
  const io = await reportingWorld();
  await telemetry.send(io, { net: spyPort() });
  const kept = () => reportKeys(io).length;
  const received = kept();
  await telemetry.next({ ...io, env: { get: (name) => (name === 'CI' ? 'true' : null) } }, {});
  assert.equal(kept(), received, 'a process under a switch writes and deletes nothing here');
  await telemetry.optOut(io, { rest: ['db'] });
  await telemetry.next(io, {});
  assert.equal(kept(), received, 'off db deletes what waits, never what was received');
  await telemetry.reset(io, { flags: {} });
  await telemetry.next(io, {});
  assert.equal(kept(), received, 'a reset deletes what waits under the old id; history stays');
});

test('[I-7] a waiting report survives next under a switch', async () => {
  const io = await reportingWorld();
  await telemetry.next(io, {});
  const waiting = reportKeys(io);
  await telemetry.next({ ...io, env: { get: (name) => (name === 'DO_NOT_TRACK' ? '1' : null) } }, {});
  assert.deepEqual(reportKeys(io), waiting);
});

test('[I-5] a close is linear: a day of 60 000 rows closes within two seconds', async () => {
  const many = Array.from({ length: 60000 }, (_, i) => kitTraceRow({ run: `cli-${i % 50}`, at: dayAt(`10:${String(Math.floor(i / 1000) % 60).padStart(2, '0')}:00`) }));
  const io = await reportingWorld({ files: { '.atlasbound/trace/cli-1.ndjson': traceLines(many) } });
  const started = performance.now();
  await telemetry.next(io, {});
  assert.ok(performance.now() - started < 2000, `${Math.round(performance.now() - started)} ms`);
});

test('[I-7] reset says its sentence once', async () => {
  const said = telemetry.debug.render(await telemetry.reset(await reportingWorld(), { flags: {} }));
  assert.equal(said.split('a new random id').length, 2, said);
});

test('[I-7] the daily due keeps received reports: after off db, after reset, and when the period changes', async () => {
  const io = await reportingWorld();
  await telemetry.send(io, { net: spyPort() });
  const received = () => reportKeys(io).filter((key) => io.fs.store.get(key)?.includes('"state":"received"'));
  const first = received();
  const kept = () => first.filter((key) => received().includes(key)).length;
  const due = async () => {
    moveTo(io, Date.parse(io.clock.now()) + 25 * 3600e3);
    await telemetry.due(io, { net: spyPort() });
  };
  await telemetry.optOut(io, { rest: ['db'] });
  await due();
  assert.equal(kept(), first.length, 'off db');
  await telemetry.reset(io, { flags: {} });
  await due();
  assert.equal(kept(), first.length, 'reset');
  const period = JSON.parse(io.home.store.get(PATHS.period));
  io.home.store.set(PATHS.period, JSON.stringify({ ...period, at: new Date(Date.parse(io.clock.now()) - 31 * 24 * 3600e3).toISOString() }));
  await telemetry.optIn(io, { ask: async () => true });
  await due();
  assert.notEqual(JSON.parse(io.home.store.get(PATHS.period)).id, period.id, 'the 30-day period changed');
  assert.equal(kept(), first.length, 'the period change');
});
