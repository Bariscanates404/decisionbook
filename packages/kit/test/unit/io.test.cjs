// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const nodeFs = require('node:fs');
const path = require('node:path');
const { io: { createFs, clock, scratch }, errors: { isFail } } = require('@atlasbound/kit');

test('io/fs: absent is null (file and directory), writeAtomic leaves no tmp file, append appends', () => {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'kit-fs-'));
  try {
    const fs = createFs(root);
    assert.equal(fs.readText('a/b.txt'), null);
    assert.equal(fs.list('a'), null);
    fs.writeAtomic('a/b.txt', 'one\n');
    fs.append('a/c.jsonl', '{"x":1}\n');
    fs.append('a/c.jsonl', '{"x":2}\n');
    assert.equal(fs.readText('a/b.txt'), 'one\n');
    assert.equal(fs.readText('a/c.jsonl'), '{"x":1}\n{"x":2}\n');
    assert.deepEqual(fs.list('a'), ['b.txt', 'c.jsonl']);
    assert.throws(() => fs.readText('../outside'), (e) => isFail(e, 'path-outside-repo'));
    assert.throws(() => fs.readText('a'), (e) => isFail(e, 'io-read-failed') && /not a regular file/.test(e.message));
    assert.throws(() => fs.readText('a/c.jsonl', { maxBytes: 9 }), (e) => isFail(e, 'io-read-too-large'), 'over the bound: refused');
    assert.equal(fs.readText('a/c.jsonl', { maxBytes: 8, tail: true }), '{"x":2}\n', 'tail gives the last bytes');
    assert.equal(fs.readText('a/b.txt', { maxBytes: 9, tail: true }), 'one\n', 'a file within the bound: whole');
  } finally {
    nodeFs.rmSync(root, { recursive: true, force: true });
  }
});

test('io/fs reads by the on-disk spelling; on a byte-exact fs an NFD name is found by its disk bytes only', () => {
  const nfd = 'test/cafe\u0301.js';
  const disk = new Map([[`/repo/${nfd}`, 'x\n']]); // byte-exact lookup, like ext4: no normalisation
  const enoent = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  const fs = createFs('/repo', { impl: {
    openSync: (p) => { if (!disk.has(p)) throw enoent(); return p; },
    fstatSync: () => ({ isFile: () => true, size: 2 }),
    readFileSync: (fd) => disk.get(fd),
    closeSync: () => {},
  } });
  assert.equal(fs.readText(nfd), 'x\n');
  assert.equal(fs.readText(nfd.normalize('NFC')), null);
  assert.throws(() => fs.readText('../x'), (e) => isFail(e, 'path-outside-repo'));
});

test('io/scratch: a copy lands only under a name in the folder it made, and remove takes that folder and no other', () => {
  const from = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'kit-scratch-from-'));
  nodeFs.writeFileSync(path.join(from, 'a.txt'), 'a');
  const made = scratch('kit-scratch-');
  try {
    made.copy(from, 'repo', []);
    assert.equal(nodeFs.readFileSync(path.join(made.dir, 'repo/a.txt'), 'utf8'), 'a');
    assert.throws(() => made.copy(from, '../beside', []), (e) => isFail(e, 'path-outside-repo'));
    assert.throws(() => made.copy(from, from, []), (e) => isFail(e, 'path-absolute'));
    made.remove(from);
    assert.deepEqual([nodeFs.existsSync(made.dir), nodeFs.existsSync(path.join(from, 'a.txt'))], [false, true], 'a folder handed to remove stays');
  } finally {
    nodeFs.rmSync(from, { recursive: true, force: true });
  }
});

test('io/clock: ISO wall time and a monotonic timer', () => {
  assert.match(clock.now(), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  const a = clock.elapsedMs();
  assert.ok(clock.elapsedMs() >= a);
});
