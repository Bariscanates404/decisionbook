// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A telemetry world for the suites: kit's in-memory fs for the repository and the home, a clock a test moves, the descriptors of this
// tree as an install hands them (io.packageData), trace rows written as kit writes them, a spy port that records every dial, and the
// package's published data and pure rules the suites check against.
const fs = require('node:fs');
const path = require('node:path');
const { io: kitIo, testing: { memoryFs } } = require('@atlasbound/kit');
const telemetry = require('@atlasbound/telemetry');
// The one named exception to a black-box suite: the published contract files the suites and the server read,
// reached from the resolved entry, so `--impl` swaps them too: contracts/shapes.cjs (`WIRE`, `PATHS`, `SCHEMA`; the address row is filled there as an
// opening release fills it), contracts/wire.cjs (the report validator) and contracts/rules.cjs (the wire schema of the descriptors).
const CONTRACT = ['shapes', 'wire', 'rules'].map((name) => require(path.join(path.dirname(require.resolve('@atlasbound/telemetry')), 'contracts',
  `${name}.cjs`)));
const [{ WIRE, PATHS, SCHEMA }, { reportRefusal }, rules] = CONTRACT;
// The row as it ships, and the suites' own start: no address and nobody's default, so a case names the address and the default it is
// about (addressFilled, a suite's own withWire) and no suite can reach the real service.
const SHIPPED = Object.freeze({ ...WIRE });
Object.assign(WIRE, { url: '', forget: '', unchosen: 'ask' });

const PACKAGES = path.join(__dirname, '..', '..');
const FILE = 'contracts/telemetry.json';
const OPEN = ['cli', 'decisionbook', 'handoff', 'kit', 'telemetry'];

/** `{ name, text }` of every package here that has a descriptor; `open` keeps those the npm package ships. */
const declaredDescriptors = ({ open = false } = {}) => fs.readdirSync(PACKAGES)
  .filter((name) => fs.existsSync(path.join(PACKAGES, name, FILE)) && (!open || OPEN.includes(name)))
  .map((name) => ({ name, text: fs.readFileSync(path.join(PACKAGES, name, FILE), 'utf8') }));

/** The published data and the entry's pure rules, as the suites check against them. */
const internals = { WIRE, SHIPPED, PATHS, SCHEMA, validateReport: reportRefusal,
  schemaOf: (rows) => rules.schemaOf(rules.spacesIn({ packageData: () => rows }).spaces, WIRE) };

/** A descriptor as an install hands it. */
const descriptorRow = (name, descriptor) => ({ name, text: JSON.stringify(descriptor) });

/** A clock at `at` a test moves with `set`; its monotonic part only grows. */
function clockAt(at) {
  let now = at;
  let ms = 0;
  return { now: () => now, set: (iso) => { now = iso; }, elapsedMs: () => (ms += 5), sleep: async (wait) => { ms += wait; } };
}

/** One trace row as kit writes it. */
const kitTraceRow = (over) => ({ v: 1, pkg: 'decisionbook', run: 'cli-1', seq: 1, step: 'decisionbook.add', at: '2026-11-17T09:00:00.000Z',
  ms: 12, ok: true, in: null, out: null, n: {}, codes: {}, ref: null, err: null, ...over });
const traceLines = (rows) => `${rows.map((one) => JSON.stringify(one)).join('\n')}\n`;

/** A world at `at`; `files` the repository's, `home` the user's, `actor` who acts, `rows` the descriptors on disk. */
function telemetryWorld({ at = '2026-11-18T10:00:00.000Z', env = {}, files = {}, home = {}, actor = { who: 'terminal' },
  rows = declaredDescriptors({ open: true }) } = {}) {
  const clock = clockAt(at);
  const repo = memoryFs(files);
  const trace = kitIo.createTrace({ fs: repo, clock }).forPackage('telemetry', telemetry.vocabulary);
  return { fs: repo, home: memoryFs(home), clock, trace, run: 'cli-20261118-1', version: '0.25.2', env: { get: (name) => env[name] ?? null },
    packageData: (rel) => (rel === FILE ? rows : []), proc: { pid: () => 4242, alive: () => true }, actor: () => actor };
}

/** A world whose person turned on every namespace (or `names`) at `at`, moved to `then`, with these trace rows. */
async function turnedOnWorld({ trace = [], files = {}, at = '2026-11-17T08:00:00.000Z', then = '2026-11-18T10:00:00.000Z', names = [],
  ...over } = {}) {
  const io = telemetryWorld({ at, files: { '.atlasbound/trace/cli-1.ndjson': traceLines(trace), ...files }, ...over });
  await telemetry.optIn(io, { rest: names, ask: async () => true });
  io.clock.set(then);
  return io;
}

/** A port that records each dial and answers `reply(body, n)` (default: every report stored). */
function spyPort(reply = null) {
  const calls = [];
  const stored = (body) => ({ status: 200, retryAfterS: null,
    text: JSON.stringify({ results: JSON.parse(body).reports.map((one) => ({ id: one.id, status: 'stored' })) }) });
  return { calls, post: async (url, body) => {
    calls.push({ url, body });
    return (reply ?? stored)(body, calls.length);
  } };
}

/** The address filled for one suite, as an opening release would (the row is data: no env var, flag or argument reaches it). */
function addressFilled(url = 'https://telemetry.example/v1/reports', forget = 'https://telemetry.example/v1/forget') {
  Object.assign(WIRE, { url, forget });
}

module.exports = { FILE, internals, declaredDescriptors, descriptorRow, kitTraceRow, traceLines, telemetryWorld, turnedOnWorld, spyPort, addressFilled };
