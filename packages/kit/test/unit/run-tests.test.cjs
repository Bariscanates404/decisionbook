// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit/tools/run-tests.cjs, the hook's runner: a selection with no test file runs nothing. `node --test` with no file falls back to every test under its cwd,
// so the runner never hands it an empty list.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const { loadPackages } = require('../../tools/packages.cjs');
const { TIME_VAR, timeVerdict } = require('../../tools/test-time.cjs');

const RUN_TESTS = path.join(__dirname, '..', '..', 'tools', 'run-tests.cjs');

test('a package with no unit file runs no test; it never falls back to every test in the tree', () => {
  // a package of this tree
  const { name } = loadPackages().find((pkg) => !fs.existsSync(path.join(pkg.dir, 'test', 'unit')));
  const res = spawnSync(process.execPath, [RUN_TESTS, 'unit', name], { encoding: 'utf8', timeout: 20000 });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, new RegExp(`^tests: no test file in unit ${name}$`, 'm'));
  assert.doesNotMatch(res.stdout, /ℹ tests/);
});

test('a release says an over-budget file and passes; without it the same time is red, and above a normal load it is not judged', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-time-'));
  const file = path.join(dir, 'test', 'unit', 'a.test.cjs');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  const packages = [{ name: 'p', dir, owners: {}, files: [file] }];
  const ms = new Map([[fs.realpathSync(file), 2500]]); // a unit file at 2.5 s, over its 2 s at factor 1 and c10
  const over = 'p/test/unit/a.test.cjs: 2500 ms > 2000 ms (budget 1000 x load 1.00 x 2 for c10): make it faster';
  assert.deepEqual(timeVerdict(packages, ms, 1, true),
    { lines: ['tests: time budget said, not judged: a release is not held by the machine\'s speed', `  ${over}`], errors: [] });
  assert.deepEqual(timeVerdict(packages, ms, 1, false), { lines: [], errors: [over] });
  assert.deepEqual(timeVerdict(packages, ms, 2.5, false).errors, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A copy of kit's runner and what it requires, in a tree of one package `kit` holding `units` (name -> source) as its unit files and
 * `owners` merged into its owners.json -> run(env): the runner's `unit kit` result. The outer runner's context would make the inner one skip. */
function runnerTree(units, owners = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-tree-'));
  const kit = path.join(__dirname, '..', '..');
  // the runner's own files are copied (it finds the tree from where it lies); what they require is linked
  for (const part of ['tools/run-tests.cjs', 'tools/packages.cjs', 'tools/test-time.cjs', 'owners.json', 'package.json']) {
    fs.cpSync(path.join(kit, part), path.join(root, 'kit', part), { recursive: true });
  }
  for (const part of ['testing', 'base']) fs.symlinkSync(path.join(kit, part), path.join(root, 'kit', part));
  const own = path.join(root, 'kit', 'owners.json');
  fs.writeFileSync(own, JSON.stringify({ ...JSON.parse(fs.readFileSync(own, 'utf8')), ...owners }));
  fs.mkdirSync(path.join(root, 'kit', 'test', 'unit'), { recursive: true });
  Object.entries(units).forEach(([name, text]) => fs.writeFileSync(path.join(root, 'kit', 'test', 'unit', name), text));
  const outer = Object.fromEntries(Object.entries(process.env).filter(([key]) => ![TIME_VAR, 'NODE_TEST_CONTEXT'].includes(key)));
  return { root, run: (env = {}) => spawnSync(process.execPath, [path.join(root, 'kit', 'tools', 'run-tests.cjs'), 'unit', 'kit'],
    { encoding: 'utf8', timeout: 60000, env: { ...outer, ...env } }) };
}

test('a test run killed by a signal is red, said with the signal and that no summary was left, with or without the switch', () => {
  // the one unit file kills the test runner that started it
  const { root, run } = runnerTree({ 'killed.test.cjs':
    "require('node:test')('the runner goes', () => { process.kill(process.ppid, 'SIGKILL'); throw new Error('never seen'); });\n" });
  for (const env of [{}, { [TIME_VAR]: 'said' }]) {
    const res = run(env);
    assert.equal(res.status, 1, res.stdout);
    assert.match(res.stderr, /^tests FAILED:\n {2}the test run was ended by SIGKILL before it finished\n {2}the test run left no summary/, JSON.stringify(env));
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test('a file owners.json names alone runs after every other file has ended; the totals count both runs', () => {
  // b holds its file open a moment and then marks it ended; a, listed alone, passes only if that mark is there when it starts
  const mark = path.join(os.tmpdir(), `kit-alone-${process.pid}`);
  const { root, run } = runnerTree({
    'a.test.cjs': `require('node:test')('after b', () => require('node:assert').ok(require('node:fs').existsSync(${JSON.stringify(mark)})));\n`,
    'b.test.cjs': `require('node:test')('b', async () => { await new Promise((r) => setTimeout(r, 300)); require('node:fs').writeFileSync(${
      JSON.stringify(mark)}, ''); });\n` }, { alone: ['test/unit/a.test.cjs'] });
  const res = run();
  fs.rmSync(mark, { force: true });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /^tests: 2 run, 2 passed, 0 failed, 0 skipped; 1 file\(s\) alone after the rest$/m);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a time switch other than said is refused before any test runs', () => {
  const res = spawnSync(process.execPath, [RUN_TESTS, 'unit', 'kit'], { encoding: 'utf8', timeout: 20000, env: { ...process.env, [TIME_VAR]: 'off' } });
  assert.deepEqual([res.status, res.stderr, res.stdout], [2, 'run-tests: KIT_TEST_TIME is said or unset, never "off"\n', '']);
});

test('the runner gives every test process a home of its own and the password-home preload, whatever home it was started from', () => {
  const outer = path.join(os.tmpdir(), 'kit-outer-home'); // whoever runs the tests: never read, never written
  const probe = `const os = require('node:os');
const assert = require('node:assert/strict');
require('node:test')('in a home of its own', () => {
  const { HOME, PASSWD_HOME, NODE_OPTIONS } = process.env;
  assert.ok(HOME && HOME === PASSWD_HOME && HOME !== ${JSON.stringify(outer)}, String(HOME));
  assert.equal(os.userInfo().homedir, HOME);
  assert.ok(NODE_OPTIONS.includes('passwd-preload.cjs'), NODE_OPTIONS);
});\n`;
  const { root, run } = runnerTree({ 'a.test.cjs': probe });
  const res = run({ HOME: outer, PASSWD_HOME: '', NODE_OPTIONS: '' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /^tests: 1 run, 1 passed, 0 failed, 0 skipped/m);
  assert.equal(fs.existsSync(outer), false, 'nothing was made in the home of whoever ran it');
  fs.rmSync(root, { recursive: true, force: true });
});
