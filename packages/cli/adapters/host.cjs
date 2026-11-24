// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE one host-config writer: ignore block first (a stub never shows to git), settings last (they switch hooks on); uninstall takes back
// only what installed.json holds.
const { errors: { fail, isFail }, hash: { sha256 }, trace: { TRACE_DIR }, host: kitHost, paths: { resolveFrom, parentDir, nameOf } } = require('@atlasbound/kit');
const HOST = require('../contracts/host.json');
const validate = require('../contracts/validate.cjs');
const { STORE, CLI_STORE, INSTALL_SCHEMA } = require('../contracts/shapes.cjs');
const core = require('../core/host.cjs');
const teamRow = require('../core/notice.cjs');
const { isOn, onHere } = require('../core/modules.cjs');
const { PRODUCT } = require('../contracts/verbs.cjs');
const { isDeepStrictEqual } = require('node:util');
const { ancestors, pruneEmpty, isThere, removeTrees } = require('./trees.cjs');

const STATE = `${CLI_STORE}/installed.json`;
const createFiles = [HOST.ignore, HOST.mcp, HOST.settings];
const EXCLUDE = 'info/exclude'; // git's ignore file of this checkout alone, as git names it among its own files
const committable = [...HOST.settingsFiles, HOST.mcp];
const UNQUOTABLE = ['"', '`', '$', '\n']; // what a double-quoted shell word cannot carry as itself
const NOTICE = teamRow.noticeRow(HOST, STATE);

function parsed({ fs }, key, shape = 'HostFile') {
  const text = fs.readText(key);
  if (text === null) return {};
  try {
    return validate.shape(shape, validate.json(text));
  } catch (err) {
    throw fail('host-invalid', `${key}: ${err.code}`);
  }
}
/** A settings file as it reads, or null where it does not: the team's file is never a reason to refuse. */
const readable = (hostIo, key) => {
  try {
    return parsed(hostIo, key);
  } catch (err) {
    if (!isFail(err, 'host-invalid')) throw err;
    return null;
  }
};
/** The install record. One that chooses no module is none this cli writes (the last module is never switched off): it does not read. */
function priorOf(hostIo) {
  const record = parsed(hostIo, STATE, 'InstallRecord');
  if (record.modules?.length === 0) throw fail('host-invalid', `${STATE}: shape-invalid`);
  return { files: {}, servers: [], linked: [], allow: [], ...record };
}
/** The modules this repository chose (cli-install/2), only names this install's data knows (`hostIo.modules`: the catalog's); an install
 * from before modules wired every one; null: never set up. */
function chosenOf(hostIo) {
  const every = hostIo.modules.modules.map((m) => m.name);
  return hostIo.fs.readText(STATE) === null ? null : (priorOf(hostIo).modules ?? every).filter((name) => every.includes(name));
}

/** The product marker is a file only this product's own tree holds; a repository's own packages/cli says nothing. */
function refusal({ fs, root, self }) {
  if (fs.readText(HOST.productMarker) !== null) throw fail('target-is-product', root);
  if ([self.bin, self.node].some((path) => UNQUOTABLE.some((char) => path.includes(char)))) throw fail('install-path-unsafe', self.bin);
}

/** A home or temp root: no verb works there and nothing is written, not even a trace; only uninstall enters, where a setup left its
 * state. */
function refuseStrayRoot({ fs, env, root, cleaning }) {
  const named = HOST.unsafeRoots.env.map((name) => env.get(name));
  if (core.isUnsafeRoot(HOST, root, named) && !(cleaning && fs.readText(STATE) !== null)) throw fail('root-unsafe', root);
}

function plan(hostIo, manifests, packages, { on, asked }) {
  const base = core.desiredOf({ host: HOST, bin: hostIo.self.bin, node: hostIo.self.node, manifests });
  // the cli's own free verbs and each installed package's; an off module's verbs ask again
  const wired = ({ pkg }) => !pkg || isOn(hostIo.modules, pkg, on);
  const [free, alone] = ['free', 'alone'].map((key) => packages.catalog[key].filter(wired).map(({ words }) => words));
  const desired = { ...base, allow: core.allowOf({ free, alone, bin: PRODUCT, manifests }) };
  const bodyOf = (f) => {
    const text = packages.readFrom(f.pkg, f.src);
    if (text === null) throw fail('package-broken', f.src);
    return text;
  };
  const wanted = Object.fromEntries(desired.files.map((f) => [f.key, bodyOf(f)]));
  return { desired, wanted, on, settings: parsed(hostIo, HOST.settings), mcp: parsed(hostIo, HOST.mcp), prior: priorOf(hostIo),
    notice: noticePlan(hostIo, asked) };
}

/** The team's row: `was` where it stands; `joined`: this machine never set this clone up and git brought the ignore block, so the team
 * did; `put`: written in a clone nobody set up yet, or where the person `asked` (setup --team-notice). Otherwise the file stays as it is:
 * another version's row still works, and a row switched off on purpose stays off. */
function noticePlan(hostIo, asked = false) {
  const team = readable(hostIo, HOST.notice.file);
  const was = team ? teamRow.standing(team, NOTICE) : 'unread';
  const block = core.ignoreParts(hostIo.fs.readText(HOST.ignore) || '', HOST.ignoreMarks).block !== null;
  const never = hostIo.fs.readText(STATE) === null;
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

// each file at a path of ours that is neither ours nor what an earlier setup wrote there: the person's own where none did (setup
// stops), else ours they changed since (`ours`: it comes back, their text kept beside it)
const changedAt = ({ fs }, { desired, wanted, prior }) => desired.files.map(({ key }) => ({ key, now: fs.readText(key) }))
  .filter(({ key, now }) => now !== null && now !== wanted[key] && sha256(now) !== prior.files[key])
  .map((file) => ({ ...file, ours: Object.hasOwn(prior.files, file.key) }));
/** The person's text of a file of ours they changed, kept beside it under a name of its own digest (no host reads it as a command, and
 * no other text ever takes that name). -> [key, the copy] */
function keptCopy({ fs }, { key, now }) {
  const copy = `${key}.${sha256(now).slice(0, 8)}.yours`;
  fs.writeAtomic(copy, now);
  return [key, copy];
}
// each file written (by its digest), or refused for a link in its path
function placeFiles({ fs }, { desired, wanted }) {
  const out = { files: {}, linked: [] };
  for (const { key } of desired.files) {
    if (placed(fs, key, wanted[key])) out.files[key] = sha256(wanted[key]);
    else out.linked.push(key);
  }
  return out;
}

function saveOrRemove({ fs }, key, value) {
  if (value) fs.writeAtomic(key, core.textOf(value));
  else fs.remove(key);
}

// each file an earlier setup wrote, taken back: `held` where git holds it (the team's, whatever the record says), `kept` where changed
function removeFiles({ fs }, files, tracked) {
  const out = { removed: [], kept: [], held: [] };
  Object.entries(files).filter(([key]) => fs.readText(key) !== null).forEach(([key, sum]) => {
    out[tracked.includes(key) ? 'held' : sha256(fs.readText(key)) === sum ? 'removed' : 'kept'].push(key);
  });
  out.removed.forEach((key) => fs.remove(key));
  return out;
}

/** The block is written where it lacks a line, or holds one no longer wanted that names a file here and not this machine's (`own`: the
 * repository's own MCP file, a command the person kept: it would hide theirs from git); else a committed block stays byte for byte. */
function writeIgnore(hostIo, wanted, own, text = hostIo.fs.readText(HOST.ignore) || '') {
  const held = core.ignoreParts(text, HOST.ignoreMarks).block || [];
  const hides = held.some((entry) => ![...wanted, ...own].includes(entry) && /^(?!.*\.\.)[\w.][\w./-]*$/.test(entry) && hostIo.fs.exists(entry));
  const stale = hides || wanted.some((entry) => !held.includes(entry));
  if (stale) hostIo.fs.writeAtomic(HOST.ignore, core.swapBlock(text, HOST.ignoreMarks, wanted));
  return stale;
}
/** This checkout's own ignore file, where git says it is (`exclude`: under `.git`, or for a linked worktree in its main clone), with
 * our block holding `entries` (none: the block goes): git's, never committed. */
function writeExclude(hostIo, exclude, entries) {
  const file = resolveFrom(hostIo.root, exclude);
  const fs = hostIo.fsAt(parentDir(file));
  const text = fs.readText(nameOf(file)) ?? '';
  const next = core.swapBlock(text, HOST.ignoreMarks, entries.length ? entries : null);
  if (next !== text) fs.writeAtomic(nameOf(file), next);
}

/** One check, then the writes: a file of the person's own at a path of ours stops setup before it writes anything. */
function write(hostIo, planned, { tracked, exclude }) {
  const { desired, mcp, prior, on } = planned;
  const changed = changedAt(hostIo, planned);
  const foreign = changed.filter((file) => !file.ours).map((file) => file.key);
  if (foreign.length) throw fail('file-foreign', foreign.join(', ')); // its code's words say the rest (contracts/words)
  const ignored = writeIgnore(hostIo, desired.ignore, desired.exclude);
  writeExclude(hostIo, exclude, desired.exclude);
  const restored = changed.map((file) => keptCopy(hostIo, file));
  // the team's file as it was before our row joined it: uninstall gives those bytes back where the row is all it takes out
  const teamWas = (planned.notice.put && planned.notice.was === 'none' ? hostIo.fs.readText(HOST.notice.file) : prior.teamWas) ?? undefined;
  if (planned.notice.put) hostIo.fs.writeAtomic(HOST.notice.file, core.textOf(teamRow.withRow(planned.notice.team, NOTICE)));
  const { files, linked } = placeFiles(hostIo, planned);
  const wanted = new Set(desired.files.map((f) => f.key));
  const retired = removeFiles(hostIo, Object.fromEntries(Object.entries(prior.files).filter(([key]) => !wanted.has(key))), tracked);
  const servers = Object.keys(desired.servers);
  if (servers.length || prior.servers.length) {
    const left = core.withoutServers(mcp, prior.servers);
    saveOrRemove(hostIo, HOST.mcp, servers.length ? core.withServers(left || {}, desired.servers) : left);
  }
  const { settings, added: allow } = core.withAllow(core.withRows(parsed(hostIo, HOST.settings), desired), desired.allow, prior.allow);
  hostIo.fs.writeAtomic(HOST.settings, core.textOf(settings));
  hostIo.fs.writeAtomic(STATE, core.textOf({ schema: INSTALL_SCHEMA, modules: on, files, servers, linked, allow, teamWas }));
  hostIo.fs.makeDir(TRACE_DIR); // this machine's store from here on: every verb records (adapters/compose)
  // the host files this write placed, settings last
  const placedWhen = { [HOST.ignore]: ignored, [HOST.notice.file]: planned.notice.put, [HOST.mcp]: servers.length > 0 }; // else placed
  const placed = [...createFiles.slice(0, -1), HOST.notice.file, HOST.settings]
    .filter((key) => !Object.hasOwn(placedWhen, key) || placedWhen[key]);
  return { linked, retired, restored, placed, notice: planned.notice };
}

/** A write setup refused and named (a link) is no drift: doctor's `fix:` line would only have it refused again. */
function drift({ fs }, { desired, wanted, settings, mcp, prior }) {
  const bodies = Object.fromEntries(desired.files.map((f) => [f.key, prior.linked.includes(f.key) ? wanted[f.key] : fs.readText(f.key)]));
  return core.driftOf(desired, { settings, mcp, wanted, bodies, ignore: fs.readText(HOST.ignore) || '' });
}

/** The team's file with our row out: the bytes it had before the row joined where nothing else changed since, else its text. */
const teamBack = (prior, left) => (prior.teamWas && isDeepStrictEqual(validate.json(prior.teamWas), left) ? prior.teamWas
  : left && core.textOf(left));
/** Each host file uninstall changes -> [key, its text after, null: removed]. */
function linesOut(hostIo, prior, { mcp, settings, team }) {
  const json = (value) => (value ? core.textOf(value) : null);
  const ignore = hostIo.fs.readText(HOST.ignore);
  const local = hostIo.fs.readText(HOST.settings) === null ? undefined
    : json(core.withoutRows(core.withAllow(settings, [], prior.allow).settings));
  return [[HOST.mcp, prior.servers.length ? json(core.withoutServers(mcp, prior.servers)) : undefined], [HOST.settings, local],
    [HOST.notice.file, team && teamRow.standing(team, NOTICE) !== 'none' ? teamBack(prior, core.withoutRows(team, NOTICE.ours)) : undefined],
    [HOST.ignore, ignore === null ? undefined : core.swapBlock(ignore, HOST.ignoreMarks, null) || null]]
    .filter(([key, next]) => next !== undefined && next !== hostIo.fs.readText(key));
}

/** A file git holds as it is (`fromGit`) is the team's: never rewritten; -> those our lines stayed in. */
function takeHostLines(hostIo, prior, files, fromGit) {
  const out = linesOut(hostIo, prior, files);
  out.filter(([key]) => !fromGit.includes(key))
    .forEach(([key, next]) => (next === null ? hostIo.fs.remove(key) : hostIo.fs.writeAtomic(key, next)));
  return out.map(([key]) => key).filter((key) => fromGit.includes(key));
}

/** THE answer to which declared stores are on disk: `here` in the repository, `home` in this user's home; modules off and uninstall both
 * ask it. */
function present(hostIo, { here = [], home = [] }) {
  const dir = home.length ? hostIo.env.userHome() : null;
  const homeIo = dir ? { ...hostIo, fs: hostIo.fsAt(dir), root: dir } : null;
  return { here: here.filter((key) => isThere(hostIo, key)), home: homeIo ? home.filter((key) => isThere(homeIo, key)) : [], homeIo };
}

const plainOf = (free) => [CLI_STORE, TRACE_DIR, ...free]; // what a plain uninstall takes whole

/** THE one list of what --purge deletes beyond a plain uninstall, read from the disk before anything goes: every folder of the product's
 * store here but the team's files and what the plain part takes whole, the stores handed in (a plan store git does not track), and this
 * repository's folders in the person's home that are there. The question names this list and the purge removes exactly it. */
function purgeList(hostIo, { free, stores, home, team = [] }) {
  const spared = [...team, ...plainOf(free)];
  const here = [...(hostIo.fs.list(STORE) || []).map((name) => `${STORE}/${name}`), ...stores].filter((key) => !spared.includes(key) && isThere(hostIo, key));
  return { here, home: present(hostIo, { home }).home };
}

/** `purge`: the list the person said yes to, or null for a plain uninstall, which says what stays. */
async function leaveOrPurge(hostIo, { purge, stores, home, teamFiles }) {
  const left = [...(hostIo.fs.list(STORE) || []).map((name) => `${STORE}/${name}`), ...stores];
  const team = teamFiles.filter((key) => left.includes(key));
  const { home: mine, homeIo } = present(hostIo, { home });
  const tilde = (keys) => keys.map((key) => `~/${key}`);
  if (!purge) return { team, kept: [...left.filter((one) => !team.includes(one)), ...tilde(mine)], purged: [] };
  return { team, kept: [],
    purged: [...await removeTrees(hostIo, purge.here), ...tilde(homeIo ? await removeTrees(homeIo, purge.home) : [])] };
}

async function unwrite(hostIo, { purge, free, stores = [], home = [], team = [], fromGit = [], clone }) {
  const prior = priorOf(hostIo);
  // a bad file refuses before anything is removed; the team's file only goes unread
  const files = { mcp: parsed(hostIo, HOST.mcp), settings: parsed(hostIo, HOST.settings), team: readable(hostIo, HOST.notice.file) };
  const hostBefore = [...createFiles, HOST.notice.file].map((key) => [key, hostIo.fs.readText(key)]);
  const { removed, kept, held: byGit } = removeFiles(hostIo, prior.files, clone.tracked);
  const held = takeHostLines(hostIo, prior, files, fromGit);
  writeExclude(hostIo, clone.exclude, []);
  const taken = await removeTrees(hostIo, plainOf(free));
  const left = await leaveOrPurge(hostIo, { purge, stores, home, teamFiles: team });
  await pruneEmpty(hostIo, [...[...removed, HOST.settings].flatMap(ancestors), STORE]);
  const changed = hostBefore.filter(([key, before]) => before !== null && hostIo.fs.readText(key) !== before).map(([key]) => key);
  const gone = changed.filter((key) => hostIo.fs.readText(key) === null);
  return { kept: [...kept, ...left.kept], team: left.team, fromGit: held, byGit, tookFrom: changed.filter((key) => !gone.includes(key)),
    removed: [...removed, ...gone, ...taken, ...left.purged] };
}

const createHost = (hostIo) => ({
  mcpFile: HOST.mcp, gateProbe: HOST.gateProbe, user: HOST.hostUser,
  // what the port's seal keeps the AI's write out of; `whole`: the files any write of asks (the host's other settings file here, which
  // can switch every hook off, and each command file this install placed)
  ownFiles: { settings: HOST.settings, ignore: HOST.ignore, marks: HOST.ignoreMarks,
    whole: () => [...HOST.settingsFiles.filter((key) => key !== HOST.settings), ...Object.keys(priorOf(hostIo).files)] },
  committable, noticeFile: HOST.notice.file, hostFiles: [HOST.ignore, ...committable],
  grants: (tracked) => HOST.settingsFiles.filter((key) => tracked.includes(key))
    .flatMap((key) => core.grantsOf(parsed(hostIo, key), NOTICE).map((row) => `${key}: ${row}`)),
  notice: () => noticePlan(hostIo).was,
  refusal: () => refusal(hostIo),
  chosen: () => chosenOf(hostIo),
  plan: (manifests, packages, on = onHere(hostIo.modules.modules, chosenOf(hostIo)), asked = false) =>
    plan(hostIo, manifests, packages, { on, asked }),
  // what git is asked before a write
  stateFile: STATE, stateFiles: () => [STATE, ...Object.keys(priorOf(hostIo).files)], excludeFile: EXCLUDE,
  write: (planned, clone) => write(hostIo, planned, clone),
  drift: (planned) => drift(hostIo, planned),
  unwrite: (opts) => unwrite(hostIo, opts),
  present: (keys) => present(hostIo, keys),
  purgeList: (asked) => purgeList(hostIo, asked),
});

module.exports = { createHost, refuseStrayRoot, projectEnv: HOST.projectEnv, sessionEnv: HOST.sessionEnv, pidEnv: HOST.pidEnv,
  sessionWrites: [HOST.gateProbe, kitHost.DRAFTS] };
