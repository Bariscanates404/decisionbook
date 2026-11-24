// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Which lines hold, on the pure core: a draft binds nothing but the conflict its person's answer ends, and only the lines of that
// conflict the question showed; a plan set aside binds nothing at all.
const test = require('node:test');
const assert = require('node:assert/strict');
const { foldPlan } = require('../../core/fold.cjs');
const { validity } = require('../../core/validity.cjs');
const { replacedBy } = require('../../core/text/records.cjs');

const line = (key, value, by, more = {}) => ({ t: 'decision', key, value, why: 'w', by, said: value, at: more.at ?? '2026-11-02T06:00:00.000Z', ...more });
const plan = (id, records) => foldPlan([{ t: 'plan', id, title: id, schema: 'decisionbook-record/1' }, ...records]);
const READY = { t: 'ready', scope: [], at: '2026-11-02T07:00:00.000Z' };
const FILES = { files: ['src/fee.js'] };
/** Two READY plans whose person lines of `fee` disagree (a conflict), a third READY decision `cap`, and a draft with `records`. */
const feeWorld = (records, stage = []) => [plan('a', [line('fee', '100', 'Mark', FILES), READY]), plan('b', [line('fee', '200', 'Lee', FILES), READY]),
  plan('c', [line('cap', '5', 'Mark', { files: ['src/cap.js'] }), READY]), plan('d', [...records, ...stage])];
const replaceAsk = (supersedes) => ({ t: 'question', q: 'Q1', text: 'which fee?', decides: 'fee', whyNotCode: 'a rule', supersedes });
const settling = (more) => line('fee', '100', 'Mark', { answers: 'Q1', ...FILES, ...more });
const standing = (views) => Object.fromEntries(validity(views).map((d) => [d.ref, `${d.state}${d.conflict ? ' conflict' : ''}${d.replacing.length ? ` pending ${d.replacing}` : ''}`]));

test('a draft answer that places every line of the conflict its question named ends it; the plan stays a draft', () => {
  assert.deepEqual(standing(feeWorld([])), { 'a/fee': 'active conflict', 'b/fee': 'active conflict', 'c/cap': 'active' });
  const settled = standing(feeWorld([replaceAsk(['a/fee', 'b/fee']), settling({ supersedes: ['a/fee', 'b/fee'] })]));
  assert.deepEqual(settled, { 'a/fee': 'superseded', 'b/fee': 'superseded', 'c/cap': 'active', 'd/fee': 'active' });
});

test('it ends nothing where it places one line of two, where no person gave it, or where its question did not show the lines', () => {
  const waits = { 'a/fee': 'active conflict', 'b/fee': 'active conflict', 'c/cap': 'active' };
  const one = standing(feeWorld([replaceAsk(['a/fee', 'b/fee']), settling({ supersedes: ['b/fee'] })]));
  assert.deepEqual([one['a/fee'], one['b/fee']], ['active conflict', 'active conflict'], 'one line of the two placed');
  const ai = standing(feeWorld([replaceAsk(['a/fee', 'b/fee']), settling({ by: 'ai', supersedes: ['a/fee', 'b/fee'] })]));
  assert.deepEqual({ ...ai, 'd/fee': undefined }, { ...waits, 'd/fee': undefined }, 'the AI\'s own line');
  const unshown = standing(feeWorld([replaceAsk(['a/fee']), settling({ supersedes: ['a/fee', 'b/fee'] })]));
  assert.deepEqual([unshown['a/fee'], unshown['b/fee']], ['active conflict', 'active conflict'], 'the question showed one line only');
  const unasked = standing(feeWorld([settling({ answers: undefined, supersedes: ['a/fee', 'b/fee'] })]));
  assert.deepEqual([unasked['a/fee'], unasked['b/fee']], ['active conflict', 'active conflict'], 'no question at all');
});

test('the answer ends only the conflict: a READY decision it names beside it, and another draft\'s replacement, wait for READY', () => {
  const beside = standing(feeWorld([replaceAsk(['a/fee', 'b/fee', 'c/cap']), settling({ supersedes: ['a/fee', 'b/fee', 'c/cap'] })]));
  assert.deepEqual(beside, { 'a/fee': 'superseded', 'b/fee': 'superseded', 'c/cap': 'active', 'd/fee': 'active pending c/cap' });
  // a second conflict, of another key: the one answer names its lines too and ends the conflict of its own key only
  const all = ['a/fee', 'b/fee', 'c/cap', 'f/cap'];
  const two = standing([...feeWorld([replaceAsk(all), settling({ supersedes: all })]), plan('f', [line('cap', '7', 'Lee', { files: ['src/cap.js'] }), READY])]);
  assert.deepEqual([two['a/fee'], two['b/fee'], two['c/cap'], two['f/cap']], ['superseded', 'superseded', 'active conflict', 'active conflict']);
  const views = [...feeWorld([replaceAsk(['a/fee', 'b/fee']), settling({ supersedes: ['a/fee', 'b/fee'] })]),
    plan('e', [line('cap', '9', 'Lee', { supersedes: ['c/cap'], files: ['src/cap.js'] })])];
  const other = standing(views);
  assert.deepEqual([other['c/cap'], other['e/cap']], ['active', 'active pending c/cap'], 'a settling line frees no other draft');
});

test('a keep binds like a replacement: a draft\'s keeps nothing yet, a settling answer that keeps one line ends its conflict', () => {
  const keptBy = (views) => Object.fromEntries(validity(views).map((d) => [d.ref, d.kept?.plan ?? null]));
  assert.equal(keptBy(feeWorld([line('fee.kept', '100', 'Mark', { keeps: ['a/fee'], ...FILES })]))['a/fee'], null, 'a draft keeps nothing yet');
  const took = feeWorld([replaceAsk(['a/fee', 'b/fee']), line('fee.kept', '100', 'Mark', { answers: 'Q1', keeps: ['a/fee'], supersedes: ['b/fee'], ...FILES })]);
  assert.deepEqual([standing(took)['a/fee'], standing(took)['b/fee']], ['active', 'superseded'], 'under a key of its own, the answer that keeps Mark\'s line ends the conflict');
});

test('a draft set aside binds nothing and is no rival; a plan that was built and then set aside stands as it did', () => {
  const change = line('cap', '9', 'Lee', { supersedes: ['c/cap'], files: ['src/cap.js'] });
  const ASIDE = { t: 'aside', by: 'Lee', said: 'drop it' };
  assert.equal(standing(feeWorld([change]))['c/cap'], 'active', 'a draft: pending');
  assert.deepEqual(standing(feeWorld([change], [ASIDE])), { 'a/fee': 'active conflict', 'b/fee': 'active conflict', 'c/cap': 'active', 'd/cap': 'set aside' },
    'the draft set aside replaces nothing, waits for nothing and makes no conflict');
  assert.equal(standing(feeWorld([change], [READY, ASIDE]))['c/cap'], 'superseded', 'built first: what it decided is in the code');
});

test('a replaced line says whose words replaced it: the one who said them, relayed by who recorded them', () => {
  const change = line('cap', '9', 'Lee', { saidBy: 'Olivia', said: 'the cap is 9 now', supersedes: ['c/cap'], files: ['src/cap.js'] });
  const old = validity(feeWorld([change], [READY])).find((d) => d.ref === 'c/cap');
  assert.equal(replacedBy(old), ' by d/cap (Olivia, relayed by Lee, 2026-11-02: "the cap is 9 now")');
  const own = validity(feeWorld([{ ...change, saidBy: undefined }], [READY])).find((d) => d.ref === 'c/cap');
  assert.equal(replacedBy(own), ' by d/cap (Lee, 2026-11-02: "the cap is 9 now")');
});
