// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// handleFor -> handle: the one write path into a report. A handle is exactly { increment, observe } over the metrics its namespace
// registered; a call outside them counts nothing and adds one to its local `dropped`. Pure: no io, no id, no address, no network; only
// telemetry's close step reads what a handle counted (countedBy).
const { bucketWords } = require('../contracts/wire.cjs');

const COUNTED = new WeakMap();

/** A call's dimensions in the metric's closed words: a word outside its list is `other` where the list ends in it, else nothing counts. */
function closedDims(spec, dims) {
  const lists = { ...spec.dims, ...spec.opt };
  const given = Object.entries(dims);
  if (!Object.keys(spec.dims).every((dim) => Object.hasOwn(dims, dim)) || !given.every(([dim]) => Object.hasOwn(lists, dim))) return null;
  const words = given.map(([dim, word]) => [dim, lists[dim].includes(word) ? word : lists[dim].at(-1) === 'other' && 'other']);
  return words.every(([, word]) => word) ? Object.fromEntries(words.sort(([a], [b]) => (a < b ? -1 : 1))) : null;
}

/** A handle over one namespace's metrics (`space.metrics`, contracts/rules) with counts capped at `cap`; null for no namespace. A namespace
 * that is off is never folded, so nothing calls its handle. */
function handleFor(space, { cap }) {
  if (!space || !space.metrics) return null;
  const counted = { rows: new Map(), dropped: 0 };
  const rowOf = (name, dims, type) => {
    const spec = Object.hasOwn(space.metrics, name) && space.metrics[name].type === type ? space.metrics[name] : null;
    const d = spec && dims !== null && typeof dims === 'object' ? closedDims(spec, dims) : null;
    if (!d) return null;
    const key = JSON.stringify([name, d]);
    const fresh = type === 'counter' ? { m: name, d, n: 0 } : { m: name, d, b: {}, words: bucketWords(spec.edges), edges: spec.edges };
    if (!counted.rows.has(key)) counted.rows.set(key, fresh);
    return counted.rows.get(key);
  };
  const add = (row, field, n) => {
    if (row[field] + n > cap) row.o = true;
    row[field] = Math.min(row[field] + n, cap);
  };
  const handle = Object.freeze({
    increment(name, dims, n = 1) {
      const row = Number.isSafeInteger(n) && n >= 0 ? rowOf(name, dims, 'counter') : null;
      if (row) add(row, 'n', n);
      else counted.dropped += 1;
    },
    observe(name, dims, value) {
      const row = Number.isFinite(value) && value >= 0 ? rowOf(name, dims, 'histogram') : null;
      if (!row) {
        counted.dropped += 1;
        return;
      }
      const word = row.words[row.edges.findLastIndex((edge) => value >= edge)];
      row.b[word] = Math.min((row.b[word] ?? 0) + 1, cap);
    },
  });
  COUNTED.set(handle, counted);
  return handle;
}

/** What a handle counted: its rows sorted by metric then dimensions (bucket words in their order), and how many calls it dropped. */
function countedBy(handle) {
  const counted = COUNTED.get(handle) ?? { rows: new Map(), dropped: 0 };
  const rows = [...counted.rows.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, row]) => (row.b
    ? { m: row.m, d: row.d, b: Object.fromEntries(row.words.filter((word) => row.b[word]).map((word) => [word, row.b[word]])) }
    : { m: row.m, d: row.d, n: row.n, ...(row.o ? { o: true } : {}) }));
  return { rows, dropped: counted.dropped };
}

module.exports = { handleFor, countedBy };
