// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What a writing verb answers: what it started and recorded and the state it left the plan in, so no show or
// ready call follows a write; `ready` answers the state alone; `close`, what shipped.
const { text: { safe: { clip }, lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, shortOf } = require('../../contracts/codes.cjs');
const { shippedCounts, planContractLine, levelLine } = require('./records.cjs');
const { readyLines } = require('./ready.cjs');

const RISEN = ['level-raised', 'level-micro-rejected'];

/** A new plan judged above the level it proposed, or a READY plan that outgrew its level: the reply says why first. */
function hasRisen({ file, state }) {
  if (!state || !RISEN.includes(state.level.code)) return false;
  return Boolean(file || (state.was && state.was !== state.level.level));
}

function recordedLine(o) {
  const what = o.records > 1 ? `${o.records} records recorded (${o.t})` : `${o.t} recorded`;
  return `${o.id}: ${what}`;
}

/** The earlier plans this write was linked to because the session read them, then what such a link is. */
function linkedLines(o) {
  if (!o.linked.length) return [];
  return [...o.linked.map((l) => `built-on ${l.id}: ${l.why}`), WORDS.linked];
}

function reusedLine(d) {
  const scope = d.scope ? ` [${d.scope}]` : '';
  return `  ${d.ref}${scope} = ${d.value}`;
}
/** The decisions that already stand on the files a written record names. */
const reuseLines = (o) => (o.existing.length ? [WORDS.reuse, ...o.existing.map(reusedLine)] : []);

/** The decisions a sender signed for a person and the product stored as the AI's, each with why and the one thing that makes it theirs. */
const asAiLines = (o) => ((o.asAi || []).length ? [WORDS.asAi.head,
  ...o.asAi.map(({ key, q, why, items = [] }) => `  ${filled(WORDS.asAi[why], { key: clip(key, 80), q: clip(q || WORDS.thePlan, 40), items: items.join(' and ') })}`)] : []);

/** The reply of `new`, `add` and `ready`; a contract the write took on comes before what it recorded. */
function writtenText(o) {
  const risen = hasRisen(o) ? [levelLine(o.state.level)] : [];
  const contracts = (o.contracts || []).map(planContractLine);
  const started = o.file ? [`${o.id} started: ${o.file}`] : [];
  const pointers = (o.pointers || []).length ? [filled(WORDS.pointerKept, { tools: clip([...new Set(o.pointers)].join(', '), 200) })] : [];
  const recorded = o.records ? [recordedLine(o), ...pointers, ...asAiLines(o), ...linkedLines(o), ...reuseLines(o)] : [];
  return [...risen, ...contracts, ...started, ...recorded, ...readyLines(o.state || o)].join('\n');
}

/** What the product bound of a person's message, for the AI to check against what it read: the questions their message answered,
 * the ones it left open, and the state the plan is in now. Their words are in the message itself, so none are said again. */
function boundLines({ id, bound, open, state }) {
  const waits = open.length ? [filled(WORDS.boundOpen, { qs: open.join(', ') })] : [];
  return [filled(WORDS.bound, { id, qs: bound.join(', ') }), ...waits, ...readyLines(state)].join('\n');
}

function closedText(o) {
  if (o.code === 'plan-close-empty') return `${o.id}: ${shortOf(o.code)}`;
  return `${o.id} closed: ${shippedCounts(o)}; ${o.other} other commits not attributed`;
}

module.exports = { writtenText, boundLines, closedText };
