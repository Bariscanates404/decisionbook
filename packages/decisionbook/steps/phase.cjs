// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A plan's phases in the trace: created, READY, the first write the gate allowed under it. One `plan.phase` row each, once per plan
// and session, with what it took since the phase before it (or since the session's first row): seconds, the person's turns, and the
// tool calls DecisionBook saw (a shell command; a file read, edited or written: the tools its handlers are wired to). No session or
// home: nothing is kept and no row is written.
const { isBefore, secondsBetween } = require('../base/text.cjs');
const { sessionRows, sessionAdd } = require('./here.cjs');

const PHASE = 'phase';
const CALL = 'call';
const SEEN = [CALL, 'file']; // a shell command's row, and the row steps/recall keeps of each file read or edited

/** One tool call DecisionBook saw in this session: counted, nothing of it kept. */
const sawCall = (io, session) => sessionAdd(io, session, { t: CALL });

/** `name`: created | ready | first-write. */
function phase(io, { session_id: session = io.session }, id, name) {
  const rows = sessionRows(io, session);
  if (!io.home || !session || rows.some((row) => row.t === PHASE && row.id === id && row.phase === name)) return;
  const from = rows.findLast((row) => row.t === PHASE && row.id === id) || rows[0];
  const since = from ? rows.filter((row) => !isBefore(row.at, from.at)) : [];
  const now = io.clock.now();
  const n = { seconds: from ? secondsBetween(from.at, now) : 0,
    turns: since.filter((row) => row.t === 'prompt').length, calls: since.filter((row) => SEEN.includes(row.t)).length };
  sessionAdd(io, session, { t: PHASE, id, phase: name });
  io.trace.record({ run: io.run, step: 'plan.phase', ok: true, n, codes: { [`phase-${name}`]: 1 }, ref: { plan: id, session } });
}

module.exports = { PHASE, phase, sawCall };
