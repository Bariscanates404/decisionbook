// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: the help a newcomer reads, made from the verb table's rows (each row's `what` and `help`, its package's manifest or the cli's
// own), no line past 100 columns. The overview: what the product is, USAGE, the first steps and the slash commands, then the commands in
// short (what reads, what only the person runs, what the AI session runs, the rest), the flags and examples; `help --all` every command
// with its line in three groups, a person's own marked; one command's help its USAGE line, what it does, when, an example, what it
// changes, who may run it, its flags and its exit codes.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { FLAGS } = require('../contracts/verbs.cjs');
const { WORDS: { help: W } } = require('../contracts/codes.cjs');

const WIDTH = 100;
// every command's flags as the help names them, each with the value it takes (`--target <dir>`)
const SAID = FLAGS.map((row) => ({ ...row, said: [row.flag, row.value].filter(Boolean).join(' ') }));
const COMMON = Object.fromEntries(SAID.filter((row) => !row.asks).map((row) => [row.said, row.means]));
/** What AtlasBound takes with no command, as [flag, what it means, its short form]: every command's flags, then those of the help,
 * which answers there. */
const aloneFlags = (rows) => [...SAID.map((row) => [row.said, row.means, row.short]),
  ...Object.entries(rows.find((r) => r.words.join(' ') === 'help')?.help?.flags ?? {})];
// what the help sorts the rows by
const IS = { debug: (r) => r.words[0] === 'debug', ai: (r) => Boolean(r.help?.ai), person: (r) => r.by === 'person' };
const GROUPS = [[W.groups[0], (r) => !IS.ai(r) && !IS.debug(r)], [W.groups[1], (r) => IS.ai(r) && !IS.debug(r)], [W.groups[2], IS.debug]];
// a `what` that begins with the words a verb takes (`<run>: the run's stored answers`)
const HEAD = /^((?:<[^>]*>|\[[^\]]*\]|\||\.\.\.|\s)+):\s/;

/** `text` in lines of at most WIDTH columns: the first after `first`, each next one after `lead`. A word is never cut. */
function wrap(text, lead, first = lead) {
  const lines = [];
  let line = first;
  let fresh = true; // nothing of `text` on this line yet
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (!fresh && line.length + 1 + word.length > WIDTH) {
      lines.push(line);
      [line, fresh] = [lead, true];
    }
    line += fresh ? word : ` ${word}`;
    fresh = false;
  }
  return [...lines, line].join('\n');
}

/** The words a row takes after its own: its help's `usage`; with none a group takes a command, a `noWords` row nothing, and a row
 * whose manifest carries no usage (an add-on's) the head of its `what`, else any words. */
function takesOf(row) {
  if (row.help?.usage !== undefined) return row.help.usage;
  if (!(row.run || row.call)) return '<command>';
  return row.noWords ? '' : HEAD.exec(row.what)?.[1].trim() ?? '[<word>...]';
}

/** A row's usage line: the row's words, what it takes, `[flags]`. */
const usageLine = (row) => `atlasbound ${[...row.words, takesOf(row)].filter(Boolean).join(' ')} [flags]`;

const personMark = (row) => (IS.person(row) ? ` (${row.when ? `${row.when.join(', ')}: ` : ''}you only)` : '');

/** One row as a line of a list: its words, its plain line, its mark. */
const helpRow = (row) => wrap(`${row.help?.line ?? row.what}${personMark(row)}`, ' '.repeat(34), `  atlasbound ${row.words.join(' ').padEnd(20)} `);

/** Who may run `row`, in a sentence. */
function whoOf(row) {
  const phrase = row.phrase ? filled(W.phrase, { phrase: row.phrase }) : '';
  if (IS.person(row) && row.when) return filled(W.whoWhen, { when: row.when.join(', '), phrase });
  if (IS.person(row)) return filled(W.whoPerson, { phrase });
  return `${IS.ai(row) ? W.whoAi : W.whoAny}${row.wires ? W.takesOut : ''}`;
}

/** One command's whole help. */
function verbHelp(row) {
  const help = row.help ?? {};
  const part = (title, text) => (text ? [title, wrap(text, '  ')] : []);
  const flags = Object.entries({ ...help.flags, ...COMMON }).map(([flag, means]) => wrap(means, ' '.repeat(23), `  ${flag.padEnd(20)} `));
  return [wrap(help.line ?? row.what, '  ', `atlasbound ${row.words.join(' ')}: `), 'USAGE', wrap(usageLine(row), '    ', '  '),
    ...(help.line ? part('IN DETAIL', row.what) : []), ...part('WHEN', help.when), ...(help.example ? ['EXAMPLE', `  $ ${help.example}`] : []),
    ...part('CHANGES', help.changes), ...part('WHO', whoOf(row)), 'FLAGS', ...flags, ...part('EXIT', help.exit ?? W.exit)].join('\n');
}

/** The help of `asked` words: one command whole, a group as its own command whole and the rest listed. */
function groupHelp(rows, asked) {
  const head = rows.find((row) => row.words.join(' ') === asked.join(' '));
  const rest = rows.filter((row) => row !== head);
  return [...(head ? [verbHelp(head)] : []), ...(head && rest.length ? ['', 'its commands:'] : []), ...rest.map(helpRow)].join('\n');
}

/** Rows in short: per first word its bare row and its further words joined (`decisionbook show | find`), each part by `mark`. */
function briefly(rows, mark = () => '') {
  return [...new Set(rows.map((r) => r.words[0]))].map((first) => {
    const own = rows.filter((r) => r.words[0] === first);
    const subs = own.filter((r) => r.words.length > 1).map((r) => `${r.words.slice(1).join(' ')}${mark(r)}`);
    return [...own.filter((r) => r.words.length === 1).map((r) => `${first}${mark(r)}`), ...(subs.length ? [`${first} ${subs.join(' | ')}`] : [])]
      .join(', ');
  }).join(' · ');
}

/** The overview: what the product is, the first steps, the slash commands, the commands in short, the flags, examples. */
function overview({ version, rows, steps, slash, off }) {
  // a newcomer's steps begin with setup and end on the cli's own check
  const firsts = [['setup', W.setup],
    ...[...steps.filter((s) => s.pkg), ...steps.filter((s) => !s.pkg)].map((s) => [s.verb, s.what])];
  const started = firsts.map(([verb]) => rows.find((r) => r.words.join(' ') === verb)).filter(Boolean);
  const left = rows.filter((r) => !started.includes(r) && !['help', 'version'].includes(r.words[0]));
  const only = left.filter((r) => IS.person(r) && !r.when);
  const ai = left.filter((r) => IS.ai(r) && !only.includes(r));
  const reads = left.filter((r) => !IS.debug(r) && !only.includes(r) && !ai.includes(r) && r.help?.changes === 'nothing');
  const more = left.filter((r) => ![...only, ...ai, ...reads].includes(r));
  const said = (title, these, mark) => (these.length ? ['', title, wrap(briefly(these, mark), '  ')] : []);
  const mine = rows.filter(IS.person);
  const flags = aloneFlags(rows).map(([flag, means, short]) => `  ${[short, flag].filter(Boolean).join(', ').padEnd(16)} ${means}`);
  const then = filled(W.then, { slash: slash.length ? filled(W.thenSlash, { names: slash.map((s) => s.name).join(', ') }) : '' });
  // a sub-command's example with a word of its own
  const named = (r) => r.words.length > 1 && (r.help?.example ?? '').startsWith(`atlasbound ${r.words.join(' ')} `);
  const examples = [...started, ...reads.filter(named).slice(0, 1)].map((r) => r.help?.example).filter(Boolean);
  return [wrap(W.intro, '', `AtlasBound ${version}: `), '', 'USAGE', '  atlasbound <command> [flags]', '', W.getStarted,
  ...firsts.map(([verb, what]) => wrap(what, ' '.repeat(15), `  ${verb.padEnd(12)} `)), wrap(then, '  '),
  ...said(W.reads, reads), ...said(W.only, mine, (r) => (r.when ? ` ${r.when.join(' ')}` : '')), ...said(W.ai, ai), ...said(W.more, more),
  '', 'FLAGS', ...flags, '', 'EXAMPLES', ...examples.map((e) => `  $ ${e}`),
  ...off, '', W.learn].join('\n');
}

/** Every command with its line, in three groups, a person's own marked. */
function everyCommand(rows) {
  return GROUPS.map(([title, fits]) => [title, rows.filter(fits)]).filter(([, these]) => these.length)
    .flatMap(([title, these]) => ['', title, groupHelp(these, [])]).slice(1).join('\n');
}

/** The first word of the table closest to a mistyped one (at most two edits away), or null. */
function closestVerb(word, firsts) {
  const apart = (a, b) => { // the edits between two words
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]));
      }
    }
    return d[a.length][b.length];
  };
  const [best] = [...new Set(firsts)].map((w) => [w, apart(String(word), w)]).filter(([, d]) => d <= 2).sort((x, y) => x[1] - y[1]);
  return best ? best[0] : null;
}

/** The slash commands `placed` (core/host placedCommands), each place once: its `/name` and its package. */
const slashOf = (placed) => [...new Map(placed.map((c) => [c.dest, c])).values()]
  .map((c) => ({ pkg: c.pkg, name: `/${c.dest.split('/').pop().replace(/\.md$/, '')}` }));

module.exports = { overview, everyCommand, groupHelp, usageLine, wrap, closestVerb, slashOf, aloneFlags };
