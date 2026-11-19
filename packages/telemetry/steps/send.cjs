// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The attempt: drop what may no longer leave; with no address stop there (nothing is dialled); else the waiting forgets, then the oldest
// reports as one request whose body is their stored bytes joined, the choice read again right before the post. Each report is marked
// attempted (and its period sent) before the post, so a lost answer resends the same id and bytes. Only the answer's closed words are kept.
const { errors: { isFail } } = require('@atlasbound/kit');
const { PATHS, WIRE, UNSENT, validate } = require('../contracts/shapes.cjs');
const { HOUR_MS, DAY_MS, recordAt, writeRecord, jitterMs } = require('../contracts/helpers.cjs');
const { leavesStill, requestFrom } = require('../core/leave.cjs');
const { queued, restate, boundQueue, addHealth } = require('./collect.cjs');
const { storedPeriod, markSent, forgetWaiting } = require('./period.cjs');

const { limits } = WIRE;
const ATTEMPT_MS = limits.attemptHours * HOUR_MS;
const RESULT = { stored: 'received', duplicate: 'received', rejected: 'rejected', gone: 'rejected' };

/** The last attempt here (`attempt.json`), or null. */
const attemptOf = (io) => {
  const held = recordAt(io.fs, PATHS.attempt);
  return held && validate.refusal('Attempt', held) === null ? held : null;
};

/** The request the next attempt would post, after the drop the sender makes (`drop`: a report that may no longer leave is deleted). */
function nextRequest(io, states, drop) {
  const leaves = leavesStill(states, storedPeriod(io));
  return requestFrom((drop ? boundQueue(io, leaves) : queued(io).items).filter(leaves));
}

/** What waits and was received here, the last attempt, and the forgets that wait. */
function storeSummary(io) {
  const { items } = queued(io);
  const period = storedPeriod(io);
  const count = (states) => items.filter((item) => states.includes(item.state)).length;
  return { waiting: count(UNSENT), received: count(['received']), last: attemptOf(io), forget: period?.forget.length ?? 0,
    expired: period?.expired ?? 0 };
}

// The next attempt by the server's answer: 429 waits its Retry-After (at least a day); network or 5xx backs off, doubling to a week;
// another 4xx refuses the batch for good; 200 marks each report it names. Every wait but a 429's is spread by up to an hour.
function outcomeOfPost(io, batch, res, fails) {
  if (res.status === 429) return { code: 'telemetry-throttled', fails, wait: Math.max(ATTEMPT_MS, (res.retryAfterS ?? 0) * 1000) };
  const spread = jitterMs(limits.jitterMinutes);
  if (res.status === 0 || res.status >= 500) {
    addHealth(io, { send_failed: 1 });
    return { code: 'telemetry-failed', fails: fails + 1, wait: Math.min(ATTEMPT_MS * 2 ** fails, limits.retryDays * DAY_MS) + spread };
  }
  const results = validate.jsonOrNull(res.text)?.results;
  const said = new Map((Array.isArray(results) ? results : []).map((one) => [one?.id, RESULT[one?.status]]));
  const refused = res.status !== 200;
  batch.forEach((item) => {
    const state = refused ? 'rejected' : said.get(validate.jsonOrNull(item.line).id);
    if (state) restate(io, item, state);
  });
  addHealth(io, { rejected: Number(refused) });
  return { code: refused ? 'telemetry-rejected' : 'telemetry-sent', fails: 0, wait: ATTEMPT_MS + spread, sent: batch.length };
}

// Up to the post: the drop, the forgets, the batch, the choice read again -> { batch, body }, or { code } when nothing is posted.
async function readyBatch(io, { statesNow, period, net }) {
  const kept = boundQueue(io, leavesStill(statesNow(), period));
  if (!WIRE.url) return { code: 'no-endpoint' };
  await forgetWaiting(io, net);
  const still = leavesStill(statesNow(), period);
  kept.filter((item) => UNSENT.includes(item.state) && !still(item)).forEach((item) => io.fs.remove(item.key)); // history stays
  const { batch, body } = requestFrom(kept.filter(still));
  return batch.length ? { batch, body } : { code: 'telemetry-nothing' };
}

/** One attempt. `statesNow()` reads the choice (again right before the post); `ctx.net` the one port. */
async function attempt({ statesNow }, io, ctx) {
  const period = storedPeriod(io);
  const fails = attemptOf(io)?.fails ?? 0;
  const ready = await readyBatch(io, { statesNow, period, net: ctx.net });
  let next = { code: ready.code, fails, wait: ATTEMPT_MS };
  if (ready.batch) {
    const marked = ready.batch.map((item) => ({ ...item, attempts: item.attempts + 1 }));
    marked.forEach((item) => restate(io, item, 'attempted'));
    markSent(io, period.id);
    const res = await ctx.net.post(WIRE.url, ready.body).catch((err) => (isFail(err) ? { status: 0 } : Promise.reject(err)));
    next = outcomeOfPost(io, marked, res, fails);
  }
  const at = io.clock.now();
  writeRecord(io.fs, PATHS.attempt, { at, nextAt: Date.parse(at) + next.wait, fails: next.fails, code: next.code });
  return { out: { code: next.code, sent: next.sent ?? 0 }, n: { sent: next.sent ?? 0, fails: next.fails }, codes: { [next.code]: 1 } };
}

module.exports = { attempt, attemptOf, nextRequest, storeSummary };
