// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What `why` says: per commit git blame named, the closed plans that shipped it with their decisions in the person's words and
// what replaced each since; a commit no plan lists, a line not committed yet and a file git does not hold, each in its own words.
const { text: { lines: { filled, shortSha } } } = require('@atlasbound/kit');
const { WORDS, SHOWN: { why: shown } } = require('../../contracts/codes.cjs');
const { decisionLine } = require('./records.cjs');
const { boundedLines } = require('./budget.cjs');
const { jsonCall } = require('./calls.cjs');

const WHY_BYTES = 6144;
const replacedLine = (n) => filled(WORDS.whyReplaced, { plan: n.plan, line: decisionLine(n).slice('- '.length) });
const shippedLines = (p) => [filled(WORDS.whyShipped, { id: p.id, state: p.state, title: shown.title(p.title) }), ...p.open,
  ...p.decisions.flatMap((d) => [decisionLine(d), ...d.then.map(replacedLine)])];

/** Each commit's line, then the plans that shipped it or the line that none does; lines not committed yet last. */
function whyText({ file, line, held, commits }) {
  const at = line ? `${file}:${line}` : file;
  if (!held) return filled(WORDS.whyUnheld, { at });
  const [head, ...list] = commits.filter((c) => c.sha).flatMap((c) => [filled(WORDS.whyCommit, { at, sha: shortSha(c.sha),
    subject: shown.subject(c.subject) }), ...(c.plans.length ? c.plans.flatMap(shippedLines) : [WORDS.whyNone])]);
  if (!head) return filled(WORDS.whyUncommitted, { at });
  const tail = commits.some((c) => !c.sha) ? [WORDS.whyOpenLines] : [];
  return boundedLines({ head: [head], list, tail, max: WHY_BYTES, more: jsonCall('why', at) }).join('\n');
}

module.exports = { whyText };
