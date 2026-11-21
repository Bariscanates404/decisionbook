// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Handoff's helper module: the small helpers its logic shares. Nothing here decides.
const { errors: { fail }, hash: { sha256 }, paths: { hereKey } } = require('@atlasbound/kit');
const { UNREADABLE, shaped } = require('./shapes.cjs');
const { shortOf } = require('./codes.cjs');

const slugOf = (branch) => branch.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60);
// the note's file name for a branch: 16 hex of the exact name keep `a/b`, `a.b` and `a-b` apart
const streamName = (branch) => (branch ? `${slugOf(branch)}-${sha256(branch).slice(0, 16)}` : '~detached');

// everything the handoff keeps: this repository's folder in the person's home, a key of `io.home`
const hereOf = (io) => hereKey(io.root, 'handoff');
const noteKey = (io, branch) => `${hereOf(io)}/notes/${streamName(branch)}.json`;
const sessionKey = (io, id, kind = 'json') => `${hereOf(io)}/sessions/${id}.${kind}`;
/** The sessions that have a record here, by their ids. */
function sessionIds(io) {
  const names = io.home.list(`${hereOf(io)}/sessions`) || [];
  return names.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5));
}
/** The record a step works on, or null where there is none. One that does not read refuses the step by `code`, naming its file and
 * what to do, so nothing is written over it. */
function storedRecord(io, key, shape, code) {
  const value = shaped(io.home.readText(key), shape);
  if (value === UNREADABLE) throw fail(code, `~/${key}: ${shortOf(code)}`);
  return value;
}
/** Every session's record that reads here. One that does not is its own session's refusal, never another's: it is left out, and kept. */
const sessionsHere = (io) => sessionIds(io).map((id) => shaped(io.home.readText(sessionKey(io, id)), 'Session'))
  .filter((session) => session !== UNREADABLE);

/** The first `max` of `rows` on one line, and how many more there are of `n`. */
const listedRows = (rows, n, max) => `${rows.slice(0, max).join(', ')}${n > max ? ` (+${n - max} more)` : ''}`;
/** Who reads a note a verb just built: the clock now, the HEAD it was built at (so it is never stale), the asking session's record. */
const liveOf = (io, note, session) => ({ now: io.clock.now(), head: note.facts.head, session });

module.exports = { hereOf, noteKey, sessionKey, storedRecord, sessionsHere, listedRows, liveOf };
