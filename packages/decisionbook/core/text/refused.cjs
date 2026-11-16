// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What a writing verb says when it refuses: every refused record of a batch with its place, in one reply; what
// the plan refuses of a question or a step; a yes or a resume no person gave; a close git cannot attribute, with each
// route on as a condition the person checks.
const { text: { safe: { clip }, lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, shortOf } = require('../../contracts/codes.cjs');
const { decision } = require('../../base/fill.cjs');

/** A question asked before any research is on record. */
const researchFirst = (id) => filled(WORDS.researchFirst, { id });
/** A question that restates a field of the task: which field, and its text. */
const restatesTask = (q, field, text) => filled(WORDS.restates, { q: q.q, field, value: clip(text, 80) });
/** A question that asks leave to edit a file the plan already names: which, and why that is no fork. */
const asksPermission = (q, file) => `${filled(WORDS.permission, { q: q.q, file: clip(file, 120) })}: ${shortOf('question-permission')}`;
/** A question whose fork a person's standing decision settles: that decision and who made it, then the way on: the one
 * record by which the AI proposes replacing it (a proposal binds nothing), for the person to answer with their own. */
function settledDecision(q, standing) {
  const proposal = decision({ key: standing.key, by: 'ai', proposed: true, supersedes: [standing.ref] });
  const slots = { q: q.q, ref: standing.ref, value: clip(standing.value, 80), by: clip(standing.by, 40) };
  return filled(WORDS.settledBy, { ...slots, record: JSON.stringify(proposal) });
}
/** A decision that replaces a person's with no answer of theirs to its proposal: the way on. -> [code, detail] */
const supersedeUnasked = (refs, proposal) => ['supersede-not-asked',
  filled(proposal ? WORDS.supersedeAnswer : WORDS.supersedePropose, { refs: refs.join(', ') })];
/** A decision that names itself in its supersedes. -> [code, detail] */
const supersedeSelf = (key) => ['supersede-self', clip(key, 80)];

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

/** Why a yes or a resume is not the person's; `told`: the session holds a person's message that says otherwise, else
 * the product saw none and says so first. */
const notSaid = (code, told) => [...(told ? [] : [WORDS.unseen]), shortOf(code)].join(': ');

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

/** A close whose line another branch holds too (`held`: that branch and the commit both hold): git cannot tell how it
 * came to hold it, so the refusal names what is held and every route on, each behind a condition the person checks. */
function closeHeld(view, held, head) {
  const branch = view.branch || 'HEAD';
  const to = view.branch ? filled(WORDS.checkoutBranch, { b: view.branch }) : WORDS.checkoutDetach;
  const holds = held.sha === head
    ? filled(WORDS.closeHoldsHead, { ref: held.ref })
    : filled(WORDS.closeHoldsLine, { ref: held.ref, sha: held.sha.slice(0, 7) });
  const slots = { ref: held.ref, b: branch, to, back: filled(WORDS.closeBack, { to }) };
  const routes = WORDS.closeRoutes.map((route) => filled(route, slots));
  return { detail: filled(WORDS.closeHeld, { id: view.id, holds }), routes };
}

module.exports = { researchFirst, restatesTask, asksPermission, settledDecision, supersedeUnasked, supersedeSelf, recordPlace,
  batchRefusal, notSaid, yesOutgrown, yesUnseen, closeElsewhere, closeHeld };
