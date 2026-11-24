// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The issue a piece of work starts from, read only where the person names it as the work. In a message: the word `issue` before
// the number (`issue #12`, `issue 12`), `GH-12`, a `#12` right after a verb of work (`fix #12`), each with the numbers listed after it
// (`fix #12 and #13`), and the address of an issue of this repository. In a branch: the number after `issue` or `gh` (`issue-12`,
// `fix/gh-12-export`). A number named any other way is no issue here: a pull request, a step, a colour, a count, a version, a date, a
// status code, a line of a file, quoted code, another repository's issue, one the sentence says it is not. An issue right after a verb
// of work (`fix #12`, `get issue #12 done`) is named as the task; any other naming may be a mention ("how issue #3 did it"), so the
// task's issue is read before a mention's. A new plan is linked only where one issue is named so: nothing is guessed among several,
// and nothing from a number alone.
const NUMBER = '([1-9]\\d{0,6})(?![\\d\\p{L}])';
const VERBS = 'fix(?:es)?|closes?|resolves?|implement|do|get|take|start|develop|tackle|continue|finish|work(?:ing)? on';
const NOT = '(?<!\\b(?:not?|never|unlike|except|without)\\s+(?:the\\s+)?)'; // "not issue #12": named as what the work is not
const LISTED = `${NUMBER}((?:\\s*(?:,|and|&|or)\\s*#?${NUMBER})*)`;
const NAMED = new RegExp(`${NOT}(?<![\\p{L}\\p{N}_/-])(?:issues?\\s*#?|gh-|(?:${VERBS})\\s+#)${LISTED}`, 'giu');
const TASK = new RegExp(`${NOT}(?<![\\p{L}\\p{N}_/-])(?:${VERBS})\\s+(?:(?:the|this|that)\\s+)?(?:issues?\\s*#?|gh-|#)${LISTED}`, 'giu');
const ADDRESS = new RegExp(`[\\w.-]+/([\\w.-]+/[\\w.-]+)/issues/${NUMBER}`, 'giu');
const IN_BRANCH = new RegExp(`(?:^|[-_/])(?:issues?|gh)[-_/]?${NUMBER}(?![.])`, 'iu');

/** Whether a text holds an issue's address, so its reader asks git which repository this is. */
const hasAddress = (text) => text.includes('/issues/');
/** The repository a remote's address names, `<account>/<name>` in lower case; null where it names none. */
const repoNamed = (remote) => /([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/u.exec(remote ?? '')?.[1].toLowerCase() ?? null;

/** The issues a message names, each once, in the order named: `issues` every one, `task` the ones named right after a verb of work
 * (its task, whatever else it mentions). `remote`: this clone's origin, or null: an address counts only where it is an issue of
 * that repository. -> { issues: [n], task: [n] } */
function issuesIn(message, remote = null) {
  const text = message.replace(/`[^`]*`/g, ' ');
  const [named, task] = [NAMED, TASK].map((how) => [...text.matchAll(how)]
    .map((found) => [found.index, `${found[1]} ${found[2]}`.match(/\d+/g).map(Number)]));
  const addressed = [...text.matchAll(ADDRESS)].filter((found) => found[1].toLowerCase() === repoNamed(remote))
    .map((found) => [found.index, [Number(found[2])]]);
  const inOrder = (hits) => [...new Set(hits.sort(([x], [y]) => x - y).flatMap(([, issues]) => issues))];
  return { issues: inOrder([...named, ...addressed]), task: inOrder(task) };
}

/** `named`: the issues of the first message that named any as its task since this session last started a plan, else of the first that
 * named any ([] where none did); `branch`: HEAD's branch, or null. -> { issue, from: 'message' | 'branch' } | null */
function startIssue(named, branch) {
  if (named.length) return named.length === 1 ? { issue: named[0], from: 'message' } : null;
  const found = IN_BRANCH.exec(branch ?? '');
  return found ? { issue: Number(found[1]), from: 'branch' } : null;
}

module.exports = { issuesIn, hasAddress, startIssue };
