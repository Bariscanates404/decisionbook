// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The period, in the user's home beside the choice: a random id that changes every periodDays (and on reset), and a random token whose
// SHA-256 (`verifier`) rides each report so the server can check a later forget; the token itself leaves only in a forget request.
// Nothing of the machine, the person or the repository is in either. A forget waits here until the server confirms it.
const { errors: { isFail } } = require('@atlasbound/kit');
const { PATHS, SCHEMA, WIRE, validate } = require('../contracts/shapes.cjs');
const { daysAgo, randomHex, writeRecord } = require('../contracts/helpers.cjs');
const { periodEnded } = require('../core/leave.cjs');

const EMPTY = Object.freeze({ schema: SCHEMA.period, id: '', token: '', at: '', sent: false, past: [], forget: [], expired: 0 });

/** The record, EMPTY when there is none, or null when one is there and does not read (a newer schema: nothing is made under it). */
function storedPeriod(io) {
  try {
    const text = io.home ? io.home.readText(PATHS.period, { noLink: true }) : null;
    const record = text === null ? EMPTY : validate.jsonOrNull(text);
    return record?.schema === SCHEMA.period && validate.refusal('Period', record) === null ? record : null;
  } catch (err) {
    if (!isFail(err)) throw err;
    return null;
  }
}

/** The period a report is made under: a new one when there is none (after a reset) or it is older than periodDays; null while the record
 * does not read. */
function periodNow(io) {
  const record = storedPeriod(io);
  const now = io.clock.now();
  if (!record || (record.id && daysAgo(record.at, now) < WIRE.periodDays)) return record;
  const started = { ...periodEnded(record, now, WIRE.retention.days), id: randomHex(16), token: randomHex(32), at: now };
  writeRecord(io.home, PATHS.period, started);
  return started;
}

/** `telemetry reset`: the period ends now (the next report starts a new one); with `forget`, the ended id and every past id that was
 * sent wait for deletion. -> how many ids were queued. */
function renew(io, { forget }) {
  const record = storedPeriod(io) ?? EMPTY;
  const ended = periodEnded(record, io.clock.now(), WIRE.retention.days);
  const queued = forget ? ended.past.map(({ id, token }) => ({ id, token, tries: 0 })) : [];
  writeRecord(io.home, PATHS.period, forget ? { ...EMPTY, forget: [...record.forget, ...queued], expired: record.expired } : ended);
  return queued.length;
}

/** The home record says a report under `id` was handed to the server (marked at the attempt: an answer may be lost). */
function markSent(io, id) {
  const record = storedPeriod(io);
  const mark = (one) => ({ ...one, sent: one.sent || one.id === id });
  if (record && !(record.id === id && record.sent)) writeRecord(io.home, PATHS.period, { ...mark(record), past: record.past.map(mark) });
}

/** Each waiting forget, once: confirmed (2xx, or 404: nothing there) leaves the list; another answer counts a try; past forgetTries it is
 * dropped and counted as expired. No address: nothing is dialled. */
async function forgetWaiting(io, net) {
  const record = storedPeriod(io);
  if (!record?.forget.length || !WIRE.forget) return { done: 0, pending: record?.forget.length ?? 0 };
  const left = [];
  for (const one of record.forget) {
    const body = JSON.stringify({ protocol: WIRE.protocol, forget: { period: one.id, token: one.token } });
    const status = await net.post(WIRE.forget, body).then((res) => res.status, (err) => (isFail(err) ? 0 : Promise.reject(err)));
    if (!((status >= 200 && status < 300) || status === 404)) left.push({ ...one, tries: one.tries + 1 });
  }
  const kept = left.filter((one) => one.tries < WIRE.limits.forgetTries);
  writeRecord(io.home, PATHS.period, { ...record, forget: kept, expired: record.expired + left.length - kept.length });
  return { done: record.forget.length - left.length, pending: kept.length };
}

module.exports = { storedPeriod, periodNow, renew, markSent, forgetWaiting };
