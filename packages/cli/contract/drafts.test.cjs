// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// through the real bin: an AI session hands `decisionbook new`, `decisionbook add <id>` and `handoff keep` their JSON as a draft file it
// wrote with its Write tool into the repository's git-ignored drafts folder, and runs the verb with `--file`: no brace and no quote on the
// command line, so the host's allow rule for the verb matches and the person sees no prompt. Only that folder is read; the draft goes once
// its verb wrote it. Setup allows the write and the commands, the gates stay silent on both, and every fill-in prints this one form.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, makeRepo, setupRepo, run, tmp, git, writeFiles, protect, fire, portRow, hookDecisionOf, readSettings } = require('./support.cjs');

const DRAFTS = '.atlasbound/drafts';
const TEXT = 'the run\'s "done" event isn\'t logged {"x": 1}';
const PLAN = { title: 'Done events', why: TEXT, success: 'the event is logged', kind: 'bug', level: 'micro' };

/** One wired repository for the file: the real handoff beside DecisionBook. */
const wired = (() => {
  let once = null;
  return () => {
    if (once) return once;
    const world = makeWorld({ real: ['handoff'] });
    const home = tmp('drafts-home-');
    const { repo } = setupRepo(world, { 'app/x.rb': 'class X\nend\n' });
    once = { world, repo, env: { PATH: '/usr/bin:/bin', HOME: home } };
    return once;
  };
})();
const draft = (repo, name, value) => writeFiles(repo, { [`${DRAFTS}/${name}`]: typeof value === 'string' ? value : JSON.stringify(value) });
const exists = (repo, key) => fs.existsSync(path.join(repo, key));
const planLines = (repo, id) => fs.readFileSync(path.join(repo, '.decisionbook', `${id}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('new and add read their JSON from a draft under .atlasbound/drafts/ by --file, and the draft goes once it is written', () => {
  const { world, repo, env } = wired();
  const db = (...args) => run(world.bin, ['decisionbook', ...args], { cwd: repo, env });
  draft(repo, 'new.json', PLAN);
  const made = db('new', '--file', `${DRAFTS}/new.json`);
  assert.equal(made.code, 0, made.err);
  const id = made.out.split(' ')[0];
  assert.equal(planLines(repo, id)[0].why, TEXT, 'the text as written: an apostrophe, quotes and braces are characters');
  assert.equal(exists(repo, `${DRAFTS}/new.json`), false, 'the draft went once the plan was written');
  draft(repo, `${id}.json`, [{ t: 'note', text: TEXT }]);
  const added = db('add', id, '--file', path.join(repo, DRAFTS, `${id}.json`));
  assert.deepEqual([added.code, planLines(repo, id).at(-1).text, exists(repo, `${DRAFTS}/${id}.json`)], [0, TEXT, false], added.err);
  draft(repo, `${id}.json`, { t: 'nope' });
  const bad = db('add', id, '--file', `${DRAFTS}/${id}.json`);
  assert.deepEqual([bad.code, exists(repo, `${DRAFTS}/${id}.json`)], [1, true], 'a refused write keeps the draft, to fix and send again');
  assert.ok(bad.err.includes(`  the draft stays at ${DRAFTS}/${id}.json: fix it with your Edit tool (never sed or a script: the host asks the person for those), then run the same call again\n`), bad.err);
  const inSub = run(world.bin, ['decisionbook', 'add', id, '--file', `../${DRAFTS}/${id}.json`], { cwd: path.join(repo, 'app'), env });
  assert.match(inSub.err, /^atlasbound: record-invalid/m, 'a relative path is read from the folder the command runs in');
  assert.equal(git(repo, 'status', '--porcelain', '--', DRAFTS), '', 'git ignores the drafts');
});

test('--file reads only a file of the drafts folder: elsewhere, a link, no file or a JSON word beside it is refused', () => {
  const { world, repo, env } = wired();
  const db = (...args) => run(world.bin, ['decisionbook', ...args], { cwd: repo, env });
  const before = fs.readdirSync(path.join(repo, '.decisionbook')).length;
  writeFiles(repo, { 'app/plan.json': JSON.stringify(PLAN), [`${DRAFTS}/../cli-plan.json`]: JSON.stringify(PLAN) });
  const outside = tmp('drafts-outside-');
  writeFiles(outside, { 'plan.json': JSON.stringify(PLAN) });
  fs.mkdirSync(path.join(repo, DRAFTS), { recursive: true });
  fs.symlinkSync(path.join(repo, 'app/plan.json'), path.join(repo, DRAFTS, 'linked.json'));
  for (const [given, why] of [['app/plan.json', 'a repository file'], [`${DRAFTS}/../cli-plan.json`, 'the store beside the folder'],
    [path.join(outside, 'plan.json'), 'outside the repository'], [`${DRAFTS}/linked.json`, 'a link out of the folder'], [`${DRAFTS}/none.json`, 'no file'],
    [DRAFTS, 'the folder itself']]) {
    const res = db('new', '--file', given);
    assert.deepEqual([res.code, /^atlasbound: (draft-refused|path-link): /m.test(res.err)], [1, true], `${why}: ${res.err}`);
    if (given === 'app/plan.json') assert.match(res.err, /only from \.atlasbound\/drafts\/ /, 'the refusal names the one folder');
  }
  draft(repo, 'new.json', PLAN);
  const both = db('new', JSON.stringify(PLAN), '--file', `${DRAFTS}/new.json`);
  assert.deepEqual([both.code, /^atlasbound: draft-refused: /m.test(both.err)], [1, true], both.err);
  assert.deepEqual([fs.readdirSync(path.join(repo, '.decisionbook')).length, exists(repo, 'app/plan.json'), exists(repo, `${DRAFTS}/new.json`)],
    [before, true, true], 'no plan was made and nothing was removed');
  assert.match(db('show', '--file', 'x').err, /^atlasbound: flag-unknown: --file on decisionbook show/m, 'only the three verbs that take JSON take it');
});

test('each AI session has its own drafts folder: another session\'s draft is never read, two at once make two plans', () => {
  const { world, repo, env } = wired();
  const as = (session) => (...args) => run(world.bin, ['decisionbook', ...args], { cwd: repo, env: { ...env, CLAUDE_CODE_SESSION_ID: session } });
  const [a, b] = [as('s-a'), as('s-b')];
  const folderOf = (res) => /--file (\.atlasbound\/drafts\/[0-9a-f]{12}\/)new\.json$/m.exec(res.err)?.[1];
  const [fa, fb] = [folderOf(a('new')), folderOf(b('new'))]; // the usage names the session's own folder
  assert.ok(fa && fb && fa !== fb, `${fa} ${fb}`);
  writeFiles(repo, { [`${fa}new.json`]: JSON.stringify({ ...PLAN, title: 'A plan' }), [`${fb}new.json`]: JSON.stringify({ ...PLAN, title: 'B plan' }) });
  draft(repo, 'new.json', PLAN);
  const [stolen, shared] = [b('new', '--file', `${fa}new.json`), a('new', '--file', `${DRAFTS}/new.json`)];
  assert.deepEqual([stolen.code, stolen.err.includes(`only from ${fb} `), shared.code, exists(repo, `${fa}new.json`)], [1, true, 1, true], stolen.err);
  const made = [a('new', '--file', `${fa}new.json`), b('new', '--file', `${fb}new.json`)].map((res) => planLines(repo, res.out.split(' ')[0])[0].title);
  assert.deepEqual([made, exists(repo, `${fa}new.json`), exists(repo, `${fb}new.json`)], [['A plan', 'B plan'], false, false]);
});

test('handoff keep reads the reply from its draft and removes it once kept; a refused reply keeps it', () => {
  const { world, repo, env } = wired();
  const fired = (name, more) => fire(repo, portRow(repo, name, ''), { session_id: 's1', hook_event_name: name, ...more }, env);
  assert.equal(fired('UserPromptSubmit', { prompt: 'Money math goes through lib/amount.js, never floats.' }).code, 0);
  const handoff = (...words) => run(world.bin, ['handoff', ...words, '--session', 's1'], { cwd: repo, env });
  const shown = handoff().out;
  assert.match(shown, /^write this JSON with your Write tool to \.atlasbound\/drafts\/handoff\.json:\n\{"now": ""[^\n]*\nthen run: atlasbound handoff keep --session s1 --file \.atlasbound\/drafts\/handoff\.json$/m,
    'the fill-in: the draft to write, then the call that reads it');
  draft(repo, 'handoff.json', { now: 'x', next: [], kept: ['Money math goes through lib/amount.js'] });
  const refused = handoff('keep', '--file', `${DRAFTS}/handoff.json`);
  assert.deepEqual([refused.code, exists(repo, `${DRAFTS}/handoff.json`)], [1, true], refused.out);
  draft(repo, 'handoff.json', { now: 'the export route answers', next: ['wire the button'], kept: ['Money math goes through lib/amount.js, never floats [m1]'] });
  const kept = handoff('keep', '--file', `${DRAFTS}/handoff.json`);
  assert.deepEqual([kept.code, /^Kept\. /.test(kept.out), exists(repo, `${DRAFTS}/handoff.json`)], [0, true, false], kept.err);
});

test('setup allows the draft write and the commands of /handoff, never `handoff drop`; the gates are silent on both steps', () => {
  const { repo, env } = wired();
  protect(repo, ['app/**', '**/*.json']);
  const allow = readSettings(repo).permissions.allow;
  for (const rule of [`Write(/${DRAFTS}/**)`, `Edit(/${DRAFTS}/**)`, 'Bash(atlasbound handoff)', 'Bash(atlasbound handoff keep:*)']) {
    assert.ok(allow.includes(rule), `${rule} in ${allow.join(', ')}`);
  }
  assert.deepEqual(allow.filter((rule) => /^Bash\(atlasbound handoff(?: drop)?:\*\)$/.test(rule)), [], 'no rule that lets `handoff drop` start');
  const decided = (payload) => hookDecisionOf(fire(repo, portRow(repo, 'PreToolUse', payload.tool_name), { session_id: 's1', cwd: repo,
    hook_event_name: 'PreToolUse', ...payload }, env));
  const write = (key) => ({ tool_name: 'Write', tool_input: { file_path: path.join(repo, key), content: JSON.stringify(PLAN) } });
  const shell = (command) => ({ tool_name: 'Bash', tool_input: { command } });
  for (const payload of [write(`${DRAFTS}/new.json`), write(`${DRAFTS}/2026-11-17-done-events.json`),
    shell(`atlasbound decisionbook new --file ${DRAFTS}/new.json`), shell(`atlasbound decisionbook add 2026-11-17-done-events --file ${DRAFTS}/x.json`),
    shell(`atlasbound handoff keep --file ${DRAFTS}/handoff.json`)]) {
    assert.deepEqual(decided(payload), {}, `silent: ${JSON.stringify(payload.tool_input).slice(0, 120)}`);
  }
  assert.match(decided(shell('echo x > .atlasbound/cli/x.json')).permissionDecisionReason || '', /^STORE_SEALED: /, 'the rest of the store stays sealed');
  assert.equal(decided(write('app/x.rb')).permissionDecision, 'deny', 'a protected file still needs its plan');
});

test('each open module set: the draft Write is silent through the hook binary, its --file call passes and the draft goes', () => {
  const world = makeWorld({ real: ['handoff'] });
  for (const only of ['decisionbook', 'handoff', 'handoff,decisionbook']) {
    const repo = makeRepo({ 'app/x.rb': 'class X\nend\n' });
    const env = { PATH: '/usr/bin:/bin', HOME: tmp('drafts-set-home-') };
    assert.equal(run(world.bin, ['setup', '--only', only, '--target', repo]).code, 0, only);
    const key = only === 'handoff' ? `${DRAFTS}/handoff.json` : `${DRAFTS}/new.json`;
    const payload = { session_id: 's1', cwd: repo, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(repo, key),
      content: '{}' } };
    assert.deepEqual(hookDecisionOf(fire(repo, portRow(repo, 'PreToolUse', 'Write'), payload, env)), {}, `${only}: the draft Write is silent`);
    if (only === 'handoff') {
      draft(repo, 'handoff.json', { now: 'the export route answers', next: ['wire the button'], kept: [] });
      const kept = run(world.bin, ['handoff', 'keep', '--session', 's1', '--file', key], { cwd: repo, env });
      assert.deepEqual([kept.code, exists(repo, key)], [0, false], `${only}: ${kept.err}`);
      draft(repo, 'new.json', PLAN);
      const off = run(world.bin, ['decisionbook', 'new', '--file', `${DRAFTS}/new.json`], { cwd: repo, env });
      assert.deepEqual([off.code, /atlasbound modules on decisionbook$/.test(off.out.trim()), exists(repo, `${DRAFTS}/new.json`)], [0, true, true], 'a module that is off read no draft: it stays');
    } else {
      draft(repo, 'new.json', PLAN);
      const made = run(world.bin, ['decisionbook', 'new', '--file', key], { cwd: repo, env });
      assert.deepEqual([made.code, exists(repo, key)], [0, false], `${only}: ${made.err}`);
    }
  }
});
