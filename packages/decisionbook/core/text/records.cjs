// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. One record on one line, as every text of this package writes it; each value goes through kit's clip, so a
// committed value forges no line.
const { text: { lines: { filled, counted, dayOf } } } = require('@atlasbound/kit');
const { WORDS, shortOf, SHOWN: { records: shown } } = require('../../contracts/codes.cjs');
const { isAi, isAnswered, isReplaced, putOff } = require('../../base/text.cjs');
const { DIR } = require('../../contracts/shapes.cjs');
const { isWaivable, keptWhy } = require('../level.cjs');

// who signed a record, as a text says it: the name it carries; a line a teammate committed by git's name of them (steps/teammate's mark)
const deciderOf = (by, author = null) => (isAi(by) ? 'the AI' : shown.by(author ?? by));
// whose words a human's decision carries: the one who answered, where the record relays or copies an answer, else the one who signed it
const hasWords = (d) => Boolean(d.said) && (Boolean(d.saidBy) || !isAi(d.by));
const speakerOf = (d) => (d.saidBy ? shown.by(d.saidBy) : deciderOf(d.by, d.author));
/** Whose a decision is, as every text says it: who decided (of someone else's answer, that one, then who relayed it or the AI), then
 * where the words are and the prompt the person allowed for them, when the record says. */
function whoseOf(d) {
  const by = deciderOf(d.by, d.author);
  const who = d.saidBy ? filled(WORDS.whoseRelayed, { who: shown.by(d.saidBy), by }) : by;
  return [who, d.source && shown.source(d.source), d.confirmed && shown.text(d.confirmed)] // confirmed: as core/whose wrote it, filled
    .filter(Boolean).join(', ');
}
// a decision's age as every item handed says it: its day (not where its plan's line says `planDay`), who kept it since and when
const agedOf = (d, planDay = null) => `${d.at && dayOf(d.at) !== planDay ? `, ${dayOf(d.at)}` : ''}${d.kept ? `, kept by ${deciderOf(d.kept.by, d.kept.author)} ${dayOf(d.kept.at)}` : ''}`;

/** By what a decision was replaced: that decision, whose it is (who said it, who relayed it), when, their sentence; '' where none. */
const replacedBy = (d, { at, said, ...whose } = d.replaced || {}) => (d.supersededBy
  ? ` by ${shown.supersededBy(d.supersededBy)} (${whoseOf(whose)}, ${dayOf(at)}${said ? `: "${shown.quote(said)}"` : ''})` : '');

/** What a draft's decision replaces once READY, and what a person's answer keeps; '' where neither. */
const pendingOf = (d) => `${d.replacing?.length ? filled(WORDS.replacesPending, { refs: shown.replacing(d.replacing.join(', ')) }) : ''}${
  d.keeps?.length ? `, keeps ${shown.keeps(d.keeps.join(', '))}` : ''}`;

/** One line of a conflict: where it is in the file, whose it is (and whose answer was relayed), their words, the value, its source. */
const rivalLine = (o, many) => filled(WORDS.rivalLine, { line: o.line, of: many ? ` of ${o.plan}` : '', by: whoseOf(o),
  said: shown.said(o.said ?? ''), value: o.said === o.value ? '' : filled(WORDS.rivalValue, { value: shown.value(String(o.value)) }) });
/** What every reader says in place of a decision in a conflict: each line in file order, none holding, the way out (the person's word). */
function rivalText({ lines, refs, plans }) {
  const many = plans.length > 1; // a conflict across plans: each line says its plan
  const keys = [...new Set(lines.map((o) => `"${shown.key(o.key)}"`))].join(' or ');
  // where this person's answer goes: a plan of it where no teammate's line stands (steps/teammate refuses writing over one), else a new one
  const free = plans.filter((plan) => !lines.some((o) => o.plan === plan && o.author));
  const place = free.length === plans.length ? '' : filled(WORDS.rivalsPlace, { plans: free.map((plan) => `${plan} or `).join('') });
  return filled(WORDS.rivals, { n: lines.length, where: many ? 'across plans' : 'in this plan', refs: JSON.stringify(refs), keys, place,
    file: `${DIR}/${many ? '<plan>' : plans[0]}.jsonl`, lines: lines.map((o) => rivalLine(o, many)).join('; ') });
}

// a person's decision shows their own sentence beside the value an AI wrote of it, after its state: a long one hides no replacement
function decisionLine(d) {
  const scope = d.scope ? ` [${shown.scope(d.scope)}]` : '';
  if (d.conflict) return `- ${shown.key(d.key)}${scope} ${rivalText(d.conflict)}`;
  const theirs = hasWords(d) && d.said !== d.value ? `; ${speakerOf(d)}: "${shown.said(d.said)}"` : '';
  const said = `${shown.value(d.value)} (${shown.why(d.why)}; by ${whoseOf(d)})`;
  const conflict = `${pendingOf(d)}${d.meets.length ? filled(WORDS.alsoIn, { refs: shown.meets(d.meets.join(', ')) }) : ''}`;
  const touched = Number.isInteger(d.touched) ? filled(WORDS.touchedSince, { n: d.touched }) : '';
  return `- ${shown.key(d.key)}${scope} = ${said} ${d.state}${isReplaced(d) ? replacedBy(d) : ''}${conflict}${theirs}${touched}`;
}

/** A settled decision as a new session reads it: a person's with their sentence (the value too where it differs), the AI's as no one's. */
function settledLine(d) {
  if (d.conflict) return `- ${shown.key(d.key)} ${rivalText(d.conflict)}`;
  const conflict = `${d.supersededBy ? `, replaced${replacedBy(d)}` : ''}${d.meets.length ? filled(WORDS.alsoIn, { refs: shown.meets(d.meets.join(', ')) }) : ''}`;
  if (!hasWords(d)) return `- ${shown.key(d.key)} = ${shown.valueAlone(d.value)} (${shown.why(d.why)}; by ${whoseOf(d)}${agedOf(d)})${conflict}`;
  const value = d.value === d.said ? '' : ` = ${shown.value(d.value)}`; // their own words are the value
  return `- ${shown.key(d.key)}${value}; ${whoseOf(d)}${agedOf(d)}: "${shown.said(d.said)}"${conflict}`;
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

/** What a reader adds to a question the person put off (`later`: base/text putOff): who, in which words. */
const putOffSaid = (later) => (later ? filled(WORDS.putOff, { by: deciderOf(later.by), said: shown.quote(later.said) }) : '');
const openQuestionLines = (view) => view.questions.filter((q) => !q.to && !isAnswered(view, q))
  .map((q) => `- ${shown.q(q.q)}: ${shown.question(q.text)}${putOffSaid(putOff(view, q))}`);

/** A question that waits with someone on the team (steps/teammate parkedWaiting), as every reader says it: whom it waits for (marked
 * where that is the person working here), the teammate who asked it where another clone did, its words and where that one is named. */
const parkedText = (r) => `${shown.q(r.q)} for ${shown.parkedWith(r.to)}${r.mine ? WORDS.parkedHere : ''}${r.author
  ? filled(WORDS.parkedAsked, { by: shown.by(r.author) }) : ''}: ${shown.parked(r.text)}${r.source ? ` (from ${shown.source(r.source)})` : ''}`;
/** Those questions, each with its plan, under their heading: said at every session start of every clone that holds the plan. */
const parkedLines = (rows) => (rows.length ? [WORDS.parkedWith, ...rows.map((r) => `- ${r.id} ${parkedText(r)}`)] : []);

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
const shippedCounts = (c) => filled(WORDS.shippedCounts, Object.fromEntries(Object.entries(WORDS.shippedUnits)
  .map(([field, unit]) => [field, counted(c[field].length, unit)])));

/** A plan's contract link, as the write, READY and show say it. */
const planContractLine = (link) => filled(WORDS.contractPlan, { line: link.why, from: link.source });

/** The level in force and why: as proposed with what keeps it there, or how code moved it, with the signals behind that. */
function levelLine(level) {
  const left = level.left.length ? `; ${filled(WORDS.riskLeft, { areas: shown.signals(level.left.join(', ')) })}` : ''; // the policy decided it
  if (!level.code) return `level: ${WORDS.levels[level.level]} (${keptWhy(level)}${left})`;
  const signals = level.signals.length ? `: ${shown.signals(level.signals.join(', '))}` : '';
  const proposed = `proposed ${WORDS.levels[level.proposed]}: ${shortOf(level.code)}${signals}`;
  return `level: ${WORDS.levels[level.level]} (${proposed}${left})${isWaivable(level) ? WORDS.levelWaive : ''}`;
}

module.exports = { deciderOf, whoseOf, hasWords, agedOf, replacedBy, rivalText, decisionLine, settledLine, findingLine, stepLine, gapLine,
  linkLine, openQuestionLines, putOffSaid, parkedText, parkedLines, amendedText, confirmLines, assumptionLine, shippedCounts,
  planContractLine,
  levelLine };
