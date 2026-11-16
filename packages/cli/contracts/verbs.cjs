// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The cli's own verbs and the pure reads of a verb table. Every other verb is a row of the package that answers it, in that package's
// manifest (package.json `atlasbound.verbs`); adapters/packages makes the one table from the rows of what is installed.
// A row: `words` -> `run` (a cli step) or `call` (a function of its package's entry, called (io, args)); a row with neither owns a group.
// `flags` beyond COMMON_FLAGS, `render` turns the view into lines, `asks` may put one question to a person,
// `by: 'person'` only a person at their own terminal may run it (`when`: only with one of these flags), refused before its code runs,
// `phrase` it is a grave act (it takes a protection away or sends something off this machine): the person types these
// words, then the verb's own, at a plain terminal, and only there is it asked (with or without the flag of its `when`),
// `looks` / `reads` / `cleans` / `host` / `wires` choose how compose opens the repository, `degrades` runs on the shipped config,
// `noWords` takes no word, `stdin` reads the JSON word from standard input, `short` is the word a person may type for the first word,
// `values` the flags that take the next word, `tasks` its lines in `debug --help`.
const validate = require('./validate.cjs');

const COMMON_FLAGS = ['--target', '--json'];
// A question, never an action: any of these anywhere in argv answers before anything is composed, written, traced or spawned.
const HELP_FLAGS = ['--help', '-h'];
const VERSION_FLAG = '--version';
// The product manifest's name: the one file that says the version (the workspace packages stay 0.0.0 and private).
const PRODUCT = 'atlasbound';
// The words a person types to take a module out, whichever verb does it (modules off, a setup that narrows the choice).
const TURN_OFF = 'turn off';
// The flag a person sends to say yes before the question. A grave act's phrase is typed all the same, so no phrase names it.
const YES_FLAG = '--yes';

const CLI_VERBS = [
  { words: ['setup'], run: 'setup', wires: true, flags: ['--only', '--without', '--with'], values: ['--only', '--without', '--with'],
    what: 'wire this repository: DecisionBook and Handoff, or --only a,b / --without a / --with a (atlasbound modules names them)' },
  { words: ['update'], run: 'update', wires: true, what: 'rewire this repository to this installation, the modules it chose kept' },
  { words: ['modules'], run: 'modules', looks: true, what: 'each module: on, off or not installed, what it is, and what you lose while it is off' },
  { words: ['modules', 'on'], run: 'modulesSet', wires: true, what: '<module>: wire it here too; says the hooks, commands and MCP servers it added' },
  { words: ['modules', 'off'], run: 'modulesSet', wires: true, by: 'person', phrase: TURN_OFF,
    what: '<module>: take its hooks, commands, MCP servers and allow rules out here; your data stays; the last one is uninstall\'s' },
  { words: ['uninstall'], run: 'uninstall', cleans: true, flags: ['--purge'], asks: true, by: 'person', phrase: 'uninstall',
    what: 'take everything setup wrote back out (--purge also the stores); you type the phrase it names, at a plain terminal' },
  { words: ['doctor'], run: 'doctor', looks: true, degrades: true,
    what: 'what is installed, wired and measured here, what is missing, and what to do about it' },
  { words: ['status'], run: 'status', looks: true, what: 'what is installed and whether this repository is wired' },
  { words: ['hook'], what: 'your AI session calls this at each step; you never need to: hook <Event>' },
  { words: ['help'], run: 'help', what: 'this table' },
  { words: ['debug', 'trace'], run: 'debugTrace', flags: ['--last', '--session', '--pkg', '--tally'], values: ['--session', '--pkg'], reads: true,
    degrades: true,
    what: 'the trace records: <run> | --last (the newest work, no verb that only looks) | --session <id> [--pkg p]; --tally counts them per step',
    tasks: [{ question: 'What ran, in what order, and how did each step end?', run: 'debug trace --last', read: ['records', 'unreadable'] }] },
  { words: ['debug', 'doctor'], run: 'debugDoctor', looks: true, degrades: true, what: 'doctor as JSON',
    tasks: [{ question: 'Is this repository wired, module by module and package by package?',
      run: 'debug doctor', read: ['ok', 'modules', 'packages', 'problems', 'host', 'advice', 'capabilities'] }] },
  { words: ['debug', 'shell'], run: 'debugShell', looks: true,
    what: '<command>: what the gates\' shell reader sees: its words, the files it writes and by what, what it cannot place and why',
    tasks: [{ question: 'Which files does a shell command write, and why can a gate not place one?', run: 'debug shell <command>',
      read: ['commands', 'writes', 'unplaced', 'why'] }] },
  { words: ['debug', 'who'], run: 'debugWho', noWords: true, looks: true,
    what: 'who this process is to the product, a person at their own terminal or the AI, and why; the verbs only a person may run',
    tasks: [{ question: 'Is this command run by a person or by the AI, and what told the product so?', run: 'debug who',
      read: ['who', 'why', 'seat', 'at', 'session', 'personOnly'] }] },
  { words: ['debug', 'inject'], run: 'debugInject', flags: ['--script', '--keep'], values: ['--script'], looks: true,
    what: '--script <file.json>: replay a session\'s host events through the hook port on a scratch copy of this repository: per event and ' +
      'package the characters said to the AI and held back, totals per module, each MCP server\'s standing cost; no model, nothing ' +
      'written here (--keep keeps the copy)',
    tasks: [{ question: 'How much does each module say to the AI over a session, and what does the context rule hold back?',
      run: 'debug inject --script <file.json>', read: ['events', 'totals', 'standing'] }] },
];

// Verbs of the cli that only look and change no person's choice; each package names its own in `atlasbound.free`.
const CLI_FREE = ['doctor', 'status', 'help', 'debug'];
// What setup names last of the cli's own: the verb and what it does; each package adds its rows in `atlasbound.next`.
const CLI_NEXT = [{ step: 1, verb: 'doctor', what: 'what is installed, wired and measured' }];

// What `debug --help` adds to its rows: one door any AI can read. `read`: fields of that view's `--json`.
const DEBUG_SAYS = [
  'With --json every view is one JSON object: schema ab-debug/1, and verb names the view.',
  'A number nobody measured is null and prints "not measured", never 0. Trace records are ab-trace/1 JSON lines; debug trace reads them.',
  'Exit 0: answered. Exit 1: refused, stderr says atlasbound: <code>: <words>. Debug asks no model and sends nothing. A verb that reads ' +
    'the trace adds none; another debug verb adds only its own records.',
];

// The base and the open package's modules a person turns on or off per repository (contracts/modules.json), each module's packages in
// the order their hooks answer. adapters/packages adds the rows the installed add-ons bring: a reader takes the modules from its catalog.
const MODULES = validate.shape('Modules', require('./modules.json'));

/** Every row of `table` whose words begin with `words`: a group's rows, or the whole table for none. */
const under = (table, words) => table.filter((row) => words.every((w, i) => row.words[i] === w));

/** The longest row of `table` whose words start `words`, or null. */
function route(table, words) {
  const fits = (row) => row.words.every((w, i) => words[i] === w);
  return table.filter(fits).sort((a, b) => b.words.length - a.words.length)[0] || null;
}

/** The words as the table spells them: a row's `short` word typed first is that row's own first word. */
function tableWords(table, words) {
  const row = table.find((r) => r.short && r.short === words[0]);
  return row ? [row.words[0], ...words.slice(1)] : words;
}

/** The value at a row's entry path (`call`, `render`, an answer's `provides` path: words joined by dots) in an entry, or undefined. */
const entryAt = (entry, path) => path.split('.').reduce((value, key) => (value === null || value === undefined ? undefined : value[key]), entry);

/** Flags that take the next word as their value: the common `--target` and each row's `values` (the flags of its `flags` that take one). */
const valueFlags = (table) => [...new Set(['--target', ...table.flatMap((row) => row.values ?? [])])];

module.exports = { CLI_VERBS, CLI_FREE, CLI_NEXT, COMMON_FLAGS, HELP_FLAGS, VERSION_FLAG, PRODUCT, TURN_OFF, YES_FLAG, MODULES,
  DEBUG_SAYS, under, route, tableWords, valueFlags, entryAt };
