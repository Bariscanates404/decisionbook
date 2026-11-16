// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A stand-in for the AI host's hook call, for tests only: `node <this> <program> <args...>` runs the program as the host runs a hook:
// this process (a path part of its command words names an AI host) is the parent, the payload it was handed goes to the child's
// standard input, and the child's standard output is one end of a socket pair whose other end this process keeps. That is the
// shape the port asks of a call that carries the person's words (kit run/person hostCalled). It is also the named limit of that
// rule: a program that stands in for the whole host reads as the host.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const [program, ...args] = process.argv.slice(2);
// the child's own node options (a test's preloads) are handed beside this process's, which runs with none of them
const { HOST_CHILD_NODE_OPTIONS: options, ...rest } = process.env;
const env = options === undefined ? rest : { ...rest, NODE_OPTIONS: options };
const res = spawnSync(program, args, { input: fs.readFileSync(0), stdio: ['pipe', 'pipe', 'pipe'], env, maxBuffer: 64 * 1024 * 1024 });
fs.writeSync(1, res.stdout ?? '');
fs.writeSync(2, res.stderr ?? '');
process.exitCode = res.status ?? 1;
