// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What `inbox` says: what waits for the person on this branch, then in the plans pulled from other branches, one line each, on one
// screen.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, SHOWN: { inbox: shown }, branchWord } = require('../../contracts/codes.cjs');
const { boundedLines } = require('./budget.cjs');
const { jsonCall } = require('./calls.cjs');
const { rivalText, parkedText, putOffSaid } = require('./records.cjs');

const INBOX_BYTES = 3072;
const WAITING = {
  question: (r) => `${shown.q(r.q)}: ${r.conflict ? rivalText(r.conflict) : `${shown.text(r.text)}${r.proposal ? filled(WORDS.inboxProposed,
    { proposal: shown.proposal(r.proposal) }) : ''}${putOffSaid(r.later)}`}`,
  parked: parkedText,
  ready: (r) => filled((r.unsealed && WORDS.inboxUnsealed) || (r.held ? WORDS.inboxHeld : WORDS.inboxReady),
    { id: r.id, title: shown.title(r.title), held: r.held && WORDS.held[r.heldBy].title }),
  aside: (r) => filled(WORDS.inboxAside, { title: shown.title(r.title), by: shown.by(r.asideBy), said: shown.said(r.said) }),
};
const pulledFrom = (r) => (r.by === undefined ? '' : ` on ${shown.branch(branchWord(r.branch))}${r.by ? ` by ${shown.by(r.by)}` : ''}`);
/** How many rows wait on each thing, and the open items among them (an unfinished merge, a lost plan) where there are any. */
function waitCounts(rows) {
  const items = rows.filter((r) => r.line).length;
  const count = (waits) => [waits, rows.filter((r) => r.waits === waits).length];
  return { ...Object.fromEntries(Object.keys(WAITING).map(count)), items: items ? filled(WORDS.inboxItems, { n: items }) : '' };
}
const inboxLine = (r) => r.line ?? `- ${r.id}${pulledFrom(r)} ${WAITING[r.waits](r)}`; // an open item's line names its plan itself

/** This branch's rows under their counts (or the line that none waits), then the pulled ones under theirs. */
function inboxText({ branch, here, pulled }) {
  const parts = [[here.length ? WORDS.inboxHere : WORDS.inboxNone, here], ...(pulled.length ? [[WORDS.inboxPulled, pulled]] : [])];
  const said = shown.branch(branchWord(branch));
  const [head, ...list] = parts.flatMap(([words, rows]) => [filled(words, { branch: said, ...waitCounts(rows) }),
    ...rows.map(inboxLine)]);
  return boundedLines({ head: [head], list, tail: [], max: INBOX_BYTES, more: jsonCall('inbox') }).join('\n');
}

module.exports = { inboxText };
