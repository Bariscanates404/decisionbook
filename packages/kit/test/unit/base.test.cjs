// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hash: { digest, sha256 }, paths: { pathKey, join }, errors: { fail, isFail }, text: { lines: { linesOf, lineCount, CONT, IDENT } } } = require('@atlasbound/kit');

test('text: a trailing newline ends the last line, it is not a line; an empty text has none', () => {
  const texts = ['', 'a', 'a\n', 'a\nb', 'a\nb\n', '\n', 'a\n\n'];
  assert.deepEqual(texts.map(lineCount), [0, 1, 1, 2, 2, 1, 2]);
  assert.deepEqual(texts.map(linesOf), [[], ['a'], ['a'], ['a', 'b'], ['a', 'b'], [''], ['a', '']]);
});

test('only a newline ends a line, so a CRLF file keeps its carriage return in the line text and its line numbers stay right', () => {
  assert.deepEqual(linesOf('a\r\nb\r\n'), ['a\r', 'b\r']);
  assert.equal(lineCount('a\r\nb\r\n'), 2);
  assert.deepEqual(linesOf('a\rb'), ['a\rb'], 'a bare \\r is not a line end');
});

test('text: a 1-based citation indexes lines[line-1]', () => {
  const lines = linesOf('first\nsecond\n');
  assert.equal(lines[1 - 1], 'first');
  assert.equal(lines[2 - 1], 'second');
  assert.equal(lines[3 - 1], undefined, 'the trailing newline did not make a line 3');
});

const whole = (s) => new RegExp(`^${IDENT}$`, 'u').test(s);
const continues = (s) => new RegExp(`^[${CONT}]$`, 'u').test(s);

test('alphabet: IDENT is a letter, a letter-number, _ or $, then the continue class, judged per code point', () => {
  for (const good of ['a', 'Count', 'sayıCount', 'değiştir', 'ユーザー', '_x', '$x', '$', '_', 'Ⅷx', 'a1', 'é', 'aः', 'a‿b', '𝒜b', 'a𝒜']) {
    assert.equal(whole(good), true, good);
  }
  for (const bad of ['', '1a', '٣a', '́a', '‿a', '-a', '.a', 'a-b', 'a.b', 'a b', '😀']) {
    assert.equal(whole(bad), false, bad);
  }
});

test('alphabet: CONT holds the class contents for a u pattern; - and . are not in it', () => {
  for (const good of ['a', 'ı', 'Ⅷ', '1', '٣', '́', 'ः', '‿', '_', '$', '𝒜']) assert.equal(continues(good), true, good);
  for (const bad of ['-', '.', ' ', '/', '‍', '😀']) assert.equal(continues(bad), false, bad);
});

test('alphabet: the whole identifier of sayıCount() is read, never the ASCII tail', () => {
  assert.deepEqual('sayıCount() + x'.match(new RegExp(IDENT, 'gu')), ['sayıCount', 'x']);
});

test('the identifier alphabet is the exact text', () => {
  assert.equal(CONT, '\\p{L}\\p{Nl}\\p{Nd}\\p{Mn}\\p{Mc}\\p{Pc}_$');
  assert.equal(IDENT, '[\\p{L}\\p{Nl}_$][\\p{L}\\p{Nl}\\p{Nd}\\p{Mn}\\p{Mc}\\p{Pc}_$]*');
});

test('hash.digest is stable across key order, at every depth', () => {
  const a = { b: 1, a: { y: [1, { q: 1, p: 2 }], x: 'x' } };
  const b = { a: { x: 'x', y: [1, { p: 2, q: 1 }] }, b: 1 };
  assert.equal(digest(a), digest(b));
  assert.match(digest(a), /^[0-9a-f]{64}$/);
  assert.notEqual(digest({ a: [1, 2] }), digest({ a: [2, 1] }), 'array order is content');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('paths.pathKey: NFD -> NFC, a\\b -> a/b, ./x -> x', () => {
  assert.equal(pathKey('cafe\u0301/x.js'), 'caf\u00e9/x.js');
  assert.equal(pathKey('a\\b'), 'a/b');
  assert.equal(pathKey('./x'), 'x');
  assert.equal(pathKey('a//b/./c'), 'a/b/c');
});

test('paths.pathKey refuses ../x and absolute paths with a coded error', () => {
  assert.throws(() => pathKey('../x'), (e) => isFail(e, 'path-outside-repo'));
  assert.throws(() => pathKey('a/../../x'), (e) => isFail(e, 'path-outside-repo'));
  assert.throws(() => pathKey('/etc/passwd'), (e) => isFail(e, 'path-absolute'));
  assert.throws(() => pathKey('C:\\x'), (e) => isFail(e, 'path-absolute'));
  assert.throws(() => pathKey('.'), (e) => isFail(e, 'path-empty'));
});

test('paths.join resolves . and .. from a directory key to an NFC key; null above the root or absolute; "" = the root', () => {
  assert.equal(join('tests', '../index.js'), 'index.js');
  assert.equal(join('lib/a', './b/../c.js'), 'lib/a/c.js');
  assert.equal(join('', 'lib/cafe\u0301.js'), 'lib/caf\u00e9.js');
  assert.equal(join('lib', '..'), '');
  assert.equal(join('', '../x.js'), null);
  assert.equal(join('lib', '../../x.js'), null);
  assert.equal(join('lib', '/etc/x.js'), null);
  assert.equal(join('lib', 'C:\\x.js'), null);
});

test('errors.fail returns (does not throw) a coded error with its whole message: only the trace writer cuts, after its scrub', () => {
  const err = fail('json-invalid', 'x'.repeat(500));
  assert.equal(err.code, 'json-invalid');
  assert.equal(err.message, `json-invalid: ${'x'.repeat(500)}`);
  assert.ok(isFail(err, 'json-invalid'));
  assert.ok(!isFail(err, 'other'));
  assert.ok(!isFail(new Error('plain')));
});

test('only an error fail made is a failure of the product: one that merely carries a string code, as node\'s own do, is none', () => {
  const nodeMade = (() => {
    try {
      return JSON.parse(require('node:fs').readFileSync('/nonexistent/kit-base-test', 'utf8'));
    } catch (err) {
      return err;
    }
  })();
  assert.equal(nodeMade.code, 'ENOENT');
  assert.equal(isFail(nodeMade), false, 'node\'s ENOENT');
  assert.equal(isFail(nodeMade, 'ENOENT'), false);
  assert.equal(isFail(Object.assign(new Error('io-read-failed: by hand'), { code: 'io-read-failed' })), false, 'a product code set by hand');
  assert.equal(isFail({ code: 'io-read-failed', message: 'io-read-failed: an object' }), false);
  for (const thrown of [null, undefined, 'io-read-failed', 7]) assert.equal(isFail(thrown), false);
  const made = fail('io-read-failed', 'src/a.js');
  assert.equal(isFail(made), true);
  assert.equal(isFail(Object.assign(made, { routes: ['a'] })), true, 'fields added to it keep it one');
  assert.deepEqual(Object.keys({ ...made }).sort(), ['code', 'detail', 'routes'], 'a copy of its fields is no failure: the mark is not copied');
  assert.equal(isFail({ ...made }), false);
});

test('a failure carries its detail as a field, so no caller cuts the code off its message', () => {
  assert.deepEqual([fail('plan-args', 'add <id>').detail, fail('plan-args').detail, fail('plan-args').message], ['add <id>', '', 'plan-args']);
  assert.equal(fail('git-failed', 404).detail, '404');
});
