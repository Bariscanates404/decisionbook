// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The team's notice row as a program: what sh, cmd and PowerShell would each read inside it is absent, and node runs it with no shell.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const HOST = require('../../contracts/host.json');
const { noticeRow, standing, withRow } = require('../../core/notice.cjs');

const row = noticeRow(HOST, '.atlasbound/cli/installed.json');
const madeDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'notice-unit-'));

test('the row is one program every host shell hands to node alike, and node -e runs it with no shell between', () => {
  const program = row.command.slice('node -e "'.length, -1);
  assert.equal(row.command, `node -e "${program}"`);
  assert.match(program, /^[^"`$%!\\\n]+$/, 'sh, cmd and PowerShell would each read one of these');
  const dir = madeDir();
  const bare = spawnSync(process.execPath, ['-e', program], { encoding: 'utf8', input: JSON.stringify({ session_id: 'w-1' }),
    env: { TMPDIR: dir, TEMP: dir, [HOST.projectEnv]: madeDir(), [HOST.notice.headless.entry]: 'cli' } });
  assert.equal(JSON.parse(bare.stdout).decision, 'block', 'the argument as cmd or PowerShell delivers it');
});

test('the row stops a message only in a run known to be a person\'s: every other entry, an unset one and CI pass', () => {
  const program = row.command.slice('node -e "'.length, -1);
  const entry = HOST.notice.headless.entry;
  const send = (env, dir = madeDir()) => spawnSync(process.execPath, ['-e', program], { encoding: 'utf8', input: JSON.stringify({ session_id: 'n-1' }),
    env: { TMPDIR: dir, TEMP: dir, [HOST.projectEnv]: madeDir(), ...env } }).stdout.trim() ? 'block' : 'passes';
  assert.deepEqual(['cli', 'claude-vscode'].map((name) => send({ [entry]: name })), ['block', 'block']);
  assert.deepEqual(['sdk-cli', 'claude-code-github-action', 'remote', 'mcp', ''].map((name) => send(name ? { [entry]: name } : {})),
    ['passes', 'passes', 'passes', 'passes', 'passes']);
  assert.equal(send({ [entry]: 'cli', CI: 'true' }), 'passes');
});

test('a settings file holds the row once: a person\'s rows and keys stay, another version\'s text is ours and replaced', () => {
  const own = { hooks: [{ type: 'command', command: 'echo mine' }] };
  const older = { hooks: [{ type: 'command', command: `node -e "x('${HOST.notice.mark}')"` }] };
  assert.equal(standing({}, row), 'none');
  assert.equal(standing({ hooks: { [row.event]: [own, older] } }, row), 'older');
  const fixed = withRow({ theme: 'dark', hooks: { [row.event]: [own, older] } }, row);
  assert.equal(standing(fixed, row), 'current');
  assert.deepEqual(fixed.hooks[row.event][0], own);
  assert.equal(fixed.theme, 'dark');
  assert.equal(standing({ hooks: { Stop: [{ hooks: [{ command: 'node -e "evil()"' }] }] } }, row), 'none', 'no mark, not ours');
});
