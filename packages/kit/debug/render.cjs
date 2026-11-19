// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// debug/render: the text primitives every debug verb shares; a view stays data, and an absent number prints "not measured", never 0.
const { shortSha } = require('../base/text.cjs');
const d8 = (sha) => (sha ? shortSha(sha) : '—');
const measured = (n) => (n === null || n === undefined ? 'not measured' : String(n));
const tally = (byCode) => Object.entries(byCode || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code, n]) => `${code} ×${n}`).join(', ');

function columns(rows, indent = '  ') {
  const widths = [];
  rows.forEach((row) => row.forEach((cell, i) => {
    widths[i] = Math.max(widths[i] || 0, String(cell).length);
  }));
  return rows.map((row) => indent + row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd());
}

const capped = (list, cap = 50) => `(${list.length}): ${list.slice(0, cap).join(', ')}${list.length > cap ? ', …' : ''}`;

module.exports = { d8, measured, tally, columns, capped };
