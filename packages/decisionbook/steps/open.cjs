// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The branch's open plan across sessions (core/web openPlan), for the writing verbs: no silent re-plan and no silent drop. A `new`
// beside a plan an earlier session left open is refused; setting that plan aside is the person's, in their own words; a later
// session's first write to the draft is counted as going on with it.
const { errors: { fail }, text: { lines: { filled } }, said: { isAbout } } = require('@atlasbound/kit');
const { WORDS, shortOf, SHOWN: { open: shown } } = require('../contracts/codes.cjs');
const { openPlan } = require('../core/web.cjs');
const { foldPlan, scopeOf } = require('../core/fold.cjs');
const { anyOverlap } = require('../base/glob.cjs');
const { promptAs } = require('../contracts/shapes.cjs');
const { saidOwn } = require('../core/whose.cjs');
const { notSaid } = require('../core/text/refused.cjs');
const { actorOf, promptsOf, startedAt } = require('./here.cjs');
const { mentions, isBefore, refsNamed } = require('../base/text.cjs');
const { teammateOf } = require('./teammate.cjs');
const store = require('./store.cjs');
const { openItems } = require('./touch.cjs');

/** The plan an earlier session left open on `branch`, as an AI session whose start is known meets it (openFor); null: none, or a session
 * that cannot tell when it began, or a person at their terminal: they plan as before. -> { open, whose } | null */
async function leftOpen(io, branch) {
  const since = startedAt(io, io.session);
  if (!since || actorOf(io).who === 'terminal' || !store.keepsPlan(io)) return null;
  const web = store.readWeb(io);
  const met = await openFor(io, { web, items: await openItems(io, web), branch });
  return met.open && isBefore((met.open.ready || met.open).at, since) ? met : null;
}

/** A `new` (`planned`: the paths it plans; `records`: what it brings) is refused while the branch holds a plan an earlier session left
 * open and it names none but that plan's files or none at all: its READY plan (frozen: the work goes on from it until it is closed or set
 * aside; in the session that made it READY a new parks it, in sight), its draft until that is READY, closed or set aside. Beside a
 * teammate's READY plan a new always opens: their settled work is not this clone's to go on with unasked. So does one whose decision
 * names a decision of the open plan (it replaces or keeps it), or whose question asks to replace one (the first step of settling a
 * conflict): a change of mind on record is no second plan of the same work. */
const NAMING = ['decision', 'question'];
async function newBesideOpen(io, branch, planned, records) {
  const { open, whose } = (await leftOpen(io, branch)) ?? {};
  if (!open || records.some((r) => NAMING.includes(r?.t) && refsNamed(r).some((ref) => String(ref).startsWith(`${open.id}/`)))) return;
  // other files are other work, never a re-plan of the open one; a teammate's draft is re-planned only by a new that names its files
  if (!anyOverlap(planned, scopeOf(open)) && (planned.length || whose === 'teammate')) return;
  if (open.state === 'ready' && await teammateOf(io, open.id)) return;
  const which = filled(WORDS.planOpen, { id: open.id, state: open.state, title: shown.title(open.title) });
  throw fail('plan-open', `${which}: ${shortOf('plan-open')}`);
}

/** The branch's open plan as a session of this machine meets it, and whose it is to that session: core/gate's, with a plan whose
 * decision lost a conflict after it edited left out (`items.lost`: it covers no edit; the plan that restores its files is new work), each
 * teammate's draft passed over (steps/teammate), so this machine's own work comes first (`mine`); else a teammate's draft (`teammate`); a
 * draft an earlier session here left is `earlier` until a message (`task`) is on it. -> { open, whose } */
async function openFor(io, { web, items, branch }, task = null) {
  const working = web.views.filter((v) => !items.lost.some((l) => l.plan === v.id));
  const drafts = working.filter((v) => v.branch === branch && v.state === 'draft');
  const theirs = await Promise.all(drafts.map((v) => teammateOf(io, v.id)));
  const views = working.filter((v) => !theirs[drafts.indexOf(v)]);
  const open = openPlan({ views }, branch);
  if (open) return { open, whose: leftEarlier(io, open, task) ? 'earlier' : 'mine' };
  return { open: openPlan({ views: working }, branch) || null, whose: views.length < working.length ? 'teammate' : 'mine' };
}

// a draft an earlier session here left, with no message of this one on it yet
const leftEarlier = (io, open, task) => open.state === 'draft' && !(task && onDraft(open, task)) && goesOn(io, { id: open.id });
/** Whether a person's message is on a draft: it resumes their handoff, names the plan or one of its files, or is about its title. */
const onDraft = (view, text) => promptAs(text) === 'resume' || mentions(text, view.id) || isAbout(text, view.title)
  || scopeOf(view).some((file) => !file.includes('*') && mentions(text, file.split('/').pop()));

const OWN = { aside: 'aside-not-asked', later: 'later-not-said' }; // the records only the person gives, each with its refusal
/** An aside, or a question put off (`later`), that no person gave (core/whose): refused, never stored as the AI's. Its words are
 * theirs, of a message of this session; a `later` names a question this plan asks. -> [code, detail] | null */
function ownRefused(io, view, value) {
  const code = OWN[value.t];
  if (!code) return null;
  if (value.t === 'later' && !view.questions.some((q) => q.q === value.answers)) return ['later-unasked', `${view.id}: ${value.answers}`];
  const actor = actorOf(io);
  return saidOwn({ actor, record: value, heard: promptsOf(io) }) ? null : [code, `${view.id}: ${notSaid(code, actor.why !== 'no-prompt-row')}`];
}

/** Whether this write is a later session's first on the draft an earlier one left: every record the file holds is from before this
 * session began. No start known: it cannot tell, so no. */
function goesOn(io, batch) {
  const since = startedAt(io, io.session);
  if (!since || batch.fresh) return false;
  const { rows } = store.planRows(io, batch.id);
  return foldPlan(rows).stage === 'draft' && rows.every((row) => isBefore(row.at, since));
}

module.exports = { newBesideOpen, openFor, ownRefused, goesOn };
