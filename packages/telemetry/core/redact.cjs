// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE wall: an envelope and the rows of one report into the one string that is stored, shown and sent; pure, drop by default. Only the
// envelope's own keys, in their order; only rows of a registered metric in its closed words; then the whole report passes the validator
// the server runs, or nothing is made. Over the byte cap, rows go from the end and the report says how many in `cut` (local only).
const { ENVELOPE, isRecord, rowRefusal, reportRefusal } = require('../contracts/wire.cjs');

// A row rebuilt in its one order (dimensions sorted), so the same counts are always the same bytes.
function rowInOrder(row) {
  const d = Object.fromEntries(Object.keys(row.d).sort().map((key) => [key, row.d[key]]));
  return isRecord(row.b) ? { m: row.m, d, b: row.b } : { m: row.m, d, n: row.n, ...(row.o === true ? { o: true } : {}) };
}

/** -> { line, cut, dropped } with `line` the report's exact bytes, or { line: null, code } when it does not pass its own schema. */
function redact(raw, { schema, cap }) {
  const input = isRecord(raw) ? raw : {};
  const report = Object.fromEntries(ENVELOPE.filter(([key]) => key !== 'metrics' && Object.hasOwn(input, key) && input[key] !== undefined)
    .map(([key]) => [key, input[key]]));
  const entry = schema.modules[report.module]?.[String(report.schema)];
  const rows = Array.isArray(input.metrics) ? input.metrics : [];
  const fits = (row) => isRecord(row) && isRecord(row.d) && rowRefusal(row, entry, schema) === null;
  const passed = entry ? rows.filter(fits).map(rowInOrder) : [];
  let size = Buffer.byteLength(JSON.stringify({ ...report, metrics: [] }), 'utf8');
  report.metrics = [];
  for (const row of passed.slice(0, schema.rows)) {
    size += Buffer.byteLength(JSON.stringify(row), 'utf8') + (report.metrics.length ? 1 : 0);
    if (size > cap) break;
    report.metrics.push(row);
  }
  const dropped = rows.length - passed.length;
  if (reportRefusal(report, schema) !== null) return { line: null, code: 'report-unsupported', cut: 0, dropped };
  return { line: JSON.stringify(report), code: null, cut: passed.length - report.metrics.length, dropped };
}

module.exports = { redact };
