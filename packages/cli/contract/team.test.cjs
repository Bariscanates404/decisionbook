// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Two people, two homes, one bare remote, through the real bin: the one who sets up commits a single team row; a teammate whose machine
// is not set up is told once per session to install, never in a headless run; their setup, update and uninstall leave every file git
// brought as it came.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeWorld, makeRepo, protect, git, run, tmp, writeFiles, portRow, editOf, fire, hookDecisionOf } = require('./support.cjs');

const TEAM = '.claude/settings.json';
const as = (home) => ({ env: { HOME: home } });
const status = (repo) => git(repo, 'status', '--porcelain', '-uall').trim();
/** Every file git tracks -> its bytes. */
const trackedBytes = (repo) => Object.fromEntries(git(repo, 'ls-files', '-z').split('\0').filter(Boolean)
  .map((key) => [key, fs.readFileSync(path.join(repo, key), 'utf8')]));
const teamRows = (repo) => (JSON.parse(fs.readFileSync(path.join(repo, TEAM), 'utf8')).hooks?.UserPromptSubmit || [])
  .flatMap((row) => row.hooks.map((h) => h.command));
const noticeOf = (repo) => teamRows(repo).find((command) => command.startsWith('node -e "'));

/** The team row run as the host runs it: a shell string, the project dir, the payload on stdin, a temp folder of the test's own. */
function sendPrompt(repo, session, { env = {}, temp = tmp('team-temp-') } = {}) {
  const res = spawnSync('/bin/sh', ['-c', noticeOf(repo)], { cwd: repo, encoding: 'utf8', input: JSON.stringify({ session_id: session,
    hook_event_name: 'UserPromptSubmit', prompt: 'add a button' }), env: { PATH: process.env.PATH, TMPDIR: temp, CLAUDE_PROJECT_DIR: repo,
    CLAUDE_CODE_ENTRYPOINT: 'cli', ...env } });
  return { code: res.status, said: res.stdout.trim() ? JSON.parse(res.stdout) : null, temp };
}

/** A sets up, protects, commits the team's files and pushes; -> { remote, a, homeA, pushed } */
function teamOfOne() {
  const remote = tmp('team-remote-');
  git(remote, 'init', '-q', '--bare', '--template=');
  const a = makeRepo();
  const homeA = tmp('team-home-a-');
  const setup = run(makeWorld().bin, ['setup', '--target', a], as(homeA));
  assert.equal(setup.code, 0, setup.out);
  assert.match(setup.out, /^ {2}team notice: one hook row in \.claude\/settings\.json tells a teammate/m);
  assert.deepEqual(status(a).split('\n').map((line) => line.slice(3)).sort(), ['.claude/settings.json', '.gitignore'],
    'the team row is the one more file a team commits');
  protect(a);
  git(a, 'add', '.gitignore', TEAM, '.decisionbook');
  git(a, 'commit', '-qm', 'set up DecisionBook');
  git(a, 'push', '-q', remote, 'HEAD:main');
  return { remote, a, homeA, pushed: trackedBytes(a) };
}
const clone = (remote) => {
  const b = path.join(tmp('team-b-'), 'repo');
  git(path.dirname(b), 'clone', '-q', '-b', 'main', remote, b);
  return b;
};

test('a teammate not set up is told once per session, never headless; their setup, update and uninstall keep git\'s files', () => {
  const { remote, pushed } = teamOfOne();
  const b = clone(remote);
  const homeB = tmp('team-home-b-');
  assert.deepEqual(trackedBytes(b), pushed);

  const first = sendPrompt(b, 'session-1');
  assert.equal(first.code, 0);
  assert.equal(first.said.decision, 'block', 'the first message of the session stops');
  assert.match(first.said.reason, /npm install -g atlasbound, then atlasbound setup in this repository/);
  assert.match(first.said.reason, /Send your message again to go on without it/);
  assert.equal(sendPrompt(b, 'session-1', { temp: first.temp }).said, null, 'the second message passes');
  assert.equal(sendPrompt(b, 'session-2', { temp: first.temp }).said.decision, 'block', 'a new session is told again, once');
  for (const env of [{ CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' }, { CLAUDE_CODE_SESSION_ATTENDED: '0' }]) {
    const headless = sendPrompt(b, 'session-3', { env });
    assert.deepEqual([headless.code, headless.said], [0, null], `headless: ${JSON.stringify(env)}`);
  }
  const noNode = sendPrompt(b, 'session-4', { env: { PATH: '/nowhere' } });
  assert.notEqual(noNode.code, 2, 'no node: the row fails, and only exit 2 would hold the message');
  assert.equal(noNode.said, null);

  const setup = run(makeWorld().bin, ['setup', '--target', b], as(homeB));
  assert.equal(setup.code, 0, setup.out);
  assert.match(setup.out, /^ {2}set up by your team already \(its \.gitignore block came with git\): this wires this machine only/m);
  assert.doesNotMatch(setup.out, /team notice:|settings-committed/, 'the team row is ours: no line for it, and no grant');
  assert.equal(status(b), '', 'nothing git brought changed');
  assert.deepEqual(trackedBytes(b), pushed);
  assert.equal(sendPrompt(b, 'session-5').said, null, 'set up here: the row says nothing');
  assert.equal(hookDecisionOf(fire(b, portRow(b, 'PreToolUse', 'Edit'), editOf(b, 'lib/z.cjs'))).permissionDecision, 'deny',
    'and the plan gate is live on this machine');

  const update = run(makeWorld().bin, ['update', '--target', b], as(homeB));
  assert.equal(update.code, 0, update.out);
  assert.equal(status(b), '');
  assert.deepEqual(trackedBytes(b), pushed);
  const doctor = run(makeWorld().bin, ['doctor', '--target', b], as(homeB));
  assert.match(doctor.out, /^ {2}team notice +measured +in \.claude\/settings\.json, committed: a teammate whose machine is not set up/m, doctor.out);

  const gone = run(makeWorld().bin, ['uninstall', '--target', b], as(homeB));
  assert.equal(gone.code, 0, gone.out);
  assert.match(gone.out, /^ {2}kept the team notice in \.claude\/settings\.json: it came with git and is the team's; to switch it off/m);
  assert.match(gone.out, /^ {2}kept our lines in \.gitignore: it came with git as it is/m);
  assert.equal(status(b), '', 'uninstall took this machine\'s wiring only');
  assert.deepEqual(trackedBytes(b), pushed);
  assert.equal(fs.existsSync(path.join(b, '.claude', 'settings.local.json')), false);
  assert.equal(sendPrompt(b, 'session-6').said.decision, 'block', 'not set up here again: told again');
});

test('a team that switched the row off keeps it off: a new teammate\'s setup does not put it back', () => {
  const { remote, a } = teamOfOne();
  writeFiles(a, { [TEAM]: '{}\n' });
  git(a, 'commit', '-qam', 'no team notice');
  git(a, 'push', '-q', remote, 'HEAD:main');
  const c = clone(remote);
  const pushed = trackedBytes(c);
  const homeC = tmp('team-home-c-');
  const setup = run(makeWorld().bin, ['setup', '--target', c], as(homeC));
  assert.equal(setup.code, 0, setup.out);
  assert.equal(status(c), '');
  assert.deepEqual(trackedBytes(c), pushed);
  const doctor = run(makeWorld().bin, ['doctor', '--target', c], as(homeC)).out;
  assert.match(doctor, /^ {2}team notice +measured +off: \.claude\/settings\.json holds none/m);
  for (const said of [setup.out, doctor]) assert.match(said, /atlasbound setup --team-notice[^\n]*then commit \.claude\/settings\.json/, said); // the way back
});

test('another version\'s row stays as committed until a person asks; then only it is rewritten; uninstall of an uncommitted row', () => {
  const { remote } = teamOfOne();
  const b = clone(remote);
  const homeB = tmp('team-home-b-');
  const settings = JSON.parse(fs.readFileSync(path.join(b, TEAM), 'utf8'));
  const own = { hooks: [{ type: 'command', command: 'echo mine' }] };
  settings.hooks.UserPromptSubmit = [own, { hooks: [{ type: 'command', command: "node -e \"process.exit(0)//'atlasbound-notice-'\"" }] }];
  writeFiles(b, { [TEAM]: `${JSON.stringify({ theme: 'dark', ...settings }, null, 2)}\n` });
  git(b, 'commit', '-qam', 'an older row');
  for (const verb of ['setup', 'update']) {
    const res = run(makeWorld().bin, [verb, '--target', b], as(homeB));
    assert.equal(res.code, 0, res.out);
    assert.equal(status(b), '', `${verb} never rewrites a committed row on its own`);
  }
  assert.match(run(makeWorld().bin, ['doctor', '--target', b], as(homeB)).out,
    /^ {2}team notice +measured +in \.claude\/settings\.json, written by another version \(still works\); atlasbound setup --team-notice/m);
  const setup = run(makeWorld().bin, ['setup', '--team-notice', '--target', b], as(homeB));
  assert.match(setup.out, /^ {2}team notice: the row in \.claude\/settings\.json was written by another version; only that row was rewritten/m);
  assert.equal(status(b), 'M .claude/settings.json', 'asked for: only the team file changes, to be committed');
  const after = JSON.parse(fs.readFileSync(path.join(b, TEAM), 'utf8'));
  assert.equal(after.theme, 'dark');
  assert.deepEqual(after.hooks.UserPromptSubmit[0], own);
  assert.equal(teamRows(b).filter((command) => command.includes("'atlasbound-notice-'")).length, 1);
  assert.equal(noticeOf(b), teamRows(b)[1]);

  const mine = makeRepo();
  const theirs = `${JSON.stringify({ hooks: { Stop: [own] } }, null, 2)}\n`;
  writeFiles(mine, { [TEAM]: theirs });
  const homeM = tmp('team-home-m-');
  assert.equal(run(makeWorld().bin, ['setup', '--target', mine], as(homeM)).code, 0);
  assert.ok(noticeOf(mine), 'the first setup adds the row beside the person\'s own');
  assert.equal(run(makeWorld().bin, ['uninstall', '--target', mine], as(homeM)).code, 0);
  assert.equal(fs.readFileSync(path.join(mine, TEAM), 'utf8'), theirs, 'not committed: uninstall takes our row back, theirs stays');
});

test('a teammate whose install places one more command file leaves the committed .gitignore as git brought it', () => {
  const { remote } = teamOfOne();
  const b = path.join(tmp('team-b-'), 'repo');
  git(path.dirname(b), 'clone', '-q', '-b', 'main', remote, b);
  const before = trackedBytes(b);
  const world = makeWorld({ real: ['handoff'] });
  for (const verb of ['setup', 'update']) {
    const res = run(world.bin, [verb, ...(verb === 'setup' ? ['--target', b] : [])], { ...as(tmp('team-home-b-')), cwd: b });
    assert.equal(res.code, 0, res.out + res.err);
    assert.equal(status(b), '', `${verb}: git sees nothing new`);
    assert.deepEqual(trackedBytes(b), before, verb);
  }
  assert.match(fs.readFileSync(path.join(b, '.git', 'info', 'exclude'), 'utf8'), /^\.claude\/commands\/handoff\.md$/m, 'this machine\'s own file');
});
