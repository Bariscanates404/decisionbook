// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// debug who: for this process, kit's one answer to "who is acting" and why: its seat, and in a session the time of the person's last
// prompt there (the rows DecisionBook's ear kept; a prompt's words are never shown); then the verbs here only a person may run, and the
// last runs of them the trace holds: who the product took the sender for, why, and how each ended, so a way round is seen afterwards.
const { trace: { TRACE_DIR }, debug: { render: { columns } }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { DEBUG_SCHEMA } = require('../contracts/shapes.cjs');
const { shortOf, WORDS: { who: W } } = require('../contracts/codes.cjs');
const { personRows, namedBy } = require('../steps/person.cjs');
const { rowsOf } = require('./trace.cjs');

const REFUSALS = ['person-only', 'person-only-shell', 'person-wrapped', 'phrase-not-typed'];
const SHOWN = 5; // the newest acts said

/** The verb of a run that only a person runs, by its rows' own names (uninstall's one record names its step), or undefined. */
function personVerb(rows, personOnly) {
  const named = rows.map((row) => (row.ref || {}).verb || (row.step === 'uninstall' ? row.step : null)).filter(Boolean);
  return named.find((name) => personOnly.some((one) => one === name || one.startsWith(`${name} --`)));
}

/** One run as an act only a person runs, or none: a refusal's own row, or a person's run of such a verb beside the root's actor row. */
function actOf(rows, personOnly) {
  const refused = rows.find((row) => row.err && REFUSALS.includes(row.err.code));
  const actor = { who: 'ai', why: W.aiShell, above: null, ...(rows.find((row) => row.step === 'actor') || {}).ref };
  const verb = personVerb(rows, personOnly);
  if (refused) return [{ at: rows[0].at, verb: refused.err.msg, ended: refused.err.code, ...actor }];
  return verb && actor.who === 'terminal' ? [{ at: rows[0].at, verb, ended: 'done', ...actor }] : [];
}

/** The newest acts here that only a person runs, newest first; none where no trace is kept. */
function personActs(io, personOnly) {
  if (io.fs.list(TRACE_DIR) === null) return [];
  const runs = [...Map.groupBy(rowsOf(io).rows, (row) => row.run).values()];
  return runs.flatMap((rows) => actOf(rows, personOnly)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, SHOWN);
}

const actLine = (act) => [`    ${act.at}`, act.verb, act.ended, `${act.who}, ${act.why}${act.above ? `, above it: ${act.above}` : ''}`];
const actLines = (acts) => (acts.length ? [W.lastRuns, ...columns(acts.map(actLine))] : [W.noRuns]);

/** What stands beside the why: an AI's seat, or the program above a person's terminal that can type for them. */
function besideWhy({ seat, wrapped }) {
  if (seat) return filled(W.itself, { seat });
  return wrapped ? filled(W.wrapped, { wrapped }) : '';
}

/** The person working here, by the root's identity: the name every record of theirs carries, or that none is named. */
const personRow = (person) => ['person', person.name || 'none', person.name ? W.named : W.unnamed];

async function debugWho(_args, io) {
  const prompts = io.session ? await io.answer('prompts') : null;
  const { who, why, seat = null, at = null, wrapped = null } = io.actor(prompts);
  const heard = prompts === null ? W.noPrompts : filled(W.kept, { n: prompts.length });
  const verbs = io.catalog.verbs.filter((row) => !row.pkg || io.packages.wired(row.pkg)); // a module off here offers none
  const personOnly = personRows(verbs);
  const acts = personActs(io, personOnly);
  const person = await io.identity(); // whose name a record of the person's carries here
  const rows = [['who', who, shortOf(`actor-${who}`)], ['why', why, besideWhy({ seat, wrapped })],
    personRow(person), ['session', io.session || 'none', `a person's prompts: ${heard}${at ? filled(W.lastAt, { at }) : ''}`]];
  const grave = verbs.filter((row) => row.by === 'person' && row.phrase).map((row) => ({ words: row.words, phrase: row.phrase,
    flags: namedBy(row).flags, sent: namedBy(row).words }));
  const typed = grave.map((row) => `${row.words.join(' ')} (${row.phrase} ...)`).join(', ');
  const out = { schema: DEBUG_SCHEMA, verb: 'who', who, why, seat, at, wrapped, person: person.name, session: io.session || null, personOnly,
    grave, acts };
  return { out, n: { personOnly: personOnly.length, acts: acts.length }, codes: { [`actor-${who}`]: 1 },
    text: `${[...columns(rows), filled(W.personRuns, { verbs: personOnly.join(', ') }), filled(W.phrased, { typed }), ...actLines(acts)].join('\n')}\n` };
}

module.exports = { debugWho };
