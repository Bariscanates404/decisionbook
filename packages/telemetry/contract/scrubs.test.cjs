// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The wall suite (danger zone: it never loses a case): every place a hostile value could ride in has its case, against the validator the
// server runs (validateReport over schemaOf) and through the trace into the stored and posted bytes. It only asks what leaves, so
// a later additive metric stays green while a loosened wall goes red.
const test = require('node:test');
const assert = require('node:assert/strict');
const { text: { secrets } } = require('@atlasbound/kit');
const telemetry = require('@atlasbound/telemetry');
const { internals, declaredDescriptors, telemetryWorld, kitTraceRow, traceLines, spyPort, addressFilled, turnedOnWorld } = require('./world.cjs');

const { schemaOf, validateReport, WIRE } = internals;
const SCHEMA = schemaOf(declaredDescriptors({ open: true }));
const HOSTILE = {
  relativePath: 'src/billing/charge.ts',
  homePath: '/Users/someone/work/customer/app.py',
  marketingPath: 'app/(marketing)/pricing/page.tsx',
  recordId: 'lib/router.js#handleRequest',
  sourceLine: 'function charge(card) { return card.number; }',
  openaiKey: ['sk', 'abcdefghijklmnopqrstuvwxyz012345'].join('-'),
  githubToken: ['ghp', 'abcdefghijklmnopqrstuvwxyz0123'].join('_'),
  awsKey: ['AKIA', 'ABCDEFGHIJKLMNOP'].join(''),
  bearer: 'bearer abcdefghijklmnopqrstuvwxyz',
  privateKey: ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' '),
  digest16: '0123456789abcdef',
  email: 'someone@customer.example',
  uuid: '0d6f6a3e-52a7-4f0e-9e1c-6a3f6c1d2b7a',
  longText: 'x'.repeat(20000),
};
const needles = Object.values(HOSTILE);
const carriers = [...needles, needles, { nested: needles[0] }, 3.5, -1, true, null];
const GOOD = { id: 'a'.repeat(32), period: 'b'.repeat(32), verifier: 'c'.repeat(64), module: 'db', schema: 1, policy: 1, module_policy: 1,
  release: '0.25.2', node: 22, os: 'macos', day: '2026-11-17', consent: 'person',
  metrics: [{ m: 'step', d: { outcome: 'ok', step: 'decisionbook-add' }, n: 1 }] };
const withRow = (over) => ({ ...GOOD, metrics: [{ ...GOOD.metrics[0], ...over }] });
const refusedReport = (report, where) => assert.notEqual(validateReport(report, SCHEMA), null, where);

test('[I-1] the shape that passes: every string a closed word, a version, a day or a random id', () => {
  assert.equal(validateReport(GOOD, SCHEMA), null);
});

test('[I-1] every metric, every dimension and a name the schema lacks: a hostile value in any of them refuses the report', () => {
  for (const [name, spec] of Object.entries(SCHEMA.modules.db[1].metrics)) {
    for (const dim of [...Object.keys({ ...spec.dims, ...spec.opt }), 'file', 'path', 'name', 'branch', 'text', 'message']) {
      for (const value of carriers) refusedReport(withRow({ m: name, d: { ...GOOD.metrics[0].d, [dim]: value } }), `${name}.${dim}`);
    }
  }
});

test('[I-1] a descriptor that could loosen the wall does not read: its package registers nothing, the others stay', () => {
  const open = declaredDescriptors({ open: true });
  const toy = (over) => ({ name: 'toy', text: JSON.stringify({ namespace: 'toy', schema: 1, policy: 1, lock: {}, says: 'x', codes: [], steps: { tick: 'measured' },
    metrics: {}, ...over }) });
  for (const bad of [{ fields: ['path'] }, { metrics: { m: { step: 'tick', n: 'a/path' } } }, { metrics: { m: { step: 'tick', n: 'x', buckets: [5, 1] } } },
    { steps: { tick: 'free-text' } }, { says: HOSTILE.longText }, { namespace: 'Bad Space' }, { event: { steps: ['tick'], words: [HOSTILE.homePath] } }]) {
    const schema = schemaOf([...open, toy(bad)]);
    assert.deepEqual([Object.keys(schema.modules).sort(), schema.modules.toy], [['cli', 'db', 'handoff'], undefined], JSON.stringify(bad).slice(0, 80));
  }
});

test('[I-1] a metric no rule knows never leaves, whatever it carries', () => {
  for (const m of ['page_view', 'session_start', 'file_read', 'no_such_metric', '__proto__', 'constructor']) {
    refusedReport(withRow({ m }), m);
    carriers.forEach((value) => refusedReport(withRow({ m, d: { file: value } }), m));
  }
});

test('[I-1] a field no rule names leaves neither raw nor hashed: a row key, dimension or envelope key refuses the report', () => {
  for (const key of ['file', 'path', 'rel', 'name', 'branch', 'git_sha', 'text', 'error', 'message', 'value', 'files', 'findings', 'file_hash']) {
    refusedReport(withRow({ [key]: 'customer-value' }), key);
    refusedReport(withRow({ d: { ...GOOD.metrics[0].d, [key]: 'other' } }), key);
    refusedReport({ ...GOOD, [key]: 'customer-value' }, key);
  }
});

test('[I-1] a list never passes, not even as its length', () => {
  refusedReport(withRow({ n: ['a/b.js', 'c/d.js'] }), 'n');
  refusedReport(withRow({ d: { outcome: ['ok'], step: 'decisionbook-add' } }), 'd');
  refusedReport({ ...GOOD, metrics: Array.from({ length: SCHEMA.rows + 1 }, () => GOOD.metrics[0]) }, 'rows past the bound');
});

test('[I-1] every envelope key: identity, session, host and repository never leave, in any form', () => {
  for (const key of ['user', 'user_id', 'email', 'session', 'session_id', 'host', 'hostname', 'repo', 'repo_path', 'cwd', 'ip', 'seq', 'ts']) {
    carriers.forEach((value) => refusedReport({ ...GOOD, [key]: value }, key));
  }
  for (const key of ['id', 'period', 'verifier', 'module', 'day', 'os', 'consent']) carriers.forEach((value) => refusedReport({ ...GOOD, [key]: value }, key));
});

test('[I-1] the count wall: hostile types refuse, an integer up to the cap passes', () => {
  for (const bad of ['3', -1, 1.5, Number.NaN, Infinity, true, {}, [], HOSTILE.digest16, WIRE.limits.countCap + 1]) refusedReport(withRow({ n: bad }), String(bad));
  assert.equal(validateReport(withRow({ n: 0 }), SCHEMA), null);
  assert.equal(validateReport(withRow({ n: WIRE.limits.countCap, o: true }), SCHEMA), null);
  refusedReport(withRow({ o: false }), 'the overflow flag is true or absent');
});

test('[I-1] the enum wall: an off-list word and a hostile string refuse; a listed word passes', () => {
  for (const bad of ['no-such-step', HOSTILE.relativePath, 1, null, ['decisionbook-add']]) refusedReport(withRow({ d: { outcome: 'ok', step: bad } }), String(bad));
  for (const bad of ['plan-outside ', 'PLAN-OUTSIDE', HOSTILE.uuid]) {
    refusedReport({ ...GOOD, metrics: [{ m: 'code', d: { code: bad, step: 'decisionbook-add' }, n: 1 }] }, bad);
  }
});

test('[I-1] a release passes only as x.y.z; the day is a day, never a time of day', () => {
  for (const release of ['0.25.2-beta.1', '0.25.2+abcdef0', HOSTILE.homePath, '1.2']) refusedReport({ ...GOOD, release }, release);
  const { release, ...without } = GOOD;
  assert.equal(validateReport(without, SCHEMA), null, `no official release: ${release} absent`);
  for (const day of ['2026-11-17T09:00:00.000Z', '2026-13-01', HOSTILE.homePath]) refusedReport({ ...GOOD, day }, day);
});

test('[I-1] malformed input never throws and never passes; an inherited name is no metric or module', () => {
  for (const raw of [null, undefined, 7, 'x', [], {}, { module: '__proto__' }, { ...GOOD, module: 'constructor' }, withRow({ d: null }),
    withRow({ b: { __proto__: null } })]) {
    assert.doesNotThrow(() => refusedReport(raw, JSON.stringify(raw)?.slice(0, 40)));
  }
});

async function wallWorld(trace, version = '0.25.2') {
  const io = await turnedOnWorld({ trace });
  io.version = version;
  return io;
}
const storeBytes = (io) => [...io.fs.store.entries()].filter(([key]) => !key.startsWith('.atlasbound/trace/')).map(([, text]) => text).join('\n');
function assertClean(bytes, where) {
  needles.forEach((needle) => assert.ok(!bytes.includes(needle.slice(0, 60)), `${where} leaked ${needle.slice(0, 40)}`));
  assert.deepEqual(secrets.find(bytes), [], where);
}

test('[I-1] a hostile value in every trace field never reaches a stored or posted byte; an unlisted word leaves as other', async () => {
  const at = '2026-11-17T09:00:00.000Z';
  const rows = needles.flatMap((value) => [kitTraceRow({ at, pkg: value }), kitTraceRow({ at, step: value }), kitTraceRow({ at, codes: { [value]: 1 } }),
    kitTraceRow({ at, n: { [value]: 5, records: 3 } }), kitTraceRow({ at, ok: false, err: { code: value, msg: value } }),
    kitTraceRow({ at, pkg: 'cli', step: 'hook.handler', ref: { event: value, session: value, path: value } }), kitTraceRow({ at, ref: { file: value } })]);
  addressFilled();
  try {
    const io = await wallWorld(rows, HOSTILE.homePath);
    const net = spyPort();
    await telemetry.next(io, {});
    await telemetry.send(io, { net });
    assertClean(`${storeBytes(io)}\n${net.calls.map((call) => call.body).join('\n')}`, 'store and wire');
    const db = JSON.parse(net.calls[0].body).reports.find((one) => one.module === 'db');
    assert.equal(db.release, undefined, 'a version not of the official shape is left out');
    assert.ok(db.metrics.some((one) => one.m === 'failure' && one.d.code === 'other'));
    const cli = JSON.parse(net.calls[0].body).reports.find((one) => one.module === 'cli');
    assert.ok(cli.metrics.some((one) => one.m === 'step' && one.d.event === 'other'));
  } finally {
    addressFilled('', '');
  }
});

test('[I-1] a pathological day stays bounded: past the cap rows go from the end, counted locally, and the report stays valid', async () => {
  const codes = Array.from({ length: 3000 }, (_, i) => `toy-code-${i}`);
  const toy = { name: 'toy', text: JSON.stringify({ namespace: 'toy', schema: 1, policy: 1, lock: {}, says: 'a toy', codes,
    steps: Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`s${i}`, 'measured'])), metrics: {} }) };
  const rows = codes.flatMap((code, i) => [kitTraceRow({ pkg: 'toy', step: `s${i % 4}`, at: '2026-11-17T09:00:00.000Z', codes: { [code]: 1 } })]);
  const io = telemetryWorld({ at: '2026-11-17T08:00:00.000Z', files: { '.atlasbound/trace/cli-1.ndjson': traceLines(rows) }, rows: [...declaredDescriptors({ open: true }), toy] });
  await telemetry.optIn(io, { rest: ['toy'], ask: async () => true });
  io.clock.set('2026-11-18T10:00:00.000Z');
  const report = JSON.parse((await telemetry.next(io, {})).body).reports[0];
  assert.ok(Buffer.byteLength(JSON.stringify(report)) <= WIRE.limits.reportBytes);
  assert.ok(report.metrics.length < 6000);
  assert.ok(JSON.parse(io.fs.store.get(internals.PATHS.health)).cut > 0);
});

test('[I-1] the wall is deterministic: the same counts give the same rows and bytes, whatever the order of the trace', async () => {
  const at = '2026-11-17T09:00:00.000Z';
  const rows = [kitTraceRow({ at, codes: { 'plan-created': 1 } }), kitTraceRow({ at, step: 'decisionbook.gate', n: { decision_deny: 1 } }), kitTraceRow({ at, ms: 700 })];
  const one = await wallWorld(rows);
  const two = await wallWorld([...rows].reverse());
  const metrics = async (io) => JSON.stringify(JSON.parse((await telemetry.next(io, {})).body).reports.map((report) => report.metrics));
  assert.equal(await metrics(one), await metrics(two));
});
