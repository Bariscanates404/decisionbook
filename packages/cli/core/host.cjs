// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: the host configuration we want, merged into and taken back out of what a repository has; a person's own row, env key, server and
// ignore line stay theirs.
const { text: { lines: { linesOf } }, host: { mcpTool } } = require('@atlasbound/kit');
const { portRows } = require('./hooks.cjs');

/** Node and the file as absolute paths: no PATH, the repository's or anyone's, chooses either. */
const runs = (node, abs, before = '') => `"${node}"${before} "${abs}"`;
const PORT_TAIL = '/bin/atlasbound.cjs" hook ';
const textOf = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** Every server a package declares: its name, the arguments of this bin that start it, its tools that only read. */
const serversOf = (manifests) => manifests.filter((m) => m.mcp).flatMap(({ mcp: { servers, free = [] } }) => servers
  .map(({ name, args, tools }) => ({ name, args, free: tools.filter((tool) => free.includes(tool)) })));
const allowOf = ({ free, bin, manifests = [] }) => [...free.map((words) => `Bash(${bin} ${words}:*)`),
  ...serversOf(manifests).flatMap((server) => server.free.map((tool) => mcpTool(server.name, tool)))];

function withAllow(settings, wanted, recorded = []) {
  const { allow = [], ...rest } = settings.permissions || {};
  const theirs = [].concat(allow).filter((rule) => !recorded.includes(rule));
  const added = wanted.filter((rule) => !theirs.includes(rule));
  const permissions = { ...rest, ...(theirs.length + added.length ? { allow: [...theirs, ...added] } : {}) };
  const out = { ...settings, permissions };
  if (!Object.keys(permissions).length) delete out.permissions;
  return { settings: out, added };
}

/** The command files a wired set places, each with its package: a row naming `with` only beside that package, one naming `without` only
 * while that package is not wired. */
function placedCommands(manifests) {
  const wired = (name) => manifests.some((m) => m.name === name);
  return manifests.flatMap((m) => (m.commands || []).filter((c) => (!c.with || wired(c.with)) && !(c.without && wired(c.without)))
    .map((c) => ({ ...c, pkg: m.name })));
}

/** The paths in the product's store a team commits, as these manifests declare them (`teamFiles`). */
const teamFilesOf = (manifests) => [...new Set(manifests.flatMap((m) => m.teamFiles ?? []))];

/** Each hook row `exec`s the one port; with either file gone it prints one line and exits 0 (shell builtins only), so no row blocks the
 * shell that runs the fix. */
function desiredOf({ host, bin, node, manifests }) {
  const rows = portRows(manifests).map(({ event, matcher, timeout }) => {
    const exec = `${runs(node, bin)} hook ${event}`;
    return { event, matcher, timeout, runs: exec, command: `[ -x "${node}" ] && [ -f "${bin}" ] && exec ${exec}; echo '${host.rowGone}'` };
  });
  const servers = Object.fromEntries(serversOf(manifests).map((server) => [server.name, { command: node, args: [bin, ...server.args] }]));
  const files = placedCommands(manifests).map((c) => ({ key: c.dest, pkg: c.pkg, src: c.src }));
  return { rows, servers, files, ignore: [...host.ignoreEntries, ...teamFilesOf(manifests).map((key) => `!${key}`), ...files.map((c) => c.key)] };
}

/** `/private` is macOS's real spelling of `/tmp` and `/var`, so both spellings are one directory. */
function isUnsafeRoot(host, root, envDirs) {
  const spelled = (dir) => dir.replace(/\/+$/, '').replace(/^\/private\//, '/');
  return [...host.unsafeRoots.paths, ...envDirs.filter(Boolean)].map(spelled).includes(spelled(root));
}


function portCommands(settings, event = '') {
  const commands = Object.values(settings.hooks || {}).flat().flatMap((row) => row.hooks || []).map((h) => String(h.command));
  return commands.filter((command) => command.includes(`${PORT_TAIL}${event}`));
}

const ownPort = (desired, event) => desired.rows.find((row) => row.command.includes(`${PORT_TAIL}${event}`))?.command ?? null;

function withoutOurs(hooks = {}) {
  const kept = Object.entries(hooks)
    .map(
    ([event, rows]) => [event,
    rows.map((row) => ({ ...row, hooks: (row.hooks || []).filter((h) => !String(h.command).includes(PORT_TAIL)) }))
    .filter((row) => row.hooks.length)]);
  return Object.fromEntries(kept.filter(([, rows]) => rows.length));
}

function withoutRows(settings) {
  const hooks = withoutOurs(settings.hooks);
  const out = { ...settings, hooks };
  if (!Object.keys(hooks).length) delete out.hooks;
  return Object.keys(out).length ? out : null;
}

/** The file keeps its own key order, so a second setup writes the same bytes. */
function withRows(settings, desired) {
  const hooks = { ...(withoutRows(settings) || {}).hooks };
  desired.rows.forEach(({ event, matcher, command, timeout }) => {
    hooks[event] = [...(hooks[event] || []), { ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command, timeout }] }];
  });
  return { ...settings, hooks };
}

const withServers = (mcp, servers) => ({ ...mcp, mcpServers: { ...mcp.mcpServers, ...servers } });

function withoutServers(mcp, names) {
  const left = Object.fromEntries(Object.entries(mcp.mcpServers || {}).filter(([name]) => !names.includes(name)));
  const out = { ...mcp, mcpServers: left };
  if (!Object.keys(left).length) delete out.mcpServers;
  return Object.keys(out).length ? out : null;
}

function grantsOf(settings) {
  const { allow = [], defaultMode } = settings.permissions || {};
  const env = Object.keys(settings.env || {}).map((key) => `env ${key}`);
  const hooks = Object.values(withoutOurs(settings.hooks)).flat().flatMap((row) => row.hooks).map((h) => `hook ${h.command}`);
  const keys = ['apiKeyHelper', 'enableAllProjectMcpServers'].filter((key) => settings[key]);
  return [...[].concat(allow).map((row) => `permissions.allow ${row}`), ...(defaultMode ? [`permissions.defaultMode ${defaultMode}`] : []), ...env, ...keys, ...hooks];
}

/** The block is found by whole marker lines (a begin with no end is the person's own); the final newline, or its lack, is kept so uninstall
 * gives the same bytes. */
function swapBlock(text, [begin, end], entries) {
  const body = linesOf(text);
  const to = body.findIndex((line, i) => line === end && body.lastIndexOf(begin, i) >= 0);
  const kept = to < 0 ? body : [...body.slice(0, body.lastIndexOf(begin, to)), ...body.slice(to + 1)];
  const next = entries ? [...kept, begin, ...entries, end] : kept;
  return next.length ? `${next.join('\n')}${text === '' || text.endsWith('\n') ? '\n' : ''}` : '';
}

function driftOf(desired, actual) {
  const present = Object.entries(actual.settings.hooks || {}).flatMap(([event, rows]) => rows.flatMap((row) => (row.hooks || []).map((h) => `${event} ${row.matcher || ''} ${h.command}`)));
  const rows = desired.rows.filter((r) => !present.includes(`${r.event} ${r.matcher || ''} ${r.command}`)).map((r) => ({ what: 'hook', name: `${r.event} ${r.runs}` }));
  const wiredAs = (name) => JSON.stringify((actual.mcp.mcpServers || {})[name]);
  const servers = Object.keys(desired.servers).filter((s) => wiredAs(s) !== JSON.stringify(desired.servers[s])).map((name) => ({ what: 'mcp', name }));
  const files = desired.files.filter((f) => actual.bodies[f.key] !== actual.wanted[f.key]).map((f) => ({ what: 'file', name: f.key }));
  const ignored = linesOf(actual.ignore);
  const ignore = desired.ignore.filter((e) => !ignored.includes(e)).map((name) => ({ what: 'ignore', name }));
  const allowed = [].concat((actual.settings.permissions || {}).allow || []);
  const allow = (desired.allow || []).filter((rule) => !allowed.includes(rule)).map((name) => ({ what: 'allow', name }));
  return [...rows, ...servers, ...files, ...ignore, ...allow];
}

module.exports = { textOf, runs, grantsOf, serversOf, placedCommands, allowOf, withAllow, desiredOf, isUnsafeRoot, teamFilesOf,
  portCommands, ownPort, withRows, withoutRows, withServers, withoutServers, swapBlock, driftOf };
