// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The queue's owner: closed days of the trace folded into one immutable report per namespace and day (its bytes written once, never
// re-serialised), the reports kept here with their state, their bounds, and telemetry's own health counts. Runs under the sender lock.
const { trace: { TRACE_DIR }, hash, text: { lines: { dayOf } } } = require('@atlasbound/kit');
const { handleFor, countedBy } = require('../core/registry.cjs');
const { foldDay } = require('../core/fold.cjs');
const { redact } = require('../core/redact.cjs');
const { schemaOf } = require('../contracts/rules.cjs');
const { PATHS, WIRE, UNSENT, validate } = require('../contracts/shapes.cjs');
const { daysAgo, addTo, recordAt, writeRecord, reportText, randomHex } = require('../contracts/helpers.cjs');
const { periodNow } = require('./period.cjs');

const REPORT = /^(\d{4}-\d{2}-\d{2})-([a-z][a-z0-9]*)\.json$/u;
const FILE_DAY = /(20\d{2})-?([01]\d)-?([0-3]\d)/u; // hooks-2026-11-18, cli-20261118…; a name with no day (a test's run id) is read too
const { limits } = WIRE;
const BOUNDS = { unsent: { days: limits.queueDays, bytes: limits.queueBytes },
  kept: { days: limits.historyDays, bytes: limits.historyBytes } };

/** Every report kept here, oldest first: `{ key, day, ns, line, state, attempts, bytes }`; a file that does not read is skipped. */
function queued(io) {
  const items = [];
  let unreadable = 0;
  for (const name of (io.fs.list(PATHS.reports) || []).filter((one) => REPORT.test(one)).sort()) {
    const key = `${PATHS.reports}/${name}`;
    const [line, state] = (io.fs.readText(key) || '').split('\n');
    const held = validate.jsonOrNull(state ?? '');
    const [, day, ns] = REPORT.exec(name);
    if (validate.jsonOrNull(line) && held && validate.refusal('ReportState', held) === null) {
      items.push({ key, day, ns, line, ...held, bytes: Buffer.byteLength(line, 'utf8') });
    } else unreadable += 1;
  }
  return { items, unreadable };
}
/** A report's state line rewritten; its first line is copied as the string it is. */
const restate = (io, item, state) => io.fs.writeAtomic(item.key,
  reportText(item.line, { state, attempts: item.attempts, at: io.clock.now() }));
/** The waiting reports of these namespaces (null: all) deleted here. -> how many. */
function dropWaiting(io, namespaces) {
  const gone = queued(io).items.filter((item) => UNSENT.includes(item.state) && (!namespaces || namespaces.includes(item.ns)));
  gone.forEach((item) => io.fs.remove(item.key));
  return gone.length;
}

/** Health counts added, kept until they ride the cli report of a closed day. */
function addHealth(io, counts) {
  const more = Object.entries(counts).filter(([, n]) => n > 0);
  const health = more.reduce((all, [kind, n]) => addTo(all, kind, n), recordAt(io.fs, PATHS.health, {}));
  if (more.length) writeRecord(io.fs, PATHS.health, health);
}

const withinBound = (item, bound, used, today) => daysAgo(item.day, today) <= bound.days && used <= bound.bytes;
/** Unsent reports: at most queueDays and queueBytes (oldest go; counted lost while an address is set); received or refused ones: at most
 * historyDays and historyBytes. `keep(item)`: false drops an unsent one now. -> the reports left. */
function boundQueue(io, keep = () => true) {
  const today = dayOf(io.clock.now());
  const { items, unreadable } = queued(io);
  const kept = [];
  const used = { unsent: 0, kept: 0 };
  let lost = 0;
  for (const item of [...items].reverse()) {
    const kind = UNSENT.includes(item.state) ? 'unsent' : 'kept';
    used[kind] += item.bytes;
    const wanted = kind === 'kept' || keep(item); // a received or refused report leaves only by the history bounds
    const fits = wanted && withinBound(item, BOUNDS[kind], used[kind], today);
    if (fits) kept.unshift(item);
    else io.fs.remove(item.key);
    lost += Number(wanted && !fits && kind === 'unsent');
  }
  addHealth(io, { lost: WIRE.url ? lost : 0, unreadable });
  return kept;
}

/** The rows of the days not closed yet, by day (a torn line costs itself, a self-check's row is no use), and days whose clock went back. */
function rowsByDay(io, { through, today, now }) {
  const byDay = new Map();
  const suspect = new Set();
  let torn = 0;
  let over = 0;
  let read = 0; // at most closeRows rows per close: the rest is counted, so one close stays bounded on the person's verb
  const fileDay = (name) => FILE_DAY.exec(name)?.slice(1).join('-');
  const due = (name) => !fileDay(name) || (fileDay(name) > through && daysAgo(fileDay(name), today) <= limits.queueDays + 1);
  for (const name of (io.fs.list(TRACE_DIR) || []).filter((one) => one.endsWith('.ndjson') && due(one))) {
    const { rows, refused } = validate.kept(io.fs.readText(`${TRACE_DIR}/${name}`) || '', 'TraceRow', (row) => !row.ref?.self);
    torn += refused.length;
    rows.forEach((row, i) => {
      const day = dayOf(row.at);
      if ((i && row.at < rows[i - 1].at) || row.at > now) suspect.add(day);
      if (!byDay.has(day)) byDay.set(day, []);
      if (read < limits.closeRows) byDay.get(day).push(row);
      else over += 1;
      read += 1;
    });
  }
  return { byDay, suspect, torn, over };
}

const releaseOf = (version) => (/^\d{1,4}\.\d{1,4}\.\d{1,4}$/u.test(version ?? '') ? version : undefined);
const envelopeOf = ({ period, state, day, version, machine, suspect }) => ({ id: randomHex(16), period: period.id,
  verifier: hash.sha256(period.token), module: state.space.ns, schema: state.space.schema, policy: WIRE.policy,
  module_policy: state.space.policy, release: releaseOf(version), node: machine.node, os: machine.os, day, consent: state.source,
  clock_suspect: suspect || undefined });

/** One report, written only if absent (a close killed before closed.json finds it and keeps it); one that does not pass its own schema
 * is not made. -> the health it adds. */
function reportOne(io, { key, raw, schema }) {
  const { line, cut } = redact(raw, { schema, cap: limits.reportBytes });
  if (line) io.fs.createExclusive(key, reportText(line, { state: 'prepared', attempts: 0, at: io.clock.now() }));
  return { overflow: Number(raw.metrics.some((row) => row.o)), unsupported: Number(!line), cut };
}

// One namespace's report of one day: folded, given the health counts where this report carries them, written once.
function reportDay(io, { day, state, closing }) {
  const handle = handleFor(state.space, { cap: limits.countCap });
  const rows = closing.byDay.get(day).filter((row) => row.at >= state.since);
  foldDay(handle, state.space, { rows, later: closing.every, closeMs: Date.parse(closing.now), pairMs: limits.pairMinutes * 60000 });
  const carries = day === closing.days.at(-1) && Object.values(state.space.metrics).some((spec) => spec.computed === 'health');
  if (carries) Object.entries(closing.pending).forEach(([kind, n]) => handle.increment('health', { kind }, n));
  const { rows: counted, dropped } = countedBy(handle);
  const key = `${PATHS.reports}/${day}-${state.space.ns}.json`;
  if (!counted.length || io.fs.exists(key)) return {};
  if (carries) closing.pending = {};
  const raw = { ...envelopeOf({ ...closing, state, day, suspect: closing.suspect.has(day) }), metrics: counted };
  return { ...reportOne(io, { key, raw, schema: closing.schema }), dropped };
}

/** Close every finished day (after closed.json, before today, at or after each namespace's `since`, at most queueDays back) into reports
 * for the namespaces that are on. The health counts ride the newest day's report of the namespace that carries them. */
async function closeDays({ states, version }, io, { machine }) {
  const now = io.clock.now();
  const today = dayOf(now);
  const on = states.filter((state) => state.on);
  const period = on.length ? periodNow(io) : null;
  if (!period) return { out: { days: [] }, n: {}, codes: {} };
  const closed = io.fs.readText(PATHS.closed);
  const through = closed === null ? '' : validate.jsonOrNull(closed)?.through ?? today; // unreadable: nothing is folded twice
  const { byDay, suspect, torn, over } = rowsByDay(io, { through, today, now });
  const days = [...byDay.keys()].filter((day) => day > through && day < today && daysAgo(day, today) <= limits.queueDays).sort();
  const closing = { now, days, byDay, suspect, period, version, machine, every: [...byDay.values()].flat(),
    schema: schemaOf(on.map((state) => state.space), WIRE), pending: addTo(addTo(recordAt(io.fs, PATHS.health, {}), 'unreadable', torn), 'cut', over) };
  const fresh = {};
  const made = (day, state) => Object.entries(reportDay(io, { day, state, closing })).forEach(([kind, n]) => addTo(fresh, kind, n));
  days.forEach((day) => on.forEach((state) => made(day, state)));
  const { dropped = 0, ...health } = fresh;
  if (days.length) writeRecord(io.fs, PATHS.closed, { through: days.at(-1) });
  writeRecord(io.fs, PATHS.health, Object.entries(health).reduce((all, [kind, n]) => addTo(all, kind, n), closing.pending));
  return { out: { days }, n: { days: days.length, torn, dropped }, codes: torn ? { 'trace-line-refused': torn } : {} };
}

module.exports = { closeDays, queued, restate, dropWaiting, boundQueue, addHealth };
