// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The hook steps. None blocks, none asks, none calls a model: a start says the branch's note once, a prompt keeps the head of the
// message and measures the context, an edit is counted, a compaction rebuilds the note from facts.
const { errors: { isFail } } = require('@atlasbound/kit');
const { stepResult: said, CONTEXT, bound } = require('../contracts/shapes.cjs');
const { shortOf } = require('../contracts/codes.cjs');
const { promptKind, withMessage } = require('../core/reply.cjs');
const context = require('../core/context.cjs');
const store = require('./store.cjs');
const { rebuilt, noteText } = require('./facts.cjs');
const WORDS = require('../contracts/words.json');

/** A new session, and one after a clear or a compaction, is told the note once (the port's rule for one key says it once per context). */
async function startStep(event, io) {
  const id = event.session_id;
  const pruned = store.pruneSessions(io);
  let refreshed = 0;
  if (!store.readSession(io, id)) {
    // a session that ended with no turn's end (a closed terminal, a crash, a cut) left its journal: the note is brought up to it first
    // (the branch's note is that session's when its last message was said here)
    const note = store.readNote(io, await io.git.branch());
    const last = note && store.lastSession(io);
    refreshed = last && last.session === note.session ? 1 : 0;
    if (refreshed) await rebuilt(io, last);
    store.writeSession(io, store.sessionOf(io, id, await io.git.head()));
  }
  const text = await noteText(io, id);
  const told = said(text ? 'note-said' : 'note-none', text ? { say: [{ key: 'handoff.note', text: `${WORDS.said}\n${text}` }] } : {}, { pruned, refreshed });
  return refreshed ? { ...told, codes: { ...told.codes, 'note-refreshed': 1 } } : told;
}

/** The transcript's last bytes when it lies under the person's home; else null (nothing is said). */
function transcriptOf(event, io) {
  const home = io.env.userHome();
  const path = String(event.transcript_path || '');
  if (!home || !path.startsWith(`${home}/`)) return null;
  try {
    return io.home.readText(path.slice(home.length + 1), { maxBytes: CONTEXT.tailBytes, tail: true });
  } catch (err) {
    if (!isFail(err)) throw err;
    return null;
  }
}

/** ONE notice per session, once the context passes the notice point: -> the session's new measure and what to say. */
function contextMeasured(event, io, before) {
  const env = { max: io.env.get(CONTEXT.env.max), no1m: io.env.get(CONTEXT.env.no1m) };
  const seen = context.contextOf(transcriptOf(event, io), { env, rules: CONTEXT }, bound.jsonOrNull);
  const code = context.noticeCode(seen, before, CONTEXT);
  const at = io.clock.now();
  const noticed = code === 'context-notice' ? at : before && before.noticed;
  const say = code === 'context-notice' ? [{ key: 'handoff.context', text: `${context.contextLine(seen)}: ${shortOf(code)}.` }] : [];
  return { context: { code, at, ...seen, ...(noticed ? { noticed } : {}) }, say };
}

async function messageStep(event, io) {
  const prompt = String(event.prompt || '');
  const kind = promptKind(prompt);
  if (kind === 'resume') {
    const text = await noteText(io, event.session_id);
    return said(text ? 'resume-said' : 'note-none', text ? { context: `${WORDS.resume}\n${text}` } : {});
  }
  if (kind === 'slash') return said('message-passed');
  const session = withMessage(store.sessionOf(io, event.session_id), prompt, io.clock.now());
  const now = contextMeasured(event, io, session.context);
  store.writeSession(io, { ...session, context: now.context });
  await rebuilt(io, session); // the note holds this message from now on, whatever ends the session
  const kept = said('message-kept', now.say.length ? { say: now.say } : {}, { messages: session.messages.length });
  return { ...kept, codes: { ...kept.codes, [now.context.code]: 1, 'note-refreshed': 1 } };
}

/** An Edit, Write or MultiEdit that ended: the file's path in the repository is counted for the session. */
async function touchedStep(event, io) {
  const key = io.fs.keyAt(String((event.tool_input && event.tool_input.file_path) || ''));
  if (!key || key.includes('\n')) return said('file-outside');
  store.touch(io, event.session_id, key);
  return said('file-touched');
}

/** A turn's end and a compaction: no model is asked; the note is rebuilt from the session's journal and fresh facts and keeps its kept
 * lines, so whatever starts next in this repository is told the note as it stands. */
async function refreshStep(event, io) {
  const note = await rebuilt(io, store.sessionOf(io, event.session_id));
  const code = event.hook_event_name === 'PreCompact' ? 'note-built' : 'note-refreshed';
  return said(code, {}, { kept: note.kept.length, since: note.since, heard: note.heard.length });
}

module.exports = { startStep, messageStep, touchedStep, compactStep: refreshStep, stopStep: refreshStep };
