// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// a shell command whose text names the product's own store (kit's OWN_STORE: its folder in the person's home, or the repository's but what
// the root says a session writes) as a write's target is refused STORE_SEALED, with kit's line for that code. A placed write is judged by
// its path; a write the reader cannot place by every store path its text names. Reading the store writes nothing, so it passes. Named
// limit: a command that builds the path so that its text does not hold it is not seen.
const { paths: { OWN_STORE, resolveFrom }, store: { inStore, sealedFile, sealedReason } } = require('@atlasbound/kit');

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

/** The store file a spelled path lands in (kit's seal), as a person reads it, or null; a home the shell expands is the person's home. */
function storeFile(io, spelled, dir) {
  const rest = spelled.replace(HOME_SPELLED, '');
  if (rest !== spelled) return inStore(rest) ? `~/${rest}` : null;
  return sealedFile(io, resolveFrom(dir, spelled));
}

/** -> the STORE_SEALED verdict of a command `read` (kit's writtenBy) in folder `dir`, or null. */
function sealedBy(io, command, read, dir) {
  const placed = read.writes.filter((write) => !write.cd.length).map((write) => write.path);
  const named = read.unplaced || read.writes.some((write) => write.cd.length) ? namedIn(command) : [];
  let file = null;
  for (const spelled of [...placed, ...named]) file = file || storeFile(io, spelled, dir); // the first store file is named
  return file ? { verdict: 'deny', code: 'STORE_SEALED', file, reason: sealedReason(file) } : null;
}

module.exports = { sealedBy };
