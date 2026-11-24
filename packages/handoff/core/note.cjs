// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: the note. It is built from measured facts and carries what the last handoff wrote (now, next, the kept lines). Rendered, it is
// one screen: the kept lines first, and when the screen is full the facts are cut from the end, never a kept line.
const { text: { safe: { clip }, lines: { counted, filled, shortSha, shortId } } } = require('@atlasbound/kit');
const { shortOf } = require('../contracts/codes.cjs');
const { SCHEMA, BOUNDS } = require('../contracts/shapes.cjs');
const { listedRows: listed } = require('../contracts/helpers.cjs');
const WORDS = require('../contracts/words.json');

const MINUTE = 60000; // an hour is 60 of them, a day 1440
const shaOrNone = (sha) => (sha ? shortSha(sha) : 'none');
const isStale = (note, head) => (note.facts.head || null) !== (head || null);

function noteAge(from, now) {
  const minutes = Math.max(0, Math.floor((Date.parse(now) - Date.parse(from)) / MINUTE));
  if (minutes < BOUNDS.age.minutes) return `${minutes} min ago`;
  return minutes < BOUNDS.age.hours ? `${Math.floor(minutes / 60)} h ago` : `${Math.floor(minutes / 1440)} days ago`;
}

/** The note of now: the facts just measured, what the note before it holds from the last handoff, and how many messages came since. */
function noteOf({ before, facts, session, at, heard = [] }) {
  const last = before || { now: null, next: [], kept: [], dropped: [], handed: null };
  const since = session ? session.count - session.handed : 0;
  return { schema: SCHEMA.note, at, session: session ? session.session : null, facts, now: last.now, next: last.next, kept: last.kept,
    dropped: last.dropped, handed: last.handed, since, heard: journalEnd(heard) };
}

/** The journal's part: the person's last messages here (`heard`: every head kept), whole, within its bound; the last one always. */
function journalEnd(heard) {
  const fits = (from) => heard.slice(from).reduce((sum, m) => sum + m.text.length, 0) <= BOUNDS.heard.chars;
  const from = heard.map((_, i) => i).slice(-BOUNDS.heard.messages).find(fits) ?? heard.length - 1;
  return heard.slice(Math.max(from, 0)).map(({ at, text, id }) => ({ at, text, session: id.split('.')[0] }));
}

/** A kept line as it reads: its number, a job named as one, the messages it quotes (of another session: said so, and called earlier only
 * when it was kept before the reader began), or typed by the person. */
function keptNoteLine(line, i, { session, began }) {
  const from = line.typed ? WORDS.typed : line.cites.map((n) => `m${n}`).join(', ');
  const whose = !line.typed && session && line.session !== shortId(session) ? `, ${began && line.at <= began ? WORDS.earlier : WORDS.another}` : '';
  return `  k${i + 1} ${line.job ? 'job: ' : ''}${clip(line.text, BOUNDS.kept.chars)} [${from}${whose}]`;
}
/** A dropped line as the note says it: its words and who dropped it, why. */
const droppedNoteLine = (d) => `  ${filled(WORDS.droppedLine, { text: clip(d.text, BOUNDS.droppedLine.text), why: clip(d.why, BOUNDS.droppedLine.why) })}`;

const unmeasuredLines = (facts, what) => facts.unmeasured.filter((u) => u.what === what).map((u) => `  ${what}: unknown (${shortOf(u.why)})`);

/** A plan as the note says it: its state, then what is still asked of the person; a draft also each decision of the person with
 * their sentence. A READY plan is frozen and its own session start says its decisions, so the note does not say them a second time. */
function planLines(p, max, cap = BOUNDS.plan) {
  const state = [clip(p.state, cap.state), p.level && clip(p.level, cap.state), p.unmet && `${p.unmet} unmet`].filter(Boolean).join(', ');
  const decided = p.state === 'ready' ? [] : (p.decided || []).slice(0, max.decided).map((d) => `    ${filled(WORDS.decided,
    { key: clip(d.key, cap.key), value: clip(d.value, cap.value), said: d.said ? ` ("${clip(d.said, cap.said)}")` : '' })}`);
  const open = (p.open || []).slice(0, max.decided).map((q) => `    ${filled(WORDS.open, { q: clip(q, cap.open) })}`);
  return [`  plan ${clip(p.id, cap.id)}: ${state}`, ...decided, ...open];
}

const ANSWERED = /(^|\s)[-*•]\s+[^"“]{0,40}["“][^"”]*["”]\s*[:：]\s*(?=[-*•]\s|$)/gu; // a list item's quoted opening with no answer left under it
const SAID_WORDS = 3; // a shorter sentence could stand anywhere in a message
/** A message without what a plan already holds of it as the person's own sentence (a decision's `said`): the plan says those. An item's
 * quoted question goes with its answer, a line that only opens the list with the list. -> what is left, '' where the plan holds it all */
function notInPlans(text, saids) {
  const left = saids.reduce((rest, said) => rest.split(said).join(''), text.replace(/\s+/g, ' ')).replace(ANSWERED, '$1').trim();
  return /[:：]$/u.test(left) ? '' : left;
}

/** The person's last messages as the journal kept their heads, the reader's own first, then other sessions' (one sent after the reader
 * began is of a session beside it: left out): what they said reaches a session that never saw it; what a plan holds is not said twice. */
function heardLines({ heard = [], facts }, { session, began }) {
  const saids = (facts.plans || []).flatMap((p) => p.decided || []).flatMap((d) => String(d.said || '').split('\n'))
    .map((said) => said.replace(/\s+/g, ' ').trim()).filter((said) => said.split(' ').length >= SAID_WORDS);
  const mine = (m) => Boolean(session) && m.session === shortId(session);
  const texts = (rows) => rows.map((m) => notInPlans(m.text, saids)).filter(Boolean);
  const shown = (title, rows) => (rows.length ? [`  ${title}`, ...rows.map((text) => `    - ${clip(text, BOUNDS.message.chars)}`)] : []);
  return [...shown(WORDS.heardMine, texts(heard.filter(mine))),
    ...shown(session ? WORDS.heardOther : WORDS.heard, texts(heard.filter((m) => !mine(m) && !(began && m.at > began))))];
}

function factLines(note, whose, live) {
  const { facts } = note;
  const max = BOUNDS.facts;
  const path = (p) => clip(p, max.path);
  const head = facts.head ? [`  HEAD ${shaOrNone(facts.head)}${facts.subject ? ` "${clip(facts.subject, max.subject)}"` : ''}`] : [];
  const subjects = (c) => c.rows.slice(0, max.commits).map((s) => `    "${clip(s, max.subject)}"`);
  const commits = facts.commits ? [`  ${counted(facts.commits.n, 'commit')} since ${whose} began`, ...subjects(facts.commits)] : [];
  const dirty = facts.dirty ? [filled(WORDS.dirtyFiles, { files: counted(facts.dirty.n, 'file') })] : [];
  const dirtyRows = facts.dirty && facts.dirty.n ? [`    ${listed(facts.dirty.rows.map(path), facts.dirty.n, max.dirty)}`] : [];
  const edits = (t) => listed(t.rows.map((f) => `${path(f.path)} x${f.n}`), t.n, max.touched);
  const touched = facts.touched && facts.touched.n ? [filled(WORDS.editedIn, { whose, edits: edits(facts.touched) })] : [];
  const plans = (facts.plans || []).slice(0, max.plans).flatMap((p) => planLines(p, max));
  const missing = ['head', 'commits', 'touched'].flatMap((what) => unmeasuredLines(facts, what));
  // what a new session cannot measure for itself comes first: the person's words and their decisions; git's facts are cut first
  return [...heardLines(note, live), ...plans, ...head, ...commits, ...dirty, ...dirtyRows, ...touched, ...missing];
}

/** The lines that are never cut: the head, the stale mark, the kept lines and the last ones dropped (who and why), the messages since,
 * now and next. */
function fixedLines(note, { now, head, ...reader }) {
  const branch = clip(note.facts.branch || 'detached HEAD', BOUNDS.facts.branch);
  const slots = { branch, at: note.at, age: now ? ` (${noteAge(note.at, now)})` : '', head: shaOrNone(note.facts.head), live: shaOrNone(head),
    n: note.kept.length, cap: BOUNDS.kept.cap };
  const stale = isStale(note, head) ? [filled(WORDS.stale, slots)] : [];
  const lines = note.kept.map((line, i) => keptNoteLine(line, i, reader));
  const kept = [...(lines.length ? [filled(WORDS.kept, slots), ...lines] : [WORDS.keptNone]), ...note.dropped.map(droppedNoteLine)];
  const since = note.since ? [filled(note.handed ? WORDS.since : WORDS.sinceNever, { n: counted(note.since, 'message') })] : [];
  const nowLine = note.now ? [`Now: ${clip(note.now, BOUNDS.now)}`] : [];
  const steps = note.next.slice(0, BOUNDS.next.steps).map((step, i) => `  ${i + 1}. ${clip(step, BOUNDS.next.chars)}`);
  return [filled(WORDS.head, slots), ...stale, ...kept, ...since, ...nowLine, ...(steps.length ? ['Next:', ...steps] : [])];
}

/** The note as one screen. `seen`: { now, head, session } of whoever reads it, `session` its record (null: none); with no `now` the note
 * names no age, so the same note is the same text (a hook's text is said once per context). Facts are added while they fit the bound. */
function renderNote(note, { session, ...seen }) {
  const live = { ...seen, session: session ? session.session : null, began: (session && session.started) || null };
  const out = [...fixedLines(note, live), filled(WORDS.facts, { at: note.at })];
  const other = live.session && note.session && live.session !== note.session; // a note of a session that ended, read by the next one
  const left = factLines(note, other ? WORDS.sessionBefore : WORDS.thisSession, live);
  const fits = (line) => out.length + 2 <= BOUNDS.note.lines && [...out, line, WORDS.cut].join('\n').length + 8 <= BOUNDS.note.chars;
  while (left.length && fits(left[0])) out.push(left.shift());
  return `${[...out, ...(left.length ? [filled(WORDS.cut, { n: counted(left.length, 'fact line') })] : [])].join('\n')}\n`;
}

module.exports = { shaOrNone, isStale, noteOf, renderNote };
