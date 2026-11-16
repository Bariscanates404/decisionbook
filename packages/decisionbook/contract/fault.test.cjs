// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// An error the product did not make (node's own: a file that is not there, a wrong argument type) is a crash and is reported as one: the
// verb or handler rejects with that very error and its trace row says unexpected-error. It is never read as a refusal of the product,
// which only kit's `fail` makes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const kit = require('@atlasbound/kit');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, begin, added, writeConfig, starting, readOf, tracedSteps, logFile, planRecords } = require('./world.cjs');

const { handlers } = decisionbook;
const FILES = { 'src/report/export.js': 'line one\n' };

/** node's own error for a file that is not there: an Error whose `code` is the string ENOENT, exactly as fs throws it. */
function nodeError() {
  try {
    return fs.readFileSync('/nonexistent/decisionbook-fault-test');
  } catch (err) {
    return err;
  }
}
/** The world's fs with one key whose read throws node's error. */
function readThrows(io, key) {
  const read = io.fs.readText;
  io.fs.readText = (asked, ...rest) => {
    if (asked === key) throw nodeError();
    return read(asked, ...rest);
  };
}
const crashed = (promise) => promise.then(() => null, (err) => err);

test('node\'s own error is no failure of the product: only an error kit\'s fail made is one', () => {
  const err = nodeError();
  assert.deepEqual([typeof err.code, err.code, kit.errors.isFail(err)], ['string', 'ENOENT', false]);
  assert.equal(kit.errors.isFail(kit.errors.fail('plan-args', 'add <id>')), true);
});

test('a node error thrown while a record is checked crashes the add: no refusal says nothing was written in its name', async () => {
  const io = bookWorld({ files: FILES });
  const id = await begin(io);
  const before = planRecords(io, id).length;
  readThrows(io, 'src/report/export.js');
  const cited = { t: 'research', tool: 'grep', asked: 'where', answer: 'there', source: 'src/report/export.js:1', settles: 'report.export.where' };
  const err = await crashed(added(io, id, cited));
  assert.deepEqual([err.code, kit.errors.isFail(err)], ['ENOENT', false], err.message);
  assert.match(err.message, /^ENOENT: no such file or directory/, 'the error as node made it, not a refusal built around its code');
  assert.deepEqual(tracedSteps(io).at(-1), ['decisionbook.add', false, 'unexpected-error']);
  assert.equal(io.fs.readText(logFile(id)).trim().split('\n').length, before, 'and nothing was written');
});

test('a node error thrown while the policy is read crashes the session start: it is not told as an unreadable policy', async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['src/**'] });
  readThrows(io, '.decisionbook/config.json');
  const err = await crashed(handlers.session(starting(), io));
  assert.deepEqual([err && err.code, kit.errors.isFail(err)], ['ENOENT', false]);
  assert.deepEqual(tracedSteps(io).at(-1), ['decisionbook.session', false, 'unexpected-error']);
});

test('a node error from the import graph the root hands crashes the recall: it is not counted as a graph that does not read', async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['src/**'] });
  io.imports = async () => {
    throw nodeError();
  };
  const err = await crashed(handlers.recall(readOf('src/report/export.js'), io));
  assert.deepEqual([err && err.code, kit.errors.isFail(err)], ['ENOENT', false]);
  assert.deepEqual(tracedSteps(io).at(-1), ['decisionbook.recall', false, 'unexpected-error']);
});

test('a failure of the product thrown at the same places is still a refusal and a counted unread graph', async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['src/**'] });
  io.imports = async () => {
    throw kit.errors.fail('io-read-failed', 'the graph');
  };
  const out = await handlers.recall(readOf('src/report/export.js'), io);
  assert.equal(out.code, 'recall-none');
  assert.deepEqual(tracedSteps(io).at(-1), ['decisionbook.recall', true, null]);
});
