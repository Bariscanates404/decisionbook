// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The verb steps: `handoff` (the note from fresh facts, this session's messages and the fill-in), `handoff keep` (the reply, written
// whole or refused whole), `handoff show` (the note as stored) and `handoff drop` (a person's own drop or rewording of a kept line).
const { errors: { fail }, text: { lines: { filled, shortId } } } = require('@atlasbound/kit');
const { stepResult: result, bound } = require('../contracts/shapes.cjs');
const { liveOf: live } = require('../contracts/helpers.cjs');
const { shortOf } = require('../contracts/codes.cjs');
const { renderNote: render } = require('../core/note.cjs');
const { fillIn, shasIn, withReply, withoutLine, refusalText } = require('../core/reply.cjs');
const store = require('./store.cjs');
const { rebuilt } = require('./facts.cjs');
const WORDS = require('../contracts/words.json');

/** The session a verb speaks for: the one its flag names, else the one the host's environment names, else none. */
function sessionAsked(args, io) {
  const id = (args.flags && args.flags.session) || io.session || null;
  if (id && !store.isSessionId(id)) throw fail('args-invalid', WORDS.notSessionId);
  return { id, flag: Boolean(args.flags && args.flags.session) };
}

async function handoffStep(args, io) {
  const { id, flag } = sessionAsked(args, io);
  if (!id) {
    const bare = await rebuilt(io, null);
    return result('handoff-no-session', { text: `${render(bare, live(io, bare, null))}${WORDS.noSession}\n` }, { kept: bare.kept.length });
  }
  const session = store.sessionOf(io, id);
  const note = await rebuilt(io, session);
  const text = `${render(note, live(io, note, session))}\n${fillIn({ session, kept: note.kept, flag, drafts: io.session })}`;
  return result('note-built', { text }, { messages: session.messages.length, kept: note.kept.length, since: note.since });
}

/** The commit-like words of the reply that git knows here. */
async function provenIn(io, reply) {
  const words = [...new Set(shasIn(reply))];
  const known = await Promise.all(words.map((sha) => io.git.resolves(sha)));
  return words.filter((_, i) => known[i]);
}

/** Per dropped line number, the commits made since that line was kept (it keeps the HEAD it was kept at); none where that is not known. */
async function commitsAfter(io, kept, drops) {
  const rows = await Promise.all(drops.map((d) => (kept[d.k - 1] && kept[d.k - 1].head ? io.git.commits(kept[d.k - 1].head) : null)));
  return Object.fromEntries(drops.map((d, i) => [d.k, (rows[i] || []).map((row) => row.sha)]));
}

/** The reply the AI sent, or reply-invalid naming the field and showing the whole shape a reply takes. */
function sentReply(text) {
  try {
    return bound.shape('Reply', bound.json(text ?? '', 'reply-invalid'));
  } catch (err) {
    throw Object.assign(err, { routes: [`a reply: ${JSON.stringify(bound.example('Reply', { whole: true }).value)}`] });
  }
}

async function keepStep(args, io) {
  const { id } = sessionAsked(args, io);
  if (!id) return result('handoff-no-session', { text: `${shortOf('handoff-no-session')}\n` });
  const reply = sentReply(args.rest[0]);
  const session = store.sessionOf(io, id);
  const note = await rebuilt(io, session);
  const after = await commitsAfter(io, note.kept, reply.drop || []);
  const seen = { kept: note.kept, dropped: note.dropped, messages: session.messages, after, proven: await provenIn(io, reply) };
  const res = withReply(note, reply, seen, { session: id, at: io.clock.now(), head: await io.git.head() });
  if (res.problems.length) {
    const codes = Object.fromEntries(res.problems.map((p) => [p.code, res.problems.filter((q) => q.code === p.code).length]));
    const refused = result('reply-refused', { text: refusalText(res.problems), exit: 1 }, { problems: res.problems.length });
    return { ...refused, codes: { ...refused.codes, ...codes } };
  }
  store.writeNote(io, note.facts.branch, res.note);
  const cited = res.note.kept.filter((line) => line.session === shortId(id)).flatMap((line) => line.cites);
  store.writeSession(io, { ...session, handed: session.count, cited: [...new Set(cited)] });
  const text = `${WORDS.written}\n${render(res.note, live(io, res.note, session))}`;
  return result('note-kept', { text }, { kept: res.note.kept.length, added: (reply.kept || []).length, dropped: (reply.drop || []).length });
}

/** The note as stored, read against the live clock and HEAD; where DecisionBook's plans were read, how a kept line becomes binding. */
async function showStep(args, io) {
  const note = store.readNote(io, await io.git.branch());
  if (!note) return result('note-none', { text: `${shortOf('note-none')}\n` });
  const asked = sessionAsked(args, io).id; // a session this repository never saw: when it began is not known
  const reader = asked && (store.readSession(io, asked) || { session: asked });
  const text = render(note, { now: io.clock.now(), head: await io.git.head(), session: reader });
  return result('note-shown', { text: `${text}${note.facts.plans ? `${WORDS.decide}\n` : ''}` }, { kept: note.kept.length });
}

async function dropStep(args, io) {
  const k = Number(args.rest[0]);
  const branch = await io.git.branch();
  const note = store.readNote(io, branch);
  const next = note && withoutLine(note, k, args.rest.slice(1).join(' ').trim(), io.clock.now());
  if (!next) throw fail('drop-unknown', `k${args.rest[0] ?? ''}`);
  store.writeNote(io, branch, next);
  const edited = next.kept.length === note.kept.length;
  const line = filled(edited ? WORDS.edited : WORDS.dropped, { k, text: (edited ? next : note).kept[k - 1].text });
  return result(edited ? 'line-edited' : 'line-dropped', { text: `${line}\n` }, { kept: next.kept.length });
}

module.exports = { sessionAsked, handoffStep, keepStep, showStep, dropStep };
