// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Telemetry's helper module: the small helpers its core and steps share, each over what it is handed. What may leave is core/leave.cjs's.
const { traced, lock: { withLock }, errors: { fail, isFail } } = require('@atlasbound/kit');
const { PATHS, validate } = require('./shapes.cjs');

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Days from `day` to `today` (a day or a time each). */
const daysAgo = (day, today) => (Date.parse(today) - Date.parse(day)) / DAY_MS;
/** `n` more of `kind` in a tally; nothing for zero. */
const addTo = (counts, kind, n) => Object.assign(counts, n > 0 ? { [kind]: (counts[kind] ?? 0) + n } : {});
/** A JSON record of a store (the repository's or the home's), or `fallback` when it is absent or does not read. */
const recordAt = (store, key, fallback = null) => validate.jsonOrNull(store.readText(key, { noLink: true }) ?? '') ?? fallback;
/** A JSON record written whole, as one line. */
const writeRecord = (store, key, value) => store.writeAtomic(key, `${JSON.stringify(value)}\n`);
/** A report file: line 1 its bytes, as written once; line 2 its state. */
const reportText = (line, state) => `${line}\n${JSON.stringify(state)}\n`;
/** Random bytes as hex: a report's id, a period's id and token. */
const randomHex = (bytes) => Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(bytes))).toString('hex');
/** Whole minutes below `minutes`, in ms: spreads the attempts of many machines. */
const jitterMs = (minutes) => Math.floor(Math.random() * minutes) * 60000;
/** A trace row's host event, as its closed list will word it. */
const hostEvent = (row) => row.ref?.event ?? 'other';
/** A state that does not report, and why. */
const closedState = (code, why = null) => ({ on: false, code, source: null, since: null, why });
/** A namespace's entry of a choice, or null. */
const choiceEntry = (choice, ns) => (Object.hasOwn(choice.modules, ns) ? choice.modules[ns] : null);
/** An on made under the current (core, namespace) policy pair. */
const onUnderPair = (entry, { wire, space }) => entry?.on === true && entry.core === wire.policy && entry.policy === space.policy;

/** The namespaces one module word names (the namespace, or a package in it); no word: none named, so all. */
function modulesNamed(spaces, rest = []) {
  const found = rest.slice(0, 1).map((word) => spaces.find((space) => space.ns === word || space.packages.includes(word)));
  if (found.includes(undefined)) throw fail('telemetry-module-unknown', rest[0]);
  return found.map((space) => space.ns);
}

/** A step of its own trace record -> its `out`. */
const tracedOut = (io, name, fn) => (input, ctx) => traced(io, name, fn)(input, ctx).then((res) => res.out);
/** A coded failure as a coded answer (another process holding the sender lock: busy); an uncoded one goes on. */
function codedAnswer(err) {
  if (!isFail(err)) throw err;
  return { code: err.code === 'lock-held' ? 'telemetry-busy' : err.code };
}
/** `fn` under the one sender lock, never waited for. */
const withSendLock = (io, fn) => withLock(io, PATHS.lock, fn, 0);

module.exports = { HOUR_MS, DAY_MS, daysAgo, addTo, recordAt, writeRecord, reportText, randomHex, jitterMs, hostEvent, closedState,
  choiceEntry, onUnderPair, modulesNamed, tracedOut, codedAnswer, withSendLock };
