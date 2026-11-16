// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// How many commits touched a decision's files since it was decided, one git read per head; unmeasurable stays absent, never 0.
const { anyOverlap } = require('../base/glob.cjs');

async function markTouched(io, decisions) {
  const measured = decisions.filter((d) => d.head && d.files.length);
  const heads = [...new Set(measured.map((d) => d.head))];
  const since = new Map(await Promise.all(heads.map(async (head) => [head, await io.git.commits(head)])));
  measured.filter((d) => since.get(d.head)).forEach((d) => {
    d.touched = since.get(d.head).filter((c) => anyOverlap(c.files, d.files)).length;
  });
  return decisions;
}

module.exports = { markTouched };
