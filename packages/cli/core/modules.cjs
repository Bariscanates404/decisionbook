// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: modules as data. Which module a word names, what a choice leaves on, whether a package is on, and what moving between two wired
// sets adds or removes.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, WORDS: { choice: W } } = require('../contracts/codes.cjs');
const { serversOf, placedCommands } = require('./host.cjs');

const byWord = (rows, word) => rows.find((m) => m.name === word || (m.alias || []).includes(word)) || null;

/** A base package is always on; a module's package is on when its module is in `on`. */
const isOn = ({ base, modules }, pkg, on) => base.includes(pkg) || modules.some((m) => m.packages.includes(pkg) && on.includes(m.name));

/** Every module with a package on disk (`has`). */
const installedOf = (rows, has) => rows.filter((m) => m.packages.some(has)).map((m) => m.name);

/** The modules on in a repository: its stored choice, or (`stored` null: never set up) the plain set, each module not `optIn`. */
const onHere = (rows, stored) => stored ?? rows.filter((m) => !m.optIn).map((m) => m.name);

/** setup's and update's choice -> { on } in the file's order | { refused } (the step names the modules). No flag: the modules on here;
 * --with: those and the named, so a module a person switched off stays off until it is named. */
function choose(rows, flags, stored) {
  const here = onHere(rows, stored);
  const given = ['only', 'without', 'with'].filter((key) => flags[key] !== undefined);
  if (given.length > 1) return { refused: W.oneFlag };
  if (!given.length) return { on: here };
  const found = String(flags[given[0]]).split(',').map((w) => w.trim()).filter(Boolean).map((w) => [w, byWord(rows, w)]);
  const unknown = found.find(([, m]) => !m);
  if (unknown) return { refused: filled(WORDS.modules.noSuch, { word: unknown[0] }) };
  const named = (name) => found.some(([, m]) => m.name === name);
  const keep = { only: named, without: (name) => !named(name), with: (name) => named(name) || here.includes(name) }[given[0]];
  const on = rows.map((m) => m.name).filter(keep);
  return on.length ? { on } : { refused: W.noneLeft };
}

/** `modules on|off <name>` over the stored set -> { on } | { refused } when it would leave none. */
function toggled(rows, stored, verb, name) {
  const on = rows.map((m) => m.name).filter((one) => (one === name ? verb === 'on' : stored.includes(one)));
  return on.length ? { on } : { refused: filled(W.lastOn, { name }) };
}

/** What a person sees move: each hook as `event package.handler`, each command, each MCP server. */
const wiredNames = (manifests) => ({
  hooks: manifests.flatMap((m) => (m.hooks || []).map((h) => `${h.event} ${m.name}.${h.handler}`)),
  commands: placedCommands(manifests).map((c) => c.dest),
  servers: serversOf(manifests).map((s) => s.name),
});

/** changeOf(before, after) -> { added: { hooks, commands, servers }, removed: {...} } between two wired manifest sets. */
function changeOf(before, after) {
  const [was, now] = [before, after].map(wiredNames);
  const minus = (a, b) => Object.fromEntries(Object.keys(a).map((key) => [key, a[key].filter((n) => !b[key].includes(n))]));
  return { added: minus(now, was), removed: minus(was, now) };
}

/** The one line a hook row of an off module says, once per session through the context rule: the modules whose handlers this event would
 * reach. */
const offItem = (rows, reached, short) => {
  const off = rows.filter((m) => reached.some((d) => m.packages.includes(d.pkg))).map((m) => m.name);
  return off.length ? { key: 'module-off', text: filled(W.offItem, { names: off.join(', '), short }) } : null;
};

module.exports = { byWord, isOn, installedOf, onHere, choose, toggled, changeOf, offItem };
