// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE env owner: the only reader of process.env. A child gets an explicit allowlist, never the parent's env; absence stays absent (null or
// omitted, never '').
const os = require('node:os');
const { fail } = require('../base/errors.cjs');
const { realOf } = require('./fs.cjs');
const { winFolder } = require('../base/paths.cjs');

const ABSOLUTE = /^(?:[/\\]|[A-Za-z]:[/\\])/; // a POSIX or backslash root, or a drive root; `C:rel` hangs off the drive's cwd

// The type check: process.env inherits `constructor` and friends from Object.
function get(name) {
  const value = process.env[name];
  return typeof value === 'string' && value !== '' ? value : null;
}

const pick = (keys) => Object.fromEntries(keys.map((key) => [key, get(key)]).filter(([, value]) => value !== null));

// By the password database, not `os.homedir()` (which answers HOME): env must not be able to fake it.
function userHome() {
  try {
    return os.userInfo().homedir || null;
  } catch (err) {
    if (err.code !== 'ERR_SYSTEM_ERROR') throw err;
    return null; // no password entry is a state of the machine: the caller says so with its own code
  }
}

// Per-user state (approvals), chosen by no env; only while a set HOME names that same home, so a test or planted HOME sees no approval and
// writes none. On Windows (`platform`) a folder is one in any case and either separator: Git Bash hands HOME so, a plain terminal none.
function stateHome(platform = process.platform) {
  const base = userHome();
  if (base === null) throw fail('config-invalid', 'this user has no home in the password database, so no approval can be kept or read');
  if (!ABSOLUTE.test(base)) throw fail('config-invalid', 'the home in the password database is not an absolute path');
  const own = base.replace(/\/+$/, '');
  const spelled = (dir) => (platform === 'win32' ? winFolder(dir) : dir.replace(/\/+$/, ''));
  const why = `approvals are kept only there, so none is read or written while HOME is ${get('HOME')}`;
  if (get('HOME') !== null && spelled(get('HOME')) !== spelled(base)) {
    throw fail('config-invalid', `HOME is not this user's home in the password database (${base}): ${why}`);
  }
  return `${own}/.atlasbound`;
}

module.exports = { get, pick, realOf, stateHome, userHome };
