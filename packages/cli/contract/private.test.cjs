// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the stores the product makes in the person's home (prompt rows, handoff journal and files, plan rows) are the user's alone:
// folders 0700, files 0600, through kit's fs port, the one place that creates them; one made wider before is tightened at the next write.
// Black box through the checkout's real bin on a temp HOME (support's cleanEnv adds the passwd preload).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tmp, makeRepo, protect, run, fire, portRow } = require('./support.cjs');

const BIN = path.join(__dirname, '..', 'bin', 'atlasbound.cjs');
/** Every folder and file under `dir`, with its mode bits (rwx for user, group, other). */
function modesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const at = path.join(dir, entry.name);
    const mode = (fs.lstatSync(at).mode & 0o777).toString(8);
    return entry.isDirectory() ? [[at, 'dir', mode], ...modesUnder(at)] : [[at, 'file', mode]];
  });
}
const PLAN = { title: 'Faster a', why: 'a is slow', success: 'a runs in 1 s', kind: 'chore', level: 'micro', records: [] };

test('[I-53] every folder the product made in the home is private to the user; a wider store is tightened at the next write', () => {
  const home = tmp('private-home-');
  const env = { HOME: home };
  const repo = makeRepo({ 'src/a.js': 'a\n' });
  assert.equal(run(BIN, ['setup', '--target', repo], { env }).code, 0);
  protect(repo, ['src/**']);
  const hook = (event, value, payload) => fire(repo, portRow(repo, event, value), { session_id: 'p1', cwd: repo, hook_event_name: event, ...payload }, env);
  hook('SessionStart', 'startup', { source: 'startup' });
  hook('UserPromptSubmit', '', { prompt: 'Make src/a.js faster' });
  assert.equal(run(BIN, ['handoff', '--session', 'p1'], { cwd: repo, env }).code, 0);
  run(BIN, ['decisionbook', 'new'], { cwd: repo, env: { ...env, CLAUDE_CODE_SESSION_ID: 'p1', CLAUDECODE: '1' }, input: JSON.stringify(PLAN) });
  const store = path.join(home, '.atlasbound');
  const seen = modesUnder(store);
  assert.ok(seen.some(([at]) => at.includes('decisionbook-here')) && seen.some(([at]) => at.includes('handoff-here')), seen.map(([at]) => at).join('\n'));
  assert.deepEqual(seen.filter(([, kind, mode]) => mode !== (kind === 'dir' ? '700' : '600')), [], 'nothing in the home store is open to others');
  assert.equal((fs.statSync(store).mode & 0o777).toString(8), '700');
  const journal = seen.find(([at, kind]) => kind === 'file' && at.includes('decisionbook-here'))[0];
  fs.chmodSync(journal, 0o644);
  fs.chmodSync(path.dirname(journal), 0o755);
  hook('UserPromptSubmit', '', { prompt: 'and keep it small' });
  assert.deepEqual([fs.statSync(path.dirname(journal)).mode & 0o777, fs.statSync(journal).mode & 0o777].map((m) => m.toString(8)), ['700', '600'],
    'tightened at the next write');
});

// doctor says once that a home store is wider than private, names the folder and that the next write tightens it.
test('[I-53] doctor\'s home row names the top-most store folder wider than private and says the next write tightens it',
  () => {
  const home = tmp('private-doctor-');
  const env = { HOME: home };
  const repo = makeRepo({ 'src/a.js': 'a\n' });
  assert.equal(run(BIN, ['setup', '--target', repo], { env }).code, 0);
  const homeRow = () => JSON.parse(run(BIN, ['debug', 'doctor', '--target', repo], { env }).out).probes.find((p) => p.name === 'home');
  fs.mkdirSync(path.join(home, '.atlasbound', 'decisionbook-here', 'abc'), { recursive: true, mode: 0o700 });
  for (const dir of ['.atlasbound', '.atlasbound/decisionbook-here', '.atlasbound/decisionbook-here/abc']) fs.chmodSync(path.join(home, dir), 0o700);
  assert.deepEqual(homeRow(), { name: 'home', state: 'measured', says: `${home} is writable` }, 'private: one line');
  fs.chmodSync(path.join(home, '.atlasbound', 'decisionbook-here'), 0o755);
  assert.deepEqual(homeRow(), { name: 'home', state: 'measured', says: `${home} is writable\n    ~/.atlasbound/decisionbook-here is open to others (755), `
    + 'wider than private (700): the product\'s next write there tightens it' });
});
