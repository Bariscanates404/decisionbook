// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Test only: a world's bin sees no process of the machine. Its one process listing (`ps`, or Windows' fixed PowerShell asking WMI)
// answers an empty table, so a process another test started meanwhile (another file's, or another run's on the same machine) is never
// this world's. A test that needs the machine's own table runs without this preload (support.cjs realTable); tty-preload answers the
// listing with a person's terminal instead.
const childProcess = require('node:child_process');

const real = childProcess.spawnSync;
const LISTING = /^(ps|C:\\Windows\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe)$/;
childProcess.spawnSync = (cmd, ...rest) => (LISTING.test(cmd) ? { status: 0, stdout: '', stderr: '' } : real(cmd, ...rest));
