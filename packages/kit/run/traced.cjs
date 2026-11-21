// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE step wrapper: ONE trace record per step; an uncoded error is recorded as `unexpected-error` with its name only, so no file content
// can leak.
const { digest } = require('../base/hash.cjs');
const { isFail } = require('../base/errors.cjs');
const { VERDICTS, decisionKey } = require('../contracts/trace.cjs');

const errOf = (knows, err) => (isFail(err) && knows(err.code) ? { code: err.code, msg: err.message } : { code: 'unexpected-error', msg: (err && err.name) || 'Error' });
// the one rule: every gate counted, none twice
const decided = (out) => (VERDICTS.includes(out?.verdict) ? { [decisionKey(out.verdict)]: 1 } : {});

function traced(io, step, fn) {
  return async (input, runAndRef) => {
    const startedMs = io.clock.elapsedMs();
    const head = { run: runAndRef.run, step, in: digest(input), ref: runAndRef.ref || null };
    try {
      const result = io.trace.result(await fn(input, io, runAndRef));
      const ref = result.ref || runAndRef.ref ? { ...runAndRef.ref, ...result.ref } : null;
      const counts = { ...result.n, ...decided(result.out) };
      io.trace.record({ ...head, ms: io.clock.elapsedMs() - startedMs, ok: !result.err, out: digest(result.out), n: counts,
        codes: result.codes, ref, err: result.err ?? null });
      return result;
    } catch (err) {
      io.trace.record({ ...head, ms: io.clock.elapsedMs() - startedMs, ok: false, err: errOf(io.trace.knows, err) });
      throw err;
    }
  };
}

module.exports = { traced };
