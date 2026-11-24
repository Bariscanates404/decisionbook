// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The reading verbs in DecisionBook's own words: what why, inbox and pr say over the rows they are handed, and the place `why` reads.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verbs } = require('@atlasbound/decisionbook');
const { whyText } = require('../../core/text/why.cjs');
const { inboxText } = require('../../core/text/inbox.cjs');
const { prText } = require('../../core/text/pr.cjs');
const { WORDS } = require('../../contracts/codes.cjs');
const { keptOtherValue } = require('../../core/text/refused.cjs');
const { bookWorld } = require('../../contract/world.cjs');

const SHA = '0123456789abcdef0123456789abcdef01234567';

test('why says a file git does not hold, a line not committed, and a commit no closed plan lists, each in its own words', () => {
  assert.equal(whyText({ file: 'lib/a.js', line: 3, held: false, commits: [] }), 'lib/a.js:3: git holds no such file here, so no commit and no plan says why');
  assert.equal(whyText({ file: 'lib/a.js', line: null, held: true, commits: [{ sha: null, plans: [] }] }), 'lib/a.js: not committed yet, so no plan shipped it');
  const said = whyText({ file: 'lib/a.js', line: null, held: true, commits: [{ sha: SHA, subject: 'round it', plans: [] }, { sha: null, plans: [] }] });
  assert.deepEqual(said.split('\n'), ['lib/a.js: commit 01234567 "round it"', WORDS.whyNone, WORDS.whyOpenLines]);
});

test('inbox: a line that none waits, or the counts and a line per row as the step orders them; pulled ones by branch, author', () => {
  assert.equal(inboxText({ branch: 'main', here: [], pulled: [] }), 'Nothing waits for you on main.');
  const here = [{ id: 'p2', waits: 'aside', title: 'Old', asideBy: 'Mark', said: 'later' }, { id: 'p1', waits: 'question', q: 'Q1', text: 'CSV?', proposal: 'yes' }];
  const pulled = [{ id: 'p3', waits: 'ready', title: 'Import', branch: 'feat/x', by: 'Lee' }];
  assert.deepEqual(inboxText({ branch: 'main', here, pulled }).split('\n'), [
    'Waiting for you on main: open questions 1, questions parked with someone 0, READY plans not closed 0, set aside 1', '- p2 set aside: Old (Mark: "later")',
    '- p1 Q1: CSV? (proposed: yes)', 'Pulled from other branches: open questions 0, questions parked with someone 0, READY plans not closed 1, set aside 0',
    '- p3 on feat/x by Lee READY, not closed: Import']);
});

test('pr: no plan names the branch and the call; a plan with no commit it began on says its commits are not measured', () => {
  assert.equal(prText({ branch: 'feat/x', plans: [] }), 'No plan on feat/x to describe: atlasbound decisionbook pr <id> names one.');
  const said = prText({ branch: 'feat/x', plans: [{ id: 'p1', state: 'draft', title: 'Export', why: 'slow', open: [], decisions: [], checks: [], commits: null }] });
  assert.deepEqual(said.split('\n'), ['## Export', '', 'Plan `p1` (draft)', '**Why:** slow', '', WORDS.prCommits, WORDS.prUnmeasured, '', WORDS.prFoot]);
});

test('why reads <file>[:<line>]: :3 is line 3, a file git lacks is said so; line 0, no word, a path outside: its usage', async () => {
  const io = bookWorld({ files: { 'lib/a.js': 'one\ntwo\nthree\n' } });
  const asked = [];
  io.git.blame = async (file, line) => (asked.push([file, line]), [{ sha: SHA, subject: 'add a', line }]);
  const three = (await verbs.why(io, { rest: ['lib/a.js:3'] })).out;
  assert.deepEqual([three.file, three.line, three.held, asked], ['lib/a.js', 3, true, [['lib/a.js', 3]]]);
  assert.equal((await verbs.why(io, { rest: ['lib/b.js:3'] })).out.held, false);
  for (const rest of [['lib/a.js:0'], [], ['../outside.js:1']]) await assert.rejects(verbs.why(io, { rest }), { code: 'plan-args' }, rest.join(' '));
});

test('the refusal of a keep of another value hands the kept value whole, with no hidden character raw', () => {
  const long = 'x'.repeat(200); // past every reader's cut
  const [code, detail] = keptOtherValue({ ref: 'plan/fee', value: `100\u202e TL\u200b ${long}` });
  assert.deepEqual([code, detail.endsWith(`; the value to copy: "100\\u202e TL\\u200b ${long}"`)], ['keep-other-value', true], detail);
});
