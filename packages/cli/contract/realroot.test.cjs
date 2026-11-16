// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The home stores are keyed by the repository's REAL path, resolved once in the composition root. Through the real bin: a
// repository reached through a symbolic link by the hooks and by its real path by the verbs (and the other way round) has one home folder, the AI's confirm
// before the person spoke is refused on both spellings, and a READY plan made through one spelling lets the gate allow its edit through the other, in a later session too.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hash: { sha256 } } = require('@atlasbound/kit');
const { makeWorld, tmp, setupRepo, fire, portRow, hookDecisionOf, protect, run } = require('./support.cjs');

const FILE = 'app/x.rb';
const PLAN = [{ t: 'research', tool: 'grep', asked: 'MAX_OPTIONS', answer: 'one constant', source: `${FILE}:1` }, { t: 'item', kind: 'feature', text: 'poll options' },
  { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the limit' }, { t: 'check', id: 'AC-1', text: 'the limit is read', command: 'rake test' },
  { t: 'item', kind: 'task', text: 'read the limit', covers: ['AC-1'] }, { t: 'confirm', by: 'developer', said: 'yes' }];

function spelled(hookVia) {
  const world = makeWorld();
  const { repo } = setupRepo(world, { [FILE]: 'class X\nend\n' });
  protect(repo, ['app/**']);
  const link = path.join(tmp('realroot-link-'), 'repo');
  fs.symlinkSync(repo, link);
  const [hookRoot, verbRoot] = hookVia === 'link' ? [link, repo] : [repo, link];
  const home = tmp('realroot-home-');
  const ab = (session, ...args) => run(world.bin, [...args, '--target', verbRoot], { env: { HOME: home, ...(session ? { CLAUDE_CODE_SESSION_ID: session } : {}) } });
  const said = (session, event, payload = {}) => fire(repo, portRow(repo, event, payload.tool_name || ''), { session_id: session, cwd: hookRoot,
    hook_event_name: event, ...payload }, { HOME: home, CLAUDE_PROJECT_DIR: hookRoot });
  const edit = { tool_name: 'Edit', tool_input: { file_path: path.join(repo, FILE), old_string: 'X', new_string: 'Y' } };
  return { repo, home, ab, said, edit };
}

for (const hookVia of ['link', 'real']) {
  test(`hooks through the ${hookVia} spelling, verbs through the other: one home folder, no yes before the person's, the yes is found`,
    () => {
    const { repo, home, ab, said, edit } = spelled(hookVia);
    assert.equal(said('s1', 'SessionStart', { source: 'startup' }).code, 0);
    // the plan the person says yes to holds its file; a file added after the yes to a plan of none would more than double it
    const id = ab('s1', 'decisionbook', 'new', JSON.stringify({ title: 'Poll option limit', why: 'the limit is fixed', success: 'the env sets it', kind: 'feature',
      level: 'micro', records: PLAN.slice(0, -1) })).out.split(' ')[0];
    const yes = () => ab('s1', 'decisionbook', 'add', id, JSON.stringify(PLAN.slice(-1))); // the yes needs the person's prompt row
    assert.deepEqual([yes().code, (yes().err.match(/atlasbound: ([a-z-]+):/) || [])[1]], [1, 'confirm-not-asked'], 'no prompt row of s1 yet: refused');
    assert.deepEqual([said('s1', 'UserPromptSubmit', { prompt: 'yes, go ahead' }).code, yes().code], [0, 0], 'their prompt row is found through the other spelling');
    assert.match(ab('s1', 'decisionbook', 'ready', id).out, new RegExp(`^${id} READY as small fix\\. Frozen: `, 'm'));
    assert.deepEqual(hookDecisionOf(said('s1', 'PreToolUse', edit)), {}, 'the READY plan made through the other spelling: the gate allows (silence)');
    // READY is the freeze: a later session writes under the plan with no resume record, and the yes kept in the one home folder is found
    assert.equal(said('s2', 'SessionStart', { source: 'clear' }).code, 0);
    assert.deepEqual(hookDecisionOf(said('s2', 'PreToolUse', edit)), {}, 'a later session, no resume, no prompt of its own: allowed (silence)');
    assert.equal(ab('s2', 'decisionbook', 'add', id, JSON.stringify({ t: 'resume', why: 'the same task' })).code, 0, 'a resume record is history: taken, asked of no one');
    const folders = fs.readdirSync(path.join(home, '.atlasbound', 'decisionbook-here'));
    assert.deepEqual(folders, [sha256(fs.realpathSync(repo)).slice(0, 16)], 'one home folder, keyed by the real path');
  });
}
