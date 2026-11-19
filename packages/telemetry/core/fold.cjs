// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// One namespace's trace rows of one day through its handle, pure: per measured row its step and outcome, its own run time (never for a
// step that asks a person), its codes, its failure code, its decision; the metrics its descriptors name, from `ok` rows only; and the host
// calls that came in and never went out. A row of a local-only step, of another package or of a step nobody registered counts nothing.
const { trace: { VERDICTS } } = require('@atlasbound/kit');
const { hostEvent } = require('../contracts/helpers.cjs');

const VERDICT = /^decision_(.+)$/u;
const decidingVerdict = (row) => Object.keys(row.n).map((name) => VERDICT.exec(name)?.[1]).find((word) => VERDICTS.includes(word));

// A deciding row is one decision: its one code, or `other` when it said several or none.
function foldDecision(handle, step, row, codes) {
  const verdict = decidingVerdict(row);
  if (verdict) handle.increment('decision', { step: step.word, verdict, code: codes.length === 1 ? codes[0] : 'other' });
}

function foldMeasured(handle, step, row) {
  const at = { step: step.word, ...(step.event ? { event: hostEvent(row) } : {}) };
  const codes = Object.keys(row.codes ?? {});
  handle.increment('step', { ...at, outcome: row.ok ? 'ok' : 'failed' });
  if (step.timed && Number.isFinite(row.ms)) handle.observe('step_ms', at, row.ms);
  codes.forEach((code) => handle.increment('code', { step: step.word, code }));
  if (row.err) handle.increment('failure', { step: step.word, code: row.err.code });
  foldDecision(handle, step, row, codes);
}

// A named metric of an `ok` row: its count added (a counter) or put in its bucket (a histogram), from its step's rows that say its code.
function foldNamed(handle, space, row) {
  const key = `${row.pkg}:${row.step}`;
  const said = (from) => from.step === key && (!from.code || Boolean(row.codes?.[from.code]));
  for (const [name, spec] of Object.entries(space.metrics).filter(([, one]) => one.from && said(one.from))) {
    const value = row.n[spec.from.n];
    if (Number.isFinite(value)) handle[spec.type === 'counter' ? 'increment' : 'observe'](name, {}, value);
  }
}

/** The host calls of this day that came in (`event.steps` first) and never went out (its last), the later rows read for a pair over
 * midnight; one that came in less than `pairMs` before `closeMs` is not judged yet. */
function incompleteCalls(handle, space, { rows, later, closeMs, pairMs }) {
  const name = Object.keys(space.metrics).find((one) => space.metrics[one].computed === 'hook-incomplete');
  if (!name || !space.event) return;
  const first = space.event.steps[0];
  const last = space.event.steps.at(-1);
  const owner = space.packages.find((pkg) => space.steps.has(`${pkg}:${first}`));
  const out = new Set([...rows, ...later].filter((row) => row.pkg === owner && row.step === last).map((row) => row.run));
  rows.filter((row) => row.pkg === owner && row.step === first && !out.has(row.run) && Date.parse(row.at) <= closeMs - pairMs)
    .forEach((row) => handle.increment(name, { event: hostEvent(row) }));
}

/** Fold one day: `rows` of that day at or after the namespace's `since`, `later` the rows after it (for pairs). */
function foldDay(handle, space, day) {
  for (const row of day.rows) {
    const step = space.steps.get(`${row.pkg}:${row.step}`);
    if (step?.measured) foldMeasured(handle, step, row);
    if (step?.measured && row.ok) foldNamed(handle, space, row);
  }
  incompleteCalls(handle, space, day);
}

module.exports = { foldDay };
