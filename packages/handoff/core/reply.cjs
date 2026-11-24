// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: the person's messages and what an AI sends back about them. A message is kept as a numbered head; a kept line holds the whole
// sentences its words stand in, in the message it names (a list's item with its opening sentence: a job a line), never a piece that
// changes what it says; it goes only with their later words about it. A reply is written whole or not at all, screened before stored.
const { text: { safe: { clip }, secrets: { clipped, scrub }, lines: { filled, shortId } }, host: { RESUME_PROMPT, draftCall },
  said: { sentencesOf, quotedAt, wholeOf, isAbout, intends, tokensOf, lowered } } = require('@atlasbound/kit');
const { shortOf } = require('../contracts/codes.cjs');
const { BOUNDS } = require('../contracts/shapes.cjs');
const WORDS = require('../contracts/words.json');

const NO_REQUEST = /^\s*(?:[A-Za-z]:)?[\\/~]\S*(?:[ \t]+[^\s\\/]*[\\/]\S*)*\s*$/; // a path alone asks nothing: `/name`, /tmp/notes.txt, and `/name` as a Windows shell turns it into one (C:/Program Files/Git/name)
const CITES = /\s*\[\s*(m\d+(?:\s*,\s*m\d+)*)\s*\]\s*$/;
const JOB = /^\s*job:\s*/i;
const DONE = /\b(?:done|complete|completed|finished|works)\b/i;
const SHA = /\b[0-9a-f]{7,40}\b/g;

const promptKind = (prompt) => (RESUME_PROMPT.test(prompt) ? 'resume' : NO_REQUEST.test(prompt) || !prompt.trim() ? 'slash' : 'words');

/** The session with one more message: numbered, screened and cut, its lines kept; over the bound the oldest go, never one a line names. */
function withMessage(session, text, at) {
  const n = session.count + 1;
  const all = [...session.messages, { n, at, text: scrub(text).slice(0, BOUNDS.message.chars).trim() }];
  const spare = all.filter((m) => !session.cited.includes(m.n)).slice(0, Math.max(0, all.length - BOUNDS.message.perSession));
  return { ...session, count: n, messages: all.filter((m) => !spare.includes(m)) };
}

/** The messages as the fill-in lists them: whole heads while they fit the bound, else each cut to its share of it. */
function messageLines(messages) {
  const whole = messages.reduce((sum, m) => sum + m.text.length, 0) <= BOUNDS.message.shown;
  const share = Math.max(40, Math.floor(BOUNDS.message.shown / Math.max(1, messages.length)));
  return messages.map((m) => `  m${m.n} ${clip(m.text, whole ? BOUNDS.message.chars : share)}`);
}

/** What `atlasbound handoff` prints after the note: the messages, the rules of the reply, the call to send (in `drafts`' drafts folder). */
function fillIn({ session, kept, flag, drafts }) {
  const cap = BOUNDS.kept.cap;
  const room = cap - kept.length;
  const slots = { ...BOUNDS.kept, steps: BOUNDS.next.steps, shown: session.messages.length, count: session.count, n: kept.length, room,
    oldest: kept.slice(0, 3).map((_, i) => `k${i + 1}`).join(', '), session: flag ? ` --session ${session.session}` : '' };
  const list = session.messages.length ? [filled(WORDS.messages, slots), ...messageLines(session.messages)] : [WORDS.messagesNone];
  const full = room < BOUNDS.kept.perHandoff && kept.length ? [filled(WORDS.full, slots)] : [];
  const call = draftCall(filled(WORDS.call, slots), 'handoff', WORDS.reply, drafts);
  return `${[...list, '', ...WORDS.fill.map((line) => filled(line, slots)), ...full, call].join('\n')}\n`;
}

/** One kept line as written: its words (unclipped, for the quote's test), the message numbers it ends with, whether a job. */
function writtenLine(raw) {
  const cited = CITES.exec(raw);
  const body = cited ? raw.slice(0, cited.index) : raw;
  const cites = cited ? [...new Set(cited[1].match(/\d+/g).map(Number))].slice(0, BOUNDS.kept.cites) : [];
  const words = scrub(body.replace(JOB, '')); // screened as the message heads are, so a quote of a secret compares as stored
  return { raw, words, cites, job: JOB.test(body) };
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
  const unfound = cited.filter(([, m]) => !quotedAt(line.words, sentencesOf(m.text)).length);
  const named = unfound.map(([n]) => `m${n} (${WORDS.notTheirs.unfound})`).join(', ');
  return unfound.length ? [{ code: 'kept-not-quoted', where: `${where}: ${named}` }] : [];
}

/** Why a drop's why does not stand on the person's words about the line, or null: it ends with the messages it quotes ([m9]), each heard
 * after the line was kept (else `unsourced`); its words are theirs in each, about the line or naming its number, and say done, dropped,
 * cancelled or changed (kit's tests); a number names a line only while none has left the list since the message was heard. */
function dropUnsaid({ k, why }, line, { messages, dropped }) {
  const cited = CITES.exec(why);
  const numbers = cited ? new Set(cited[1].match(/\d+/g).map(Number)) : new Set();
  const words = cited ? scrub(why.slice(0, cited.index)) : '';
  const later = messages.filter((m) => numbers.has(m.n) && Date.parse(m.at) > Date.parse(line.at));
  if (!numbers.size || later.length !== numbers.size) return 'unsourced';
  const moved = later.some((m) => dropped.some((gone) => Date.parse(gone.at) >= Date.parse(m.at))); // the same instant: could not tell
  return later.map((m) => (quotedAt(words, sentencesOf(m.text)).length ? null : 'unfound')).find(Boolean)
    ?? whyNotSettled(words, line.text, moved ? null : k);
}

/** Why `words` do not settle kept line `k` (its `text`): null when they do, `unrelated` (not about it, nor naming k<k>) or `no-intent`
 * (no word that says done, dropped, cancelled or changed). `k` null: the line's number names it no more. */
function whyNotSettled(words, text, k) {
  if (!(k !== null && tokensOf(lowered(words)).includes(`k${k}`)) && !isAbout(words, text)) return 'unrelated';
  return intends(words) ? null : 'no-intent';
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
    ...(lines.length > max.perHandoff ? [{ code: 'kept-too-many', where: filled(WORDS.keptTooMany, { n: lines.length, max: max.perHandoff }) }] : []),
    ...(total > max.cap ? [{ code: 'kept-over-cap', where: filled(WORDS.keptOverCap, { n: total, cap: max.cap }) }] : []),
  ];
}

/** A kept line's text: the whole sentences of `message` its `words` stand in (lineProblems found them there). */
const wholeLine = (words, { text }, units = sentencesOf(text)) => clipped(wholeOf(units, quotedAt(words, units)[0]), BOUNDS.kept.chars);

/** The note with a reply written into it, or the problems that refuse it. `by`: { session, at, head }: a kept line keeps the HEAD it
 * was kept at, so only a later commit takes a job out. */
function withReply(note, reply, seen, by) {
  const lines = (reply.kept || []).map(writtenLine);
  const problems = replyProblems(reply, lines, seen);
  if (problems.length) return { problems };
  const drops = reply.drop || [];
  const gone = (i) => drops.find((d) => d.k === i + 1);
  const who = { session: shortId(by.session) };
  const dropped = note.kept.flatMap((line, i) => (gone(i)
    ? [{ text: line.text, at: by.at, why: filled(WORDS.byReply, { ...who, why: clipped(gone(i).why, BOUNDS.kept.chars) }) }] : []));
  const head = by.head ? { head: by.head } : {};
  const added = [...new Map(lines.map(({ words, cites, job }) => [wholeLine(words, seen.messages.find((m) => m.n === cites[0])),
    { cites, job, session: who.session, at: by.at, ...head }])).entries()].map(([text, line]) => ({ text, ...line })); // one a sentence
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
