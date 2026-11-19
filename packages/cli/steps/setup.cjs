// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// setup / update (the same idempotent door) / uninstall over the one host writer; a package's failed first run is said with its code, never
// setup's failure.
const { traced, paths: { nameOf }, host: { DRAFTS }, text: { secrets: { clipped }, lines: { counted, filled } } } = require('@atlasbound/kit');
const { STORE } = require('../contracts/shapes.cjs');
const { shortOf, WORDS: { setup: W, manifestInvalid: MANIFEST_INVALID, toDo: TO_DO } } = require('../contracts/codes.cjs');
const { adviceOf, hintOf, ignoredProbe } = require('./probes.cjs');
const { askProtect, noticeOf } = require('./protect.cjs');
const { saidFailure } = require('./failure.cjs');
const { typedOrRefused } = require('./person.cjs');
const { teamFilesOf } = require('../core/host.cjs');
const { leftoversLine } = require('../core/leftovers.cjs');

const lines = (rows) => `${rows.filter(Boolean).join('\n')}\n`;
const nextStep = ({ verb, what }) => `  atlasbound ${verb.padEnd(14)} ${what}`;
const outOfGit = (mcp, ignored) => filled(W.outOfGit, { ignore: ignored ? W.ignoreCommit : W.ignoreSame, mcp: mcp ? W.outOfGitMcp : '' });

const firstLines = async (io) => (await io.answer('setupRun', { flags: {} })).map((line) => `  ${line}`).join('\n');

/** Never throws: setup's wiring is already done and stands. A package may run once at setup and say it in its own words (the answer
 * `setupRun`, its lines); with none installed there is no first run to tell. Its next steps: the cli's and each wired package's, or only
 * those of the packages `fresh` names (modules on). */
async function firstRun(io, fresh = null) {
  if (io.absent('setupRun')) {
    const off = io.absent('setupRun') === 'off' ? io.catalog.plain(io.catalog.provides.setupRun.pkg) : null; // its package's plain name
    return { rows: off ? [filled(W.offVerbs, { off: filled(W.offHere, { name: off }) })] : [] };
  }
  const said = await firstLines(io).catch((err) => saidFailure(io, 'setup', 'setup-run-failed', err));
  const todo = await adviceOf(io);
  const next = io.catalog.next.filter(({ pkg }) => (fresh ? fresh.includes(pkg) : !pkg || io.packages.wired(pkg))).map(nextStep);
  return { rows: [said, ...(todo.length ? [TO_DO, ...todo.map((line) => `  ${line}`)] : []), W.next, ...next] };
}

/** The plan gate's question (the answer `protect`); a missing one is doctor's row: setup says it once and goes on. */
function protectRows(io) {
  if (!io.absent('protect')) {
    return traced(io, 'protect', askProtect)({}, { run: io.run }).then((res) => res.out)
      .catch((err) => [saidFailure(io, 'setup', 'protect-refused', err)]);
  }
  const off = io.absent('protect') === 'off' ? io.catalog.plain(io.catalog.provides.protect.pkg) : null;
  return Promise.resolve([filled(W.protectRow, { why: off ? filled(W.offHere, { name: off }) : W.noProtect })]);
}

/** What a commit brought that setup did not write, in plain words. Only a tracked file: a row this machine's own person allowed is
 * theirs. */
async function committedRows(io, servers) {
  const tracked = await io.git.tracked(io.host.committable);
  const grants = io.host.grants(tracked).map((row) => `    ${clipped(row, 200)}`);
  return [...(grants.length ? [filled(W.committed, { short: shortOf('settings-committed') }), ...grants] : []), ...(servers.length && tracked.includes(io.host.mcpFile) ? [`  ${shortOf('mcp-tracked')}`] : [])];
}

/** What setup did with the team's row, said once: a clone the team set up (`joined`) is wired for this machine only. */
function noticeRows(io, { was, joined, put }) {
  const file = io.host.noticeFile;
  return [joined ? filled(W.joined, { file }) : null,
    put ? filled(was === 'older' ? W.noticeOlder : W.noticePut, { file }) : null, !put && was === 'older' ? filled(W.noticeStale, { file }) : null,
    !put && was === 'none' ? filled(W.noticeAbsent, { file }) : null, was === 'unread' ? filled(W.noticeUnread, { file }) : null];
}

/** The host files git holds exactly as committed: what came with git stays as it came; git unasked, every one stays. */
async function fromGitOf(io, notes) {
  const keys = io.host.hostFiles;
  const [tracked, status] = await Promise.all([io.git.tracked(keys), io.git.statusZ()]).catch((err) => {
    notes.push(saidFailure(io, 'uninstall', 'git-unasked', err));
    return [keys, []];
  });
  return tracked.filter((key) => !status.some((row) => row.key === key));
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
  return filled(W.modules, { on: on.filter((name) => !none.has(name)).join(', '), off: off.length ? filled(W.modulesOff, { names: off.join(', ') }) : '',
    missing: missing.length ? filled(W.modulesMissing, { names: missing.join(', ') }) : '' });
}

/** Each module wired only when named (`optIn`) that is installed here and left off: the one command that wires it. */
const namedOnly = (io, on) => io.catalog.modules.modules.filter((m) => m.optIn && !on.includes(m.name) && m.packages.some(io.packages.has))
  .map((m) => filled(W.namedOnly, { name: m.name }));

async function setup(args, io) {
  const { manifests, problems } = io.packages.declared(args.on);
  const plan = io.host.plan(manifests, io.packages, args.on, Boolean(args.flags['team-notice']));
  const { foreign, linked, retired, placed, notice: team } = io.host.write(plan);
  const hint = await hintOf(io, args.flags, args.words[0] === 'setup'); // before protect's question, which closes the terminal
  const asked = await protectRows(io);
  const notice = asked.length ? null : await noticeOf(io);
  const committed = await committedRows(io, Object.keys(plan.desired.servers)).catch((err) => [saidFailure(io, 'setup', 'committed-unread', err)]);
  const first = await firstRun(io);
  const loose = await ignoredProbe(io, { plan }).catch((err) => ({ state: 'failed', says: saidFailure(io, 'setup', 'ignore-unasked', err).trim() }));
  const verb = args.words[0];
  const out = { root: io.root, modules: args.on, rows: plan.desired.rows.length,
    files: plan.desired.files.length - foreign.length - linked.length, servers: Object.keys(plan.desired.servers), foreign, linked,
    problems };
  const servers = out.servers.length
    ? filled(W.wiredServers, { servers: counted(out.servers.length, W.mcpServer), names: out.servers.join(', ') }) : '';
  const text = lines([filled(W.head, { verb, root: io.root }), modulesLine(io, args.on), ...namedOnly(io, args.on),
    filled(W.wired, { rows: out.rows, servers, files: out.files + placed.length, commands: out.files, placed: placed.join(', ') }),
    filled(W.allowed, { n: plan.desired.allow.length, mcp: out.servers.length ? W.allowedMcp : '', drafts: DRAFTS, file: placed.at(-1) }),
    loose.state === 'failed' ? filled(W.looseFailed, { says: loose.says }) : outOfGit(placed.includes(io.host.mcpFile), placed.includes(io.host.ownFiles.ignore)),
    ...foreign.map((key) => filled(W.foreign, { key })), ...linked.map((key) => filled(W.linked, { key, short: shortOf('file-linked') })),
    ...problems.map((name) => filled(MANIFEST_INVALID, { name })), ...retired.removed.map((key) => filled(W.retired, { key })),
    ...retired.kept.map((key) => filled(W.retiredKept, { key })), ...noticeRows(io, team), ...committed, notice, ...first.rows, ...asked,
    hint, W.last]);
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
  if (why) return filled(W.keptStore, { key, why, unignored: key.startsWith(STORE) ? W.unignored : '' });
  return filled(key.startsWith('~/') ? W.keptHome : W.keptYours, { key });
}

/** what a purge deletes beyond a plain uninstall, said before the person types the phrase, so the words and the act agree: a store a
 * package declares or DecisionBook's own by its name, a folder no installed package names (missing or a stranger's) as other files.
 * -> { list: the host's one list of it, said: the line that names it } */
function purgeNamed(io, { stores, kept, home, free, team }) {
  const list = io.host.purgeList({ free, stores, home, team });
  const declared = (key) => stores.includes(key) || Object.keys(kept).some((path) => path === key || path.startsWith(`${key}/`));
  const strangers = list.here.every(declared) ? [] : [filled(W.otherFiles, { store: STORE })];
  const named = [...list.here.filter(declared), ...list.home.map((key) => `~/${key}`), ...strangers].join(', ');
  return { list, said: filled(W.purge, { named: named || W.purgeNothing }) };
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
  const fromGit = await fromGitOf(io, own.notes);
  const { kept, team: ours, removed, tookFrom, fromGit: held } = await io.host.unwrite({ purge, free: asked.free, home: asked.home,
    stores: own.stores, team: asked.team, fromGit });
  const team = [...ours, ...own.team];
  const left = (io.home && io.home.list(STORE)) || []; // what really stays, by its name, read after the removal
  const machine = left.length ? [leftoversLine('machine', { store: STORE, names: left.sort().join(', ') })] : [];
  const text = lines([filled(W.uninstallHead, { root: io.root }), ...removed.map((key) => filled(W.removed, { key })),
    ...tookFrom.map((key) => filled(W.tookLines, { key })), ...kept.map((key) => keptLine(asked, key)),
    ...team.map((key) => filled(W.team, { key })),
    ...held.map((key) => filled(key === io.host.noticeFile ? W.noticeKept : W.fromGit, { key })),
    ...machine, ...own.notes, ...asked.notes, W.program]);
  return { out: { root: io.root, kept, team, removed, tookFrom }, text };
}

module.exports = { setup, uninstall, firstRun };
