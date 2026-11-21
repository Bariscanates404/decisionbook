// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. A built plan whose own person decision lost a conflict after it was built: the line stood in a conflict with another plan's line
// and the answer that replaced it took another value, so its edits may no longer match what holds (two answers met in ONE plan file are
// that plan's own change: no item). Whether it edited, git says (steps/touch). Only a `compared` link naming the holding line clears it:
// stored with the agent's why and the person's answer (steps/batch judged their words).
const { isAfter, isTheirs, personsOwn, sameSlot, refsNamed, isLive, isReplaced, isShown, asList, lineRef } = require('../base/text.cjs');
const { keyMeets } = require('../base/glob.cjs');
const { scopeOf } = require('./fold.cjs');
const { validity } = require('./validity.cjs');

// the line that replaced `d`: the one its `supersededBy` names (at its time), or the line of its key that revises it
const replacerOf = (d, all) => (isReplaced(d) ? all.find((o) => o.ref === d.supersededBy && o.at === d.replaced?.at)
  : !isShown(d) ? all.find((o) => o.plan === d.plan && o.key === d.key && asList(o.revises).includes(d.at)) : null);
// the lines written over `d`, in order: the answer that replaced it, then each line that replaced the one before; the last holds now
function replacersOf(d, all) {
  const chain = [d];
  for (;;) {
    const next = replacerOf(chain.at(-1), all);
    if (!next || chain.includes(next)) return chain.slice(1);
    chain.push(next);
  }
}
// whether `d` stood in a conflict with another plan's line when `answer` was written (its plan's lines above it, others' not later)
const stoodBefore = (answer) => (o) => (o.plan === answer.plan ? o.line < answer.line : !isAfter(o.at, answer.at));
function contestedUntil(views, d, answer) {
  const then = views.map((v) => ({ ...v, decisions: v.decisions.filter(stoodBefore(answer)) }));
  // the fold is asked only where a person's line of another plan could have met one of its plan's: of one key and scope on files that
  // meet, or placing one decision (core/validity's three sources); a long history of plain replacements asks for no fold
  const mine = then.find((v) => v.id === d.plan);
  const about = (v, o) => [...scopeOf(v), ...o.files];
  const near = (v, o) => mine.decisions.some((p) => (sameSlot(o, p) && keyMeets(p.key, about(mine, p), about(v, o)))
    || refsNamed(o).some((ref) => refsNamed(p).includes(ref)));
  if (!then.some((v) => v !== mine && v.decisions.some((o) => isTheirs(o) && near(v, o)))) return false;
  const was = validity(then).find((o) => o.plan === d.plan && o.line === d.line); // none: written after the answer, it lost nothing then
  return Boolean(was?.conflict) && isLive(was) && was.conflict.plans.some((plan) => plan !== d.plan);
}

/** -> [{ plan, key, line, value, heldPlan, heldLine, now, to, files, head, closedFiles }]: each built plan's decision that lost a
 * conflict after it was built and is not cleared yet; `held…`, `now`, `to`: the line that holds now (the answer that replaced it, or
 * what was written over that answer since), its value and its ref; back at the plan's own value, nothing is left to compare. `head`:
 * the READY's (kept by every READY stored again), where git counts its edits from. */
function lostAfterBuilt({ views, decisions }) {
  const built = views.filter((v) => v.builtAt); // set aside, closed or parked later, it was built and edited all the same
  const compared = (v, held) => v.links.some((l) => l.rel === 'compared' && l.to === lineRef(held) && l.why && l.said); // the line, not its key
  return built.flatMap((v) => v.decisions.filter(personsOwn).flatMap((d) => {
    const [answer, ...later] = replacersOf(d, decisions);
    const held = later.at(-1) ?? answer;
    if (!answer || [answer.value, held.value].includes(d.value) || !isAfter(answer.at, v.builtAt) || compared(v, held)
      || !contestedUntil(views, d, answer)) return [];
    return [{ plan: v.id, key: d.key, line: d.line, value: d.value, heldPlan: held.plan, heldLine: held.line, now: held.value,
      to: lineRef(held), files: scopeOf(v), head: v.ready.head, closedFiles: v.closed ? v.closed.files : null }];
  }));
}

module.exports = { lostAfterBuilt };
