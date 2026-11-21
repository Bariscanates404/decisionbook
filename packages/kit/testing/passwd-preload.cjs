// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The product reads a user's home from the password database, so nothing a test sets in env can move it. A test world's bin is started with
// this preload instead, or a test's verb could write into the real home. It answers os.userInfo with the world's home:
// PASSWD_HOME when it differs from HOME (a planted HOME), else HOME. Never in a tarball.
// The password database is the machine's, not a variable, and the product hands a child an allowlist, never its own env: so every
// process a world's program starts with an env of its own gets this preload too, and this world's home unless it is handed another
// HOME. Without that a child would read the machine's real home. A test file's own children are the test's: their env is what it names.
const os = require('node:os');
const child = require('node:child_process');

const real = os.userInfo;
const worldHome = () => process.env.PASSWD_HOME || process.env.HOME;
os.userInfo = (...args) => ({ ...real(...args), homedir: worldHome() });

const sameWorld = (env) => env.PASSWD_HOME === undefined && [undefined, process.env.HOME].includes(env.HOME);
const preloaded = (options = '') => (options.includes(__filename) ? options : `${options} --require ${JSON.stringify(__filename)}`.trim());
const inWorld = (env) => ({ ...env, ...(sameWorld(env) && { PASSWD_HOME: worldHome() }), NODE_OPTIONS: preloaded(env.NODE_OPTIONS) });
const STARTS = /\.test\.[cm]?js$/.test(process.argv[1] ?? '') ? [] : ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork'];
for (const name of STARTS) {
  const start = child[name];
  child[name] = (...args) => start(...args.map((arg) => (arg && typeof arg === 'object' && !Array.isArray(arg) && arg.env
    ? { ...arg, env: inWorld(arg.env) } : arg)));
}
