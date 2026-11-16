// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// `proc.stopAll` on real processes. It sets a state nothing resets, because the process is about to leave, so every case runs in its own process.
// Every [I-n] names one invariant of this package.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { testing: { trash } } = require('@atlasbound/kit');

const entry = require.resolve('@atlasbound/kit');
const LIMIT = { timeout: 30000 };

const alive = (pid) => spawnSync('kill', ['-0', String(pid)], { stdio: 'ignore' }).status === 0;
const stale = (pid) => alive(pid) && spawnSync('kill', ['-9', String(pid)], { stdio: 'ignore' }).status === 0;

/** A real driver process runs `body` with `proc` and `dir`; its last stdout line is its JSON answer. */
function driven(body) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kit-stop-')));
  const script = `
    const fs = require('node:fs');
    const { proc } = require(${JSON.stringify(entry)}).io;
    const dir = ${JSON.stringify(dir)};
    const env = { PATH: process.env.PATH };
    const seen = (name) => { for (let i = 0; i < 2000 && !fs.existsSync(dir + '/' + name); i += 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); };
    (async () => { ${body} })().then((answer) => process.stdout.write(JSON.stringify(answer)));
  `;
  const res = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 25000, killSignal: 'SIGKILL' });
  return { dir, status: res.status, stderr: res.stderr, answer: res.stdout ? JSON.parse(res.stdout) : null };
}

const started = (dir) => ['child', 'grandchild'].map((name) => Number(fs.readFileSync(path.join(dir, name), 'utf8').trim()));
/** A provider-shaped child: one grandchild in the background, its pids on disk, then it works on. `first` is shell run at its start. */
const provider = (first = '') => `proc.run({ cmd: 'sh', args: ['-c', ${JSON.stringify(`${first}\nsleep 30 &\necho $! > "$D/grandchild"\necho $$ > "$D/child"\nsleep 30\nwait`)}], env: { ...env, D: dir }, timeoutMs: 20000 })`;

const cases = [
  ['stops at SIGTERM', ''],
  ['that ignores SIGTERM gets SIGKILL', "trap '' TERM"],
];
for (const [name, first] of cases) {
  test(`[I-56] stopAll: a child ${name}; its grandchild dies too; the run says stop and stopAll answers how many it stopped`, LIMIT, () => {
    const { dir, status, stderr, answer } = driven(`
      const run = ${provider(first)};
      seen('child');
      const stopped = await proc.stopAll();
      const res = await run;
      return { stopped, killedBy: res.killedBy };
    `);
    const pids = started(dir);
    const left = pids.filter(alive);
    pids.forEach(stale);
    trash(dir);
    assert.equal(status, 0, stderr);
    assert.deepEqual(answer, { stopped: 1, killedBy: 'stop' });
    assert.deepEqual(left, []);
  });
}

test('[I-56] after a stop no child starts: a later run answers stop and spawns nothing', LIMIT, () => {
  const { dir, status, stderr, answer } = driven(`
    const stopped = await proc.stopAll();
    const res = await proc.run({ cmd: 'sh', args: ['-c', 'touch "$D/ran"'], env: { ...env, D: dir } });
    return { stopped, res, ran: fs.existsSync(dir + '/ran') };
  `);
  trash(dir);
  assert.equal(status, 0, stderr);
  assert.deepEqual(answer, { stopped: 0, ran: false, res: { code: null, signal: null, stdout: '', stderr: '', killedBy: 'stop', error: null, stdinError: null } });
});

test('[I-56] a run that ended is not stopped again, and an earlier cause stays', LIMIT, () => {
  const { dir, status, stderr, answer } = driven(`
    const done = await proc.run({ cmd: 'true', env });
    const late = proc.run({ cmd: 'sleep', args: ['30'], env, timeoutMs: 50 });
    await new Promise((resolve) => { setTimeout(resolve, 150); });
    const stopped = await proc.stopAll();
    return { first: done.killedBy, late: (await late).killedBy, stopped };
  `);
  trash(dir);
  assert.equal(status, 0, stderr);
  assert.equal(answer.first, null);
  assert.equal(answer.late, 'timeout');
  assert.ok(answer.stopped <= 1, `${answer.stopped}`);
});
