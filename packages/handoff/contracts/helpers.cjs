// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Handoff's helper module: the small helpers its logic shares. Nothing here decides.
const { hash: { sha256 }, paths: { hereKey } } = require('@atlasbound/kit');

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

/** The first `max` of `rows` on one line, and how many more there are of `n`. */
const listedRows = (rows, n, max) => `${rows.slice(0, max).join(', ')}${n > max ? ` (+${n - max} more)` : ''}`;
/** Who reads a note a verb just built: the clock now, the HEAD it was built at (so it is never stale), the asking session. */
const liveOf = (io, note, session) => ({ now: io.clock.now(), head: note.facts.head, session });

module.exports = { hereOf, noteKey, sessionKey, sessionIds, listedRows, liveOf };
