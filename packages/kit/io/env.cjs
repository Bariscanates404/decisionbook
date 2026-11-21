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

function passwdHome() {
  try {
    return os.userInfo().homedir || null;
  } catch (err) {
    if (err.code !== 'ERR_SYSTEM_ERROR') throw err;
    return null; // no password entry is a state of the machine: the caller says so with its own code
  }
}

// A development tree holds kit's test preload beside this file (kit/testing: never in a published package).
const DEVELOPMENT_TREE = realOf(`${__dirname}/../testing/passwd-preload.cjs`) !== null;

/** Whether a set HOME names another folder than `base`. On Windows (`platform`) a folder is one in any case and either separator: Git
 * Bash hands HOME so, a plain terminal none. */
function homeMoved(base, platform) {
  const spelled = (dir) => (platform === 'win32' ? winFolder(dir) : dir.replace(/\/+$/, ''));
  return get('HOME') !== null && spelled(get('HOME')) !== spelled(base);
}
const movedWhy = (base, what) => `HOME is not this user's home in the password database (${base}): ${what} while HOME is ${get('HOME')}`;

// THE user's home: by the password database, not `os.homedir()` (which answers HOME), so no variable moves it. An installed product
// uses it whatever HOME says (a container, a CI runner, sudo -E, a Windows HOME on another drive). In a development tree a HOME that
// names another folder is a test world that forgot the preload: refused, so the run fails instead of writing the developer's real
// home. null: no password entry.
function userHome(platform = process.platform) {
  const base = passwdHome();
  if (base !== null && DEVELOPMENT_TREE && homeMoved(base, platform)) {
    throw fail('config-invalid', movedWhy(base, 'a development tree reads and writes nothing of that home (start it with kit/testing/passwd-preload.cjs)'));
  }
  return base;
}

// Per-user state (approvals), in that home, and only while a set HOME names that same home: a planted HOME sees no approval and
// writes none, in every tree.
function stateHome(platform = process.platform) {
  const base = userHome(platform);
  if (base === null) throw fail('config-invalid', 'this user has no home in the password database, so no approval can be kept or read');
  if (!ABSOLUTE.test(base)) throw fail('config-invalid', 'the home in the password database is not an absolute path');
  if (homeMoved(base, platform)) throw fail('config-invalid', movedWhy(base, 'approvals are kept only there, so none is read or written'));
  return `${base.replace(/\/+$/, '')}/.atlasbound`;
}

module.exports = { get, pick, realOf, stateHome, userHome };
