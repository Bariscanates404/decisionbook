// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: what an earlier AtlasBound (the product of this name before the version words.json `leftovers.version` names) wired into a
// user's AI host, taken out of the host's own JSON, and how a person reads it. It wired every session of the user: hook rows in the host's
// user settings that run its own hooks folder (gone since, so every session in every project meets a failing hook), an MCP server named
// `atlasbound` in the host's own file, at the top and per project (this product has none), and files of its own in ~/.atlasbound: its
// sign-in key, the logs and checkpoints of what it sent, its identity and its settings, none of which this product writes. Its MCP server
// also stays in memory while the AI session that started it stays open, and writes those files back; its event store is a home folder.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS: { leftovers: W } } = require('../contracts/codes.cjs');

const OLD_HOOK = /atlasbound[^"'\s\\/]*[\\/]+engine[\\/]+hooks[\\/]/i; // the earlier product's hooks folder, either separator
const SERVER = 'atlasbound';
// in ~/.atlasbound, by name: this product keeps only its `<package>-here` folders there
const LEFT_FILES = /^(?:credentials|egress-.+|identity\.json|level\.json|demo\.json|config\.project\.cjs|update-check\.json)$/;
const OBSERVATORY = '.mcp-observatory'; // the earlier product's event store in the home: a folder per repository, and its own
// a command line of the earlier product's MCP server: its script, or its `mcp serve` verb (this product has neither), either separator
const OLD_SERVER = /(?:^|[\s"'\\/])(?:engine[\\/]+mcp[\\/]+server\.cjs|atlasbound(?:\.(?:cmd|exe|ps1))?["']?\s+mcp\s+serve)(?=["'\s]|$)/i;
// it is the installed earlier version where it runs from an installed package or is the bare command; any other folder is someone's
// own copy of the engine (a checkout: its `engine/` or the `bin/` of a folder named for the product), which is named and left alone
const OWN_COPY = /(?:^|[\s"'\\/])engine[\\/]+mcp[\\/]+server\.cjs|atlasbound[^\s"'\\/]*[\\/]+bin[\\/]+atlasbound["']?\s/i;
const INSTALLED = /node_modules[\\/]+atlasbound[\\/]/i;
/** One line of the leftovers' words, its `{slot}`s filled, the version that replaced the earlier product among them. */
const leftoversLine = (key, slots = {}) => filled(W[key], { version: W.version, ...slots });

/** The processes (kit's `running` rows) that run the earlier product's MCP server -> { earlier: the installed earlier version's,
 * copies: the ones run from a folder that is no installed package }. */
function oldServers(rows) {
  const old = rows.filter((row) => OLD_SERVER.test(row.line));
  const copy = (row) => OWN_COPY.test(row.line) && !INSTALLED.test(row.line);
  return { earlier: old.filter((row) => !copy(row)), copies: old.filter(copy) };
}

/** The settings without each hook whose command runs the earlier product's hooks folder, and how many went. */
function withoutOldHooks(settings) {
  let gone = 0;
  const hooks = Object.fromEntries(Object.entries(settings.hooks || {}).map(([event, rows]) => [event, [].concat(rows).map((row) => {
    const kept = (row.hooks || []).filter((h) => !OLD_HOOK.test(String(h.command)));
    gone += (row.hooks || []).length - kept.length;
    return { ...row, hooks: kept };
  }).filter((row) => row.hooks.length)]).filter(([, rows]) => rows.length));
  const out = { ...settings, hooks };
  if (!Object.keys(hooks).length) delete out.hooks;
  return { settings: out, gone };
}

/** The host's file without the server the earlier product named `atlasbound`, at the top (`user`) and in each project, and where it was. */
function withoutOldServer(state) {
  const where = [];
  const cut = (holder, at) => {
    if (!holder?.mcpServers || !Object.hasOwn(holder.mcpServers, SERVER)) return holder;
    where.push(at);
    return { ...holder, mcpServers: Object.fromEntries(Object.entries(holder.mcpServers).filter(([name]) => name !== SERVER)) };
  };
  const top = cut(state, 'user');
  const projects = state.projects && Object.fromEntries(Object.entries(state.projects).map(([dir, p]) => [dir, cut(p, dir)]));
  return { state: { ...top, ...(projects ? { projects } : {}) }, where };
}

/** Each process of the installed earlier version, with its id and its whole command line. */
const runningSaid = ({ earlier }) => earlier.map((row) => leftoversLine('running', { pid: row.pid, line: row.line }));

/** Each leftover as one sentence a person reads; `left.places.said` names the host's folder as they would. */
function leftoverSaid(left) {
  const at = (key) => `${left.places.said}/${key}`;
  const fileWhat = (key) => W.fileWhat[Object.keys(W.fileWhat).find((start) => key.split('/').pop().startsWith(start))] ?? 'file';
  return [
    ...runningSaid(left.running),
    ...(left.hooks.gone ? [leftoversLine('hooks', { at: at(left.places.settings), n: left.hooks.gone })] : []),
    ...(left.servers.where.length
      ? [leftoversLine('server', { at: at(left.places.state), server: SERVER, where: left.servers.where.join(', ') })] : []),
    ...left.files.map((key) => leftoversLine('file', { key, what: fileWhat(key) })),
    ...left.unread.map((why) => leftoversLine('notRead', { why }))];
}

/** What is named beside the leftovers and never taken: a copy of the earlier engine someone runs from a folder of their own (`brief`,
 * doctor's row: their ids in one sentence), and the earlier version's event store (`store`: how many folders it holds). */
function alsoSaid({ running: { copies }, store }, brief = false) {
  return [
    ...(brief && copies.length
      ? [leftoversLine('copies', { pids: copies.map((row) => row.pid).join(', '), n: copies.length, engine: W.engine })]
      : copies.map((row) => leftoversLine('copy', { pid: row.pid, engine: W.engine, line: row.line }))),
    ...(store === null ? [] : [leftoversLine('store', { store: OBSERVATORY, n: store })])];
}

/** What the person does about the leftovers: the open sessions first where the earlier version's server runs, then the verb. */
function nextSaid({ found, running: { earlier } }) {
  return [...(earlier.length ? [leftoversLine('first', { then: W.closeFirst })] : []), ...(found > earlier.length ? [W.takeOut] : [])];
}

module.exports = { withoutOldHooks, withoutOldServer, oldServers, leftoverSaid, runningSaid, alsoSaid, nextSaid, leftoversLine, LEFT_FILES,
  OBSERVATORY };
