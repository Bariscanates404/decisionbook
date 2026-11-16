// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the suite's own helpers save disk without coupling tests: a written home is never handed on, a changed world is never shared.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { tmp, cleanEnv, makeWorld, writeFake } = require('./support.cjs');

test('a home stays shared only while empty: the call after a write gets a new one', () => {
  const first = cleanEnv().HOME;
  assert.equal(cleanEnv().HOME, first, 'an empty home is reused');
  fs.writeFileSync(path.join(first, '.written'), 'x');
  const second = cleanEnv().HOME;
  assert.notEqual(second, first, 'a written home is never handed on');
  assert.deepEqual(fs.readdirSync(second), []);
});

test('a caller that names HOME keeps it and no home is made for it', () => {
  const own = tmp('cli-own-tmp-');
  const script = "const { cleanEnv } = require('./support.cjs'); process.stdout.write(cleanEnv({ HOME: '/named' }).HOME);";
  const res = spawnSync(process.execPath, ['-e', script], { cwd: __dirname, env: { PATH: process.env.PATH, TMPDIR: own }, encoding: 'utf8' });
  assert.equal(res.stdout, '/named', res.stderr);
  assert.deepEqual(fs.readdirSync(own), []);
});

test('the same world spec is one world; `own` is a new one, and only an own world takes a late fake', () => {
  const shared = makeWorld();
  assert.equal(makeWorld().dir, shared.dir);
  assert.notEqual(makeWorld({ fakes: { spare: { body: '{}' } } }).dir, shared.dir, 'another spec is another world');
  assert.throws(() => writeFake(shared.dir, 'extra', { body: '{}' }), /shared world never changes.*own: true/);
  assert.equal(fs.existsSync(path.join(shared.dir, 'node_modules', '@atlasbound', 'extra')), false);
  const mine = makeWorld({ own: true });
  assert.notEqual(mine.dir, shared.dir);
  writeFake(mine.dir, 'extra', { body: '{}' });
  assert.equal(fs.existsSync(path.join(mine.dir, 'node_modules', '@atlasbound', 'extra', 'index.cjs')), true);
  assert.equal(makeWorld({ at: path.join(tmp('cli-at-'), 'install') }).dir === shared.dir, false, 'an install at a named place is its own');
});

test('a write through a shipped link is refused at that line, so it never reaches another world', () => {
  const inWorld = (world, rel) => path.join(world.dir, 'node_modules', '@atlasbound', rel);
  const [one, two] = [makeWorld({ own: true }), makeWorld({ own: true })];
  const before = fs.readFileSync(inWorld(two, 'cli/release.json'), 'utf8');
  assert.throws(() => fs.writeFileSync(inWorld(one, 'cli/release.json'), 'written through'), { code: 'EACCES' });
  fs.rmSync(inWorld(one, 'cli/release.json'));
  fs.writeFileSync(inWorld(one, 'cli/release.json'), 'replaced');
  assert.equal(fs.readFileSync(inWorld(two, 'cli/release.json'), 'utf8'), before);
});

test('a world shares bytes with other worlds, never with the repository, and a late fake reaches only its own world', () => {
  const inWorld = (world, rel) => path.join(world.dir, 'node_modules', '@atlasbound', rel);
  const [one, two] = [makeWorld({ own: true }), makeWorld({ own: true })];
  const inode = (file) => fs.statSync(file).ino;
  assert.equal(inode(inWorld(one, 'kit/index.cjs')), inode(inWorld(two, 'kit/index.cjs')));
  assert.notEqual(inode(inWorld(one, 'kit/index.cjs')), inode(require.resolve('@atlasbound/kit')));
  const before = fs.readFileSync(inWorld(two, 'kit/index.cjs'), 'utf8');
  writeFake(one.dir, 'kit', { body: '{ faked: true }' });
  assert.match(fs.readFileSync(inWorld(one, 'kit/index.cjs'), 'utf8'), /faked: true/);
  assert.equal(fs.readFileSync(inWorld(two, 'kit/index.cjs'), 'utf8'), before);
});
