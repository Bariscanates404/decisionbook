// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: the person's messages and what an AI sends back about them. A message is kept as a numbered head; a kept line holds the
// person's own words of the message it names (kit's one test of them: whole clauses, a sentence with a negation only whole), so it is
// their words and not the model's memory or a piece of them. A line goes only with their words about it from a later message. A reply
// is written whole or not at all, and every text of it passes the secret screen before it is stored.
const { text: { safe: { clip }, secrets: { clipped, scrub }, lines: { filled } }, host: { RESUME_PROMPT },
  said: { clausesOf, notTheirs, notSettling } } = require('@atlasbound/kit');
const { shortOf } = require('../contracts/codes.cjs');
const { BOUNDS } = require('../contracts/shapes.cjs');
const WORDS = require('../contracts/words.json');

const BARE_SLASH = /^\s*\/[A-Za-z][\w:.-]*\s*$/; // `/name` alone; a path such as /tmp/notes.txt is words
const CITES = /\s*\[\s*(m\d+(?:\s*,\s*m\d+)*)\s*\]\s*$/;
const JOB = /^\s*job:\s*/i;
const DONE = /\b(?:done|complete|completed|finished|works)\b/i;
const SHA = /\b[0-9a-f]{7,40}\b/g;

function promptKind(prompt) {
  if (RESUME_PROMPT.test(prompt)) return 'resume';
  return BARE_SLASH.test(prompt) || !prompt.trim() ? 'slash' : 'words';
}

/** The session with one more message: numbered, its head clipped after the secret screen. Over the bound the oldest go first, never one
 * a kept line names. */
function withMessage(session, text, at) {
  const n = session.count + 1;
  const all = [...session.messages, { n, at, text: clipped(text, BOUNDS.message.chars) }];
  const spare = all.filter((m) => !session.cited.includes(m.n)).slice(0, Math.max(0, all.length - BOUNDS.message.perSession));
  return { ...session, count: n, messages: all.filter((m) => !spare.includes(m)) };
}

/** The messages as the fill-in lists them: whole heads while they fit the bound, else each cut to its share of it. */
function messageLines(messages) {
  const whole = messages.reduce((sum, m) => sum + m.text.length, 0) <= BOUNDS.message.shown;
  const share = Math.max(40, Math.floor(BOUNDS.message.shown / Math.max(1, messages.length)));
  return messages.map((m) => `  m${m.n} ${whole ? m.text : clip(m.text, share)}`);
}

/** What `atlasbound handoff` prints after the note: the messages, the rules of the reply, the call to send. */
function fillIn({ session, kept, flag }) {
  const cap = BOUNDS.kept.cap;
  const room = cap - kept.length;
  const slots = { ...BOUNDS.kept, steps: BOUNDS.next.steps, shown: session.messages.length, count: session.count, n: kept.length, room,
    oldest: kept.slice(0, 3).map((_, i) => `k${i + 1}`).join(', '), session: flag ? ` --session ${session.session}` : '' };
  const list = session.messages.length ? [filled(WORDS.messages, slots), ...messageLines(session.messages)] : [WORDS.messagesNone];
  const full = room < BOUNDS.kept.perHandoff && kept.length ? [filled(WORDS.full, slots)] : [];
  return `${[...list, '', ...WORDS.fill.map((line) => filled(line, slots)), ...full, filled(WORDS.call, slots)].join('\n')}\n`;
}

/** One kept line as written: its words (unclipped, for the quote's test), its text, the message numbers it ends with, whether a job. */
function writtenLine(raw) {
  const cited = CITES.exec(raw);
  const body = cited ? raw.slice(0, cited.index) : raw;
  const cites = cited ? [...new Set(cited[1].match(/\d+/g).map(Number))].slice(0, BOUNDS.kept.cites) : [];
  const words = scrub(body.replace(JOB, '')); // screened as the message heads are, so a quote of a secret compares as stored
  return { raw, words, text: clipped(words, BOUNDS.kept.chars), cites, job: JOB.test(body) };
}


/** Every commit-like word of a reply: the edge asks git which of them exist. */
const shasIn = (reply) => [reply.now || '', ...(reply.next || []), ...(reply.kept || []), ...(reply.drop || []).map((d) => d.why)]
  .flatMap((text) => text.match(SHA) || []);

/** A kept line names its messages, each is in the list, and its words are the person's own in each: else the problem, with why. */
function lineProblems(line, where, { messages }) {
  if (!line.cites.length) return [{ code: 'kept-uncited', where }];
  const cited = line.cites.map((n) => [n, messages.find((m) => m.n === n)]);
  const strangers = cited.filter(([, m]) => !m);
  if (strangers.length) return [{ code: 'kept-cites-unknown', where: `${where}: ${strangers.map(([n]) => `m${n}`).join(', ')}` }];
  const others = cited.map(([n, m]) => [n, notTheirs(line.words, clausesOf(m.text))]).filter(([, why]) => why);
  const named = others.map(([n, why]) => `m${n} (${WORDS.notTheirs[why]})`).join(', ');
  return others.length ? [{ code: 'kept-not-quoted', where: `${where}: ${named}` }] : [];
}

/** Why a drop's why does not stand on the person's words about the line, or null: it ends with the messages it quotes ([m9]), each
 * heard after the line was kept (else `unsourced`); its words are the person's own in each, are about the line or name its number,
 * and say it is done, dropped, cancelled or changed (kit's one test of each). A number names a line only while no line has left
 * the list since the message was heard: after that the numbers have moved. */
function dropUnsaid({ k, why }, line, { messages, dropped }) {
  const cited = CITES.exec(why);
  const numbers = cited ? new Set(cited[1].match(/\d+/g).map(Number)) : new Set();
  const words = cited ? scrub(why.slice(0, cited.index)) : '';
  const later = messages.filter((m) => numbers.has(m.n) && Date.parse(m.at) > Date.parse(line.at));
  if (!numbers.size || later.length !== numbers.size) return 'unsourced';
  const moved = later.some((m) => dropped.some((gone) => Date.parse(gone.at) >= Date.parse(m.at))); // the same instant: could not tell
  return later.map((m) => notTheirs(words, clausesOf(m.text))).find(Boolean) ?? notSettling(words, line.text, moved ? null : k);
}

/** `after`: per dropped line number, the commits made since that line was kept (a job's other way out). */
function dropProblems(drop, { kept, after, ...heard }) {
  const line = kept[drop.k - 1];
  if (!line) return [{ code: 'drop-unknown', where: `drop k${drop.k}` }];
  const unsaid = dropUnsaid(drop, line, heard);
  const committed = line.job && (drop.why.match(SHA) || []).some((word) => (after[drop.k] || []).some((sha) => sha.startsWith(word)));
  if (!unsaid || committed) return [];
  const why = unsaid === 'unsourced' ? '' : ` (${WORDS.notTheirs[unsaid]})`;
  return [{ code: line.job ? 'job-drop-unsourced' : 'drop-unsourced', where: `drop k${drop.k}${why}` }];
}

/** What is wrong with a reply, each with its code and where. `seen`: { kept, dropped, messages, after, proven }: the lines kept so far
 * and those that left, this session's messages, the commits since each dropped line was kept, the reply's commit-like words that exist. */
function replyProblems(reply, lines, seen) {
  const unproven = (where, text) => (DONE.test(text) && !(text.match(SHA) || []).some((sha) => seen.proven.includes(sha))
    ? [{ code: 'done-unproven', where }] : []);
  const drops = reply.drop || [];
  const total = seen.kept.length - new Set(drops.map((d) => d.k)).size + lines.length;
  const max = BOUNDS.kept;
  return [
    ...unproven('now', reply.now || ''),
    ...(reply.next || []).flatMap((step, i) => unproven(`next ${i + 1}`, step)),
    ...lines.flatMap((line, i) => [...lineProblems(line, `kept ${i + 1}`, seen), ...unproven(`kept ${i + 1}`, line.raw)]),
    ...drops.flatMap((drop) => dropProblems(drop, seen)),
    ...(lines.length > max.perHandoff ? [{ code: 'kept-too-many', where: `kept: ${lines.length}, at most ${max.perHandoff}` }] : []),
    ...(total > max.cap ? [{ code: 'kept-over-cap', where: `kept: ${total}, the cap is ${max.cap}; the oldest are k1, k2, k3` }] : []),
  ];
}

/** The note with a reply written into it, or the problems that refuse it. `by`: { session, at, head }: a kept line keeps the HEAD it
 * was kept at, so only a later commit takes a job out. */
function withReply(note, reply, seen, by) {
  const lines = (reply.kept || []).map(writtenLine);
  const problems = replyProblems(reply, lines, seen);
  if (problems.length) return { problems };
  const drops = reply.drop || [];
  const gone = (i) => drops.find((d) => d.k === i + 1);
  const who = { session: by.session.slice(0, 8) };
  const dropped = note.kept.flatMap((line, i) => (gone(i)
    ? [{ text: line.text, at: by.at, why: filled(WORDS.byReply, { ...who, why: clipped(gone(i).why, BOUNDS.kept.chars) }) }] : []));
  const head = by.head ? { head: by.head } : {};
  const added = lines.map(({ text, cites, job }) => ({ text, cites, job, session: who.session, at: by.at, ...head }));
  return { problems, note: { ...note, now: reply.now ? clipped(reply.now, BOUNDS.now) : null,
    next: (reply.next || []).filter(Boolean).slice(0, BOUNDS.next.steps).map((step) => clipped(step, BOUNDS.next.chars)),
    kept: [...note.kept.filter((_, i) => !gone(i)), ...added], dropped: [...note.dropped, ...dropped].slice(-BOUNDS.dropped),
    handed: by.at, since: 0 } };
}

/** The person's own drop of kept line `k` (the verb is a person's: the cli lets no one else through), or its new words when `text`
 * holds any: the old line goes to the dropped list and the new one, typed by the person, takes its place. null: no such line. */
function withoutLine(note, k, text, at) {
  const line = note.kept[k - 1];
  if (!line) return null;
  const dropped = [...note.dropped, { text: line.text, at, why: text ? WORDS.rewordedByVerb : WORDS.byVerb }].slice(-BOUNDS.dropped);
  const typed = { text: clipped(text, BOUNDS.kept.chars), cites: [], session: line.session, at, job: line.job, typed: true };
  const kept = text ? note.kept.map((one, i) => (i === k - 1 ? typed : one)) : note.kept.filter((_, i) => i !== k - 1);
  return { ...note, kept, dropped };
}

const refusalText = (problems) => `${[WORDS.refused, ...problems.map((p) => `  ${p.where}: ${shortOf(p.code)}`)].join('\n')}\n`;

module.exports = { promptKind, withMessage, fillIn, shasIn, withReply, withoutLine, refusalText };
