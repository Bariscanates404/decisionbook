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

function repoRel(root, hostFile) {
  const base = hostForm(root);
  const file = hostForm(hostFile);
  if (base === null || file === null) return null;
  const prefix = `${base.replace(/\/+$/, '')}/`;
  return file.startsWith(prefix) ? (keyOf(file.slice(prefix.length)).key ?? null) : null;
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

function childEnv(env, keys, root) {
  const { PATH: found = '', ...rest } = env.pick(keys);
  return { ...rest, PATH: pathOutside(found, root, env.realOf) || SYSTEM_PATH };
}

// HOST paths: their bytes stay and no NFC touches them (on a byte-exact disk that would name another directory).
const parentDir = (dir) => path.dirname(dir);
const nameOf = (spelling) => path.basename(spelling);
// the program a command word names: its last part, any case, a trailing version aside (SCREEN is screen, a name ending 3.9 its stem)
const programOf = (word) => nameOf(String(word ?? '')).toLowerCase().replace(/[\d.]+$/, '');
// whether a process's command words name one of `names`: as a path part of its first two words (the program, or the script it was handed)
const commandNames = (words, names) => words.slice(0, 2).flatMap((word) => word.split('/')).some((part) => names.includes(part));
const resolveFrom = (from, dir) => path.resolve(from, dir);
const PATH_MAX = 4096; // the longest path a disk opens: a cd chain past it is not followed

function folderAfter(cd, cwd, past) {
  const dir = cd.reduce((at, step) => (at === null || at.length > PATH_MAX || past() ? null : resolveFrom(at, step)), cwd);
  return dir !== null && dir.length <= PATH_MAX ? dir : null;
}

function upward(dir) {
  const chain = [];
  for (let at = dir.replace(/\/+$/, ''); at; at = at.slice(0, Math.max(at.lastIndexOf('/'), 0))) chain.push(at);
  return chain;
}

const OWN_STORE = '.atlasbound/'; // THE product's own store, in a repository and in a person's home (the write gate and the shell gate seal it)
// THE home resolver: a package's folder for this repository in the person's home. A person's words live there, never in a repository.
const hereKey = (root, pkg, ...names) => [`${OWN_STORE}${pkg}-here`, sha256(root).slice(0, 16), ...names].join('/');

module.exports = { pathKey, foldedKey, isKey, under, dirOf, speller, repoRel, join, childEnv, parentDir, nameOf, programOf, resolveFrom,
  folderAfter, upward, hereKey, OWN_STORE, commandNames };
