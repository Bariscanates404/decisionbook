// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE one host-config writer: ignore block first (a stub never shows to git), settings last (they switch hooks on); uninstall takes back
// only what installed.json holds.
const { errors: { fail, isFail }, hash: { sha256 }, trace: { TRACE_DIR }, host: kitHost } = require('@atlasbound/kit');
const HOST = require('../contracts/host.json');
const validate = require('../contracts/validate.cjs');
const { STORE } = require('../contracts/shapes.cjs');
const core = require('../core/host.cjs');
const teamRow = require('../core/notice.cjs');
const { isOn, onHere } = require('../core/modules.cjs');
const { PRODUCT } = require('../contracts/verbs.cjs');
const { isDeepStrictEqual } = require('node:util');

const STATE = '.atlasbound/cli/installed.json';
const createFiles = [HOST.ignore, HOST.mcp, HOST.settings];
const EXCLUDE = '.git/info/exclude'; // git's ignore file of this clone alone
const committable = [...HOST.settingsFiles, HOST.mcp];
const UNSAFE = /["`$\n]/;
const NOTICE = teamRow.noticeRow(HOST, STATE);

function parsed({ fs }, key) {
  const text = fs.readText(key);
  if (text === null) return {};
  try {
    return validate.shape('HostFile', validate.json(text));
  } catch (err) {
    throw fail('host-invalid', `${key}: ${err.code}`);
  }
}
/** A settings file as it reads, or null where it does not: the team's file is never a reason to refuse. */
const readable = (ctx, key) => {
  try {
    return parsed(ctx, key);
  } catch (err) {
    if (!isFail(err, 'host-invalid')) throw err;
    return null;
  }
};
const priorOf = (ctx) => ({ files: {}, servers: [], linked: [], foreign: [], allow: [], ...parsed(ctx, STATE) });
/** The modules this repository chose (cli-install/2), only names this install's data knows (`ctx.modules`: the catalog's); an install
 * from before modules wired every one; null: never set up. */
function chosenOf(ctx) {
  const every = ctx.modules.modules.map((m) => m.name);
  return ctx.fs.readText(STATE) === null ? null : [].concat(priorOf(ctx).modules ?? every).filter((name) => every.includes(name));
}

/** The product marker is a file only this product's own tree holds; a repository's own packages/cli says nothing. */
function refusal({ fs, root, self }) {
  if (fs.readText(HOST.productMarker) !== null) throw fail('target-is-product', root);
  if ([self.bin, self.node].some((path) => UNSAFE.test(path))) throw fail('install-path-unsafe', self.bin);
}

/** A home or temp root: no verb works there and nothing is written, not even a trace; only uninstall enters, where a setup left its
 * state. */
function refuseStrayRoot({ fs, env, root, cleaning }) {
  const named = HOST.unsafeRoots.env.map((name) => env.get(name));
  if (core.isUnsafeRoot(HOST, root, named) && !(cleaning && fs.readText(STATE) !== null)) throw fail('root-unsafe', root);
}

function plan(ctx, manifests, packages, { on, asked }) {
  const base = core.desiredOf({ host: HOST, bin: ctx.self.bin, node: ctx.self.node, manifests });
  // the cli's own free verbs and each installed package's; an off module's verbs ask again
  const wired = ({ pkg }) => !pkg || isOn(ctx.modules, pkg, on);
  const [free, alone] = ['free', 'alone'].map((key) => packages.catalog[key].filter(wired).map(({ words }) => words));
  const desired = { ...base, allow: core.allowOf({ free, alone, bin: PRODUCT, manifests }) };
  const bodyOf = (f) => {
    const text = packages.readFrom(f.pkg, f.src);
    if (text === null) throw fail('package-broken', f.src);
    return text;
  };
  const wanted = Object.fromEntries(desired.files.map((f) => [f.key, bodyOf(f)]));
  const { settings, mcp } = { settings: parsed(ctx, HOST.settings), mcp: parsed(ctx, HOST.mcp) };
  return { desired, wanted, on, settings, mcp, prior: priorOf(ctx), notice: noticePlan(ctx, asked) };
}

/** The team's row: `was` where it stands; `joined`: this machine never set this clone up and git brought the ignore block, so the team
 * did; `put`: written in a clone nobody set up yet, or where the person `asked` (setup --team-notice). Otherwise the file stays as it is:
 * another version's row still works, and a row switched off on purpose stays off. */
function noticePlan(ctx, asked = false) {
  const team = readable(ctx, HOST.notice.file);
  const was = team ? teamRow.standing(team, NOTICE) : 'unread';
  const block = core.ignoreParts(ctx.fs.readText(HOST.ignore) || '', HOST.ignoreMarks).block !== null;
  const never = ctx.fs.readText(STATE) === null;
  const put = !['unread', 'current'].includes(was) && (asked || (was === 'none' && never && !block));
  return { was, joined: never && block, put, team };
}

/** A link in the path refuses that write alone (a repository may track .claude/skills -> ../agents/skills). */
function placed(fs, key, text) {
  try {
    fs.writeAtomic(key, text);
    return true;
  } catch (err) {
    if (!isFail(err, 'path-link')) throw err;
    return false;
  }
}

function placeFiles({ fs }, { desired, wanted, prior }) {
  const foreign = [];
  const linked = [];
  const files = {};
  desired.files.forEach(({ key }) => {
    const now = fs.readText(key);
    if (now !== null && now !== wanted[key] && sha256(now) !== prior.files[key]) foreign.push(key);
    else if (placed(fs, key, wanted[key])) files[key] = sha256(wanted[key]);
    else linked.push(key);
  });
  return { files, foreign, linked };
}

function saveOrRemove({ fs }, key, value) {
  if (value) fs.writeAtomic(key, core.textOf(value));
  else fs.remove(key);
}

function removeFiles({ fs }, files) {
  const removed = [];
  const kept = [];
  Object.entries(files).forEach(([key, sum]) => {
    const now = fs.readText(key);
    if (now === null) return;
    if (sha256(now) !== sum) kept.push(key);
    else {
      fs.remove(key);
      removed.push(key);
    }
  });
  return { removed, kept };
}

/** The block is written where it lacks a line, or holds one no longer wanted that names a file here and not this machine's (`own`: the
 * repository's own MCP file, a command the person kept: it would hide theirs from git); else a committed block stays byte for byte. */
function writeIgnore(ctx, wanted, own, text = ctx.fs.readText(HOST.ignore) || '') {
  const held = core.ignoreParts(text, HOST.ignoreMarks).block || [];
  const hides = held.some((entry) => ![...wanted, ...own].includes(entry) && /^(?!.*\.\.)[\w.][\w./-]*$/.test(entry) && ctx.fs.exists(entry));
  const stale = hides || wanted.some((entry) => !held.includes(entry));
  if (stale) ctx.fs.writeAtomic(HOST.ignore, core.swapBlock(text, HOST.ignoreMarks, wanted));
  return stale;
}
/** This clone's own ignore file with our block holding `entries` (none: the block goes): git's, never committed; none where `.git` is
 * not this checkout's folder (a linked worktree: its files show to git as untracked). -> [key, its text after] | [] */
function excludeLines(ctx, entries) {
  const text = ctx.fs.list('.git') === null ? null : ctx.fs.readText(EXCLUDE) ?? '';
  const next = text === null ? null : core.swapBlock(text, HOST.ignoreMarks, entries.length ? entries : null);
  return next === null || next === text ? [] : [[EXCLUDE, next]];
}

function write(ctx, planned) {
  const { desired, mcp, prior, on } = planned;
  const ignored = writeIgnore(ctx, desired.ignore, desired.exclude);
  excludeLines(ctx, desired.exclude).forEach(([key, next]) => ctx.fs.writeAtomic(key, next));
  // the team's file as it was before our row joined it: uninstall gives those bytes back where the row is all it takes out
  const teamWas = (planned.notice.put && planned.notice.was === 'none' ? ctx.fs.readText(HOST.notice.file) : prior.teamWas) ?? undefined;
  if (planned.notice.put) ctx.fs.writeAtomic(HOST.notice.file, core.textOf(teamRow.withRow(planned.notice.team, NOTICE)));
  const { files, foreign, linked } = placeFiles(ctx, planned);
  const wanted = new Set(desired.files.map((f) => f.key));
  const retired = removeFiles(ctx, Object.fromEntries(Object.entries(prior.files).filter(([key]) => !wanted.has(key))));
  const servers = Object.keys(desired.servers);
  if (servers.length || prior.servers.length) {
    const left = core.withoutServers(mcp, prior.servers);
    saveOrRemove(ctx, HOST.mcp, servers.length ? core.withServers(left || {}, desired.servers) : left);
  }
  const { settings, added: allow } = core.withAllow(core.withRows(parsed(ctx, HOST.settings), desired), desired.allow, prior.allow);
  ctx.fs.writeAtomic(HOST.settings, core.textOf(settings));
  ctx.fs.writeAtomic(STATE, core.textOf({ schema: 'cli-install/2', modules: on, files, servers, linked, foreign, allow, teamWas }));
  // the host files this write placed, settings last
  const placed = [...createFiles.slice(0, -1), HOST.notice.file, HOST.settings].filter((key) => (key === HOST.ignore ? ignored
    : key === HOST.notice.file ? planned.notice.put : key !== HOST.mcp || servers.length));
  return { foreign, linked, retired, placed, notice: planned.notice };
}

/** A write setup refused and named (a link, the person's own file) is no drift: doctor's `fix:` line would only have it refused again. */
function drift({ fs }, { desired, wanted, settings, mcp, prior }) {
  const held = [...prior.linked, ...prior.foreign.filter((key) => fs.readText(key) !== null)];
  const bodies = Object.fromEntries(desired.files.map((f) => [f.key, held.includes(f.key) ? wanted[f.key] : fs.readText(f.key)]));
  return core.driftOf(desired, { settings, mcp, wanted, bodies, ignore: fs.readText(HOST.ignore) || '' });
}

const ancestors = (key) => key.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'));

// by the fs port, never a program: Windows has no rmdir to start (cmd.exe's own word)
async function pruneEmpty({ fs }, dirs) {
  for (const dir of [...new Set(dirs)].sort((a, b) => b.length - a.length)) if (fs.list(dir)?.length === 0) fs.removeEmpty(dir);
}

/** Every file under a key and every folder of it, itself included: an empty folder inside is part of the tree too. */
function treeOf(fs, key) {
  const names = fs.list(key);
  if (names === null) return { files: [key], dirs: [] };
  const below = names.map((name) => treeOf(fs, `${key}/${name}`));
  return { files: below.flatMap((tree) => tree.files), dirs: [key, ...below.flatMap((tree) => tree.dirs)] };
}
const isThere = ({ fs }, key) => fs.list(key) !== null || fs.readText(key) !== null;

async function removeTrees(ctx, keys) {
  const there = keys.filter((key) => isThere(ctx, key));
  for (const key of there) {
    const { files, dirs } = treeOf(ctx.fs, key);
    files.forEach((file) => ctx.fs.remove(file));
    await pruneEmpty(ctx, [key, ...dirs, ...files.flatMap(ancestors)]);
  }
  return there;
}

/** The team's file with our row out: the bytes it had before the row joined where nothing else changed since, else its text. */
const teamBack = (prior, left) => (prior.teamWas && isDeepStrictEqual(validate.json(prior.teamWas), left) ? prior.teamWas
  : left && core.textOf(left));
/** Each host file uninstall changes -> [key, its text after, null: removed]. */
function linesOut(ctx, prior, { mcp, settings, team }) {
  const json = (value) => (value ? core.textOf(value) : null);
  const ignore = ctx.fs.readText(HOST.ignore);
  const local = ctx.fs.readText(HOST.settings) === null ? undefined
    : json(core.withoutRows(core.withAllow(settings, [], prior.allow).settings));
  return [[HOST.mcp, prior.servers.length ? json(core.withoutServers(mcp, prior.servers)) : undefined], [HOST.settings, local],
    [HOST.notice.file, team && teamRow.standing(team, NOTICE) !== 'none' ? teamBack(prior, core.withoutRows(team, NOTICE.ours)) : undefined],
    [HOST.ignore, ignore === null ? undefined : core.swapBlock(ignore, HOST.ignoreMarks, null) || null], ...excludeLines(ctx, [])]
    .filter(([key, next]) => next !== undefined && next !== ctx.fs.readText(key));
}

/** A file git holds as it is (`fromGit`) is the team's: never rewritten; -> those our lines stayed in. */
function takeHostLines(ctx, prior, files, fromGit) {
  const out = linesOut(ctx, prior, files);
  out.filter(([key]) => !fromGit.includes(key))
    .forEach(([key, next]) => (next === null ? ctx.fs.remove(key) : ctx.fs.writeAtomic(key, next)));
  return out.map(([key]) => key).filter((key) => fromGit.includes(key));
}

/** THE answer to which declared stores are on disk: `here` in the repository, `home` in this user's home; modules off and uninstall both
 * ask it. */
function present(ctx, { here = [], home = [] }) {
  const dir = home.length ? ctx.env.userHome() : null;
  const homeCtx = dir ? { ...ctx, fs: ctx.fsAt(dir), root: dir } : null;
  return { here: here.filter((key) => isThere(ctx, key)), home: homeCtx ? home.filter((key) => isThere(homeCtx, key)) : [], homeCtx };
}

const plainOf = (free) => [`${STORE}/cli`, TRACE_DIR, ...free]; // what a plain uninstall takes whole

/** THE one list of what --purge deletes beyond a plain uninstall, read from the disk before anything goes: every folder of the product's
 * store here but the team's files and what the plain part takes whole, the stores handed in (a plan store git does not track), and this
 * repository's folders in the person's home that are there. The question names this list and the purge removes exactly it. */
function purgeList(ctx, { free, stores, home, team = [] }) {
  const spared = [...team, ...plainOf(free)];
  const here = [...(ctx.fs.list(STORE) || []).map((name) => `${STORE}/${name}`), ...stores].filter((key) => !spared.includes(key) && isThere(ctx, key));
  return { here, home: present(ctx, { home }).home };
}

/** `purge`: the list the person said yes to, or null for a plain uninstall, which says what stays. */
async function leaveOrPurge(ctx, { purge, stores, home, teamFiles }) {
  const left = [...(ctx.fs.list(STORE) || []).map((name) => `${STORE}/${name}`), ...stores];
  const team = teamFiles.filter((key) => left.includes(key));
  const { home: mine, homeCtx } = present(ctx, { home });
  const tilde = (keys) => keys.map((key) => `~/${key}`);
  if (!purge) return { team, kept: [...left.filter((one) => !team.includes(one)), ...tilde(mine)], purged: [] };
  return { team, kept: [],
    purged: [...await removeTrees(ctx, purge.here), ...tilde(homeCtx ? await removeTrees(homeCtx, purge.home) : [])] };
}

async function unwrite(ctx, { purge, free, stores = [], home = [], team = [], fromGit = [] }) {
  const prior = priorOf(ctx);
  // a bad file refuses before anything is removed; the team's file only goes unread
  const files = { mcp: parsed(ctx, HOST.mcp), settings: parsed(ctx, HOST.settings), team: readable(ctx, HOST.notice.file) };
  const hostBefore = [...createFiles, HOST.notice.file].map((key) => [key, ctx.fs.readText(key)]);
  const { removed, kept } = removeFiles(ctx, Object.fromEntries(Object.entries(prior.files).filter(([key]) => !fromGit.includes(key))));
  const held = takeHostLines(ctx, prior, files, fromGit);
  const taken = await removeTrees(ctx, plainOf(free));
  const left = await leaveOrPurge(ctx, { purge, stores, home, teamFiles: team });
  await pruneEmpty(ctx, [...[...removed, HOST.settings].flatMap(ancestors), STORE]);
  const changed = hostBefore.filter(([key, before]) => before !== null && ctx.fs.readText(key) !== before).map(([key]) => key);
  return { kept: [...kept, ...left.kept], team: left.team, fromGit: held, tookFrom: changed.filter((key) => ctx.fs.readText(key) !== null),
    removed: [...removed, ...changed.filter((key) => ctx.fs.readText(key) === null), ...taken, ...left.purged] };
}

const createHost = (ctx) => ({
  mcpFile: HOST.mcp, gateProbe: HOST.gateProbe, user: HOST.hostUser,
  // what the port's seal keeps the AI's write out of; `whole`: the files any write of asks (the host's other settings file here, which
  // can switch every hook off, and each command file this install placed)
  ownFiles: { settings: HOST.settings, ignore: HOST.ignore, marks: HOST.ignoreMarks,
    whole: () => [...HOST.settingsFiles.filter((key) => key !== HOST.settings), ...Object.keys(priorOf(ctx).files)] },
  committable, noticeFile: HOST.notice.file, hostFiles: [HOST.ignore, ...committable],
  grants: (tracked) => HOST.settingsFiles.filter((key) => tracked.includes(key))
    .flatMap((key) => core.grantsOf(parsed(ctx, key), NOTICE).map((row) => `${key}: ${row}`)),
  notice: () => noticePlan(ctx).was,
  refusal: () => refusal(ctx),
  chosen: () => chosenOf(ctx),
  plan: (manifests, packages, on = onHere(ctx.modules.modules, chosenOf(ctx)), asked = false) =>
    plan(ctx, manifests, packages, { on, asked }),
  write: (planned) => write(ctx, planned),
  drift: (planned) => drift(ctx, planned),
  unwrite: (opts) => unwrite(ctx, opts),
  present: (keys) => present(ctx, keys),
  purgeList: (asked) => purgeList(ctx, asked),
});

module.exports = { createHost, refuseStrayRoot, projectEnv: HOST.projectEnv, sessionEnv: HOST.sessionEnv, pidEnv: HOST.pidEnv,
  sessionWrites: [HOST.gateProbe, kitHost.DRAFTS] };
