// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the shell table's world of the truth suites (truth-shell*.test.cjs): a git repository that protects the table's paths under a READY
// plan this machine said yes to. The table's paths are the person's danger zones: READY is the freeze, so any other protected file
// written outside the plan would join it and be silent from then on, and no later row could show that the reader placed its write. A
// danger path outside the plan asks every time, naming the file, and the gate adds nothing to the plan. The answers stay in the test
// files, written by hand; this module only builds the world and sends the host's events.
const assert = require('node:assert/strict');
const path = require('node:path');
const { makeWorld, tmp, git, setupRepo, fire, portRow, hookDecisionOf, protect, writeFiles, runAll } = require('./support.cjs');

/** The installed product the shell suites run (built once per process, on first use). */
const shellWorld = () => makeWorld();
const WORLD_DIR = '/work/world';
const ID = 'PLAN-20261106-the-plan';

/** A READY plan of `branch` whose plan is `scope`, as a team commits it: critical work, the level that may plan a danger path. */
const plannedPlan = (branch, scope) => [{ schema: 'decisionbook-record/1', t: 'plan', id: ID, title: 'The plan', why: 'the table', branch },
  ...scope.map((file) => ({ t: 'link', rel: 'plans', to: `file:${file}`, why: 'the table' })), { t: 'ready', scope, level: 'critical' }]
  .map((row) => `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`).join('');

/** The shell table's world under `policy` ({ protect, plan }): the plan's files and a few others committed, the policy protected and named as the
 * danger zones, a session started, the READY plan written and the person's one yes to it given (an Edit of a planned file asks once; its
 * PostToolUse keeps the yes). -> { repo, env, said(event, payload) }. */
function tableWorld(policy) {
  const files = Object.fromEntries([...policy.plan, 'config/locales/en.yml', 'spec/models/user_spec.rb', 'lib/web/version.rb'].map((file) => [file,
    'one\n']));
  const { repo } = setupRepo(shellWorld(), files);
  protect(repo, policy.protect, policy.protect);
  const env = { HOME: tmp('truth-shell-home-'), CLAUDE_PROJECT_DIR: repo };
  const said = (event, payload) => fire(repo, portRow(repo, event, payload.tool_name || ''), { session_id: 's1', cwd: repo, hook_event_name: event,
    ...payload }, env);
  assert.equal(said('SessionStart', { source: 'startup' }).code, 0);
  writeFiles(repo, { [`.decisionbook/${ID}.jsonl`]: plannedPlan(git(repo, 'symbolic-ref', '--short', 'HEAD').trim(), policy.plan) });
  const target = path.join(repo, policy.plan[0]);
  const editEvent = { tool_name: 'Edit', tool_use_id: 'tu1', tool_input: { file_path: target, old_string: 'one', new_string: 'two' } };
  assert.equal(hookDecisionOf(said('PreToolUse', editEvent)).permissionDecision, 'ask', 'the one ask about a plan that came with the repository');
  assert.equal(said('PostToolUse', { ...editEvent, tool_response: { filePath: target } }).code, 0);
  return { repo, env, said };
}

/** One row as the host sends it: the command with the world's folder this repository, the shell's folder its cwd. */
const shellEvent = (repo, row) => ({ session_id: 's1', cwd: path.join(repo, row.cwd), hook_event_name: 'PreToolUse', tool_name: 'Bash',
  tool_input: { command: row.command.replaceAll(WORLD_DIR, repo) } });

// The words a person reads, copied by hand from the product's texts: no suite asks the product how it would say them.
const SCOPE = 'a danger path (a danger zone, a database schema or migration) outside the READY plan is the person\'s, once: they approve this ' +
  'write, or you add it to the plan ({"t":"link","rel":"plans","to":"file:<this path>","why":""} in an add) and ask them for their yes';
const askReason = (file) => `DecisionBook gate: plan-out-of-scope: ${file}: ${SCOPE}\nthis shell command writes ${file}; once the branch's READY ` +
  `plan covers the file, the same command passes`;
const UNPLACED = 'DecisionBook gate: shell-unplaced: a write this build cannot place; use Edit for it';
const UNREAD = 'DecisionBook gate: shell-unplaced: too long to read: a write this build cannot place; use Edit for it';
const folderReason = (folder) => `DecisionBook gate: shell-unplaced: ${folder}: a write this build cannot place; use Edit for it\nthis shell command writes ` +
  `${folder}; once the branch's READY plan covers the file, the same command passes`;
const lostReply = (note) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask',
  permissionDecisionReason: `atlasbound: hook-lost: ${note}: a gate formed no verdict on this write, so it asks: allow it only if you meant it` },
    systemMessage: `atlasbound: no verdict formed by ${note}` });
// a write whose target is the product's own store is refused STORE_SEALED by the shell gate, as a write tool is (`human.sealed`: the file named)
const sealedReply = (file) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'STORE_SEALED: only '
  + `AtlasBound itself writes here: its state and what a person said — ${file}. Leave it as it is; if something in it looks wrong, `
  + 'say so to the person.' } });
const unplacedReason = (human) => (human.unread ? UNREAD : human.file ? folderReason(human.file) : UNPLACED);
const ruled = (human) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask',
  permissionDecisionReason: human.unplaced ? unplacedReason(human) : askReason(human.file) } });

/** What the host should receive for a row, by its human verdict: nothing at all, the ask naming the file, or (human.unplaced) the ask that says it cannot
 * place one, naming the folder where the write is a whole folder, or (human.unread) that the command was too long to read in time, or
 * (human.failed, the handler's note) the port's ask for a gate that failed with no verdict. */
const expectedReply = (row) => (row.human.verdict === 'allow' ? {} : row.human.failed ? lostReply(row.human.failed)
  : row.human.sealed ? sealedReply(row.human.sealed) : ruled(row.human));

/** Every row through `atlasbound hook PreToolUse`, four processes at a time; a row whose reply is not its human verdict fails the caller's test by
 * name. -> the replies. */
async function againstHuman(repo, env, rows) {
  const answers = await runAll(shellWorld().bin, rows.map((row) => ({ args: ['hook', 'PreToolUse'], cwd: repo, env, input: JSON.stringify(shellEvent(repo,
    row)) })));
  const replies = rows.map((row, i) => ({ row, code: answers[i].code, got: answers[i].out.trim() ? JSON.parse(answers[i].out) : {} }));
  const wrong = replies.filter(({ row, code, got }) => code !== 0 || JSON.stringify(got) !== JSON.stringify(expectedReply(row)));
  assert.deepEqual(wrong.map((w) => w.row.from), [], `rows whose reply is not the human verdict:\n${wrong.map(({ row,
    got }) => `${row.from}: want ${row.human.verdict} ${row.human.file || ''} (${row.human.why || ''}); got ${JSON.stringify(got)}`).join('\n')}`);
  return replies;
}

module.exports = { shellWorld, tableWorld, shellEvent, expectedReply, againstHuman };
