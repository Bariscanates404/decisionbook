// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
const { paths, trace: { TRACE_DIR }, child: { SELF_ENV }, text: { lines: { filled } } } = require('@atlasbound/kit');
const validate = require('../contracts/validate.cjs');
const { STORE } = require('../contracts/shapes.cjs');
const { PRODUCT } = require('../contracts/verbs.cjs');
const { portCommands, ownPort, runs, serversOf } = require('../core/host.cjs');
const { reached } = require('../core/hooks.cjs');
const { saidFailure, errorLine, firstLine } = require('./failure.cjs');
const { shortOf, WORDS: { probes: W } } = require('../contracts/codes.cjs');
const { releaseProbe } = require('./release.cjs');
const { platformOf } = require('../core/windows.cjs');
const { leftoversOf } = require('./leftovers.cjs');
const { leftoverSaid, alsoSaid, nextSaid, leftoversLine } = require('../core/leftovers.cjs');

const SELF_CHECK = { [SELF_ENV]: '1' };
const SESSION = 'atlasbound-doctor-probe';
const WAIT_MS = 15000; // a child answers at once, 15 s is a slow cold start; asked in turn, five stuck ones hold doctor ~75 s
const HOME_PROBE = '.atlasbound-doctor-probe';
const STORE_DEPTH = 3; // ~/.atlasbound, a package's folder, a repository's folder in it: the folders kit's private fs makes
const HOOK_IN = 'hook.in'; // the trace step of what the host sent the port

const measured = (says) => ({ state: 'measured', says });
const failed = (says) => ({ state: 'failed', says });
const unmeasured = (says) => ({ state: 'not-measured', says });
const whyNot = (res) => res.error || res.killedBy || filled(W.exit, { code: res.code, line: firstLine(res.stderr) });

/** One child of a probe; `marks`: what its starter hands it besides the env it keeps (the self-check's). */
const ask = (io, cmd, args, { stdin = '', marks = {} } = {}) => io.proc.run({ cmd, args, stdin, cwd: io.root, timeoutMs: WAIT_MS,
  env: { ...paths.childEnv(io.env, platformOf(io.machine).env, io.root), ...marks } });

const nodeProbe = ({ machine: { node, floor } }) => (floor ? measured(filled(W.floor, { node, floor }))
  : unmeasured(filled(W.noFloor, { node })));

async function gitProbe(io) {
  const res = await ask(io, 'git', ['--version']);
  return res.code === 0 ? measured(firstLine(res.stdout)) : failed(filled(W.git, { why: whyNot(res) }));
}

async function pathsProbe(io) {
  const { portRun, started } = platformOf(io.machine);
  const { cmd, args } = portRun(io.machine, `${runs(io.machine.exec, io.machine.bin)} --version`, ['--version']);
  const res = await ask(io, cmd, args);
  if (res.code !== 0 || firstLine(res.stdout) !== io.version) return failed(filled(W.notStarted, { why: whyNot(res) }));
  return measured(filled(W.paths, { spaces: [io.root, io.machine.bin].some((p) => p.includes(' ')) ? W.space : W.noSpace, started }));
}

/** the top-most folder of the product's home store (a package's folder, a repository's in it) open to others than the user, or null. */
function widerStore(fs) {
  const folders = [[paths.OWN_STORE.slice(0, -1), STORE_DEPTH]]; // breadth first, so the top-most is named
  for (const [key, depth] of folders) {
    const mode = fs.modeOf(key);
    const names = fs.list(key);
    if (names !== null && mode & 0o077) return filled(W.wider, { key, mode: mode.toString(8) });
    if (names !== null && depth > 1) folders.push(...names.map((name) => [`${key}/${name}`, depth - 1]));
  }
  return null;
}

function homeProbe({ env, machine }) { // a folder's mode bits say nothing on Windows: no "open to others" there
  const home = env.userHome(); // the user record's, the folder the product writes; Windows sets no HOME at a plain terminal
  if (!home) return unmeasured(W.noHome);
  if (machine.fsAt(paths.parentDir(home)).list(paths.nameOf(home)) === null) return failed(filled(W.homeMissing, { home }));
  const fs = machine.fsAt(home);
  fs.writeAtomic(HOME_PROBE, '');
  fs.remove(HOME_PROBE);
  return measured([filled(W.writable, { home }), platformOf(machine).modes ? widerStore(fs) : null].filter(Boolean).join('\n    '));
}

/** The bare word a person types, started as their platform finds it: on Windows through PATH and PATHEXT (npm's shim is a .cmd, which
 * node starts only through cmd.exe). */
function onPathAsk(io) {
  const { env, onPath } = platformOf(io.machine);
  const has = (dir, name) => io.machine.fsAt(dir).exists(name);
  const found = onPath(PRODUCT, Object.fromEntries(env.map((key) => [key, io.env.get(key)])), has, io.root);
  return found ? ask(io, found.cmd, [...found.args, '--version']) : { error: 'ENOENT' };
}

async function onPathProbe(io) {
  const res = await onPathAsk(io);
  if (res.error === 'ENOENT') return unmeasured(filled(W.notOnPath, { product: PRODUCT }));
  if (res.code !== 0) return failed(filled(W.pathSilent, { product: PRODUCT, why: whyNot(res) }));
  const seen = firstLine(res.stdout);
  if (io.version === 'unknown') return unmeasured(filled(W.pathUnknown, { product: PRODUCT, seen }));
  if (seen === io.version) return measured(seen);
  return failed(filled(W.pathOther, { product: PRODUCT, seen, version: io.version }));
}

function hooksProbe({ fs }, { plan }) {
  if (!portCommands(plan.settings).length) return unmeasured(W.noHookRow);
  for (const day of (fs.list(TRACE_DIR) || []).filter((name) => name.startsWith('hooks-')).reverse()) {
    const fired = (fs.readText(`${TRACE_DIR}/${day}`) || '').split('\n').map((line) => validate.jsonOrNull(line)) // a line that reads
      .filter((row) => row && row.step === HOOK_IN && row.ref?.session !== SESSION); // and is no question of doctor's own
    if (fired.length) return measured(filled(W.fired, { at: fired.at(-1).at }));
  }
  return unmeasured(W.notFired);
}

/** One handshake per server, as its entry starts it: a silent, misnamed or other-version one is a problem; one listing no tool holds
 * nothing here yet, said in its own instructions. */
async function handshakeOf(io, server, handshake) {
  const asked = `${handshake}${JSON.stringify({ ...validate.jsonOrNull(handshake), id: 2, method: 'tools/list', params: {} })}\n`; // the server's envelope
  const res = await ask(io, io.machine.exec, [io.machine.bin, ...server.args], { stdin: asked, marks: SELF_CHECK });
  if (!res.stdout.trim()) return { problem: filled(W.noAnswer, { name: server.name, why: whyNot(res) }) };
  const [init, list] = res.stdout.trim().split('\n').map((line) => validate.json(line).result);
  const { name, version } = init?.serverInfo ?? {};
  if (name !== server.name || version !== io.version) {
    return { problem: filled(W.serverInfo, { name: server.name, got: name, gotVersion: version, version: io.version }) };
  }
  return { empty: list?.tools?.length === 0 ? filled(W.empty, { name: server.name, instructions: init.instructions, fine: shortOf('server-empty-fine') }) : null };
}

async function mcpProbe(io, { manifests }) {
  const owner = manifests.find((m) => m.mcp);
  if (!owner) return null; // no module on here has a server: no row
  if (io.fs.list(STORE) === null) return unmeasured(W.noStore);
  const { handshake } = io.packages.load(owner.name);
  if (!handshake) return unmeasured(filled(W.noHandshake, { name: owner.name }));
  const servers = serversOf([owner]);
  const shakes = await Promise.all(servers.map((server) => handshakeOf(io, server, handshake)));
  const first = shakes.find((s) => s.problem);
  return first ? failed(first.problem) : measured([filled(W.servers, { version: io.version, names: servers.map((s) => s.name).join(', ') }), ...shakes.map((s) => s.empty).filter(Boolean)].join('\n    '));
}

/** The gates an edit reaches, each by its manifest's own name, and the verbs they name for asking about one file (wired ones only). */
function gatesOf(manifests) {
  const reachedBy = new Set(reached(manifests, 'PreToolUse', { tool_name: 'Edit' }).map((d) => d.pkg));
  const gating = manifests.filter((m) => reachedBy.has(m.name));
  const asks = gating.map((m) => m.gate?.ask).filter(Boolean).map((ask) => `; ${ask}`).join('');
  return { names: [...new Set(gating.map((m) => m.gate?.name ?? filled(W.gateName, { name: m.name })))], asks };
}

/** Silence is the port's allow and a failure its visible line, so the two never read alike; the command run is this install's row, never
 * the settings file's. */
async function gateProbe(io, { plan, manifests }) {
  const wired = portCommands(plan.settings, 'PreToolUse');
  if (!wired.length) return unmeasured(W.noGateRow);
  const command = ownPort(plan.desired, 'PreToolUse');
  if (wired.some((row) => row !== command)) return unmeasured(W.notOurs);
  const { names: gates, asks } = gatesOf(manifests);
  if (!gates.length) return unmeasured(W.noGate);
  const payload = { session_id: SESSION, cwd: io.root, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: `${io.root}/${io.host.gateProbe}`, old_string: '', new_string: '' } };
  const { cmd, args } = platformOf(io.machine).portRun(io.machine, command, ['hook', 'PreToolUse']);
  const res = await ask(io, cmd, args, { stdin: JSON.stringify(payload), marks: SELF_CHECK }); // its rows are the self-check's
  if (res.code !== 0) return failed(filled(W.hookSilent, { why: whyNot(res) }));
  const reply = res.stdout.trim() ? validate.json(firstLine(res.stdout)) : {};
  if (reply.systemMessage) return failed(reply.systemMessage.replace(`${PRODUCT}: `, ''));
  const verdict = (reply.hookSpecificOutput || {}).permissionDecision || 'allow';
  return measured(filled(W.answered, { verdict, gates: gates.join(' and '), reads: gates.length > 1 ? W.bothRead : W.reads, asks }));
}

/** Setup keeps the files that name this machine out of git by name (in the team's block or this clone's own); git is asked whether it
 * does, and a rule that brings one back (a nested `!*`) is named. */
async function ignoredProbe(io, { plan }) {
  const named = [...plan.desired.ignore, ...plan.desired.exclude].filter((entry) => ![...'!*?['].some((char) => entry.includes(char)) && io.fs.exists(entry));
  if (!named.length) return unmeasured(W.noIgnored);
  const loose = await io.git.unignored(named);
  if (!loose.length) return measured(filled(W.ignored, { n: named.length }));
  return failed(filled(W.defeated, { files: loose.map((l) => `${l.key}${l.by ? ` (${l.by})` : ''}`).join(', '), short: shortOf('ignore-defeated') }));
}

/** The team's row in the project's settings, and whether git holds it as it is. */
async function noticeProbe(io) {
  const file = io.host.noticeFile;
  const was = io.host.notice();
  if (was === 'unread') return failed(filled(W.noticeBroken, { file }));
  if (was !== 'current') return measured(filled(was === 'older' ? W.noticeOld : W.noticeNone, { file }));
  const [tracked, status] = await Promise.all([io.git.tracked([file]), io.git.statusZ()]);
  const committed = tracked.length > 0 && !status.some((row) => row.key === file);
  return measured(filled(W.noticeOn, { file, committed: committed ? W.noticeCommitted : W.noticeLoose }));
}

/** What an earlier AtlasBound left in this user's home: a problem while anything is left (its hooks fail in every session, its
 * server still running writes its files back); what stands beside it is named and is no problem. */
function leftoversProbe(io) {
  const left = leftoversOf(io);
  if (!left) return unmeasured(leftoversLine('noHome'));
  const beside = alsoSaid(left, true);
  if (left.found) return failed([...leftoverSaid(left), ...beside, ...nextSaid(left)].join('; '));
  return left.unread.length ? unmeasured([...left.unread, ...beside].join('; ')) : measured([leftoversLine('probeNone'), ...beside].join('; '));
}

const PROBES = [['node', nodeProbe], ['git', gitProbe], ['paths', pathsProbe], ['home', homeProbe], ['on PATH', onPathProbe], ['hooks firing', hooksProbe],
  ['mcp handshake', mcpProbe], ['gate answering', gateProbe], ['git ignores', ignoredProbe], ['team notice', noticeProbe],
  ['release files', releaseProbe], ['leftovers', leftoversProbe]];

/** One after the other: `hooks firing` reads the trace before the gate probe writes to it. */
async function probed(context, io) {
  const rows = [];
  for (const [name, probe] of PROBES) {
    const row = await Promise.resolve().then(() => probe(io, context)).catch((err) => failed(errorLine(err)));
    if (row) rows.push({ name, ...row });
  }
  const named = (state) => rows.filter((r) => r.state === state);
  return { out: rows, n: { measured: named('measured').length, failed: named('failed').length, notMeasured: named('not-measured').length }, codes: {}, ref: { failed: named('failed').map((r) => r.name) } };
}

/** What this machine lacks for a package on here, in its provider's words (the answer `advice`); none while nothing provides it. */
const adviceOf = (io) => Promise.resolve().then(async () => (await io.answer('advice')) ?? [])
  .catch((err) => [filled(W.lacks, { code: err.code || err.name })]);

/** The one line of the answer `hint` (telemetry's) for setup and doctor, or null; never where no person reads the lines (--json). `asks`:
 * setup hands it the terminal's question, for a person sitting there; update and doctor never do. */
const hintOf = (io, flags, asks = false) => Promise.resolve().then(async () => {
  const lines = flags && !flags.json;
  const ask = asks && lines && io.terminal.on ? io.terminal.ask : null;
  return lines ? (await io.answer('hint', { ask }))?.line ?? null : null;
}).catch((err) => {
  saidFailure(io, 'probes', 'hint-unread', err); // the record keeps it; a hint that cannot be had is no line
  return null;
});

module.exports = { probed, adviceOf, hintOf, ignoredProbe };
