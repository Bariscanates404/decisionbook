// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit's shell tokenizer, PURE: split as a shell splits, enough to name what it writes. Not a shell: aliases and functions are not read,
// arithmetic only for its $(…).

const OPS = ['&&', '||', '|&', ';;', '&>>', '&>', '>>', '>|', '>&', '<<<', '<<-', '<<', '<>', '<&', '>', '<', ';', '|', '&', '(', ')', '\n'];
const BLANK = /[ \t\r\v\f]/;
const BREAK = /[ \t\r\n\v\f;&|()<>]/;
const ESCAPED = /^[$`"\\\n]$/; // what a backslash keeps literal inside double quotes
const HEREDOC = ['<<', '<<-'];

// Where `char` closes what began before `from`: inside "…" and `…` a backslash escapes the next character; in '…', a comment, a line it is
// plain.
function until(text, char, from) {
  let i = from;
  while (i < text.length && text[i] !== char) i += '"`'.includes(char) && text[i] === '\\' ? 2 : 1;
  return Math.min(i, text.length);
}

// `quotes`: the characters that open a string here; a double-quoted ${…} body takes only `"` (its `'` is plain). A backslash escapes what
// follows it.
function balanced(s, open, close, quotes = '\'"') {
  const start = s.i + 1;
  let depth = 0;
  for (; s.i < s.text.length; s.i += 1) {
    const c = s.text[s.i];
    if (c === '\\') s.i += 1;
    else if (quotes.includes(c)) s.i = until(s.text, c, s.i + 1);
    else if (c === open) depth += 1;
    else if (c === close && (depth -= 1) === 0) break;
  }
  s.i += 1;
  return s.text.slice(start, s.i - 1);
}

// Outside double quotes $'…' and $"…" are strings; inside them, or before what starts no expansion, `$` is itself.
function dollar(s, w) {
  const next = s.text[s.i + 1] ?? '';
  s.i += 1;
  if (next === "'" && !s.double) single(s, w, true);
  else if (next === '"' && !s.double) double(s, w);
  else if (/[\w@*#?$!({-]/.test(next)) expansion(s, w, next);
  else w.word += '$';
}

// $((…)) only when its inner ( closes at the very end: $((a) && (b)) is a command substitution of two subshells, as bash runs it
const arithmetic = (body) => body[0] === '(' && balanced({ text: body, i: 0 }, '(', ')').length === body.length - 2;

function expansion(s, w, next) {
  const body = next === '(' ? balanced(s, '(', ')') : '';
  if (arithmetic(body)) bodyParts(body, w.subs, true); // $((…)) runs nothing, a $(…) inside it still does
  else if (next === '(') w.subs.push(body);
  else if (next === '{') bodyParts(balanced(s, '{', '}', s.double ? '"' : undefined), w.subs, s.double);
  else s.i += 1;
  while (/[A-Za-z_]/.test(next) && /\w/.test(s.text[s.i] ?? '')) s.i += 1; // the rest of a name
  w.word += '$';
  w.literal = false;
}

// A body read part by part like a word, so a command it holds reaches subs as a $(…) one does: ${X:-$(cmd)}, $(( $(cmd) )), an unquoted
// heredoc.
function bodyParts(text, subs, double) {
  const body = { text, i: 0, double };
  const inner = { word: '', literal: false, subs };
  while (body.i < body.text.length) part(body, inner);
}

function backquote(s, w) {
  const end = until(s.text, '`', s.i + 1);
  w.subs.push(s.text.slice(s.i + 1, end));
  w.word += '$';
  w.literal = false;
  s.i = end + 1;
}

// Inside "…" (`s.double`, the one place that knows) a `'` is plain. $'…' (`ansi`) ends at its first unescaped `'`; its escapes are not
// decoded: no literal.
function single(s, w, ansi = false) {
  if (s.double) return plain(s, w);
  let end = s.i + 1;
  while (end < s.text.length && s.text[end] !== "'") end += ansi && s.text[end] === '\\' ? 2 : 1;
  w.word += s.text.slice(s.i + 1, end);
  if (ansi && s.text.slice(s.i + 1, end).includes('\\')) w.literal = false;
  s.i = end + 1;
}

function double(s, w) {
  const outer = s.double;
  [s.i, s.double] = [s.i + 1, true];
  while (s.i < s.text.length && s.text[s.i] !== '"') part(s, w);
  [s.i, s.double] = [s.i + 1, outer];
}

function plain(s, w) {
  w.word += s.text[s.i];
  s.i += 1;
}

function escaped(s, w) {
  const next = s.text[s.i + 1] ?? '';
  if (s.double && !ESCAPED.test(next)) return plain(s, w);
  if (next !== '\n') w.word += next;
  s.i += 2;
}

const PART = { "'": single, '"': double, '\\': escaped, $: dollar, '`': backquote };
const part = (s, w) => (PART[s.text[s.i]] || plain)(s, w);

function readWord(s) {
  const w = { word: '', literal: s.text[s.i] !== '~', subs: [], raw: s.i };
  while (s.i < s.text.length && !BREAK.test(s.text[s.i])) part(s, w);
  return Object.assign(w, { raw: s.text.slice(w.raw, s.i) }); // `raw`: the word as written, what debug shows
}

function bodies(s) {
  for (const doc of s.pending.splice(0)) {
    const lines = [];
    while (s.i < s.text.length) {
      const end = until(s.text, '\n', s.i);
      const line = doc.strip ? s.text.slice(s.i, end).replace(/^\t+/, '') : s.text.slice(s.i, end);
      s.i = end + 1;
      if (line === doc.delim) break;
      lines.push(line);
    }
    doc.at.body = lines.join('\n');
    if (doc.subs) bodyParts(doc.at.body, doc.subs, true); // an unquoted delimiter: the body expands as in double quotes
  }
}

function operator(s) {
  const op = OPS.find((o) => s.text.startsWith(o, s.i));
  s.i += op.length;
  s.tokens.push({ op });
  if (op === '\n') bodies(s);
}

// Digits right before a redirection are its file descriptor (2>&1), not a word.
function wordToken(s) {
  const w = readWord(s);
  const last = s.tokens.at(-1);
  if (w.literal && /^\d+$/.test(w.word) && /[<>]/.test(s.text[s.i] ?? '')) return;
  if (last && HEREDOC.includes(last.op)) s.pending.push({ at: last, delim: w.word, strip: last.op === '<<-', subs: /['"\\]/.test(w.raw) ? null : w.subs });
  s.tokens.push(w);
}

function next(s) {
  const c = s.text[s.i];
  const after = s.text[s.i + 1];
  if (BLANK.test(c)) s.i += 1;
  else if (c === '#') s.i = until(s.text, '\n', s.i); // a comment: a `#` where a word would begin
  else if (c === '\\' && after === '\n') s.i += 2;
  else if ((c === '<' || c === '>') && after === '(') processWord(s);
  else if (BREAK.test(c)) operator(s);
  else wordToken(s);
}

function processWord(s) {
  s.i += 1;
  s.tokens.push({ word: '$', literal: false, subs: [balanced(s, '(', ')')] });
}

/** -> tokens: { word, literal: nothing expands, subs: substituted commands, raw? } | { op, body?: a heredoc's } */
function lex(text) {
  const s = { text, i: 0, tokens: [], pending: [] };
  while (s.i < text.length) next(s);
  bodies(s);
  return s.tokens;
}

module.exports = { lex };
