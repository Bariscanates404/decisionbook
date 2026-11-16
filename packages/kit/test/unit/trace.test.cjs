// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { traced, codes, errors: { fail, isFail }, trace: { tracePath }, io, testing: { memoryFs, fixedClock } } = require('@atlasbound/kit');

// A tiny package vocabulary: the trace knows only what the package that binds it names.
const VOCAB = { steps: ['plan', 'decide', 'ask', 'parse'], isCode: codes.createCodes([['provider-timeout', 'x'], ['plan-truncated', 'x']]).isCode };
const createTrace = (deps) => io.createTrace(deps).forPackage('alpha', VOCAB);
const ok = { run: 'r1', step: 'plan', ok: true, in: null, out: null, n: { planned: 3 }, codes: {}, ref: null, err: null };
const setup = () => { const fs = memoryFs(); return { fs, trace: createTrace({ fs, clock: fixedClock() }) }; };
const linesOf = (fs, run) => fs.readText(tracePath(run)).trim().split('\n').map((l) => JSON.parse(l));

test('trace.record writes one NDJSON line per record, seq counts per run', () => {
  const { fs, trace } = setup();
  trace.record(ok);
  trace.record({ ...ok, step: 'decide' });
  trace.record({ ...ok, run: 'r2' });
  const r1 = linesOf(fs, 'r1');
  assert.deepEqual(r1.map((r) => [r.seq, r.step, r.v, r.at]), [[1, 'plan', 1, '2026-11-02T06:00:00.000Z'], [2, 'decide', 1, '2026-11-02T06:00:00.000Z']]);
  assert.deepEqual(linesOf(fs, 'r2').map((r) => r.seq), [1]);
});

test('trace.record refuses an unknown step, a free-text code and a missing run, and writes nothing', () => {
  const { fs, trace } = setup();
  assert.throws(() => trace.record({ ...ok, step: 'summarise' }), (e) => isFail(e, 'trace-invalid') && /step/.test(e.message));
  assert.throws(() => trace.record({ ...ok, codes: { 'the model looked confused': 1 } }), (e) => isFail(e, 'trace-invalid') && /codes/.test(e.message));
  assert.throws(() => trace.record({ ...ok, run: undefined }), (e) => isFail(e, 'trace-invalid') && /run/.test(e.message));
  assert.throws(() => trace.record({ ...ok, run: '../x' }), (e) => isFail(e, 'trace-invalid') && /run/.test(e.message));
  assert.throws(() => trace.record({ ...ok, ok: false, err: { code: 'free text', msg: 'm' } }), (e) => isFail(e, 'trace-invalid'));
  assert.equal(fs.store.size, 0);
});

test('trace.event records a coded failure on the catch path', () => {
  const { fs, trace } = setup();
  trace.event('r1', 'ask', { code: 'provider-timeout', msg: 'no answer' });
  const [rec] = linesOf(fs, 'r1');
  assert.deepEqual([rec.step, rec.ok, rec.err], ['ask', false, { code: 'provider-timeout', msg: 'no answer' }]);
});

test('traced: a step returns { out, n, codes } and gets exactly one record with in/out digests', async () => {
  const fs = memoryFs();
  const clock = fixedClock();
  const io = { fs, clock, trace: createTrace({ fs, clock }) };
  const plan = traced(io, 'plan', async (input) => ({ out: { planned: input.files }, n: { planned: input.files.length }, codes: { 'plan-truncated': 1 } }));
  const res = await plan({ files: ['a', 'b'] }, { run: 'r1', ref: { kind: 'test_helper' } });
  assert.deepEqual(res.n, { planned: 2 });
  const [rec] = linesOf(fs, 'r1');
  assert.equal(rec.step, 'plan');
  assert.equal(rec.ok, true);
  assert.equal(rec.ms, 5);
  assert.match(rec.in, /^[0-9a-f]{64}$/);
  assert.match(rec.out, /^[0-9a-f]{64}$/);
  assert.deepEqual([rec.n, rec.codes, rec.ref], [{ planned: 2 }, { 'plan-truncated': 1 }, { kind: 'test_helper' }]);
});

test('traced: a failing step is recorded ok:false with its code and rethrown; an uncoded error is recorded without its text', async () => {
  const fs = memoryFs();
  const clock = fixedClock();
  const io = { fs, clock, trace: createTrace({ fs, clock }) };
  await assert.rejects(traced(io, 'ask', async () => { throw fail('provider-timeout', 'no answer in 600 s'); })({}, { run: 'r1' }), (e) => isFail(e, 'provider-timeout'));
  await assert.rejects(traced(io, 'parse', async () => JSON.parse('{secret file content'))({}, { run: 'r1' }), SyntaxError);
  await assert.rejects(traced(io, 'plan', async () => ({ out: 1, n: { x: -1 }, codes: {} }))({}, { run: 'r1' }), (e) => isFail(e, 'shape-invalid'));
  const recs = linesOf(fs, 'r1');
  assert.deepEqual(recs.map((r) => [r.step, r.ok, r.err.code]), [['ask', false, 'provider-timeout'], ['parse', false, 'unexpected-error'], ['plan', false, 'shape-invalid']]);
  assert.equal(recs[1].err.msg, 'SyntaxError');
});

test('a coded error keeps its code across packages: any table bound in this process vouches for it, and no second table exists', async () => {
  const fs = memoryFs();
  const clock = fixedClock();
  const alpha = createTrace({ fs, clock });
  const beta = alpha.forPackage('beta', { steps: ['read'], isCode: codes.createCodes([['beta-broke', 'x']]).isCode });
  const io = { fs, clock, trace: alpha };
  await assert.rejects(traced(io, 'plan', async () => { throw fail('beta-broke', 'in beta'); })({}, { run: 'r1' }), (e) => isFail(e, 'beta-broke'));
  await assert.rejects(traced(io, 'ask', async () => { throw fail('in-no-table', 'a typo'); })({}, { run: 'r1' }), (e) => isFail(e, 'in-no-table'));
  const recs = linesOf(fs, 'r1');
  assert.deepEqual(recs.map((r) => [r.pkg, r.step, r.err.code, r.err.msg]), [['alpha', 'plan', 'beta-broke', 'beta-broke: in beta'], ['alpha', 'ask', 'unexpected-error', 'Error']]);
  assert.deepEqual([alpha.knows('beta-broke'), beta.knows('provider-timeout'), alpha.knows('in-no-table')], [true, true, false]);
  assert.deepEqual([alpha.isCode('beta-broke'), beta.isCode('provider-timeout')], [false, false], 'each table stays its own');
});

test('a step still counts only its own codes, and an error code no table holds is still refused', () => {
  const fs = memoryFs();
  const alpha = createTrace({ fs, clock: fixedClock() });
  alpha.forPackage('beta', { steps: ['read'], isCode: codes.createCodes([['beta-broke', 'x']]).isCode });
  assert.throws(() => alpha.record({ ...ok, codes: { 'beta-broke': 1 } }), (e) => isFail(e, 'trace-invalid'));
  assert.throws(() => alpha.result({ out: 1, n: {}, codes: { 'beta-broke': 1 } }), (e) => isFail(e, 'shape-invalid'));
  assert.throws(() => alpha.record({ ...ok, ok: false, err: { code: 'in-no-table', msg: 'x' } }), (e) => isFail(e, 'trace-invalid'));
  assert.equal(alpha.event('r1', 'plan', { code: 'beta-broke', msg: 'x' }).err.code, 'beta-broke');
});

test('a coded error with the longest message keeps its code: the code and the prefix never push a record past its cap', async () => {
  const fs = memoryFs();
  const clock = fixedClock();
  const io = { fs, clock, trace: createTrace({ fs, clock }) };
  await assert.rejects(traced(io, 'ask', async () => { throw fail('provider-timeout', 'x'.repeat(500)); })({}, { run: 'r1' }), (e) => isFail(e, 'provider-timeout'));
  const [rec] = linesOf(fs, 'r1');
  assert.equal(rec.err.code, 'provider-timeout');
  assert.ok(rec.err.msg.length <= 200, String(rec.err.msg.length));
});
