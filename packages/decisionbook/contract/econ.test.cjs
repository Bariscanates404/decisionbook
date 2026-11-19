// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the plan costs the coding AI few calls: one call plans it, every write says its new state, a view is read once
// and then walked by node. Only the public entry and kit's fake io.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld: world, recordsFor, logFile, planRecords, added, wire } = require('./world.cjs');

const { verbs } = decisionbook;
const HEAD = { title: 'Report export is slow', why: 'large exports time out', success: 'a 10,000 row export finishes in 5 s', kind: 'feature', level: 'normal' };
const econStart = (io, over = {}) => verbs.create(io, { rest: [wire({ ...HEAD, ...over })] });

test('one new call starts the plan with its whole plan and makes it READY; the text names what it recorded and the state', async () => {
  const io = world();
  const res = await econStart(io, { records: recordsFor('normal', ['src/report/**']) });
  const { id } = res.out;
  assert.deepEqual([res.out.state.ready, res.out.records, planRecords(io, id).map((r) => r.t).at(-1)], [true, recordsFor('normal', ['src/report/**']).length, 'ready'],
    'the plan and the READY record are in the plan file, last line ready');
  assert.match(res.text, new RegExp(`^${id} started: \\.decisionbook/${id}\\.jsonl\\n${id}: \\d+ records recorded \\([^)]+\\)\\n${id} READY as normal work`));
  assert.equal(io.fs.readText(logFile(id)).trim().split('\n').length, recordsFor('normal', ['src/report/**']).length + 2, 'the head, the records, one ready');
  const row = io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line)).find((r) => r.step === 'decisionbook.create');
  assert.deepEqual([row.ref, row.n.records, row.n.unmet], [{ file: `.decisionbook/${id}.jsonl`, plan: id }, res.out.records, 0],
    'debug trace answers which plan a write made and what it left, never its text');
});

test('without the person yes the same call leaves a draft and names the missing row; the yes alone then makes it READY', async () => {
  const io = world();
  const records = recordsFor('normal', ['src/report/**']);
  const res = await econStart(io, { records: records.slice(0, -1) });
  const { id } = res.out;
  assert.deepEqual([res.out.state.ready, res.out.state.unmet.map((u) => u.code)], [false, ['ready-no-confirm']]);
  assert.deepEqual(res.out.state.rows, { met: 11, asked: 12 }, 'its progress: the rows met of the rows its level asks');
  assert.match(res.text, /not READY as normal work: 11 of 12 rows met\n {2}ready-no-confirm: /);
  const yes = await added(io, id, records.at(-1));
  assert.deepEqual([yes.out.state.ready, planRecords(io, id).at(-1).t], [true, 'ready'], 'the second and last call: the yes makes it READY');
  // normal work with fewer than 3 research records on files read in its sessions gets one note at READY, never a refusal
  const note = decisionbook.codes.WORDS.researchNote.replace('{read}', '0').replace('{needs}', '3');
  assert.equal(yes.text, `${id}: confirm recorded\n${id} READY as normal work. ${decisionbook.codes.WORDS.frozen}\n${note}\n`, 'READY says the freeze');
  const again = await added(io, id, { t: 'note', text: 'more' });
  assert.deepEqual([again.out.state.ready, planRecords(io, id).filter((r) => r.t === 'ready').length], [true, 1], 'a later write tells READY, stores no second one');
});

// a refused new writes nothing, so the same new is sent again
test('a refused record in new writes nothing, not even the plan, and says so', async () => {
  const io = world();
  const bad = [{ t: 'question', q: 'Q1', text: 'which page size?', decides: 'report.page', whyNotCode: 'a rule', blocking: true }];
  await assert.rejects(econStart(io, { records: bad }), (err) => err.code === 'research-first' && /^research-first: nothing written: 2026-11-02-report-export-is-slow: /.test(err.message));
  assert.equal(io.fs.exists('.decisionbook/2026-11-02-report-export-is-slow.jsonl'), false, 'no file');
});

test('the first full show of a session ends with the node map, and a second bare show gives head and map only', async () => {
  const io = world();
  const { id } = (await econStart(io, { records: recordsFor('normal', ['src/report/export.js', 'src/report/csv.js']) })).out;
  io.session = 's1'; // the whole plan with its yes is a person's own call; a session then reads it
  const first = await verbs.show(io, { rest: [id] });
  assert.deepEqual([first.out.seen, first.out.steps.length, first.out.nodes.steps, first.out.nodes.gaps], [false, 2, 2, 7]);
  assert.match(first.text, new RegExp(`\\nnodes: [^\\n]*steps 2, gaps 7[^\\n]*; one node only: atlasbound decisionbook show ${id} <node>`));
  const second = await verbs.show(io, { rest: [id] });
  assert.deepEqual([second.out.seen, 'steps' in second.out, second.text.trim().split('\n').length], [true, false, 4], 'head, level, read-once word, map');
  assert.match(second.text, /given in full earlier in this session: fetch the node you need/);
  const full = await verbs.show(io, { rest: [id], flags: { full: true } });
  assert.deepEqual([full.out.seen, full.out.steps.length], [false, 2], '--full gives it all again');
  const step = await verbs.show(io, { rest: [id, 'steps.2'] });
  assert.deepEqual([step.out.steps.map((s) => s.file), 'gaps' in step.out], [['src/report/csv.js'], false], 'steps.<order> picks that step only');
  const gap = await verbs.show(io, { rest: [id, 'gaps.tests-proof'] });
  assert.deepEqual(gap.out.gaps.map((g) => g.gap), ['tests-proof'], 'gaps.<gap> picks that gap');
  assert.deepEqual((await verbs.show(io, { rest: [id, 'checks.0'] })).out.checks.map((c) => c.id), ['AC-1'], 'a 0-based index');
  await assert.rejects(verbs.show(io, { rest: [id, 'nothing.1'] }), (err) => err.code === 'plan-args' && /^plan-args: nothing: show takes /.test(err.message));
});
