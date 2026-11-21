// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. planIdOf(title, now: ISO time, taken: (id) -> bool) -> `2026-11-04-login-times-out-3f9a` (`Çarpım` is `carpim`), `-2` when taken.
// The last part comes from the start moment, so one task started the same day in two clones is two files and their merge is clean.
const { text: { lines: { dayOf } }, hash: { sha256 } } = require('@atlasbound/kit');
const { asciiFolded } = require('../base/text.cjs');
function planIdOf(title, now, taken) {
  const words = asciiFolded(title).replace(/[^a-z0-9]+/g, '-').slice(0, 48).replace(/^-+|-+$/g, '');
  const base = `${dayOf(now)}-${words || 'plan'}-${sha256(now).slice(0, 4)}`;
  let n = 1;
  while (taken(n === 1 ? base : `${base}-${n}`)) n += 1;
  return n === 1 ? base : `${base}-${n}`;
}
module.exports = { planIdOf };
