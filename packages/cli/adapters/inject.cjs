// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// debug inject's driver: a scripted session through THE hook port's answer, on a copy of this repository in a scratch folder with a scratch
// home, so nothing a handler writes (plans, promises, handoff drafts, receipts, the said record) lands here; the
// copy goes unless --keep.
const { PassThrough } = require('node:stream');
const { errors: { fail }, paths, text: { lines: { filled } } } = require('@atlasbound/kit');
const validate = require('../contracts/validate.cjs');
const { WORDS: { adapters: W } } = require('../contracts/codes.cjs');
const { serversOf } = require('../core/host.cjs');
const { payloadsOf, mcpOf, injectView } = require('../debug/inject.cjs');
const { compose } = require('./compose.cjs');
const { answer, hookInput } = require('./hook.cjs');

/** The repository's files, its git and its ignored state (.atlasbound, .decisionbook, .claude), node_modules apart: what a hook reads. */
function copyOf(io) {
  const { dir, copy, remove } = io.machine.scratch('atlasbound-inject-');
  copy(io.root, 'repo', ['node_modules']);
  io.machine.fsAt(dir).makeDir('home');
  return { remove, root: `${dir}/repo`, home: `${dir}/home` };
}

/** The package whose manifest declares the MCP server, of those wired here, or null. */
const serverOwner = (io) => io.packages.declared().manifests.find((m) => m.mcp)?.name ?? null;

/** The flags a server's arguments hand its verb (`--name value`), as argv reads them. */
const flagsOf = (args) => Object.fromEntries(args.flatMap((arg, i) => (arg.startsWith('--') ? [[arg.slice(2), args[i + 1] ?? true]] : [])));

/** One MCP server of the copy, spoken to as a client would: the server package's handshake sent as it exports it, never parsed, then each
 * message; the replies. */
async function speak(io, server, messages) {
  const owner = serverOwner(io);
  const { serve, handshake } = io.packages.load(owner);
  const first = typeof handshake === 'string' && handshake.endsWith('\n') ? validate.jsonOrNull(handshake.split('\n')[0]) : null; // the envelope
  if (!first) {
    throw fail('inject-handshake-unread', filled(W.handshake, { owner, what: typeof handshake === 'string' ? W.noJsonFirst : typeof handshake }));
  }
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks = [];
  output.on('data', (c) => chunks.push(c));
  input.end(`${handshake}${messages.map((m, i) => `${JSON.stringify({ ...first, id: i + 2, ...m })}\n`).join('')}`);
  await serve(io.packages.ioFor(owner), { flags: flagsOf(server.args), input, output, stderr: new PassThrough() });
  return Buffer.concat(chunks).toString('utf8').split('\n').map(validate.jsonOrNull).filter(Boolean);
}

// what a client holds for the session, in bytes: each whole tools/list entry as sent, and the instructions
async function standingOf(io, servers) {
  return Promise.all(servers.map(async (server) => {
    const [init, list] = await speak(io, server, [{ method: 'tools/list', params: {} }]);
    const tools = (list?.result?.tools || []).reduce((n, t) => n + Buffer.byteLength(JSON.stringify(t)), 0);
    return { server: server.name, instructions: Buffer.byteLength(init?.result?.instructions || ''), tools };
  }));
}

/** An MCP call of the script: the server's reply text is said to the agent as its owner package's, when that server is wired here. */
async function toolReply(io, servers, payload) {
  const named = payload.hook_event_name === 'PostToolUse' && mcpOf(payload.tool_name);
  if (!named) return {};
  const server = servers.find((s) => s.name === named.server);
  if (!server) return { note: filled(W.notWired, { server: named.server }) };
  const params = { name: named.tool, arguments: payload.tool_input || {} };
  const [, reply] = await speak(io, server, [{ method: 'tools/call', params }]);
  const text = reply?.result ? reply.result.content.map((c) => c.text).join('') : JSON.stringify(reply?.error || null);
  return { said: text.length, owner: serverOwner(io) };
}
function withTool(agent, { said, owner }) {
  const was = agent[owner] || {};
  return { ...agent, [owner]: { said: (was.said || 0) + said, held: was.held || 0, unsent: was.unsent || 0 } };
}

async function oneEvent(at, servers, { label, event, payload }) {
  const io = compose({ start: at.root, mode: 'hook', replay: { home: at.home, session: payload.session_id } });
  const text = JSON.stringify(payload);
  const port = await answer(io, event, text, await hookInput(text));
  const tool = await toolReply(io, servers, payload);
  return { label, event, tool: payload.tool_name || null, agent: tool.said === undefined ? port.agent : withTool(port.agent, tool),
    verdict: port.verdict,
    handlers: port.handlers, notes: [...port.notes, ...[tool.note].filter(Boolean)], person: (port.reply.systemMessage || '').length, reply: port.reply };
}

async function scriptOf(io, file) {
  if (typeof file !== 'string') throw fail('args-invalid', W.scriptUsage);
  const where = paths.resolveFrom(process.cwd(), file);
  const beside = io.machine.fsAt(paths.parentDir(where));
  const text = beside.readText(paths.nameOf(where));
  if (text === null) throw fail('args-invalid', filled(W.noScript, { file }));
  return { script: validate.json(text, 'args-invalid'), beside };
}

/** Each transcript the script names, from beside it into the scratch home, where the hook's home is. */
function laid(io, { script, beside }, home) {
  for (const name of new Set((Array.isArray(script) ? script : []).map((e) => e && e.transcript).filter(Boolean).map(paths.nameOf))) {
    const text = beside.readText(name);
    if (text === null) throw fail('args-invalid', filled(W.noTranscript, { name }));
    io.machine.fsAt(home).writeAtomic(name, text);
  }
  return script;
}

async function debugInject(args, io) {
  const read = await scriptOf(io, args.flags.script);
  const at = copyOf(io);
  try {
    const script = laid(io, read, at.home);
    const first = compose({ start: at.root, mode: 'hook', replay: { home: at.home, session: 'debug-inject' } });
    const servers = serversOf((await first.packages.declared()).manifests);
    const events = [];
    for (const one of payloadsOf(script, { root: first.root, session: 'debug-inject', home: at.home })) events.push(await oneEvent(at, servers, one)); // in order: each reads what the last kept
    const standing = await standingOf(first, servers);
    return injectView({ events, standing, copy: args.flags.keep ? at.root : null, modules: io.catalog.modules.modules });
  } finally {
    if (!args.flags.keep) at.remove();
  }
}

module.exports = { debugInject };
