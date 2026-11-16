// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What only a person may run. A verb's row declares it (`by: person`; `when` narrows it to the flags named), and a wiring that takes a
// module out is the person's too. Sent by anyone else it is refused before its package's code runs, in one line: who was found, and the
// exact command the person types. Who acts is kit's one answer (the root's `io.actor`). An AI's shell command that names such a verb,
// bare or through any wrapper, is denied at the hook port before it runs (kit's reader of a command's text). A GRAVE act (a row with
// a `phrase`: it takes a protection away or sends something off this machine) is refused under a program that can type
// for a person, and is done only once the person types the phrase that names it. Every answer of who acts is the root's `actor` trace
// row, beside the verb's own.
const { errors: { fail }, text: { shell }, paths: { nameOf }, person: { hostCalled } } = require('@atlasbound/kit');
const { PRODUCT, YES_FLAG } = require('../contracts/verbs.cjs');
const { SHELL_GATE, EVENTS } = require('../contracts/shapes.cjs');
const { shortOf } = require('../contracts/codes.cjs');

/** Whether `row` is the person's as it was sent: a `by: person` row, with one of its `when` flags when it names any. */
const isPersons = (row, flags) => row.by === 'person' && (!row.when || row.when.some((flag) => Object.hasOwn(flags, flag.slice(2))));

/** Refuses `what` unless a person at their own terminal sent it, and a grave act (`grave`) also where a program that can type for a
 * person stands above that terminal; each refusal is one coded trace row. `argv`: the words as sent, for the line the person types. */
function onlyThePerson(io, what, argv, grave = false) {
  const { who, why, wrapped } = io.actor();
  const found = who === 'terminal' ? `${wrapped} at this terminal` : `the AI, ${why}`;
  if (who === 'terminal' && !(grave && wrapped)) return;
  const code = who === 'terminal' ? 'person-wrapped' : 'person-only';
  io.trace.event(io.run, 'cli.verb', { code, msg: `${what}: ${who === 'terminal' ? found : why}` });
  throw fail(code, `${what} (found: ${found}); the person types: ${[PRODUCT, ...argv.map(shell.word)].join(' ')}`);
}

/** What a grave act's phrase names beside the row's words, when sent: `flags`, the row's flags that choose what it takes (`--purge`,
 * `--none`; never a value flag, never the yes), and `words`, the words after the verb (the modules of `modules off`), unless its step
 * asks: that step says what it takes above the phrase (the list, the commands). */
const namedBy = (row) => ({ words: !row.asks,
  flags: (row.flags || []).filter((flag) => flag !== YES_FLAG && !(row.values || []).includes(flag)) });

/** The phrase a grave act is typed with: the row's words for it, then what it names of what it was sent with. */
function phraseOf(row, { rest, flags }) {
  const named = namedBy(row);
  const sent = named.flags.map((flag) => flag.slice(2)).filter((name) => Object.hasOwn(flags, name));
  return [row.phrase, ...(named.words ? rest : []), ...sent].join(' ');
}

/** THE question of a grave act: what it takes away (`info`), then the phrase to type -> whether the person typed it, case and spacing
 * aside. The terminal stays open for a question the verb itself puts next. A phrase that did not come is one coded trace row. */
const typedBy = (io, phrase) => async (info = '') => {
  const said = await io.terminal.ask(`${info ? `${info}\n` : ''}type: ${phrase}\n> `);
  const typed = String(said ?? '').trim().replace(/\s+/g, ' ').toLowerCase() === phrase.toLowerCase();
  if (!typed) io.trace.event(io.run, 'cli.verb', { code: 'phrase-not-typed', msg: phrase });
  return typed;
};

/** A grave act of the cli's own: done only past its typed phrase. */
async function typedOrRefused(ask, info = '') {
  if (!(await ask(info))) throw fail('phrase-not-typed');
}

/** The verbs of this install only a person may run, as a person reads them: `modules off`, `protect --none`. */
const personRows = (verbs) => verbs.filter((row) => row.by === 'person').map((row) => [...row.words, ...(row.when ?? [])].join(' '));

/** The port's shell gate: a shell command whose text names a verb only a person runs is denied, with the command the person types;
 * null for any other event or command. One coded trace row per denial. */
function shellRefused(io, event, payload) {
  const command = event === SHELL_GATE.event && payload.tool_name === SHELL_GATE.matcher ? (payload.tool_input || {}).command : null;
  if (typeof command !== 'string') return null;
  const names = [PRODUCT, nameOf(io.machine.bin)];
  const row = shell.verbNamed(command, names, [HOST_ONLY, ...io.catalog.verbs.filter((one) => one.by === 'person')]);
  if (!row) return null;
  const [code, whose] = row === HOST_ONLY ? ['hook-only-host', 'host-only'] : ['person-only-shell', 'person-only'];
  const typed = [PRODUCT, ...row.words, ...(row.when ?? []).slice(0, 1)].join(' ');
  io.trace.event(io.run, 'cli.verb', { code, msg: row.words.join(' ') });
  return { verdict: 'deny', pkg: 'cli', key: `cli.${whose}`, reason: `atlasbound: ${whose}: \`${typed}\`: ${shortOf(code)}` };
}
// the hook verb with an event that carries the person's words (contracts/shapes EVENTS `person`): the host's alone to call
const HOST_ONLY = { words: ['hook'], when: Object.keys(EVENTS).filter((event) => EVENTS[event].person) };

const HEARD = { 'host-socket': 'hook-host-call', unjudged: 'hook-host-unjudged' }; // the trace's code of a call that is heard
/** Whether the port hears this hook call. One that carries the person's words is heard only when the AI host itself made it (kit's
 * one answer over the kernel's word on who holds the call's output); a replay hands no caller and is heard, as every other event.
 * -> { heard, codes: the trace's, plain: the reply's line when it is not heard } */
function hostCall(io, event) {
  const caller = Object.hasOwn(EVENTS, event) && EVENTS[event].person ? io.proc.callerOf() : null;
  if (caller === null) return { heard: true, codes: {}, plain: [] };
  const { host, why } = hostCalled(caller);
  const code = HEARD[why] || 'hook-not-host';
  return { heard: host, codes: { [code]: 1 }, plain: host ? [] : [`atlasbound: ${code} (${why}): ${shortOf(code)}`] };
}

module.exports = { isPersons, onlyThePerson, namedBy, phraseOf, typedBy, typedOrRefused, personRows, shellRefused, hostCall };
