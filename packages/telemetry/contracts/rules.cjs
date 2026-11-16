// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// ab-event/1, the allowlist: the one table of what may leave a machine; a rule never loosens (contract/scrubs.test.cjs).
// A field is a COUNT or a closed ENUM word, and a repository count leaves as a BAND, so nothing can recognise a repository or link its
// sends. The rules are made over the words the installed packages declare (rulesOf); STEP_RULES marks every declared trace step.
const { trace: { VERDICTS } } = require('@atlasbound/kit');
const { validate } = require('./shapes.cjs');
const { declarationRead } = require('./declared.cjs');

const LOCAL_ONLY = 'local-only';
const STEP_SUMMARY = 'step_summary';
const CODES_EVENT = 'code_summary';
const DECISIONS = 'decision_summary';
const OWN_EVENTS = [LOCAL_ONLY, STEP_SUMMARY, CODES_EVENT, DECISIONS];
const PAYLOAD_BYTE_CAP = 30000;
// One body: a record's size is bounded by the allowlist, so a bound on rows is a bound on bytes.
const MAX_ROWS_PER_SEND = 2000;
const MAX_BREAKDOWN_EVENTS = 1000; // per body, each declared state table, the codes and the decisions; the rest is cut and counted locally

/** A band: the first whose bound is above the count (a word of the closed alphabet starts with a letter). */
const BANDS = [[1, 'b0'], [10, 'b1-9'], [50, 'b10-49'], [200, 'b50-199'], [1000, 'b200-999'], [Infinity, 'b1000-up']];
const BAND_WORDS = BANDS.map(([, word]) => word);
const banded = (names) => Object.fromEntries(names.map((name) => [name, BAND_WORDS]));
// Per row of a measured step: how long it took and, where it says one, how many READY rows it left unmet (DecisionBook).
const MS = [[100, '0-99'], [1000, '100-999'], [5000, '1000-4999'], [Infinity, '5000-up']];
const HISTOGRAMS = { ms: MS, unmet: [[1, '0'], [3, '1-2'], [6, '3-5'], [Infinity, '6-up']] };

// The words each package declares about itself (its contracts/telemetry.json, read as data where it is installed; io.packageData): its
// steps' marks and its codes, and any of the other lists `rulesFor` names. Telemetry knows only the words installed packages declare.
const WORDS_FILE = 'contracts/telemetry.json';

/** A product word on the wire: a word of the closed alphabet, so the cli's `hook.in` leaves as `hook-in` and a code's `:` as `-`. */
const wireWord = (word) => String(word).replace(/[^\w-]/gu, '-');
const onlyOnce = (list) => [...new Set(list)].sort();
const counts = (prefix, buckets) => buckets.map((bucket) => `${prefix}_${bucket}`);
const HISTOGRAM_COUNTS = Object.entries(HISTOGRAMS).flatMap(([name, edges]) => counts(name, edges.map(([, word]) => word)));
/** A closed list: the declared words, then `other` (anything else leaves as it). */
const declaredList = (one, key) => (Array.isArray(one[key]) ? one[key].filter((word) => typeof word === 'string') : []);
const closed = (declared, key) => [...onlyOnce(declared.flatMap((one) => declaredList(one, key))).filter((word) => word !== 'other'), 'other'];

// A package may declare events of its own (`events`), each over the steps it marks with its name: a `run` form counts one run of them
// (`owners`: the step a count is taken from, `rowsOf`: a count of one step's rows, `whole`: what all sends add up to, in its words); a
// `state` form is a table one step states whole, sent only when it changed (`words`: a field's declared list, `totalOf`, `says`).
// `outcomes` adds `<head>_<word>` counts to step_summary. Every field stays a count, a band or a closed word (contracts/declared.cjs).

/** The rules over what the installed packages declare (`[{ name, steps?, codes, events?, outcomes?, <lists> }]`). */
function rulesFor(declared) {
  const STEP_RULES = Object.fromEntries(declared.filter((one) => one.steps).map(({ name, steps }) => [name, steps]));
  const ruled = Object.entries(STEP_RULES).flatMap(([pkg, steps]) => Object.entries(steps).map(([step, mark]) => [pkg, step, mark]));
  const markedPkgs = (marks) => onlyOnce(ruled.filter(([, , mark]) => marks.includes(mark)).map(([pkg]) => pkg));
  const wireStepsOf = (marks) => onlyOnce(ruled.filter(([, , mark]) => marks.includes(mark)).map(([, step]) => wireWord(step)));
  const DECLARED = Object.assign({}, ...declared.map((one) => one.events ?? {}).reverse()); // the first package to declare a name has it
  const named = (form) => Object.keys(DECLARED).filter((name) => DECLARED[name].form === form);
  const runs = named('run');
  const states = named('state');
  const outcomes = Object.assign({}, ...declared.map((one) => one.outcomes ?? {}), { decision: VERDICTS });
  const MEASURED = { pkg: markedPkgs([...runs, STEP_SUMMARY]), step: wireStepsOf([...runs, STEP_SUMMARY]) };
  const codes = closed(declared, 'codes');
  const runRule = (name, { counts: own = [], bands = [] }) => ({
    counts: ['steps', 'failed', 'ms', ...counts('step', ruled.filter(([, , mark]) => mark === name).map(([, step]) => step)), ...own],
    enums: banded(bands) });
  const stateRule = ({ words = {}, bands = [] }) => ({ counts: [],
    enums: { ...Object.fromEntries(Object.entries(words).map(([field, list]) => [field, closed(declared, list)])), ...banded(bands) } });
  const EVENT_RULES = {
    // Every measured step, per day and step across runs; the run ids stay on the machine. first_send: a store's first send says 1.
    [STEP_SUMMARY]: {
      counts: ['runs', 'records', 'failed', 'ms', 'first_send', ...HISTOGRAM_COUNTS,
        ...Object.entries(outcomes).flatMap(([head, words]) => counts(head, words))],
      enums: { pkg: markedPkgs([STEP_SUMMARY]), step: wireStepsOf([STEP_SUMMARY]), ...banded(['events', 'bytes']) },
    },
    // Per day, measured step and code: how often the step said it (a band: a step may say one per record), and how often it failed with it.
    [CODES_EVENT]: { counts: ['failures'], enums: { ...MEASURED, code: codes, ...banded(['codes']) } },
    // Per day, deciding step, verdict and code: what a gate decided and why.
    [DECISIONS]: { counts: ['decisions'], enums: { ...MEASURED, verdict: [...VERDICTS, 'other'], code: codes } },
    ...Object.fromEntries(runs.map((name) => [name, runRule(name, DECLARED[name])])),
    ...Object.fromEntries(states.map((name) => [name, stateRule(DECLARED[name])])),
  };
  const RUNS = Object.fromEntries(runs.map((name) => [name, { owners: {}, rowsOf: {}, ...DECLARED[name] }]));
  const whole = runs.find((name) => DECLARED[name].whole);
  const FORMS = { run: runs, state: states, stated: states.filter((name) => !DECLARED[name].totalOf),
    totals: states.filter((name) => DECLARED[name].totalOf).map((name) => [name, DECLARED[name].totalOf]) };
  return Object.freeze({ STEP_RULES, EVENT_RULES, RUNS, FORMS, WHOLE: whole ? { event: whole, ...DECLARED[whole].whole } : null,
    STATE_SAYS: states.length ? states.map((name) => DECLARED[name].says).find(Boolean) ?? 'the declared state' : null,
    from: declared.map((one) => one.name).sort() });
}

const seen = new Map();
/** The rules over the declarations (`[{ name, text }]`, as io.packageData hands them), made once per distinct set; a declaration that does
 * not read is left out and named. */
function rulesOf(rows) {
  const key = JSON.stringify(rows);
  if (!seen.has(key)) {
    const read = rows.map(({ name, text }) => ({ name, words: validate.jsonOrNull(text) }));
    const reads = (one) => declarationRead(one.words, OWN_EVENTS);
    seen.set(key, { ...rulesFor(read.filter(reads).map(({ name, words }) => ({ ...words, name }))),
      unread: read.filter((one) => !reads(one)).map((one) => one.name) });
  }
  return seen.get(key);
}

module.exports = {
  LOCAL_ONLY, STEP_SUMMARY, CODES_EVENT, DECISIONS, BANDS, BAND_WORDS, HISTOGRAMS, WORDS_FILE, PAYLOAD_BYTE_CAP, MAX_ROWS_PER_SEND,
  MAX_BREAKDOWN_EVENTS, rulesOf, wireWord,
};
