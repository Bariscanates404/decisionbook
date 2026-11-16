// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// childEnv's table. `real` is what kit/io/fs answers on a disk; here a table, so the row says which spelling leads where.
// base/paths cases of unicode paths (an AI echo resolves by key, never merged) and of paths
// (containment decided by base/paths, an NFD name is its NFC key).
const test = require('node:test');
const assert = require('node:assert/strict');
const nodePath = require('node:path');
const { paths: { pathKey, speller, isKey, repoRel, under, dirOf, join, parentDir, nameOf, upward, resolveFrom, childEnv }, errors: { isFail } } =require('@atlasbound/kit');

const NFC = (s) => s.normalize('NFC');
const NFD = (s) => s.normalize('NFD');
const JA = NFC('test/ユーザー.test.js');
const TR = NFC('test/şifre_değiştir.test.js');
const LA = NFC('src/café.js');

test('speller: the exact spelling, else the ONE listed path with the same key, answered in the listed spelling', () => {
  for (const p of [JA, TR, LA]) {
    assert.notEqual(NFD(p), p, `MEASUREMENT: ${p} has a distinct NFD form`);
    const spell = speller([p, 'src/other.js']);
    assert.equal(spell(p), p, 'exact');
    assert.equal(spell(NFD(p)), p, 'an NFD echo of an NFC-listed path is that path');
    assert.equal(speller([NFD(p)])(p), NFD(p), 'an NFC echo of an NFD-listed path is that path, in ITS spelling');
  }
  assert.equal(speller(['a.js'])(null), null);
  assert.equal(speller(['a.js'])('b.js'), null);
});

test('speller negatives: case, dotless i, NFKC-only and normalization siblings are never merged', () => {
  const spell = speller([NFC('src/kullanıcı.js'), 'src/file.js', 'src/Readme.md']);
  assert.equal(spell('src/kullanici.js'), null, 'dotless ı is not i');
  assert.equal(spell(NFC('src/KULLANICI.js')), null, 'no case fold');
  assert.equal(spell(NFC('src/kullanİcİ.js')), null, 'dotted capital İ is not ı');
  assert.equal(spell('src/\ufb01le.js'), null, 'the ligature ﬁ (NFKC = fi) is not fi');
  assert.equal(spell('src/readme.md'), null, 'no case fold');
  const composed = 'src/\u1ec7.js';
  const decomposed = 'src/e\u0323\u0302.js';
  const third = 'src/\u1eb9\u0302.js'; // the same NFC key, a spelling neither file has
  assert.equal(NFC(composed), NFC(decomposed), 'MEASUREMENT: one key');
  assert.equal(NFC(third), NFC(composed), 'MEASUREMENT: one key');
  const both = speller([composed, decomposed]);
  assert.equal(both(composed), composed, 'each exact spelling is its own file');
  assert.equal(both(decomposed), decomposed, 'each exact spelling is its own file');
  assert.equal(both(third), null, 'a spelling that could be EITHER is neither');
});

test('isKey: true only for a canonical key (NFC, POSIX, relative, no dot segments)', () => {
  assert.equal(isKey('src/a.js'), true);
  assert.equal(isKey(LA), true);
  for (const bad of [NFD(LA), './a.js', 'a//b.js', 'a\\b.js', '/etc/x', 'C:\\x', '../x', 'a/../b', '', null, 7]) {
    assert.equal(isKey(bad), false, JSON.stringify(bad));
  }
});

test('repoRel: containment is decided by base/paths, never a lexical prefix, and Windows spellings become the POSIX key', () => {
  assert.equal(repoRel('/w/app', '/w/app/src/a.ts'), 'src/a.ts');
  assert.equal(repoRel('/w/app/', '/w/app/src/a.ts'), 'src/a.ts', 'a trailing slash on the root changes nothing');
  assert.equal(repoRel('/w/app', '/w/app-api/src/a.ts'), null, 'a sibling folder sharing the prefix is outside');
  assert.equal(repoRel('/w/app', '/w/app'), null, 'the root itself is not a file');
  assert.equal(repoRel('/w/app', '/w/other/a.ts'), null);
  assert.equal(repoRel('/w/app', '/w/app/../other/a.ts'), null, 'a dot-dot escape is outside');
  assert.equal(repoRel('/w/app', 'src/a.ts'), null, 'a relative path is not a host path');
  assert.equal(repoRel('C:\\r', 'C:\\r\\src\\a.ts'), 'src/a.ts', 'Windows separators become the POSIX key');
  assert.equal(repoRel('C:\\r', 'c:\\r\\src\\a.ts'), 'src/a.ts', 'a drive-letter case difference is the same file');
  assert.equal(repoRel('C:\\r', 'D:\\r\\a.ts'), null, 'another drive is outside');
});

test('a decomposed name on disk is its composed key, one file and one key, and case stays byte-exact', () => {
  const nfd = 'o\u0308grenci.ts';
  assert.equal(pathKey(nfd), NFC(nfd));
  assert.equal(repoRel('/w/app', `/w/app/${nfd}`), NFC(nfd));
  assert.notEqual(pathKey('O\u0308grenci.ts'), pathKey(nfd), 'no case fold');
});

const refused = (code) => (e) => isFail(e, code);

test('pathKey refusals: a host path, any .. segment and nothing left each have their code; the message names the text', () => {
  for (const host of ['/etc/x', '\\etc\\x', 'C:\\x', 'c:/x', 'C:x', '//', '\\']) assert.throws(() => pathKey(host), refused('path-absolute'), host);
  for (const up of ['../x', 'a/../b', 'a\\..\\b', 'a/..']) assert.throws(() => pathKey(up), refused('path-outside-repo'), up);
  for (const none of ['', '.', './', './/.']) assert.throws(() => pathKey(none), refused('path-empty'), JSON.stringify(none));
  assert.throws(() => pathKey('/etc/x'), /\/etc\/x/, 'the refused text is in the message');
});

test('pathKey refuses what is not a string: there is no key to give, and no "null" file', () => {
  for (const bad of [null, undefined, 7, {}]) assert.throws(() => pathKey(bad), refused('path-empty'), String(bad));
});

test('pathKey is judged on the NFC form: a Kelvin sign before a colon IS a drive once normalised', () => {
  assert.throws(() => pathKey('\u212a:/x'), refused('path-absolute'));
  assert.equal(isKey('\u212a:/x'), false);
});

test('a key is a fixed point: isKey(pathKey(x)), and pathKey(key) === key', () => {
  const parts = ['a', '.', '', 'cafe\u0301', 'b\\c', 'K\u0301'];
  for (const x of parts) for (const y of parts) for (const z of parts) {
    const key = pathKey(`r/${x}/${y}/${z}/f.js`);
    assert.equal(isKey(key), true, key);
    assert.equal(pathKey(key), key);
    assert.equal(dirOf(key) === '' || isKey(dirOf(key)), true, key);
  }
});

test('\\ is always a separator, so a POSIX name holding one is keyed as two segments, and isKey says it is not a key', () => {
  assert.equal(pathKey('a\\b.js'), 'a/b.js');
  assert.equal(isKey('a\\b.js'), false);
  assert.throws(() => pathKey('a\\..\\..\\etc'), refused('path-outside-repo'), 'a backslash never hides an escape');
  assert.equal(under('/r', 'a\\b.js'), nodePath.join('/r', 'a\\b.js'), 'the disk spelling stays, so the host decides what its bytes mean');
});

test('a drive letter and a colon is refused as absolute everywhere; a longer word before the colon is a name', () => {
  assert.throws(() => pathKey('C:x'), refused('path-absolute'));
  assert.equal(isKey('C:x'), false);
  assert.equal(join('', 'C:x'), null);
  assert.equal(pathKey('src/C:x'), 'src/C:x', 'only a leading drive is a host path');
  assert.equal(pathKey('ab:x'), 'ab:x');
});

test('isKey never throws, whatever it is given', () => {
  for (const bad of [undefined, {}, [], true, Symbol.iterator]) assert.equal(isKey(bad), false, String(bad));
});

test('under: refuses like a key, keeps the bytes: an NFD name is found on a byte-exact disk', () => {
  const nfd = NFD(LA);
  assert.equal(under('/r', nfd), nodePath.join('/r', nfd));
  assert.notEqual(under('/r', nfd), nodePath.join('/r', LA), 'no NFC');
  assert.equal(under('/r', 'src/a.js'), nodePath.join('/r', 'src', 'a.js'));
  assert.equal(under('/r/', './src//a.js'), nodePath.join('/r', 'src', 'a.js'));
  assert.throws(() => under('/r', '../x'), refused('path-outside-repo'));
  assert.throws(() => under('/r', 'a/../../x'), refused('path-outside-repo'));
  assert.throws(() => under('/r', '/etc/x'), refused('path-absolute'));
  assert.throws(() => under('/r', 'C:\\x'), refused('path-absolute'));
  assert.throws(() => under('/r', ''), refused('path-empty'));
  assert.throws(() => under('/r', '.'), refused('path-empty'));
  assert.throws(() => under('/r', null), refused('path-empty'));
});

test('under answers a refused spelling by the same throw as pathKey, never a location', () => {
  const cases = [['C:x', 'path-absolute'], ['\\etc', 'path-absolute'], ['a\\..\\b', 'path-outside-repo']];
  for (const [spelling, code] of cases) {
    assert.throws(() => pathKey(spelling), refused(code), spelling);
    assert.throws(() => under('/r', spelling), refused(code), spelling);
  }
});

test('dirOf: the directory key, "" at the root; the bytes of a disk spelling stay', () => {
  assert.equal(dirOf('a/b/c.js'), 'a/b');
  assert.equal(dirOf('a/b'), 'a');
  assert.equal(dirOf('a.js'), '');
  assert.equal(dirOf(''), '');
  assert.equal(dirOf(`${NFD('café')}/x.js`), NFD('café'));
});

test('join: applies . and .. to a relative spelling; "" names the root; null is outside and is !== ""', () => {
  assert.equal(join('a/b', '../c'), 'a/c');
  assert.equal(join('a/b', '../../c'), 'c');
  assert.equal(join('a', '..'), '');
  assert.equal(join('', '.'), '');
  assert.equal(join('', ''), '');
  assert.equal(join('a', ''), 'a');
  assert.equal(join('a', './b'), 'a/b');
  assert.equal(join('a', 'b\\c.js'), 'a/b/c.js');
  assert.equal(join('', '..'), null);
  assert.equal(join('a', '../..'), null);
  assert.equal(join('a', '/x'), null);
  assert.equal(join('a', '\\x'), null);
  assert.equal(join('a', 'C:\\x'), null);
  assert.equal(join('a', null), null, 'nothing to apply, nothing guessed');
});

test('join answers the root or a key, never a spelling a key refuses: a drive reached through dot segments is null', () => {
  assert.equal(join('', './C:x'), null);
  assert.equal(join('', 'b/../C:/x'), null);
  const parts = ['a', '.', '..', '', 'cafe\u0301'];
  for (const dir of ['', 'd', 'd/e']) for (const x of parts) for (const y of parts) {
    const got = join(dir, `${x}/${y}`);
    assert.equal(got === null || got === '' || isKey(got), true, String(got));
  }
});

test('speller: one spelling listed twice is one file, a non-string echo is null, an echo is not otherwise normalised', () => {
  const nfd = NFD(LA);
  assert.equal(speller([nfd, nfd])(LA), nfd, 'the same bytes twice do not make it ambiguous');
  for (const bad of [undefined, 7, {}]) assert.equal(speller(['a.js'])(bad), null);
  assert.equal(speller(['src/a.js'])('src\\a.js'), null, 'a speller matches spellings; pathKey makes keys');
  assert.equal(speller(['src/a.js'])('./src/a.js'), null);
  assert.equal(speller([])('a.js'), null);
});

test('repoRel: NFC on both sides is one location, only the drive letter folds, what is not a host path is null', () => {
  const root = NFC('/w/café');
  assert.equal(repoRel(NFD(root), `${root}/a.ts`), 'a.ts', 'an NFD root and an NFC file are one location');
  assert.equal(repoRel(root, `${NFD(root)}/a.ts`), 'a.ts');
  assert.equal(repoRel('/w/App', '/w/app/a.ts'), null, 'no case fold past the drive');
  assert.equal(repoRel('C:\\R', 'C:\\r\\a.ts'), null, 'no case fold past the drive');
  assert.equal(repoRel('C:\\r\\', 'C:\\r\\a.ts'), 'a.ts');
  assert.equal(repoRel('/w/app', '/w/app/'), null, 'still the root');
  assert.equal(repoRel('/w/app', '/w/app/./'), null);
  assert.equal(repoRel('/w/app', '/w/app/a/../b.ts'), null, 'a .. is not resolved here; the caller joins');
  assert.equal(repoRel('', '/w/app/a.ts'), null, 'a relative root contains no host path');
  assert.equal(repoRel('w/app', 'w/app/a.ts'), null);
  assert.equal(repoRel('/w/app', null), null);
  assert.equal(repoRel(null, '/w/app/a.ts'), null);
});

test('one door for a host path: its parent, its name, its chain upward without the root, and a resolve that keeps the bytes', () => {
  assert.deepEqual(['/a/b/c', '/a/b/', '/a', '/'].map(parentDir), ['/a/b', '/a', '/', '/']);
  assert.deepEqual(['/a/b/c', '/a/b.txt', 'b', 'a/b'].map(nameOf), ['c', 'b.txt', 'b', 'b']);
  assert.deepEqual(upward('/a/b/c'), ['/a/b/c', '/a/b', '/a']);
  assert.deepEqual(upward('/a/b//'), ['/a/b', '/a']);
  assert.deepEqual(upward('/'), []);
  assert.equal(resolveFrom('/w/app', 'x/../y'), '/w/app/y');
  assert.equal(resolveFrom('/w/app', '/other/./z/'), '/other/z');
  const name = NFD('café');
  assert.equal(resolveFrom('/w', name), `/w/${name}`, 'a name that is NFD on a byte-exact disk stays NFD: NFC would name another directory');
  assert.equal(resolveFrom(`/w/${name}`, 'x'), `/w/${name}/x`);
});

const REPO = '/work/repo';
const REAL = { '/work/repo': '/private/work/repo', '/private/work/repo': '/private/work/repo', '/private/work/repo/bin': '/private/work/repo/bin', '/usr/bin': '/usr/bin', '/link/in': '/private/work/repo/bin', '/usr/local/bin': '/usr/local/bin' };
const real = (dir) => REAL[dir] ?? null;
const envOf = (PATH, extra = {}) => ({ pick: (keys) => Object.fromEntries(Object.entries({ PATH, HOME: '/h', ...extra }).filter(([key, value]) => keys.includes(key) && value !== undefined)), realOf: real });

for (const [name, given, kept] of [
  ['a normal PATH', '/usr/local/bin:/usr/bin', '/usr/local/bin:/usr/bin'],
  ['the root itself', '/work/repo:/usr/bin', '/usr/bin'],
  ['under the root', '/work/repo/node_modules/.bin:/usr/bin', '/usr/bin'],
  ['the root with a trailing slash', '/work/repo/:/usr/bin', '/usr/bin'],
  ['another spelling of the root (macOS /tmp is /private/tmp)', '/private/work/repo/bin:/usr/bin', '/usr/bin'],
  ['a link outside that leads in', '/link/in:/usr/bin', '/usr/bin'],
  ['dot, an empty entry and a relative one', '.::node_modules/.bin:/usr/bin', '/usr/bin'],
  ['a name that only starts like the root', '/work/repo-tools/bin:/usr/bin', '/work/repo-tools/bin:/usr/bin'],
  ['a directory above the root: what it holds is not the repository', '/work:/usr/bin', '/work:/usr/bin'],
]) {
  test(`childEnv PATH: ${name}`, () => {
    assert.equal(childEnv(envOf(given), ['PATH'], REPO).PATH, kept);
  });
}

test('childEnv PATH: a repository directory whose name no key can hold is still inside', () => {
  assert.equal(childEnv({ ...envOf('/work/repo/C:x/bin:/usr/bin'), realOf: () => null }, ['PATH'], REPO).PATH, '/usr/bin');
});

test('childEnv: only the keys asked for, with PATH outside; nothing left is the system directories, never empty', () => {
  assert.deepEqual(childEnv(envOf('/work/repo/bin:/usr/bin', { SECRET: 's' }), ['PATH', 'HOME'], REPO), { HOME: '/h', PATH: '/usr/bin' });
  for (const PATH of ['/work/repo', '.', '', undefined]) assert.deepEqual(childEnv(envOf(PATH), ['PATH'], REPO), { PATH: ['/usr/bin', '/bin'].join(nodePath.delimiter) }, String(PATH));
});
