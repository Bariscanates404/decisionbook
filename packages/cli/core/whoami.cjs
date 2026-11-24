// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE person working here, by name: kept once in their own home (never in the repository, never read again from git), before any work.
// What a name is, the row that keeps it and the line that says it.
const { errors: { fail }, paths: { hereKey }, person: { isAiName }, text: { lines: { filled, dayOf } } } = require('@atlasbound/kit');
const validate = require('../contracts/validate.cjs');
const { shortOf } = require('../contracts/codes.cjs');

const KEPT = 'person.json';
/** The cli's own folder for `root` in the person's home: what a purge takes with the packages' (it holds the kept name). */
const personStore = (root) => hereKey(root, 'cli');
const FROM = { git: 'git', person: 'you' }; // where a kept name came from: git's suggestion as setup found it, or the person's own word
const cleaned = (name) => String(name ?? '').replace(/\s+/gu, ' ').trim();
/** Why `name` is no person's name here: none given, or one the AI's own records carry; null where it is one. */
const nameRefused = (name) => (!cleaned(name) && 'person-name-empty') || (isAiName(name) && 'person-name-ai') || null;
/** A kept row as a line says it (`words`: the line's, with name, day and from). */
const nameLine = (words, row) => filled(words, { name: row.name, day: dayOf(row.at), from: FROM[row.from] ?? row.from });

/** The name kept for `root` in the person's `home` -> { name, from, at } | null where none is kept (or no home is there). */
function keptPerson(home, root) {
  const row = Object(validate.jsonOrNull((home && home.readText(hereKey(root, 'cli', KEPT))) || ''));
  return typeof row.name === 'string' && cleaned(row.name) ? { name: row.name, from: row.from, at: row.at } : null;
}

/** Keeps `name` as the person's here (`from`: git or person) -> the kept row; a name that is none is refused. */
function keepPerson(io, name, from) {
  const code = nameRefused(name) ?? (io.home ? null : 'person-no-home');
  if (code) throw fail(code, shortOf(code));
  const row = { name: cleaned(name), from, at: io.clock.now() };
  io.home.writeAtomic(hereKey(io.root, 'cli', KEPT), `${JSON.stringify(row)}\n`);
  return row;
}

module.exports = { cleaned, nameRefused, nameLine, keptPerson, keepPerson, personStore };
