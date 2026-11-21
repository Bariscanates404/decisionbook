// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. Which decision lines hold, read from the records alone: by scope and by what a line names (`supersedes`, `keeps`, `revises`),
// never by date or order. Person lines that disagree are ONE conflict naming every line of it: shown, never chosen. Four passes over
// every plan's lines: the line that stands for each key of a plan; what was replaced and what is kept; each line's state; the conflicts.
const { headsOf, replacedOf, isKeep, isTheirs, personsOwn, decisionRef, slotOf, planSlot, sameSlot, STATE, isLive, isKeeping } = require('../base/text.cjs');
const { keyMeets } = require('../base/glob.cjs');
const { scopeOf } = require('./fold.cjs');

const byPlace = (a, b) => a.plan.localeCompare(b.plan) || a.line - b.line;

/** Pass 1. Per key and scope of a plan: `heads`, the person lines no other line of theirs replaced (two that a merge kept stand side
 * by side), and `one`, the line that stands for the key: their last decision among the heads, else their keep, else the last line
 * (the AI's, where no person decided: only the person changes their decision). */
function standsOf(all) {
  return new Map([...Map.groupBy(all, planSlot)].map(([slot, lines]) => {
    const heads = headsOf(lines.filter(isTheirs));
    return [slot, { heads, one: heads.findLast((d) => !isKeep(d)) ?? heads.at(-1) ?? lines.at(-1) }];
  }));
}

/** Pass 2. A proposal and a draft's line bind nothing. `replacedBy`: a ref -> the line that replaced it; what a key's lines replaced
 * stays replaced, unless the line standing for that key now keeps it (the person took it back). `keptBy`: a ref -> its standing keep. */
function replacedAndKept(all, oneOf, isDraft) {
  const binding = all.filter((d) => !d.proposed && !isDraft(d));
  const takenBack = (d) => (isKeep(oneOf(d)) ? oneOf(d).keeps : []);
  return { replacedBy: new Map(binding.flatMap((d) => replacedOf(d).filter((ref) => !takenBack(d).includes(ref)).map((ref) => [ref, d]))),
    keptBy: new Map(binding.filter((d) => oneOf(d) === d && isKeep(d)).flatMap((d) => d.keeps.map((ref) => [ref, d]))) };
}

// a kept answer is never live: it stands in the decision it keeps
const lineState = (d, stands, replaced) => (d.proposed && STATE.proposed) || (!stands && STATE.revised) || (isKeep(d) && STATE.kept)
  || (replaced ? STATE.replaced : STATE.live);

/** Pass 3. A line with its ref and state, which decision replaced it (who, when, in which sentence of theirs), who keeps it now, and
 * what a draft's line replaces once its plan is READY (`replacing`). */
function stated(d, { oneOf, isDraft, replacedBy, keptBy }) {
  const ref = decisionRef(d);
  const by = replacedBy.get(ref) ?? null;
  const keep = keptBy.get(ref) ?? null;
  return { ...d, ref, state: lineState(d, oneOf(d) === d, by), replacing: !d.proposed && isDraft(d) ? replacedOf(d) : [],
    supersededBy: by && decisionRef(by), replaced: by && { by: by.by, at: by.at, said: by.said, plan: by.plan, line: by.line },
    kept: keep && { by: keep.by, at: keep.at, plan: keep.plan, line: keep.line } };
}

/** Pass 4. The pairs of person lines that disagree, from three sources: two lines of one key in a plan that a merge kept, with other
 * values (the same words are no agreement, the same value is); two plans' live lines of one key and scope on files that meet (`met`);
 * a READY plan's replacement against another's replacement or standing keep of the same decision, under any key (neither named the
 * other). What a line replaces or keeps is no rival of it. Only lines of one key and scope, or placing one decision, can be a pair
 * (`near`): the rule is asked of those, so a long history costs no more than its lines. */
function clashes(lines, { stands, lineOf, met, isDraft, replacedBy }) {
  const inPlan = [...stands.values()].filter(({ one }) => personsOwn(one) && isLive(lineOf.get(one)))
    .flatMap(({ one, heads }) => heads.filter((o) => o !== one && o.value !== one.value).map((o) => [lineOf.get(one), lineOf.get(o)]));
  const heir = (d) => isLive(d) && personsOwn(d) && !isDraft(d);
  const putsOn = (d) => (heir(d) ? replacedOf(d) : isKeeping(d) && isTheirs(d) && !replacedBy.has(d.ref) ? d.keeps : []);
  const shares = (x, y) => heir(y) && replacedOf(y).some((ref) => putsOn(x).includes(ref));
  const rivals = (d, o) => (personsOwn(d) && personsOwn(o) && met(d, o)) || shares(d, o) || shares(o, d);
  const standing = lines.filter((d) => isLive(d) || isKeeping(d));
  const placing = Map.groupBy(standing.flatMap((d) => putsOn(d).map((ref) => ({ ref, d }))), ({ ref }) => ref);
  const near = [...Map.groupBy(standing, slotOf).values(), ...[...placing.values()].map((group) => group.map(({ d }) => d))];
  const pairsIn = (group) => group.flatMap((d, i) => group.slice(i + 1).filter((o) => o.ref !== d.ref && rivals(d, o)).map((o) => [d, o]));
  return [...inPlan, ...near.flatMap(pairsIn)];
}

/** The pairs joined into conflicts: each a set of lines, one conflict however many lines disagree. -> a line -> its conflict
 * { lines (by plan, then place in the file: where it is, whose, their words), refs, plans } */
function conflictsOf(pairs) {
  const sets = new Map();
  for (const pair of pairs) {
    const joined = new Set(pair.flatMap((line) => [...(sets.get(line) ?? [line])]));
    joined.forEach((line) => sets.set(line, joined));
  }
  const told = ({ plan, key, ref, line, value, said, by, saidBy, source }) => ({ plan, key, ref, line, value, said, by, saidBy, source });
  const conflicts = new Map([...new Set(sets.values())].map((set) => [set, [...set].sort(byPlace).map(told)])
    .map(([set, lines]) => [set, { lines, refs: [...new Set(lines.map((o) => o.ref))], plans: [...new Set(lines.map((o) => o.plan))] }]));
  return new Map([...sets].map(([line, set]) => [line, conflicts.get(set)]));
}

/** Every decision line of `views` with its state, `conflict` (the one it is in, the same object on every line of it; null: none) and
 * `meets` (other plans' live lines of its key and scope on files that meet, whoever decided: said, never held). */
function validity(views) {
  const all = views.flatMap((v) => v.decisions);
  const stage = new Map(views.map((v) => [v.id, v.stage]));
  const isDraft = (d) => stage.get(d.plan) === 'draft';
  const scope = new Map(views.map((v) => [v.id, scopeOf(v)]));
  const reach = (d) => [...scope.get(d.plan), ...d.files]; // what a line is about: its plan's files and its own
  const stands = standsOf(all);
  const oneOf = (d) => stands.get(planSlot(d)).one;
  const placed = { oneOf, isDraft, ...replacedAndKept(all, oneOf, isDraft) };
  const lines = all.map((d) => stated(d, placed));
  const lineOf = new Map(all.map((d, i) => [d, lines[i]]));
  const beside = (d, o) => [...d.replacing, ...d.keeps].includes(o.ref);
  const met = (d, o) => isLive(d) && isLive(o) && o.ref !== d.ref && sameSlot(d, o) && !beside(d, o) && !beside(o, d)
    && keyMeets(d.key, reach(d), reach(o));
  const conflictOf = conflictsOf(clashes(lines, { stands, lineOf, met, ...placed }));
  const live = Map.groupBy(lines.filter(isLive), slotOf);
  const meets = (d) => (live.get(slotOf(d)) ?? []).filter((o) => met(d, o)).map((o) => o.ref);
  return lines.map((d) => ({ ...d, meets: meets(d), conflict: conflictOf.get(d) ?? null }));
}

module.exports = { validity };
