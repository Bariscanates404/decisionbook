// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The fake `io`: an in-memory fs that answers the `[I-51]` table like io/fs (keys byte-exact, absent null), and a fixed clock.
const { under, dirOf, repoRel, resolveFrom } = require('../base/paths.cjs');
const { fail } = require('../base/errors.cjs');

const ROOT = '/fake';

function memoryFs(files = {}) {
  const store = new Map(Object.entries(files));
  const emptied = new Set();
  const at = (key) => {
    under(ROOT, key);
    return key;
  };
  const changed = new Map(); // a counter stands for the disk's clock: only the order means anything, and the seed files are the oldest
  let tick = 0;
  const put = (key, text) => {
    changed.set(key, (tick += 1));
    return store.set(key, text);
  };
  const inside = (key) => [...store.keys(), ...emptied].filter((k) => k.startsWith(`${key}/`)); // an emptied folder still sits in its parent
  const isDir = (key) => emptied.has(key) || inside(key).length > 0;
  const leave = (key) => {
    if (store.delete(key) && key.includes('/')) emptied.add(dirOf(key));
  };
  function readText(key, { maxBytes = Infinity } = {}) {
    if (!store.has(at(key))) {
      if (isDir(key)) throw fail('io-read-failed', `${key}: not a regular file`);
      return null;
    }
    if (Buffer.byteLength(store.get(key)) > maxBytes) throw fail('io-read-too-large', key);
    return store.get(key);
  }
  return {
    store,
    readText,
    real: (key) => (store.has(at(key)) || isDir(key) ? key : null),
    // no links, no case folding: the spelling
    keyAt: (hostPath) => (typeof hostPath === 'string' && hostPath !== '' ? repoRel(ROOT, resolveFrom(ROOT, hostPath)) : null),
    // one name each, so a file's place is its spelling
    placeAt: async (hostPath) => (typeof hostPath === 'string' && hostPath !== '' ? repoRel(ROOT, resolveFrom(ROOT, hostPath)) : null),
    exists: (key) => store.has(at(key)) || isDir(key),
    mtimeMs: (key) => (store.has(at(key)) ? changed.get(key) ?? 0 : null),
    list: (key) => {
      const names = inside(at(key)).map((k) => k.slice(key.length + 1).split('/')[0]);
      return isDir(key) ? [...new Set(names)].sort() : null;
    },
    writeAtomic: (key, text) => {
      put(at(key), text);
    },
    append: (key, text) => {
      put(at(key), (store.get(key) || '') + text);
    },
    remove: (key) => {
      leave(at(key));
    },
    removeEmpty: (key) => isDir(key) && !inside(at(key)).length && emptied.delete(at(key)),
    makeDir: (key) => {
      for (let up = at(key); up; up = dirOf(up)) emptied.add(up);
    },
    createExclusive: (key, text) => !store.has(at(key)) && Boolean(put(key, text)),
    rename: (from, to) => {
      if (!store.has(at(from))) return false;
      put(at(to), store.get(from));
      leave(from);
      return true;
    },
  };
}

function fixedClock(at = '2026-11-02T06:00:00.000Z') {
  let ms = 0;
  return { now: () => at, elapsedMs: () => (ms += 5), sleep: async (wait) => {
    ms += wait;
  } };
}

// a spawn helper that starts the real bin calls countSpawn(). Under kit/tools/run-tests.cjs, which names a file in KIT_TEST_SPAWNS, one
// line naming the test file lands there, and the runner holds each package's count to its caps.spawns. Run alone, nothing is written.
const SPAWNS_VAR = 'KIT_TEST_SPAWNS';
const countSpawn = () => process.env[SPAWNS_VAR] && require('node:fs').appendFileSync(process.env[SPAWNS_VAR], `${process.argv[1]}\n`);

module.exports = { memoryFs, fixedClock, countSpawn, SPAWNS_VAR };
