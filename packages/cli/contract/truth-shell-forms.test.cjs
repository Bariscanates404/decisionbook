// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the shell forms the table of real commands has no row for (test/fixtures/shell-forms.json, written by hand), against a human's verdict
// through the real bin, in the table's world; and a write no reader can see, which only Stop can name.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { replyJson, writeFiles, runAll } = require('./support.cjs');
const { tableWorld, shellWorld, againstHuman } = require('./truth-world.cjs');
const TABLE = require('../test/fixtures/shell-commands.json');
const FORMS = require('../test/fixtures/shell-forms.json');

const UNRECORDED = 'protected files changed in this session and no READY or closed plan of this branch covers them: record this change in a ' +
  'plan (why, the decisions, the files) before you finish';

test('252 write and read forms by hand each name the protected file or say they cannot place it; near misses stay silent', async () => {
  const { repo, env } = tableWorld(TABLE.policy);
  assert.deepEqual([FORMS.rows.length, FORMS.rows.filter((row) => row.human.verdict === 'allow').length], [252, 103]);
  await againstHuman(repo, env, FORMS.rows);
});

test('one write\'s cd chain is bounded: a 770 KB command asks that it was too long to read, inside 3 s', async () => {
  const { repo, env } = tableWorld(TABLE.policy);
  const command = `${`cd ${'a'.repeat(100)}; `.repeat(7000)}${'cd ..; '.repeat(7000)}rm app/models/user.rb`;
  const started = Date.now();
  await againstHuman(repo, env, [{ from: '7000 cds down and 7000 up', cwd: '', command, human: { verdict: 'ask', unplaced: true, unread: true } }]);
  assert.ok(Date.now() - started < 3000, `answered in ${Date.now() - started} ms`);
});

test('the gate\'s own store made unreadable is no off switch: every write after it asks naming the failure', async () => {
  const { repo, env } = tableWorld(TABLE.policy);
  const LOST = 'atlasbound: hook-lost: hook (io-read-failed: .atlasbound/cli/config.json: EACCES): a gate formed no verdict on this write, so it asks: allow it only if you meant it';
  // the port runs past the config and says what else the closed store cost (no trace row, no said record); it reads the module
  // choice from the same store, so the unreadable store is named for the packages too
  const NOTE = 'atlasbound: no verdict formed by hook (io-read-failed: .atlasbound/cli/config.json: EACCES), trace (io-write-failed), packages (io-read-failed), said (io-read-failed)';
  const asked = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: LOST }, systemMessage: NOTE };
  const model = path.join(repo, 'app/models/user.rb');
  const events = [
    [{ tool_name: 'Bash', tool_input: { command: 'rm app/models/user.rb' } }, asked],
    [{ tool_name: 'Bash', tool_input: { command: 'echo x | tee app/models/user.rb' } }, asked],
    [{ tool_name: 'Write', tool_input: { file_path: model, content: 'x' } }, asked],
    [{ tool_name: 'Bash', tool_input: { command: 'cat app/models/user.rb' } }, { systemMessage: NOTE }],
  ];
  const store = path.join(repo, '.atlasbound');
  fs.chmodSync(store, 0);
  try {
    const answers = await runAll(shellWorld().bin, events.map(([payload]) => ({ args: ['hook', 'PreToolUse'], cwd: repo, env,
      input: JSON.stringify({ session_id: 's1', cwd: repo, hook_event_name: 'PreToolUse', ...payload }) })));
    assert.deepEqual(answers.map((a) => [a.code, replyJson(a)]), events.map(([, want]) => [0, want]));
  } finally {
    fs.chmodSync(store, 0o755);
  }
  assert.equal(fs.existsSync(model), false, 'the hook judged; it ran nothing');
});

test('no command makes the gate silent by being slow or by running out of memory: it is read in time or asks as too long', async () => {
  const { repo, env } = tableWorld(TABLE.policy);
  const code = (tail) => `python3 - <<'EOF'\nopen('app/models/user.rb', 'w').write('x')\n${tail}\nEOF`;
  const files = Array.from({ length: 2000 }, (_, i) => `tmp/f${i}.txt`).join(' ');
  const touched = `${'cd .; '.repeat(30000)}echo $(touch ${Array.from({ length: 30000 }, (_, i) => `t${i}`).join(' ')} app/models/user.rb)`;
  const started = Date.now();
  await againstHuman(repo, env, [
    { from: 'a for of 870 chars', cwd: '', command: code(`for${' '.repeat(400)}p${' '.repeat(400)}x`), human: { verdict: 'ask',
      file: 'app/models/user.rb' } },
    { from: 'a tuple of 6.5 KB', cwd: '', command: code(`\n${' '.repeat(3200)}a,b${' '.repeat(3200)}x`), human: { verdict: 'ask',
      file: 'app/models/user.rb' } },
    { from: '2000 files', cwd: '', command: `rm -f ${files} app/models/user.rb`, human: { verdict: 'ask', unplaced: true, unread: true } },
    { from: '379 KB: 30,000 cds and a touch of 30,000 files', cwd: '', command: touched, human: { verdict: 'ask', unplaced: true,
      unread: true } },
  ]);
  assert.ok(Date.now() - started < 9000, `all four answered inside the hook's deadline: ${Date.now() - started} ms`);
});

test('a write no reader can see, a tool rewriting a protected file itself, is silent at the gate, and Stop names that file', () => {
  const { repo, said } = tableWorld(TABLE.policy);
  const command = 'cp config/locales/en.yml /tmp/en.before.yml; bundle exec i18n-tasks normalize -l en 2>&1 | tail -2; diff /tmp/en.before.yml ' +
    'config/locales/en.yml';
  assert.deepEqual(replyJson(said('PreToolUse', { tool_name: 'Bash', tool_input: { command } })), {},
    'the gate cannot see what i18n-tasks writes: it says nothing, it does not guess');
  writeFiles(repo, { 'config/locales/en.yml': 'en:\n  normalized: true\n', [TABLE.policy.plan[0]]: 'two\n', 'spec/models/user_spec.rb': 'two\n' });
  const stop = (over = {}) => replyJson(said('Stop', { stop_hook_active: false, ...over }));
  assert.deepEqual(stop(), { decision: 'block', reason: `DecisionBook: stop-unrecorded: config/locales/en.yml: ${UNRECORDED}` },
    'only the protected file outside the plan: not the planned file, not the spec');
  assert.deepEqual(stop({ stop_hook_active: true }), {}, 'never twice in a row');
});
