// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit's shell owner, PURE: `word` quotes repository text for a shell; `writtenBy` reads the files a command writes by the rows of
// shell.json (a target it cannot tell is `unplaced`).
const { lex } = require('./shell-lex.cjs');
const { codeWrites } = require('./shell-code.cjs');
const TABLE = require('./shell.json');
const { resolveFrom, folderAfter } = require('../base/paths.cjs');

const SAFE = /^[\w@%+=:,./-][\w@%+=:,./#-]*$/; // `#` opens a comment only at a word's start
const SEPARATORS = [';', ';;', '&&', '||', '|', '|&', '&', '\n'];
const INPUTS = ['<<', '<<-', '<<<'];
const ASSIGN = /^[A-Za-z_]\w*=/;
const DEPTH = 4; // a command string in a command string in ...: deeper is unplaced
const SHELLS = Object.fromEntries(Object.entries(TABLE.shells).map(([name, source]) => [name, new RegExp(source)]));
const CODE = new RegExp(TABLE.code.option);
const DEVICES = new RegExp(TABLE.devices);
const ITEM = { word: 'item', literal: false, subs: [], why: 'shell-handed' }; // a file a row hands the command it runs (its `item` words): no one can place it
const TAKES = ['takes', 'out', 'chdir', 'into']; // a row's fields whose option takes an argument
const NAMES = [...TAKES, 'glued', 'script', 'when', 'unless', 'whole']; // every option a row names
const HERE = { word: '.', literal: true }; // the folder a command runs in, a row's `bare` files

const word = (text) => (SAFE.test(text) ? text : `'${String(text ?? '').replace(/'/g, "'\\''")}'`);
const wordFits = (source, text) => source !== undefined && new RegExp(source).test(text);
// is `name` an option of the row under one of these fields?
const rowNames = (row, keys, name) => keys.some((key) => wordFits(row[key], name));
// `why`: each cause once, a code of contracts/codes and the word that caused it
const markUnplaced = (found, code, word = null) => Object.assign(found, {
  unplaced: true, why: found.why.some((u) => u.code === code && u.word === word) ? found.why : [...found.why, { code, word }] });
const cutShort = (found) => Object.assign(markUnplaced(found, 'shell-cut-short'), { unread: true }); // what the reader did not read is unplaced

function commandsOf(tokens) {
  const out = [];
  let cmd = { words: [], redirs: [] };
  const flush = (mark) => {
    if (cmd.words.length || cmd.redirs.length) out.push(cmd);
    if (mark) out.push({ mark });
    cmd = { words: [], redirs: [] };
  };
  for (let i = 0; i < tokens.length; i += 1) {
    const { op, body } = tokens[i];
    const target = tokens[i + 1] && tokens[i + 1].op === undefined ? tokens[i + 1] : null;
    if (op === undefined) cmd.words.push(tokens[i]);
    else if (SEPARATORS.includes(op)) flush(null);
    else if (op === '(' || op === ')') flush(op);
    else {
      cmd.redirs.push({ op, target, body });
      if (target) i += 1; // the redirection's file, not a word of the command
    }
  }
  flush(null);
  return out;
}

const causeOf = (w) => w.why || (w.literal ? 'shell-cd-lost' : 'shell-word-expands');
const spelled = (w) => w.raw ?? w.word; // as written (a row's ITEM has no `raw`)
function written(c, w, from, by = c.name) { // `by`: the redirection or the command that writes it
  if (w.literal && DEVICES.test(w.word)) return;
  c.wrote = true;
  if (!w.literal || c.at.lost) markUnplaced(c.found, causeOf(w), spelled(w));
  if (w.literal) c.found.writes.push({ path: w.word, cd: c.at.cd, by, ...(from ? { from } : {}), ...(w.maybe ? { maybe: true } : {}) });
}

function mergeRead(c, sub) {
  for (const row of sub.writes) c.found.writes.push(row);
  sub.why.forEach(({ code, word: cause }) => markUnplaced(c.found, code, cause));
  c.found.unread = c.found.unread || sub.unread;
}
const deeper = (at) => ({ depth: at.depth + 1, past: at.past, cd: at.cd, lost: at.lost });

function unitsOf(text, row) {
  const [, long, value] = /^(--[^=]+)(?:=([\s\S]*))?$/.exec(text) || [];
  if (long || rowNames(row, NAMES, text)) return [[long || text, value]];
  return [...text.slice(1)].map((letter, k) => [`-${letter}`, text.slice(k + 2) || undefined]);
}

function optionAt(parts, args, i, row) {
  for (const [name, rest] of unitsOf(args[i].word, row)) {
    const takes = rowNames(row, ['glued'], name) ? 'glued' : rowNames(row, TAKES, name);
    const arg = takes && rest !== undefined ? { ...args[i], word: rest } : undefined;
    parts.opts.push({ name, arg: arg || (takes === true ? args[(i += 1)] : undefined) });
    if (takes) break;
  }
  return i;
}

function rowWordsOf(args, row) {
  const parts = { opts: [], files: [], at: [] };
  const ends = row.sub !== undefined || typeof row.runs === 'number';
  const operand = (w, i, dashed) => {
    parts.at.push(i);
    parts.files.push(row.maybe && !dashed && !parts.files.length ? { ...w, maybe: true } : w);
    return dashed || ends;
  };
  for (let i = 0, dashed = false; i < args.length; i += 1) {
    const w = args[i];
    if (!dashed && w.word === '--') dashed = true;
    else if (!dashed && /^-./.test(w.word)) i = optionAt(parts, args, i, row);
    else if (w.word) dashed = operand(w, i, dashed);
  }
  return parts;
}

function outsOf(row, { opts, files }) {
  const path = (w) => ((wordFits(row.out, w.word) && new RegExp(row.out).exec(w.word).groups) || {}).path;
  const named = opts.filter(({ name }) => wordFits(row.out, name)).map(({ arg }) => arg);
  return [...named, ...files.filter(path).map((w) => ({ ...w, word: path(w) }))].filter(Boolean);
}

function movedBy(c, row, { opts }) {
  const dirs = opts.filter(({ name }) => wordFits(row.chdir, name)).map(({ arg }) => arg || { literal: false });
  if (dirs.length) c.at = { ...c.at, cd: [...c.at.cd, ...dirs.filter((d) => d.literal).map((d) => d.word)], lost: c.at.lost
    || dirs.some((d) => !d.literal) };
}

function runInner(c, row, args, { at }) {
  const starts = typeof row.runs === 'number' ? [at[row.runs]] : args.flatMap((w, i) => (wordFits(row.runs, w.word) ? [i + 1] : []));
  for (const start of starts.filter((i) => i !== undefined)) {
    const end = args.findIndex((w, i) => i >= start && wordFits(row.until, w.word));
    const words = args.slice(start, end === -1 ? args.length : end).map((w) => (wordFits(row.item, w.word) ? ITEM : { ...w, subs: [] }));
    readCommand({ words: row.items ? [...words, ITEM] : words, redirs: c.ins }, c.at, c.found);
  }
}

const sources = (files) => files.slice(0, -1).map((w) => w.word);
const WRITES = { // which of a row's files it writes
  all: (c, files, row) => (files.length || !row.bare ? files : [HERE]).forEach((w) => written(c, w)),
  last: (c, files) => files.length && written(c, files.at(-1), sources(files)),
  move: (c, files) => files.forEach((w, i) => written(c, w, i === files.length - 1 ? sources(files) : undefined)),
  unplaced: (c) => markUnplaced(c.found, 'shell-writes-unnamed', c.name),
};

// The script operand is set aside only where no long option is one the row does not name (getopt_long takes abbreviations).
function rowFiles(row, { opts, files }) {
  const has = (key) => opts.some(({ name }) => wordFits(row[key], name));
  if (!has('when') && (row.unless === undefined ? row.when !== undefined : has('unless'))) return null;
  const into = opts.find(({ name, arg }) => arg && wordFits(row.into, name));
  const all = into ? [...files, { ...into.arg, word: into.arg.word.replace(/\/*$/, '/') }] : files;
  const unknown = opts.some(({ name }) => name.startsWith('--') && !rowNames(row, NAMES, name));
  return row.script && !has('script') && !unknown ? all.slice(1) : all;
}

const oldStyle = (row, words) => (row.bundle && /^[A-Za-z]+$/.test((words[0] || {}).word) ? [{ ...words[0], word: `-${words[0].word}` }, ...words.slice(1)] : words);

function byRow(c, row, words) {
  const args = oldStyle(row, words);
  const parts = rowWordsOf(args, row);
  movedBy(c, row, parts);
  const sub = row.sub && row.sub[(args[parts.at[0]] || {}).word];
  if (sub) return byRow(c, sub, args.slice(parts.at[0] + 1));
  outsOf(row, parts).forEach((w) => written(c, w));
  if (row.runs !== undefined) runInner(c, row, args, parts);
  const files = row.writes ? rowFiles(row, parts) : null;
  if (files) WRITES[row.writes](c, files, row);
  parts.opts.filter(({ name }) => wordFits(row.whole, name)).forEach(({ name }) => markUnplaced(c.found, 'shell-writes-unnamed', name));
}

function runText(c, option, inputs) {
  const at = c.args.findIndex((w) => option.test(w.word));
  const code = at === -1 ? undefined : (option.exec(c.args[at].word).groups || {}).code;
  return code === undefined ? (at === -1 ? inputs[0] : c.args[at + 1]) || null : { ...c.args[at], word: code };
}

function codeIn(c, text) {
  const { paths, unplaced, unread } = codeWrites(text, c.at.past);
  paths.forEach((path) => written(c, { word: path, literal: true }));
  if (unread) cutShort(c.found);
  else if (unplaced) markUnplaced(c.found, 'shell-code-path', c.name);
}

// An expanded word is not read (grep -e "$x" is no code), so it sets nothing.
function codeRun(c) {
  const text = runText(c, CODE, c.wrote ? [] : c.inputs);
  if (text && text.literal) codeIn(c, text.word);
}

function standsIn(c) {
  const dir = folderAfter(c.at.cd, '/\0', c.at.past);
  if (dir === null) cutShort(c.found);
  return dir;
}

function scriptRun(c, words) {
  const dir = c.at.scripts.size ? standsIn(c) : null;
  if (!dir) return;
  const ran = words.find((w) => w.literal && !c.at.past() && c.at.scripts.has(resolveFrom(dir, w.word)));
  if (c.at.past()) cutShort(c.found); // the time was up while its words were looked up
  if (!ran) return;
  const text = c.at.scripts.get(resolveFrom(dir, ran.word));
  const [, program, arg] = /^#!(?:\S*\/)?(\S+)(?:[ \t]+(\S+))?/.exec(text) || [];
  if (Object.hasOwn(SHELLS, ran === words[0] ? (program === 'env' ? arg : program) || '' : c.name)) mergeRead(c, commandWrites(text, deeper(c.at)));
  else codeIn(c, text);
}

const ROWS = [ // a name's rows, every one that holds
  [(name) => TABLE.cd.includes(name), (c) => {
    const to = c.args.find((w) => w.word === '-' || !w.word.startsWith('-'));
    if (to && to.literal && to.word !== '-') c.at.cd = [...c.at.cd, to.word];
    else c.at.lost = true; // home, the last folder, or an expansion
  }],
  [(name) => Object.hasOwn(SHELLS, name), (c) => {
    const text = runText(c, SHELLS[c.name], c.inputs);
    if (text && text.literal) mergeRead(c, commandWrites(text.word, deeper(c.at)));
    else if (text) markUnplaced(c.found, 'shell-word-expands', spelled(text));
  }],
  [(name) => TABLE.evals.includes(name), (c) => {
    if (c.args.every((w) => w.literal)) mergeRead(c, commandWrites(c.args.map((w) => w.word).join(' '), deeper(c.at)));
    else markUnplaced(c.found, 'shell-word-expands', spelled(c.args.find((w) => !w.literal)));
  }],
  [(name) => Object.hasOwn(TABLE.commands, name), (c) => byRow(c, TABLE.commands[c.name], c.args)],
  [(name) => !Object.hasOwn(SHELLS, name) && !['runs', 'sub'].some((key) => key in (TABLE.commands[name] || {})), codeRun],
];

const isDup = (r) => r.op === '>&' && /^(?:\d+-?|-)$/.test(r.target.word); // 2>&1: a descriptor, not a file

function readCommand({ words, redirs }, at, found) {
  const ins = redirs.filter((r) => INPUTS.includes(r.op));
  const c = { at, found, ins, inputs: ins.map((r) => (r.op === '<<<' ? r.target : { word: r.body ?? '', literal: true })).filter(Boolean), wrote: false };
  [...words, ...redirs.map((r) => r.target).filter(Boolean)].flatMap((w) => w.subs)
    .forEach((sub) => mergeRead(c, commandWrites(sub, deeper(at))));
  const outs = redirs.filter((r) => r.target && TABLE.redirects.includes(r.op) && !isDup(r));
  outs.forEach((r) => written(c, r.target, undefined, r.op));
  const dir = c.inputs[0] && outs.some((r) => r.target.literal) ? standsIn(c) : null;
  if (dir) outs.filter((r) => r.target.literal).forEach((r) => at.scripts.set(resolveFrom(dir, r.target.word), c.inputs[0].word));
  const start = words.findIndex((w) => !ASSIGN.test(w.word) && !TABLE.skip.includes(w.word));
  const [head, ...args] = start === -1 ? [] : words.slice(start);
  if (!head || !head.literal) return;
  Object.assign(c, { name: head.word.split('/').pop().replace(/(?<=.)@.*$/, '').replace(/[\d.]+$/, ''), args });
  ROWS.filter(([fits]) => fits(c.name)).forEach(([, read]) => read(c));
  scriptRun(c, [head, ...args]);
}

function scopeCd(at, mark) {
  if (mark === '(') at.scopes.push({ cd: at.cd, lost: at.lost });
  else if (at.scopes.length) Object.assign(at, at.scopes.pop());
}

// A cd list is only replaced, never changed, so a write shares it and the work stays linear; once `past()`, the rest is unread.
function commandWrites(command, { depth, past, cd = [], lost = false }) {
  const found = { writes: [], unplaced: false, unread: false, why: [] };
  if (depth > DEPTH) markUnplaced(found, 'shell-too-deep');
  const at = { cd, lost, scopes: [], depth, past, scripts: new Map() };
  for (const cmd of found.unplaced ? [] : commandsOf(lex(String(command ?? '')))) {
    if (past()) return cutShort(found);
    if (cmd.mark) scopeCd(at, cmd.mark);
    else readCommand(cmd, at, found);
  }
  return found;
}

const writtenBy = (command, past = () => false) => commandWrites(command, { depth: 0, past });

/** What the reader saw, for debug: each command's words as written (`literal` false where one expands) and its redirections. */
const readWords = (command) => commandsOf(lex(String(command ?? ''))).filter((cmd) => !cmd.mark).map(({ words, redirs }) => ({
  words: words.map((w) => ({ word: spelled(w), literal: w.literal })),
    redirs: redirs.map(({ op, target }) => ({ op, word: target ? spelled(target) : null })) }));

/** The words a command hands each program it runs (literal, no option, a `<` file too), each with the folders a `cd` before it moved to:
 * what it may read, whatever program reads it; the caller keeps the ones that are files. -> [{ word, cd }] */
function readBy(command) {
  const at = { cd: [], lost: false, scopes: [] };
  const out = [];
  for (const cmd of commandsOf(lex(String(command ?? '')))) {
    const [name, ...args] = cmd.mark ? [] : cmd.words.filter((w, i, all) => !all.slice(0, i + 1).every((x) => ASSIGN.test(x.word)));
    if (cmd.mark) scopeCd(at, cmd.mark);
    else if (name && TABLE.cd.includes(name.word)) {
      if (args[0] && args[0].literal && args[0].word !== '-') at.cd = [...at.cd, args[0].word];
    } else {
      const ins = cmd.redirs.filter(({ op, target }) => op === '<' && target).map(({ target }) => target);
      [...args, ...ins].filter((w) => w.literal && !w.word.startsWith('-')).forEach((w) => out.push({ word: w.word, cd: at.cd }));
    }
  }
  return out;
}

module.exports = { word, writtenBy, readWords, readBy };
