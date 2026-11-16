// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// doctor's machine check, one row per probe; the gate probe asks as its own session, so `hooks firing` never counts doctor's own question.
const { paths, trace: { TRACE_DIR } } = require('@atlasbound/kit');
const validate = require('../contracts/validate.cjs');
const { STORE } = require('../contracts/shapes.cjs');
const { PRODUCT } = require('../contracts/verbs.cjs');
const { portCommands, ownPort, runs, serversOf } = require('../core/host.cjs');
const { reached } = require('../core/hooks.cjs');
const { saidFailure, errorLine } = require('./failure.cjs');
const { shortOf } = require('../contracts/codes.cjs');
const { releaseProbe } = require('./release.cjs');

const SESSION = 'atlasbound-doctor-probe';
const WAIT_MS = 15000;
const HOME_PROBE = '.atlasbound-doctor-probe';
const STORE_DEPTH = 3; // ~/.atlasbound, a package's folder, a repository's folder in it: the folders kit's private fs makes
const HOOK_IN = '"step":"hook.in"';
const SHELL = '/bin/sh';

const measured = (says) => ({ state: 'measured', says });
const failed = (says) => ({ state: 'failed', says });
const unmeasured = (says) => ({ state: 'not-measured', says });
const firstLine = (text) => String(text).trim().split('\n')[0];
const whyNot = (res) => res.error || res.killedBy || `exit ${res.code}: ${firstLine(res.stderr)}`;

const ask = (io, cmd, args, stdin = '') => io.proc.run({ cmd, args, stdin, env: paths.childEnv(io.env, ['PATH', 'HOME'], io.root), cwd: io.root, timeoutMs: WAIT_MS });

const nodeProbe = ({ machine: { node, floor } }) => (floor ? measured(`${node}, floor ${floor}`) : unmeasured(`${node}: no floor found`));

async function gitProbe(io) {
  const res = await ask(io, 'git', ['--version']);
  return res.code === 0 ? measured(firstLine(res.stdout)) : failed(`git: ${whyNot(res)}`);
}

async function pathsProbe(io) {
  const res = await ask(io, SHELL, ['-c', `${runs(io.machine.exec, io.machine.bin)} --version`]);
  if (res.code !== 0 || firstLine(res.stdout) !== io.version) return failed(`the quoted command did not start: ${whyNot(res)}`);
  return measured(`${[io.root, io.machine.bin].some((p) => p.includes(' ')) ? 'a space in the path' : 'no space in the paths'}, the quoted command starts`);
}

/** the top-most folder of the product's home store (a package's folder, a repository's in it) open to others than the user, or null. */
function widerStore(fs) {
  const folders = [[paths.OWN_STORE.replace(/\/$/u, ''), STORE_DEPTH]]; // breadth first, so the top-most is named
  for (const [key, depth] of folders) {
    const mode = fs.modeOf(key);
    const names = fs.list(key);
    if (names !== null && mode & 0o077) return `~/${key} is open to others (${mode.toString(8)}), wider than private (700): the product's next write there tightens it`;
    if (names !== null && depth > 1) folders.push(...names.map((name) => [`${key}/${name}`, depth - 1]));
  }
  return null;
}

function homeProbe({ env, machine }) {
  const home = env.get('HOME');
  if (!home) return unmeasured('HOME is not set');
  if (machine.fsAt(paths.parentDir(home)).list(paths.nameOf(home)) === null) return failed(`${home} does not exist`);
  const fs = machine.fsAt(home);
  fs.writeAtomic(HOME_PROBE, '');
  fs.remove(HOME_PROBE);
  return measured([`${home} is writable`, widerStore(fs)].filter(Boolean).join('\n    '));
}

async function onPathProbe(io) {
  const res = await ask(io, PRODUCT, ['--version']);
  if (res.error === 'ENOENT') return unmeasured(`no ${PRODUCT} on PATH`);
  if (res.code !== 0) return failed(`${PRODUCT} on PATH did not answer: ${whyNot(res)}`);
  const seen = firstLine(res.stdout);
  if (io.version === 'unknown') return unmeasured(`${PRODUCT} on PATH is ${seen}; this install states no version`);
  if (seen === io.version) return measured(seen);
  return failed(`${PRODUCT} on PATH is ${seen}, this install is ${io.version}: install ${PRODUCT} ${io.version} again`);
}

function hooksProbe({ fs }, { plan }) {
  if (!portCommands(plan.settings).length) return unmeasured('not wired: no hook row in the settings');
  for (const day of (fs.list(TRACE_DIR) || []).filter((name) => name.startsWith('hooks-')).reverse()) {
    const lines = (fs.readText(`${TRACE_DIR}/${day}`) || '').split('\n').filter((line) => line.includes(HOOK_IN) && !line.includes(SESSION));
    const at = lines.length ? /"at":"([^"]+)"/.exec(lines[lines.length - 1]) : null;
    if (at) return measured(`last fired ${at[1]}`);
  }
  return unmeasured('no hook has fired here yet; restart the AI session so the host picks them up');
}

/** One handshake per server, as its entry starts it: a silent, misnamed or other-version one is a problem; one listing no tool holds
 * nothing here yet, said in its own instructions. */
async function handshakeOf(io, server, handshake) {
  const asked = `${handshake}${JSON.stringify({ ...validate.jsonOrNull(handshake), id: 2, method: 'tools/list', params: {} })}\n`; // the server's envelope
  const res = await ask(io, io.machine.exec, [io.machine.bin, ...server.args], asked);
  if (!res.stdout.trim()) return { problem: `${server.name}: no answer: ${whyNot(res)}` };
  const [init, list] = res.stdout.trim().split('\n').map((line) => validate.json(line).result);
  const { name, version } = init?.serverInfo ?? {};
  if (name !== server.name || version !== io.version) return { problem: `${server.name}: serverInfo ${name} ${version}, this install is ${io.version}` };
  return { empty: list?.tools?.length === 0 ? `${server.name}: ${init.instructions} (${shortOf('server-empty-fine')})` : null };
}

async function mcpProbe(io, { manifests }) {
  const owner = manifests.find((m) => m.mcp);
  if (!owner) return null; // no module on here has a server: no row
  if (io.fs.list(STORE) === null) return unmeasured('not wired: the server would make a folder here for its trace');
  const { handshake } = io.packages.load(owner.name);
  if (!handshake) return unmeasured(`${owner.name} publishes no handshake`);
  const servers = serversOf([owner]);
  const shakes = await Promise.all(servers.map((server) => handshakeOf(io, server, handshake)));
  const first = shakes.find((s) => s.problem);
  return first ? failed(first.problem) : measured([`serverInfo ${io.version}: ${servers.map((s) => s.name).join(', ')}`, ...shakes.map((s) => s.empty).filter(Boolean)].join('\n    '));
}

/** The gates an edit reaches, each by its manifest's own name, and the verbs they name for asking about one file (wired ones only). */
function gatesOf(manifests) {
  const reachedBy = new Set(reached(manifests, 'PreToolUse', { tool_name: 'Edit' }).map((d) => d.pkg));
  const gating = manifests.filter((m) => reachedBy.has(m.name));
  const asks = gating.map((m) => m.gate?.ask).filter(Boolean).map((ask) => `; ${ask}`).join('');
  return { names: [...new Set(gating.map((m) => m.gate?.name ?? `${m.name}'s gate`))], asks };
}

/** Silence is the port's allow and a failure its visible line, so the two never read alike; the command run is this install's row, never
 * the settings file's. */
async function gateProbe(io, { plan, manifests }) {
  const wired = portCommands(plan.settings, 'PreToolUse');
  if (!wired.length) return unmeasured('not wired: no gate row in the settings');
  const command = ownPort(plan.desired, 'PreToolUse');
  if (wired.some((row) => row !== command)) return unmeasured('not measured: a row not ours');
  const { names: gates, asks } = gatesOf(manifests);
  if (!gates.length) return unmeasured('not measured: no module on here gates an edit');
  const payload = { session_id: SESSION, cwd: io.root, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: `${io.root}/${io.host.gateProbe}`, old_string: '', new_string: '' } };
  const res = await ask(io, SHELL, ['-c', command], JSON.stringify(payload));
  if (res.code !== 0) return failed(`the hook did not answer: ${whyNot(res)}`);
  const reply = res.stdout.trim() ? validate.json(firstLine(res.stdout)) : {};
  if (reply.systemMessage) return failed(reply.systemMessage.replace(`${PRODUCT}: `, ''));
  const verdict = (reply.hookSpecificOutput || {}).permissionDecision || 'allow';
  return measured(`the port answered ${verdict} for a file no plan names (${gates.join(' and ')} ${gates.length > 1 ? 'both read' : 'reads'} it)${asks}`);
}

/** Setup keeps the files that name this machine out of git by name; git is asked whether it does, and a rule that brings one back (a nested
 * `!*`) is named. */
async function ignoredProbe(io, { plan }) {
  const named = plan.desired.ignore.filter((entry) => !/[!*?[]/.test(entry) && io.fs.exists(entry));
  if (!named.length) return unmeasured('not wired: none of the files setup keeps out of git is here');
  const loose = await io.git.unignored(named);
  if (!loose.length) return measured(`git ignores the ${named.length} files setup keeps out of it`);
  return failed(`ignore-defeated: ${loose.map((l) => `${l.key}${l.by ? ` (${l.by})` : ''}`).join(', ')}: ${shortOf('ignore-defeated')}`);
}

const PROBES = [['node', nodeProbe], ['git', gitProbe], ['paths', pathsProbe], ['home', homeProbe], ['on PATH', onPathProbe], ['hooks firing', hooksProbe],
  ['mcp handshake', mcpProbe], ['gate answering', gateProbe], ['git ignores', ignoredProbe], ['release files', releaseProbe]];

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
  .catch((err) => [`not measured, what this machine lacks: ${err.code || err.name}`]);

/** The one line of the answer `hint` (telemetry's, said only to a person) for setup and doctor, or null; never where no person reads the
 * lines (--json). */
const hintOf = (io, flags) => Promise.resolve().then(async () => {
  const lines = flags && !flags.json;
  return lines ? (await io.answer('hint', {}))?.line ?? null : null;
}).catch((err) => {
  saidFailure(io, 'probes', 'hint-unread', err); // the record keeps it; a hint that cannot be had is no line
  return null;
});

module.exports = { probed, adviceOf, hintOf, ignoredProbe };
