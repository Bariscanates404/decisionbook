// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// debug trace: every package's records in order, judged only by the shared row shape; a torn line is counted, not fatal (it must survive
// what went wrong).
const { errors: { fail }, trace: { TRACE_DIR }, debug: { render: { columns, tally } }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { DEBUG_SCHEMA } = require('../contracts/shapes.cjs');
const { WORDS: { trace: W } } = require('../contracts/codes.cjs');
const validate = require('../contracts/validate.cjs');
const { talliesOf, tallyLine } = require('./tally.cjs');

function rowsOf(io) {
  const names = io.fs.list(TRACE_DIR);
  if (names === null) throw fail('store-empty', TRACE_DIR);
  const state = { rows: [], unreadable: 0 };
  const take = (line) => {
    try {
      const value = validate.json(line);
      if (validate.refusal('TraceRow', value)) state.unreadable += 1;
      else state.rows.push(value);
    } catch (err) {
      state.unreadable += 1;
      io.trace.event(io.run, 'debug.trace', { code: err.code, msg: W.torn });
    }
  };
  names.forEach((name) => (io.fs.readText(`${TRACE_DIR}/${name}`) || '').split('\n').filter((l) => l.trim()).forEach(take));
  return state;
}

const verbsOf = (records) => records.map((r) => (r.ref || {}).verb).filter(Boolean);
const newest = (records) => records.reduce((a, b) => (b.at > a.at ? b : a));

/** Not work: a verb that only looks, or a run the host started (a hook; a server opens with its package's record). A nameless run is a
 * killed verb: work. The verbs are the installed table's. */
const isWork = ({ route, verbs }) => (records) => {
  const named = verbsOf(records).map((verb) => route(verb.split(' ')));
  if (named.some((row) => row && (row.looks || row.reads || row.host))) return false;
  const first = records.reduce((a, b) => (b.seq < a.seq ? b : a));
  const hostPackages = new Set(verbs.filter((row) => row.host).map((row) => row.pkg));
  return !first.step.startsWith('hook.') && (named.length > 0 || !hostPackages.has(first.pkg));
};

/** --last: the newest work run, and the newest run after it whose verb only looked (a doctor or a decisionbook plan, else reached only by
 * its raw id). */
function lastRuns(rows, table) {
  const runs = [...Map.groupBy(rows, (r) => r.run).values()];
  const work = runs.filter(isWork(table)).flat();
  if (!work.length) throw fail('store-empty', W.onlyLooked);
  const last = newest(work);
  const looks = (records) => verbsOf(records).some((verb) => table.route(verb.split(' '))?.looks);
  const looked = runs.filter((records) => newest(records).at > last.at && looks(records)).map(newest);
  return { run: last.run, looked: looked.length ? newest(looked) : null };
}

function selected(rows, { rest, flags }, table) {
  if (rest[0] || flags.session) {
    const found = rows.filter((r) => (rest[0] ? r.run === rest[0] : (r.ref || {}).session === flags.session));
    if (!found.length) throw fail('not-found', rest[0] ? `run ${rest[0]}` : `session ${flags.session}`);
    return { found, looked: null };
  }
  const { run, looked } = lastRuns(rows, table);
  return { found: rows.filter((r) => r.run === run), looked: looked
    && { run: looked.run, verb: verbsOf(rows.filter((r) => r.run === looked.run))[0], at: looked.at } };
}
const lookedLine = ({ run, verb, at }) => filled(W.newerLooked, { verb, at: at.slice(11, 19), run });

const inOrder = (a, b) => a.at.localeCompare(b.at) || a.seq - b.seq;
const rowResult = ({ ok, err }) => (ok ? 'ok' : `${err?.code || 'failed'}  ${err?.msg || ''}`.trim()); // its first error line
// What a package declares of its rows' words (its manifest's `trace`): `facet`, a ref field said with its name and counted apart by
// --tally; `ref`, ref fields said as their values; `counts`, counts said in their own unit (name -> [word before, divisor, decimals, word
// after]), once: they leave the plain list.
const declOf = (io) => (pkg) => io.packages?.manifestOf?.(pkg)?.trace ?? {};
const facetOf = (r, decl) => (decl.facet && (r.ref || {})[decl.facet] ? `${decl.facet} ${r.ref[decl.facet]}` : '');
const unitWords = ([before = '', scale = 1, digits = 0, after = ''], value) => [before, (value / scale).toFixed(digits), after].filter(Boolean).join(' ');
const declaredWords = (r, decl) => [facetOf(r, decl), ...(decl.ref ?? []).map((field) => (r.ref || {})[field]),
  ...Object.entries(decl.counts ?? {}).filter(([name, spec]) => Array.isArray(spec) && Number.isInteger((r.n || {})[name]))
    .map(([name, spec]) => unitWords(spec, r.n[name]))];
// the counts too: an ok row that sent nothing (inputs 0) must read so without --json; a declared count is said once, in its own unit.
const COUNTS = Object.freeze({ named: 8, chars: 120 }); // a row of up to `named` counts says every one; a longer one says the
// first that are not zero while they fit `chars`, and the rest as one count of counts, zero or not; the last column pads no row
function nWords(n, decl) {
  const said = Object.entries(n || {}).filter(([name]) => !Object.hasOwn(decl.counts ?? {}, name)).map(([name, value]) => ({ word: `${name} ${value}`, value }));
  if (said.length <= COUNTS.named) return said.map((one) => one.word).join(', ');
  const live = said.filter((one) => one.value !== 0).map((one) => one.word);
  const shown = live.filter((_, i) => live.slice(0, i + 1).join(', ').length <= COUNTS.chars);
  const rest = [live.length > shown.length ? `${live.length - shown.length} more counts` : '', said.length > live.length ? `${said.length - live.length} more counts 0` : ''];
  return [...shown, `${rest.filter(Boolean).join(', ')} (--json lists them)`].join(', ');
}
// the time in UTC, said so: the trace is written in UTC beside logs a person reads in local time; the file the row is about beside who ran
// it
const lineOf = (decl) => (r) => [r.seq, `${r.at.slice(11, 19)}Z`, r.pkg, r.step, rowResult(r), r.ms === null || r.ms === undefined ? '' : `${Math.round(r.ms)}ms`,
  tally(r.codes), [(r.ref || {}).handler || (r.ref || {}).verb, (r.ref || {}).file, ...declaredWords(r, decl(r.pkg))].filter(Boolean).join(' '),
  nWords(r.n, decl(r.pkg))];

async function debugRuns(args, io) {
  const { rows, unreadable } = rowsOf(io);
  const { found: chosen, looked } = selected(rows, args, io.catalog);
  const records = chosen.filter((r) => !args.flags.pkg || r.pkg === args.flags.pkg).sort(inOrder);
  const none = records.length ? [] : [filled(W.noPackage, { pkg: args.flags.pkg, pkgs: [...new Set(chosen.map((r) => r.pkg))].sort().join(', ') })]; // never a blank answer
  const decl = declOf(io);
  const tallies = args.flags.tally ? talliesOf(records, (r) => facetOf(r, decl(r.pkg))) : null; // counted per package, step and facet
  const view = { schema: DEBUG_SCHEMA, verb: 'trace', unreadable, records, looked, ...(tallies ? { tallies } : {}) };
  const shown = tallies ? tallies.map((t) => tallyLine(t, tally)) : records.map(lineOf(decl));
  const text = `${[...columns(shown), ...none, ...(unreadable ? [`unreadable lines: ${unreadable}`] : []), ...(looked ? [lookedLine(looked)] : [])].join('\n')}\n`;
  return { out: view, n: { records: records.length, unreadable }, codes: {}, text };
}

module.exports = { debugRuns, rowsOf };
