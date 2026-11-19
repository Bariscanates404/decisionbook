// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. One record on one line, as every text of this package writes it; each value goes through kit's clip, so a
// committed value forges no line.
const { text: { lines: { filled, dayOf } } } = require('@atlasbound/kit');
const { WORDS, shortOf, SHOWN: { records: shown } } = require('../../contracts/codes.cjs');
const { isAi, isAnswered } = require('../../base/text.cjs');
const { DIR } = require('../../contracts/shapes.cjs');

const deciderOf = (by) => (isAi(by) ? 'the AI' : shown.by(by));
// a decision's age as every item handed says it: its day (not where its plan's line says `planDay`), who kept it since and when
const agedOf = (d, planDay = null) => `${d.at && dayOf(d.at) !== planDay ? `, ${dayOf(d.at)}` : ''}${d.kept ? `, kept by ${deciderOf(d.kept.by)} ${dayOf(d.kept.at)}` : ''}`;

/** By what a decision was replaced: that decision, who made it, when, and their own sentence; '' where none replaced it. */
const replacedBy = (d, { by, at, said } = d.replaced || {}) => (d.supersededBy
  ? ` by ${shown.supersededBy(d.supersededBy)} (${deciderOf(by)}, ${dayOf(at)}${said ? `: "${shown.quote(said)}"` : ''})` : '');

/** What a draft's decision replaces once READY, and what a person's answer keeps; '' where neither. */
const pendingOf = (d) => `${d.replacing?.length ? filled(WORDS.replacesPending, { refs: shown.replacing(d.replacing.join(', ')) }) : ''}${
  d.keeps?.length ? `, keeps ${shown.keeps(d.keeps.join(', '))}` : ''}`;

/** One line of a conflict: where it is in the file, whose it is (and whose answer was relayed), their words, the value, its source. */
const rivalLine = (o, many) => filled(WORDS.rivalLine, { line: o.line, of: many ? ` of ${o.plan}` : '', by: deciderOf(o.by), relayed: o.saidBy ? ` (relayed from ${shown.by(o.saidBy)})`
  : '', said: shown.said(o.said ?? ''), value: o.said === o.value ? '' : filled(WORDS.rivalValue, { value: shown.value(String(o.value)) }),
source: o.source ? ` (${shown.source(o.source)})` : '' });
/** In place of a decision whose key holds a conflict (core/web `rivals`): every line of it in file order, none said to hold, and the
 * one way out (the person's answer). Every reader of what holds says this instead of the decision. */
function rivalText(d) {
  const all = [...d.rivals, d].sort((a, b) => a.plan.localeCompare(b.plan) || a.line - b.line);
  const many = new Set(all.map((o) => o.plan)).size > 1; // a conflict across plans: each line says its plan
  return filled(WORDS.rivals, { n: all.length, where: many ? 'across plans' : 'in this plan', refs: JSON.stringify([...new Set(all.map((o) => o.ref))]),
    file: `${DIR}/${many ? '<plan>' : d.plan}.jsonl`, lines: all.map((o) => rivalLine(o, many)).join('; ') });
}

// a person's decision shows their own sentence beside the value an AI wrote of it, after its state: a long one hides no replacement
function decisionLine(d) {
  const scope = d.scope ? ` [${shown.scope(d.scope)}]` : '';
  if (d.rivals?.length) return `- ${shown.key(d.key)}${scope} ${rivalText(d)}`;
  const theirs = !isAi(d.by) && d.said && d.said !== d.value ? `; ${deciderOf(d.by)}: "${shown.said(d.said)}"` : '';
  const said = `${shown.value(d.value)} (${shown.why(d.why)}; by ${deciderOf(d.by)})`;
  const conflict = `${pendingOf(d)}${d.conflicts.length ? `, CONFLICT with ${shown.conflicts(d.conflicts.join(', '))}` : ''}`;
  const touched = Number.isInteger(d.touched) ? filled(WORDS.touchedSince, { n: d.touched }) : '';
  return `- ${shown.key(d.key)}${scope} = ${said} ${d.state}${d.state === 'superseded' ? replacedBy(d) : ''}${conflict}${theirs}${touched}`;
}

/** A settled decision as a new session reads it: a person's with their own sentence (and the value where it says something else),
 * the AI's marked as no person's; one replaced since says so. */
function settledLine(d) {
  if (d.rivals?.length) return `- ${shown.key(d.key)} ${rivalText(d)}`;
  const conflict = `${d.supersededBy ? `, replaced${replacedBy(d)}` : ''}${d.conflicts.length ? `, CONFLICT with ${shown.conflicts(d.conflicts.join(', '))}` : ''}`;
  if (isAi(d.by) || !d.said) return `- ${shown.key(d.key)} = ${shown.valueAlone(d.value)} (${shown.why(d.why)}; by ${deciderOf(d.by)}${agedOf(d)})${conflict}`;
  const value = d.value === d.said ? '' : ` = ${shown.value(d.value)}`; // their own words are the value
  return `- ${shown.key(d.key)}${value}; ${deciderOf(d.by)}${agedOf(d)}: "${shown.said(d.said)}"${conflict}`;
}

/** What the research found, with where. */
const findingLine = (r) => `- ${shown.answer(r.answer)}${r.source ? ` (${shown.findingSource(r.source)})` : ''}`;

function stepLine(s) {
  const after = s.after === null ? '' : `, after ${s.after}`;
  return `- step ${s.order} ${shown.file(s.file)}${after}: ${shown.change(s.change)} (verify ${shown.verify(s.verify)})`;
}

/** A gap item a plan recorded: how it was closed (evidence, asked, na), its text and what it cites. */
function gapLine(g) {
  const question = g.q ? ` ${shown.q(g.q)}` : '';
  const source = g.source ? ` (${shown.source(g.source)})` : '';
  const run = g.run ? ` (run: ${shown.run(g.run)})` : '';
  return `gap ${g.gap}: ${g.status}${question}: ${shown.text(g.text)}${source}${run}`;
}

function linkLine(l) {
  const why = l.why ? `: ${shown.linkWhy(l.why)}` : '';
  return `- ${shown.from(l.from)} ${shown.rel(l.rel)} ${shown.to(l.to)}${why}`;
}

const openQuestionLines = (view) => view.questions.filter((q) => !q.to && !isAnswered(view, q))
  .map((q) => `- ${shown.q(q.q)}: ${shown.question(q.text)}`);

/** The questions parked with someone else and not answered yet, under their heading: said at every session start. */
function parkedLines(view) {
  const waiting = view.questions.filter((q) => q.to && !isAnswered(view, q))
    .map((q) => `- ${shown.q(q.q)} for ${shown.parkedWith(q.to)}: ${shown.parked(q.text)}${q.source ? ` (from ${shown.source(q.source)})` : ''}`);
  return waiting.length ? [WORDS.parkedWith, ...waiting] : [];
}

/** The records that changed the plan after the person saw it: a count and their kinds, or nothing. */
function amendedText(kinds) {
  if (!kinds.length) return '';
  return filled(WORDS.amendedAfter, { n: kinds.length, kinds: shown.kinds([...new Set(kinds)].join(', ')) });
}
/** The person's yes as a list of one line, or of none when the plan holds no yes. */
function confirmLines(confirm, amended = []) {
  if (!confirm) return [];
  const unverified = confirm.here === false ? ` ${WORDS.yesUnverified}` : ''; // a line no receipt here backs: hand-added, or another machine's
  return [`confirmed by ${shown.by(confirm.by)}: ${shown.quote(confirm.said)}${unverified}${amendedText(amended)}`];
}

function assumptionLine(a) {
  const question = a.q ? ` for ${shown.q(a.q)}` : '';
  return `- ${shown.text(a.text)} (${shown.why(a.why)})${question}`;
}

/** What a close recorded as the plan's own, as `close` and `show` count it. */
const shippedCounts = (c) => filled(WORDS.shippedCounts, { own: c.own.length, files: c.files.length, tests: c.tests.length });

/** A plan's contract link, as the write, READY and show say it. */
const planContractLine = (link) => filled(WORDS.contractPlan, { line: link.why, from: link.source });

/** The level in force; when it is not the one proposed, why, with the signals that raised it. */
function levelLine(level) {
  if (!level.code) return `level: ${WORDS.levels[level.level]}`;
  const signals = level.signals.length ? `: ${shown.signals(level.signals.join(', '))}` : '';
  const proposed = `proposed ${WORDS.levels[level.proposed]}: ${shortOf(level.code)}${signals}`;
  return `level: ${WORDS.levels[level.level]} (${proposed})`;
}

module.exports = { deciderOf, agedOf, replacedBy, rivalText, decisionLine, settledLine, findingLine, stepLine, gapLine,
  linkLine, openQuestionLines, parkedLines, amendedText, confirmLines, assumptionLine, shippedCounts, planContractLine, levelLine };
