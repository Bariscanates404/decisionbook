// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// debug handoff: why the note says what it says. Which message each kept line names and whether that message is still stored, what was
// dropped and why, the note's HEAD against the live one, what could not be measured, the last measure of the context. It only reads.
const { traced, text: { safe: { clip }, lines: { counted, filled, shortId } } } = require('@atlasbound/kit');
const { shortOf } = require('../contracts/codes.cjs');
const { BOUNDS } = require('../contracts/shapes.cjs');
const { hereOf } = require('../contracts/helpers.cjs');
const { isStale, shaOrNone } = require('../core/note.cjs');
const store = require('../steps/store.cjs');
const { sessionAsked } = require('../steps/verbs.cjs');
const { debug: W } = require('../contracts/words.json');

const numbers = (list) => list.map((n) => `m${n}`).join(', ') || 'none';

/** A kept line and its sources: `stored` the cited numbers this session still holds, null when the line is another session's. */
function keptRow(line, i, session) {
  const mine = session && shortId(session.session) === line.session;
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
  const stored = row.stored === null ? W.notLookedUp : `still stored: ${numbers(row.stored)}`;
  const kind = row.job ? 'job' : W.decisionKind;
  if (row.typed) return filled(W.typedLine, { k: row.k, kind, at: row.at });
  return filled(W.keptLine, { k: row.k, kind, at: row.at, cites: numbers(row.cites), session: row.session, stored });
}

function noteRows(note, head) {
  if (!note) return [`note: ${shortOf('note-none')}`];
  const moved = note.stale ? `STALE, HEAD is now ${shaOrNone(head)}` : W.headSame;
  const handed = filled(W.lastHandoff, { at: note.handed || 'never', since: counted(note.since, 'message') });
  const cut = (text) => clip(text, BOUNDS.kept.chars);
  return [filled(W.noteBuilt, { at: note.at, head: shaOrNone(note.head), moved, handed }),
    ...note.kept.map(keptText), ...note.dropped.map((d) => `  dropped ${d.at}: ${cut(d.text)} (${cut(d.why)})`),
    ...note.unmeasured.map((u) => `  not measured: ${u.what} (${shortOf(u.why)})`)];
}

function contextRow(c) {
  if (!c) return W.contextNone;
  const by = `${clip(c.model || '?', BOUNDS.model)}: ${clip(c.by || '?', BOUNDS.debug.by)}`;
  const size = c.tokens == null ? '' : `${c.tokens} tokens of ${c.window || W.unknownWindow} (${by}); `;
  return filled(W.contextNotice, { size, said: c.noticed ? `said at ${c.noticed}` : `not said: ${shortOf(c.code)}`, at: c.at });
}

function sessionView(s) {
  if (!s) return [];
  const messages = filled(W.messagesSeen, { seen: counted(s.count, 'message'), stored: s.stored, max: BOUNDS.message.perSession });
  const kept = filled(W.handedCited, { handed: s.handed, cited: numbers(s.cited) });
  const line = filled(W.sessionLine, { session: s.session, messages, kept, edited: counted(s.edited, 'file'), head: shaOrNone(s.head) });
  return [line, contextRow(s.context)];
}

async function view(io, args = {}) {
  const { out } = await traced(io, 'debug', looked)({ flags: args.flags || {} }, { run: io.run, ref: { verb: 'debug handoff' } });
  const branch = clip(out.branch || 'detached HEAD', BOUNDS.debug.branch);
  const where = `branch ${branch}, HEAD ${shaOrNone(out.head)}; store ${out.store || W.noHome}`;
  const lines = [where, ...noteRows(out.note, out.head), ...sessionView(out.session), `plans of DecisionBook: ${out.plans}`];
  return { out, text: `${lines.join('\n')}\n` };
}

module.exports = { view };
