// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// a plan's flow leaves as numbers only: one row at its first READY, one at its close, and the open plans that stopped at a session's
// start. Only the public entry and kit's fake io.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld: world, added, readyOne, starting, lastN, theirAnswer } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const flowRows = (io) => io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line))
  .filter((row) => row.step === 'plan.flow');
const later = (io, at) => Object.assign(io.clock, { now: () => at });

test('the first READY and the close each write one flow row of numbers: seconds, counts, no word of the plan', async () => {
  const io = world();
  const { id } = await readyOne(io);
  const [ready] = flowRows(io);
  assert.deepEqual([Object.keys(ready.codes), Object.keys(ready.n).sort()], [['flow-ready'], ['answered', 'questions', 'research', 'routed', 'seconds']]);
  assert.ok(ready.n.research >= 3 && ready.n.questions >= ready.n.answered && ready.n.routed === 0, JSON.stringify(ready.n));
  await added(io, id, [{ t: 'question', q: 'Q8', text: 'which page size?', decides: 'report.page', whyNotCode: 'a product rule', blocking: false },
    theirAnswer('Q8', 'report.page', '50 rows', 'Fifty rows a page.')]);
  await verbs.ready(io, { rest: [id] });
  assert.equal(flowRows(io).length, 1, 'READY again, a later write: the flow row is the first READY\'s alone');
  io.state.commits = [{ after: 'h0', sha: 'c1', subject: 'wip', body: `DecisionBook: ${id}`, files: ['src/report/export.js'] }];
  io.state.head = 'c1';
  later(io, '2026-11-02T08:00:00.000Z');
  assert.equal((await verbs.close(io, { rest: [id] })).out.code, 'plan-closed');
  const closed = flowRows(io).at(-1);
  assert.deepEqual([Object.keys(closed.codes), closed.n.resumes], [['flow-closed'], 0]);
  assert.ok(closed.n.seconds > 7000 && closed.n.total >= closed.n.seconds && closed.n.total < 7300, JSON.stringify(closed.n));
  assert.deepEqual(flowRows(io).flatMap((row) => Object.values(row.n).map((value) => typeof value)).filter((type) => type !== 'number'), []);
});

test('a session start counts the open plans older than seven days by where they stopped; a closed one is none', async () => {
  const io = world();
  const { id } = await readyOne(io);
  const stale = async () => {
    await handlers.session(starting('s9'), io);
    const { stale_draft: draft, stale_ready: ready } = lastN(io, 'decisionbook.session');
    return [draft, ready];
  };
  assert.deepEqual(await stale(), [0, 0], 'the day it was opened');
  later(io, '2026-11-09T07:00:00.000Z');
  assert.deepEqual(await stale(), [0, 1], 'READY, never closed, eight days on');
  io.state.commits = [{ after: 'h0', sha: 'c1', subject: 'wip', body: `DecisionBook: ${id}`, files: ['src/report/export.js'] }];
  io.state.head = 'c1';
  await verbs.close(io, { rest: [id] });
  assert.deepEqual(await stale(), [0, 0]);
});
