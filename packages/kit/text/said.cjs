// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE one owner of "the person's words", PURE. A person's words are whole clauses of their own message, in its order with none left
// out between: a sentence, a list item, or a part the person set off themself (a comma, a colon, a new line, a joining word), never
// a piece of one, case and spacing aside; a sentence that holds a negation is theirs only whole. Words are ABOUT a line when they hold
// it or share enough of its content words, and they settle it when they are about it (or name its number) and hold a word of intent.
// A value is what an answer decides when its words are the answer's own, with the answer's negation.
// What a negation, a joining word, a word of intent and a word with no content is, is data (said.json), in each language listed.
// A store that keeps no words keeps a message's clauses sealed (a digest each): the same test runs over them.
// Named limit: polarity carried by something the lists do not hold (a verb's ending, irony, a word not listed) is not seen.
const RULES = require('./said.json');

const FULL_STOP = /[.!?…。！？]["'”’)\]]*$/u; // where a sentence ends
const SENTENCES = /(?<=[.!?…]["'”’)\]]*)\s+|(?<=[。！？])/u;
const ITEM = /^\s*(?:[-*•·‣–—]|\d+[.)])\s+/u; // a list item's mark
const OPENS_LIST = /[:：]$/u; // a line whose list is of its own sentence
const ASKED = /^[^"“«「]{0,40}(?:"[^\n]*?"|“[^\n]*?”|«[^\n]*?»|「[^\n]*?」)\s*[:：]\s+/u; // an item that opens by quoting what it answers
const JOINS = RULES.joins.join('|');
const CLAUSES = new RegExp(`[,;:]\\s+|[,;:]$|[、，；：]|\\s+[-–—]\\s+|\\s+(?:${JOINS}|&)\\s+`, 'iu');
const LEAD = new RegExp(`^(?:${JOINS})\\s+`, 'iu'); // a joining word that opens a clause is no part of it
const EDGES = /^[\s"'“”‘’«»`([]+|[\s"'“”‘’«»`)\].,;:!?…。、，；：！？]+$/gu;
const NOT_WORD = /[^\p{L}\p{N}']+/u;
const GROUPED = /(\d)[,.](?=\d{3}(?:\D|$))/g; // a digit group's mark inside a number
const QUOTED =/"[^"]*"|“[^”]*”|«[^»]*»|「[^」]*」/gu; // a span the person set in quote marks

const lowered = (text) => String(text ?? '').replace(/[’‘]/g, "'").toLowerCase();
const tokensOf = (text) => text.split(NOT_WORD).filter(Boolean);
const hasOne = ({ words, parts }, text) => tokensOf(text).some((word) => words.includes(word)) || parts.some((part) => text.includes(part));
const clauseKey = (text) => text.replace(EDGES, '').replace(LEAD, '').replace(/\s+/g, ' ').trim();

/** One line as the pieces its sentences are read by. `governed`: the line is in a list whose opening line (it ends with a colon) holds
 * a negation, which governs every item: an item there is one piece of that line's sentence (`within`), whatever ends the item. Any
 * other list item is its own sentences, so a negation in one item governs that item alone. A blank line, the end of a governed
 * list and an item of any other list end the sentence before them (`ends`). */
function piecesOf(line, governed) {
  const item = ITEM.test(line);
  const body = line.replace(ITEM, '').trim();
  const within = item && governed;
  const asked = item && !within ? (ASKED.exec(body) || [''])[0] : '';
  const pieces = within ? [body] : body.slice(asked.length).split(SENTENCES);
  return { item, body, within, asked, pieces, ends: !body || governed !== item };
}

/** Every clause of a text (no cut: what the person wrote is all read), each with its sentence and whether it holds a negation. A clause
 * of a list item also holds `item` (which item of the message, from 1) and, in the item's quoted opening (`About "<the question>":`,
 * the words of whoever asked, a sentence of their own), `lead`. -> [{ key, sentence, no, item?, lead? }] */
function clausesOf(text) {
  const out = [];
  let sentence = 0;
  let items = 0;
  let governed = false;
  for (const line of lowered(text).split('\n')) {
    const { item, body, within, asked, pieces, ends } = piecesOf(line, governed);
    const from = out.length;
    sentence += Number(ends);
    items += Number(item);
    const add = (piece, lead) => piece.split(CLAUSES).map(clauseKey).filter(Boolean)
      .forEach((key) => out.push({ key, sentence, no: hasOne(RULES.negations, key), ...(item && { item: items }), ...lead }));
    if (asked) {
      add(asked, { lead: true });
      sentence += 1;
    }
    for (const piece of pieces) {
      add(piece);
      sentence += Number(!within && FULL_STOP.test(piece));
    }
    governed = within || (OPENS_LIST.test(body) && out.slice(from).some((clause) => clause.no));
  }
  return out;
}

/** The list items of a message that open by quoting what they answer: [{ item, asked: that opening, said: its own words after it }]. */
const askedIn = (text) => String(text ?? '').split('\n').filter((line) => ITEM.test(line)).map((line) => line.replace(ITEM, '').trim())
  .map((body, i) => ({ item: i + 1, asked: (ASKED.exec(body) || [''])[0], body })).filter((one) => one.asked)
  .map(({ item, asked, body }) => ({ item, asked, said: body.slice(asked.length).trim() }));

/** Where `words` stand in a message (`said`: its clauses) as a run of its whole clauses, in its order with none left out between but
 * the quoted opening of a list item (the asker's words): `run`, the places of the first run that takes every sentence with a negation
 * whole (null: none does); `any`: there is a run. Only a run is copied, never a window per place: a long message costs no square. */
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
  return { run: runs.find(whole) ?? null, any: runs.length > 0 };
}

/** Why `words` are not the person's own in a message of theirs (`said`: its clauses): null when they are, else `fragment` (no run of
 * its whole clauses) or `negation` (a sentence that holds a negation, quoted by a part). `seal`: how the store sealed a clause's key,
 * where it keeps no words. */
function notTheirs(words, said, seal = (key) => key) {
  const { run, any } = standsAt(words, said, seal);
  return run ? null : (any ? 'negation' : 'fragment');
}

/** The list items of the message that the person's own `words` touch, each with whether the words hold it whole (its quoted opening
 * may be left out): an answer given as a list item is that whole item, never a sentence picked out of it. -> [{ item, whole }] */
function heldItems(words, said, seal = (key) => key) {
  const run = standsAt(words, said, seal).run || [];
  const touched = [...new Set(run.map((i) => said[i].item).filter(Boolean))];
  return touched.map((item) => ({ item, whole: said.every((clause, i) => clause.item !== item || clause.lead || run.includes(i)) }));
}

const contentOf = (text) => [...new Set(tokensOf(lowered(text)).filter((word) => word.length >= 3 && !RULES.common.includes(word)
  && !RULES.negations.words.includes(word)))];
const sameWord = (a, b) => a === b || (Math.min(a.length, b.length) >= RULES.about.stem && (a.startsWith(b) || b.startsWith(a)));

const among = (word, words) => words.some((one) => sameWord(one, word));

/** How many of `subject`'s content words `words` hold; `names`: whether `words` hold `label` (a question's or a line's number) whole. */
const sharedWith = (words, subject, said = contentOf(words)) => contentOf(subject).filter((word) => among(word, said)).length;
const names = (words, label) => tokensOf(lowered(words)).includes(lowered(label));

/** Whether `words` are about `subject` (a kept line's or a decision's text): they hold it, or share enough of its content words. */
function isAbout(words, subject) {
  const meant = contentOf(subject);
  const key = clauseKey(lowered(subject));
  if (key !== '' && lowered(words).includes(key)) return true;
  return meant.length > 0 && sharedWith(words, subject) >= Math.max(RULES.about.least, Math.ceil(RULES.about.share * meant.length));
}

const saysOf = (text) => tokensOf(lowered(text)).filter((word) => !RULES.common.includes(word) && !RULES.negations.words.includes(word));
const isNay = (clause) => tokensOf(clause.key).every((word) => RULES.nays.includes(word));
const hasNo = (text) => hasOne(RULES.negations, lowered(text));

/** Why `value` is not what the person's `answer` to `question` decides: null when it is; `foreign` when it holds words that are not
 * the answer's (an answer that only assents, picks or repeats the value also lends the question's words; `held` of the rules: how
 * few may still be foreign); `flipped` when it leaves out a negation of the sentence it is read from, or adds one the answer does not
 * hold. A clause of only a nay ("No, every time") negates nothing after it. Named limit: a value put together from words of several
 * sentences is not seen as another meaning. */
function notHeld(valued, answered, asked = '') {
  const [value, answer, question] = [valued, answered, asked].map((text) => String(text ?? '').replace(GROUPED, '$1')); // 1,000 is 1000
  const words = [[...new Set(saysOf(value))], tokensOf(lowered(value))].find((list) => list.length) ?? [];
  const spoken = spokenOf(answer, question);
  const clauses = clausesOf(spoken);
  const points = pointsOnly(spoken, clauses, words);
  const foreign = foreignIn(words, points ? `${spoken} ${question}` : spoken);
  if (foreign === null) return 'foreign';
  const negates = clauses.some((clause) => clause.no) || (points && hasNo(question));
  return (hasNo(value) ? negates : !readNegated(clauses, words, foreign)) ? null : 'flipped';
}

/** How many of `words` the text `lent` does not hold; null where there are none to hold, or too many (`held` of the rules). */
function foreignIn(words, lent) {
  const count = words.filter((word) => !among(word, tokensOf(lowered(lent)))).length;
  return !words.length || count > RULES.held.foreign || count > RULES.held.share * words.length ? null : count;
}

/** Whether an answer only assents, picks or repeats the value: it holds no negation and says nothing else of its own. */
function pointsOnly(spoken, clauses, meant) {
  const plain = saysOf(spoken).filter((word) => !RULES.assent.includes(word) && !RULES.picks.includes(word));
  return !clauses.some((clause) => clause.no) && plain.every((word) => among(word, meant));
}

/** An answer without the question quoted back in it ("About "<question>": ..."): those are the question's words, not the answer's. */
function spokenOf(answer, question) {
  const echo = (span) => contentOf(span).length > 0 && sharedWith(question, span) * 2 >= contentOf(span).length;
  const left = answer.replace(QUOTED, (span) => (echo(span) ? ' ' : span));
  return tokensOf(lowered(left)).length ? left : answer;
}

/** Whether every sentence a value with no negation can be read from (all its words but `foreign`) holds one that is no bare nay. */
function readNegated(clauses, meant, foreign) {
  const wordsIn = (sentence) => clauses.filter((clause) => clause.sentence === sentence).flatMap((clause) => tokensOf(clause.key));
  const readFrom = (sentence) => meant.filter((word) => !among(word, wordsIn(sentence))).length <= foreign;
  const negated = (sentence) => clauses.some((clause) => clause.sentence === sentence && clause.no && !isNay(clause));
  const sentences = [...new Set(clauses.map((clause) => clause.sentence))].filter(readFrom);
  return sentences.length > 0 && sentences.every(negated);
}

/** Why `words` do not settle kept line `k` (its `text`): null when they do, `unrelated` (not about it, nor naming k<k>) or `no-intent`
 * (no word that says done, dropped, cancelled or changed). `k` null: the line's number names it no more. */
function notSettling(words, text, k) {
  const named = k !== null && tokensOf(lowered(words)).includes(`k${k}`);
  if (!named && !isAbout(words, text)) return 'unrelated';
  return hasOne(RULES.intent, lowered(words)) ? null : 'no-intent';
}

/** Whether `words` take whole what was offered to the person (data `takesAll`: "go with your suggestions", "yes to all", "the
 * defaults"), with no negation. What was offered, and whether it was shown to them, is the caller's to know. */
const takesAll = (words) => !hasNo(words) && hasOne(RULES.takesAll, lowered(words));

/** Whether `words` are a yes to a yes-or-no question put to the person: no clause holds a negation, and the first one only assents
 * (with words that point or carry no content) or one holds a word of intent. "Go on with it" is no yes; "yes", "ok, drop it", "yes,
 * leave it for now" are. Named limit: a yes followed by a contrary clause that holds no negation word reads as a yes. */
function saysYes(words) {
  const clauses = clausesOf(words);
  const only = (key, said = tokensOf(key)) => said.some((word) => RULES.assent.includes(word))
    && said.every((word) => RULES.assent.includes(word) || RULES.picks.includes(word) || RULES.common.includes(word));
  return clauses.length > 0 && !clauses.some((clause) => clause.no)
    && (only(clauses[0].key) || clauses.some((clause) => hasOne(RULES.intent, clause.key)));
}

/** Whether a sentence of `text` asks (it ends in a question mark) whether work is set aside (data `aside`: the words for that). */
const asksAside = (text) => String(text ?? '').split(SENTENCES)
  .some((piece) => /[?？][*_`"'”’)\]]*\s*$/u.test(piece) && hasOne(RULES.aside, lowered(piece)));

module.exports = { clausesOf, askedIn, notTheirs, heldItems, isAbout, sharedWith, names, notHeld, notSettling, takesAll, saysYes,
  asksAside };
