// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE one reader and writer of the handoff's store: this repository's folder in the person's home (never the repository). It holds the
// note of each branch, and per session the heads of the person's messages and the list of edited files.
const { text: { lines: { shortId } } } = require('@atlasbound/kit');
const { SCHEMA, BOUNDS, bound } = require('../contracts/shapes.cjs');
const { noteKey, sessionKey, storedRecord, sessionsHere } = require('../contracts/helpers.cjs');

const DAY = 86400000;
const isSessionId = (id) => typeof id === 'string' && !bound.refusal('SessionId', { id });

const readNote = (io, branch) => storedRecord(io, noteKey(io, branch), 'Note', 'note-unreadable');

/** The note replaces the one before it, which stays as the single backup. */
function writeNote(io, branch, note) {
  const key = noteKey(io, branch);
  const before = io.home.readText(key);
  if (before !== null) io.home.writeAtomic(key.replace(/\.json$/, '.before.json'), before);
  io.home.writeAtomic(key, `${JSON.stringify(bound.shape('Note', note), null, 2)}\n`);
}

const readSession = (io, id) => storedRecord(io, sessionKey(io, id), 'Session', 'session-unreadable');
/** The session's record, or a new one: `head` is where it began when its start was seen, else null. */
function sessionOf(io, id, head = null) {
  const at = io.clock.now();
  return readSession(io, id)
    || { schema: SCHEMA.session, session: id, started: at, seen: at, head, count: 0, handed: 0, cited: [], messages: [], context: null };
}
function writeSession(io, session) {
  const text = JSON.stringify(bound.shape('Session', { ...session, seen: io.clock.now() }));
  io.home.writeAtomic(sessionKey(io, session.session), `${text}\n`);
}

/** The session seen last here, or null: the journal the next session's note is brought up to. */
function lastSession(io) {
  return sessionsHere(io).sort((a, b) => a.seen.localeCompare(b.seen)).at(-1) ?? null;
}

// an append never loses a row when two edits end together
const touch = (io, id, path) => io.home.append(sessionKey(io, id, 'touched'), `${path}\n`);
/** The files this session edited, most edited first: { n, rows: [{ path, n }] }. */
function touchedOf(io, id) {
  const text = io.home.readText(sessionKey(io, id, 'touched'), { maxBytes: BOUNDS.touchedBytes, tail: true }) || '';
  const counts = new Map();
  text.split('\n').filter(Boolean).forEach((path) => counts.set(path, (counts.get(path) || 0) + 1));
  const rows = [...counts].map(([path, n]) => ({ path, n })).sort((a, b) => b.n - a.n || a.path.localeCompare(b.path));
  return { n: rows.length, rows: rows.slice(0, BOUNDS.facts.touched) };
}

/** A session not seen for `sessionDays` leaves the home store with its messages and its list of edited files. */
function pruneSessions(io) {
  const limit = Date.parse(io.clock.now()) - BOUNDS.sessionDays * DAY;
  const old = sessionsHere(io).filter((session) => Date.parse(session.seen) < limit);
  old.forEach((session) => ['json', 'touched'].forEach((kind) => io.home.remove(sessionKey(io, session.session, kind))));
  return old.length;
}

/** Every message head kept here, oldest first: what the composition root hands DecisionBook to read a person's promises from. */
function heardHere(io) {
  if (!io.home) return [];
  const rows = sessionsHere(io).flatMap((session) => session.messages
    .map((m) => ({ id: `${shortId(session.session)}.${m.n}`, at: m.at, text: m.text })));
  return rows.sort((a, b) => a.at.localeCompare(b.at));
}

module.exports = { isSessionId, readNote, writeNote, readSession, sessionOf, lastSession, writeSession,
  touch, touchedOf, pruneSessions, heardHere };
