// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Rows in the person's own home, never in a repository (git would replace an ignored file); no home: whatever needs a yes is asked again.
const { storedLine, bound: { jsonOrNull } } = require('../contracts/shapes.cjs');
const { paths: { hereKey }, person: { saidAfter } } = require('@atlasbound/kit');
const { sessionName, isSessionName, startName } = require('../base/here.cjs');
const { sealedSaid, isTime, isAfter } = require('../base/text.cjs');
const { store: KEPT } = require('../contracts/promise.json');

// a crash may tear the last line; a kept value is one line, so it is the first row
const hereRows = (io, name) => ((io.home && io.home.readText(hereKey(io.root, 'decisionbook', name), { noLink: true })) || '').split('\n').map(jsonOrNull).filter(Boolean);
const hereHas = (io, name, match) => hereRows(io, name).some(match);
const hereAdd = (io, name, row) => io.home && io.home.append(hereKey(io.root, 'decisionbook', name), `${JSON.stringify({ ...row, at: io.clock.now() })}\n`);
const hereValue = (io, name) => hereRows(io, name)[0] ?? null;
const hereKeep = (io, name, value) => io.home && io.home.writeAtomic(hereKey(io.root, 'decisionbook', name), `${JSON.stringify({ ...value, at: io.clock.now() })}\n`);

/** Every row every session of this repository kept on this machine. */
const everyRow = (io) => (io.home.list(hereKey(io.root, 'decisionbook')) || []).filter(isSessionName).flatMap((name) => hereRows(io, name));
const sessionRows = (io, session) => (session ? hereRows(io, sessionName(session)) : []);
const sessionAdd = (io, session, row) => session && hereAdd(io, sessionName(session), row);
const sessionReads = (io, session) => sessionRows(io, session).filter((row) => row.t === 'read').map(({ id, door }) => ({ id, door }));

function sessionRead(io, session, ids, door) {
  const read = sessionReads(io, session);
  [...new Set(ids)].filter((id) => !read.some((r) => r.id === id && r.door === door)).forEach((id) => sessionAdd(io, session, { t: 'read', id, door }));
}

// A read receipt: a file of this repository this session read (a Read, or a shell command that names it), with the tool it came
// through; once per session and file, one `research.read` row each. A write is no read; a tool's answer leaves none.
const OPENED = 'opened';
function keepReads(io, session, files, via) {
  const had = sessionRows(io, session).filter((row) => row.t === OPENED).map((row) => row.file);
  [...new Set(io.home && session ? files : [])].filter((file) => !had.includes(file)).forEach((file) => {
    sessionAdd(io, session, { t: OPENED, file, via });
    const code = via === 'Read' ? 'read-by-tool' : 'read-by-shell';
    io.trace.record({ run: io.run, step: 'research.read', ok: true, n: {}, codes: { [code]: 1 }, ref: { file, via, session } });
  });
}
/** The files read in each plan's sessions (a session whose rows name the plan, and this one), per plan id; no home: none. */
function readsByPlan(io) {
  const names = io.home ? (io.home.list(hereKey(io.root, 'decisionbook')) || []).filter(isSessionName) : [];
  const named = (rows, id) => rows.some((row) => row.id === id || Object.hasOwn(row.plans || {}, id));
  const sessions = names.map((name) => [io.session && name === sessionName(io.session), hereRows(io, name)]);
  const opened = (rows) => rows.filter((row) => row.t === OPENED).map((row) => row.file);
  return (id) => [...new Set(sessions.filter(([here, rows]) => here || named(rows, id)).flatMap(([, rows]) => opened(rows)))];
}

// how a session began (task, resume or other) and each person's /resume-handoff in it, a flag per row, never the prompt's words; no row: it
// cannot tell.
// a row per prompt, so the last one's time says when a person last had a turn
function begunOf(io, session) {
  const rows = sessionRows(io, session).filter((row) => row.t === 'prompt');
  return { as: rows[0]?.as ?? null, resumed: rows.some((row) => row.as === 'resume'), lastAt: rows.at(-1)?.at ?? null };
}
/** Whether `session` works on READY plan `view`: it made or built from it (a `phase` row), wrote to it (a `read` row of door `write`), the
 * plan went READY while it ran, the person resumed their handoff in it, or it began with no new task (a short reply first, or no message
 * yet); no home or no session: it does. Named limit: two sessions at once on one branch both work on the READY one made meanwhile. */
function worksOn(io, session, view) {
  const on = (row) => row.id === view.id && (row.t === 'phase' || (row.t === 'read' && row.door === 'write'));
  const begun = begunOf(io, session);
  if (!io.home || !session || sessionRows(io, session).some(on) || begun.resumed || begun.as !== 'task') return true;
  const since = startedAt(io, session);
  return Boolean(since && view.ready && isAfter(view.ready.at, since));
}
// the decisions the plan pack said in this context, `<id>/<key>`; a compaction or clear (a `forgot` row) ends the context that held them
const PACK_ROW = 'packed'; // steps/pack's row of the decisions a pack listed
const SAID_BY = { [PACK_ROW]: (said, row) => new Set([...said, ...row.refs]), forgot: () => new Set() };
const saidByPack = (io, session) => sessionRows(io, session)
  .reduce((said, row) => (SAID_BY[row.t] ? SAID_BY[row.t](said, row) : said), new Set());
const FORGETS = ['compact', 'clear']; // a SessionStart source whose context no longer holds what was said
const contextEnds = (io, event) => FORGETS.includes(event.source) && sessionAdd(io, event.session_id, { t: 'forgot' });
// a prompt's row: its flag, and its clauses sealed (a digest beside each sentence, in the person's home), which test a `said` as theirs
const keepPrompt = (io, session, { as, text }) => sessionAdd(io, session, { t: 'prompt', as, said: sealedSaid(text) });
/** The person's prompts this session's rows hold, oldest first (a time, a flag and sealed clauses each): the only messages a record
 * made as theirs may quote (core/yes), so a prompt of another session (one the AI could start itself) never counts; null outside a
 * session. */
const promptsOf = (io) => (io.session ? sessionRows(io, io.session).filter((row) => row.t === 'prompt') : null);
/** Who acts here, by kit's one answer (the root's `io.actor`) over those rows. */
const actorOf = (io) => io.actor(promptsOf(io));
/** Whether a person stands behind an act on what was made at `at` (a plan's `new`): yes, no, or unknown, never a yes (kit's rule). */
const promptedSince = (io, at) => saidAfter(actorOf(io), at);

// DecisionBook's own ear, the statements kept from prompts, in this repository's home folder; no home: nothing is kept
const keptRows = (io) => hereRows(io, KEPT);
const keepRows = (io, rows) => io.home && io.home.writeAtomic(hereKey(io.root, 'decisionbook', KEPT), rows.map((row) => storedLine(row, row.at)).join(''));
const keptAt = (io) => (io.home ? `~/${hereKey(io.root, 'decisionbook', KEPT)}` : null);

const keptStart = (io, session) => (session ? hereValue(io, startName(session)) : null);
const startedAt = (io, session) => [(keptStart(io, session) || {}).at].find(isTime) || null;

module.exports = { everyRow, hereRows, hereHas, hereAdd, hereValue, hereKeep, sessionRows, sessionAdd, sessionReads, sessionRead, keepReads,
  readsByPlan, saidByPack, contextEnds, keepPrompt, promptsOf, actorOf, promptedSince, begunOf, worksOn, keptRows,
  keepRows, keptAt, keptStart, startedAt };
