// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE line rule and THE identifier alphabet: a cited line and a token mean the same everywhere.

// Only `\n` ends a line; a trailing one is not a line of its own; a 1-based citation reads lines[line - 1].
function linesOf(text) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

const lineCount = (text) => linesOf(text).length;
const counted = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const indentOf = (text) => (text?.trim() ? /^\s*/u.exec(text)[0].length : Infinity);

// A line that closes a bracket and opens another (`) -> None:`, `}) => {`, `) error {`) ends a declaration written over several lines, not
// its block.
const CONTINUES = /^\s*[)\]}].*[{([:]\s*$/u;

function blockEnd(lines, line) {
  const own = indentOf(lines[line - 1]);
  let end = line;
  for (let at = line; at < lines.length
    && (indentOf(lines[at]) > own || CONTINUES.test(lines[at])); at += 1) if (lines[at].trim()) end = at + 1;
  return end;
}

// Regex SOURCE for `u` patterns, judged per code point. The character order is part of the value.
const START = '\\p{L}\\p{Nl}_$';
const WORD = '\\p{L}\\p{Nl}\\p{Nd}\\p{Mn}\\p{Mc}\\p{Pc}_'; // class contents of a name that is no code identifier (a directory, a CSS class): no `$`
const CONT = `${WORD}$`; // class contents: write [${CONT}]
const IDENT = `[${START}][${CONT}]*`; // a whole identifier
const filled = (word, slots) => word.replace(/\{(\w+)\}/g, (all, name) => (Object.hasOwn(slots, name) ? String(slots[name]) : all)); // a word's `{slot}`s, once
const unmarked = (text) => text.normalize('NFD').replace(/\p{M}/gu, ''); // letters without their marks (ử is u), by Unicode's own table
// a commit, a day and an id as every package shows them short: 8 characters of a sha, an ISO time's date, 8 characters of an id
const shortSha = (sha) => String(sha).slice(0, 8);
const dayOf = (at) => String(at).slice(0, 10);
const shortId = (id) => String(id).slice(0, 8);
const escapedRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'); // text as a regex source matching itself

module.exports = { linesOf, lineCount, counted, indentOf, blockEnd, CONT, IDENT, escapedRe, filled, unmarked, shortSha, dayOf, shortId };
