// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The modules a repository wires: the choice of setup, update and `modules on|off`, refused before anything is written, and the views.
const { errors: { fail } } = require('@atlasbound/kit');
const { shortOf } = require('../contracts/codes.cjs');
const core = require('../core/modules.cjs');
const { reached, wakes } = require('../core/hooks.cjs');
const { firstRun } = require('./setup.cjs');

/** The modules a wiring verb leaves on, or module-refused: an unknown word, two flags, one asked for and not installed, none left on. */
function modulesChosen(io, { words, rest, flags }) {
  const rows = io.catalog.modules.modules;
  const named = `the modules are ${rows.map((m) => [m.name, ...(m.alias || [])].join(' or ')).join(', ')}`;
  const stored = io.host.chosen();
  const verb = words[0] === 'modules' ? words[1] : words[0];
  const got = words[0] === 'modules' ? toggledFor(rows, stored, verb, rest) : core.choose(rows, flags, stored);
  if (got.refused) throw fail('module-refused', `${got.refused}; ${named}`);
  const there = core.installedOf(rows, io.packages.has);
  const asked = flags.with !== undefined ? got.on : words[0] === 'modules' && verb === 'on' ? [core.byWord(rows, rest[0]).name] : [];
  const absent = asked.filter((name) => !there.includes(name) && core.byWord(rows, name).optIn);
  if (absent.length) throw fail('module-refused', `${absent.join(', ')} is not installed here; ${named}`);
  if (!got.on.some((name) => there.includes(name))) throw fail('module-refused', `none of ${got.on.join(', ')} is installed here; ${named}`);
  return got.on;
}

/** The modules wired here that a wiring to `on` would take out, the installed ones only: taking one out is the person's. */
function takenOut(io, on) {
  const there = core.installedOf(io.catalog.modules.modules, io.packages.has);
  return (io.host.chosen() ?? []).filter((name) => there.includes(name) && !on.includes(name));
}

function toggledFor(rows, stored, verb, rest) {
  if (stored === null) return { refused: 'this repository is not set up: atlasbound setup, or setup --only <modules>' };
  const row = rest.length === 1 ? core.byWord(rows, rest[0]) : null;
  if (!row) return { refused: rest.length === 1 ? `no module is called ${rest[0]}` : `modules ${verb} takes one module` };
  return core.toggled(rows, stored, verb, row.name);
}

/** One row per module: on, off (by choice), not set up here (never set up, a module only a person's naming wires) or not installed, for
 * doctor, status and `modules`. */
function moduleRows(io) {
  const stored = io.host.chosen();
  const { modules: every } = io.catalog.modules;
  const on = core.onHere(every, stored);
  const there = core.installedOf(every, io.packages.has);
  const offAs = stored === null ? 'not-set-up' : 'off';
  return every.map((m) => {
    const state = !there.includes(m.name) ? 'not-installed' : on.includes(m.name) ? 'on' : offAs;
    return { name: m.name, state, title: m.title, loses: m[SAYS[state]] ?? null, alias: m.alias || [] };
  });
}

const SAID = { on: 'on', off: 'off (by choice)', 'not-set-up': 'not set up here', 'not-installed': 'not installed' };
const SAYS = { off: 'loses', 'not-installed': 'loses', 'not-set-up': 'what' }; // the module's own words a row says beside its state
/** What turns a module that is off here on: `modules on` where a choice is stored, setup naming it where none is. */
const TURNS_ON = { off: (name) => `atlasbound modules on ${name} turns it back on`, 'not-set-up': (name) => `atlasbound setup --with ${name} sets it up` };
/** doctor's and status's line of one module. */
const moduleLine = (m) => `  module ${m.name}: ${SAID[m.state]}${m.loses ? `: ${m.loses}` : ''}`;

async function modules(_args, io) {
  const rows = moduleRows(io);
  const lines = rows.map((r) => `  ${r.name.padEnd(13)} ${SAID[r.state].padEnd(16)} ${r.title}${r.loses ? `\n  ${''.padEnd(13)} ${r.loses}` : ''}`);
  const base = io.catalog.modules.base.map(io.catalog.plain).join(', ');
  const asked = io.catalog.modules.modules.filter((m) => m.optIn && rows.some((r) => r.name === m.name && TURNS_ON[r.state]));
  const named = asked.map((m) => `; a plain setup leaves ${m.name} off, setup --with ${m.name} wires it`).join('');
  const text = `atlasbound modules: ${io.root}\n${lines.join('\n')}\nthe base (${base}) is always on${named}; atlasbound modules on|off <name> chooses\n`;
  return { out: { root: io.root, modules: rows }, n: { on: rows.filter((r) => r.state === 'on').length }, codes: {}, text };
}

/** `modules on|off <name>`: the same writer over the new set; says exactly what it added or took out. Off takes only what setup wrote. On
 * runs setup's first run for the packages it wires, so the module is there as after setup --with. */
async function modulesSet(args, io) {
  const before = io.packages.declared().manifests;
  const { manifests, problems } = io.packages.declared(args.on);
  // what stays is each turned-off package's own declaration (keptStores), read before anything is written
  const gone = before.filter((m) => !manifests.some((n) => n.name === m.name))
    .map((m) => [io.packages.load(m.name), io.packages.ioFor(m.name)]);
  // and the person's words each keeps in their home (homeStores), with the one command that removes them; only what is on disk
  const declared = Object.fromEntries(gone.flatMap(([entry]) => Object.entries(entry.keptStores ?? {})));
  const there = io.host.present({ here: Object.keys(declared), home: gone.flatMap(([entry, own]) => entry.homeStores?.(own) ?? []) });
  const kept = [...there.here.map((key) => [key, declared[key]]), ...there.home.map((key) => [`~/${key}`, shortOf('module-kept-home')])];
  io.host.write(io.host.plan(manifests, io.packages, args.on));
  const change = core.changeOf(before, manifests);
  const verb = args.words[1];
  const moved = Object.entries(change).flatMap(([said, kinds]) => Object.entries(kinds).flatMap(([what, names]) => names.map((name) => `  ${said} ${what.slice(0, -1)} ${name}`)));
  const text = [`atlasbound modules ${verb} ${args.rest[0]}: ${io.root}`, ...moved,
    ...problems.map((p) => `  manifest-invalid ${p}`), `  on here: ${args.on.join(', ')}; restart your AI session so it picks this up`,
    ...(verb === 'off' ? [`  ${shortOf('module-kept-data')}`, ...kept.map(([key, why]) => `  kept ${key}: ${why}`)] : [])];
  const fresh = manifests.filter((m) => !before.some((b) => b.name === m.name)).map((m) => m.name);
  const first = fresh.includes(io.catalog.provides.setupRun?.pkg) ? (await firstRun(io, fresh)).rows : [];
  const n = { added: Object.values(change.added).flat().length, removed: Object.values(change.removed).flat().length };
  return { out: { root: io.root, on: args.on, ...change }, n, codes: problems.length ? { 'manifest-invalid': problems.length } : {}, text: `${[...text, ...first].join('\n')}\n` };
}

/** A verb of a module off or not set up here answers its module's one line and never acts (nothing is done); null
 * while it is on. */
const offLine = (io, pkg) => moduleRows(io).filter((r) => TURNS_ON[r.state] && io.packages.has(pkg)
  && core.byWord(io.catalog.modules.modules, r.name).packages.includes(pkg))
  .map((r) => `${moduleLine(r).trim()}; ${TURNS_ON[r.state](r.name)}`)[0] ?? null;

/** A hook row nothing wired answers but an off module would (a session from before `modules off`, a committed settings file): its one line,
 * never a verdict. A row the wired `manifests` plan too (the port's own shell gate) is no off module's. */
function offOf(io, { known, results, event, payload, manifests }) {
  if (!known || results.length || wakes(manifests, event, payload)) return null;
  const off = io.packages.declared(io.catalog.modules.modules.map((m) => m.name)).manifests.filter((m) => !io.packages.wired(m.name));
  return core.offItem(io.catalog.modules.modules, reached(off, event, payload), shortOf('module-off'));
}

module.exports = { modulesChosen, takenOut, moduleRows, moduleLine, modules, modulesSet, offOf, offLine };
