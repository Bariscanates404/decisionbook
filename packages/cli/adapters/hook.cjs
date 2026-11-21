// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE hook port: fails open, never silently (a visible "no verdict formed" line), exit always 0: a non-zero hook blocks the agent or
// disappears.
const { traced, errors: { fail, isFail }, hash: { digest }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { EVENTS, PORT_READ_MS } = require('../contracts/shapes.cjs');
const validate = require('../contracts/validate.cjs');
const { WORDS: { adapters: W } } = require('../contracts/codes.cjs');
const core = require('../core/hooks.cjs');
const { compose, clock } = require('./compose.cjs');
const { tellContext } = require('../steps/said.cjs');
const { sayNow } = require('../core/said.cjs');
const { offOf } = require('../steps/modules.cjs');
const { hostCall } = require('../steps/person.cjs');
const { portGates } = require('../steps/sealed.cjs');

/** The context rule over every item, the off line last: once said, it goes to the person as a plain line, not into the agent's context. */
function toldOf(io, { event, payload, items, off }) {
  const all = [...items, ...[off].filter(Boolean)];
  const told = tellContext(io, { event, payload, items: all });
  return { ...told, sizes: off ? told.sizes.slice(0, -1) : told.sizes, plain: off && told.texts.at(-1) === off.text ? [told.texts.pop()]
    : [] };
}

async function stdinText() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** The host's input, read once -> its payload with the paths as this host opens them, or null and why it is no hook event (the reader's
 * words, for the trace): a null payload is the visible hook-input-invalid note. */
const hookInput = (text) => Promise.resolve().then(() => validate.shape('Payload', validate.json(text, 'hook-input-invalid')))
  .then((payload) => ({ payload: core.hostPaths(payload), why: null }), (err) => ({ payload: null, why: String(err.message || err.name) }));
const deadlineMs = (seconds) => Math.max(500, seconds * 1000 - 1000);

function within(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(fail('hook-timeout', label)), ms);
    const done = (fn) => (value) => {
      clearTimeout(timer);
      fn(value);
    };
    promise.then(done(resolve), done(reject));
  });
}

/** A decision formed before the trace failed still stands. */
function runOne(io, decl, payload, ref) {
  const label = `${decl.pkg}.${decl.handler}`;
  let decision = null;
  const step = traced(io, 'hook.handler', async (input) => {
    const fn = (io.packages.load(decl.pkg).handlers || {})[decl.handler];
    if (typeof fn !== 'function') throw fail('package-broken', filled(W.noHandler, { label }));
    const said = await within(Promise.resolve(fn(input, io.packages.ioFor(decl.pkg))), deadlineMs(decl.timeout), label);
    decision = validate.shape('Decision', said || {});
    return { out: { handler: label, decision }, n: {}, codes: { [`hook-${decision.verdict || 'none'}`]: 1 } };
  });
  const own = () => decision && { ...decision, pkg: decl.pkg };
  return step(payload, { run: io.run, ref: { ...ref, handler: label } }).then(() => ({ decision: own() }), (err) => ({ decision: own(), note: `${label} (${isFail(err) && io.trace.knows(err.code) ? err.code : 'hook-handler-threw'})` }));
}

/** The trace's row of what the host sent: an input that is no hook event says why. */
function inRecord(io, text, why, ref) {
  io.trace.record({ run: io.run, step: 'hook.in', ok: !why, in: digest(text), n: { bytes: Buffer.byteLength(text) }, ref,
    ...(why ? { err: { code: 'hook-input-invalid', msg: why } } : {}) });
}

/** The wired packages' manifests, or why they cannot be told (`unread`: an install record that does not read names its file). */
const wiredOf = (io) => Promise.resolve().then(() => ({ ...io.packages.declared(), unread: [] }))
  .catch((err) => ({ manifests: [], problems: [], unread: [`packages (${isFail(err) ? err.message : err.name})`] }));

/** Why no gate could judge this event: a config or an install record that does not read (`setup`: what it could not read), an input
 * that is no hook event, or one naming no tool or target. */
function unjudgedOf(io, event, payload, setup) {
  const config = [...(io.configRefused ? [`hook (${io.configRefused.message})`] : []), ...setup];
  if (!payload || !Object.hasOwn(EVENTS, event)) return [...config, 'hook (hook-input-invalid)'];
  const gap = core.inputGap(event, payload);
  return gap ? [...config, `hook (hook-input-invalid: ${gap})`] : config;
}

/** The port's whole answer to the host's input as read (`hookInput`): the reply, and per package what reached the agent (`agent`) and what
 * was the person's (`person`), which debug inject reads. */
async function answer(io, event, text, { payload, why }) {
  const notes = new Set();
  const call = hostCall(io, event); // a call that carries the person's words is heard only from the host: else no handler runs
  const noting = (fn, what) => Promise.resolve().then(fn).catch((err) => {
    notes.add(`${what} (${err.code || err.name})`);
  });
  const ref = { event, session: (payload && payload.session_id) || null };
  // a payload, a config or an install record that cannot be read is a gate that formed no verdict: no handler runs, it asks like the
  // failure path, and both rows are written
  const { manifests, problems, unread: setup } = await wiredOf(io);
  const unread = unjudgedOf(io, event, payload, setup);
  const known = !unread.length;
  [...unread, ...problems].forEach((note) => notes.add(note));
  await noting(() => inRecord(io, text, why, ref), 'trace');
  const reached = (known ? core.reached(manifests, event, payload) : []).filter(() => call.heard);
  const results = await Promise.all(reached.map((d) => runOne(io, d, payload, ref)));
  results.forEach((r) => r.note && notes.add(r.note));
  const lost = await askedFor(io.clock, event, payload, [...unread, ...results.filter((r) => r.note && !r.decision).map((r) => r.note)]);
  const own = known ? await noting(() => portGates(io, event, payload), 'port') : null; // a person's verbs, the product's own files
  const merged = core.merge([...results.map((r) => r.decision), ...(own || []), lost].filter(Boolean));
  const off = await noting(() => offOf(io, { known, results, event, payload, manifests }), 'packages');
  const told = (await noting(() => toldOf(io, { event, payload, items: merged.items, off }), 'said')) || { ...sayNow(new Map(), merged.items), plain: [] };
  const agent = core.reachedAgent(event, merged.verdict, told.sizes);
  const sum = (key) => Object.values(agent).reduce((total, row) => total + row[key], 0);
  const err = notes.size ? { code: 'hook-noted', msg: `hook-noted: ${[...notes].join(', ')}` } : null; // a run with a note says whose, never a bare failed
  await noting(() => io.trace.record({ run: io.run, step: 'hook.out', ok: !err, err, n: { handlers: results.length, ...told.n, chars: sum('said'), held: sum('held') },
    codes: { [`hook-${merged.verdict || 'none'}`]: 1, ...call.codes }, ref }), 'trace');
  await noting(() => told.sizes.forEach((s) => { // one row per item that reached the agent: whose, its key and form, its characters
    const chars = core.reachedAgent(event, merged.verdict, [s])[s.pkg].said;
    if (chars) io.trace.record({ run: io.run, step: 'hook.said', ok: true, n: { chars }, ref: { ...ref, pkg: s.pkg, key: s.key, as: s.as } });
  }), 'trace');
  const plain = [...told.plain, ...call.plain];
  const reply = core.replyOf(event, { verdict: merged.verdict, texts: told.texts, reasons: told.reasons }, [...notes], plain);
  return { reply, agent, verdict: merged.verdict, notes: [...notes], handlers: results.length };
}

/** Where the port's own read of the command fails too, it cannot tell a read, so it asks naming that failure as well. */
function askedFor(clock, event, payload, lost) {
  const until = clock.elapsedMs() + PORT_READ_MS;
  const past = () => clock.elapsedMs() > until;
  return Promise.resolve().then(() => core.lostAsk(event, payload, lost, past)).catch((err) => core.lostAsk(event, null, [...lost, `hook (${err.code || err.name})`], past));
}

async function failedReply(event, payload, note) {
  const lost = await askedFor(clock, event, payload, [note]);
  return core.replyOf(event, { verdict: lost && lost.verdict, reasons: lost ? [lost.reason] : [], texts: [] }, [note], []);
}

async function hookPort(event) {
  let payload = null;
  const opened = async () => {
    const text = await stdinText();
    const input = await hookInput(text);
    ({ payload } = input);
    return (await answer(compose({ start: (payload && payload.cwd) || process.cwd(), mode: 'hook' }), event, text, input)).reply;
  };
  // a coded failure before any handler names its case (the file it could not read), as every verb would; an uncoded one its name only
  const reply = await opened().catch((err) => failedReply(event, payload, `hook (${isFail(err) ? err.message : err.name})`));
  return Object.keys(reply).length ? `${JSON.stringify(reply)}\n` : '';
}

module.exports = { hookPort, answer, hookInput, stdinText };
