// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The one decision that may block completion: git sees every write. A protected file no plan records blocks it; so does, once per
// state of the work tree, the session's READY plan with work no close records (steps/close). The start is kept under the person's
// home, never the repository.
const { isGuarded } = require('../core/gate.cjs');
const { stopVerdict, unclosedVerdict } = require('../core/stop.cjs');
const { hereKeep, keptStart } = require('./here.cjs');
const { startName, closeName } = require('../base/here.cjs');
const { guardedPolicy, changedNow } = require('./changed.cjs');
const { closeStanding, letGo } = require('./closing.cjs');
const store = require('./store.cjs');

// once per session: a resumed or compacted session keeps the head it began on, and its time (the gate's startedAt)
async function keepStart(event, io) {
  const { config, off } = guardedPolicy(io);
  if (off) return { out: { code: off }, code: off };
  if (!io.home || !event.session_id) return { out: { code: 'start-unkept' }, code: 'start-unkept' };
  const again = Boolean(keptStart(io, event.session_id));
  if (!again) hereKeep(io, startName(event.session_id), { head: await io.git.head(), dirty: await changedNow(io, config) });
  letGo(io, null);
  return { out: { code: 'start-kept' }, code: 'start-kept', n: { again: again ? 1 : 0 } };
}

// then the close: a turn that ends on work of the session's plan no close records is held, once per state of the work tree
async function stopCheck(event, io) {
  const said = await unrecorded(event, io);
  if (said.out.verdict !== 'allow' || event.stop_hook_active === true) return said;
  const at = await closeStanding(io, event.session_id);
  if (!at.rides.length || at.tree === at.kept.told) return said;
  hereKeep(io, closeName(at.id), { ...at.kept, told: at.tree });
  return unclosedVerdict(at.id, said.n);
}

// files changed at the start that git's status still names with the same bytes are not this session's; no start kept: n.kept says so
async function unrecorded(event, io) {
  const { config, off } = guardedPolicy(io);
  if (off) return { out: { verdict: 'allow', code: off }, code: off };
  const kept = keptStart(io, event.session_id);
  const dirty = (kept && kept.dirty) || {};
  const since = (kept && (await io.git.commits(kept.head))) || []; // null: a lost start
  const committed = since.flatMap((c) => c.files).filter((key) => isGuarded(config, key));
  const now = await changedNow(io, config);
  const changed = [...new Set([...committed, ...Object.keys(now)])];
  const moved = changed.filter((key) => !(Object.hasOwn(dirty, key) && Object.hasOwn(now, key) && dirty[key] === now[key]));
  const [views, branch] = moved.length ? [store.readWeb(io, { config }).views, await io.git.branch()] : [[], null];
  return stopVerdict({ kept: Boolean(kept), changed, moved, views, branch, again: event.stop_hook_active === true });
}

module.exports = { keepStart, stopCheck };
