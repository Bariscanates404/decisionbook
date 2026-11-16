// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// debug inject's view: a scripted session's host events as the port receives them, and per event and package the characters said to the
// agent and held back by the context rule; totals per package and module, the events that said nothing, and each MCP server's standing cost
// beside them.
const { errors: { fail }, paths, debug: { render: { columns } } } = require('@atlasbound/kit');
const { DEBUG_SCHEMA } = require('../contracts/shapes.cjs');

const PATH_KEYS = ['file_path', 'filePath', 'notebook_path'];

/** A script entry -> the payload the host would send: one session, the copy as cwd, a relative path made the copy's. */
function payloadsOf(script, { root, session, home }) { // `transcript`: a file beside the script, laid in the scratch home by the driver
  if (!Array.isArray(script) || !script.every((e) => e && typeof e === 'object' && typeof e.event === 'string')) {
    throw fail('args-invalid', 'debug inject: the script is a JSON list of host events, each { "event": <name>, ...its payload }');
  }
  const placed = (obj) => (obj && typeof obj === 'object' ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k,
    PATH_KEYS.includes(k) && typeof v === 'string' && !v.startsWith('/') ? `${root}/${v}` : v])) : obj);
  return script.map(({ label, event, transcript, ...rest }, i) => ({ label: label || `${i + 1}`, event, payload: { session_id: session, cwd: root, hook_event_name: event, ...rest,
    ...(transcript ? { transcript_path: `${home}/${paths.nameOf(transcript)}` } : {}),
    ...(rest.tool_input ? { tool_input: placed(rest.tool_input) } : {}),
      ...(rest.tool_response ? { tool_response: placed(rest.tool_response) } : {}) } }));
}

/** An MCP tool's host name -> { server, tool }, or null for any other tool. */
const mcpOf = (toolName) => {
  const m = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(toolName || '');
  return m ? { server: m[1], tool: m[2] } : null;
};

const addChars = (into, key,
  row) => ({ ...into, [key]: { said: (into[key]?.said || 0) + row.said, held: (into[key]?.held || 0) + row.held } });

/** events: [{ label, event, agent: { pkg: { said, held, unsent } }, verdict, notes, person }] -> the totals; `modules`: this install's. */
function totalsOf(events, standing, modules) {
  const moduleOf = (pkg) => (modules.find((m) => m.packages.includes(pkg)) || { name: 'base' }).name;
  const byPkg = events.reduce((all, e) => Object.entries(e.agent).reduce((acc, [pkg, row]) => addChars(acc, pkg, row), all), {});
  const byModule = Object.entries(byPkg).reduce((acc, [pkg, row]) => addChars(acc, moduleOf(pkg), row), {});
  const byKind = events.reduce((acc, e) => addChars(acc, e.event, charsOf(e.agent)), {});
  const silent = events.filter((e) => charsOf(e.agent).said === 0).length;
  const standingChars = standing.reduce((n, s) => n + s.instructions + s.tools, 0);
  return { byPkg, byModule, byKind, silent, said: charsOf(byPkg).said, held: charsOf(byPkg).held, standing: standingChars };
}
function charsOf(rows) {
  return Object.values(rows).reduce((t, r) => ({ said: t.said + r.said, held: t.held + r.held }), { said: 0, held: 0 });
}

const cell = (row) => (row ? `${row.said}/${row.held}` : '-');
function injectText({ events, standing, totals, copy }) {
  const pkgs = Object.keys(totals.byPkg);
  const head = ['#', 'event', 'label', ...pkgs.map((p) => `${p} said/held`), 'verdict', 'notes'];
  const rows = events.map((e, i) => [i + 1, e.event, e.label, ...pkgs.map((p) => cell(e.agent[p])), e.verdict || '-', e.notes.join('; ') || '-']);
  const total = (by) => Object.entries(by).map(([k, r]) => [k, r.said, r.held]);
  return [`said to the agent / held back by the context rule, characters, per event and package (${events.length} events, standing ${totals.standing} beside them):`,
    ...columns([head, ...rows]), '', 'per package (said, held):', ...columns(total(totals.byPkg)), '', 'per module (said, held):', ...columns(total(totals.byModule)), '',
    'per event kind (said, held):', ...columns(total(totals.byKind)), '',
    `events that said nothing: ${totals.silent} of ${events.length}; said ${totals.said}, held ${totals.held}`, '',
    'standing cost a client holds for the session, per MCP server wired here, bytes (initialize.instructions, whole tools/list entries as sent):',
    ...(standing.length ? columns(standing.map((s) => [s.server, s.instructions, s.tools])) : ['  none: no MCP server is wired here']),
    ...(copy ? ['', `the copy it ran on is kept: ${copy} (atlasbound debug trace --session <id> --target <copy>)`] : []), ''].join('\n');
}

const injectView = ({ events, standing, copy, modules }) => {
  const totals = totalsOf(events, standing, modules);
  return { out: { schema: DEBUG_SCHEMA, verb: 'inject', events, standing, totals, copy }, n: { events: events.length, silent: totals.silent, said: totals.said, held: totals.held },
    codes: {}, text: injectText({ events, standing, totals, copy }) };
};

module.exports = { payloadsOf, mcpOf, injectView };
