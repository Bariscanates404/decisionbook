// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// /decide as the AI reads it: the record its template hands, filled in as written, is stored as the person's decision when the person
// said it; the template never asks the AI for the person's name (the product writes who decided).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, begin, added, refusedWith, planRecords } = require('./world.cjs');

const TEMPLATE = fs.readFileSync(path.join(__dirname, '..', 'commands', 'decide.md'), 'utf8');
const EXPORT = 'src/report/export.js';
const SAID = 'Exports are CSV files with a header row, because the bank imports CSV.';
// what an AI writes for each field the template leaves to it: a <placeholder> by what it names, a blank as it is
const FILLS = { key: 'report.format', value: 'CSV files with a header row', why: 'the bank imports CSV', by: 'Ayse', said: SAID, files: [EXPORT] };
const templateRecord = (text) => JSON.parse(/`(\{"t":"decision"[^`]*\})`/.exec(text)[1]);
const filledIn = (record) => Object.fromEntries(Object.entries(record)
  .map(([field, v]) => [field, Array.isArray(v) || /^<.*>$/.test(v) ? FILLS[field] : v]));

test('the record /decide hands, filled in as written, is the person\'s decision with their sentence; no name is asked of the AI', async () => {
  const io = bookWorld({ files: { [EXPORT]: 'a\n' } });
  await decisionbook.handlers.start({ hook_event_name: 'SessionStart', session_id: 's1', source: 'startup' }, io);
  io.session = 's1';
  const say = (prompt) => decisionbook.handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt }, io);
  await say('Make the report export faster.');
  const id = await begin(io);
  await say(SAID);
  await added(io, id, filledIn(templateRecord(TEMPLATE)));
  const stored = planRecords(io, id).filter((r) => r.t === 'decision');
  assert.deepEqual(stored.map((d) => [d.key, d.by, d.said]), [['report.format', 'the person', SAID]]);
  assert.doesNotMatch(TEMPLATE, /their name/, 'who decided is the product\'s to write');
});

// /decisionbook's waiver, as its text hands it: who waived is the product's to write, as for /decide; only the person's own sentence waives
const BOOK = fs.readFileSync(path.join(__dirname, '..', 'commands', 'decisionbook.md'), 'utf8');
const WAIVED = 'It is only a copy change in the login page, keep it normal work.';
test('the waiver /decisionbook hands drops a raised level only on the person\'s own words; words they never typed are refused', async () => {
  const io = bookWorld({ files: { 'src/auth/token.js': 'a\n' } });
  await decisionbook.handlers.start({ hook_event_name: 'SessionStart', session_id: 's1', source: 'startup' }, io);
  io.session = 's1';
  const say = (prompt) => decisionbook.handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt }, io);
  await say('Change the login page copy.');
  const id = await begin(io, { title: 'Login page copy' });
  await added(io, id, { t: 'link', rel: 'plans', to: 'file:src/auth/token.js', why: 'the copy' });
  const level = async () => (await decisionbook.verbs.show(io, { rest: [id, 'plan'] })).out.level.code;
  assert.equal(await level(), 'level-raised');
  const record = JSON.parse(/`(\{"t":"waiver"[^`]*\})`/.exec(BOOK)[1]);
  assert.deepEqual([record.by, Object.hasOwn(record, 'said')], ['', true], 'the text leaves who to the product and asks for their sentence');
  assert.equal((await refusedWith(io, id, { ...record, reason: 'a copy change', said: 'The person said it is fine.' }))[0], 'said-not-theirs',
    'words the person never said waive nothing');
  assert.equal(await level(), 'level-raised');
  await say(WAIVED);
  await added(io, id, { ...record, reason: 'a copy change', said: WAIVED });
  assert.equal(await level(), 'level-waived');
  assert.deepEqual(planRecords(io, id).filter((r) => r.t === 'waiver').map((r) => r.by), ['the person']);
});
