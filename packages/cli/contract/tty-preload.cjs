// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Test only: the bin sees a terminal on a piped stdin, so the question setup asks a person is answered by the test's input.
// the preload stands for a person, so it also answers the terminal port's one process listing (`ps`: pid, parent, state, command line):
// this process under a login shell that leads the terminal's session, under the root, with no AI host above. TTY_PRELOAD_ABOVE puts more
// ancestors' command lines between that shell and the root (a test's AI host, a multiplexer, or a depth); TTY_PRELOAD_SHELL is the
// parent's command line instead of the login shell; TTY_PRELOAD_LEADS makes this process lead the session itself (a pseudo-terminal
// opened for it alone).
const childProcess = require('node:child_process');

Object.defineProperty(process.stdin, 'isTTY', { value: true });
const real = childProcess.spawnSync;
const above = (process.env.TTY_PRELOAD_ABOVE || '').split('|').filter(Boolean);
const self = `${process.pid} ${process.ppid} ${process.env.TTY_PRELOAD_LEADS ? 'Ss+' : 'S+'} node atlasbound`;
const shell = `${process.ppid} ${above.length ? 9000 : 1} Ss ${process.env.TTY_PRELOAD_SHELL || '-zsh'}`;
const listing = [self, shell, ...above.map((line, i) => `${9000 + i} ${i + 1 < above.length ? 9001 + i : 1} S ${line}`)].join('\n');
childProcess.spawnSync = (cmd, ...rest) => (cmd === 'ps' ? { status: 0, stdout: `${listing}\n`, stderr: '' } : real(cmd, ...rest));
