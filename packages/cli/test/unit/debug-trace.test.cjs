// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The text view of a trace row: its counts, its file, and what its package declares of its rows (ref fields said as their values, counts
// said once in their own unit), with its time marked as UTC (logs a person reads beside it are in local time). A unit of the trace view over
// rows kit's own traced wrote. The same rows also lock the words of a row's n and its ref.file.
const test = require('node:test');
const assert = require('node:assert/strict');
const { traced, io: { createTrace }, testing: { memoryFs, fixedClock } } = require('@atlasbound/kit');
const { debugRuns } = require('../../debug/trace.cjs');

const VOCABULARY = { steps: ['ask', 'inventory'], isCode: () => true }; // a package's own words, as its composition root binds them

// What a package declares of its rows, as its manifest's `trace` says it.
const DECLARED = { apkg: { ref: ['tool', 'input'], counts: { timeMs: ['time', 1000, 2, 's'], sizeIn: ['size', 1, 0, 'in'] } },
  bpkg: { facet: 'zone' } };
const packages = { manifestOf: (pkg) => (DECLARED[pkg] ? { trace: DECLARED[pkg] } : null) };

test('debug trace <run> says a row\'s declared ref fields and counts in their own unit once, and marks its time as UTC', async () => {
  const fs = memoryFs({});
  const clock = fixedClock();
  const io = { fs, clock, run: 'k1', packages, trace: createTrace({ fs, clock }).forPackage('apkg', VOCABULARY) };
  const asked = async () => ({ out: null, n: { timeMs: 1234, sizeIn: 900, other: 2 }, codes: {}, ref: { tool: 'a-tool' } });
  await traced(io, 'ask', asked)({}, { run: 'k1', ref: { input: 'an-input' } });
  // a row with no ref (stored null) is read too
  await traced(io, 'inventory', async () => ({ out: null, n: { files: 3 }, codes: {} }))({}, { run: 'k1' });
  await traced(io, 'inventory', async () => ({ out: null, n: { inputs: 0 }, codes: {} }))({}, { run: 'k1', ref: { file: 'src/app.cjs' } });
  const { text } = await debugRuns({ rest: ['k1'], flags: {} }, io);
  assert.match(text, /^\s*2\s+\d\d:\d\d:\d\dZ\s+apkg\s+inventory\s+ok\s+\d+ms\s+files 3$/m, text);
  assert.match(text, /^\s*3\s+\d\d:\d\d:\d\dZ\s+apkg\s+inventory\s+ok\s+\d+ms\s+src\/app\.cjs\s+inputs 0$/m, text);
  // the declared counts are said once, in their unit, never again as raw n words
  assert.match(text, /^\s*1\s+\d\d:\d\d:\d\dZ\s+apkg\s+ask\s+ok\s+\d+ms\s+a-tool an-input time 1\.23 s size 900 in\s+other 2$/m, text);
});

test('a row of 230 zero counts says them as one count, and pads no other row: the counts are the last column', async () => {
  const fs = memoryFs({});
  const clock = fixedClock();
  const io = { fs, clock, run: 'k2', trace: createTrace({ fs, clock }).forPackage('apkg', VOCABULARY) };
  const zeros = Object.fromEntries(Array.from({ length: 230 }, (_, i) => [`shelf_scanned|part${i}|volumes`, 0]));
  await traced(io, 'inventory', async () => ({ out: null, n: { ...zeros, served: 2 }, codes: {} }))({}, { run: 'k2' });
  await traced(io, 'inventory', async () => ({ out: null, n: { files: 3 }, codes: {} }))({}, { run: 'k2', ref: { file: 'src/app.cjs' } });
  const lines = (await debugRuns({ rest: ['k2'], flags: {} }, io)).text.trimEnd().split('\n');
  assert.match(lines[0], /\s+inventory\s+ok\s+\d+ms\s+served 2, 230 more counts 0 \(--json lists them\)$/, lines[0]);
  assert.match(lines[1], /\s+inventory\s+ok\s+\d+ms\s+src\/app\.cjs\s+files 3$/, lines[1]);
  assert.ok(lines.every((line) => line.length < 120), `no row padded by another: ${lines.map((l) => l.length)}`);
});

// counts that are not zero fold too, once they no longer fit
test('a row of many counts that are not zero stays short: the first that fit are named, the rest is one count of counts', async () => {
  const fs = memoryFs({});
  const clock = fixedClock();
  const io = { fs, clock, run: 'k3', trace: createTrace({ fs, clock }).forPackage('apkg', VOCABULARY) };
  const counts = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`shelf_scanned|part${i}|volumes`, i % 3 ? i : 0]));
  await traced(io, 'inventory', async () => ({ out: null, n: counts, codes: {} }))({}, { run: 'k3' });
  await traced(io, 'inventory', async () => ({ out: null, n: { a: 0, b: 1, c: 2, d: 0, e: 4, f: 5, g: 6, h: 7 }, codes: {} }))({}, { run: 'k3' });
  const lines = (await debugRuns({ rest: ['k3'], flags: {} }, io)).text.trimEnd().split('\n');
  assert.match(lines[0], /\s+shelf_scanned\|part1\|volumes 1, shelf_scanned\|part2\|volumes 2, shelf_scanned\|part4\|volumes 4, 37 more counts, 20 more counts 0 \(--json lists them\)$/, lines[0]);
  assert.ok(lines[0].length < 200, `${lines[0].length} characters (the 40 counts that are not zero are not all named)`);
  assert.match(lines[1], /a 0, b 1, c 2, d 0, e 4, f 5, g 6, h 7$/, 'a row of at most eight counts names every one, its zeros too');
});

test('--tally counts the rows per package, step and declared facet, so a session shows what each of its steps did', async () => {
  const fs = memoryFs({});
  const clock = fixedClock();
  const words = { steps: ['first', 'second', 'third', 'fourth'], isCode: () => true };
  const io = { fs, clock, run: 'h1', packages, trace: createTrace({ fs, clock }).forPackage('bpkg', words) };
  const row = (step, n, codes, ref) => traced(io, step, async () => ({ out: null, n, codes }))({}, { run: 'h1', ref: { session: 's9', ...ref } });
  await row('first', { calls: 3, items: 1, chars: 400 }, { 'a-named': 1, 'b-given': 1 }, { file: 'src/a.js' });
  await row('first', { calls: 3, items: 0, chars: 300 }, { 'a-named': 1 }, {});
  await row('second', { files: 1, items: 1 }, { 'b-given': 1 }, { file: 'src/b.js' });
  await row('fourth', { lines: 4 }, { c_found: 1 }, { zone: 'other' });
  const view = await debugRuns({ rest: [], flags: { session: 's9', tally: true } }, io);
  assert.deepEqual(view.out.tallies.map((t) => [t.step, t.facet, t.rows, t.codes, t.n]), [
    ['first', null, 2, { 'a-named': 2, 'b-given': 1 }, { calls: 6, items: 1, chars: 700 }],
    ['second', null, 1, { 'b-given': 1 }, { files: 1, items: 1 }],
    ['fourth', 'zone other', 1, { c_found: 1 }, { lines: 4 }]]);
  assert.match(view.text, /^\s*bpkg\s+fourth\s+zone other\s+×1\s+c_found ×1\s+lines 4$/m, view.text);
});
