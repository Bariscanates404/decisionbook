// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. A protected file this session changed that no plan of the branch records blocks completion, never twice in a row
// (stop_hook_active); so does the session's plan whose work no close records as the tree holds it (steps/close: once per tree).
const { globCovers } = require('../base/glob.cjs');
const { scopeOf } = require('./fold.cjs');
const { stopReason } = require('./text/gate.cjs');

// a READY plan records its planned paths as they stand now: the frozen plan takes in what is written under it
const recordedBy = (view) => [...(view.ready ? scopeOf(view) : []), ...(view.closed ? view.closed.files : [])];

function stopVerdict({ kept, changed, moved, views, branch, again }) {
  const globs = views.filter((v) => v.branch === branch && (v.stage === 'ready' || v.stage === 'closed')).flatMap(recordedBy);
  const unrecorded = moved.filter((file) => !globs.some((glob) => globCovers(glob, file)));
  const n = { kept: kept ? 1 : 0, changed: changed.length, moved: moved.length, unrecorded: unrecorded.length };
  const code = (!unrecorded.length && 'stop-clean') || (again && 'stop-repeat') || 'stop-unrecorded';
  if (code !== 'stop-unrecorded') return { out: { verdict: 'allow', code }, code, n };
  return { out: { verdict: 'deny', code, files: unrecorded, reason: stopReason(code, unrecorded) }, code, n };
}

/** The block of a turn that ends on work of plan `id` no close records: finished, the session closes and hands the one commit; not
 * finished, it says what is left. `n`: the counts of the check it passed. */
const unclosedVerdict = (id, n = {}) => ({ out: { verdict: 'deny', code: 'stop-unclosed', plan: id, reason: stopReason('stop-unclosed', [id]) },
  code: 'stop-unclosed', n });

module.exports = { stopVerdict, unclosedVerdict };
