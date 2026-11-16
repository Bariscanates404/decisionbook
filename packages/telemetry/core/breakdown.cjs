// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Counts split by closed words, pure over the rules; the latest row of a declared state is the state (never summed with an earlier one);
// an unlisted word leaves as `other`.
const { trace: { VERDICTS } } = require('@atlasbound/kit');
const { CODES_EVENT, DECISIONS, wireWord } = require('../contracts/rules.cjs');
const { closedWord, dimsOf, tallyEvent, boundedEvents } = require('../contracts/helpers.cjs');

const VERDICT = /^decision_(.+)$/u;

// A state row's count name is `<event>|<word of each field>|<band>`, in the order the event declares its fields.
function stateName(name, { EVENT_RULES, FORMS }) {
  const [event, ...parts] = name.split('|');
  const dims = FORMS.stated.includes(event) ? dimsOf(EVENT_RULES[event]) : null;
  if (!dims || parts.length !== dims.length + 1) return null;
  return { event, words: Object.fromEntries(dims.map(([dim, words], i) => [dim, closedWord(words, parts[i])])), name: parts.at(-1) };
}

// A totals event (`totalOf`) adds up the bands it names of the state it totals, over every word.
function stateEvents(rows, rules) {
  const last = rows.reduce((latest, row) => (!latest || row.at >= latest.at ? row : latest), null);
  const buckets = new Map();
  for (const [name, count] of Object.entries(last ? last.n : {})) {
    const named = stateName(name, rules);
    if (named) tallyEvent(buckets, { ...named, at: last.at, count });
    rules.FORMS.totals.filter(([total, of]) => named?.event === of && Object.hasOwn(rules.EVENT_RULES[total].enums, named.name))
      .forEach(([total]) => tallyEvent(buckets, { event: total, at: last.at, words: {}, name: named.name, count }));
  }
  return boundedEvents(buckets);
}

// Per day, package, step and code: how often a step said it and failed with it; never an error's message.
function codesOf(rows, { EVENT_RULES }) {
  const buckets = new Map();
  const { code: words } = EVENT_RULES[CODES_EVENT].enums;
  const tally = (row, code, name, count) => tallyEvent(buckets,
    { event: CODES_EVENT, at: row.at, words: { pkg: row.pkg, step: wireWord(row.step), code: closedWord(words, code) }, name, count });
  for (const row of rows) {
    Object.entries(row.codes || {}).forEach(([code, count]) => tally(row, code, 'codes', count));
    if (!row.ok && row.err) tally(row, row.err.code, 'failures', 1);
  }
  return boundedEvents(buckets);
}

const decidedOf = (row) => Object.keys(row.n).map((name) => VERDICT.exec(name)?.[1]).find((word) => VERDICTS.includes(word));
const whyOf = ({ codes = {} }) => (Object.keys(codes).length === 1 ? Object.keys(codes)[0] : 'other');

function decisionsOf(rows, { EVENT_RULES }) {
  const buckets = new Map();
  const { verdict: verdicts, code: codeWords } = EVENT_RULES[DECISIONS].enums;
  for (const [row, verdict] of rows.map((one) => [one, decidedOf(one)]).filter(([, said]) => said)) {
    const words = { pkg: row.pkg, step: wireWord(row.step), verdict: closedWord(verdicts, verdict),
      code: closedWord(codeWords, whyOf(row)) };
    tallyEvent(buckets, { event: DECISIONS, at: row.at, words, name: 'decisions', count: 1 });
  }
  return boundedEvents(buckets);
}

module.exports = { stateEvents, codesOf, decisionsOf };
