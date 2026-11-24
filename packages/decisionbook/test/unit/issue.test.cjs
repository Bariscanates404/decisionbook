// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The issue a piece of work starts from, as a table: what a person's message or a branch names, and the issue a new plan is linked
// to (null: none). A number named any other way than as the work links nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const { issuesIn, startIssue } = require('../../core/issue.cjs');

const ORIGIN = 'git@github.com:acme-example/shop.git';
const SHOP = 'https://github.com/acme-example/shop';

// [the person's message, the issue linked]
const MESSAGES = [
  ['Get issue #12 and let\'s develop it', 12],
  [`Please do ${SHOP}/issues/12`, 12],
  ['fix #12 and #13', null],
  ['Review PR #12 and apply its idea to the export', null],
  [`Apply what ${SHOP}/pull/12 did to the export`, null],
  ['see step #3 of the doc and add the export', null],
  ['Port this to C# 12 style', null],
  ['Port this to C#12 style', null],
  ['Add #12abc tag support', null],
  ['the #1 priority is speed: make export fast', null],
  ['use colour #123456 for the button', null],
  ['build version #2 of the design', null],
  ['work on issue 12 please', 12],
  ['do GH-12', 12],
  ['do JIRA ABC-12', null],
  ['do #0', null],
  [`see ${SHOP}/blob/main/a.js#L12 and make export like it`, null],
  ['# 12 things to fix in the export', null],
  ['Get issue #12; it duplicates #12', 12],
  ['Not #12, that one is closed. Just add an export.', null],
  ['Add the export. Unrelated: I closed #99 yesterday.', null],
  ['bump to v1.2 (#345)', null],
  [`issue #12, see also ${SHOP}/issues/12#issuecomment-99887766`, 12],
  ['ticket &#35;12 and room #7 booking page', null],
  ['do #13', 13],
  ['fix #13 and #14', null],
  // more forms
  ['Add a CSV export to the report page', null],
  ['Let\'s work on #45: the export is slow', 45],
  ['Working on #45 today, start with the tests', 45],
  ['Implement issue #7, the one about rounding', 7],
  ['Issue 7: totals round wrong. Fix it.', 7],
  ['Closes #88', 88],
  ['resolve #5, #6 and #7 in one go', null],
  ['take issues #5 and 6', null],
  ['Not issue #12, that one is closed. Just add an export.', null],
  ['do not fix #12 yet, only read the code', null],
  ['this is unlike issue #9: no migration here', null],
  ['https://github.com/other-team/shop/issues/12 looks similar, port the idea', null],
  ['Do https://gitlab.example/acme-example/shop/issues/31', 31],
  [`[the ticket](${SHOP}/issues/64) is ready, go`, 64],
  [`${SHOP}/issues/64 and ${SHOP}/issues/65 belong together`, null],
  [`${SHOP}/issues/64#issuecomment-1 has Emma's answer`, 64],
  [`${SHOP}/issues?q=is%3Aopen has the list`, null],
  [`${SHOP}/pull/12/files shows how`, null],
  ['run `fix #12` in the changelog generator', null],
  ['the build is at #4521 on CI, make it green', null],
  ['we have 12 issues open, tidy the list page', null],
  ['top 10 issues: build a page that lists them', null],
  ['issue #12abc is not a number', null],
  ['tissue #5 box label is wrong', null],
  ['after 5 pm deploy fix #1234567 goes out', 1234567],
  ['fix #12345678 overflow', null],
  ['Commit 3f2a1b9 broke #12 handling in the parser', null],
  ['rename heading "## 3. Setup" to "#3 Setup"', null],
  ['room #7 booking page needs a title', null],
  ['GH-12 and GH-13 are the same bug, fix both', null],
  ['see acme-example/shop#12 for the background', null],
];

// [the branch, the issue linked]
const BRANCHES = [
  ['issue-12', 12], ['feat/12-export', null], ['release/2026-11', null], ['fix/404-page', null], ['hotfix/v2-12', null],
  ['dependabot/npm/foo-12.1.0', null], ['feature/2fa-login', null], ['bugfix/issue_7', 7], ['gh-33-thing', 33],
  ['user/mark/3-columns', null], ['chore/2026-11-cleanup', null], ['feat/3d-view', null], ['fix/500_error', null], ['issues/12', 12],
  ['12-export', null], ['tissue-5-box', null],
  // more forms
  ['main', null], [null, null], ['fix/gh-12-export', 12], ['feature/issue-7-rounding', 7], ['ISSUE-9', 9], ['issue12', 12],
  ['issue-0', null], ['issue-12.1', null], ['fix/issue-export', null], ['mark/gh33', 33], ['high-5', null], ['release/v1.2.3', null],
  ['renovate/node-22.x', null], ['feat/issues-page', null],
];

test('a message links the one issue it names as the work, and nothing for a number named any other way', () => {
  for (const [message, issue] of MESSAGES) {
    const linked = startIssue(issuesIn(message, ORIGIN).issues, 'main');
    assert.deepEqual(linked, issue === null ? null : { issue, from: 'message' }, message);
  }
});

test('a branch links the number after `issue` or `gh`, and no bare number', () => {
  for (const [branch, issue] of BRANCHES) {
    assert.deepEqual(startIssue([], branch), issue === null ? null : { issue, from: 'branch' }, String(branch));
  }
});

test('an issue\'s address counts only for this repository, whatever form its remote has; with no remote, none does', () => {
  const address = `Please do ${SHOP}/issues/12`;
  for (const remote of [ORIGIN, `${SHOP}.git`, SHOP, `${SHOP}/`, 'ssh://git@github.com/Acme-Example/Shop.git']) {
    assert.deepEqual(issuesIn(address, remote).issues, [12], remote);
  }
  for (const remote of [null, '', '/srv/git/shop.git', 'git@github.com:acme-example/shop-web.git', 'git@github.com:fork/shop.git']) {
    assert.deepEqual(issuesIn(address, remote).issues, [], String(remote));
  }
  assert.deepEqual(issuesIn(`issue #12, not ${SHOP}/issues/40`, null).issues, [12], 'the words still name theirs');
});

test('the message\'s issue comes before the branch\'s, and several in the message leave the branch unread', () => {
  assert.deepEqual(startIssue([13], 'issue-12'), { issue: 13, from: 'message' });
  assert.equal(startIssue([13, 14], 'issue-12'), null, 'nothing is guessed among several');
});
