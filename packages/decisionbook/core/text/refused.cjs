// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What a writing verb says when it refuses: every refused record of a batch with its place, in one reply; what
// the plan refuses of a question or a step; a yes or a resume no person gave; a close git cannot attribute, with each
// route on as a condition the person checks.
const { text: { lines: { filled, shortSha }, safe: { copyable } } } = require('@atlasbound/kit');
const { WORDS, shortOf, SHOWN: { refused: shown } } = require('../../contracts/codes.cjs');

/** A question asked before any research is on record. */
const researchFirst = (id) => filled(WORDS.researchFirst, { id });
/** A question that restates a field of the task: which field, and its text. */
const restatesTask = (q, field, text) => filled(WORDS.restates, { q: q.q, field, value: shown.text(text) });
/** A question that asks leave to edit a file the plan already names: which, and why that is no fork. */
const asksPermission = (q, file) => `${filled(WORDS.permission, { q: q.q, file: shown.file(file) })}: ${shortOf('question-permission')}`;
/** A question whose fork a person's standing decision settles: that decision and who made it, then the way on: the same
 * question naming it as what it asks the person to replace. */
const settledDecision = (q, standing) => filled(WORDS.settledBy, { q: q.q, ref: standing.ref, value: shown.value(standing.value),
  by: shown.by(standing.by) });
/** A decision refused for the standing decisions it names (`refs`): which, then the way on. -> [code, detail] */
const refusedRefs = (code, refs) => [code, `${shown.refs(refs.join(', '))}: ${shortOf(code)}`];

/** Refs that name no standing decision (core/ready unstanding); of one another decision replaced, which holds in its place and how the
 * person takes the old one back. -> [code, detail] */
function unknownRefs(refs, decisions) {
  const [code, detail] = refusedRefs('supersede-unknown', refs);
  const replaced = decisions.filter((d) => refs.includes(d.ref) && d.supersededBy)
    .map((d) => filled(WORDS.replacedSince, { ref: shown.ref(d.ref), by: shown.ref(d.supersededBy) }));
  return [code, [detail, ...new Set(replaced)].join('. ')];
}

/** A keep whose answer says another value than the line it keeps (`kept`): that line, and its value whole, as the one string to copy
 * (a reader cuts a long value). -> [code, detail] */
const keptOtherValue = (kept) => ['keep-other-value',
  `${shown.ref(kept.ref)}: ${shortOf('keep-other-value')}${filled(WORDS.valueToCopy, { value: copyable(kept.value) })}`];

/** A person's decision written over a teammate's line: the line's `<plan>/<key>`, who committed it, then the way on. -> [code, detail] */
const teammatesLine = (ref, author) => ['decision-teammates',
  `${shown.refs(ref)} (${WORDS.cameWith} ${shown.author(author)}): ${shortOf('decision-teammates')}`];

/** A record's place in its batch; one record of an add stands alone, unless a refused plan record stands beside it. */
const recordPlace = (i, count, beside) => (count > 1 || beside ? `record ${i + 1} of ${count}` : '');

/** Every refused record of a batch, as { code, detail }: the first problem's code is the refusal's, each other code
 * is named before its detail, and the detail starts by saying that nothing was written. `refused`: [{ place,
 * problems: [[code, detail], ...] }, ...]. */
function batchRefusal(refused) {
  const [[code]] = refused[0].problems;
  const problemText = ([other, detail]) => (other === code ? detail : `${other}: ${detail}`);
  const recordText = ({ place, problems }) => {
    const said = problems.map(problemText).join(', ');
    return place ? `${place}: ${said}` : said;
  };
  return { code, detail: `${WORDS.noneWritten}: ${refused.map(recordText).join('; ')}` };
}

/** Their messages numbered in the order typed, by why the words are not theirs there (kit's reading); '' where none was read. */
function theirMessages(whys) {
  const said = Object.entries(WORDS.notTheirsBy).map(([why, words]) => [words, whys.flatMap((one, i) => (one === why ? [i + 1] : []))])
    .filter(([, ns]) => ns.length).map(([words, ns]) => filled(words, { ns: ns.join(', ') }));
  return said.length ? filled(WORDS.notTheirsWhy, { whys: said.join('; ') }) : '';
}

/** Why a yes or a resume is not the person's; `told`: the session holds a person's message that says otherwise, else
 * the product saw none and says so first. */
const notSaid = (code, told, whys = []) => [[...(told ? [] : [WORDS.unseen]), shortOf(code)].join(': '), theirMessages(whys)].filter(Boolean).join('. ');

/** A confirm on a plan that grew past what the person saw: what grew. */
const yesOutgrown = (grown) => filled(WORDS.confirmGrew, { what: grown.join('; ') });
/** A confirm after the plan's goal, tasks or checks changed with no message of the person since: which of them. */
const yesUnseen = (kinds) => filled(WORDS.confirmUnseen, { what: kinds.join(', ') });

/** A close on another branch than the plan's: where to close it, and how to bring that branch back if it is gone. */
function closeElsewhere(view, here) {
  const revive = view.branch ? filled(WORDS.branchBack, { b: view.branch }) : WORDS.checkoutDetach;
  const slots = { id: view.id, branch: view.branch || WORDS.detached, revive, here: here || WORDS.detached };
  return filled(WORDS.closeElsewhere, slots);
}

/** What is refused on a teammate's plan `id` (`code`: its close by an AI session, a compared link): whose it is, and who does it instead.
 * -> [code, detail] */
const theirPlan = (code, id, author) => [code, `${id} (${WORDS.cameWith} ${shown.author(author)}): ${shortOf(code)}`];

/** A close whose line another branch holds too (`held`: that branch and the commit both hold): git cannot tell how it
 * came to hold it, so the refusal names what is held and every route on, each behind a condition the person checks. */
function closeHeld(view, held, head) {
  const branch = view.branch || 'HEAD';
  const to = view.branch ? filled(WORDS.checkoutBranch, { b: view.branch }) : WORDS.checkoutDetach;
  const holds = held.sha === head
    ? filled(WORDS.closeHoldsHead, { ref: held.ref })
    : filled(WORDS.closeHoldsLine, { ref: held.ref, sha: shortSha(held.sha) });
  const slots = { ref: held.ref, b: branch, to, back: filled(WORDS.closeBack, { to }) };
  const routes = WORDS.closeRoutes.map((route) => filled(route, slots));
  return { detail: filled(WORDS.closeHeld, { id: view.id, holds }), routes };
}

const noSuchLine = (source) => filled(WORDS.noSuchLine, { source }); // a record cites a line its file does not have

module.exports = { researchFirst, restatesTask, asksPermission, settledDecision, refusedRefs, unknownRefs, keptOtherValue, teammatesLine,
  recordPlace, noSuchLine, batchRefusal, notSaid, yesOutgrown, yesUnseen, closeElsewhere, closeHeld, theirPlan };
