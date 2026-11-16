// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The branch's open plan across sessions (core/gate openPlan), for the writing verbs: no silent re-plan and no silent drop. A `new`
// beside a plan an earlier session left open is refused; setting that plan aside is the person's own answer to the AI's question; a
// later session's first write to the draft is counted as going on with it; what a turn's last message showed the person is kept.
const { errors: { fail }, text: { safe: { clip }, lines: { filled } }, said: { asksAside } } = require('@atlasbound/kit');
const { WORDS, shortOf } = require('../contracts/codes.cjs');
const { openPlan } = require('../core/gate.cjs');
const { foldPlan } = require('../core/fold.cjs');
const { asideOwn } = require('../core/yes.cjs');
const { notSaid } = require('../core/text/refused.cjs');
const { actorOf, heardOf, shownOf, keepShown, startedAt } = require('./here.cjs');
const { mentions, wordsIn, quotedBy } = require('../base/text.cjs');
const store = require('./store.cjs');

/** In an AI session whose start is known, a `new` is refused while the branch holds a plan an earlier session left open: its READY
 * plan (frozen: the work goes on from it until it is closed or set aside; in the session that made it READY a new parks it, in
 * sight), its draft until that is READY, closed or set aside. A session that cannot tell when it began, and a person at their
 * terminal, plan as before. */
function newBesideOpen(io, branch) {
  const since = startedAt(io, io.session);
  if (!since || actorOf(io).who === 'terminal' || !store.keepsPlan(io)) return;
  const open = openPlan(store.readWeb(io), branch);
  if (!open || Date.parse((open.ready || open).at) >= Date.parse(since)) return;
  const which = filled(WORDS.planOpen, { id: open.id, state: open.state, title: clip(open.title, 100) });
  throw fail('plan-open', `${which}: ${shortOf('plan-open')}`);
}

/** An aside no person gave (core/yes): refused, never stored as the AI's. The person's answer is of this session, where the open plan
 * was shown; a session that cannot tell when it began reads since the plan's `new`. -> [code, detail] | null */
function asideRefused(io, view, value) {
  if (value.t !== 'aside') return null;
  const actor = actorOf(io);
  const own = asideOwn({ actor, record: value, heard: heardOf(io), shown: shownOf(io), view }, startedAt(io, io.session) || view.at);
  return own ? null : ['aside-not-asked', `${view.id}: ${notSaid('aside-not-asked', actor.why !== 'no-prompt-row')}`];
}

/** At a person's message: which question of each open plan its list items quote back as the AI asked them (base/text quotedBy), for
 * the prompt's row: item numbers and question ids, never words. Their answer to a question is those items, whole. */
async function quotedAtPrompt(io, text) {
  if (!io.home || !store.keepsPlan(io)) return {};
  const quoted = (await store.openHere(io)).map((view) => [view.id, quotedBy(text, view.questions)]);
  return Object.fromEntries(quoted.filter(([, of]) => Object.keys(of).length));
}

/** At a turn's end: what the AI's last message showed the person of each open plan of the branch, kept as ids and flags (never its
 * words) for the two things only their reply to that message can do: `qs`, the questions whose proposal the message holds word for
 * word, as one run (a reply that takes the proposals whole decides those); `aside`, it named the plan and asked whether it is set
 * aside (kit's words for that; their yes sets it aside). A host that hands no last message keeps nothing, so neither can be claimed.
 * -> the trace's codes */
async function shownAtStop(event, io) {
  const message = event.last_assistant_message;
  if (typeof message !== 'string' || !io.home || !event.session_id || !store.keepsPlan(io)) return {};
  const open = await store.openHere(io);
  const plans = Object.fromEntries(open.map((view) => [view.id, {
    qs: view.questions.filter((q) => q.proposal && wordsIn(q.proposal, message)).map((q) => q.q),
    aside: Number(mentions(message, view.id) && asksAside(message)) }]));
  if (!open.length) return {};
  keepShown(io, event.session_id, plans);
  const all = Object.values(plans);
  return { ...(all.some((p) => p.qs.length) && { 'proposal-shown': 1 }), ...(all.some((p) => p.aside) && { 'aside-asked': 1 }) };
}

/** Whether this write is a later session's first on the draft an earlier one left: every record the file holds is from before this
 * session began. No start known: it cannot tell, so no. */
function goesOn(io, batch) {
  const since = startedAt(io, io.session);
  if (!since || batch.fresh) return false;
  const { rows } = store.planRows(io, batch.id);
  return foldPlan(rows).stage === 'draft' && rows.every((row) => Date.parse(row.at) < Date.parse(since));
}

module.exports = { newBesideOpen, asideRefused, goesOn, shownAtStop, quotedAtPrompt };
