// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// At a person's message the product binds their answers itself: the AI does not type the person's words again. Each list item of
// the message that quotes what it answers is their answer to that question of the branch's open plan, whole; a reply that takes the
// AI's proposals whole answers each question still open that carries one. Each becomes a decision of theirs through the one write
// (steps/batch), judged by the same rules as a record an AI sends (core/yes): an answer the rules do not give them is left for the AI
// to ask about, never stored as the AI's. Their answers to the blocking questions are their yes, so the plan can be READY at their
// message.
const { said: { takesAll, saysYes }, errors: { isFail }, text: { safe: { clip }, lines: { filled } } } = require('@atlasbound/kit');
const { WORDS } = require('../contracts/codes.cjs');
const { answersIn, isAnswered } = require('../base/text.cjs');
const { openPlan } = require('../core/gate.cjs');
const { scopeOf } = require('../core/fold.cjs');
const { PERSON } = require('../core/yes.cjs');
const { boundLines } = require('../core/text/state.cjs');
const { writeBatch } = require('./batch.cjs');
const store = require('./store.cjs');

/** The readings of one answer, in the order they are tried (the first the rules give the person stands, steps/batch). An answer in
 * a list item: a yes to a question with a proposal decides that proposal, else the value is their own words. A reply that takes the
 * proposals whole (`whole`) decides the proposal or nothing. `effect`: what a bound answer changed in the plan, as a decision that
 * answers a question must name it. */
function readings({ q, said, whole = false }, effect) {
  const record = (value, why = WORDS.boundWhy) => ({ t: 'decision', key: q.decides || q.q, value, why, by: PERSON, answers: q.q, said, effect });
  const assent = Boolean(q.proposal) && (whole || saysYes(said));
  // a yes the rules do not read as the proposal is kept in their words, and says in its why what it was a yes to
  const own = record(said, assent ? filled(WORDS.boundYes, { proposal: clip(q.proposal, 200) }) : undefined);
  return [...(assent ? [record(q.proposal, whole ? WORDS.boundWhole : undefined)] : []), ...(whole ? [] : [own])];
}

/** What the person's message answers of the questions still `waiting`: its quoting list items, else, where it takes the proposals
 * whole, each waiting question that carries one. */
function messageAnswers(view, waiting, text) {
  const quoted = answersIn(text, view.questions).filter((one) => waiting.includes(one.q));
  return quoted.length || !takesAll(text) ? quoted : waiting.filter((q) => q.proposal).map((q) => ({ q, said: text, whole: true }));
}

/** The decisions to try on the open plan `view`: none where no question waits, or the plan holds neither a check nor a planned path
 * (the effect a bound answer names: its first check, else its first planned path). */
function recordsFor(view, text) {
  const effect = [view.checks[0] && `check:${view.checks[0].id}`, scopeOf(view)[0] && `file:${scopeOf(view)[0]}`].filter(Boolean).slice(0, 1);
  const waiting = effect.length ? view.questions.filter((q) => !q.to && !isAnswered(view, q)) : [];
  return { waiting, records: messageAnswers(view, waiting, text).flatMap((answer) => readings(answer, effect)) };
}

/** -> { id, text: what was bound, what is still open and the state it left, codes, n } | null (nothing of this message answers the
 * plan, or the write refused it: the answers are then left for the AI's own add, which says why). */
async function bindAnswers(io, text) {
  const view = io.home && io.session && store.keepsPlan(io) ? openPlan(store.readWeb(io), await io.git.branch()) : null;
  const { waiting, records } = view ? recordsFor(view, text) : { records: [] };
  if (!records.length) return null;
  const res = await writeBatch(io, { id: view.id, lines: [], theirs: true }, records, []).catch((err) => {
    if (!isFail(err)) throw err;
    return null;
  });
  if (!res) return null;
  const after = store.readPlan(io, view.id);
  const [bound, open] = [true, false].map((answered) => waiting.filter((q) => isAnswered(after, q) === answered).map((q) => q.q));
  const said = boundLines({ id: view.id, bound, open, state: res.out.state });
  return { id: view.id, text: said, codes: res.codes, n: { bound: bound.length, open: open.length } };
}

module.exports = { bindAnswers };
