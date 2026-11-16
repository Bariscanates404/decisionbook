// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE lock primitive: O_EXCL { pid, nonce, at } + newline (none: torn). Past WAIT.ageMs a lock is gone though its pid reads alive; `mine`
// lets a slow holder refuse before a doubled step.
const { digest } = require('../base/hash.cjs');
const { fail, isFail } = require('../base/errors.cjs');
const { createValidate } = require('../contracts/validate.cjs');
const { isCode } = require('../contracts/codes.cjs');

// maxMs: ten minutes, far above the longest critical section on a busy machine; ageMs: 6 × maxMs.
const WAIT = { maxMs: 600000, tornMs: 60000, stepMs: 50, ageMs: 3600000 };
const CLAIM_NONCE = 16; // enough to tell locks apart, and a chain of dead reclaimers stays inside one file name
const TORN = Object.freeze({ pid: null, nonce: 'torn' });
const bound = createValidate({ shapes: { Lock: { pid: 'int', nonce: 'digest', at: 'str' } }, enums: {}, refuse: { Lock: 'lock-held' }, isCode });

function lockIn(text) {
  if (!text.endsWith('\n')) return TORN;
  try {
    return bound.shape('Lock', bound.json(text, 'lock-held'));
  } catch (err) {
    if (!isFail(err, 'lock-held')) throw err;
    return TORN;
  }
}

const gone = (io, held) => !io.proc.alive(held.pid) || Date.parse(io.clock.now()) - Date.parse(held.at) > WAIT.ageMs;

function holder(io, key) {
  const text = io.fs.readText(key);
  return text === null ? null : lockIn(text);
}

const judgedGone = (io, held, waited) => (held === TORN ? waited > WAIT.tornMs : gone(io, held));

function moveAside(io, key, judged) {
  const aside = `${key}.stale.${judged.nonce}`;
  if (!io.fs.rename(key, aside)) return;
  const text = io.fs.readText(aside);
  if (lockIn(text).nonce !== judged.nonce) io.fs.createExclusive(key, text);
  io.fs.remove(aside);
}

// Under the claim the lock is read again, so a waiter with an old judgment touches nothing; the claim is itself a lock. -> false while
// another reclaimer works.
function reclaim(io, { key, judged, waited, line }) {
  const claim = `${key}.reclaim.${judged.nonce.slice(0, CLAIM_NONCE)}`;
  if (!io.fs.createExclusive(claim, line)) {
    const other = holder(io, claim);
    return Boolean(other) && judgedGone(io, other, waited) && reclaim(io, { key: claim, judged: other, waited, line });
  }
  if (holder(io, key)?.nonce === judged.nonce) moveAside(io, key, judged);
  io.fs.remove(claim);
  return true;
}

async function acquire(io, key, maxMs) {
  const at = io.clock.now();
  const pid = io.proc.pid();
  const mine = { pid, nonce: digest([pid, at, io.clock.elapsedMs()]), at };
  const line = `${JSON.stringify(mine)}\n`;
  const t0 = io.clock.elapsedMs();
  let waits = 0;
  while (!io.fs.createExclusive(key, line)) {
    const held = holder(io, key);
    const waited = io.clock.elapsedMs() - t0;
    if (!held || !judgedGone(io, held, waited) || !reclaim(io, { key, judged: held, waited, line })) {
      if (waited > maxMs) throw fail('lock-held', held ? `pid ${held.pid} still reads alive after ${Math.round(waited / 1000)} s` : 'released');
      await io.clock.sleep(WAIT.stepMs);
      waits += 1;
    }
  }
  return { mine, waits };
}

function release(io, key, mine) {
  const held = holder(io, key);
  if (held && held.nonce === mine.nonce) io.fs.remove(key);
}

// lockLine (io, key): { stuck, says } for a doctor, or null for no lock; it changes nothing.
function lockLine(io, key) {
  const held = holder(io, key);
  if (!held) return null;
  if (held !== TORN && !gone(io, held)) return { stuck: false, says: `lock held by pid ${held.pid}` };
  const says = held !== TORN && `lock of pid ${held.pid} is older than ${WAIT.ageMs / 1000} s: the next writer reclaims it`;
  if (held !== TORN && io.proc.alive(held.pid)) return { stuck: true, says };
  return { stuck: true, says: `${held === TORN ? 'torn' : 'dead'} lock (pid ${held.pid}): the next writer reclaims it` };
}

function stillMine(io, key, mine) {
  const held = holder(io, key);
  if (!held || held.nonce !== mine.nonce) throw fail('lock-held', 'another writer took this lock');
}

// withLock (io, key, fn, maxMs?): fn gets (waits, mine): how many waits it took, and `mine()`, which throws lock-held once another writer
// took the lock.
// `maxMs`: how long a live holder is waited for (a hook has seconds, a publish minutes).
async function withLock(io, key, fn, maxMs = WAIT.maxMs) {
  const { mine, waits } = await acquire(io, key, maxMs);
  try {
    return await fn(waits, () => stillMine(io, key, mine));
  } finally {
    release(io, key, mine);
  }
}

module.exports = { withLock, lockLine };
