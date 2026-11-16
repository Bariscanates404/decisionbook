// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE one host-config writer: ignore block first (a stub never shows to git), settings last (they switch hooks on); uninstall takes back
// only what installed.json holds.
const { errors: { fail, isFail }, hash: { sha256 }, paths, trace: { TRACE_DIR } } = require('@atlasbound/kit');
const HOST = require('../contracts/host.json');
const validate = require('../contracts/validate.cjs');
const { STORE } = require('../contracts/shapes.cjs');
const core = require('../core/host.cjs');
const { isOn, onHere } = require('../core/modules.cjs');
const { PRODUCT } = require('../contracts/verbs.cjs');

const STATE = '.atlasbound/cli/installed.json';
const createFiles = [HOST.ignore, HOST.mcp, HOST.settings];
const committable = [...HOST.settingsFiles, HOST.mcp];
const UNSAFE = /["`$\n]/;

function parsed({ fs }, key) {
  const text = fs.readText(key);
  if (text === null) return {};
  try {
    return validate.shape('HostFile', validate.json(text));
  } catch (err) {
    throw fail('host-invalid', `${key}: ${err.code}`);
  }
}
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

function plan(ctx, manifests, packages, on) {
  const base = core.desiredOf({ host: HOST, bin: ctx.self.bin, node: ctx.self.node, manifests });
  // the cli's own free verbs and each installed package's; an off module's verbs ask again
  const free = packages.catalog.free.filter(({ pkg }) => !pkg || isOn(ctx.modules, pkg, on)).map(({ words }) => words);
  const desired = { ...base, allow: core.allowOf({ free, bin: PRODUCT, manifests }) };
  const bodyOf = (f) => {
    const text = packages.readFrom(f.pkg, f.src);
    if (text === null) throw fail('package-broken', f.src);
    return text;
  };
  const wanted = Object.fromEntries(desired.files.map((f) => [f.key, bodyOf(f)]));
  return { desired, wanted, on, settings: parsed(ctx, HOST.settings), mcp: parsed(ctx, HOST.mcp), prior: priorOf(ctx) };
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

function write(ctx, planned) {
  const { desired, mcp, prior, on } = planned;
  ctx.fs.writeAtomic(HOST.ignore, core.swapBlock(ctx.fs.readText(HOST.ignore) || '', HOST.ignoreMarks, desired.ignore));
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
  ctx.fs.writeAtomic(STATE, core.textOf({ schema: 'cli-install/2', modules: on, files, servers, linked, foreign, allow }));
  // the host files this write placed, settings last
  return { foreign, linked, retired, placed: createFiles.filter((key) => key !== HOST.mcp || servers.length) };
}

/** A write setup refused and named (a link, the person's own file) is no drift: `fix: atlasbound setup` would only refuse it again. */
function drift({ fs }, { desired, wanted, settings, mcp, prior }) {
  const held = [...prior.linked, ...prior.foreign.filter((key) => fs.readText(key) !== null)];
  const bodies = Object.fromEntries(desired.files.map((f) => [f.key, held.includes(f.key) ? wanted[f.key] : fs.readText(f.key)]));
  return core.driftOf(desired, { settings, mcp, wanted, bodies, ignore: fs.readText(HOST.ignore) || '' });
}

const ancestors = (key) => key.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'));

async function pruneEmpty({ fs, proc, env, root }, dirs) {
  for (const dir of [...new Set(dirs)].sort((a, b) => b.length - a.length)) {
    if (fs.list(dir)?.length === 0) await proc.run({ cmd: 'rmdir', args: [`${root}/${dir}`], env: paths.childEnv(env, ['PATH'], root), cwd: root, timeoutMs: 5000 });
  }
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

function takeHostLines(ctx, prior, { mcp, settings }) {
  if (prior.servers.length) saveOrRemove(ctx, HOST.mcp, core.withoutServers(mcp, prior.servers));
  if (ctx.fs.readText(HOST.settings) !== null) saveOrRemove(ctx, HOST.settings,
    core.withoutRows(core.withAllow(settings, [], prior.allow).settings));
  const before = ctx.fs.readText(HOST.ignore);
  const after = core.swapBlock(before || '', HOST.ignoreMarks, null);
  if (before !== null && after !== before) (after ? ctx.fs.writeAtomic(HOST.ignore, after) : ctx.fs.remove(HOST.ignore));
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

async function unwrite(ctx, { purge, free, stores = [], home = [], team = [] }) {
  const prior = priorOf(ctx);
  const files = { mcp: parsed(ctx, HOST.mcp), settings: parsed(ctx, HOST.settings) }; // a bad file refuses before anything is removed
  const hostBefore = createFiles.map((key) => [key, ctx.fs.readText(key)]);
  const { removed, kept } = removeFiles(ctx, prior.files);
  takeHostLines(ctx, prior, files);
  const taken = await removeTrees(ctx, plainOf(free));
  const left = await leaveOrPurge(ctx, { purge, stores, home, teamFiles: team });
  await pruneEmpty(ctx, [...[...removed, HOST.settings].flatMap(ancestors), STORE]);
  const changed = hostBefore.filter(([key, before]) => before !== null && ctx.fs.readText(key) !== before).map(([key]) => key);
  return { kept: [...kept, ...left.kept], team: left.team, tookFrom: changed.filter((key) => ctx.fs.readText(key) !== null),
    removed: [...removed, ...changed.filter((key) => ctx.fs.readText(key) === null), ...taken, ...left.purged] };
}

const createHost = (ctx) => ({
  mcpFile: HOST.mcp, gateProbe: HOST.gateProbe,
  committable,
  grants: (tracked) => HOST.settingsFiles.filter((key) => tracked.includes(key)).flatMap((key) => core.grantsOf(parsed(ctx, key)).map((row) => `${key}: ${row}`)),
  refusal: () => refusal(ctx),
  chosen: () => chosenOf(ctx),
  plan: (manifests, packages, on = onHere(ctx.modules.modules, chosenOf(ctx))) => plan(ctx, manifests, packages, on),
  write: (planned) => write(ctx, planned),
  drift: (planned) => drift(ctx, planned),
  unwrite: (opts) => unwrite(ctx, opts),
  present: (keys) => present(ctx, keys),
  purgeList: (asked) => purgeList(ctx, asked),
});

module.exports = { createHost, refuseStrayRoot, projectEnv: HOST.projectEnv, sessionEnv: HOST.sessionEnv, pidEnv: HOST.pidEnv,
  sessionWrites: [HOST.gateProbe] };
