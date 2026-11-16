// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. One record on one line, as every text of this package writes it; each value goes through kit's clip, so a
// committed value forges no line.
const { text: { safe: { clip }, lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, shortOf } = require('../../contracts/codes.cjs');
const { isAi, isAnswered } = require('../../base/text.cjs');

const deciderOf = (by) => (isAi(by) ? 'the AI' : clip(by, 40));

// a person's decision shows their own sentence beside the value an AI wrote of it, so a summary cannot drop a part of it
function decisionLine(d) {
  const scope = d.scope ? ` [${clip(d.scope, 40)}]` : '';
  const theirs = !isAi(d.by) && d.said && d.said !== d.value ? `; ${deciderOf(d.by)}: "${clip(d.said, 240)}"` : '';
  const said = `${clip(d.value, 100)} (${clip(d.why, 80)}; by ${deciderOf(d.by)})${theirs}`;
  const replacedBy = d.supersededBy ? ` by ${clip(d.supersededBy, 120)}` : '';
  const conflict = d.conflicts.length ? `, CONFLICT with ${clip(d.conflicts.join(', '), 200)}` : '';
  const touched = Number.isInteger(d.touched) ? `; ${d.touched} commits touched its files since` : '';
  return `- ${clip(d.key, 80)}${scope} = ${said} ${d.state}${replacedBy}${conflict}${touched}`;
}

/** A settled decision as a new session reads it: a person's with their own sentence (and the value where it says something else),
 * the AI's marked as no person's. */
function settledLine(d) {
  const conflict = d.conflicts.length ? `, CONFLICT with ${clip(d.conflicts.join(', '), 200)}` : '';
  if (isAi(d.by) || !d.said) return `- ${clip(d.key, 80)} = ${clip(d.value, 160)} (${clip(d.why, 80)}; by ${deciderOf(d.by)})${conflict}`;
  // their own words are the value; a yes kept in their words says what it was a yes to (its why)
  const value = d.value === d.said ? '' : ` = ${clip(d.value, 100)}`;
  const yesTo = (d.value === d.said && d.why.startsWith(WORDS.boundYes.split('{')[0])) || d.why === WORDS.boundWhole ? ` (${clip(d.why, 260)})` : '';
  return `- ${clip(d.key, 80)}${value}; ${deciderOf(d.by)}: "${clip(d.said, 240)}"${yesTo}${conflict}`;
}

/** What the research found, with where. */
const findingLine = (r) => `- ${clip(r.answer, 160)}${r.source ? ` (${clip(r.source, 80)})` : ''}`;

function stepLine(s) {
  const after = s.after === null ? '' : `, after ${s.after}`;
  return `- step ${s.order} ${clip(s.file, 120)}${after}: ${clip(s.change, 200)} (verify ${clip(s.verify, 80)})`;
}

/** A gap item a plan recorded: how it was closed (evidence, asked, na), its text and what it cites. */
function gapLine(g) {
  const question = g.q ? ` ${clip(g.q, 40)}` : '';
  const source = g.source ? ` (${clip(g.source, 120)})` : '';
  const run = g.run ? ` (run: ${clip(g.run, 120)})` : '';
  return `gap ${g.gap}: ${g.status}${question}: ${clip(g.text, 160)}${source}${run}`;
}

function linkLine(l) {
  const why = l.why ? `: ${clip(l.why, 160)}` : '';
  return `- ${clip(l.from, 120)} ${clip(l.rel, 40)} ${clip(l.to, 160)}${why}`;
}

const openQuestionLines = (view) => view.questions.filter((q) => !q.to && !isAnswered(view, q))
  .map((q) => `- ${clip(q.q, 40)}: ${clip(q.text, 100)}`);

/** The questions parked with someone else and not answered yet, under their heading: said at every session start. */
function parkedLines(view) {
  const waiting = view.questions.filter((q) => q.to && !isAnswered(view, q))
    .map((q) => `- ${clip(q.q, 40)} for ${clip(q.to, 60)}: ${clip(q.text, 200)}${q.source ? ` (from ${clip(q.source, 120)})` : ''}`);
  return waiting.length ? [WORDS.parkedWith, ...waiting] : [];
}

/** The records that changed the plan after the person saw it: a count and their kinds, or nothing. */
function amendedText(kinds) {
  if (!kinds.length) return '';
  return `; amended after the yes: ${kinds.length} (${clip([...new Set(kinds)].join(', '), 80)})`;
}
/** The person's yes as a list of one line, or of none when the plan holds no yes. */
function confirmLines(confirm, amended = []) {
  if (!confirm) return [];
  return [`confirmed by ${clip(confirm.by, 40)}: ${clip(confirm.said, 160)}${amendedText(amended)}`];
}

function assumptionLine(a) {
  const question = a.q ? ` for ${clip(a.q, 40)}` : '';
  return `- ${clip(a.text, 160)} (${clip(a.why, 80)})${question}`;
}

/** What a close recorded as the plan's own, as `close` and `show` count it. */
const shippedCounts = (c) => `${c.own.length} own commits, ${c.files.length} files, ${c.tests.length} tests`;

/** A plan's contract link, as the write, READY and show say it. */
const planContractLine = (link) => filled(WORDS.contractPlan, { line: link.why, from: link.source });

/** The level in force; when it is not the one proposed, why, with the signals that raised it. */
function levelLine(level) {
  if (!level.code) return `level: ${WORDS.levels[level.level]}`;
  const signals = level.signals.length ? `: ${clip(level.signals.join(', '), 120)}` : '';
  const proposed = `proposed ${WORDS.levels[level.proposed]}: ${shortOf(level.code)}${signals}`;
  return `level: ${WORDS.levels[level.level]} (${proposed})`;
}

module.exports = { deciderOf, decisionLine, settledLine, findingLine, stepLine, gapLine, linkLine, openQuestionLines, parkedLines,
  amendedText, confirmLines,
  assumptionLine, shippedCounts, planContractLine, levelLine };
