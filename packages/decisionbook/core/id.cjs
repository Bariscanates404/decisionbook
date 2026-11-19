// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. planIdOf(title, now: ISO time, taken: (id) -> bool) -> `2026-11-04-login-times-out`, `-2`, `-3` when taken; `Çarpım` is `carpim`
const { text: { lines: { dayOf } } } = require('@atlasbound/kit');
const { asciiFolded } = require('../base/text.cjs');
function planIdOf(title, now, taken) {
  const words = asciiFolded(title).replace(/[^a-z0-9]+/g, '-').slice(0, 48).replace(/^-+|-+$/g, '');
  const base = `${dayOf(now)}-${words || 'plan'}`;
  let n = 1;
  while (taken(n === 1 ? base : `${base}-${n}`)) n += 1;
  return n === 1 ? base : `${base}-${n}`;
}

module.exports = { planIdOf };
