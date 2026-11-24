// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// part of text/shell, PURE: Windows' two shells by the rows of shell.json `windows`. `lexWin` cuts a PowerShell or cmd text into the words
// and operators text/shell reads (a backslash is a folder's separator); `shellText` finds the text powershell, pwsh or cmd runs;
// `cmdletWrites` binds a PowerShell command's parameters and names what it writes. No effect here: text/shell marks and merges.
const { shells: SHELLS, windows: WIN } = require('./shell.json');
const { programOf } = require('../base/paths.cjs');

const BLANK = /[ \t\r\v\f]/;
const sticky = (source) => (source ? new RegExp(source, 'y') : null);
const SPEC = Object.fromEntries(['powershell', 'cmd'].map((lang) => [lang, WIN[lang].lex]).map(([lang, lex]) => [lang, {
  ...lex,
  expand: sticky(lex.expand), group: sticky(lex.group), redirect: sticky(lex.redirect), comment: sticky(lex.comment),
  here: sticky(lex.here),
  breaks: new Set([...' \t\r\v\f<>', ...lex.blocks, ...(lex.list || ''), ...lex.ops.map((op) => op[0])]) }]));
const ROW_OF = new Map(Object.entries(WIN.cmdlets).flatMap(([name, row]) => [name, ...(row.alias || [])].map((n) => [n, row])));
const RUN = new RegExp(WIN.cmd.run);
const NULL = /^\$null$/i;
const HERE = { word: '.', literal: true }; // the folder a command runs in, a row's `bare` files

const matchAt = (re, s) => {
  if (!re) return null;
  re.lastIndex = s.i;
  return re.exec(s.text);
};
const withRaw = (s, w) => Object.assign(w, { raw: s.text.slice(w.raw, s.i) });
function plainChar(s, w, c) {
  w.word += c === '\\' ? '/' : c;
  s.i += 1;
}

/** The text inside a `(` at s.i, its quotes skipped; s.i ends past its `)`. */
function inParens(s) {
  const start = s.i + 1;
  for (let depth = 0; s.i < s.text.length; s.i += 1) {
    const c = s.text[s.i];
    if (c === '(') depth += 1;
    else if (c === ')' && (depth -= 1) === 0) break;
    else if (c === "'" || c === '"') s.i = Math.max(s.text.indexOf(c, s.i + 1), s.i);
  }
  s.i += 1;
  return s.text.slice(start, s.i - 1);
}

// A group's text runs first (a sub), in quotes only `$(`; what expands holds no literal, but `$null` is the device it names.
function expanded(s, w, quoted) {
  const group = matchAt(s.spec.group, s);
  if (group && !(quoted && group[0] === '(')) {
    s.i += group[0].length - 1;
    w.subs.push(inParens(s));
    return Object.assign(w, { word: `${w.word}$`, literal: false });
  }
  const m = matchAt(s.spec.expand, s);
  if (!m) return null;
  s.i += m[0].length;
  return Object.assign(w, { word: w.word + m[0], literal: w.literal && NULL.test(m[0]) && !w.word });
}

function escapedIn(s, w) {
  const next = s.text[s.i + 1] ?? '';
  if (/[0abefnrtv]/.test(next)) w.literal = false; // a control character
  w.word += next;
  s.i += 2;
}

// One character inside quotes; a closing quote written twice (`inQuotes`) is one.
function quotedChar(s, w, q) {
  const c = s.text[s.i];
  const { inQuotes, escape } = s.spec;
  if (inQuotes && c === q) {
    w.word += q;
    s.i += 2;
  } else if (q !== "'" && inQuotes && c === escape) escapedIn(s, w);
  else if (q === "'" || !expanded(s, w, true)) plainChar(s, w, c);
}

function quoted(s, w, q) {
  s.i += 1;
  while (s.i < s.text.length) {
    if (s.text[s.i] === q && !(s.spec.inQuotes && s.text[s.i + 1] === q)) {
      s.i += 1;
      return;
    }
    quotedChar(s, w, q);
  }
}

function winPart(s, w) {
  const c = s.text[s.i];
  if (c === s.spec.escape) {
    w.word += s.text[s.i + 1] ?? '';
    s.i += 2;
  } else if (s.spec.quotes.includes(c)) quoted(s, w, c);
  else if (!expanded(s, w, false)) plainChar(s, w, c);
}

function wordOf(s) {
  const w = { word: '', literal: true, subs: [], raw: s.i };
  const here = matchAt(s.spec.here, s);
  if (here) {
    s.i += here[0].length;
    return withRaw(s, Object.assign(w, { word: here.groups.body, literal: here[1] === "'" || !/[$`]/.test(here.groups.body) }));
  }
  do winPart(s, w); while (s.i < s.text.length && !s.spec.breaks.has(s.text[s.i]));
  if (w.word.startsWith('~')) w.literal = false; // the home, which PowerShell expands
  return withRaw(s, w);
}

const blanks = (s) => {
  while (BLANK.test(s.text[s.i] ?? '')) s.i += 1;
};

// PowerShell's `a, b` is one argument of two items.
function wordList(s) {
  const items = [wordOf(s)];
  for (let at = s.i; s.spec.list; at = s.i) {
    blanks(s);
    if (s.text[s.i] !== s.spec.list) {
      s.i = at;
      break;
    }
    s.i += 1;
    blanks(s);
    if (s.i < s.text.length) items.push(wordOf(s));
  }
  return items.length === 1 ? items[0] : { ...items[0], items, raw: items.map((w) => w.raw).join(','), literal: items.every((w) => w.literal),
    subs: items.flatMap((w) => w.subs) };
}

// A redirection with `&` sends a stream to a stream: no file.
function redirection(s) {
  const m = matchAt(s.spec.redirect, s);
  if (!m) return false;
  s.i += m[0].length;
  if (!m[0].includes('&')) s.tokens.push({ op: m[0].endsWith('>>') ? '>>' : '>' });
  return true;
}

function winOperator(s, op) {
  s.i += op.length;
  s.tokens.push({ op: s.spec.blocks.includes(op) ? '\n' : op }); // a block's statements are read as any other
}

function lexStep(s) {
  const c = s.text[s.i];
  const op = s.spec.ops.find((o) => s.text.startsWith(o, s.i)) || (c === '<' || s.spec.blocks.includes(c) ? c : null);
  const comment = matchAt(s.spec.comment, s);
  if (BLANK.test(c)) s.i += 1;
  else if (c === s.spec.escape && s.text[s.i + 1] === '\n') s.i += 2; // a line continued
  else if (comment) s.i += Math.max(comment[0].length, 1);
  else if (op) winOperator(s, op);
  else if (!redirection(s)) s.tokens.push(wordList(s));
}

/** -> tokens as text/shell-lex gives them: { word, literal, subs, raw, items? } | { op } */
function lexWin(text, lang) {
  const s = { text: String(text ?? ''), i: 0, tokens: [], spec: SPEC[lang] };
  while (s.i < s.text.length) lexStep(s);
  return s.tokens;
}

const wordsJoined = (words) => (words.length ? { word: words.map((w) => w.word).join(' '), literal: words.every((w) => w.literal),
  raw: words.map((w) => w.raw ?? w.word).join(' ') } : null);
const optionOf = (word) => (/^(?:--?|\/)([A-Za-z]+)$/.exec(word) || [])[1]?.toLowerCase() || null;
const isOption = (list, opt) => Boolean(opt) && (list.includes(opt) || (opt.length >= 2 && list[0].startsWith(opt)));
const PS = WIN.powershell;
const shellLang = (name) => (Object.hasOwn(WIN.shells, name) ? WIN.shells[name] : null);

/** Whether the words after a Windows shell's name hand it a text or a script, so no person types into it: a word that hands one, or any
 * word that is no option (an option's value included: could not tell). */
const handsText = (lang, words) => words.some((word) => (lang === 'cmd' ? RUN.test(word) || !word.startsWith('/')
  : !optionOf(word) || [PS.command, PS.encoded, PS.file].some((list) => isOption(list, optionOf(word)))));

function psText(args, inputs) {
  const opts = args.map((w) => (w.literal ? optionOf(w.word) : null));
  const at = (list) => opts.findIndex((opt) => isOption(list, opt));
  if (at(PS.command) !== -1) {
    const rest = args.slice(at(PS.command) + 1);
    return rest.length === 1 && rest[0].word === '-' ? inputs[0] || { unparsed: rest[0] } : wordsJoined(rest);
  }
  if (at(PS.encoded) !== -1) return { unparsed: args[at(PS.encoded)] };
  if (at(PS.file) !== -1) return null; // a script it runs, as `bash x.sh`: not read
  for (let i = 0; i < args.length; i += 1) {
    if (!opts[i]) return wordsJoined(args.slice(i));
    if (isOption(PS.takes, opts[i])) i += 1;
  }
  return null;
}

// cmd runs the text glued to its run word and the words after it; words it is handed with no run word are a text no one reads here
function cmdText(args) {
  const at = args.findIndex((w) => w.literal && RUN.test(w.word));
  const odd = args.find((w) => !w.literal || !w.word.startsWith('/'));
  if (at === -1) return odd ? { unparsed: odd } : null;
  const glued = RUN.exec(args[at].word).groups.code;
  return wordsJoined([...(glued ? [{ ...args[at], word: glued }] : []), ...args.slice(at + 1)]);
}

/** -> the language and text a Windows shell runs: { lang, text: { word, literal, raw } | { unparsed: word } } | null (none: not a shell
 * of Windows, or a shell that runs no text here). */
function shellText(name, args, inputs) {
  const lang = shellLang(name);
  return lang && { lang, text: lang === 'cmd' ? cmdText(args) : psText(args, inputs) };
}

function paramRole(row, option) {
  const params = { ...WIN.common, ...row.params };
  if (Object.hasOwn(params, option)) return params[option];
  const roles = new Set(Object.keys(params).filter((p) => p.startsWith(option)).map((p) => params[p]));
  return roles.size === 1 ? [...roles][0] : null; // matched by the start only one parameter has
}

const OPTION = /^-([A-Za-z][\w-]*)(?::([\s\S]*))?$/;
/** The option at `i` and its value (`-Name value` or `-Name:value`); -> the index of the last word it took. */
function takeOption(row, args, i, got) {
  const [, name, value] = OPTION.exec(args[i].word);
  const role = paramRole(row, name.toLowerCase());
  if (role === null) got.odd(args[i]);
  else if (role === 'switch' || role === 'none') got.add(role, args[i]);
  else if (value !== undefined) got.add(role, { ...args[i], word: value });
  else if (args[i + 1]) {
    got.add(role, args[i + 1]);
    return i + 1;
  }
  return i;
}

// Each role's words, named or in `at` order; an option or a word the row cannot place is `unknown` (a `named` row reads no other).
function paramsBound(row, args) {
  const got = { roles: {}, unknown: null };
  got.add = (role, w) => {
    got.roles[role] = [...(got.roles[role] || []), ...(w.items || [w])];
  };
  got.odd = (w) => {
    got.unknown = got.unknown || (row.named ? null : w);
  };
  const loose = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].literal && OPTION.test(args[i].word)) i = takeOption(row, args, i, got);
    else loose.push(args[i]);
  }
  const free = (row.at || []).filter((role) => !got.roles[role]);
  loose.forEach((w, k) => (k < free.length ? got.add(free[k], w) : got.odd(w)));
  return got;
}

const asFolder = (w) => ({ ...w, word: w.word.replace(/\/*$/, '/') });
const inFolder = (dir, w) => (dir ? { ...w, word: `${asFolder(dir).word}${w.word}`, literal: dir.literal && w.literal } : w);
const parentOf = (w) => ({ ...w, word: w.word.replace(/\/*[^/]*\/*$/, '') });
const WRITES = { // each mode: the words it writes, with the sources a copy names; null: a pipeline hands them
  all: ({ path }, row) => (path || (row.bare ? [HERE] : null))?.map((w) => ({ w: row.folder ? asFolder(w) : w })) ?? null,
  new: ({ path, to }) => (path || to ? (path || [null]).flatMap((dir) => (to || [dir]).map((w) => ({ w: to ? inFolder(dir, w) : w })))
    : null),
  copy: ({ from, to }) => from && [{ w: (to || [HERE])[0], from: from.map((w) => w.word) }],
  move: ({ from, to }) => from && [...from.map((w) => ({ w })), { w: (to || [HERE])[0], from: from.map((w) => w.word) }],
  rename: ({ path, to }) => path && [...path.map((w) => ({ w })),
    ...(to || []).map((w) => ({ w: inFolder(parentOf(path[0]).word && parentOf(path[0]), w) }))],
  run: () => [],
  program: ({ path }) => (path || []).map((w) => ({ w })),
};

/** A PowerShell command's row read against its words. -> { files: [{ w, from? }], unplaced: [[code, word]], runs: [word] } */
function cmdletWrites(row, args) {
  const { roles, unknown } = paramsBound(row, args);
  if (roles.none) return { files: [], unplaced: [], runs: [] }; // -WhatIf: nothing is written
  if (unknown) return { files: [], unplaced: [['shell-unparsed', unknown]], runs: [] };
  const files = WRITES[row.writes](roles, row);
  const program = (roles.program || [])[0];
  const started = program && (!program.literal || [WIN.shells, SHELLS].some((names) => Object.hasOwn(names, programOf(program.word))));
  return { files: files || [], unplaced: [...(files ? [] : [['shell-handed', null]]), ...(started ? [['shell-unparsed', program]] : [])],
    runs: roles.run || [] };
}

const CMD_SWITCH = new RegExp(WIN.cmd.switch);

/** What reads a command named `name` whose first word is `head`: a Windows shell's text (in any language), in PowerShell its command, in
 * cmd its own row (its `/` switches left out); null: text/shell's rows by name. */
function rowKind(c, head) {
  const shell = shellText(programOf(head), c.args, c.inputs);
  if (shell) return { kind: 'text', ...shell };
  const { lang } = c.at;
  if (lang === 'powershell' && ROW_OF.has(c.name)) return { kind: 'cmdlet', row: ROW_OF.get(c.name) };
  if (lang !== 'cmd' || !Object.hasOwn(WIN.cmd.commands, c.name)) return null;
  return { kind: 'cmd', row: WIN.cmd.commands[c.name], args: c.args.filter((w) => !CMD_SWITCH.test(w.word)) };
}

module.exports = { lexWin, rowKind, cmdletWrites, shellLang, handsText, asFolder, HERE };
