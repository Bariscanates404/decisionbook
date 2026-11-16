// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE glob matcher (** * ?) by a table of (pattern, path), so its cost is their product: a regex never returned on `*a*a*a*a!` over a long
// path.
const TOKEN = /\*\*\/|\*\*|\*|\?|[^]/gu;

const CELL = Object.freeze({
  '**/': ({ prev, j, c, before }) => prev[j] || (c === '/' && before),
  '**': ({ prev, row, j }) => prev[j] || (j > 0 && row[j - 1]),
  '*': ({ prev, row, j, c }) => prev[j] || (j > 0 && row[j - 1] && c !== '/'),
  '?': ({ prev, j, c }) => j > 0 && prev[j - 1] && c !== '/',
});

function tableRow(token, prev, chars) {
  const cell = CELL[token] || (({ j, c }) => j > 0 && prev[j - 1] && c === token);
  const row = [];
  let before = false;
  for (let j = 0; j <= chars.length; j += 1) {
    row[j] = Boolean(cell({ prev, row, j, c: chars[j - 1], before }));
    before = before || prev[j];
  }
  return row;
}

function matches(glob, path) {
  const chars = [...path];
  const first = chars.map(() => false);
  return glob.match(TOKEN).reduce((prev, token) => tableRow(token, prev, chars), [true, ...first]).at(-1);
}

const globsOf = (globs) => Object.freeze({ test: (path) => globs.some((glob) => matches(glob, path)), toString: () => globs.join(',') });

module.exports = { globsOf };
