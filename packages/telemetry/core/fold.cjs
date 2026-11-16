// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Trace rows -> raw events (counts only), pure over the rules of the installed packages' words: one event of a declared run form per run of
// the steps a package marks with it, one step_summary per measured step and day; a banded field leaves as its band.
const { LOCAL_ONLY, BAND_WORDS, BANDS, HISTOGRAMS, wireWord } = require('../contracts/rules.cjs');
const { bucketOf, addTo, markOf } = require('../contracts/helpers.cjs');
const { stateEvents, codesOf, decisionsOf } = require('./breakdown.cjs');

const histogramOf = (row) => Object.entries(HISTOGRAMS).map(([name, edges]) => [name, edges, name === 'ms' ? row.ms : row.n[name]])
  .filter(([, , value]) => Number.isFinite(value)).map(([name, edges, value]) => [`${name}_${bucketOf(value, edges)}`, 1]);

function bucketFor(buckets, mark, row, { FORMS }) {
  const key = FORMS.run.includes(mark) ? `${mark}|${row.run}` : `${mark}|${row.at.slice(0, 10)}|${row.pkg}|${row.step}`;
  if (!buckets.has(key)) { // a count name is a key a trace file wrote: no prototype for `__proto__` to reach
    buckets.set(key,
      { event: mark, at: row.at, pkg: row.pkg, step: row.step, runs: new Set(), records: 0, failed: 0, ms: null, n: Object.create(null),
      steps: Object.create(null) });
  }
  return buckets.get(key);
}

// A run's count is taken only from the step that owns its name.
function add(bucket, row, { RUNS }) {
  bucket.runs.add(row.run);
  bucket.records += 1;
  if (!row.ok) bucket.failed += 1;
  if (row.ms !== null && row.ms !== undefined) bucket.ms = (bucket.ms || 0) + Math.round(row.ms);
  addTo(bucket.steps, row.step, 1);
  const run = Object.hasOwn(RUNS, bucket.event);
  const { owners } = run ? RUNS[bucket.event] : { owners: {} };
  const owned = ([name]) => !Object.hasOwn(owners, name) || owners[name] === row.step;
  [...Object.entries(row.n).filter(owned), ...(run ? [] : histogramOf(row))].forEach(([name, count]) => addTo(bucket.n, name, count));
}

// The counts the fold measured itself win over a step's own `n` of the same name.
function payloadOf(bucket, { RUNS }) {
  const measured = bucket.ms === null ? {} : { ms: bucket.ms };
  const run = Object.hasOwn(RUNS, bucket.event) && RUNS[bucket.event];
  if (!run) return { ...bucket.n, ...measured, pkg: bucket.pkg, step: wireWord(bucket.step), runs: bucket.runs.size,
    records: bucket.records, failed: bucket.failed };
  const funnel = Object.fromEntries(Object.entries(bucket.steps).map(([step, count]) => [`step_${step}`, count]));
  const rowsOf = Object.entries(run.rowsOf).filter(([, step]) => bucket.steps[step]).map(([name, step]) => [name, bucket.steps[step]]);
  return { ...bucket.n, ...funnel, ...measured, ...Object.fromEntries(rowsOf), steps: bucket.records, failed: bucket.failed };
}

function inBands(event, { EVENT_RULES }) {
  const { enums } = EVENT_RULES[event.event];
  const band = ([name, value]) => [name, enums[name] === BAND_WORDS && Number.isSafeInteger(value) ? bucketOf(value, BANDS) : value];
  return { ...event, payload: Object.fromEntries(Object.entries(event.payload).map(band)) };
}

function fold(rows, version, rules) {
  const buckets = new Map();
  const unruled = new Set();
  const stated = [];
  const measured = [];
  let localOnly = 0;
  for (const row of rows) {
    const mark = markOf(row, rules);
    if (mark === LOCAL_ONLY) localOnly += 1;
    else if (!Object.hasOwn(rules.EVENT_RULES, mark ?? '')) unruled.add(`${row.pkg}.${row.step}`);
    else if (rules.FORMS.stated.includes(mark)) stated.push(row);
    else {
      measured.push(row);
      add(bucketFor(buckets, mark, row, rules), row, rules);
    }
  }
  const tables = [stateEvents(stated, rules), codesOf(measured, rules), decisionsOf(measured, rules)];
  const runEvents = [...buckets.values()].map((bucket) => ({ event: bucket.event, at: bucket.at, payload: payloadOf(bucket, rules) }));
  const events = [...runEvents, ...tables.flatMap((table) => table.events)].map((event) => ({ ...inBands(event, rules), cv: version }));
  return { events, unruled: [...unruled].sort(), localOnly, cut: tables.reduce((sum, table) => sum + table.cut, 0) };
}

// What all sends add up to where a run declares it (`whole`): `taken`, the rows of its step; `sum`, the count it names over them, null when
// no row stated one (absent is never 0). No declaration: both null.
function wholeOf(rows, rules) {
  const { WHOLE } = rules;
  const taken = WHOLE && rows.filter((r) => markOf(r, rules) === WHOLE.event && r.step === WHOLE.step);
  const stated = (taken ?? []).map((r) => r.n[WHOLE.sum]).filter(Number.isInteger);
  return { rows: rows.length, taken: taken && taken.length, sum: stated.length ? stated.reduce((a, b) => a + b, 0) : null };
}

module.exports = { fold, wholeOf };
