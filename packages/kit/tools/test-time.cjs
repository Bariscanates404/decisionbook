// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// dev only, never shipped: a test file's time against its budget, for run-tests.cjs. KIT_TEST_TIME=said is set by a run that
// proves behaviour and is not held by the machine's speed (a release's own check, a reader's `npm test`): it says the times and
// judges none.
const fs = require('node:fs');
const path = require('node:path');

const BUDGET_MS = { unit: 1000, other: 10000 };
const NORMAL_LOAD = 2;
// ten files at once on ten CPUs: a file takes about twice its time alone (measured); the budget is the time alone
const C10 = 2;
const TIME_VAR = 'KIT_TEST_TIME';
const TIME_SAID = 'said';
const TESTCASE = /<testcase [^>]*time="([\d.]+)"[^>]*file="([^"]+)"/g;

/** junit text -> file -> milliseconds, the sum of its tests (a file's tests run one after another). */
function timesOf(junit) {
  const ms = new Map();
  for (const [, seconds, file] of junit.matchAll(TESTCASE)) {
    const real = fs.realpathSync(file);
    ms.set(real, (ms.get(real) || 0) + Number(seconds) * 1000);
  }
  return ms;
}

function timeErrors(packages, ms, factor) {
  return packages.flatMap((p) => p.files.flatMap((file) => {
    const rel = path.relative(p.dir, file);
    if ((p.owners.slow || []).includes(rel)) return [];
    const ceiling = BUDGET_MS[rel.startsWith('test/unit/') ? 'unit' : 'other'];
    const took = ms.get(fs.realpathSync(file));
    const allowed = ceiling * factor * C10;
    return took > allowed ? [`${p.name}/${rel}: ${Math.round(took)} ms > ${Math.round(allowed)} ms (budget ${ceiling} x load ${factor.toFixed(2)} x ${C10} for c10): make it faster`] : [];
  }));
}

/** The files' times: said (the release), not judged (a load over normal), or judged, an over-budget file an error. */
function timeVerdict(packages, ms, factor, said) {
  if (said) return { lines: ['tests: time budget said, not judged: a release is not held by the machine\'s speed',
    ...timeErrors(packages, ms, factor).map((line) => `  ${line}`)], errors: [] };
  if (factor > NORMAL_LOAD) return { lines: [`tests: time budget not judged: load factor ${factor.toFixed(2)} > ${NORMAL_LOAD} (a normal load is at most ${NORMAL_LOAD} per CPU)`], errors: [] };
  return { lines: [], errors: timeErrors(packages, ms, factor) };
}

module.exports = { TIME_VAR, TIME_SAID, timesOf, timeVerdict };
