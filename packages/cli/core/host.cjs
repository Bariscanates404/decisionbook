// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: the host configuration we want, merged into and taken back out of what a repository has; a person's own row, env key, server and
// ignore line stay theirs.
const { text: { lines: { linesOf } }, host: { mcpTool, DRAFTS } } = require('@atlasbound/kit');
const { portRows } = require('./hooks.cjs');

/** Node and the file as absolute paths: no PATH, the repository's or anyone's, chooses either. */
const runs = (node, abs, before = '') => `"${node}"${before} "${abs}"`;
const PORT_TAIL = '/bin/atlasbound.cjs" hook ';
const textOf = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** Every server a package declares: its name, the arguments of this bin that start it, its tools that only read. */
const serversOf = (manifests) => manifests.filter((m) => m.mcp).flatMap(({ mcp: { servers, free = [] } }) => servers
  .map(({ name, args, tools }) => ({ name, args, free: tools.filter((tool) => free.includes(tool)) })));
/** The rules setup adds: each free verb with whatever follows it, each `alone` verb only as typed alone (its sub-verbs still ask), the
 * session's write tool in the drafts folder (from the project's root: a leading `/` in a project's settings), the read-only tools. */
const allowOf = ({ free, alone = [], bin, manifests = [] }) => [...free.map((words) => `Bash(${bin} ${words}:*)`),
  ...alone.map((words) => `Bash(${bin} ${words})`), ...['Write', 'Edit'].map((tool) => `${tool}(/${DRAFTS}**)`),
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

/** Each hook row `exec`s the one port with this machine's node; where that node is gone (a Node switch, its version removed) with the
 * node on PATH, unless that one lies in the project (`$d` its real folder: a relative PATH entry or the repository's own bin never
 * runs); only with no such node or the bin gone it prints one line and exits 0 (shell builtins only), so no row blocks the shell that
 * runs the fix. The row is POSIX sh: on Windows the host runs it in Git Bash. */
const pathNode = (projectEnv) => `n="$(command -v node)" && d="$(cd -P "\${n%/*}" 2>/dev/null && pwd -P)" && r="$(cd -P "\${${projectEnv}:-.}" `
  + '&& pwd -P)" && case "$d/" in "$r"/*) false ;; /*) true ;; *) false ;; esac';
function desiredOf({ host, bin, node, manifests }) {
  const rows = portRows(manifests).map(({ event, matcher, timeout }) => {
    const exec = `${runs(node, bin)} hook ${event}`;
    const moved = `elif [ -f "${bin}" ] && ${pathNode(host.projectEnv)}; then exec "$d/\${n##*/}" "${bin}" hook ${event}`;
    return { event, matcher, timeout, runs: exec,
      command: `if [ -x "${node}" ] && [ -f "${bin}" ]; then exec ${exec}; ${moved}; else echo '${host.rowGone}'; fi` };
  });
  const servers = Object.fromEntries(serversOf(manifests).map((server) => [server.name, { command: node, args: [bin, ...server.args] }]));
  const files = placedCommands(manifests).map((c) => ({ key: c.dest, pkg: c.pkg, src: c.src }));
  const served = Object.keys(servers).length ? [host.mcp] : []; // a server entry names this machine's paths; none: the repository's file
  const team = teamFilesOf(manifests).map((key) => `!${key}`);
  // the committed block holds what every machine of the team ignores; this machine's own files (its commands, a server entry naming its
  // paths) go to its clone's own ignore file, so a teammate with other packages leaves the committed one as git brought it
  return { rows, servers, files, ignore: [...host.ignoreEntries, ...team], exclude: [...served, ...files.map((c) => c.key)] };
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

function withoutOurs(hooks = {}, ours = (command) => command.includes(PORT_TAIL)) {
  const kept = Object.entries(hooks)
    .map(
    ([event, rows]) => [event,
    rows.map((row) => ({ ...row, hooks: (row.hooks || []).filter((h) => !ours(String(h.command))) }))
    .filter((row) => row.hooks.length)]);
  return Object.fromEntries(kept.filter(([, rows]) => rows.length));
}

function withoutRows(settings, ours) {
  const hooks = withoutOurs(settings.hooks, ours);
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

/** `notice`: the team's row (noticeOf), ours like the port's. */
function grantsOf(settings, notice) {
  const { allow = [], defaultMode } = settings.permissions || {};
  const env = Object.keys(settings.env || {}).map((key) => `env ${key}`);
  const hooks = Object.values(withoutOurs(withoutOurs(settings.hooks), notice.ours)).flat()
    .flatMap((row) => row.hooks).map((h) => `hook ${h.command}`);
  const keys = ['apiKeyHelper', 'enableAllProjectMcpServers'].filter((key) => settings[key]);
  return [...[].concat(allow).map((row) => `permissions.allow ${row}`), ...(defaultMode ? [`permissions.defaultMode ${defaultMode}`] : []), ...env, ...keys, ...hooks];
}

/** THE reader of the product's block in a .gitignore, by whole marker lines: the first end with a begin before it (a begin with no end
 * is the person's own) -> its lines (`block`, null where there is none) and every other line (`rest`). A file git checked out with
 * CRLF (Windows' autocrlf) holds the same lines. */
function ignoreParts(text, [begin, end]) {
  const lines = linesOf(String(text ?? '').replaceAll('\r\n', '\n'));
  const to = lines.findIndex((line, i) => line === end && lines.lastIndexOf(begin, i) >= 0);
  if (to < 0) return { block: null, rest: lines };
  const from = lines.lastIndexOf(begin, to);
  return { block: lines.slice(from, to + 1), rest: [...lines.slice(0, from), ...lines.slice(to + 1)] };
}

/** The final newline, or its lack, is kept so uninstall gives the same bytes; a CRLF file is written back in CRLF. */
function swapBlock(text, marks, entries) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const { rest } = ignoreParts(text, marks);
  const next = entries ? [...rest, marks[0], ...entries, marks[1]] : rest;
  return next.length ? `${next.join(eol)}${text === '' || text.endsWith('\n') ? eol : ''}` : '';
}

function driftOf(desired, actual) {
  const present = Object.entries(actual.settings.hooks || {}).flatMap(([event, rows]) => rows.flatMap((row) => (row.hooks || []).map((h) => `${event} ${row.matcher || ''} ${h.command}`)));
  const rows = desired.rows.filter((r) => !present.includes(`${r.event} ${r.matcher || ''} ${r.command}`)).map((r) => ({ what: 'hook', name: `${r.event} ${r.runs}` }));
  const wiredAs = (name) => JSON.stringify((actual.mcp.mcpServers || {})[name]);
  const servers = Object.keys(desired.servers).filter((s) => wiredAs(s) !== JSON.stringify(desired.servers[s])).map((name) => ({ what: 'mcp', name }));
  const files = desired.files.filter((f) => actual.bodies[f.key] !== actual.wanted[f.key]).map((f) => ({ what: 'file', name: f.key }));
  const ignored = linesOf(actual.ignore.replaceAll('\r\n', '\n')); // a CRLF checkout's lines are the same lines
  const ignore = desired.ignore.filter((e) => !ignored.includes(e)).map((name) => ({ what: 'ignore', name }));
  const allowed = [].concat((actual.settings.permissions || {}).allow || []);
  const allow = (desired.allow || []).filter((rule) => !allowed.includes(rule)).map((name) => ({ what: 'allow', name }));
  return [...rows, ...servers, ...files, ...ignore, ...allow];
}

module.exports = { textOf, runs, grantsOf, serversOf, placedCommands, allowOf, withAllow, desiredOf, isUnsafeRoot, teamFilesOf,
  portCommands, ownPort, withRows, withoutRows, withServers, withoutServers, ignoreParts, swapBlock, driftOf };
