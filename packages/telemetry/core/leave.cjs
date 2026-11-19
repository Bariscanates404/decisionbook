// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Pure: what may leave (a queued report, while its namespace reports under the same period and policy pair) and in which request.
const { WIRE, UNSENT, validate } = require('../contracts/shapes.cjs');
const { daysAgo } = require('../contracts/helpers.cjs');
const { text: { lines: { dayOf } } } = require('@atlasbound/kit');

/** A period ended at `now`: its id, if sent, kept aside while the server may hold what it sent (`keepDays`), so a forget can name it. */
const periodEnded = (record, now, keepDays) => ({ ...record, id: '', token: '', at: '', sent: false,
  past: [...record.past, ...(record.id ? [{ id: record.id, token: record.token, until: now, sent: record.sent }] : [])]
    .filter((one) => one.sent && daysAgo(one.until, now) < keepDays) });

/** Whether a queued report may still leave: its namespace on and registered here, its period the current one, made under the current
 * (core, namespace) policy pair, and its day not before that namespace's `since`. */
const leavesStill = (states, period) => (item) => {
  const state = states.find((one) => one.space.ns === item.ns);
  const report = validate.jsonOrNull(item.line);
  return Boolean(state?.on && report && period?.id && report.period === period.id && report.policy === WIRE.policy
    && report.module_policy === state.space.policy && item.day >= dayOf(state.since));
};

/** The oldest unsent reports that fit one request (requestReports, requestBytes), and the request's exact body: their stored bytes. */
function requestFrom(items) {
  const batch = [];
  let bytes = 64;
  for (const item of items.filter((one) => UNSENT.includes(one.state))) {
    if (batch.length === WIRE.limits.requestReports || bytes + item.bytes + 1 > WIRE.limits.requestBytes) break;
    batch.push(item);
    bytes += item.bytes + 1;
  }
  return { batch, body: batch.length ? `{"protocol":"${WIRE.protocol}","reports":[${batch.map((item) => item.line).join(',')}]}` : null };
}

module.exports = { periodEnded, leavesStill, requestFrom };
