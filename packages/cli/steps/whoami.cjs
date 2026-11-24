// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Who the person is here (core/whoami), at the two moments it is set. Setup keeps the name the first time: git's name is the suggestion,
// and at their own terminal the person keeps it or types another. After that only the person changes it (`whoami --name`, their own
// terminal): a git config an AI's shell rewrote changes no record's name.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { shortOf, WORDS: { whoami: W } } = require('../contracts/codes.cjs');
const { cleaned, nameRefused, nameLine, keptPerson, keepPerson } = require('../core/whoami.cjs');

/** Setup's part: the name already kept stands; with none kept it is kept now (firstName). -> the line setup says */
async function personAtSetup(io) {
  const had = keptPerson(io.home, io.root);
  return had ? nameLine(W.kept, had) : firstName(io);
}
/** The first name kept here: git's is the suggestion; a person at their own terminal keeps it with Enter or types another, and with
 * no person there it is kept as git gave it. -> the line setup says */
async function firstName(io) {
  const suggested = cleaned((await io.git.me()).name);
  const usable = !nameRefused(suggested);
  const typed = io.terminal.on ? cleaned(await io.terminal.ask(filled(usable ? W.ask : W.askNone, { suggested }))) : '';
  const name = typed || (usable ? suggested : '');
  if (nameRefused(name)) return filled(W.none, { why: suggested ? shortOf(nameRefused(name)) : W.gitNone });
  return nameLine(io.terminal.on ? W.kept : W.keptUnasked, keepPerson(io, name, typed ? 'person' : 'git'));
}

/** What `whoami` says: the kept name with where it came from, and git's where it names someone else now; or that none is kept. */
function whoLines({ git, ...kept }) {
  if (!kept.name) return [filled(W.none, { why: W.notKept })];
  return [nameLine(W.kept, kept), ...(git && git !== kept.name ? [filled(W.gitDiffers, { git })] : [])];
}

/** `whoami`: who the person is here and where the name came from; `whoami --name "<name>"` (the person's own act) changes it. */
async function whoami(args, io) {
  const { name } = args.flags;
  const kept = name === undefined ? keptPerson(io.home, io.root) : keepPerson(io, name === true ? '' : name, 'person');
  const out = { name: null, from: null, at: null, ...kept, git: cleaned((await io.git.me()).name) || null };
  const code = (name !== undefined && 'person-kept') || (kept ? 'person-named' : 'person-unnamed');
  return { out, n: {}, codes: { [code]: 1 }, text: `${whoLines(out).map((line) => line.trim()).join('\n')}\n` };
}

module.exports = { personAtSetup, whoami };
