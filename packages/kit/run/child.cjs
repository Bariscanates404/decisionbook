// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE starter of a background child of the product itself: under a lock, at most one, its row noted only once it started. The caller
// owns the rows and decides when one is due; this file owns the order, so no caller can spawn before it holds the lock.
const { childEnv } = require('../base/paths.cjs');
const { withLock } = require('./lock.cjs');

const STOP_ENV = 'ATLASBOUND_CHILD_STOP_MS'; // a child's own hard stop in ms, handed by its starter; no person or AI passes it
const SELF_ENV = 'ATLASBOUND_SELF_CHECK'; // a run of the product's own self-check (doctor's probe), handed by its starter: its rows say so

/** One detached `<this node> <this bin> ...words` at the repository root: its env is exactly `envKeys` (PATH with no repository directory)
 * and the hard stop `stopMs` when given -> { pid, error }. */
const startSelf = (io, words, envKeys, stopMs = null) => io.proc.startDetached({ cmd: io.self.node, args: [io.self.bin, ...words],
  env: { ...childEnv(io.env, envKeys, io.root), ...(stopMs ? { [STOP_ENV]: String(stopMs) } : {}) }, cwd: io.root });
/** The stop this process was handed, or null (a person's own run). */
const handedStop = (env) => [Number(env.get(STOP_ENV))].find((ms) => Number.isInteger(ms) && ms > 0) ?? null;
const selfCheck = (env) => env.get(SELF_ENV) === '1';

/** Under `lock` (waited for at most `waitMs`, else lock-held): `plan()` -> { refused } and nothing starts, or { start, note }: `start()` ->
 * { pid, error }, then `note(pid)` only for a child that started -> { refused } | { error } | { pid }. */
function startOnce(io, { lock, waitMs }, plan) {
  return withLock(io, lock, async () => {
    const { refused = null, start, note } = plan();
    if (refused) return { refused };
    const child = start();
    if (child.error) return { error: child.error };
    note(child.pid);
    return { pid: child.pid };
  }, waitMs);
}

module.exports = { startSelf, handedStop, startOnce, SELF_ENV, selfCheck };
