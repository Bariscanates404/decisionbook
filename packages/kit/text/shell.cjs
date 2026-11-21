// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit's shell owner, PURE: `word` quotes repository text for a shell; `writtenBy` reads the files a command writes and the variables it
// sets for what it runs, by the rows of shell.json (a target it cannot tell is `unplaced`); `setBy` asks that reading about names.
const { codeWrites } = require('./shell-code.cjs');
const win = require('./shell-win.cjs');
const { lexIn, commandsOf, scopeCd, namedWords, assigned, movesFolder, cdTo, readWords, readBy, word, spelled } = require('./shell-words.cjs');
const TABLE = require('./shell.json');
const { resolveFrom, folderAfter, programOf } = require('../base/paths.cjs');

const INPUTS = ['<<', '<<-', '<<<'];
const DEPTH = 4; // a command string in a command string in ...: deeper is unplaced
const SHELLS = Object.fromEntries(Object.entries(TABLE.shells).map(([name, source]) => [name, new RegExp(source)]));
const CODE = new RegExp(TABLE.code.option);
const DEVICES = new RegExp(TABLE.devices);
const WIN_DEVICES = new RegExp(win.WIN.devices, 'i');
const ITEM = { word: 'item', literal: false, subs: [], why: 'shell-handed' }; // a file a row hands the command it runs (its `item` words): no one can place it
const TAKES = ['takes', 'out', 'chdir', 'into']; // a row's fields whose option takes an argument
const EVERY = '*'; // every variable: an emptied environment
const DRIVE = new RegExp(TABLE.sets.drive, 'i');
const STATEMENTS = TABLE.sets.statements.map((source) => new RegExp(source, 'i'));
// the variable a word names where the name is written out (`NAME`, `NAME=$value`, quoted or not); one that only expands names none here
const variableOf = (w) => /^["']?([A-Za-z_]\w*)(?=\W|$)/.exec(w.literal ? w.word : spelled(w))?.[1] ?? [];
const NAMES = [...TAKES, 'glued', 'script', 'when', 'unless', 'whole']; // every option a row names

const wordFits = (source, text) => source !== undefined && new RegExp(source).test(text);
// is `name` an option of the row under one of these fields?
const rowNames = (row, keys, name) => keys.some((key) => wordFits(row[key], name));
// `why`: each cause once, a code of contracts/codes and the word that caused it
const markUnplaced = (found, code, word = null) => Object.assign(found, {
  unplaced: true, why: found.why.some((u) => u.code === code && u.word === word) ? found.why : [...found.why, { code, word }] });
const cutShort = (found) => Object.assign(markUnplaced(found, 'shell-cut-short'), { unread: true }); // what the reader did not read is unplaced

const isDevice = (c, w) => w.literal && (DEVICES.test(w.word) || (c.at.lang !== 'sh' && WIN_DEVICES.test(w.word)));
const causeOf = (w) => w.why || (w.literal ? 'shell-cd-lost' : 'shell-word-expands');
function written(c, w, from, by = c.name) { // `by`: the redirection or the command that writes it
  if (isDevice(c, w)) return;
  c.wrote = true;
  if (!w.literal || c.at.lost) markUnplaced(c.found, causeOf(w), spelled(w));
  if (w.literal) c.found.writes.push({ path: w.word, cd: c.at.cd, by, ...(from ? { from } : {}), ...(w.maybe ? { maybe: true } : {}) });
}

function mergeRead(c, sub) {
  for (const row of sub.writes) c.found.writes.push(row);
  c.found.sets.push(...sub.sets);
  sub.why.forEach(({ code, word: cause }) => markUnplaced(c.found, code, cause));
  c.found.unread = c.found.unread || sub.unread;
}
const deeper = (at, lang = at.lang) => ({ ...at, depth: at.depth + 1, lang });

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
const CONTENTS = /(?:^|\/)\.{0,2}$/; // a copy's source spelled as a folder (`.`, a final `/`): its contents land there, so none is named
const copied = (files) => (sources(files).some((word) => CONTENTS.test(word)) ? [] : sources(files));
const WRITES = { // which of a row's files it writes
  all: (c, files, row) => (files.length || !row.bare ? files : [win.HERE]).forEach((w) => written(c, w)),
  last: (c, files) => files.length && written(c, files.at(-1), copied(files)),
  move: (c, files) => files.forEach((w, i) => written(c, w, i === files.length - 1 ? sources(files) : undefined)),
  unplaced: (c) => markUnplaced(c.found, 'shell-writes-unnamed', c.name),
};

// The script operand is set aside only where no long option is one the row does not name (getopt_long takes abbreviations).
function rowFiles(row, { opts, files }) {
  const has = (key) => opts.some(({ name }) => wordFits(row[key], name));
  if (!has('when') && (row.unless === undefined ? row.when !== undefined : has('unless'))) return null;
  const into = opts.find(({ name, arg }) => arg && wordFits(row.into, name));
  const all = into ? [...files, win.asFolder(into.arg)] : files;
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
  if (row.package) packageRun(c, row.package === true ? args[parts.at[0]] : { word: row.package, literal: true });
  const files = row.writes ? rowFiles(row, parts) : null;
  if (files) WRITES[row.writes](c, files, row);
  parts.opts.filter(({ name }) => wordFits(row.whole, name)).forEach(({ name }) => markUnplaced(c.found, 'shell-writes-unnamed', name));
  setByRow(c, row, parts);
}

// what a row's options set for the command it runs (shell.json `sets`), and the command text one of them hands
function setByRow(c, row, { opts, files }) {
  const given = (key) => opts.filter(({ name, arg }) => arg && wordFits(row[key], name)).map(({ arg }) => arg);
  c.found.sets.push(...given('variable').flatMap(variableOf));
  if ([...opts.map(({ name }) => name), (files[0] || {}).word].some((name) => wordFits(row.clears, name))) c.found.sets.push(EVERY);
  given('text').forEach((text) => textRun(c, text, 'sh'));
}

// the operands of a command that sets, exports, unsets or reads into variables, unless its option only prints them
function setByName(c) {
  if (!Object.hasOwn(TABLE.sets.names, c.name) || c.args.some((w) => wordFits(TABLE.sets.names[c.name] ?? undefined, w.word))) return;
  c.found.sets.push(...c.args.filter((w) => !w.word.startsWith('-')).flatMap(variableOf));
}

// A package script (npm run x, npm test): its text and its pre and post scripts, read where package.json names them; else unplaced.
function packageRun(c, name) {
  if (!name) return;
  const scripts = name.literal ? c.at.scripts(c.at.cd) : null;
  if (!scripts) markUnplaced(c.found, name.literal ? 'shell-writes-unnamed' : 'shell-word-expands', spelled(name));
  else [`pre${name.word}`, name.word, `post${name.word}`].filter((key) => typeof scripts[key] === 'string')
    .forEach((key) => mergeRead(c, commandWrites(scripts[key], deeper(c.at, 'sh'))));
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
  const dir = c.at.made.size ? standsIn(c) : null;
  if (!dir) return;
  const ran = words.find((w) => w.literal && !c.at.past() && c.at.made.has(resolveFrom(dir, w.word)));
  if (c.at.past()) cutShort(c.found); // the time was up while its words were looked up
  if (!ran) return;
  const text = c.at.made.get(resolveFrom(dir, ran.word));
  const [, program, arg] = /^#!(?:\S*\/)?(\S+)(?:[ \t]+(\S+))?/.exec(text) || [];
  if (Object.hasOwn(SHELLS, ran === words[0] ? (program === 'env' ? arg : program) || '' : c.name)) mergeRead(c, commandWrites(text, deeper(c.at, 'sh')));
  else codeIn(c, text);
}

// a text another shell runs: read in its language, or unplaced where it expands or cannot be read
function textRun(c, text, lang) {
  if (text && text.unparsed) markUnplaced(c.found, 'shell-unparsed', spelled(text.unparsed));
  else if (text && text.literal) mergeRead(c, commandWrites(text.word, deeper(c.at, lang)));
  else if (text) markUnplaced(c.found, 'shell-word-expands', spelled(text));
}

// a shell handed a script file and no command string (`sh x.sh`, `bash -e x.sh`): the caller's `file` hands the text where the command
// stands and it is read as sh; one this command wrote first is scriptRun's; one no one hands (none here, unreadable) is unplaced
function shellRun(c) {
  const script = c.name !== 'trap' && !c.args.some((w) => SHELLS[c.name].test(w.word)) && c.args.find((w) => !/^[-+]/.test(w.word));
  if (!script) return textRun(c, runText(c, SHELLS[c.name], c.inputs), 'sh');
  if (!script.literal || c.at.lost) return markUnplaced(c.found, causeOf(script), spelled(script));
  const dir = standsIn(c);
  if (dir === null || c.at.made.has(resolveFrom(dir, script.word))) return null;
  const text = c.at.past() ? null : c.at.file(c.at.cd, script.word);
  return typeof text === 'string' ? mergeRead(c, commandWrites(text, deeper(c.at, 'sh'))) : markUnplaced(c.found, 'shell-writes-unnamed', script.word);
}

const ROWS = [ // a name's rows, every one that holds
  [movesFolder, (c) => cdTo(c.at, c.args)],
  [(name) => Object.hasOwn(SHELLS, name), shellRun],
  [(name) => TABLE.evals.includes(name), (c) => {
    if (c.args.every((w) => w.literal)) mergeRead(c, commandWrites(c.args.map((w) => w.word).join(' '), deeper(c.at, 'sh')));
    else markUnplaced(c.found, 'shell-word-expands', spelled(c.args.find((w) => !w.literal)));
  }],
  [(name) => Object.hasOwn(TABLE.commands, name), (c) => byRow(c, TABLE.commands[c.name], c.args)],
  [(name) => !Object.hasOwn(SHELLS, name) && !['runs', 'sub'].some((key) => key in (TABLE.commands[name] || {})), codeRun],
];

function byCmdlet(c, row) {
  const { files, unplaced, runs } = win.cmdletWrites(row, c.args);
  unplaced.forEach(([code, w]) => markUnplaced(c.found, code, w ? spelled(w) : c.name));
  const variable = (w) => (w.literal && DRIVE.exec(w.word)) || null; // a path on the env: drive is a variable, never a file
  files.forEach(({ w, from }) => (variable(w) ? c.found.sets.push(variable(w).groups.name) : written(c, w, from)));
  runs.forEach((text) => textRun(c, text, 'powershell'));
}

const KINDS = { text: (c, k) => textRun(c, k.text, k.lang), cmdlet: (c, k) => byCmdlet(c, k.row), cmd: (c, k) => byRow(c, k.row, k.args) };
const readersOf = (c, head) => {
  const kind = win.rowKind(c, head.word);
  return kind ? [(x) => KINDS[kind.kind](x, kind)] : ROWS.filter(([fits]) => fits(c.name, c.at.lang)).map(([, read]) => read);
};

const isDup = (r) => r.op === '>&' && /^(?:\d+-?|-)$/.test(r.target.word); // 2>&1: a descriptor, not a file

function readCommand({ words, redirs }, at, found) {
  const ins = redirs.filter((r) => INPUTS.includes(r.op));
  const c = { at, found, ins, inputs: ins.map((r) => (r.op === '<<<' ? r.target : { word: r.body ?? '', literal: true })).filter(Boolean), wrote: false };
  [...words, ...redirs.map((r) => r.target).filter(Boolean)].flatMap((w) => w.subs)
    .forEach((sub) => mergeRead(c, commandWrites(sub, deeper(at))));
  const outs = redirs.filter((r) => r.target && TABLE.redirects.includes(r.op) && !isDup(r));
  outs.forEach((r) => written(c, r.target, undefined, r.op));
  const dir = c.inputs[0] && outs.some((r) => r.target.literal) ? standsIn(c) : null;
  if (dir) outs.filter((r) => r.target.literal).forEach((r) => at.made.set(resolveFrom(dir, r.target.word), c.inputs[0].word));
  const [head, ...args] = namedWords(words, at.lang);
  found.sets.push(...assigned(words, at.lang));
  // a PowerShell statement that is an expression ([IO.File]::WriteAllText(...), $env:NAME = …) is read as code
  if (head && !head.literal && at.lang === 'powershell') expression(c, words.map(spelled).join(' '));
  if (!head || !head.literal) return;
  Object.assign(c, { name: programOf(head.word), args });
  setByName(c);
  readersOf(c, head).forEach((read) => read(c));
  scriptRun(c, [head, ...args]);
}

function expression(c, text) {
  codeIn({ ...c, name: c.at.lang }, text);
  c.found.sets.push(...STATEMENTS.flatMap((re) => re.exec(text)?.groups.name ?? []));
}

// A cd list is only replaced, never changed, so a write shares it and the work stays linear; once `past()`, the rest is unread.
function commandWrites(command, { depth, past, cd, lost, lang, scripts, file }) {
  const found = { writes: [], sets: [], unplaced: false, unread: false, why: [] };
  if (depth > DEPTH) markUnplaced(found, 'shell-too-deep');
  const at = { cd, lost, scopes: [], depth, past, made: new Map(), lang, scripts, file }; // `made`: the scripts its heredocs wrote
  for (const cmd of found.unplaced ? [] : commandsOf(lexIn(command, lang))) {
    if (past()) return cutShort(found);
    if (cmd.mark) scopeCd(at, cmd.mark);
    else readCommand(cmd, at, found);
  }
  return found;
}

/** `lang`: the language the text is in: `sh` (bash, zsh, dash), `powershell` or `cmd`; `scripts(cd)`: the package scripts (package.json
 * `scripts`) where the cds leave the command, null where none is known (a script run there is unplaced); `file(cd, word)`: the text of
 * the script file a shell runs (`sh x.sh`), null where none is read (the script is unplaced). */
const writtenBy = (command, past = () => false, { lang = 'sh', scripts = () => null, file = () => null } = {}) => commandWrites(command, {
  depth: 0, past, cd: [], lost: false, lang, scripts, file });
/** Of `names`, the variables a command read by `writtenBy` sets, exports, unsets or clears for what it runs; one it only reads is none. */
const setBy = (read, names) => names.filter((name) => read.sets.includes(name) || read.sets.includes(EVERY));

module.exports = { word, writtenBy, setBy, readWords, readBy };
