// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// io/proc on Windows, from fixtures of a Windows machine's process table and command lines: who stands above this process, read without
// `ps`; a bare program word found on the child's PATH alone, never in its folder; no signal to a child's id once it has exited.
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { io: { proc }, paths } = require('@atlasbound/kit');
const { createActor } = require('../../run/person.cjs');

const PS = 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const WT = 'C:\\Program Files\\WindowsApps\\Microsoft.WindowsTerminal_1.21.3231.0_x64__8wekyb3d8bbwe\\WindowsTerminal.exe';
const NODE = '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\ana\\AppData\\Roaming\\npm\\node_modules\\atlasbound\\bin\\atlasbound.cjs" uninstall';
/** A Windows process table as the reader prints it: `pid TAB parent TAB start (ms) TAB name TAB command line`, CRLF ends. */
const table = (rows) => rows.map((row) => row.join('\t')).join('\r\n');
const SELF = [process.pid, process.ppid, 500, 'node.exe', NODE];
const SHELL = [process.ppid, 7001, 400, 'powershell.exe', `"${PS}" `];
const ABOVE = [[7001, 7002, 300, 'WindowsTerminal.exe', `"${WT}" `], [7002, 6000, 100, 'explorer.exe', 'C:\\WINDOWS\\Explorer.EXE'],
  [4, 0, 0, 'System', ''], [0, 0, 0, 'System Idle Process', '']];
const PERSON = [['c:/windows/system32/windowspowershell/v1.0/powershell'],
  ['c:/program files/windowsapps/microsoft.windowsterminal_1.21.3231.0_x64__8wekyb3d8bbwe/windowsterminal'], ['c:/windows/explorer']];

test('ancestry on Windows: parents by id up to one whose id is gone or was reused, command lines read as Windows splits them', () => {
  assert.deepEqual(proc.ancestry(12, table([SELF, SHELL, ...ABOVE]), 'win32'), { chain: PERSON, leader: null, sessions: false });
  const reused = [...ABOVE, [6000, 4, 900, 'svchost.exe', 'C:\\WINDOWS\\system32\\svchost.exe -k x']];
  assert.deepEqual(proc.ancestry(12, table([SELF, SHELL, ...reused]), 'win32').chain, PERSON, 'a parent id started after its child is another process');
  const shim = [process.ppid, 7003, 450, 'cmd.exe', 'C:\\WINDOWS\\system32\\cmd.exe /d /s /c ""C:\\Users\\ana\\AppData\\Roaming\\npm\\atlasbound.cmd" uninstall"'];
  assert.deepEqual(proc.ancestry(12, table([SELF, shim, [7003, 7001, 420, 'powershell.exe', PS], ...ABOVE]), 'win32').chain.slice(0, 2),
    [['c:/windows/system32/cmd', '/d', '/s', '/c', 'C:/Users/ana/AppData/Roaming/npm/atlasbound.cmd uninstall'], PERSON[0]]);
  const quoted = [process.ppid, 7001, 400, 'bash.exe', '"C:\\Program Files\\Git\\usr\\bin\\bash.exe" -c "a \\"b c\\" d" e\\\\f'];
  assert.deepEqual(proc.ancestry(12, table([SELF, quoted, ...ABOVE]), 'win32').chain[0], ['c:/program files/git/usr/bin/bash', '-c', 'a "b c" d', 'e//f']);
  const unread = [process.ppid, 7001, 400, 'Claude.exe', ''];
  assert.deepEqual(proc.ancestry(12, table([SELF, unread, ...ABOVE]), 'win32').chain[0], ['claude', '(unread)'], 'a command line it may not read: the name');
});

test('ancestry on Windows is null where the walk is not whole: no listing, no row of its own or its parent, past the bound', () => {
  assert.equal(proc.ancestry(12, null, 'win32'), null);
  assert.equal(proc.ancestry(12, table([SHELL, ...ABOVE]), 'win32'), null, 'this process is not in the listing');
  assert.equal(proc.ancestry(12, table([SELF, ...ABOVE]), 'win32'), null, 'its parent is not in the listing');
  assert.equal(proc.ancestry(2, table([SELF, SHELL, ...ABOVE]), 'win32'), null, 'deeper than the bound');
  assert.equal(proc.ancestry(12, 'not a table\r\n', 'win32'), null);
});

test('running on Windows: every process with its whole command line as Windows holds it; one it may not read is empty', () => {
  const server = 'node C:\\Users\\ana\\AppData\\Roaming\\npm\\node_modules\\atlasbound\\engine\\mcp\\server.cjs';
  const rows = [[4148, 26816, 900, 'node.exe', server], [14624, 18104, 800, 'cmd.exe', 'cmd /c atlasbound mcp serve'], [4, 0, 0, 'System', '']];
  assert.deepEqual(proc.running(table(rows), 'win32'), [{ pid: 4148, line: server }, { pid: 14624, line: 'cmd /c atlasbound mcp serve' },
    { pid: 4, line: '' }]);
  assert.equal(proc.running(null, 'win32'), null, 'no listing: never an empty machine');
  assert.deepEqual(proc.running('not a table\r\n', 'win32'), []);
});

test('the Windows reader: the Windows folder\'s own PowerShell, no profile, no cmdlet, no caller PATH, bounded in time', () => {
  const real = childProcess.spawnSync;
  const seen = [];
  childProcess.spawnSync = (cmd, args, options) => {
    seen.push({ cmd, args, options });
    return seen.length === 1 ? { status: 0, stdout: table([SELF, SHELL, ...ABOVE]) } : { status: 1, stdout: '' };
  };
  try {
    assert.deepEqual(proc.ancestry(12, undefined, 'win32').chain, PERSON);
    assert.equal(proc.ancestry(12, undefined, 'win32'), null, 'a reader that failed: no walk');
  } finally {
    childProcess.spawnSync = real;
  }
  const [{ cmd, args, options }] = seen;
  assert.equal(cmd, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.deepEqual(args.slice(0, -1), ['-NoProfile', '-NonInteractive', '-NoLogo', '-EncodedCommand']);
  const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
  assert.match(script, /Win32_Process/);
  assert.doesNotMatch(script, /\b[A-Z][a-z]+-[A-Z][A-Za-z]+\b/, 'no cmdlet: nothing a planted module folder could stand in for');
  assert.deepEqual(options.env, { SystemRoot: 'C:\\Windows', windir: 'C:\\Windows', PATH: 'C:\\Windows\\System32' });
  assert.ok(options.timeout > 0 && options.timeout <= 10000, String(options.timeout));
});

test('a person at a Windows terminal is the terminal, through the real walk of a Windows table; an AI host above it is the AI', () => {
  const seat = (rows) => createActor({ env: { get: () => null }, input: { isTTY: true }, said: () => {},
    proc: { ancestry: (levels) => proc.ancestry(levels, table(rows), 'win32') } })();
  assert.deepEqual(seat([SELF, SHELL, ...ABOVE]), { who: 'terminal', why: 'own-terminal' });
  const hosted = [[process.ppid, 7004, 450, 'bash.exe', '"C:\\Program Files\\Git\\usr\\bin\\bash.exe" -c "atlasbound uninstall"'],
    [7004, 7005, 440, 'claude.exe', 'C:\\Users\\ana\\.local\\bin\\claude.exe'], [7005, 7001, 420, 'powershell.exe', PS]];
  assert.deepEqual(seat([SELF, ...hosted, ...ABOVE]), { who: 'ai', why: 'ai-host-above' });
});

test('Windows: a bare program word is found on the child\'s PATH alone (.com, then .exe), never in the child\'s own folder', () => {
  const disk = new Set(['C:\\Program Files\\Git\\cmd\\git.exe', 'C:\\Tools\\git.com', 'C:\\repo\\git.exe', 'C:repo\\git.exe', 'D:\\bin\\tool.exe']);
  const exists = (file) => disk.has(file);
  const on = (cmd, env) => paths.windowsProgram(cmd, env, exists);
  assert.equal(on('git', { PATH: 'relative\\bin;C:\\Program Files\\Git\\cmd\\;C:\\Tools' }), 'C:\\Program Files\\Git\\cmd\\git.exe');
  assert.equal(on('git', { Path: '"C:\\Tools";C:\\Program Files\\Git\\cmd' }), 'C:\\Tools\\git.com', 'any case of PATH; .com first; quotes off');
  assert.equal(on('git', { PATH: 'D:\\bin;C:repo' }), null, 'the repository\'s own git.exe is never started, nor a drive\'s current folder');
  assert.equal(on('tool', { PATH: 'C:\\;D:\\bin\\' }), 'D:\\bin\\tool.exe', 'a drive root, a trailing separator');
  assert.equal(on('git', {}), null, 'no PATH: nothing found');
  assert.equal(on('tool.exe', { PATH: 'D:\\bin' }), 'D:\\bin\\tool.exe', 'a word with its ending, as it is first');
  assert.equal(on('C:\\repo\\git.exe', {}), 'C:\\repo\\git.exe', 'a path is the caller\'s own choice');
  assert.equal(on('./git', {}), './git');
});

test('Windows: a child\'s id gets no signal once it has exited (Windows hands the id on), only while it runs', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const file = require.resolve('../../io/proc.cjs');
  const realKill = process.kill;
  const kills = [];
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  delete require.cache[file];
  const winProc = require(file);
  Object.defineProperty(process, 'platform', platform);
  delete require.cache[file];
  process.kill = (pid, signal) => {
    kills.push([pid, signal]);
    return realKill.call(process, pid, signal);
  };
  try {
    const res = await winProc.run({ cmd: process.execPath, args: ['-e', "process.stdout.write('ok')"] });
    assert.deepEqual([res.code, res.stdout, res.error], [0, 'ok', null]);
    assert.deepEqual(kills, [], 'no sweep of an exited child');
  } finally {
    process.kill = realKill;
  }
});
