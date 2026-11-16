// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The reclaim of a dead lock, with real long-lived processes on a real disk: a waiter that judged the dead lock must never touch the lock that replaced it.
// Every [I-n] names one invariant of this package.
const test = require('node:test');
const assert = require('node:assert/strict');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const kit = require('@atlasbound/kit');

const { createFs } = kit.io;
const { withLock } = kit.lock;
const { isFail } = kit.errors;

const ROUNDS = 30;
const WORKERS = 6;
const LIMIT = { timeout: 180000 };
const entry = require.resolve('@atlasbound/kit');
const lockOf = (pid, mark = 'a', at = '2026-11-03T00:00:00.000Z') => `${JSON.stringify({ pid, nonce: mark.repeat(64), at })}\n`;
const inTmp = async (fn) => {
  const dir = nodeFs.realpathSync(nodeFs.mkdtempSync(path.join(os.tmpdir(), 'kit-race-')));
  try {
    return await fn(dir);
  } finally {
    kit.testing.trash(dir);
  }
};

// One long-lived process: at each round's start it takes the lock once. Two inside at once is caught by an O_EXCL marker no lock code knows.
const workerSource = (root, id) => `
const fs = require('node:fs');
const kit = require(${JSON.stringify(entry)});
const io = { fs: kit.io.createFs(${JSON.stringify(root)}), clock: kit.io.clock, proc: kit.io.proc };
const parked = new Int32Array(new SharedArrayBuffer(4));
const waitFor = (file) => { while (!fs.existsSync(file)) Atomics.wait(parked, 0, 0, 1); };
(async () => {
  let overlaps = 0;
  for (let round = 0; round < ${ROUNDS}; round += 1) {
    waitFor(${JSON.stringify(root)} + '/go.' + round);
    await kit.lock.withLock(io, 'LOCK', async () => {
      try { fs.writeFileSync(${JSON.stringify(root)} + '/IN', ${JSON.stringify(id)}, { flag: 'wx' }); } catch (err) { if (err.code !== 'EEXIST') throw err; overlaps += 1; }
      await new Promise((resolve) => { setTimeout(resolve, 2); });
      fs.rmSync(${JSON.stringify(root)} + '/IN', { force: true });
    });
    fs.writeFileSync(${JSON.stringify(root)} + '/done.' + ${JSON.stringify(id)} + '.' + round, '');
  }
  process.stdout.write(String(overlaps));
})();
`;

const pause = kit.io.clock.sleep;
/** The lock's text, or null: a holder may release it between any two calls, so absence is read from the read. */
function textOr(file) {
  try {
    return nodeFs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return null;
  }
}

/** A lock that stays put with its holder already done for this round is a lock nobody holds: counted and cleared, or the other waiters would sit out the 600 s bound. */
async function clearedIfStranded(dir, pids, round) {
  const lock = path.join(dir, 'LOCK');
  const before = textOr(lock);
  if (!before || !before.endsWith('\n')) return 0;
  const at = pids.indexOf(JSON.parse(before).pid);
  if (at < 0 || !nodeFs.existsSync(path.join(dir, `done.${at}.${round}`))) return 0;
  await pause(300);
  if (textOr(lock) !== before) return 0;
  nodeFs.rmSync(lock, { force: true });
  return 1;
}

test('[I-54] six real processes meet one dead lock: never two holders, and no lock is left behind by a holder that released', LIMIT, () => inTmp(async (dir) => {
  const dead = spawnSync('/usr/bin/true').pid;
  const children = [];
  const workers = Array.from({ length: WORKERS }, (_, i) => new Promise((resolve) => {
    let said = '';
    const child = spawn(process.execPath, ['-e', workerSource(dir, String(i))], { stdio: ['ignore', 'pipe', 'inherit'] });
    children.push(child);
    child.stdout.on('data', (chunk) => { said += chunk; });
    child.on('close', (code) => resolve({ code, overlaps: Number(said) }));
  }));
  const pids = children.map((child) => child.pid);
  let stranded = 0;
  try {
    for (let round = 0; round < ROUNDS; round += 1) {
      nodeFs.writeFileSync(path.join(dir, 'LOCK'), lockOf(dead));
      nodeFs.writeFileSync(path.join(dir, `go.${round}`), '');
      while (!pids.every((_, i) => nodeFs.existsSync(path.join(dir, `done.${i}.${round}`)))) {
        stranded += await clearedIfStranded(dir, pids, round);
        await pause(2);
      }
      stranded += await clearedIfStranded(dir, pids, round);
      nodeFs.rmSync(path.join(dir, 'LOCK'), { force: true });
    }
  } finally {
    setTimeout(() => children.forEach((child) => child.kill('SIGKILL')), 60000).unref();
  }
  const results = await Promise.all(workers);
  assert.deepEqual(results.map((r) => r.code), Array(WORKERS).fill(0));
  assert.deepEqual({ overlaps: results.reduce((sum, r) => sum + r.overlaps, 0), stranded }, { overlaps: 0, stranded: 0 });
  assert.deepEqual(nodeFs.readdirSync(dir).filter((name) => /^LOCK\./.test(name)), [], 'no claim and no aside is left');
}));

/** Pids and time are scripted, so a wait of minutes costs nothing. */
const world = (fs, alive) => {
  let waited = 0;
  return { fs, proc: { pid: () => 7, alive }, clock: { now: () => '2026-11-03T00:00:01.000Z', elapsedMs: () => waited, sleep: async (ms) => { waited += ms; } }, waited: () => waited };
};
const CLAIM = `LOCK.reclaim.${'a'.repeat(16)}`;

test('[I-55] a reclaimer that died holding its claim stops nobody: the claim is a lock, judged and reclaimed the same way', () => inTmp(async (dir) => {
  const io = world(createFs(dir), (pid) => pid === 7);
  io.fs.writeAtomic('LOCK', lockOf(41));
  io.fs.writeAtomic(CLAIM, lockOf(42, 'b'));
  assert.equal(await withLock(io, 'LOCK', async () => 'taken'), 'taken');
  assert.equal(io.waited(), 0);
  assert.deepEqual(nodeFs.readdirSync(dir).filter((name) => name.startsWith('LOCK')), [], 'the dead claim went too');
}));

test('[I-55] a torn claim waits out the torn bound, then stops nobody', async () => {
  const io = world(kit.testing.memoryFs(), (pid) => pid === 7);
  io.fs.writeAtomic('LOCK', lockOf(41));
  io.fs.writeAtomic(CLAIM, '{"pid":');
  assert.equal(await withLock(io, 'LOCK', async () => 'taken'), 'taken');
  assert.ok(io.waited() >= 60000 && io.waited() < 61000, `waited ${io.waited()}`);
});

test('[I-55] a claim whose holder is alive is left alone: the dead lock waits for it, and past the bound the answer is held', async () => {
  const io = world(kit.testing.memoryFs(), (pid) => pid === 7 || pid === 42);
  io.fs.writeAtomic('LOCK', lockOf(41));
  const claim = lockOf(42, 'b', '2026-11-03T00:00:00.500Z');
  io.fs.writeAtomic(CLAIM, claim);
  await assert.rejects(withLock(io, 'LOCK', async () => 'no'), (err) => isFail(err, 'lock-held'));
  assert.equal(io.fs.readText('LOCK'), lockOf(41));
  assert.equal(io.fs.readText(CLAIM), claim);
});

test('[I-55] a waiter whose judgment is old touches nothing: the lock that replaced the dead one stays', async () => {
  const io = world(kit.testing.memoryFs(), (pid) => pid !== 41);
  io.fs.writeAtomic('LOCK', lockOf(41));
  const live = lockOf(43, 'c', '2026-11-03T00:00:00.500Z');
  let first = true;
  const createExclusive = (key, text) => {
    if (key === CLAIM && first) { first = false; io.fs.writeAtomic('LOCK', live); } // the winner finished and another writer took the key, just after this waiter judged
    return io.fs.createExclusive(key, text);
  };
  await assert.rejects(withLock({ ...io, fs: { ...io.fs, createExclusive } }, 'LOCK', async () => 'no'), (err) => isFail(err, 'lock-held'));
  assert.equal(io.fs.readText('LOCK'), live);
});
