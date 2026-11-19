// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE report validator, shared byte for byte with the server (cloud/telemetry-worker/src/generated/validate.cjs is its copy): pure, no
// require. A report is the envelope below, in this order, and its metric rows; every string is a word of a closed list, a version, a day
// or a random id. An unknown key, a long list, nesting beyond `d`/`b` or an out-of-list word refuses the whole report.
const isRecord = (value) => Object.prototype.toString.call(value) === '[object Object]';
const isWhole = (value, low, high) => Number.isSafeInteger(value) && value >= low && value <= high;
const fitsPattern = (re) => (value) => typeof value === 'string' && re.test(value);
const DAY = /^\d{4}-\d{2}-\d{2}$/u;

/** A bucket's word per lower edge: `0-49` … `30000-up`; one value alone is itself (`0`). */
const bucketWords = (edges) => edges.map((low, i) => (i === edges.length - 1 ? `${low}-up`
  : `${low}${edges[i + 1] - 1 === low ? '' : `-${edges[i + 1] - 1}`}`));

const schemaEntry = (report, schema) => schema.modules[report.module]?.[String(report.schema)] ?? null;
// Each field's own type, given the report so far and the server's schema; `?` marks a field that may be absent.
const TYPES = {
  id: fitsPattern(/^[0-9a-f]{32}$/u),
  verifier: fitsPattern(/^[0-9a-f]{64}$/u),
  module: (value, report, schema) => typeof value === 'string' && Object.hasOwn(schema.modules, value),
  schema: (value, report, schema) => isWhole(value, 1, 9999) && schemaEntry(report, schema) !== null,
  policy: (value, report, schema) => isWhole(value, 1, schema.policy),
  modulePolicy: (value, report, schema) => isWhole(value, 1, schemaEntry(report, schema).policy),
  version: fitsPattern(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/u),
  major: (value) => isWhole(value, 1, 999),
  os: (value, report, schema) => schema.words.os.includes(value),
  day: (value) => fitsPattern(DAY)(value) && !Number.isNaN(Date.parse(value)),
  consent: (value, report, schema) => schema.words.consent.includes(value),
  flag: (value) => value === true,
  rows: (value, report, schema) => Array.isArray(value) && value.length <= schema.rows
    && value.every((row) => rowRefusal(row, schemaEntry(report, schema), schema) === null),
};
const ENVELOPE = [['id', 'id'], ['period', 'id'], ['verifier', 'verifier'], ['module', 'module'], ['schema', 'schema'], ['policy', 'policy'],
  ['module_policy', 'modulePolicy'], ['release', 'version?'], ['node', 'major'], ['os', 'os'], ['day', 'day'], ['consent', 'consent'],
  ['clock_suspect', 'flag?'], ['metrics', 'rows']];

const rowKeys = (row) => Object.keys(row).sort().join(',');
// A row's dimensions: every required one, each word in its closed list.
const dimsFit = (spec, d) => isRecord(d) && Object.keys(spec.dims).every((dim) => Object.hasOwn(d, dim))
  && Object.keys(d).every((dim) => [spec.dims, spec.opt ?? {}].some((lists) => Object.hasOwn(lists, dim) && lists[dim].includes(d[dim])));
// A row's value by its metric's type: a bounded count with an optional overflow flag, or non-empty counts in the fixed buckets.
const VALUES = {
  counter: (row, spec, cap) => (rowKeys(row) === 'd,m,n' || (rowKeys(row) === 'd,m,n,o' && row.o === true)) && isWhole(row.n, 0, cap),
  histogram: (row, spec, cap) => rowKeys(row) === 'b,d,m' && isRecord(row.b) && Object.keys(row.b).length > 0
    && Object.entries(row.b).every(([word, n]) => bucketWords(spec.edges).includes(word) && isWhole(n, 1, cap)),
};

/** One metric row against its namespace's entry: `{ m, d, n, o? }` of a counter or `{ m, d, b }` of a histogram -> null | why. */
function rowRefusal(row, entry, schema) {
  const spec = isRecord(row) && Object.hasOwn(entry.metrics, row.m) ? entry.metrics[row.m] : null;
  if (!spec) return 'row-unknown';
  if (!dimsFit(spec, row.d)) return 'row-dims';
  return VALUES[spec.type](row, spec, schema.countCap) ? null : `row-${spec.type}`;
}

/** A whole report against the server's schema -> null, or the first field that refuses it. */
function reportRefusal(report, schema) {
  if (!isRecord(report)) return 'report-shape';
  const named = ENVELOPE.map(([key]) => key);
  const odd = Object.keys(report).find((key) => !named.includes(key));
  if (odd !== undefined) return 'report-key';
  const bad = ENVELOPE.find(([key, type]) => !(type.endsWith('?') && report[key] === undefined)
    && !TYPES[type.replace('?', '')](report[key], report, schema));
  return bad ? `report-${bad[0]}` : null;
}

module.exports = { ENVELOPE, bucketWords, isRecord, rowRefusal, reportRefusal };
