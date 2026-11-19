// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The paths a hook reads as the host opens them: on Windows, Git Bash's /c/... is the drive's own; on macOS and Linux nothing changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { hostPaths } = require('../../core/hooks.cjs');

test('on Windows the hook reads Git Bash\'s /c/... and a backslash path as the drive\'s own; elsewhere a path stays as sent', () => {
  const sent = { cwd: '/c/Users/ana/toy', tool_name: 'Write', tool_input: { file_path: '/c/Users/ana/toy/ortak/zz.js', content: 'x' } };
  assert.deepEqual(hostPaths(sent, true), { cwd: 'c:\\Users\\ana\\toy', tool_name: 'Write',
    tool_input: { file_path: 'c:\\Users\\ana\\toy\\ortak\\zz.js', content: 'x' } });
  assert.deepEqual(hostPaths({ cwd: 'C:/Users/ana/toy', tool_input: { notebook_path: 'C:\\Users\\ana\\toy\\n.ipynb' } }, true),
    { cwd: 'C:\\Users\\ana\\toy', tool_input: { notebook_path: 'C:\\Users\\ana\\toy\\n.ipynb' } });
  assert.deepEqual(hostPaths(sent, false), sent, 'on macOS and Linux /c is a folder of its own');
});
