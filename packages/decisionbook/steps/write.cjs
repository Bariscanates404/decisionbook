// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The two verbs that write records, `new` and `add`: each reads its words, refuses what must never reach the store, and
// hands its batch to the one write (steps/batch).
const { errors: { fail } } = require('@atlasbound/kit');
const { SCHEMA, bound, argOf, refuseSecrets } = require('../contracts/shapes.cjs');
const { WORDS } = require('../contracts/codes.cjs');
const { planIdOf } = require('../core/id.cjs');
const { writeBatch } = require('./batch.cjs');
const { newBesideOpen } = require('./open.cjs');
const store = require('./store.cjs');

const NEW = 'new <record>: {"title": …, "why": …, "records": [<record>, ...]}, or the JSON on standard input';
const ADD = 'add <id> <record> | add <id> [<record>, ...], or the JSON on standard input';

/** `new`: the plan record and its records are one batch, written by one exclusive create only when every record holds,
 * so a refused new leaves nothing and its refusal names every problem, the plan record's with the records'. Beside a plan an
 * earlier session left open it is refused first (steps/open). */
async function create({ rest }, io) {
  const { records = [], ...asked } = argOf(rest[0], NEW);
  const values = [].concat(records);
  refuseSecrets([asked, ...values], (i) => (i ? `record ${i} of ${values.length}` : WORDS.thePlan));
  const branch = await io.git.branch();
  newBesideOpen(io, branch);
  const id = planIdOf(String(asked.title || ''), io.clock.now(), store.taken(io));
  const plan = { ...asked, schema: SCHEMA, t: 'plan', id, branch, head: await io.git.head() };
  const bad = bound.problems('plan', plan);
  const refusedHead = bad.length ? [{ place: WORDS.thePlan, problems: [['record-invalid', bad.join(', ')]] }] : [];
  const batch = { id, lines: [], fresh: true };
  store.hold(io, batch, plan);
  const { out, n } = await writeBatch(io, batch, values, refusedHead);
  return { out: { ...out, code: 'plan-created', file: store.pathOf(id) }, code: 'plan-created', n };
}

/** `add`: refused before any record is read when the batch holds a secret or names no plan here. */
async function addRecords({ rest }, io) {
  const [id, json] = rest;
  const values = id ? [].concat(argOf(json, ADD)) : [];
  if (!values.length) throw fail('plan-args', ADD);
  refuseSecrets(values, (i) => `record ${i + 1} of ${values.length}`);
  store.readPlan(io, id);
  return writeBatch(io, { id, lines: [] }, values, []);
}

module.exports = { create, addRecords };
