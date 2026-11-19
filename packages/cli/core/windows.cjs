// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: how doctor's children start per platform. Windows' node has no /bin/sh and finds a bare word through no PATHEXT: there a hook
// row starts this install's node and bin themselves, and a person's bare word is found as cmd.exe finds it (PATH folders, then PATHEXT
// endings, in order; a .cmd or .bat only through cmd.exe). The repository never brings its own tool: a folder inside `root` is skipped.
const { paths: { windowsFolders } } = require('@atlasbound/kit');
const { WORDS: { started: STARTED } } = require('../contracts/codes.cjs');
const WIN_EXT = '.COM;.EXE;.BAT;.CMD'; // cmd.exe's own list when PATHEXT is not set
const SCRIPT = /^\.(cmd|bat)$/i;
// one spelling to compare, per platform: a Windows folder is one in any case and with either separator; a final separator aside
const SPELLED = { win32: (dir) => dir.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase(), posix: (dir) => dir.replace(/\/+$/, '') };

/** `word` on `env` ({ PATH, PATHEXT, ComSpec }), `exists(dir, name)` the disk's answer -> { file, cmd, args } or null when no folder holds
 * it. */
function windowsCommand(word, env, exists, root = null) {
  const inside = (dir) => Boolean(root) && `${SPELLED.win32(dir)}\\`.startsWith(`${SPELLED.win32(root)}\\`);
  const dirs = windowsFolders(env.PATH).filter((dir) => !inside(dir));
  const endings = String(env.PATHEXT || WIN_EXT).split(';').filter(Boolean);
  for (const dir of dirs) {
    const ending = endings.find((ext) => exists(dir, `${word}${ext.toLowerCase()}`));
    if (ending) {
      const file = `${dir}\\${word}${ending.toLowerCase()}`;
      return SCRIPT.test(ending) ? { file, cmd: env.ComSpec || 'cmd.exe', args: ['/d', '/c', file] } : { file, cmd: file, args: [] };
    }
  }
  return null;
}

// One row per platform (any but Windows is POSIX). `env`: the keys a child is handed (cmd.exe and a .cmd shim need their own folder and
// endings); `portRun`: the child that runs a hook row's `command` (its port words `words`) and what its start proves (`started`);
// `onPath`: the child a person's bare word starts, or null where no folder holds it; `modes`: whether a folder's mode bits say anything.
const PLATFORMS = {
  posix: { env: ['PATH', 'HOME'], modes: true, started: STARTED.posix, onPath: (word) => ({ cmd: word, args: [] }),
    portRun: (_machine, command) => ({ cmd: '/bin/sh', args: ['-c', command] }) },
  win32: { env: ['PATH', 'HOME', 'PATHEXT', 'SystemRoot', 'ComSpec'], modes: false, onPath: windowsCommand,
    started: STARTED.win32,
    portRun: ({ exec, bin }, _command, words) => ({ cmd: exec, args: [bin, ...words] }) },
};
const platformOf = (machine) => PLATFORMS[machine.platform] ?? PLATFORMS.posix;

/** git's GIT_CEILING_DIRECTORIES as git reads it -> whether a folder is one: the platform's list separator (`;` on Windows, where `C:\x`
 * holds a colon), a Windows folder in its one spelling, a final separator aside. */
function ceilingOf(value, platform) {
  const windows = platform === 'win32';
  const spelled = windows ? SPELLED.win32 : SPELLED.posix;
  const dirs = String(value || '').split(windows ? ';' : ':').filter(Boolean).map(spelled);
  return (dir) => dirs.includes(spelled(dir));
}

module.exports = { platformOf, ceilingOf };
