// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// part of text/shell, PURE: a command's words as a shell cuts them: `word` quotes repository text for a shell, `lexIn` cuts a text in
// its language, `commandsOf` groups tokens into commands, `namedWords` and `cdTo` are the one reading of a command's name and of a cd,
// `readWords` is what debug shows, `readBy` the words a command hands the programs it runs.
const { lex } = require('./shell-lex.cjs');
const { lexWin } = require('./shell-win.cjs');
const TABLE = require('./shell.json');
const { programOf } = require('../base/paths.cjs');

const SAFE = /^[\w@%+=:,./-][\w@%+=:,./#-]*$/; // `#` opens a comment only at a word's start
const SEPARATORS = [';', ';;', '&&', '||', '|', '|&', '&', '\n'];
const ASSIGN = /^(?<name>[A-Za-z_]\w*)\+?=/;

const word = (text) => (SAFE.test(text) ? text : `'${String(text ?? '').replace(/'/g, "'\\''")}'`);
const spelled = (w) => w.raw ?? w.word; // as written (a row's ITEM has no `raw`)

const lexIn = (command, lang) => (lang === 'sh' ? lex(String(command ?? '')) : lexWin(command, lang));

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

function scopeCd(at, mark) {
  if (mark === '(') at.scopes.push({ cd: at.cd, lost: at.lost });
  else if (at.scopes.length) Object.assign(at, at.scopes.pop());
}

/** A command's words from its name on, past its assignments and the shell words before it. */
function namedWords(words, lang) {
  const skip = lang === 'powershell' ? TABLE.windows.powershell.lex.skip : TABLE.skip;
  const start = words.findIndex((w) => !ASSIGN.test(w.word) && !skip.includes(w.word));
  return start === -1 ? [] : words.slice(start);
}

/** The variables a command's assignment words set, before its name (`NAME=…`, `NAME+=…`). */
const assigned = (words, lang) => words.slice(0, words.length - namedWords(words, lang).length)
  .flatMap((w) => ASSIGN.exec(w.word)?.groups.name ?? []);

/** Whether a command of this name moves the working folder (PowerShell has names of its own). */
const movesFolder = (name, lang) => TABLE.cd.includes(name) || (lang === 'powershell' && Object.hasOwn(TABLE.windows.cd, name));

/** A cd's words move `at`: to a literal folder, else the folder is lost (home, the last folder, an expansion). */
function cdTo(at, args) {
  const to = args.find((w) => w.word === '-' || !w.word.startsWith('-'));
  if (to && to.literal && to.word !== '-') at.cd = [...at.cd, to.word];
  else at.lost = true;
}

/** What the reader saw, for debug: each command's words as written (`literal` false where one expands) and its redirections. */
const readWords = (command) => commandsOf(lex(String(command ?? ''))).filter((cmd) => !cmd.mark).map(({ words, redirs }) => ({
  words: words.map((w) => ({ word: spelled(w), literal: w.literal })),
    redirs: redirs.map(({ op, target }) => ({ op, word: target ? spelled(target) : null })) }));

/** The words a command in `lang` hands each program it runs (literal, no option, a `<` file too), each with the folders a `cd` before it
 * moved to: what it may read, whatever program reads it; the caller keeps the ones that are files. After a cd no one can follow, no word
 * can be placed. -> [{ word, cd }] */
function readBy(command, { lang = 'sh' } = {}) {
  const at = { cd: [], lost: false, scopes: [] };
  const out = [];
  for (const cmd of commandsOf(lexIn(command, lang))) {
    const [name, ...args] = cmd.mark ? [] : namedWords(cmd.words, lang);
    if (cmd.mark) scopeCd(at, cmd.mark);
    else if (name && movesFolder(programOf(name.word), lang)) cdTo(at, args);
    else if (!at.lost) {
      const ins = cmd.redirs.filter(({ op, target }) => op === '<' && target).map(({ target }) => target);
      [...args, ...ins].flatMap((w) => w.items || [w]).filter((w) => w.literal && !w.word.startsWith('-'))
        .forEach((w) => out.push({ word: w.word, cd: at.cd }));
    }
  }
  return out;
}

module.exports = { word, lexIn, commandsOf, scopeCd, namedWords, assigned, movesFolder, cdTo, readWords, readBy, spelled };
