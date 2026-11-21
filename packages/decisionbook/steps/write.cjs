// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The two verbs that write records, `new` and `add`: each reads its words, refuses what must never reach the store, and
// hands its batch to the one write (steps/batch).
const { errors: { fail }, host: { draftsOf }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { SCHEMA, bound, argOf, refuseSecrets, isPlanLink, plannedPath } = require('../contracts/shapes.cjs');
const { WORDS } = require('../contracts/codes.cjs');
const { planIdOf } = require('../core/id.cjs');
const { writeBatch } = require('./batch.cjs');
const { newBesideOpen } = require('./open.cjs');
const store = require('./store.cjs');

/** `new`: the plan record and its records are one batch, written by one exclusive create only when every record holds,
 * so a refused new leaves nothing and its refusal names every problem, the plan record's with the records'. Beside a plan an
 * earlier session left open it is refused first (steps/open). Where another process made the file of that id while the batch was
 * judged, nothing was written: the whole batch is judged again under the next free id, so each of many at once keeps its own file. */
async function create({ rest }, io) {
  const { records = [], ...asked } = argOf(rest[0], filled(WORDS.usage.new, { drafts: draftsOf(io.session) }));
  const values = [].concat(records);
  refuseSecrets([asked, ...values], (i) => (i ? `record ${i} of ${values.length}` : WORDS.thePlan));
  const branch = await io.git.branch();
  await newBesideOpen(io, branch, values.filter(isPlanLink).map(plannedPath), values);
  const head = await io.git.head();
  for (;;) { // ends: each turn another process took an id, and `taken` then hands a later one
    const id = planIdOf(String(asked.title || ''), io.clock.now(), store.taken(io));
    const plan = { ...asked, schema: SCHEMA, t: 'plan', id, branch, head };
    const bad = [...bound.problems('plan', plan), ...(typeof plan.title === 'string' && !/[\p{L}\p{N}]/u.test(plan.title) ? [WORDS.titleEmpty] : [])];
    const refusedHead = bad.length ? [{ place: WORDS.thePlan, problems: [['record-invalid', bad.join(', ')]] }] : [];
    const batch = { id, lines: [], fresh: true };
    store.hold(io, batch, plan);
    const written = await writeBatch(io, batch, values, refusedHead);
    if (written) return { out: { ...written.out, code: 'plan-created', file: store.pathOf(id) }, code: 'plan-created', n: written.n };
  }
}

/** `add`: refused before any record is read when the batch holds a secret or names no plan here. */
async function addRecords({ rest }, io) {
  const [id, json] = rest;
  const usage = filled(WORDS.usage.add, { drafts: draftsOf(io.session) });
  const values = id ? [].concat(argOf(json, usage)) : [];
  if (!values.length) throw fail('plan-args', usage);
  refuseSecrets(values, (i) => `record ${i + 1} of ${values.length}`);
  store.readPlan(io, id);
  return writeBatch(io, { id, lines: [] }, values, []);
}

module.exports = { create, addRecords };
