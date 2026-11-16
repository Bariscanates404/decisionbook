// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What is new since the last send, pure: rows by position per file, never by time. An unchanged state (the events a package declares of
// the state form, `states`) stays (a daily same vector would link a repository's sends).

function takeNew(files, seen, max) {
  const rows = [];
  const offsets = {};
  let waiting = 0;
  for (const { name, rows: all } of files) {
    const start = seen[name] ?? 0;
    const fresh = all.slice(start);
    const taken = fresh.slice(0, max - rows.length);
    rows.push(...taken);
    waiting += fresh.length - taken.length;
    if (taken.length) offsets[name] = start + taken.length;
  }
  return { rows, offsets, waiting };
}

const stateLine = ({ event, payload }) => JSON.stringify([event, Object.keys(payload).sort().map((key) => [key, payload[key]])]);
const stateKeyOf = (events, states) => events.filter(({ event }) => states.includes(event)).map(stateLine).sort().join('\n');
const newsOf = (events, sent, states) => (stateKeyOf(events, states) === sent
  ? events.filter(({ event }) => !states.includes(event)) : events);

module.exports = { takeNew, stateKeyOf, newsOf };
