// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// setup / update (the same idempotent door) / uninstall over the one host writer; a package's failed first run is said with its code, never
// setup's failure.
const { traced, paths: { nameOf }, text: { secrets: { clipped }, lines: { counted } } } = require('@atlasbound/kit');
const { STORE } = require('../contracts/shapes.cjs');
const { shortOf } = require('../contracts/codes.cjs');
const { adviceOf, hintOf, ignoredProbe } = require('./probes.cjs');
const { askProtect, noticeOf } = require('./protect.cjs');
const { saidFailure } = require('./failure.cjs');
const { typedOrRefused } = require('./person.cjs');
const { teamFilesOf } = require('../core/host.cjs');

const lines = (rows) => `${rows.filter(Boolean).join('\n')}\n`;
const nextStep = ({ verb, what }) => `  atlasbound ${verb.padEnd(14)} ${what}`;
const outOfGit = (mcp) => `  commit .gitignore: it holds no machine path; everything else setup wrote stays out of git${mcp ? ', .mcp.json too: it names this machine\'s node and install' : ''}`;

const firstLines = async (io) => (await io.answer('setupRun', { flags: {} })).map((line) => `  ${line}`).join('\n');

/** Never throws: setup's wiring is already done and stands. A package may run once at setup and say it in its own words (the answer
 * `setupRun`, its lines); with none installed there is no first run to tell. Its next steps: the cli's and each wired package's, or only
 * those of the packages `fresh` names (modules on). */
async function firstRun(io, fresh = null) {
  if (io.absent('setupRun')) {
    const off = io.absent('setupRun') === 'off' ? io.catalog.plain(io.catalog.provides.setupRun.pkg) : null; // its package's plain name
    return { rows: off ? [`  ${off} is off here (its module is off): its verbs are off, the rest works`] : [] };
  }
  const said = await firstLines(io).catch((err) => saidFailure(io, 'setup', 'setup-run-failed', err));
  const todo = await adviceOf(io);
  const next = io.catalog.next.filter(({ pkg }) => (fresh ? fresh.includes(pkg) : !pkg || io.packages.wired(pkg))).map(nextStep);
  return { rows: [said, ...(todo.length ? ['to do:', ...todo.map((line) => `  ${line}`)] : []), 'next:', ...next] };
}

/** The plan gate's question (the answer `protect`); a missing one is doctor's row: setup says it once and goes on. */
function protectRows(io) {
  if (!io.absent('protect')) {
    return traced(io, 'protect', askProtect)({}, { run: io.run }).then((res) => res.out)
      .catch((err) => [saidFailure(io, 'setup', 'protect-refused', err)]);
  }
  const off = io.absent('protect') === 'off' ? io.catalog.plain(io.catalog.provides.protect.pkg) : null;
  const why = off ? `${off} is off here (its module is off)` : 'no installed package protects files';
  return Promise.resolve([`  ${why}: nothing is protected; atlasbound doctor names it`]);
}

/** What a commit brought that setup did not write, in plain words. Only a tracked file: a row this machine's own person allowed is
 * theirs. */
async function committedRows(io, servers) {
  const tracked = await io.git.tracked(io.host.committable);
  const grants = io.host.grants(tracked).map((row) => `    ${clipped(row, 200)}`);
  return [...(grants.length ? [`  settings-committed: ${shortOf('settings-committed')}`, ...grants] : []), ...(servers.length && tracked.includes(io.host.mcpFile) ? [`  ${shortOf('mcp-tracked')}`] : [])];
}

/** The modules this choice leaves on and off, and each module with a package not installed, naming those packages. */
function modulesLine(io, on) {
  const { modules } = io.catalog.modules;
  const lacking = modules.map((m) => ({ name: m.name, gone: m.packages.filter((name) => !io.packages.has(name)) }))
    .filter(({ gone }) => gone.length);
  const none = new Set(lacking.filter(({ name, gone }) => gone.length === modules.find((m) => m.name === name).packages.length)
    .map(({ name }) => name));
  const off = modules.map((m) => m.name).filter((name) => !on.includes(name) && !none.has(name));
  const missing = lacking.map(({ name, gone }) => `${name} (${gone.join(', ')})`);
  return `  modules on: ${on.filter((name) => !none.has(name)).join(', ')}${off.length ? `; off: ${off.join(', ')}` : ''}`
    + `${missing.length ? `; not installed: ${missing.join(', ')}` : ''} (atlasbound modules lists them)`;
}

/** Each module wired only when named (`optIn`) that is installed here and left off: the one command that wires it. */
const namedOnly = (io, on) => io.catalog.modules.modules.filter((m) => m.optIn && !on.includes(m.name) && m.packages.some(io.packages.has))
  .map((m) => `  ${m.name} is installed and not wired: a plain setup leaves it off; atlasbound setup --with ${m.name} wires it`);

async function setup(args, io) {
  const { manifests, problems } = io.packages.declared(args.on);
  const plan = io.host.plan(manifests, io.packages, args.on);
  const { foreign, linked, retired, placed } = io.host.write(plan);
  const asked = await protectRows(io);
  const notice = asked.length ? null : await noticeOf(io);
  const committed = await committedRows(io, Object.keys(plan.desired.servers)).catch((err) => [saidFailure(io, 'setup', 'committed-unread', err)]);
  const first = await firstRun(io);
  const loose = await ignoredProbe(io, { plan }).catch((err) => ({ state: 'failed', says: saidFailure(io, 'setup', 'ignore-unasked', err).trim() }));
  const verb = args.words[0];
  const out = { root: io.root, modules: args.on, rows: plan.desired.rows.length,
    files: plan.desired.files.length - foreign.length - linked.length, servers: Object.keys(plan.desired.servers), foreign, linked,
    problems };
  const text = lines([`atlasbound ${verb}: ${io.root}`, modulesLine(io, args.on), ...namedOnly(io, args.on),
    `  wired ${out.rows} hooks${out.servers.length ? ` and ${counted(out.servers.length, 'MCP server')} (${out.servers.join(', ')})` : ''} in ${out.files + placed.length} files: ${out.files} commands and skills, ${placed.join(', ')}; restart your AI session so it picks them up`,
    `  allowed without a prompt: ${plan.desired.allow.length} rules for the commands that only look${out.servers.length ? ' and our read-only MCP tools' : ''} (no write; no git rule), in ${placed.at(-1)}; uninstall takes them out`,
    loose.state === 'failed' ? `  commit .gitignore: it holds no machine path\n  ${loose.says}` : outOfGit(placed.includes(io.host.mcpFile)),
    ...foreign.map((key) => `  file-foreign ${key}: a file of yours is here, it was not touched; move it and run setup again to have ours`),
    ...linked.map((key) => `  file-linked ${key}: ${shortOf('file-linked')}`), ...problems.map((p) => `  manifest-invalid ${p}`),
    ...retired.removed.map((key) => `  removed ${key}: this installation no longer has it`), ...retired.kept.map((key) => `  kept ${key}: this installation no longer has it, and you changed it`),
    ...committed, notice, ...first.rows, ...asked, await hintOf(io, args.flags)]);
  const codes = { ...(foreign.length ? { 'file-foreign': foreign.length } : {}), ...(linked.length ? { 'file-linked': linked.length } : {}), ...(problems.length ? { 'manifest-invalid': problems.length } : {}) };
  return { out, n: { rows: out.rows, files: out.files }, codes, text, exit: foreign.length || problems.length ? 1 : 0 };
}

/** a store's owner says whether it stays; a sibling's spareStores never takes a store another package keeps (its published records). */
async function storesOf(io) {
  const notes = [];
  const all = await Promise.all(io.packages.names.filter((name) => io.packages.has(name))
    .map((name) => Promise.resolve().then(() => [io.packages.load(name), io.packages.ioFor(name)])
    .then(
        (
        [entry, own]) => ({ name, free: entry.spareStores?.(own) ?? [], home: entry.homeStores?.(own) ?? [],
        kept: entry.keptStores ?? {} }))
        .catch((err) => {
      notes.push(saidFailure(io, 'uninstall', 'package-unread', err));
      return { name, free: [], home: [], kept: {} };
    })));
  const keptElsewhere = (name, key) => all.some((one) => one.name !== name && Object.keys(one.kept).some((path) => key === path || key.startsWith(`${path}/`)));
  return { free: all.flatMap((one) => one.free.filter((key) => !keptElsewhere(one.name, key))),
    absent: io.packages.names.filter((name) => !io.packages.has(name)), notes, home: all.flatMap((one) => one.home),
    kept: Object.assign({}, ...all.map((one) => one.kept)) };
}

/** The history a team commits (DecisionBook's), by the store each installed manifest names as `teamStore`, its module on or off: git
 * tracks some of it, the team's, never taken; none, a store like ours. */
async function bookStoreOf(io) {
  const named = io.packages.declared(io.catalog.modules.modules.map((m) => m.name)).manifests.map((m) => m.teamStore).filter(Boolean);
  const here = named.filter((store) => io.fs.list(store) !== null);
  const tracked = here.length ? await io.git.tracked(here) : [];
  const team = here.filter((store) => tracked.some((key) => key === store || key.startsWith(`${store}/`)));
  return { team, stores: here.filter((store) => !team.includes(store)), notes: [] };
}

/** Each package names its own store and why it stays (`keptStores`); a folder of ours no installed package names is a missing package's, or
 * a stranger's. */
const whyKept = ({ kept, absent }, key) => Object.entries(kept).find(([path]) => path === key || path.startsWith(`${key}/`))?.[1]
  ?? (key.startsWith(STORE) ? shortOf(absent.includes(nameOf(key)) ? 'store-absent' : 'store-foreign') : null);
function keptLine(asked, key) {
  const why = whyKept(asked, key);
  if (why) return `  kept ${key}: ${why}; ${key.startsWith(STORE) ? 'no longer ignored, so ' : ''}git sees it; atlasbound uninstall --purge removes it`;
  return `  kept ${key}: ${key.startsWith('~/') ? 'what this repository left in your home; atlasbound uninstall --purge removes it' : 'you changed it, so it is yours now'}`;
}

/** what a purge deletes beyond a plain uninstall, said before the person types the phrase, so the words and the act agree: a store a
 * package declares or DecisionBook's own by its name, a folder no installed package names (missing or a stranger's) as other files.
 * -> { list: the host's one list of it, said: the line that names it } */
function purgeNamed(io, { stores, kept, home, free, team }) {
  const list = io.host.purgeList({ free, stores, home, team });
  const declared = (key) => stores.includes(key) || Object.keys(kept).some((path) => path === key || path.startsWith(`${key}/`));
  const strangers = list.here.every(declared) ? [] : [`other files under ${STORE}`];
  const named = [...list.here.filter(declared), ...list.home.map((key) => `~/${key}`), ...strangers].join(', ');
  return { list, said: `atlasbound uninstall --purge also deletes, for good: ${named || 'nothing more than a plain uninstall takes'}` };
}

/** Not traced around: its last act removes the trace store, so a record after it would put a file back. The one record comes first.
 * A grave act: nothing goes until the person typed its phrase (`args.ask`, the cli's one question of it); any other answer removes
 * nothing at all. */
async function uninstall(args, io) {
  if (io.configRefused) throw io.configRefused; // it takes the config away too: a refused one is named first, nothing removed
  const own = await bookStoreOf(io);
  const asked = { ...await storesOf(io), team: teamFilesOf(io.packages.declared(io.catalog.modules.modules.map((m) => m.name)).manifests) };
  const named = args.flags.purge ? purgeNamed(io, { ...asked, stores: own.stores }) : { list: null, said: '' };
  await typedOrRefused(args.ask, named.said);
  const purge = named.list;
  io.trace.record({ run: io.run, step: 'uninstall', ok: true, ref: { purge: Boolean(purge) } });
  const { kept, team: ours, removed, tookFrom } = await io.host.unwrite({ purge, free: asked.free, home: asked.home, stores: own.stores,
    team: asked.team });
  const team = [...ours, ...own.team];
  const left = (io.home && io.home.list(STORE)) || []; // what really stays, by its name, read after the removal
  const machine = left.length ? [`  kept ~/${STORE}, this user's for every repository: ${left.sort().join(', ')}; rm -rf ~/${STORE} removes them`] : [];
  const text = lines([`atlasbound uninstall: ${io.root}`, ...removed.map((key) => `  removed ${key}`),
    ...tookFrom.map((key) => `  took our lines out of ${key}: the rest of it stays`), ...kept.map((key) => keptLine(asked, key)),
    ...team.map((key) => `  kept ${key}: the team's file, setup did not write it`), ...machine, ...own.notes, ...asked.notes, 'to remove the program too: npm uninstall -g atlasbound']);
  return { out: { root: io.root, kept, team, removed, tookFrom }, text };
}

module.exports = { setup, uninstall, firstRun };
