// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE step wrapper: ONE trace record per step; an uncoded error is recorded as `unexpected-error` with its name only, so no file content
// can leak.
const { digest } = require('../base/hash.cjs');
const { isFail } = require('../base/errors.cjs');
const { VERDICTS } = require('../contracts/trace.cjs');

const errOf = (knows, err) => (isFail(err) && knows(err.code) ? { code: err.code, msg: err.message } : { code: 'unexpected-error', msg: (err && err.name) || 'Error' });
const decided = (out) => (VERDICTS.includes(out?.verdict) ? { [`decision_${out.verdict}`]: 1 } : {}); // the one rule: every gate counted, none twice

function traced(io, step, fn) {
  return async (input, ctx) => {
    const t0 = io.clock.elapsedMs();
    const head = { run: ctx.run, step, in: digest(input), ref: ctx.ref || null };
    try {
      const res = io.trace.result(await fn(input, io, ctx));
      const ref = res.ref || ctx.ref ? { ...ctx.ref, ...res.ref } : null;
      const ms = io.clock.elapsedMs() - t0;
      const n = { ...res.n, ...decided(res.out) };
      io.trace.record({ ...head, ms, ok: !res.err, out: digest(res.out), n, codes: res.codes, ref, err: res.err ?? null });
      return res;
    } catch (err) {
      io.trace.record({ ...head, ms: io.clock.elapsedMs() - t0, ok: false, err: errOf(io.trace.knows, err) });
      throw err;
    }
  };
}

module.exports = { traced };
