// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE file-IO owner: absent is null, never '' or []; a write is atomic and never goes through a link; a read follows links unless `noLink`
// ('symbolic' lets a hard link through).
// Named limit: a PARENT directory swapped after its check is followed (whoever can do that could write the target anyway).
const fs = require('node:fs');
const { isUtf8 } = require('node:buffer');
const { under, dirOf, repoRel, join, parentDir, nameOf, resolveFrom } = require('../base/paths.cjs');
const { fail, isFail } = require('../base/errors.cjs');

const ABSENT = new Set(['ENOENT', 'ENOTDIR']);
const READ_REFUSALS = ['path-link', 'io-read-too-large', 'io-read-failed', 'io-read-not-utf8'];
const { O_RDONLY, O_NONBLOCK, O_NOFOLLOW, O_WRONLY, O_APPEND, O_CREAT } = fs.constants;
const READ = O_RDONLY | O_NONBLOCK;
const APPEND = O_WRONLY | O_APPEND | O_CREAT | O_NOFOLLOW;
// Half of V8's longest string, so a read never ends in ERR_STRING_TOO_LONG after paying for it.
const READ_CAP = 256 * 1024 * 1024;
const OPEN = { dir: 0o777, file: 0o666, tight: false };
const PRIVATE = { dir: 0o700, file: 0o600, tight: true }; // OPEN: the umask decides
let temps = 0;

function unless(errno, op) {
  try {
    op();
    return true;
  } catch (err) {
    if (err.code === errno) return false;
    throw err;
  }
}

function replace(impl, file, text, mode) {
  const tmp = `${file}.tmp.${process.pid}.${(temps += 1)}`;
  try {
    impl.writeFileSync(tmp, text, { flag: 'wx', mode });
    impl.renameSync(tmp, file);
  } catch (err) {
    impl.rmSync(tmp, { force: true });
    throw err;
  }
}

/** `tail`: a file over maxBytes gives its last maxBytes bytes (its first line may be cut), never a refusal. */
function readBounded(impl, file, { key, noLink, maxBytes, wholeUtf8, tail }) {
  const fd = impl.openSync(file, noLink ? READ | O_NOFOLLOW : READ);
  try {
    const st = impl.fstatSync(fd);
    if (!st.isFile()) throw fail('io-read-failed', `${key}: not a regular file`);
    if (st.size > maxBytes && !tail) throw fail('io-read-too-large', `${key}: ${st.size} bytes`);
    const bytes = st.size > maxBytes ? Buffer.alloc(maxBytes) : impl.readFileSync(fd);
    if (st.size > maxBytes) impl.readSync(fd, bytes, 0, maxBytes, st.size - maxBytes);
    if (wholeUtf8 && !isUtf8(bytes)) throw fail('io-read-not-utf8', key);
    return bytes.toString('utf8');
  } finally {
    impl.closeSync(fd);
  }
}

// `hold`: a folder kept in this process (a verb that only reads leaves no file there, yet reads back what it wrote); a removed file is
// null, its folders stay.
function holding(disk, dir) {
  const held = new Map();
  const folders = new Set();
  const holds = (key) => key.startsWith(`${dir}/`);
  const textOf = (key, opts) => (held.has(key) ? held.get(key) : disk.readText(key, opts));
  const exists = (key) => (held.has(key) ? held.get(key) !== null : folders.has(key) || disk.exists(key));
  function list(key) {
    const found = disk.list(key);
    if (found === null && !folders.has(key)) return null;
    const names = new Set([...(found || []), ...[...folders].filter((f) => dirOf(f) === key).map(nameOf)]);
    for (const [k, text] of held) if (dirOf(k) === key) names[text === null ? 'delete' : 'add'](nameOf(k));
    return [...names].sort();
  }
  const folder = (key) => { for (let up = key; up; up = dirOf(up)) folders.add(up); };
  function put(key, text) {
    folder(dirOf(key));
    return Boolean(held.set(key, text));
  }
  return {
    ...disk, readText: textOf, exists, list,
    writeAtomic: (key, text) => (holds(key) ? put(key, text) : disk.writeAtomic(key, text)),
    append: (key, text) => (holds(key) ? put(key, (textOf(key) ?? '') + text) : disk.append(key, text)),
    remove: (key) => (holds(key) ? exists(key) && put(key, null) : disk.remove(key)),
    makeDir: (key) => (holds(key) ? folder(key) : disk.makeDir(key)),
    createExclusive: (key, text) => (holds(key) ? !exists(key) && put(key, text) : disk.createExclusive(key, text)),
    rename: (from, to) => {
      if (holds(from) || holds(to)) throw fail('io-write-failed', `${to}: a held folder takes no rename`);
      return disk.rename(from, to);
    },
  };
}

/** `private` (a person's home): what this fs makes is the user's alone, folders 0700 and files 0600, and a wider one is tightened at its
 * next write. */
function createFs(root, { impl = fs, hold = null, private: own = false } = {}) {
  const disk = diskFs(root, impl, own ? PRIVATE : OPEN);
  return hold === null ? disk : holding(disk, hold);
}

function diskFs(root, impl, modes) {
  const at = (key) => under(root, key);
  const tighten = (key, mode) => { // each folder of the key under the root, then the key itself
    const parts = key.split('/');
    if (modes.tight) parts.forEach((_, i) => impl.chmodSync(at(parts.slice(0, i + 1).join('/')), i < parts.length - 1 ? modes.dir : mode));
  };
  const parentOf = (key) => (dirOf(key) ? at(dirOf(key)) : root);
  function orNull(op, key, noLink = false) {
    const file = at(key); // a refused key (path-*) stays its own code, outside the try
    try {
      return op(file);
    } catch (err) {
      if (ABSENT.has(err.code)) return null;
      if (err.code === 'ELOOP' && noLink) throw fail('path-link', key);
      throw READ_REFUSALS.includes(err.code) ? err : fail('io-read-failed', `${key}: ${err.code || err.name}`);
    }
  }
  function refuseLinks(file, key, symbolicOnly = false) {
    const base = String(root).replace(/\/+$/, '');
    const parts = file.slice(base.length + 1).split('/');
    parts.forEach((_, i) => {
      const st = impl.lstatSync(`${base}/${parts.slice(0, i + 1).join('/')}`, { throwIfNoEntry: false });
      const hardLinked = !symbolicOnly && i === parts.length - 1 && st?.isFile() && st.nlink > 1;
      if (st && (st.isSymbolicLink() || hardLinked)) throw fail('path-link', key);
    });
  }
  function changing(key, op, make = true) {
    const file = at(key);
    try {
      refuseLinks(file, key);
      if (make) impl.mkdirSync(parentOf(key), { recursive: true, mode: modes.dir });
      return op(file);
    } catch (err) {
      if (err.code === 'ELOOP') throw fail('path-link', key);
      throw isFail(err, 'path-link') ? err : fail('io-write-failed', `${key}: ${err.code || err.name}`);
    }
  }
  return {
    readText: (key, { noLink = false, maxBytes = READ_CAP, wholeUtf8 = false, tail = false } = {}) => orNull((p) => {
      if (noLink) refuseLinks(p, key, noLink === 'symbolic');
      return readBounded(impl, p, { key, noLink, maxBytes, wholeUtf8, tail });
    }, key, noLink),
    real: (key) => orNull((p) => realKey(impl, root, p), key),
    keyAt: (hostPath) => keyAt(impl, root, hostPath),
    placeAt: (hostPath, known) => placeAt(impl, root, hostPath, known),
    list: (key) => orNull((p) => impl.readdirSync(p).sort(), key),
    exists: (key) => orNull((p) => Boolean(impl.statSync(p)), key) === true,
    mtimeMs: (key) => orNull((p) => impl.statSync(p).mtimeMs, key), // an order to look in, never a verdict on the bytes
    modeOf: (key) => orNull((p) => impl.statSync(p).mode & 0o777, key), // doctor names a store wider than PRIVATE
    writeAtomic: (key, text) => changing(key, (file) => { replace(impl, file, text, modes.file); tighten(key, modes.file); }),
    append: (key, text) => changing(key, (file) => { impl.appendFileSync(file, text, { flag: APPEND, mode: modes.file }); tighten(key, modes.file); }),
    remove: (key) => changing(key, (file) => impl.rmSync(file, { force: true }), false),
    makeDir: (key) => changing(key, (dir) => { impl.mkdirSync(dir, { recursive: true, mode: modes.dir }); tighten(key, modes.dir); }, false),
    createExclusive: (key, text) => changing(key, (file) => unless('EEXIST', () => { impl.writeFileSync(file, text, { flag: 'wx', mode: modes.file }); tighten(key, modes.file); })),
    rename: (from, to) => changing(to, (file) => unless('ENOENT', () => {
      refuseLinks(at(from), from);
      impl.renameSync(at(from), file);
    })),
  };
}

function realOf(dir, impl = fs) {
  try {
    return impl.realpathSync.native(dir);
  } catch (err) {
    if (['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP'].includes(err.code)) return null;
    throw err;
  }
}

function realKey(impl, root, file) {
  const base = `${impl.realpathSync.native(root)}/`;
  const found = impl.realpathSync.native(file);
  return found.startsWith(base) ? found.slice(base.length) : null;
}

// The key a HOST path writes on this disk, so a gate judges the file and never a spelling; a link out of the root keeps its name.
function keyAt(impl, root, hostPath) {
  if (typeof hostPath !== 'string' || hostPath === '') return null;
  const base = realOf(root, impl) ?? root;
  const rest = [];
  for (let at = resolveFrom(root, hostPath); ; at = parentDir(at)) {
    const real = realOf(at, impl);
    const dir = real === base ? '' : real && repoRel(base, real);
    if (typeof dir === 'string') return join(dir, rest.join('/')) || null;
    if (parentDir(at) === at) return null;
    rest.unshift(nameOf(at));
  }
}

/** how many names the file at a host path has, and which file of this disk it is -> { links, id }; null where no file is there or the
 * disk answers no inode, so two names of one file cannot be told from two files. */
function linkAt(impl, file) {
  const st = impl.statSync(file, { bigint: true, throwIfNoEntry: false });
  return st && st.isFile() && st.ino ? { links: Number(st.nlink), id: `${st.dev}:${st.ino}` } : null;
}

/** THE place of a file a gate judges: where a HOST path is a second name of one of the keys `known()` answers (a hard link: the same
 * device and inode) it is that key, else the key the disk writes (keyAt). `known` is asked only where the file has a second name. */
async function placeAt(impl, root, hostPath, known) {
  const target = typeof hostPath === 'string' && hostPath !== '' ? linkAt(impl, resolveFrom(root, hostPath)) : null;
  const keys = target && target.links > 1 ? await known() : [];
  return keys.find((key) => linkAt(impl, resolveFrom(root, key))?.id === target.id) ?? keyAt(impl, root, hostPath);
}

module.exports = { createFs, realOf };
