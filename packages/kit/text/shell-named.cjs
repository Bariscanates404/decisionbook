// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit's shell owner, PURE: whether a command's TEXT names a verb of a product, through any wrapper. Not a parse: quotes and backslashes
// are taken out and the text is cut into words at whatever is no letter, digit, `_`, `/` or `-`, so a verb in a multiplexer's command
// string, an interpreter's -c (glued to its code: `off'.split()`), a heredoc or a file the same command writes and runs reads like one
// typed bare. Named limit: a command whose text never holds the name or the verb (built or decoded at run time) is not seen.
const { nameOf } = require('../base/paths.cjs');

const QUOTING = /["'\\]/g;
const CUTS = /[^\w/-]+/;
const REACH = 12; // how many words on a verb's next word is looked for: past a wrapper's own options, short of another command's

const textWords = (text) => String(text ?? '').replace(QUOTING, '').split(CUTS).filter(Boolean);
const lastPart = (word) => nameOf(word).toLowerCase(); // a disk that folds case runs the name in any case

/** Where `row`'s words end in `words`, read in order from `from`, each within REACH of the one before; -1: they are not there. */
function verbEnd(words, from, row) {
  let at = from;
  for (const verb of row.words) {
    const next = words.slice(at, at + REACH).indexOf(verb);
    if (next === -1) return -1;
    at += next + 1;
  }
  return at;
}

/** Whether the words from `from` on narrow `row` to what it names: one of its `when` flags; a row with none is named by its words. */
const narrowed = (words, from, row) => !row.when || row.when.some((flag) => words.includes(flag, from));

/** -> the first of `rows` ({ words, when? }) the text names after one of the product's `names` (a word, or the last part of a path),
 * or null. */
function verbNamed(command, names, rows) {
  const text = String(command ?? ''); // a backslash is bash's escape and a Windows folder's separator: both readings are read
  return verbIn(textWords(text), names, rows) ?? verbIn(textWords(text.replace(/\\/g, '/')), names, rows);
}

function verbIn(words, names, rows) {
  const starts = words.flatMap((word, i) => (names.includes(lastPart(word)) ? [i + 1] : []));
  const named = (row) => starts.some((from) => verbEnd(words, from, row) !== -1 && narrowed(words, from, row));
  return rows.find(named) ?? null;
}

module.exports = { verbNamed };
