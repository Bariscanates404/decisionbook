// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// a plan carries ordered implementation steps and runtime probes, and a whole plan is written in one call. Only
// the public entry and kit's fake io. Every [I-n] names an invariant of this package.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld: world, begin, added, logFile, recordsFor, unmetOf, leavesOthers, tracedSteps, wire, readFor } = require('./world.cjs');

const { verbs } = decisionbook;
const batch = added; // an array of records is one batch
const step = (order, file, over = {}) => ({ t: 'item', kind: 'step', order, file, change: `change ${order}`, verify: 'AC-1', ...over });
const stepless = (records) => records.filter((r) => r.kind !== 'step');
/** Count the appends to one key of an fs (the plan's file, or the person's yes under their home), by the lines each wrote. */
const countAppends = (fs, ends) => {
  const seen = [];
  const append = fs.append;
  fs.append = (key, text) => { if (key.endsWith(ends)) seen.push(text.trim().split('\n').length); return append(key, text); };
  return seen;
};

test('[I-22] add takes a JSON array: its records in one append and one traced step; a refused one writes nothing',
  async () => {
  const io = world();
  const id = await begin(io);
  const appends = countAppends(io.fs, `${id}.jsonl`);
  const yeses = countAppends(io.home, 'yes.jsonl');
  const five = [{ t: 'research', tool: 'grep', asked: 'export query', answer: 'one query', source: 'src/report/export.js:1' },
    { t: 'question', q: 'Q1', text: 'which page size?', decides: 'report.page', whyNotCode: 'a product rule', blocking: true },
    { t: 'link', rel: 'plans', to: 'file:src/report/export.js', why: 'the export code' }, step(1, 'src/report/export.js:12'),
      { t: 'note', text: 'planned in one call' }];
  const res = await batch(io, id, five);
  assert.deepEqual([res.out.records, appends], [5, [5]], 'five records, one append');
  assert.match(res.text, new RegExp(`^${id}: 5 records recorded \\(research, question, link, item, note\\)`));
  assert.deepEqual(io.fs.readText(logFile(id)).trim().split('\n').slice(1).map((line) => JSON.parse(line).t), ['research', 'question', 'link', 'item', 'note'],
    'in order: the question counts the research before it in the same batch');
  const before = io.fs.readText(logFile(id));
  await assert.rejects(batch(io, id, [{ t: 'note', text: 'kept?' }, { t: 'link', rel: 'plans', to: 'file:src/report/csv.js', why: 'w' },
    { t: 'confirm', by: 'ai', said: 'looks good' },
    { t: 'note', text: 'never' }]), (err) => err.code === 'confirm-by-person' && /record 3 of 4: /.test(err.message));
  await assert.rejects(batch(io, id, [{ t: 'confirm', by: 'Ayse', said: 'yes' }, { t: 'research', tool: 'grep', asked: 'no answer' }]),
    { code: 'record-invalid' });
  await assert.rejects(batch(io, id, []), { code: 'plan-args' });
  assert.deepEqual([io.fs.readText(logFile(id)), appends, yeses], [before, [5], []], 'all or nothing: no line written, no yes kept here');
  assert.match((await added(io, id, { t: 'note', text: 'one' })).text, new RegExp(`^${id}: note recorded$`, 'm'), 'one record, as before');
  const loose = await batch(io, id, [step(2, 'src/report/csv.js'), { t: 'link', rel: 'plans', to: 'file:src/report/csv.js', why: 'w' }]);
  assert.deepEqual([loose.out.records, appends], [2, [5, 1, 2]], 'a step before its file is planned is kept: a step is a note of the plan, no gate');
  await batch(io, id, [{ t: 'note', text: 'shown' }, { t: 'confirm', by: 'Ayse', said: 'yes, go ahead' }]);
  assert.deepEqual(yeses, [1], 'the yes of a confirm in a batch is kept once the batch is written');
  assert.deepEqual(tracedSteps(io).filter(([name]) => name === 'decisionbook.add').map(([, ok, code]) => [ok, code]),
    [[true, null], [false, 'confirm-by-person'], [false, 'record-invalid'], [false, 'plan-args'], [true, null], [true, null], [true, null]]);
});

test('[I-23] steps are optional at any level: READY asks none; a step on a file outside the plan is kept, shown, plans nothing',
  async () => {
  const io = world();
  const id = await begin(io);
  const made = await batch(io, id, stepless(recordsFor('normal', ['src/report/export.js', 'src/report/csv/**', 'test/report/export.test.js', 'docs/export.md'])));
  assert.deepEqual([made.out.state.ready, made.out.state.unmet], [true, []], 'no step for any planned path: READY all the same');
  const loose = await added(io, id, step(1, 'src/billing/invoice.js:4'));
  assert.deepEqual([loose.out.state.ready, loose.out.state.unmet], [true, []], 'a step on a file the plan does not name is kept');
  await batch(io, id, [step(2, 'src/report/export.js:42'), step(3, 'src/report/csv/writer.js:writeRow', { after: 2, verify: 'npm test -- csv' })]);
  const plan = (await verbs.show(io, { rest: [id, 'plan'] })).out;
  assert.deepEqual([plan.steps.map((s) => s.file), plan.plan], [['src/billing/invoice.js:4', 'src/report/export.js:42', 'src/report/csv/writer.js:writeRow'],
    ['src/report/export.js', 'src/report/csv/**', 'test/report/export.test.js', 'docs/export.md']], 'the steps are shown in order; a step plans no file');
  const again = await verbs.ready(io, { rest: [id] });
  assert.deepEqual([again.out.ready, again.out.code, io.fs.readText(logFile(id)).split('\n').filter((line) => line.includes('"t":"ready"')).length],
    [true, 'plan-ready', 1], 'ready on a READY plan that holds says so and stores nothing again');
  const critical = await begin(io, { title: 'Critical export', level: 'critical' });
  await readFor(io, critical, ['src/report/export.js']); // critical research rests on a file read
  await batch(io, critical, stepless(recordsFor('critical', ['src/report/export.js'], '.critical')));
  await leavesOthers(io, critical);
  assert.deepEqual(await unmetOf(io, critical), [], 'critical work too');
  const small = await begin(io, { title: 'Small export fix', level: 'micro' });
  await batch(io, small, recordsFor('micro', ['src/report/export.js'], '.small'));
  await leavesOthers(io, small);
  assert.deepEqual(await unmetOf(io, small), [], 'a small fix is unchanged');
  const old = '2026-10-01-old-plan';
  io.fs.writeAtomic(logFile(old), `${[{ schema: 'decisionbook-record/1', t: 'plan', id: old, title: 'Old plan', why: 'w', success: 's', kind: 'feature',
    level: 'normal', branch: 'feat/old' },
    { t: 'link', rel: 'plans', to: 'file:src/old.js', why: 'w' }, { t: 'ready', scope: ['src/old.js'], level: 'normal' }].map(wire).join('\n')}\n`);
  const shown = (await verbs.show(io, { rest: [old, 'plan'] })).out;
  assert.deepEqual([shown.state, shown.plan, shown.steps], ['ready', ['src/old.js'], []], 'READY from before stays READY');
});

test('[I-24] a run probe is research: what was run and what it observed, counted by the research row', async () => {
  const io = world();
  const id = await begin(io, { level: 'critical' }); // the level whose form asks research: five records
  await readFor(io, id, ['lib/parse.js']); // research rests on the session's own reading
  await batch(io, id, [1, 2, 3, 4].map((n) => ({ t: 'research', tool: 'grep', asked: `parse ${n}`, answer: `lib/parse.js:${n}`, source: `lib/parse.js:${n}` })));
  assert.ok((await unmetOf(io, id)).includes('ready-research'), 'four of five');
  await added(io, id, { t: 'research', tool: 'run', command: 'node -e "console.log(Number(process.argv[1]))" abc', observed: 'NaN' });
  assert.ok((await unmetOf(io, id)).includes('ready-research'), 'a probe that runs no file read in the plan\'s sessions does not count');
  await added(io, id, { t: 'research', tool: 'run', command: 'node lib/parse.js abc',
    observed: 'NaN: a bad value parses to NaN, so the parser needs a fallback' });
  await assert.rejects(added(io, id, { t: 'research', tool: 'run', command: 'npm test' }), { code: 'record-invalid' }, 'a probe says what it observed');
  assert.match((await verbs.show(io, { rest: [id, 'research'] })).text,
    /^research run: node lib\/parse\.js abc -> NaN: a bad value parses to NaN/m);
  assert.ok(!(await unmetOf(io, id)).includes('ready-research'), 'a probe is research');
});

test('[I-25] show plan lists the steps in order under the files, and the READY intake gives them in order within its 4 KB',
  async () => {
  const io = world();
  const id = await begin(io);
  const records = stepless(recordsFor('normal', ['src/report/export.js', 'src/report/csv.js']));
  await batch(io, id, [...records.slice(0, -1), step(2, 'src/report/csv.js:writeRow',
    { change: 'write each row as it comes', after: 1, verify: 'npm test -- csv' }),
    step(1, 'src/report/export.js:42', { change: 'old' }), step(1, 'src/report/export.js:42', { change: 'stream rows from the cursor' }), records.at(-1)]);
  const shown = await verbs.show(io, { rest: [id, 'plan'] });
  assert.deepEqual(shown.out.steps.map((s) => [s.order, s.file, s.change, s.verify, s.after]),
    [[1, 'src/report/export.js:42', 'stream rows from the cursor', 'AC-1', null],
    [2, 'src/report/csv.js:writeRow', 'write each row as it comes', 'npm test -- csv', 1]]);
  assert.match(shown.text,
    /\nplan: src\/report\/export\.js, src\/report\/csv\.js\n- step 1 src\/report\/export\.js:42: stream rows from the cursor \(verify AC-1\)\n- step 2 src\/report\/csv\.js:writeRow, after 1: write each row as it comes \(verify npm test -- csv\)\n/);
  assert.equal((await verbs.ready(io, { rest: [id] })).out.ready, true);
  const l0 = (await verbs.resume(io)).out.text;
  assert.match(l0, /\nfiles: src\/report\/export\.js, src\/report\/csv\.js\nsteps:\n- step 1 src\/report\/export\.js:42: stream rows [^\n]+\n- step 2 src\/report\/csv\.js:writeRow, after 1: [^\n]+\nfound by the research:\n(?:- [^\n]+\n){3}confirmed by [^\n]+\nsettled/);
  const many = Array.from({ length: 30 }, (_, i) => step(i + 3, `src/report/export.js:${100 + i}`,
    { change: `move the ${i + 3}th column writer behind the stream, keeping the header row first` }));
  await batch(io, id, many);
  const bounded = (await verbs.resume(io)).out.text;
  assert.ok(Buffer.byteLength(bounded) <= 4096, `${Buffer.byteLength(bounded)} bytes`);
  assert.match(bounded, /\nfound by the research:\n(?:- [^\n]+\n){3}confirmed by /, 'what the research found keeps its room beside the steps');
  assert.match(bounded, /- step 1 [^\n]+\n- step 2 [^\n]+\n- step 3 [^\n]+\n[^]*\+\d+ more: atlasbound decisionbook show \S+ plan\n/,
    'the steps in order, the rest counted with the command that shows them');
  assert.equal(bounded.split('\n').filter((line) => /^- report\.export\.rule\d = /.test(line)).length, 3, 'the settled decisions keep their room');
  assert.ok(bounded.split('\n').filter((line) => line.startsWith('- step ')).length >= 8,
    'the steps take the room the decisions leave, not a fixed half of it');
});
