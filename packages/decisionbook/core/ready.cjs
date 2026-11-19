// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. One test per rubric row: the rows a view does not hold at its level; READY is an empty list, there is no score.
const { RUBRIC, UI_PATHS, FORKS, higher } = require('../contracts/rubric.cjs');
const { shortOf } = require('../contracts/codes.cjs');
const { researchFirst, restatesTask, asksPermission, settledDecision, refusedRefs } = require('./text/refused.cjs');
const { asksLeave, refOf } = require('../contracts/shapes.cjs');
const { globCovers, globsOverlap, anyOverlap, tooBroad, isGlob } = require('../base/glob.cjs');
const { personAnswers, isAnswered, isAi, holdsAlone, isAfter, isKeep, alike, ofKind, stepPath, wordSet, isStanding, forkQuestions, yesAgain,
  mentions, asList } = require('../base/text.cjs');
const { scopeOf, seenView, dangerSince } = require('./fold.cjs');
const { planLevel } = require('./level.cjs');

function lands(v, effect) {
  const kind = effect.split(':')[0];
  const value = effect.slice(effect.indexOf(':') + 1);
  if (kind === 'file') return scopeOf(v).some((glob) => globsOverlap(glob, value));
  return kind === 'check' ? v.checks.some((c) => c.id === value) : ofKind(v, kind).some((i) => i.text === value);
}
const askedFork = (v, d) => d.effect.length > 0 && d.effect.every((e) => lands(v, e))
  && forkQuestions(v).some((q) => q.whyNotCode && personAnswers(d, q));
const forksOf = (v) => [
  ...new Set(
  [...v.research.filter((r) => r.settles).map((r) => r.settles), ...v.decisions.filter((d) => askedFork(v, d)).map((d) => d.key)])];
// Research is the AI's own reading: a record counts only where its source names a file of this repository read in the plan's sessions
// (`receipts.read`, steps/here); a tool's answer is a pointer (steps/batch), never research. What it lacks names the planned files
// that are here and were not read.
// a run probe also names what it ran (its command): one that runs a file the session read rests on that reading
const citedFiles = (r) => `${r.source || ''} ${r.tool === 'run' ? r.asked : ''}`.split(/[,;\s]+/).map((s) => stepPath(s).replace(/^\.\//, ''))
  .filter(Boolean);
const readResearch = (v) => v.research.filter((r) => citedFiles(r).some((file) => v.receipts.read.includes(file)));
const unreadPlanned = (v) => v.receipts.there.filter((file) => scopeOf(v).includes(file) && !v.receipts.read.includes(file));
// a file the plan names was read, or is not here yet (a new file has nothing to read)
const readOrNew = (v, file) => v.receipts.read.includes(file) || !v.receipts.there.includes(file);
// "no further fork", stated with its reason, stands for the forks a level asks beyond the ones found: never while a choice of the
// person waits (a question that names what it decides, with no answer of theirs: one the AI answered itself still waits for them),
// and only after the asking was done: the questions asked reach the level's number, or every planned path has a no-fork item of
// its own (`file`: a path the plan covers; at critical one read in the plan's sessions, so a tool's pointer is never that reading) that
// says what was read there and why nothing in it is open (`unread`: the paths with none)
const noFork = (v, n) => {
  const said = ofKind(v, FORKS.NONE).filter((i) => wordSet(i.text).size >= FORKS.NONE_WORDS);
  const asked = forkQuestions(v);
  const own = said.filter((i) => i.file && (v.level?.level !== 'critical' || readOrNew(v, stepPath(i.file)))); // critical: read it
  const unread = asked.length >= n ? [] : scopeOf(v).filter((glob) => !own.some((i) => globCovers(glob, stepPath(i.file))));
  return said.length > 0 && { waiting: asked.filter((q) => !isAnswered(v, q)).map((q) => q.q), unread, asked: asked.length };
};
// a keep answer newer than the person's yes, in other words than it: what the plan was to replace they kept since, so that yes covers
// nothing (core/gate); one yes and keep quoting the same message is one answer
const yesTakenBack = (v) => Boolean(v.confirm)
  && v.decisions.some((d) => isKeep(d) && isAfter(d.at, v.confirm.at) && d.said !== v.confirm.said);
const SAYS = { answers: (v, n) => ({ forks: forksOf(v), needs: n, ...noFork(v, n) }),
  replaces: (v) => ({ changed: v.changed }),
  research: (v, n) => ({ read: readResearch(v).length, needs: n, notRead: unreadPlanned(v) }),
  standards: (v) => ({ standards: v.undecided }),
  // a yes on record that no longer holds was given before a danger path joined the plan: which
  confirm: (v, n, danger) => (v.confirm ? { yesFor: dangerSince(v, danger) } : {}) };
const HOLDS = {
  success: (v) => Boolean(v.success && v.kind),
  research: (v, n) => readResearch(v).length >= n,
  feature: (v) => ofKind(v, 'feature').length > 0,
  plan: (v) => scopeOf(v).length > 0 && !scopeOf(v).some(tooBroad),
  checks: (v, n) => v.checks.length >= n,
  command: (v) => v.checks.some((c) => c.command),
  tasks: (v) => v.checks.every((c) => ofKind(v, 'task').some((t) => t.covers.includes(c.id))) && ofKind(v, 'task').every((t) => t.covers.length > 0),
  questions: (v) => v.questions.every((q) => !q.blocking || isAnswered(v, q)),
  replaces: (v) => !v.changed?.length, // asked of the branch's plans (core/web changedOf); a plan read alone holds none
  danger: (v, n, danger) => scopeOf(v).filter((f) => anyOverlap([f], danger))
    .every((f) => v.decisions.some((d) => anyOverlap([f], d.files))),
  standards: (v) => !v.undecided?.length, // asked only where `ready` read the standards (steps/write); unread is said in its n
  actors: (v) => ofKind(v, 'actor').length > 0,
  edges: (v, n) => ofKind(v, 'edge').length >= n,
  impact: (v) => ofKind(v, 'impact').length > 0 && ofKind(v, 'consumer').every((c) => ofKind(v, 'impact').some((i) => i.covers.includes(c.text))),
  answers: (v, n, danger, said = SAYS.answers(v, n)) => said.forks.length >= n
    || (said.waiting !== undefined && !said.waiting.length && !said.unread.length),
  repro: (v) => v.kind !== 'bug' || ofKind(v, 'repro').length > 0,
  precedent: (v) => !scopeOf(v).some((f) => UI_PATHS.some((re) => re.test(f))) || ofKind(v, 'precedent').length > 0,
  risk: (v) => ofKind(v, 'risk').length > 0,
  rollback: (v) => ofKind(v, 'rollback').length > 0,
  // the yes holds for the plan it saw and what the frozen plan grew by since, but a danger path, and no keep answer newer than it
  confirm: (v, n, danger) => Boolean(v.confirm) && !yesTakenBack(v)
    && (v.confirm.after === scopeOf(v).length || (Boolean(v.ready) && !dangerSince(v, danger).length)),
};

/** The level a plan's rubric is read at: the one code decides (`level`), but a frozen plan keeps the level of its READY for as long
 * as its yes holds: what the AI linked to it since changes nothing, a danger path that joined it does, and so does a file the
 * person's yes to the gate added (core/fold seenLinks) where the paths that yes covers run at a higher level. */
function levelAt(v, level, danger) {
  if (!(v.ready && v.ready.level && v.confirm && !yesAgain(v) && !dangerSince(v, danger).length)) return level;
  const seen = planLevel(seenView(v), danger).level;
  return higher(seen, v.ready.level) ? seen : v.ready.level;
}
const levelRows = (level) => RUBRIC.filter((row) => row.floor[level] !== undefined);
const unmet = (view, level, danger) => levelRows(level).filter((row) => !HOLDS[row.id](view, row.floor[level], danger))
  .map((row) => ({ id: row.id, code: row.code, text: shortOf(row.code),
    ...(SAYS[row.id] ? SAYS[row.id](view, row.floor[level], danger) : {}) }));

// a person's standing decision settles a question of its key on these files, and one whose text names it (its id, or decision:<key>
// of another plan's); not a question that names it as what it asks the person to replace (`supersedes`), nor the question it answers
// (sent again), and it must stand
const settledBy = (view, decisions, q) => decisions.filter((d) => d.plan !== view.id || d.answers !== q.q)
  .find((d) => holdsAlone(d) && !isAi(d.by) && !asList(q.supersedes).includes(d.ref)
  && ((d.key === q.decides && (!d.files.length || !scopeOf(view).length || anyOverlap(d.files, scopeOf(view))))
    || (d.plan !== view.id && [d.ref, refOf('decision', d.key)].some((name) => mentions(q.text, name)))));

// THE reading of a `supersedes`/`keeps` ref: another plan's standing decision (or one this plan's READY replaced), or a decision of this
// plan (its documented change: core/web) -> refs naming none
const unstanding = (view, decisions, refs) => asList(refs).filter((ref) => !decisions.some((d) => d.ref === ref
  && (d.plan === view.id || d.state === 'active' || String(d.supersededBy).startsWith(`${view.id}/`))));
function questionRefused(view, decisions, q) {
  if (!view.research.length) return ['research-first', researchFirst(view.id)];
  const field = FORKS.TASK.find((name) => view[name] && alike(q.text, view[name], FORKS.RESTATE));
  if (field) return ['question-restates', restatesTask(q, field, view[field])];
  const named = newPathsOf(view, []).find((path) => asksLeave(q.text, path)); // leave to edit a file the plan names is no fork
  if (named) return ['question-permission', asksPermission(q, named)];
  const unknown = unstanding(view, decisions, q.supersedes);
  if (unknown.length) return refusedRefs('supersede-unknown', unknown);
  const settled = settledBy(view, decisions, q);
  return settled ? ['question-settled', settledDecision(q, settled)] : null;
}

/** "No further fork" with no why is refused, and so is one about a file the plan does not plan (the files it names are the plan's);
 * stated beside questions that wait, it counts only once the person answered them (HOLDS). */
function noForkRefused(view, record) {
  if (record.t !== 'item' || record.kind !== FORKS.NONE) return null;
  if (wordSet(record.text).size < FORKS.NONE_WORDS) return ['no-fork-unsaid', shortOf('no-fork-unsaid')];
  const planned = !record.file || scopeOf(view).some((glob) => globCovers(glob, stepPath(record.file)));
  return planned ? null : ['no-fork-unplanned', `${record.file}: ${shortOf('no-fork-unplanned')}`];
}

// a new file is a planned path or step file no glob and not tracked (none tracked: every file the plan names); a key done two ways
// is decided by a person's standing decision of it in any plan
function newPathsOf(v, tracked) {
  return [...new Set([...scopeOf(v), ...v.steps.map((s) => stepPath(s.file))])].filter((p) => !isGlob(p) && !tracked.includes(p));
}
const undecidedOf = (rows, decisions) => rows
  && rows.filter((row) => !decisions.some((d) => d.key === row.key && isStanding(d) && !isAi(d.by)));

/** The person's standing decisions draft `v` places before READY: one of its own keys with rivals (core/web: only their answer, as the
 * key's documented change, ends them), one of another plan a person's decision of `v` stands beside in conflict (only one may stand), and
 * one that holds on a file `v` edits (`holdsOn`: its files once its plan stands), unless a person's answer here replaces or keeps it, a
 * blocking question names it (its answer will: core/yes), or a non-goal item covers it (why this change leaves it).
 * -> [{ ref, value, key | files | rivals }] */
function changedOf(v, decisions, holdsOn) {
  // what a reader needs of a decision whose key holds a conflict (core/text/records rivalText)
  const conflictOf = ({ ref, plan, key, value, said, saidBy, source, line, by, rivals }) => ({ ref, plan, key, value, said, saidBy, source,
    line, by, rivals });
  const theirs = (d) => !isAi(d.by) && !d.proposed;
  const mine = decisions.filter((d) => d.plan === v.id && theirs(d));
  const rivals = mine.filter((d) => d.rivals.length).map(conflictOf); // a conflict holds a READY plan too: it covers no edit (core/gate)
  if (v.stage !== 'draft') return rivals;
  const asked = v.questions.filter((q) => q.blocking).flatMap((q) => q.supersedes);
  const placed = [...mine.flatMap((d) => [...d.supersedes, ...d.keeps, ...d.rivals.map((o) => o.ref)]), ...asked,
    ...ofKind(v, 'non-goal').flatMap((i) => i.covers)]; // one beside a decision of `v` is in its conflict (rivals), said there
  const held = decisions.filter((o) => o.plan !== v.id && o.state === 'active' && theirs(o) && !placed.includes(o.ref))
    .map((o) => ({ ...(o.rivals.length ? conflictOf(o) : { ref: o.ref, value: o.value }),
      files: scopeOf(v).filter((f) => anyOverlap([f], holdsOn(o))) }));
  return [...rivals, ...held.filter((o) => o.files.length)];
}

// after a write a complete draft becomes READY; a READY plan is frozen, and stored again only when it holds a yes newer than its READY
// (a danger path joined it and the person said yes again: the scope and level that yes covers are the new READY), or it grew to a
// higher level and holds that level's rows now
const readyAgain = (v) => v.state === 'draft' || (v.state === 'ready' && (yesAgain(v) || v.level.level !== v.ready.level));

module.exports = { unmet, yesTakenBack, levelRows, levelAt, unstanding, questionRefused, noForkRefused, newPathsOf, undecidedOf, changedOf,
  readyAgain, readResearch, unreadPlanned };
