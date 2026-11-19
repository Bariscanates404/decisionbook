// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Windows' write forms against a human's verdict, through the real bin (test/fixtures/shell-windows.json): cmd and PowerShell run from Bash,
// a package script, and the host's PowerShell tool. A write of a protected file outside the plan is asked before it runs, naming the file; a
// write that cannot be placed asks; a read is silent. The AI's shell tool, whichever it is, cannot run a verb only a person runs. Windows
// itself is not run here: what only a Windows host shows waits for its re-test.
const test = require('node:test');
const assert = require('node:assert/strict');
const { writeFiles, portRow, hookDecisionOf } = require('./support.cjs');
const { tableWorld, againstHuman } = require('./truth-world.cjs');
const TABLE = require('../test/fixtures/shell-windows.json');

const SCRIPTS = { w: "node -e \"require('fs').writeFileSync('ortak/zz-npm.js','x')\"", test: 'node --test' };

test('Windows forms through the real hook entry: cmd, PowerShell and package scripts ask before writing a protected file', async () => {
  const { repo, env, said } = tableWorld(TABLE.policy);
  writeFiles(repo, { 'package.json': `${JSON.stringify({ name: 'toy', scripts: SCRIPTS })}\n`, 'ortak/a.js': 'one\n' });
  assert.ok(portRow(repo, 'PreToolUse', 'PowerShell'), 'setup wires the PowerShell tool beside Bash');
  await againstHuman(repo, env, TABLE.rows);
  const viaPowerShell = said('PreToolUse', { tool_name: 'PowerShell', tool_input: { command: 'atlasbound protect --none' } });
  assert.equal(hookDecisionOf(viaPowerShell).permissionDecision, 'deny', 'a verb only a person runs is refused in the PowerShell tool too');
  const windowsBin = said('PreToolUse', { tool_name: 'PowerShell',
    tool_input: { command: '& "C:\\Users\\ana\\AppData\\Roaming\\npm\\atlasbound.cmd" protect --none' } });
  assert.equal(hookDecisionOf(windowsBin).permissionDecision, 'deny', 'and named by its Windows path');
});
