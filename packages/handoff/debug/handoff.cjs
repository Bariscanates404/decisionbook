// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// debug handoff: why the note says what it says. Which message each kept line names and whether that message is still stored, what was
// dropped and why, the note's HEAD against the live one, what could not be measured, the last measure of the context. It only reads.
const { traced, text: { safe: { clip }, lines: { counted } } } = require('@atlasbound/kit');
const { shortOf } = require('../contracts/codes.cjs');
const { BOUNDS } = require('../contracts/shapes.cjs');
const { hereOf } = require('../contracts/helpers.cjs');
const { isStale, shortSha } = require('../core/note.cjs');
const store = require('../steps/store.cjs');
const { sessionAsked } = require('../steps/verbs.cjs');

const numbers = (list) => list.map((n) => `m${n}`).join(', ') || 'none';

/** A kept line and its sources: `stored` the cited numbers this session still holds, null when the line is another session's. */
function keptRow(line, i, session) {
  const mine = session && session.session.slice(0, 8) === line.session;
  const stored = mine ? line.cites.filter((n) => session.messages.some((m) => m.n === n)) : null;
  return { k: i + 1, job: line.job, cites: line.cites, session: line.session, at: line.at, stored, typed: Boolean(line.typed) };
}

function noteSeen(note, head, session) {
  if (!note) return null;
  return { at: note.at, head: note.facts.head, stale: isStale(note, head), handed: note.handed, since: note.since,
    unmeasured: note.facts.unmeasured, kept: note.kept.map((line, i) => keptRow(line, i, session)), dropped: note.dropped };
}

function sessionSeen(io, session) {
  if (!session) return null;
  const { started, head, count, handed, cited, context } = session;
  const edited = store.touchedOf(io, session.session).n;
  return { session: session.session, started, head, count, stored: session.messages.length, handed, cited, edited, context };
}

/** Whether DecisionBook's plans reach the note: read, or why not, as the composition root says it (off by choice, not installed). */
const plansSeen = (io) => (io.plans ? (io.absent && io.absent('plans')) || 'read' : 'not handed');

async function looked(args, io) {
  const head = await io.git.head();
  const note = io.home ? store.readNote(io, await io.git.branch()) : null;
  const { id } = sessionAsked(args, io);
  const session = id && io.home ? store.readSession(io, id) : null;
  const out = { schema: 'ab-debug/1', branch: await io.git.branch(), head, store: io.home ? `~/${hereOf(io)}` : null,
    note: noteSeen(note, head, session), session: sessionSeen(io, session), plans: plansSeen(io) };
  const n = { kept: note ? note.kept.length : 0, dropped: note ? note.dropped.length : 0 };
  return { out, n, codes: { [note ? 'note-shown' : 'note-none']: 1 } };
}

function keptText(row) {
  const stored = row.stored === null ? 'another session\'s messages are not looked up' : `still stored: ${numbers(row.stored)}`;
  const kind = row.job ? 'job' : 'decision or constraint';
  if (row.typed) return `  k${row.k} ${kind}: typed by the person ${row.at} with atlasbound handoff drop`;
  return `  k${row.k} ${kind}: kept ${row.at}, quoting ${numbers(row.cites)} of session ${row.session}; ${stored}`;
}

function noteRows(note, head) {
  if (!note) return [`note: ${shortOf('note-none')}`];
  const moved = note.stale ? `STALE, HEAD is now ${shortSha(head)}` : 'HEAD has not moved';
  const handed = `last handoff ${note.handed || 'never'}, ${counted(note.since, 'message')} since`;
  const cut = (text) => clip(text, BOUNDS.kept.chars);
  return [`note: built ${note.at} at HEAD ${shortSha(note.head)}; ${moved}; ${handed}`,
    ...note.kept.map(keptText),
    ...note.dropped.map((d) => `  dropped ${d.at}: ${cut(d.text)} (${cut(d.why)})`),
    ...note.unmeasured.map((u) => `  not measured: ${u.what} (${shortOf(u.why)})`)];
}

function contextRow(c) {
  if (!c) return '  context notice: no prompt measured yet';
  const by = `${clip(c.model || '?', 60)}: ${clip(c.by || '?', 120)}`;
  const size = c.tokens == null ? '' : `${c.tokens} tokens of ${c.window || 'an unknown window'} (${by}); `;
  return `  context notice: ${size}${c.noticed ? `said at ${c.noticed}` : `not said: ${shortOf(c.code)}`} (measured ${c.at})`;
}

function sessionView(s) {
  if (!s) return [];
  const messages = `${counted(s.count, 'message')} seen, ${s.stored} stored (at most ${BOUNDS.message.perSession})`;
  const kept = `${s.handed} at the last handoff, cited by kept lines: ${numbers(s.cited)}`;
  const line = `session ${s.session}: ${messages}, ${kept}; ${counted(s.edited, 'file')} edited; began at HEAD ${shortSha(s.head)}`;
  return [line, contextRow(s.context)];
}

async function view(io, args = {}) {
  const { out } = await traced(io, 'debug', looked)({ flags: args.flags || {} }, { run: io.run, ref: { verb: 'debug handoff' } });
  const branch = clip(out.branch || 'detached HEAD', 120);
  const where = `branch ${branch}, HEAD ${shortSha(out.head)}; store ${out.store || 'none (no home folder)'}`;
  const lines = [where, ...noteRows(out.note, out.head), ...sessionView(out.session), `plans of DecisionBook: ${out.plans}`];
  return { out, text: `${lines.join('\n')}\n` };
}

module.exports = { view };
