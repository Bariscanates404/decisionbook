// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The context rule's record, one O_APPEND JSONL file per session: told twice, never held untold. No session: all is said.
const { hash: { sha256 } } = require('@atlasbound/kit');
const { foldSaid, sayNow, startsAnew } = require('../core/said.cjs');
const { SAID_DIR } = require('../contracts/shapes.cjs');
const validate = require('../contracts/validate.cjs');

const dropOld = (io, now) => (io.fs.list(SAID_DIR) || []).map((name) => `${SAID_DIR}/${name}`)
  .filter((key) => now - (io.fs.mtimeMs(key) ?? now) > io.config.hookTraceDays * 86400000).forEach((key) => io.fs.remove(key));

/** tellContext(io, { event, payload, items }) -> { texts, rows, n } of core/said, the rows kept. */
function tellContext(io, { event, payload, items }) {
  if (!payload || !payload.session_id) return sayNow(new Map(), items);
  const session = sha256([payload.session_id, payload.agent_id].filter(Boolean).join(':')).slice(0, 16);
  const file = `${SAID_DIR}/${session}.jsonl`;
  const anew = startsAnew(event, payload);
  const at = io.clock.now();
  if (anew && !io.configRefused) dropOld(io, Date.parse(at)); // the shipped days never prune what a person's config keeps longer
  const out = sayNow(foldSaid(anew ? [] : (io.fs.readText(file) || '').split('\n').map(validate.jsonOrNull).filter(Boolean)), items);
  const kept = [...(anew ? [{ anew: payload.source || 'unnamed' }] : []), ...out.rows].map((row) => `${JSON.stringify({ ...row, ev: event, at })}\n`).join('');
  if (kept) io.fs.append(file, kept);
  return out;
}

module.exports = { tellContext };
