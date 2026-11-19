// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE one owner of "the person's words", PURE: whole clauses of their own message (a sentence with a negation only whole), what words
// are about and what settles a line; the words are data (said.json), by language. Named limit: polarity carried by something the lists
// do not hold (a verb's ending, irony) is not seen.
const RULES = require('./said.json');
const { lowered, roleList, holdsAny, contentOf, among } = require('./said-words.cjs'); // what a word is

const [NEGATIONS, INTENT, JOINING] = ['negations', 'intent', 'joins'].map((role) => roleList(RULES.languages, role));
const CLOSE = '["\'”’)\\]*_`]*'; // what may close a sentence after its mark: a quote, a bracket, Markdown's emphasis or code mark
const FULL_STOP = new RegExp(`[.!?…。！？]${CLOSE}\\s*$`, 'u'); // a sentence's end
// a sentence ends after its mark; a quote opened after a colon (`its answer: "…"`) is a sentence of its own
const SENTENCES = new RegExp(`(?<=[.!?…]${CLOSE})\\s+|(?<=[。！？])|(?<=[:：])\\s*(?=["“«「])`, 'u');
const ITEM = /^\s*(?:[-*•·‣–—]|\d+[.)])\s+/u; // a list item's mark
const OPENS_LIST = /[:：]$/u; // a line whose list is of its own sentence
const ASKED = /^[^"“«「]{0,40}(?:"[^\n]*?"|“[^\n]*?”|«[^\n]*?»|「[^\n]*?」)\s*[:：]\s+/u; // an item that opens by quoting what it answers
const JOINS = JOINING.words.join('|');
const CLAUSES = new RegExp(`[,;:]\\s+|[,;:]$|[、，；：]|\\s+[-–—]\\s+|\\s+(?:${JOINS}|&)\\s+`, 'iu');
const LEAD = new RegExp(`^(?:${JOINS})\\s+`, 'iu'); // a joining word that opens a clause is no part of it
const EDGES = /^[\s"'“”‘’«»`([]+|[\s"'“”‘’«»`)\].,;:!?…。、，；：！？]+$/gu;
const NUMBERED = /(?<![^\s])(\d+)[.)]\s+(?=\S)/gu; // a numbered item's mark, at a line's start or after a space
const clauseKey = (text) => text.replace(EDGES, '').replace(LEAD, '').replace(/\s+/g, ' ').trim();
/** A text's lines, a numbered list written on one line ("1. … 2. … 3. …", from the line's start or after a colon, the numbers in
 * their order; of two marks of one number the one after a full stop) as a line per item, like the list written on several. Named
 * limit: "1. Use version 2. It is faster" reads as two items. */
function itemLines(text) {
  return String(text ?? '').split('\n').flatMap((line) => {
    const marks = [...line.matchAll(NUMBERED)];
    const stops = (mark) => /[.!?…;:：]\s*$/u.test(line.slice(0, mark.index));
    const next = (run, mark, i) => { // the mark that goes on the run: the next number, a later mark of it after a stop first
      const goes = !run.length || Number(mark[1]) === Number(run.at(-1)[1]) + 1;
      const later = marks.slice(i + 1).some((one) => one[1] === mark[1] && stops(one) && !stops(mark));
      return goes && !(run.length && later) ? [...run, mark] : run;
    };
    const from = marks.findIndex((mark) => /(?:^|[:：])\s*$/u.test(line.slice(0, mark.index)));
    const cuts = marks.slice(from < 0 ? marks.length : from).reduce((run, mark) => next(run, mark, marks.indexOf(mark)), []);
    const items = cuts.map((mark, i) => line.slice(mark.index, cuts[i + 1]?.index));
    return cuts.length < 2 ? [line] : [line.slice(0, cuts[0].index), ...items].filter((part) => part.trim());
  });
}

/** One line as the pieces its sentences are read by: an item of a list whose opening line holds a negation (`governed`) is a piece of
 * that sentence (`within`); any other item is its own sentences. A blank line and a list's edge end the sentence before (`ends`). */
function piecesOf(line, governed) {
  const item = ITEM.test(line);
  const body = line.replace(ITEM, '').trim();
  const within = item && governed;
  const asked = item && !within ? (ASKED.exec(body) || [''])[0] : '';
  const pieces = within ? [body] : body.slice(asked.length).split(SENTENCES);
  return { item, body, within, asked, pieces, ends: !body || governed !== item };
}

/** Every clause of a text (no cut: what the person wrote is all read), each with its sentence and whether it holds a negation. A clause
 * of a list item also holds `item` (which item of the message, from 1) and, in the item's quoted opening (`About "<what it answers>":`,
 * the words of whoever asked, a sentence of their own), `lead`. -> [{ key, sentence, no, item?, lead? }] */
function clausesOf(text) {
  const out = [];
  let sentence = 0;
  let items = 0;
  let governed = false;
  for (const line of itemLines(lowered(text))) {
    const { item, body, within, asked, pieces, ends } = piecesOf(line, governed);
    const from = out.length;
    sentence += Number(ends);
    items += Number(item);
    const add = (piece, lead) => piece.split(CLAUSES).map(clauseKey).filter(Boolean)
      .forEach((key) => out.push({ key, sentence, no: holdsAny(NEGATIONS, key), ...(item && { item: items }), ...lead }));
    if (asked) {
      add(asked, { lead: true });
      sentence += 1;
    }
    pieces.forEach((piece, i) => {
      add(piece);
      sentence += Number(!within && (FULL_STOP.test(piece) || (i < pieces.length - 1 && /[:：]$/u.test(piece)))); // or a quote follows
    });
    governed = within || (OPENS_LIST.test(body) && out.slice(from).some((clause) => clause.no));
  }
  return out;
}

/** Where `words` stand in a message (`said`: its clauses) as a run of its whole clauses (a quoted opening of an item may be left out):
 * `run`, the first that takes every negated sentence whole, whole items first (null: none); `any`: there is a run. No window per place. */
function standsAt(words, said, seal) {
  const quoted = clausesOf(words).map((clause) => seal(clause.key));
  const places = said.map((_, i) => i);
  const at = (on) => on.flatMap((_, p) => (quoted.every((k, j) => said[on[p + j]]?.key === k) ? [on.slice(p, p + quoted.length)] : []));
  const runs = quoted.length ? [places, places.filter((i) => !said[i].lead)].flatMap(at) : [];
  const whole = (run) => {
    const touched = new Set(run.map((i) => said[i].sentence));
    const negated = new Set(said.filter((clause) => clause.no && touched.has(clause.sentence)).map((clause) => clause.sentence));
    return said.every((clause, i) => !negated.has(clause.sentence) || run.includes(i));
  };
  const items = (run, held = new Set(run), of = new Set(run.map((i) => said[i].item))) => said
    .every((clause, i) => !clause.item || !of.has(clause.item) || clause.lead || held.has(i));
  const stand = runs.filter(whole);
  return { run: stand.find((run) => items(run)) ?? stand[0] ?? null, any: runs.length > 0 };
}

/** Why `words` are not the person's own in a message of theirs (`said`: its clauses): null when they are, else `fragment` (no run of
 * its whole clauses) or `negation` (a sentence that holds a negation, quoted by a part). `seal`: how the store sealed a clause's key,
 * where it keeps no words. */
function notTheirs(words, said, seal = (key) => key) {
  const { run, any } = standsAt(words, said, seal);
  return run ? null : (any ? 'negation' : 'fragment');
}

/** How many of `subject`'s content words `words` hold, two forms of one word as one. */
const sharedWith = (words, subject, said = contentOf(words)) => contentOf(subject).filter((word) => among(word, said)).length;

/** Whether `words` are about `subject` (a text): they hold it, or share enough of its content words. */
function isAbout(words, subject) {
  const meant = contentOf(subject);
  const key = clauseKey(lowered(subject));
  if (key !== '' && lowered(words).includes(key)) return true;
  return meant.length > 0 && sharedWith(words, subject) >= Math.max(RULES.about.least, Math.ceil(RULES.about.share * meant.length));
}

/** Whether `words` hold a word of intent: done, dropped, cancelled, changed, set aside. */
const intends = (words) => holdsAny(INTENT, lowered(words));

module.exports = { clausesOf, notTheirs, isAbout, intends };
