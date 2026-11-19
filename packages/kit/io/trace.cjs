// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE trace writer: one NDJSON line per step in the package's vocabulary; the record is scrubbed once, then its message cut, and the
// checked bytes are written; every bound table is remembered (`knows`).
const { createValidate } = require('../contracts/validate.cjs');
const { SHAPES, REFUSE, TRACE_DIR, tracePath, dailyPath } = require('../contracts/trace.cjs');
const { scrub } = require('../text/secrets.cjs');
const { clip } = require('../text/safe.cjs');
const { fail, isFail, MSG_CAP } = require('../base/errors.cjs');

const EMPTY = { in: null, out: null, n: {}, codes: {}, ref: null, err: null };
const isDayFile = (name) => /^hooks-\d{4}-\d{2}-\d{2}[.]ndjson$/.test(name);
// Per value, never over the line: JSON escaping could hide a shape, and a match across a key and its value would break the line.
function scrubbed(value) {
  if (typeof value === 'string') return scrub(value);
  if (!value || typeof value !== 'object') return value;
  return Array.isArray(value) ? value.map(scrubbed) : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubbed(item)]));
}
const cut = (rec) => (rec.err ? { ...rec, err: { ...rec.err, msg: clip(String(rec.err.msg ?? ''), MSG_CAP) } } : rec);

function createTrace({ fs, clock, keepDays = null, self = false }) {
  if (keepDays !== null && !(Number.isInteger(keepDays) && keepDays >= 1)) throw fail('config-invalid', `trace keepDays ${keepDays}: at least one day`);
  const seqs = new Map();
  const tables = new Set();
  const knows = (code) => [...tables].some((isCode) => isCode(code));
  let pruned = keepDays === null;
  function prune() {
    if (pruned) return;
    pruned = true;
    (fs.list(TRACE_DIR) || []).filter(isDayFile).slice(0, -keepDays).forEach((name) => fs.remove(`${TRACE_DIR}/${name}`));
  }
  // `lost`: a caller whose answer must outlive a refused disk notes the refusal there; every sibling it binds shares it.
  function forPackage(pkg, { steps, isCode, lost = null }) {
    tables.add(isCode);
    const validate = createValidate({ shapes: SHAPES, enums: { step: steps }, refuse: REFUSE, isCode });
    const validateFailure = createValidate({ shapes: SHAPES, enums: { step: steps }, refuse: REFUSE, isCode: knows });
    function append(path, line) {
      try {
        fs.append(path, line);
      } catch (err) {
        if (!lost || !isFail(err, 'io-write-failed')) throw err;
        lost.push(err.code);
      }
    }
    function record(input) {
      const seq = (seqs.get(input && input.run) || 0) + 1;
      const marked = self ? { ref: { ...input.ref, self: true } } : {}; // a row of the product's own self-check says so in its ref
      const raw = cut(scrubbed({ v: 1, seq, at: clock.now(), ...EMPTY, ...input, pkg, ...marked }));
      const rec = (raw.err ? validateFailure : validate).shape('TraceRecord', raw);
      seqs.set(rec.run, seq);
      append(keepDays === null ? tracePath(rec.run) : dailyPath(rec.at), `${JSON.stringify(rec)}\n`);
      prune();
      return rec;
    }
    // a handled failure, not rethrown
    const event = (run, step, err) => record({ run, step, ok: false, err: { code: err.code, msg: err.msg } });
    const result = (value) => validate.shape('StepResult', value);
    return { record, event, result, isCode, knows, forPackage: (name, vocabulary) => forPackage(name, { lost, ...vocabulary }) };
  }
  return { forPackage };
}

module.exports = { createTrace };
