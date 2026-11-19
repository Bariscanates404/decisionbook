// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE path owner. A key names one repository file: NFC, POSIX, relative, no dot or empty segment, never above the root, case kept; `\` is
// always a separator.
const path = require('node:path');
const { fail } = require('./errors.cjs');
const { sha256 } = require('./hash.cjs');

const HOST = /^(?:\/|[A-Za-z]:)/; // a leading `/` or a drive; `C:x` counts: on Windows it means the current directory of drive C

const tidy = (spelling) => spelling.normalize('NFC').replace(/\\/g, '/');
const segmentsOf = (text) => text.split('/').filter((segment) => segment !== '' && segment !== '.');

function keyOf(spelling) {
  if (typeof spelling !== 'string') return { code: 'path-empty' };
  const text = tidy(spelling);
  if (HOST.test(text)) return { code: 'path-absolute' };
  const segments = segmentsOf(text);
  if (segments.includes('..')) return { code: 'path-outside-repo' };
  return segments.length ? { key: segments.join('/') } : { code: 'path-empty' };
}

function pathKey(spelling) {
  const { key, code } = keyOf(spelling);
  if (code) throw fail(code, spelling);
  return key;
}

// NFKC (a full-width dot is a dot) for a rule a look-alike must not pass; never a file's identity.
const foldedKey = (input) => pathKey(input).normalize('NFKC');

const isKey = (text) => typeof text === 'string' && keyOf(text).key === text;

// Refused like a key, but the bytes stay, so an NFD name is found on a byte-exact disk.
function under(root, spelling) {
  pathKey(spelling);
  return path.join(root, spelling);
}

const dirOf = (key) => key.slice(0, Math.max(key.lastIndexOf('/'), 0));

function speller(listed) {
  const exact = new Set(listed);
  const forms = Map.groupBy(exact, (spelling) => spelling.normalize('NFC'));
  return (echo) => {
    if (typeof echo !== 'string') return null;
    if (exact.has(echo)) return echo;
    const same = forms.get(echo.normalize('NFC')) || [];
    return same.length === 1 ? same[0] : null;
  };
}

function hostForm(spelling) {
  if (typeof spelling !== 'string') return null;
  const text = tidy(spelling);
  return HOST.test(text) ? text.replace(/^[A-Z]:/, (drive) => drive.toLowerCase()) : null;
}

// Windows names a folder in any case and with either separator: the spelling two of its folders are compared in
const winFolder = (dir) => dir.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
// `anyCase`: the root is no repository (a person's home), so where its spelling is Windows' the folder is one in any case
function repoRel(root, hostFile, anyCase = false) {
  const base = hostForm(root);
  const file = hostForm(hostFile);
  if (base === null || file === null) return null;
  const prefix = `${base.replace(/\/+$/, '')}/`;
  const under = anyCase && WIN_ROOT.test(prefix) ? winFolder(file.slice(0, prefix.length)) === winFolder(prefix) : file.startsWith(prefix);
  return under ? (keyOf(file.slice(prefix.length)).key ?? null) : null;
}

function join(dir, rel) {
  if (typeof rel !== 'string' || HOST.test(tidy(rel))) return null;
  const stack = [];
  for (const segment of segmentsOf(`${dir}/${tidy(rel)}`)) {
    if (segment !== '..') stack.push(segment);
    else if (stack.pop() === undefined) return null;
  }
  const key = stack.join('/');
  return key === '' || isKey(key) ? key : null;
}

const inside = (root, dir) => dir === root || dir.startsWith(`${root.replace(/\/+$/, '')}${path.sep}`);

// The repository must never bring its own tool: a child's PATH keeps only absolute directories outside `root` (`real`: where a spelling
// leads, so a link into it is inside).
function pathOutside(value, root, real = () => null) {
  const base = real(root) ?? root;
  return value.split(path.delimiter).filter((dir) => path.isAbsolute(dir) && !inside(root, dir) && !inside(base, real(dir) ?? dir))
    .join(path.delimiter);
}

// Not an empty PATH (searches the child's cwd), not an absent one (`/bin/sh`'s default holds `.`).
const SYSTEM_PATH = ['/usr/bin', '/bin'].join(path.delimiter);

// Windows starts a bare program word from the child's own folder before its PATH (CreateProcess's order, which node keeps), so a
// repository would bring its own `git.exe`: there the word is looked up on the child's PATH alone, its absolute folders, as CreateProcess
// tries it (a word with an ending as it is, then .com, then .exe). `exists(file)`: the disk's answer -> the file, or null: none has it.
// THE folders of a Windows PATH a word is looked up in: its absolute ones (a drive root or a share), quotes and a final separator aside.
const windowsFolders = (value) => String(value ?? '').split(';').map((dir) => dir.replace(/"/g, ''))
  .filter((dir) => /^(?:[A-Za-z]:[\\/]|\\\\)/.test(dir)).map((dir) => dir.replace(/[\\/]+$/, ''));
function windowsProgram(cmd, env, exists) {
  if (/[\\/]/.test(cmd)) return cmd;
  const key = Object.keys(env ?? {}).find((name) => name.toUpperCase() === 'PATH');
  const dirs = windowsFolders(key ? env[key] : '');
  const names = [...(/\.\w+$/.test(cmd) ? [cmd] : []), `${cmd}.com`, `${cmd}.exe`];
  return dirs.flatMap((dir) => names.map((name) => `${dir}\\${name}`)).find(exists) ?? null;
}

function childEnv(env, keys, root) {
  const { PATH: found = '', ...rest } = env.pick(keys);
  return { ...rest, PATH: pathOutside(found, root, env.realOf) || SYSTEM_PATH };
}

// HOST paths: their bytes stay and no NFC touches them (on a byte-exact disk that would name another directory).
const parentDir = (dir) => path.dirname(dir);
const nameOf = (spelling) => path.basename(spelling);
// the program a command word names: its last part, any case (a disk that folds case runs RM as rm), no .exe, @version or trailing version
const programOf = (word) => String(word ?? '').split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, '').replace(/(?<=.)@.*$/, '')
  .replace(/[\d.]+$/, '');
// whether a process's command words name one of `names`: as a path part of its first two words (the program, or the script it was handed)
const commandNames = (words, names) => words.slice(0, 2).flatMap((word) => word.split('/')).some((part) => names.includes(part));
// A path as this host opens it: on Windows, Git Bash's own `/c/...` is the drive's `C:\...`, in the host's spelling (path.win32).
const hostPath = (spelling, windows = path.sep === '\\') => (windows && typeof spelling === 'string'
  ? path.win32.normalize(spelling.replace(/^\/([A-Za-z])(?=\/|$)/, '$1:/')) : spelling);
const resolveFrom = (from, dir) => path.resolve(from, hostPath(dir));
const PATH_MAX = 4096; // the longest path a disk opens: a cd chain past it is not followed

function folderAfter(cd, cwd, past) {
  const dir = cd.reduce((at, step) => (at === null || at.length > PATH_MAX || past() ? null : resolveFrom(at, step)), cwd);
  return dir !== null && dir.length <= PATH_MAX ? dir : null;
}

// A drive or a `\` root is a Windows spelling (node hands __dirname and the cwd so there): its parents are win32's, the drive root left out
// as `/` is.
const WIN_ROOT = /^(?:[A-Za-z]:[\\/]|\\)/;

function upward(dir) {
  const host = WIN_ROOT.test(dir) ? path.win32 : path.posix;
  const chain = [];
  for (let at = WIN_ROOT.test(dir) ? dir.replace(/(?<!^[A-Za-z]:)[\\/]+$/, '') : dir.replace(/\/+$/, ''); at && host.dirname(at) !== at;
    at = host.dirname(at)) chain.push(at);
  return chain;
}

const OWN_STORE = '.atlasbound/'; // THE product's own store, in a repository and in a person's home (the port's seal and the shell gate seal it)
// THE home resolver: a package's folder for this repository in the person's home. A person's words live there, never in a repository.
const hereKey = (root, pkg, ...names) => [`${OWN_STORE}${pkg}-here`, sha256(root).slice(0, 16), ...names].join('/');

module.exports = { hostPath,
  pathKey, foldedKey, isKey, under, dirOf, speller, repoRel, join, childEnv, parentDir, nameOf, programOf, resolveFrom,
  folderAfter, upward, hereKey, OWN_STORE, commandNames, windowsProgram, winFolder, windowsFolders };
