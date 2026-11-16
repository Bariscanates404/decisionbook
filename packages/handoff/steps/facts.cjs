// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What can be measured now, through the injected io: git, the session's list of edited files, DecisionBook's plans when the composition
// root hands them. A fact that cannot be measured is null and named with its code: the note says unknown, never a guess.
const { BOUNDS } = require('../contracts/shapes.cjs');
const { noteOf, renderNote } = require('../core/note.cjs');
const store = require('./store.cjs');

/** The commits since the session began, or why they cannot be counted. */
async function commitsSince(io, session, head) {
  if (!head) return { why: 'head-none' };
  if (!session.head) return { why: 'session-unseen' };
  const rows = await io.git.commits(session.head);
  return rows ? { rows } : { why: 'session-head-gone' };
}

/** HEAD's subject: the newest counted commit when that is HEAD, else asked of git; null where git names none (a first or a merge). */
async function subjectOf(io, head, rows) {
  if (!head) return null;
  const known = (rows || []).find((row) => row.sha === head);
  const asked = known ? [known] : (await io.git.commits(`${head}~1`)) || [];
  return asked.length ? asked[0].subject : null;
}

/** A plan as DecisionBook's debug view counts it: its id, state and level, and how many things stand between it and READY. */
function planFact({ id, state, level, unmet, decided = [], open = [] }) {
  return { id, state, level: (level && level.level) || null, unmet: (unmet || []).length, decided, open };
}

/** `session`: its record, or null outside a session (then nothing of a session is counted, and nothing is called unknown). */
async function factsNow(io, session) {
  const branch = await io.git.branch();
  const head = await io.git.head();
  const since = session ? await commitsSince(io, session, head) : {};
  const status = await io.git.statusZ();
  const plans = io.plans ? await io.plans() : null;
  const unmeasured = [...(head ? [] : [{ what: 'head', why: 'head-none' }]), ...(since.why ? [{ what: 'commits', why: since.why }] : [])];
  return {
    branch,
    head,
    subject: await subjectOf(io, head, since.rows),
    commits: since.rows ? { n: since.rows.length, rows: since.rows.slice(0, BOUNDS.facts.commits).map((row) => row.subject) } : null,
    dirty: { n: status.length, rows: status.slice(0, BOUNDS.facts.dirty).map((row) => row.key || row.disk) },
    touched: session ? store.touchedOf(io, session.session) : null,
    plans: plans && plans.map(planFact),
    unmeasured,
  };
}

/** The branch's note rebuilt from fresh facts and stored; what the last handoff wrote into it stays. */
async function rebuilt(io, session) {
  const facts = await factsNow(io, session);
  const note = noteOf({ before: store.readNote(io, facts.branch), facts, session, at: io.clock.now(), heard: store.heardHere(io) });
  store.writeNote(io, facts.branch, note);
  return note;
}

/** The stored note of the branch as a hook says it, or null: the stale mark comes from the live HEAD; no age, so an unchanged note is
 * the same text and the port says it once per context. */
async function noteText(io, session) {
  const note = store.readNote(io, await io.git.branch());
  return note && renderNote(note, { head: await io.git.head(), session });
}

module.exports = { rebuilt, noteText };
