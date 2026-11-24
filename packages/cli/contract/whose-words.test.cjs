// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A teammate's words reach the plan under the teammate's name whenever the person passes them on: in the task message itself, before
// any question exists, and in a message typed while the plan is a draft. Through the real bin and the real prompt hook: the rule of
// whose words a decision holds is in the hook's answer to that very message, and the record the AI then sends is stored as relayed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, tmp, setupRepo, fire, portRow, hookContextOf, protect, run, knownIn } = require('./support.cjs');

const FILE = 'src/report/export.js';
const RULE = /^Whose words a decision holds: one rule, for every decision you record from what the person writes[^\n]+\n1\. [^\n]+she told me: '7 days'[^\n]+whose: Emma/m;
const TASK = 'Add a CSV export to the report page.\nEmma (BA): cap it at 500 rows.';
const DRAFT = [{ t: 'research', tool: 'read', asked: 'where rows are built', answer: 'one function', source: `${FILE}:1` },
  { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the export' }];

test('a teammate\'s words in the task message or beside a draft plan are told the rule and stored as that teammate\'s', () => {
  const world = makeWorld();
  const { repo } = setupRepo(world, { [FILE]: 'function rows() {}\n' });
  protect(repo, ['src/**']);
  const env = { HOME: knownIn(repo, tmp('whose-home-'), 'Lee') };
  const said = (event, payload = {}) => fire(repo, portRow(repo, event, ''), { session_id: 's1', cwd: repo, hook_event_name: event, ...payload }, env);
  const told = (prompt) => hookContextOf(said('UserPromptSubmit', { prompt }));
  const ai = (args, input) => run(world.bin, [...args, '--target', repo], { input, env: { ...env, CLAUDE_CODE_SESSION_ID: 's1' }, ai: true });
  const decisions = (id) => fs.readFileSync(path.join(repo, '.decisionbook', `${id}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    .filter((row) => row.t === 'decision').map((row) => [row.key, row.by, row.saidBy, row.source, row.said]);
  assert.equal(said('SessionStart', { source: 'startup' }).code, 0);
  // the task message carries the teammate's answer: no plan and no question yet, and the rule comes with this message
  const first = told(TASK);
  assert.match(first, RULE, 'the rule, with the task message that carries a teammate\'s words');
  assert.match(first, /"whose":"<person \| the teammate whose words the message gives>"/, 'and the new\'s own decision line asks whose the words are');
  const made = ai(['decisionbook', 'new'], JSON.stringify({ title: 'CSV export', why: 'people need the rows offline', success: 'a CSV downloads',
    kind: 'feature', level: 'micro', records: [...DRAFT,
      { t: 'decision', key: 'export.cap', value: '500 rows', why: 'the BA set the size', whose: 'Emma (BA)', said: 'cap it at 500 rows' }] }));
  assert.equal(made.code, 0, made.err);
  const id = made.out.split(' ')[0];
  assert.deepEqual(decisions(id), [['export.cap', 'Lee', 'Emma (BA)', 'said in session', TASK.split('\n')[1]]], 'hers, relayed, its whole sentence');
  assert.match(ai(['decisionbook', 'show', id, 'decisions']).out, /export\.cap = 500 rows \(the BA set the size; by Emma \(BA\), relayed by Lee, said in session\)/);
  // a fresh context on the draft, which asks no question: a short message that passes a teammate's word on is told the rule too
  assert.equal(said('SessionStart', { source: 'clear' }).code, 0);
  assert.match(told('Olivia: semicolons'), RULE, 'the rule, with any message while the plan is a draft');
  const more = ai(['decisionbook', 'add', id], JSON.stringify({ t: 'decision', key: 'export.separator', value: 'semicolon', why: 'the PM chose it',
    whose: 'Olivia', said: 'semicolons' }));
  assert.equal(more.code, 0, more.err);
  assert.deepEqual(decisions(id).at(-1), ['export.separator', 'Lee', 'Olivia', 'said in session', 'Olivia: semicolons']);
});
