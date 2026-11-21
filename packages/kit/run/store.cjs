// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE seal of the product's own store (base/paths OWN_STORE), in a repository and in a person's home: only the product writes there, but
// for what the root says a session writes. Every gate asks here which store file a path or a shell command's write lands in, and
// refuses it in this sentence. A placed write is judged by its path; a write the reader cannot place by every store path the command's
// text names. Reading the store writes nothing. Named limit: a command that builds the path so that its text does not hold it.
const { OWN_STORE, inStore, resolveFrom } = require('../base/paths.cjs');
const { shortOf, ruleOf } = require('../contracts/codes.cjs');

/** The store file a HOST path lands in, as a person reads it (`~/` for the home's), or null: any other file, and in the repository what
 * `io.sessionWrites` opens: a folder (it ends in `/`) and all under it, a file by its whole name (an io that names none opens nothing). */
function sealedFile(io, host) {
  const key = io.fs.keyAt(host);
  const opens = (open) => (open.endsWith('/') ? `${key}/`.startsWith(open) : key === open);
  if (key !== null) return inStore(key) && !(io.sessionWrites?.() ?? []).some(opens) ? key : null;
  const home = io.home ? io.home.keyAt(host) : null;
  return home !== null && inStore(home) ? `~/${home}` : null;
}

const HOME_SPELLED = /^(?:~|\$HOME|\$\{HOME\})\//u; // the home's spellings a shell expands
const STOP = /[\s'"`;|&<>()]/u; // what ends a shell word that may name a path
const FOLDER = OWN_STORE.replace(/\/$/u, '');

/** Every distinct word of `command` that holds the store's folder name; one pass, never a backtracking match (quadratic on a long
 * word). */
function namedIn(command) {
  const words = new Set();
  for (let at = command.indexOf(FOLDER); at !== -1; at = command.indexOf(FOLDER, at)) {
    let from = at;
    let to = at + FOLDER.length;
    while (from > 0 && !STOP.test(command[from - 1])) from -= 1;
    while (to < command.length && !STOP.test(command[to])) to += 1;
    words.add(command.slice(from, to));
    at = to;
  }
  return [...words];
}

/** The store file a spelled path lands in, as a person reads it, or null; a home the shell expands is the person's home. */
function spelledFile(io, spelled, dir) {
  const rest = spelled.replace(HOME_SPELLED, '');
  if (rest !== spelled) return inStore(rest) ? `~/${rest}` : null;
  return sealedFile(io, resolveFrom(dir, spelled));
}

/** The first store file a shell `command` writes, run in folder `dir` and read by text/shell writtenBy (`read`), or null. */
function sealedByShell(io, command, read, dir) {
  const placed = read.writes.filter((write) => !write.cd.length).map((write) => write.path);
  const named = read.unplaced || read.writes.some((write) => write.cd.length) ? namedIn(command) : [];
  return [...placed, ...named].reduce((file, spelled) => file || spelledFile(io, spelled, dir), null);
}

/** STORE_SEALED's one sentence, naming the file. */
const sealedReason = (file) => `STORE_SEALED: ${shortOf('STORE_SEALED')} — ${file}. ${ruleOf('STORE_SEALED')}`;

module.exports = { sealedFile, sealedByShell, sealedReason };
