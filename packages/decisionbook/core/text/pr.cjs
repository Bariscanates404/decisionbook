// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What `pr` prints: per plan a Markdown section of its records (goal, the decisions in the person's words and what they did not take,
// checks, commits), each value on its line through kit's clip; never a prompt or a chat.
const { text: { lines: { filled, shortSha } } } = require('@atlasbound/kit');
const { WORDS, SHOWN: { pr: shown }, branchWord } = require('../../contracts/codes.cjs');
const { isAi, isReplaced } = require('../../base/text.cjs');
const { deciderOf, rivalText } = require('./records.cjs');

const whose = (d) => (!isAi(d.by) && d.said ? ` (${deciderOf(d.by, d.author)}: "${shown.said(d.said)}")` : ` (by ${deciderOf(d.by, d.author)})`);
const decisionMd = (d) => (d.conflict ? [`- **${shown.key(d.key)}** ${rivalText(d.conflict)}`] : [`- **${shown.key(d.key)}**: ${shown.value(d.value)}${
  whose(d)}${isReplaced(d) ? filled(WORDS.prReplaced, { ref: shown.supersededBy(d.supersededBy) }) : ''}`,
...(d.proposedThen ? [`  - ${filled(WORDS.proposedThen, { proposal: shown.proposedThen(d.proposedThen) })}`] : [])]);
const criterionMd = (c) => `- ${shown.id(c.id)}: ${shown.text(c.text)}${c.command ? ` (\`${shown.command(c.command)}\`)` : ''}`;
function commitsMd(commits) {
  if (commits === null) return [WORDS.prUnmeasured];
  return commits.length ? commits.map((c) => `- ${shortSha(c.sha)} ${shown.subject(c.subject ?? '')}`.trimEnd()) : [WORDS.prNone];
}
const FIELDS = [['why', WORDS.prWhy], ['success', WORDS.prSuccess], ['goal', WORDS.prGoal]];
const parts = (p) => [[WORDS.prDecisions, p.decisions.flatMap(decisionMd)], [WORDS.prChecks, p.checks.map(criterionMd)]]
  .flatMap(([heading, lines]) => (lines.length ? ['', heading, ...lines] : []));

const planMd = (p) => [`## ${shown.title(p.title)}`, '', filled(WORDS.prPlan, { id: p.id, state: p.state }), ...p.open,
  ...FIELDS.filter(([field]) => p[field]).map(([field, words]) => filled(words, { [field]: shown[field](p[field]) })),
  ...parts(p), '', WORDS.prCommits, ...commitsMd(p.commits), ''];

/** Each plan's section, then the line that says where it came from; or that the branch holds no plan to describe. */
const prText = ({ branch, plans }) => (plans.length ? [...plans.flatMap(planMd), WORDS.prFoot].join('\n')
  : filled(WORDS.prEmpty, { branch: shown.branch(branchWord(branch)) }));

module.exports = { prText };
