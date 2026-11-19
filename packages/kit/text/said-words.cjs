// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. A word of a person's message: a text's words in one case, a language-keyed reading file's role as one list, THE one test of
// whether a text holds a list's word, a text's content words, and when two forms are one word (a stem and its endings).
const RULES = require('./said.json');

const NOT_WORD = /[^\p{L}\p{N}']+/u;
const lowered = (text) => String(text ?? '').replace(/[’‘]/g, "'").toLowerCase().replace(/i\u0307/g, 'i'); // İ lowers to a plain i
const tokensOf = (text) => text.split(NOT_WORD).filter(Boolean);
// a list's word is read whole: a hyphen between two letters joins one ("non-blocking" holds no "non")
const wholeWordsOf = (text) => text.split(/[^\p{L}\p{N}'-]+|(?<!\p{L})-|-(?!\p{L})/u).filter(Boolean);

/** One role (`path`: "takes.names") of a language-keyed reading file ({ <language>: { <role>: [words] | { words, parts } } }) as one
 * list of each listed language's `words` and `parts`. */
function roleList(languages, path) {
  const roles = Object.values(languages).map((entry) => path.split('.').reduce((at, key) => at?.[key], entry)).filter(Boolean);
  const words = roles.flatMap((role) => (Array.isArray(role) ? role : role.words ?? []));
  return { words, parts: roles.flatMap((role) => (Array.isArray(role) ? [] : role.parts ?? [])) };
}
/** THE one test of a reading list: `text` (lower case) holds one of its words whole, or one of its parts anywhere. */
const holdsAny = ({ words, parts }, text) => wholeWordsOf(text).some((word) => words.includes(word))
  || parts.some((part) => text.includes(part));

const { negations: NEGATIONS, common: { words: COMMON } } = Object.fromEntries(['negations', 'common']
  .map((role) => [role, roleList(RULES.languages, role)]));
const saysOf = (text) => tokensOf(lowered(text)).filter((word) => !COMMON.includes(word) && !NEGATIONS.words.includes(word));
const contentOf = (text) => [...new Set(saysOf(text).filter((word) => word.length >= 3))];

const TAILS = new RegExp(`^(?:${roleList(RULES.languages, 'endings').words.join('|')}){0,3}$`, 'u'); // what a word's form adds to its stem
const stemLength = (a, b, at = [...a].findIndex((letter, i) => letter !== b[i])) => (at < 0 ? a.length : at); // how far two words are one
const sameWord = (a, b, stem = stemLength(a, b)) => a === b || (stem >= RULES.about.stem
  && (stem === Math.min(a.length, b.length) || (TAILS.test(a.slice(stem)) && TAILS.test(b.slice(stem)))));
const among = (word, words) => words.some((one) => sameWord(one, word));

module.exports = { lowered, tokensOf, roleList, holdsAny, contentOf, among };
