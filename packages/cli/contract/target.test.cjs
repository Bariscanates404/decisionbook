// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// `--target` names a directory by its bytes. On a byte-exact disk an NFD directory and its NFC spelling are two directories, so a path that went
// through NFC found no repository or the wrong one.
// Every [I-n] names one invariant of this package.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tmp, makeWorld, git, run } = require('./support.cjs');

test('[I-40] --target keeps its bytes: an NFD directory is answered for in the spelling it was named in, `.` and `..` applied', () => {
  const world = makeWorld();
  const name = 'cafe\u{301}';
  const repo = path.join(tmp('cli-target-'), name);
  fs.mkdirSync(repo);
  git(repo, 'init', '-q');
  const root = (target, cwd) => JSON.parse(run(world.bin, ['debug', 'doctor', '--target', target], { cwd }).out).root;
  assert.equal(root(repo), repo);
  assert.equal(root(`${repo}/./sub/..`), repo);
  assert.equal(root(name, path.dirname(repo)), repo, 'relative to the working directory');
});
