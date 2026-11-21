// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PreToolUse on a shell command: each file it writes meets the Edit gate's ladder, the gravest verdict stands; unplaced or unread in
// BUDGET_MS asks.
// A folder written is every file under it; a glob is the folder before its first wildcard. Not a sandbox: Stop sees git.
const { text: { shell: { writtenBy, setBy, readBy } }, paths: { resolveFrom, nameOf, folderAfter }, host: { SHELL_TOOLS },
  scripts: { scriptReaders } } = require('@atlasbound/kit');
const { CONFIG } = require('../contracts/shapes.cjs');
const { unplacedReason, unplacedOf, shellReason, gateReason } = require('../core/text/gate.cjs');
const { guardOf } = require('./host.cjs');
const { anyOverlap, folderOf, isGlob } = require('../base/glob.cjs');
const { isGuarded } = require('../core/gate.cjs');
const { preEdit } = require('./gate.cjs');
const { guardedPolicy } = require('./changed.cjs');
const { sawCall } = require('./phase.cjs');
const { keepReads } = require('./here.cjs');

const RANK = ['deny', 'ask', 'allow'];
const FOLDER = /(?:^|\/)\.{0,2}$/; // spelled as a folder: `.`, `..` or a final `/`
const ANY = ['**', '**/**']; // a file under a folder at one depth and at more: a plan glob that covers both covers every file under it
// the step's time, well inside the hook's 10 s (package.json), so a slow command is asked, never passed by the host's kill
const BUDGET_MS = 1500;

function globReaches(io, key, own) {
  const { config, off } = guardedPolicy(io);
  return config ? anyOverlap([...config.protect, ...config.danger, ...own], [key ? `${key}/**` : '**']) : off === 'policy-unreadable';
}

// a guarded key counts as there: a deleted file comes back; a `maybe` word that is no file names something else (a branch)
const fileThere = (io, key, { config } = guardedPolicy(io)) => key !== null
  && (io.fs.exists(key) || Boolean(config && isGuarded(config, key)));
const holdsRoot = (io, host) => io.fs.keyAt(resolveFrom(host, ANY[0])) === ANY[0] || `${io.root}/`.startsWith(`${host.replace(/\/+$/, '')}/`);
const rootedKey = (io, host) => io.fs.keyAt(host) ?? (holdsRoot(io, host) ? '' : null);
const isFolder = (io, key, spelled) => key === '' || (key !== null && (FOLDER.test(spelled) || io.fs.list(key) !== null));

// a written folder's hosts: a file under it at both depths and the person-only files (policy, a declared guarded folder) under it
function folderAt(io, key, host) {
  const own = [CONFIG, ...(guardOf(io) ? [`${guardOf(io).dir}/**`] : [])];
  const under = own.filter((file) => key === '' || file.startsWith(`${key}/`)).map((file) => resolveFrom(io.root, file));
  const hosts = [...ANY.map((rest) => resolveFrom(key === '' ? io.root : host, rest)), ...under];
  return { folder: `${key || '.'}/`, hosts: globReaches(io, key, own) ? hosts : [] };
}

function landingOf(io, dir, { path, from = [], maybe }) {
  const spelled = isGlob(path) ? `${folderOf(path) || (path.startsWith('/') ? '' : '.')}/` : path;
  const host = resolveFrom(dir, spelled);
  const key = rootedKey(io, host);
  if (!isFolder(io, key, spelled)) return maybe && !fileThere(io, key) ? null : { hosts: [host] };
  return from.length ? { more: from.map((source) => ({ path: nameOf(source), cd: [host] })) } : folderAt(io, key, host);
}

function folderOut({ folder, hosts }, said) {
  if (!hosts.length) return { verdict: 'allow', code: 'gate-not-protected', file: folder };
  const denied = said.find(({ out }) => out.verdict === 'deny');
  if (denied) return denied.out;
  if (said.every(({ out }) => out.code === 'gate-in-scope')) return said[0].out;
  return { verdict: 'ask', code: 'shell-unplaced', file: folder, reason: unplacedReason(folder) };
}

async function judgedAt(io, event, place, seen) {
  const said = [];
  for (const host of place.hosts.filter((file) => place.folder || (!seen.has(file) && seen.add(file)))) {
    const write = { tool_name: 'Write', tool_input: { file_path: host, content: '' }, permission_mode: event.permission_mode };
    said.push(await preEdit({ ...write, session_id: event.session_id }, io, { dry: place.dry }));
  }
  const outs = place.folder ? [folderOut(place, said)] : said.map(({ out }) => out).filter((out) => out.file);
  return { outs, n: Object.assign({}, ...said.map(({ n }) => n)) };
}

async function judgedAll(io, event, read, past) {
  const got = { judged: [], told: {}, folders: 0, unread: read.unread };
  const targets = [...read.writes];
  const seen = new Set();
  for (let i = 0; i < targets.length && !got.unread; i += 1) {
    const dir = past() ? null : folderAfter(targets[i].cd, event.cwd || io.root, past);
    got.unread = dir === null;
    const place = got.unread ? null : landingOf(io, dir, targets[i]);
    if (place && place.more) targets.push(...place.more.map((one) => ({ ...one, copied: true })));
    else if (place) {
      // a copy's landing may be a folder not there yet: it is judged, and never joins the plan as a file
      const { outs, n } = await judgedAt(io, event, { ...place, dry: Boolean(place.folder || targets[i].copied) }, seen);
      got.judged.push(...outs);
      got.folders += Number(Boolean(place.folder));
      Object.assign(got.told, n);
    }
  }
  return got;
}

function gravest(judged) {
  const worst = RANK.map((verdict) => judged.find((out) => out.verdict === verdict)).find(Boolean);
  if (!worst) return { verdict: 'allow', code: 'shell-no-write' };
  if (worst.verdict === 'allow') return { verdict: 'allow', code: 'shell-allowed' };
  return worst.file ? { ...worst, reason: shellReason(worst.reason, worst.file) } : worst;
}

// the files of this repository a command names, where its `cd`s leave it: the reads it receipts (at PreToolUse, before it runs); a
// word the disk refuses to place (a coded fs error) is no receipt, never the judgement's failure
function fileAt(io, dir, word) {
  try {
    const key = io.fs.keyAt(resolveFrom(dir, word));
    return key && io.fs.exists(key) && io.fs.list(key) === null ? key : null;
  } catch (err) {
    if (!err || !err.code) throw err;
    return null;
  }
}
const filesNamed = (io, read, cwd, past) => read.map(({ word, cd }) => [folderAfter(cd, cwd, past), word])
  .filter(([dir]) => dir !== null).map(([dir, word]) => fileAt(io, dir, word)).filter(Boolean);

async function preShell(event, io) {
  const until = io.clock.elapsedMs() + BUDGET_MS;
  const past = () => io.clock.elapsedMs() > until;
  const command = String((event.tool_input || {}).command ?? '');
  const cwd = event.cwd || io.root;
  const lang = SHELL_TOOLS[event.tool_name];
  sawCall(io, event.session_id);
  keepReads(io, event.session_id, filesNamed(io, readBy(command, { lang }), cwd, past), event.tool_name);
  const read = writtenBy(command, past, { lang, ...scriptReaders(io, cwd, past) });
  // the host's variables say which session and project a verb acts for: a command that sets one would act as another
  const posed = setBy(read, io.hostEnv ?? []).join(', ');
  return posed ? { out: { verdict: 'deny', code: 'shell-host-env', reason: gateReason({ code: 'shell-host-env', file: posed }) },
    code: 'shell-host-env', n: { writes: read.writes.length } } : laddered(event, io, read, past);
}

async function laddered(event, io, read, past) {
  const { judged, told, folders, unread } = await judgedAll(io, event, read, past);
  const asking = (read.unplaced || unread) && guardedPolicy(io).off !== 'gate-off';
  const asks = asking ? [{ verdict: 'ask', code: 'shell-unplaced', reason: unplacedOf(read, unread) }] : [];
  const out = gravest([...judged, ...asks]);
  const n = { writes: read.writes.length, judged: judged.length, unplaced: Number(read.unplaced), ...(folders ? { folders } : {}),
    ...(unread ? { unread: 1 } : {}) };
  return { out, code: out.code, n: { ...n, ...told } };
}

module.exports = { preShell };
