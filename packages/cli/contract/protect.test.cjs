// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// setup asks once whether to protect the source files, in a terminal or as a block the person's AI puts to them.
// the answer is the new plan's, in `.decisionbook/config.json`; the candidates are tracked files by kit's file roles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, makeRepo, git, run, runAll, cleanEnv, portRow: portOf, fire, editOf } = require('./support.cjs');

const TTY = { NODE_OPTIONS: `${cleanEnv().NODE_OPTIONS} --require ${path.join(__dirname, 'tty-preload.cjs')}` };
const CONFIG = path.join('.decisionbook', 'config.json');
const configOf = (repo) => JSON.parse(fs.readFileSync(path.join(repo, CONFIG), 'utf8'));
const hasConfig = (repo) => fs.existsSync(path.join(repo, CONFIG));
const ASKED = /protect your source files\?/;
const setupIn = (world, repo, input, env = TTY) => run(world.bin, ['setup', '--target', repo], { input, env });

test('a person in a terminal answers automatic: the tracked source folders are protected and an Edit with no plan is denied', () => {
  const world = makeWorld();
  const repo = makeRepo({ 'src/a.js': 'x\n', 'test/a.test.js': 'y\n', 'server/logger.ts': 'export {}\n' });
  const res = setupIn(world, repo, '1\n');
  assert.equal(res.code, 0, res.err);
  assert.match(res.err, ASKED, 'the question goes to the terminal on stderr, so --json stays one document');
  assert.match(res.err, /before an AI edits a protected file, it first writes a short plan with DecisionBook/);
  assert.match(res.err, /1 {2}automatic: lib\/\*\* \(1 file\), server\/\*\* \(1 file\), src\/\*\* \(1 file\), test\/\*\* \(1 file\)/);
  assert.match(res.err, /you can change this any time with atlasbound protect/);
  const config = configOf(repo);
  assert.deepEqual(config.protect.slice().sort(), ['lib/**', 'server/**', 'src/**', 'test/**']);
  assert.deepEqual([config.answer.answer, config.answer.door], ['source', 'setup-terminal']);
  assert.equal(config.answer.at, undefined, 'no time in the committed answer: two teammates write the same bytes');
  assert.match(res.out, /^protected paths: .*src\/\*\*/m, 'the summary after the answer says what is protected now');
  // the walk on this same setup: an Edit of a protected file with no plan is denied by the new plan's gate through the port
  const denied = JSON.parse(fire(repo, portOf(repo, 'PreToolUse', 'Edit'), editOf(repo, 'server/logger.ts')).out).hookSpecificOutput;
  assert.equal(denied.permissionDecision, 'deny');
  assert.match(denied.permissionDecisionReason, /^DecisionBook gate: plan-none: server\/logger\.ts: .*one `atlasbound decisionbook new`/); // the command the AI then fills in
  for (const verb of ['setup', 'update']) {
    const again = run(world.bin, [verb, '--target', repo], { input: '3\n', env: TTY });
    assert.equal(again.code, 0, again.err);
    assert.doesNotMatch(again.out + again.err, ASKED, `${verb} asks nothing once answered`);
  }
  assert.equal(configOf(repo).answer.answer, 'source', 'the stray input changed nothing');
});

test('choose: the person picks from the numbered candidates; not now protects nothing and is recorded', () => {
  const world = makeWorld();
  const chosen = makeRepo({ 'src/a.js': 'x\n', 'test/a.test.js': 'y\n' });
  const picked = setupIn(world, chosen, '2\nsrc/**\n');
  assert.equal(picked.code, 0, picked.err);
  assert.match(picked.err, /^ {2}src\/\*\* +1 file$/m, 'choose lists the candidates with their counts');
  assert.match(picked.err, /^ {2}test\/\*\* +1 file, 1 test file$/m);
  assert.deepEqual([configOf(chosen).protect, configOf(chosen).answer.answer], [['src/**'], 'chosen']);
  const later = makeRepo();
  const no = setupIn(world, later, '3\n');
  assert.equal(no.code, 0, no.err);
  assert.deepEqual([configOf(later).protect, configOf(later).answer.answer], [[], 'none']);
  const third = setupIn(world, later, '1\n');
  assert.doesNotMatch(third.out + third.err, ASKED, 'not now is an answer: it is not asked again');
});

test('automatic counts a folder of HTML pages and a single entry file at the root, and --source protects them', () => {
  const world = makeWorld();
  const site = makeRepo({ 'lessons/01.html': 'a\n', 'lessons/02.html': 'b\n', 'index.html': 'c\n', 'shared/a.js': 'd\n', 'README.md': 'e\n',
    'notes.html': 'f\n' });
  const asked = run(world.bin, ['setup', '--target', site]);
  assert.match(asked.out, /automatic: index\.html \(1 file\), lessons\/\*\* \(2 files\), lib\/\*\* \(1 file\), shared\/\*\* \(1 file\) +->/, asked.out);
  const chosen = run(world.bin, ['protect', '--source', '--target', site]);
  assert.equal(chosen.code, 0, chosen.err);
  assert.deepEqual(configOf(site).protect, ['index.html', 'lessons/**', 'lib/**', 'shared/**'], 'a root page that is no entry file is not guessed');
});

test('without a terminal setup prints the question for the AI to put to the person, and writes nothing', () => {
  const world = makeWorld();
  const repo = makeRepo({ 'src/a.js': 'x\n' });
  const res = run(world.bin, ['setup', '--target', repo]);
  assert.equal(res.code, 0, res.err);
  assert.match(res.out, ASKED);
  assert.match(res.out, /ask the person; do not answer this yourself/i);
  assert.match(res.out, /^ {2}automatic: lib\/\*\* \(1 file\), src\/\*\* \(1 file\) {2}-> {2}atlasbound protect --source$/m);
  for (const command of ['atlasbound protect "<path or glob>[,...]"', 'atlasbound protect --none']) assert.ok(res.out.includes(command), command);
  assert.equal(hasConfig(repo), false, 'nothing is recorded before a person answers');
  const none = run(world.bin, ['protect', '--none', '--target', repo], { ai: true });
  const refusal = /^atlasbound: person-only: protect \(found: the AI, no-terminal\); the person types: atlasbound protect --none /;
  assert.deepEqual([none.code, refusal.test(none.err)], [1, true], 'not now is the person\'s answer too: an AI cannot close the question for them');
  assert.equal(hasConfig(repo), false, 'refused: no answer is recorded');
  const source = run(world.bin, ['protect', '--source', '--target', repo]);
  assert.equal(source.code, 0, source.err);
  assert.deepEqual(configOf(repo).protect, ['lib/**', 'src/**']);
  assert.match(source.out, /^protected paths: lib\/\*\*, src\/\*\*$/m);
  const asked = run(world.bin, ['protect', '--none', '--target', repo], { ai: true });
  assert.deepEqual([asked.code, /person-only: protect \(found: the AI, no-terminal\)/.test(asked.err)], [1, true],
    'an AI\'s shell has no terminal');
  assert.deepEqual(configOf(repo).protect, ['lib/**', 'src/**'], 'refused: nothing written');
  const plainYes = run(world.bin, ['protect', '--none', '--target', repo], { input: 'y\n', env: TTY });
  assert.match(plainYes.err, /atlasbound: protect-person: lib\/\*\*, src\/\*\*: the phrase was not typed as shown, so nothing changed/);
  assert.deepEqual(configOf(repo).protect, ['lib/**', 'src/**'], 'a yes is not the phrase: nothing written');
  const typed = run(world.bin, ['protect', '--none', '--target', repo], { input: 'protect none\n', env: TTY });
  assert.equal(typed.code, 0, typed.err);
  assert.equal(typed.err, 'this takes protection away from lib/**, src/**: an AI session may then edit them with no plan\ntype: protect none\n> ');
  assert.deepEqual([configOf(repo).protect, configOf(repo).answer.door], [[], 'protect-terminal'],
    'not now, later, takes the protection off when the person types the phrase that names it');
  assert.doesNotMatch(run(world.bin, ['setup', '--target', repo]).out, ASKED);
});

test('doctor and the session start say the DecisionBook gate protects nothing and name the protect verb', () => {
  const world = makeWorld();
  const repo = makeRepo();
  assert.equal(setupIn(world, repo, '3\n').code, 0);
  const line = run(world.bin, ['doctor', '--target', repo]).out.split('\n').find((l) => l.startsWith('protected paths:')) || '';
  assert.match(line, /^protected paths: none, as a person answered, so the DecisionBook gate protects nothing here; atlasbound protect changes it$/);
  const said = JSON.parse(fire(repo, portOf(repo, 'SessionStart', 'startup'), { session_id: 's1', cwd: repo, hook_event_name: 'SessionStart',
    source: 'startup' }).out);
  assert.match(said.hookSpecificOutput.additionalContext,
    /^protected paths: none, as a person answered, so the DecisionBook gate protects nothing here; atlasbound protect changes it$/m);
});

const LANGUAGES = [
  ['Rails', { 'app/models/user.rb': 'class User; end\n', 'config/routes.rb': 'x\n', 'spec/user_spec.rb': 'y\n', Gemfile: 'z\n' }, ['app/**', 'config/**',
    'spec/**']],
  ['TypeScript', { 'src/index.ts': 'export {}\n', 'tests/a.test.ts': 'x\n', 'package.json': '{}\n' }, ['src/**', 'tests/**']],
  ['Clojure', { 'src/app/core.clj': '(ns app.core)\n', 'test/app/core_test.clj': '(ns app.core-test)\n', 'deps.edn': '{}\n' }, ['src/**', 'test/**']],
];
/** the three setups start once, side by side, each its own process; each row's test reads its own answer. */
let languageRuns = null;
function languageSetups() {
  languageRuns ||= (() => {
    const repos = LANGUAGES.map(([, files]) => {
      const repo = makeRepo(files);
      git(repo, 'rm', '-rq', 'lib');
      git(repo, 'commit', '-qm', 'no lib');
      return repo;
    });
    return runAll(makeWorld().bin, repos.map((repo) => ({ args: ['setup', '--target', repo], input: '1\n', env: TTY }))).then((answers) => answers.map((res,
      at) => ({ res, repo: repos[at] })));
  })();
  return languageRuns;
}

LANGUAGES.forEach(([name, , folders], at) => {
  test(`automatic on a ${name} repository protects its own source folders (kit's file roles: no language is named in the product code)`, async () => {
    const { res, repo } = (await languageSetups())[at];
    assert.equal(res.code, 0, res.err);
    assert.deepEqual(configOf(repo).protect, folders);
  });
});
