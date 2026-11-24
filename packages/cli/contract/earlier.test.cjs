// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// through the real bin: `atlasbound hook SessionStart` and `hook PreToolUse` (an Edit, and a Bash command that writes the file), JSON on
// stdin, and the decisionbook verbs, in a temporary git repository with app/** protected. READY is the freeze: a plan made READY in
// session s1 covers s1's Edit, and a later session s2 (a /clear, a new day) starts from the plan's frozen sentence and writes under it with no
// resume record; a protected file outside the plan joins it, said in one line; a resume record is still taken and kept as history.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, tmp, setupRepo, fire, portRow, hookDecisionOf, hookContextOf, protect, run, typedYes, knownIn } = require('./support.cjs');

const FILE = 'app/x.rb';
const OTHER = 'app/y.rb';
const PLAN = [{ t: 'research', tool: 'grep', asked: 'MAX_OPTIONS', answer: 'one constant', source: `${FILE}:1` }, { t: 'item', kind: 'feature',
  text: 'poll options' },
  { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the limit' }, { t: 'check', id: 'AC-1', text: 'the limit is read', command: 'rake test' },
  { t: 'item', kind: 'task', text: 'read the limit', covers: ['AC-1'] }, { t: 'confirm', by: 'developer', said: 'yes' }];

test('through the real bin a plan made READY in one session covers its Edit and a later session\'s writes, with no resume', () => {
  const world = makeWorld();
  const { repo } = setupRepo(world, { [FILE]: 'class X\nend\n', [OTHER]: 'class Y\nend\n' });
  protect(repo, ['app/**']);
  const env = { HOME: knownIn(repo, tmp('earlier-home-')) };
  const ab = (...args) => run(world.bin, [...args, '--target', repo], { env: typedYes(env).env }); // the person types the verbs at their terminal
  const said = (session, event, payload = {}) => fire(repo, portRow(repo, event, payload.tool_name || ''), { session_id: session, cwd: repo,
    hook_event_name: event, ...payload }, env);
  const decided = (session, payload) => hookDecisionOf(said(session, 'PreToolUse', payload));
  const editOf = (file) => ({ tool_name: 'Edit', tool_input: { file_path: path.join(repo, file), old_string: 'X', new_string: 'Y' } });
  const edit = editOf(FILE);
  const shell = { tool_name: 'Bash', tool_input: { command: `cat > ${FILE} <<'EOF'\nclass X\nEOF` } };
  assert.equal(said('s1', 'SessionStart', { source: 'startup' }).code, 0);
  const id = ab('decisionbook', 'new', JSON.stringify({ title: 'Poll option limit', why: 'the limit is fixed', success: 'the env sets it', kind: 'feature',
    level: 'micro' })).out.split(' ')[0];
  assert.equal(ab('decisionbook', 'add', id, JSON.stringify(PLAN)).code, 0);
  assert.match(ab('decisionbook', 'ready', id).out, new RegExp(`^${id} READY as small fix\\. Frozen: `, 'm'));
  assert.deepEqual(decided('s1', edit), {}, 'made READY in this session: the gate allows (silence)');
  // a later session starts from the READY plan: the frozen sentence and its files, and no call to make before it writes
  const started = hookContextOf(said('s2', 'SessionStart', { source: 'clear' }));
  assert.match(started, new RegExp(`^Plan ${id} READY on \\S+: Poll option limit\\nFrozen: [^\\n]+\\n[^]*^files: ${FILE}$`, 'm'));
  assert.doesNotMatch(started, /"t":"resume"|earlier session/);
  assert.deepEqual(decided('s2', edit), {}, 'a later session, no resume record: the READY plan covers its edit (silence)');
  assert.deepEqual(decided('s2', shell), {}, 'and the shell command that writes the same file');
  // a protected file outside the frozen plan, no danger path: asked; the person's yes to the edit adds it to the plan
  const outside = hookDecisionOf(said('s2', 'PreToolUse', editOf(OTHER)));
  assert.deepEqual([outside.permissionDecision, /plan-outside: [^\n]*open a new plan for this file/.test(outside.permissionDecisionReason)], ['ask', true]);
  assert.equal(said('s2', 'PostToolUse', editOf(OTHER)).code, 0, 'the person said yes');
  assert.deepEqual(decided('s2', editOf(OTHER)), {}, 'inside the plan from then on: silence');
  assert.match(ab('decisionbook', 'show', `file:${OTHER}`).out, new RegExp(`^- file:${OTHER} planned-in plan:${id}$`, 'm'));
  // a resume record is still taken and kept as history; nothing reads it
  assert.equal(ab('decisionbook', 'add', id, JSON.stringify({ t: 'resume', why: 'The same task after /clear: the limit step is still open.' })).code, 0);
  assert.deepEqual([decided('s2', edit), decided('s3', edit)], [{}, {}], 'with it or without it (a third session), allowed');
  assert.match(ab('decisionbook', 'show', id, 'resumes').out,
    /^resumed 20\d\d-[^:]+:\d\d:\d\d\.\d{3}Z: The same task after \/clear: the limit step is still open\.$/m);
});

test('each message while READY work is in the tree, or its close is not committed yet, is told the close through the real hook', () => {
  const world = makeWorld();
  const { repo } = setupRepo(world, { [FILE]: 'class X\nend\n' });
  protect(repo, ['app/**']);
  const env = { HOME: knownIn(repo, tmp('earlier-home-')) };
  const ab = (...args) => run(world.bin, [...args, '--target', repo], { env: typedYes(env).env });
  const said = (event, payload = {}) => fire(repo, portRow(repo, event, payload.tool_name || ''), { session_id: 's1', cwd: repo,
    hook_event_name: event, ...payload }, env);
  const told = (prompt) => hookContextOf(said('UserPromptSubmit', { prompt })); // fire() fails on a hook that formed no verdict
  assert.equal(said('SessionStart', { source: 'startup' }).code, 0);
  const id = ab('decisionbook', 'new', JSON.stringify({ title: 'Poll option limit', why: 'the limit is fixed', success: 'the env sets it', kind: 'feature',
    level: 'micro' })).out.split(' ')[0];
  assert.equal(ab('decisionbook', 'add', id, JSON.stringify(PLAN)).code, 0);
  assert.match(ab('decisionbook', 'ready', id).out, / READY as small fix\. /);
  const edit = { tool_name: 'Edit', tool_input: { file_path: path.join(repo, FILE), old_string: 'X', new_string: 'Y' } };
  assert.deepEqual(hookDecisionOf(said('PreToolUse', edit)), {}, 'the session works under the plan');
  fs.writeFileSync(path.join(repo, FILE), 'class Y\nend\n');
  const due = new RegExp(`DecisionBook: the work of plan ${id} is in the work tree and no close records it[^\\n]+run atlasbound decisionbook close ${id} first`);
  for (const prompt of ['Looks good to me. Wrap it up and tell me what to commit.', 'Thanks, and how long did the tests take?', 'ok']) {
    assert.match(told(prompt), due, `work in the tree, no close: "${prompt}" is told to close first, each time`);
  }
  assert.match(ab('decisionbook', 'close', id).out, / closed: /);
  const waits = new RegExp(`DecisionBook: plan ${id} is closed and no commit holds its record yet[^\\n]+git add [^\\n]*${FILE}[^\\n]*git commit -m `);
  for (const prompt of ['wrap it up, what do I commit?', 'One more thing before I commit: is the README fine?', 'ok']) {
    assert.match(told(prompt), waits, `closed, not committed: "${prompt}" is told the one commit, each time`);
  }
});
