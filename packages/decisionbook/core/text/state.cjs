// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What a writing verb answers: what it started and recorded and the state it left the plan in, so no show or
// ready call follows a write; `ready` answers the state alone; `close`, what shipped.
const { text: { lines: { filled, counted } } } = require('@atlasbound/kit');
const { WORDS, shortOf, SHOWN: { state: shown } } = require('../../contracts/codes.cjs');
const { DIR } = require('../../contracts/shapes.cjs');
const { shippedCounts, planContractLine, levelLine, rivalText } = require('./records.cjs');
const { readyLines } = require('./ready.cjs');

const RISEN = ['level-raised', 'level-micro-rejected'];

/** A new plan judged above the level it proposed, a READY plan that outgrew its level, or a plan told every row it misses (a `new`,
 * `ready`): the reply says why the level is what it is first, and the person's way to lower it where there is one. */
function hasRisen({ file, state }) {
  if (!state.level || !RISEN.includes(state.level.code)) return false;
  return Boolean(file || (state.was && state.was !== state.level.level) || (state.ready === false && !state.before));
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
  return d.conflict ? `  ${d.ref} ${rivalText(d.conflict)}` : `  ${d.ref}${scope} = ${d.value}`;
}
/** The decisions that already stand on the files a written record names. */
const reuseLines = (o) => (o.existing.length ? [WORDS.reuse, ...o.existing.map(reusedLine)] : []);

/** Each decision recorded as the person's, with the words stored and what it replaces or keeps: the AI sees in the same turn which
 * words of theirs stand behind it. */
const theirsLines = (o) => (o.theirs || []).map(({ key, said, replaces = [], keeps = [] }) => filled(WORDS.recordedTheirs, {
  key: shown.key(key), said: shown.said(said), replaces: replaces.length ? `, replaces ${shown.replaces(replaces.join(', '))}` : '',
  keeps: keeps.length ? `, keeps ${shown.keeps(keeps.join(', '))}` : '' }));

/** The reply of `new`, `add` and `ready`; a contract the write took on comes before what it recorded. */
function writtenText(o) {
  const state = o.state || o; // `ready` answers the state alone
  const risen = hasRisen({ file: o.file, state }) ? [levelLine(state.level)] : [];
  const contracts = (o.contracts || []).map(planContractLine);
  const started = o.file ? [`${o.id} started: ${o.file}`] : [];
  const pointers = (o.pointers || []).length ? [filled(WORDS.pointerKept, { tools: shown.pointers([...new Set(o.pointers)].join(', ')) })] : [];
  const recorded = o.records ? [recordedLine(o), ...pointers, ...theirsLines(o), ...linkedLines(o), ...reuseLines(o)] : [];
  return [...risen, ...contracts, ...started, ...recorded, ...readyLines(state)].join('\n');
}

function closedText(o) {
  if (o.code === 'plan-close-empty') return `${o.id}: ${shortOf(o.code)}`;
  const unplanned = o.unplanned ? `; ${filled(WORDS.closeUnplanned, { n: o.unplanned })}` : '';
  const commit = filled(WORDS.closeCommit, { id: o.id, file: `${DIR}/${o.id}.jsonl` });
  const other = counted(o.other, WORDS.otherUnit);
  return [filled(WORDS.closedLine, { id: o.id, counts: shippedCounts(o), other, unplanned, commit }), ...o.open].join('\n');
}

module.exports = { writtenText, closedText };
