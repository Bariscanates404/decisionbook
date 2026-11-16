// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What only the person may say yes to: a policy change that takes a glob out or leaves none readable; a READY plan opens the gate
// only when this machine holds its key, so a commit that changes or re-readies the plan is asked again.
const { hash: { sha256 } } = require('@atlasbound/kit');
const { bound } = require('../contracts/shapes.cjs');

const FIELDS = ['protect', 'danger', 'guarded']; // guarded: a declared folder's files that hold a protection; the config holds none

function protectPolicy(text) {
  const value = text === null ? {} : bound.jsonOrNull(text);
  if (!value || bound.refusal('Config', value)) return null;
  return { protect: value.protect || [], danger: value.danger || [] };
}

const applies = (text, from, to) => text !== null && typeof from === 'string' && typeof to === 'string' && text.includes(from);
const applied = (text, { old_string: from, new_string: to, replace_all: all }) => (!applies(text, from, to) ? null
  : (all ? text.split(from).join(to) : text.replace(from, () => to)));

function afterEdit(text, tool, input) {
  if (tool === 'Write') return typeof input.content === 'string' ? input.content : null;
  const edits = { Edit: [input], MultiEdit: Array.isArray(input.edits) ? input.edits : null }[tool];
  return edits ? edits.reduce(applied, text) : null;
}

const addsOnly = (text, lowering, value = bound.jsonOrNull(text)) => value !== null && typeof value === 'object'
  && !lowering.some((word) => Object.hasOwn(value, word));
const removed = (before, after) => (before
  ? FIELDS.flatMap((field) => (before[field] || []).filter((row) => !(after ? after[field] || [] : []).includes(row))) : []);

const readyKey = (view) => sha256(JSON.stringify({ id: view.id, branch: view.branch, ready: view.ready }));
const confirmKey = (view) => sha256(JSON.stringify({ id: view.id, confirm: view.confirm }));

/** What the policy lost and gained since `seen` (the last one a session start saw), or null when nothing moved or none was seen; `now`
 * null: it no longer reads. */
function policyChange(seen, now) {
  if (!seen) return null;
  const gone = removed(seen, now);
  const added = now ? removed(now, seen) : []; // what the old policy lacks is what the new one adds
  return gone.length || added.length || !now ? { gone, added, unreadable: !now } : null;
}

module.exports = { protectPolicy, afterEdit, addsOnly, removed, readyKey, confirmKey, policyChange };
