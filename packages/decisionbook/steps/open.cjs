// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The branch's open plan across sessions (core/gate openPlan), for the writing verbs: no silent re-plan and no silent drop. A `new`
// beside a plan an earlier session left open is refused; setting that plan aside is the person's, in their own words; a later
// session's first write to the draft is counted as going on with it.
const { errors: { fail }, text: { lines: { filled } }, said: { isAbout } } = require('@atlasbound/kit');
const { WORDS, shortOf, SHOWN: { open: shown } } = require('../contracts/codes.cjs');
const { openPlan } = require('../core/gate.cjs');
const { foldPlan, scopeOf } = require('../core/fold.cjs');
const { anyOverlap } = require('../base/glob.cjs');
const { promptAs } = require('../contracts/shapes.cjs');
const { asideOwn } = require('../core/yes.cjs');
const { notSaid } = require('../core/text/refused.cjs');
const { actorOf, promptsOf, startedAt, everyRow } = require('./here.cjs');
const { mentions, isBefore } = require('../base/text.cjs');
const { PHASE } = require('./phase.cjs');
const store = require('./store.cjs');

/** In an AI session whose start is known, a `new` (`planned`: the paths it plans) is refused while the branch holds a plan an earlier
 * session left open and it names none but that plan's files or none at all: its READY
 * plan (frozen: the work goes on from it until it is closed or set aside; in the session that made it READY a new parks it, in
 * sight), its draft until that is READY, closed or set aside. A session that cannot tell when it began, and a person at their
 * terminal, plan as before. */
async function newBesideOpen(io, branch, planned) {
  const since = startedAt(io, io.session);
  if (!since || actorOf(io).who === 'terminal' || !store.keepsPlan(io)) return;
  const { open, whose } = await openFor(io, store.readWeb(io), branch);
  if (!open || !isBefore((open.ready || open).at, since)) return;
  // other files are other work, never a re-plan of the open one; a teammate's draft is re-planned only by a new that names its files
  if (!anyOverlap(planned, scopeOf(open)) && (planned.length || whose === 'teammate')) return;
  const which = filled(WORDS.planOpen, { id: open.id, state: open.state, title: shown.title(open.title) });
  throw fail('plan-open', `${which}: ${shortOf('plan-open')}`);
}

/** The branch's open plan as a session of this machine meets it, and whose it is to that session: core/gate's, with each teammate's
 * draft passed over (a commit holds it and no session here made it, made it READY or wrote under it: steps/phase's rows; no home: none
 * is), so this machine's own work comes first (`mine`); else a teammate's draft (`teammate`); a draft an earlier session here left is
 * `earlier` until a message (`task`) is on it. -> { open, whose } */
async function openFor(io, web, branch, task = null) {
  const here = new Set(io.home ? everyRow(io).filter((row) => row.t === PHASE).map((row) => row.id) : web.views.map((v) => v.id));
  const drafts = web.views.filter((v) => v.branch === branch && v.state === 'draft' && !here.has(v.id));
  const held = await Promise.all(drafts.map((v) => io.git.author(store.pathOf(v.id)))); // who committed each; null: no commit holds it
  const views = web.views.filter((v) => !held[drafts.indexOf(v)]);
  const open = openPlan({ views }, branch);
  if (open) return { open, whose: leftEarlier(io, open, task) ? 'earlier' : 'mine' };
  return { open: openPlan(web, branch) || null, whose: views.length < web.views.length ? 'teammate' : 'mine' };
}

// a draft an earlier session here left, with no message of this one on it yet
const leftEarlier = (io, open, task) => open.state === 'draft' && !(task && onDraft(open, task)) && goesOn(io, { id: open.id });
/** Whether a person's message is on a draft: it resumes their handoff, names the plan or one of its files, or is about its title. */
const onDraft = (view, text) => promptAs(text) === 'resume' || mentions(text, view.id) || isAbout(text, view.title)
  || scopeOf(view).some((file) => !file.includes('*') && mentions(text, file.split('/').pop()));

/** An aside no person gave (core/yes): refused, never stored as the AI's. Its words are theirs, of a message of this session.
 * -> [code, detail] | null */
function asideRefused(io, view, value) {
  if (value.t !== 'aside') return null;
  const actor = actorOf(io);
  return asideOwn({ actor, record: value, heard: promptsOf(io) }) ? null
    : ['aside-not-asked', `${view.id}: ${notSaid('aside-not-asked', actor.why !== 'no-prompt-row')}`];
}

/** Whether this write is a later session's first on the draft an earlier one left: every record the file holds is from before this
 * session began. No start known: it cannot tell, so no. */
function goesOn(io, batch) {
  const since = startedAt(io, io.session);
  if (!since || batch.fresh) return false;
  const { rows } = store.planRows(io, batch.id);
  return foldPlan(rows).stage === 'draft' && rows.every((row) => isBefore(row.at, since));
}

module.exports = { newBesideOpen, openFor, asideRefused, goesOn };
