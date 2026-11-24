// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE one owner of "the person's words", PURE. A message is read as units, each a sentence: it ends at its full stop (. ! ?), a blank
// line, and a line's end only where the next opens a list item, a chat line or a header; a list goes on from the sentence that opens it
// (`lead`). A quote is found in the message (spacing, line breaks, `>` aside) and stands for the whole units it runs over. Whose a unit is:
// the format alone, on the lines that carry it: a chat line `Emma: …`, the first line under a chat header (name and time) or a bare
// `Emma:` (or a list's items there), the `>` lines under `Emma wrote:`. Never the prose.
const RULES = require('./said.json');
const { lowered, roleList, holdsAny, contentOf, among, tokensOf } = require('./said-words.cjs');

const INTENT = roleList(RULES.languages, 'intent');
const STOP = /(?:[.!?…]["'”’)\]*_`]*(?=\s|$)|[。！？]|["”](?=\s*$))/gu; // a sentence's end (a quotation closing a line too)
const ITEM = /^(?:[-*•·‣–—]|\d+[.)])\s+/u; // a list item's mark
const NAME = String.raw`\p{L}[\p{L}\p{N}'’.-]*(?:\s+\p{L}[\p{L}\p{N}'’.-]*){0,2}(?:\s*\([^()\n]{1,30}\))?`; // one to three words, a role
const CLOCK = String.raw`\d{1,2}:\d{2}(?:\s*[AaPp]\.?[Mm]\.?)?`;
const STAMP = String.raw`\[[^\]\n]*${CLOCK}[^\]\n]*\]`; // `[2:07 PM]`, `[11/23 2:07 PM]`
const CHAT = new RegExp(`^(?:${STAMP}\\s*)?(${NAME})\\s*:(?:\\s+\\S|$)`, 'u'); // `Emma: …`, `Emma (BA):`, `[14:03] Olivia: …`
const CAPS = String.raw`\p{Lu}[\p{L}'’-]*(?:\s+\p{Lu}[\p{L}'’-]*){0,2}(?:\s*[([][^()[\]\n]{1,30}[)\]])?`; // `Emma Stone (BA)`, `Emma [BA]`
const HEADER = new RegExp(`^(?:#{1,6}\\s.*|(${NAME})\\s+${STAMP}|${STAMP}\\s+(${NAME})|(${CAPS})[\\s,–—-]+(?:\\p{L}+\\s+){0,2}${CLOCK})$`, 'u');
const WROTE = new RegExp(`^(?:On [^\\n]*,\\s*)?(${NAME})(?:\\s+<[^>\\n]*>)?\\s+wrote:$`, 'u'); // a mail's quote header, an address aside
const MARKS = /[*`"“”«»]+/gu; // emphasis, code and quote marks: the same words with or without them
const EDGES = /^[\s'‘’([>,.;:!?…-]+|[\s'‘’)\],.;:!?…-]+$/gu;
const EDGE = /[^\p{L}\p{N}]|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u; // no letter or digit, or one of a script with no spaces
const asWords = (text) => lowered(text).replace(MARKS, '').replace(/\s+/gu, ' ').trim();

/** A message as its units, in order: { text, head: the speaker its format names, lead: the sentence its list goes on from }. */
function sentencesOf(message) {
  const at = { units: [], open: null, head: '', lead: '', last: '', quoted: false, mark: '' };
  String(message ?? '').replace(/\r/gu, '').split('\n').forEach((raw) => readLine(at, lineAsRead(raw)));
  closeUnit(at);
  return at.units.map(({ text, head, lead }) => ({ text, head, lead }));
}

/** A line as read: its words (a `>` off), whether quoted, a header, an item, and the speaker a chat line or a header names. */
function lineAsRead(raw) {
  const line = raw.replace(/^[\s>]+/u, '').trimEnd();
  const header = HEADER.exec(line);
  const said = header ? header.slice(1).find(Boolean) ?? '' : CHAT.exec(line)?.[1];
  return { line, quoted: /^\s*>/u.test(raw), header: Boolean(header), said, item: ITEM.test(line) };
}
const closeUnit = (at) => Object.assign(at, { units: at.open ? [...at.units, at.open] : at.units, open: null });

/** One line into the units: a blank, header, chat or item line and a `>` quote's start or end open one; the speaker heads what carries it
 * (above), a quote its `wrote:` line; any other line is no one's, the person's own line typed under a paste too. */
function readLine(at, l) {
  const turn = l.quoted !== at.quoted;
  if (!l.line || l.header || l.said !== undefined || l.item || turn) opensUnit(at, l, speakerAt(at, l, turn));
  if (!carried(at, l)) at.head = '';
  piecesOf(at, l);
  if (l.header) closeUnit(at); // a header is a unit of its own
  Object.assign(at, { quoted: l.quoted, last: l.line && !l.quoted ? l.line : at.last, mark: markAfter(at, l) });
}
/** Whether a line keeps the speaker over it (a blank, quoted, header or chat line says its own), and what the next one may be: the first
 * (after a header or a bare `Emma:`), an item of its list, or none. */
const carried = (at, l) => !l.line || l.quoted || l.header || l.said !== undefined || at.mark === 'first' || (at.mark === 'item' && l.item);
const markAfter = (at, l) => (l.header || (l.said !== undefined && /[:：]$/u.test(l.line)) ? 'first' : (l.item && at.head && 'item') || '');
const speakerAt = (at, l, turn) => l.said ?? (!l.line ? (l.quoted ? undefined : '') : (turn || undefined) && ((l.quoted && WROTE.exec(at.last)?.[1]) || ''));

/** A unit opened: a list item takes the one before, with no full stop, as its list's opening; a new `head` heads what follows. */
function opensUnit(at, l, head) {
  if (l.item && at.open && !at.open.item) at.lead = at.open.text;
  closeUnit(at);
  if (head !== undefined) Object.assign(at, { head, lead: '' });
}

/** A line's words into units: each piece up to a full stop ends its unit; the rest goes on into the next line. */
function piecesOf(at, l) {
  const body = l.line.replace(ITEM, '');
  const ends = [...body.matchAll(STOP)].map((m) => m.index + m[0].length);
  [...ends, body.length].map((end, i) => [body.slice(ends[i - 1] ?? 0, end).trim(), i < ends.length]).filter(([piece]) => piece)
    .forEach(([piece, stops]) => {
      if (!at.open && !l.item) at.lead = ''; // a sentence of its own ends the list before it
      at.open ??= { text: '', head: at.head, lead: l.item ? at.lead : '', item: l.item };
      if (at.open.head !== at.head) at.open.head = ''; // a sentence that runs on past its speaker's lines is no one's
      at.open.text = `${at.open.text} ${piece}`.trim();
      if (stops) closeUnit(at);
    });
}

/** Whether `hay` holds a word edge at `i`: its start or end, or an edge character on either side. */
const edgeAt = (hay, i) => i <= 0 || i >= hay.length || EDGE.test(hay[i - 1]) || EDGE.test(hay[i]);

/** Every place `words` stand in a message's `units` (spacing, line breaks, `>` and list marks, quote marks and the last stop aside),
 * each the first and last unit it runs over. -> [[from, to]] (none: they are not there) */
function quotedAt(words, units) {
  const sought = asWords(String(words ?? '').split('\n').map((line) => line.replace(/^[\s>]+/u, '').replace(ITEM, '')).join(' '))
    .replace(EDGES, '');
  const texts = units.map((unit) => ` ${asWords(unit.text)}`);
  const hay = texts.join('');
  const unitAt = (i) => texts.findIndex((_, k) => texts.slice(0, k + 1).join('').length > i);
  const at = Array.from({ length: sought ? hay.length : 0 }, (_, i) => i)
    .filter((i) => hay.startsWith(sought, i) && edgeAt(hay, i) && edgeAt(hay, i + sought.length));
  return at.map((i) => [unitAt(i), unitAt(i + sought.length - 1)]);
}

/** The whole sentences of `units` from `from` to `to`, each list's opening sentence once before its items. */
const wholeOf = (units, [from, to]) => [...new Set(units.slice(from, to + 1).flatMap((unit) => [unit.lead, unit.text]).filter(Boolean))]
  .join(' ');

/** The words of a name, a role in brackets aside or kept (`role`), in one case. */
const wordsOfName = (name, role = true) => tokensOf(lowered(role ? name : String(name ?? '').replace(/[([][^)\]]*[)\]]/gu, ' ')));
/** Whether the speaker a format names (`said`) is `name`: every word of it, a role in brackets aside, is a word of that name or role. */
const saidBy = (said, name, words = wordsOfName(said, 0)) => words.length > 0 && words.every((one) => wordsOfName(name).includes(one));
/** Whether every unit from `from` to `to` is `name`'s: the speaker its format names is them. */
const voicedBy = (units, [from, to], name) => units.slice(from, to + 1).every((unit) => saidBy(unit.head, name));

/** Whether `words` are about `subject` (a text): they hold it whole, or share enough of its content words (a word's two forms: one). */
function isAbout(words, subject) {
  const meant = contentOf(subject);
  const shared = meant.filter((word) => among(word, contentOf(words))).length;
  return quotedAt(subject, [{ text: words }]).length > 0
    || (meant.length > 0 && shared >= Math.max(RULES.about.least, Math.ceil(RULES.about.share * meant.length)));
}

/** Whether `words` hold a word of intent: done, dropped, cancelled, changed, set aside. */
const intends = (words) => holdsAny(INTENT, lowered(words));

module.exports = { sentencesOf, quotedAt, wholeOf, voicedBy, isAbout, intends };
