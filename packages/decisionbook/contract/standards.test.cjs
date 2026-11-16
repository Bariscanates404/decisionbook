// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// where the repository shows two ways of one thing and the plan writes a new file there, DecisionBook asks
// the team once, at `ready`; a person's decision of the pattern's key, in any plan, closes it for good. The root's `standards` closure is faked here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verbs } = require('@atlasbound/decisionbook');
const { bookWorld, readyOne, added, begin, recordsFor, lastN } = require('./world.cjs');

const KEY = 'style.module.app.export';
const TWO_WAYS = { key: KEY, family: 'module', part: 'app', facet: 'export', m: 14, verdict: 'mixed', globs: ['src/app/**'],
  values: [{ value: 'default', n: 9, examples: [{ file: 'src/app/a.js', line: 1 }, { file: 'src/app/b.js', line: 3 }] },
    { value: 'named', n: 5, examples: [{ file: 'src/app/c.js', line: 2 }] }] };
/** The root's closure: an add-on's pattern rows of the parts the files fall in; null: no add-on or nothing counted. */
const standardsOf = (rows) => async (files) => (rows ? rows.filter(() => files.some((f) => f.startsWith('src/app/'))) : null);
const twoWaysWorld = (rows = [TWO_WAYS]) => ({ ...bookWorld({ files: { 'src/app/a.js': 'export default A;\n' } }), standards: standardsOf(rows) });
const NEW = 'src/app/NewThing.js';
const readyText = async (io, id) => (await verbs.ready(io, { rest: [id] })).text;
const codesOf = (res) => res.out.unmet.map((u) => u.code);

test('[I-29] a plan writing a new file where the repository shows two ways is not READY until a person decides the key', async () => {
  const io = twoWaysWorld();
  const { id, res } = await readyOne(io, { plans: [NEW] });
  assert.deepEqual(codesOf(res), ['ready-standard-undecided']);
  const text = await readyText(io, id);
  assert.match(text, /\n {2}module · app, export: default in 9, named in 5 of 14; e\.g\. src\/app\/a\.js:1, src\/app\/c\.js:2\n/u);
  assert.match(text, /\n {4}ask the person once which is the team's standard, then: \/decide style\.module\.app\.export "default", "named" or "either" with files src\/app\/\*\*\n/u);
  await added(io, id, { t: 'decision', key: KEY, value: 'default', why: 'the house way', by: 'ai', files: ['src/app/**'] });
  assert.deepEqual(codesOf(await verbs.ready(io, { rest: [id] })), ['ready-standard-undecided'], "an AI's guess decides nothing");
  await added(io, id, { t: 'decision', key: KEY, value: 'default', why: 'the house way', by: 'Ayse', files: ['src/app/**'] });
  assert.equal((await verbs.ready(io, { rest: [id] })).out.ready, true);
  assert.equal(lastN(io, 'decisionbook.ready').standards, 0);
});

test('[I-29] a decided key of two ways is never asked again; a later plan planning a new file there is READY', async () => {
  const io = twoWaysWorld();
  const first = await readyOne(io, { plans: [NEW], title: 'First' });
  await added(io, first.id, { t: 'decision', key: KEY, value: 'either', why: 'both stay', by: 'Ayse', files: ['src/app/**'] });
  const second = await readyOne(io, { plans: ['src/app/Other.js'], title: 'Second' });
  assert.deepEqual([second.res.out.ready, codesOf(second.res)], [true, []]);
  const { standards, standardsDecided } = lastN(io, 'decisionbook.add');
  assert.deepEqual([standards, standardsDecided], [0, 1], 'the trace tells "decided before" from "no two ways here"');
});

test('[I-29] nothing is asked for an edited tracked file, a part with one way, micro work or where no add-on counted patterns', async () => {
  const edited = await readyOne(twoWaysWorld(), { plans: ['src/app/a.js'] });
  assert.equal(edited.res.out.ready, true, 'a tracked file keeps its style');
  const oneWay = await readyOne(twoWaysWorld([]), { plans: [NEW] });
  assert.equal(oneWay.res.out.ready, true, 'no row of two ways');
  const io = twoWaysWorld(null);
  await readyOne(io, { plans: [NEW] });
  assert.deepEqual([lastN(io, 'decisionbook.add').standardsUnread, lastN(io, 'decisionbook.add').standards], [1, undefined]);
  const micro = twoWaysWorld();
  const id = await begin(micro, { level: 'micro' });
  for (const record of recordsFor('micro', [NEW])) await added(micro, id, record);
  assert.equal((await verbs.ready(micro, { rest: [id] })).out.ready, true, 'micro work is not asked');
});
