// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// debug inject's view: a scripted session's host events as the port receives them, and per event and package the characters said to the
// agent and held back by the context rule; totals per package and module, the events that said nothing, and each MCP server's standing cost
// beside them.
const { errors: { fail }, paths, debug: { render: { columns } }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { DEBUG_SCHEMA } = require('../contracts/shapes.cjs');
const { WORDS: { inject: W } } = require('../contracts/codes.cjs');

const PATH_KEYS = ['file_path', 'filePath', 'notebook_path'];

/** A script entry -> the payload the host would send: one session, the copy as cwd, a relative path made the copy's. */
function payloadsOf(script, { root, session, home }) { // `transcript`: a file beside the script, laid in the scratch home by the driver
  if (!Array.isArray(script) || !script.every((e) => e && typeof e === 'object' && typeof e.event === 'string')) {
    throw fail('args-invalid', W.script);
  }
  const placed = (obj) => (obj && typeof obj === 'object' ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k,
    PATH_KEYS.includes(k) && typeof v === 'string' && !v.startsWith('/') ? `${root}/${v}` : v])) : obj);
  return script.map(({ label, event, transcript, ...rest }, i) => ({ label: label || `${i + 1}`, event, payload: { session_id: session, cwd: root, hook_event_name: event, ...rest,
    ...(transcript ? { transcript_path: `${home}/${paths.nameOf(transcript)}` } : {}),
    ...(rest.tool_input ? { tool_input: placed(rest.tool_input) } : {}),
      ...(rest.tool_response ? { tool_response: placed(rest.tool_response) } : {}) } }));
}

const addChars = (totals, key, row) => ({ ...totals,
  [key]: { said: (totals[key]?.said || 0) + row.said, held: (totals[key]?.held || 0) + row.held } });

/** events: [{ label, event, agent: { pkg: { said, held, unsent } }, verdict, notes, person }] -> the totals; `modules`: this install's. */
function totalsOf(events, standing, modules) {
  const moduleOf = (pkg) => (modules.find((m) => m.packages.includes(pkg)) || { name: 'base' }).name;
  const byPkg = events.reduce((all, event) => Object.entries(event.agent).reduce((sum, [pkg, row]) => addChars(sum, pkg, row), all), {});
  const byModule = Object.entries(byPkg).reduce((totals, [pkg, row]) => addChars(totals, moduleOf(pkg), row), {});
  const byKind = events.reduce((totals, event) => addChars(totals, event.event, charsOf(event.agent)), {});
  const silent = events.filter((event) => charsOf(event.agent).said === 0).length;
  const standingChars = standing.reduce((sum, server) => sum + server.instructions + server.tools, 0);
  return { byPkg, byModule, byKind, silent, said: charsOf(byPkg).said, held: charsOf(byPkg).held, standing: standingChars };
}
function charsOf(rows) {
  return Object.values(rows).reduce((sum, row) => ({ said: sum.said + row.said, held: sum.held + row.held }), { said: 0, held: 0 });
}

const cell = (row) => (row ? `${row.said}/${row.held}` : '-');
function injectText({ events, standing, totals, copy }) {
  const pkgs = Object.keys(totals.byPkg);
  const head = ['#', 'event', 'label', ...pkgs.map((p) => `${p} said/held`), 'verdict', 'notes'];
  const rows = events.map((e, i) => [i + 1, e.event, e.label, ...pkgs.map((p) => cell(e.agent[p])), e.verdict || '-', e.notes.join('; ') || '-']);
  const total = (by) => Object.entries(by).map(([k, r]) => [k, r.said, r.held]);
  return [filled(W.said, { events: events.length, standing: totals.standing }), ...columns([head, ...rows]), '', W.perPackage,
    ...columns(total(totals.byPkg)), '', W.perModule, ...columns(total(totals.byModule)), '', W.perKind, ...columns(total(totals.byKind)), '',
    filled(W.silent, { ...totals, events: events.length }), '', W.standing,
    ...(standing.length ? columns(standing.map((s) => [s.server, s.instructions, s.tools])) : [W.noServer]),
    ...(copy ? ['', filled(W.copyKept, { copy })] : []), ''].join('\n');
}

const injectView = ({ events, standing, copy, modules }) => {
  const totals = totalsOf(events, standing, modules);
  return { out: { schema: DEBUG_SCHEMA, verb: 'inject', events, standing, totals, copy }, n: { events: events.length, silent: totals.silent, said: totals.said, held: totals.held },
    codes: {}, text: injectText({ events, standing, totals, copy }) };
};

module.exports = { payloadsOf, injectView };
