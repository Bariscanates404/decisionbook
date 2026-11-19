// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: the refusals of the command line over the verb table (`catalog`): a command typed wrong (exit 2, with its usage line and the
// nearest verb), where a JSON word broke, and a refusal as its one stderr line and, with --json, as one JSON object.
const { errors: { fail, isFail }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { COMMON_FLAGS, USAGE_CODES } = require('../contracts/verbs.cjs');
const { isCode, shortOf, WORDS: { typed: W } } = require('../contracts/codes.cjs');
const { usageLine, closestVerb, aloneFlags } = require('./help.cjs');

/** Words nothing installed answers: for a flag where a command belongs, what AtlasBound takes with no command (the help's own list);
 * a module's own line when that module is not installed (not for a word of a group that is here, `grouped`); else no such verb. */
function unknownVerb(catalog, words, grouped = false) {
  const takes = aloneFlags(catalog.verbs).map(([said]) => said);
  const alone = { flag: words[0], some: takes.slice(0, -1).join(', '), last: takes.at(-1) };
  if (words[0]?.startsWith('-')) return Object.assign(fail('flag-unknown', filled(W.flagAlone, alone)), { routes: [W.usage, W.helpLists] });
  const module = !grouped && catalog.missing(words);
  if (module) return fail('package-not-installed', `${module.lacks.join(', ')}: module ${module.name}, ${words.join(' ')}: ${module.loses}`);
  return Object.assign(fail('verb-unknown', words.join(' ')), { routes: nearVerbRoutes(catalog, words) });
}

/** The nearest verb to mistyped `words` (in their group, for a word after a group's: `debug frob`) and where the verbs are listed. */
function nearVerbRoutes(catalog, words) {
  const subs = words.length > 1 ? catalog.under(words.slice(0, 1)).filter((row) => row.words.length > 1 && !row.next) : [];
  const near = subs.length ? closestVerb(words[1], subs.map((row) => row.words[1]))
    : (Object.hasOwn(W.meant, words[0]) && W.meant[words[0]]) // another word for a verb
      || closestVerb(words[0], catalog.verbs.map((row) => row.words[0]));
  const lists = subs.length ? filled(W.groupLists, { group: words[0] }) : W.helpLists;
  return [...(near ? [filled(W.didYouMean, { words: `${subs.length ? `${words[0]} ` : ''}${near}` })] : []), lists];
}

/** What a refusal of `row` adds: where its JSON broke, and for a command typed wrong its usage line. */
function withUsage(err, row) {
  if (!isFail(err)) return err;
  const broken = err.broken ? [err.broken.empty ? W.noJson : filled(W.jsonBreaks, err.broken)] : [];
  const typed = USAGE_CODES.includes(err.code) || (err.broken && row.stdin !== undefined);
  const usage = typed ? [`usage: ${usageLine(row)}`, filled(W.helpSays, { words: row.words.join(' ') })] : [];
  return broken.length || usage.length ? Object.assign(err, { routes: [...broken, ...usage, ...(err.routes || [])] }) : err;
}

/** With no command, a flag AtlasBound alone does not take (it is refused as a word where a command belongs, never answered with the
 * help), or null. */
function oddTopFlag(catalog, words, flags) {
  const takes = aloneFlags(catalog.verbs).map(([said]) => said.split(' ')[0]);
  return (words.length ? null : Object.keys(flags).map((name) => `--${name}`).find((flag) => !takes.includes(flag))) ?? null;
}

/** A flag the row does not take, or a word where it takes none: refused with its usage line. */
function typedWrong(row, flags, rest) {
  const known = [...COMMON_FLAGS, ...(row.flags || [])];
  const flag = [...Object.keys(flags).map((name) => `--${name}`), ...rest.filter((word) => /^-./.test(word))].find((name) => !known.includes(name));
  if (flag) throw withUsage(fail('flag-unknown', filled(W.flagOn, { flag, words: row.words.join(' '), known: known.join(' ') })), row);
  if (row.noWords && rest.length) throw withUsage(fail('args-invalid', filled(W.noWord, { words: row.words.join(' '), word: rest[0] })), row);
}

/** The row asked for, or a refusal before anything is composed. A value flag with no value refuses: a `--target` falling back to the cwd
 * would wire the wrong repository. A word after a group's own that is none of its commands is no verb of that group. */
function verbRow(catalog, { words, flags }) {
  const sent = (flag) => flags[flag.slice(2)]; // no value: nothing, an empty word, or the next flag
  const empty = catalog.valueFlags.find((flag) => Object.hasOwn(flags, flag.slice(2)) && (!sent(flag) || String(sent(flag)).startsWith('--')));
  if (empty) throw fail('flag-needs-value', empty);
  const row = catalog.route(words);
  if (!row) throw unknownVerb(catalog, words);
  const rest = words.slice(row.words.length);
  if (groupWord(catalog, row, rest)) throw unknownVerb(catalog, words, true);
  if (row.run || row.call) typedWrong(row, flags, rest);
  return row;
}
/** A word after a group's own, where that group takes none: one of its commands, mistyped. */
const groupWord = (catalog, row, rest) => /^[^-]/.test(rest[0] ?? '') && (row.noWords || !(row.run || row.call))
  && catalog.under(row.words).some((r) => r.words.length > row.words.length);

/** A refusal as data: its line after `atlasbound: `, its code, its words after the code, the next steps. A code no bound table holds stays
 * `unexpected-error`, so a stray error's message is never printed; a package's code (`knows`: its trace knows it) prints as that package
 * wrote it. */
function refusalData(err, knows) {
  const coded = isFail(err) && (isCode(err.code) || knows(err.code));
  const said = coded && (isCode(err.code) ? `${err.message} (${shortOf(err.code)})` : err.message);
  if (!said) return { line: `unexpected-error: ${err?.name}`, code: 'unexpected-error', message: String(err?.name), next: [] };
  return { line: said, code: err.code, message: said.startsWith(`${err.code}: `) ? said.slice(err.code.length + 2) : said, next: err.routes || [] };
}

/** The refusal as stderr says it, as one JSON object (with --json, on stdout, where a script reads the answer), and its exit code. */
function refusalSaid(err, knows) {
  const { line, code, message, next } = refusalData(err, knows);
  return { line: `atlasbound: ${line}\n${next.map((route) => `  ${route}\n`).join('')}`, json: `${JSON.stringify({ error: { code, message, next } })}\n`,
    exit: USAGE_CODES.includes(code) ? 2 : 1 };
}

module.exports = { verbRow, unknownVerb, withUsage, oddTopFlag, refusalSaid };
