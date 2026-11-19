// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// doctor's machine check on Windows, where node has no /bin/sh, a bare word is not looked up through PATHEXT and a folder's mode bits say
// nothing: the probes are handed a win32 machine with Windows paths and a recording spawner, so every child they would start is seen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { probed } = require('../../steps/probes.cjs');
const { platformOf } = require('../../core/windows.cjs');

const windowsCommand = platformOf({ platform: 'win32' }).onPath;

const NODE = 'C:\\Program Files\\nodejs\\node.exe';
const BIN = 'C:\\npm\\node_modules\\atlasbound\\lib\\node_modules\\@atlasbound\\cli/bin/atlasbound.cjs';
const ROOT = 'D:\\work\\lab';
const PORT = `"${NODE}" "${BIN}" hook PreToolUse`;
const ON_DISK = new Set(['C:\\npm\\atlasbound.cmd', 'C:\\npm\\atlasbound']);

function windowsIo(answers = {}) {
  const spawned = [];
  const env = { PATH: 'C:\\Windows\\system32;C:\\npm\\', PATHEXT: '.COM;.EXE;.BAT;.CMD', ComSpec: 'C:\\Windows\\system32\\cmd.exe' };
  const fsAt = (dir) => ({ list: (name) => (name === '.atlasbound' ? ['handoff-here'] : []), exists: (name) => ON_DISK.has(`${dir}\\${name}`),
    readText: () => null, writeAtomic: () => {}, remove: () => {}, modeOf: () => 0o666 });
  const proc = { run: async (call) => {
    spawned.push(call);
    if (call.cmd === '/bin/sh') return { code: null, error: 'ENOENT', stdout: '', stderr: '' };
    const said = answers[call.cmd] ?? (call.args.includes('--version') ? '0.25.0' : '');
    return { code: 0, stdout: `${said}\n`, stderr: '' };
  } };
  const io = { root: ROOT, version: '0.25.0', fs: { list: () => null, exists: () => false }, git: { unignored: async () => [] },
    env: { get: (k) => env[k] ?? null, userHome: () => 'C:\\home\\dev', pick: (keys) => Object.fromEntries(keys.filter((k) => env[k]).map((k) => [k, env[k]])), realOf: () => null },
    proc, host: { gateProbe: '.atlasbound/doctor-probe' }, packages: { load: () => ({}) },
    machine: { platform: 'win32', node: '25.6.1', floor: '22', exec: NODE, bin: BIN, fsAt, releases: () => [] } };
  return { io, spawned };
}

const CONTEXT = { manifests: [{ name: 'decisionbook', hooks: [{ event: 'PreToolUse', matcher: 'Edit', handler: 'gate', timeout: 10 }], gate: { name: 'the plan gate' } }],
  plan: { settings: { hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: PORT }] }] } },
    desired: { rows: [{ command: PORT }], ignore: [] } } };

test('on Windows doctor starts no /bin/sh: paths and gate run this install\'s node and bin themselves, and both are measured', async () => {
  const { io, spawned } = windowsIo();
  const rows = (await probed(CONTEXT, io)).out;
  const row = (name) => rows.find((r) => r.name === name);
  assert.deepEqual(spawned.filter((c) => c.cmd === '/bin/sh'), [], 'no POSIX shell is asked for on Windows');
  assert.equal(row('paths').state, 'measured', row('paths').says);
  assert.equal(row('gate answering').state, 'measured', row('gate answering').says);
  const gate = spawned.find((c) => c.args.includes('hook'));
  assert.deepEqual([gate.cmd, gate.args], [NODE, [BIN, 'hook', 'PreToolUse']]);
  assert.equal(JSON.parse(gate.stdin).hook_event_name, 'PreToolUse');
});

test('on Windows `on PATH` finds npm\'s atlasbound.cmd by PATHEXT, asks it through cmd.exe; no "open to others" from mode bits',
  async () => {
  const { io, spawned } = windowsIo();
  const rows = (await probed(CONTEXT, io)).out;
  const row = (name) => rows.find((r) => r.name === name);
  assert.deepEqual([row('on PATH').state, row('on PATH').says], ['measured', '0.25.0']);
  const asked = spawned.find((c) => c.args.includes('C:\\npm\\atlasbound.cmd'));
  assert.deepEqual([asked.cmd, asked.args], ['C:\\Windows\\system32\\cmd.exe', ['/d', '/c', 'C:\\npm\\atlasbound.cmd', '--version']]);
  assert.deepEqual([row('home').state, row('home').says], ['measured', 'C:\\home\\dev is writable'], 'a plain PowerShell sets no HOME: the user record\'s home is measured');
  assert.doesNotMatch(row('home').says, /open to others/, 'POSIX mode bits mean nothing on Windows');
});

test('the Windows lookup: PATH folders in order, PATHEXT endings in order, an .exe started itself, nothing found is null', () => {
  const disk = new Set(['C:\\a\\tool.exe', 'C:\\b\\tool.cmd', 'C:\\b\\other.bat']);
  const exists = (dir, name) => disk.has(`${dir}\\${name}`);
  assert.deepEqual(windowsCommand('tool', { PATH: '"C:\\a";C:\\b' }, exists), { file: 'C:\\a\\tool.exe', cmd: 'C:\\a\\tool.exe', args: [] });
  assert.deepEqual(windowsCommand('other', { PATH: 'C:\\a;C:\\b' }, exists), { file: 'C:\\b\\other.bat', cmd: 'cmd.exe', args: ['/d', '/c', 'C:\\b\\other.bat'] });
  assert.equal(windowsCommand('none', { PATH: 'C:\\a;C:\\b' }, exists), null);
  assert.equal(windowsCommand('tool', { PATH: 'C:\\a', PATHEXT: '.CMD' }, exists), null, 'an ending PATHEXT does not list is not tried');
  assert.equal(windowsCommand('tool', { PATH: 'C:\\a;C:\\b' }, exists, 'C:\\A').file, 'C:\\b\\tool.cmd', 'a folder inside the repository is skipped');
  assert.equal(windowsCommand('tool', { PATH: 'bin;C:\\b' }, exists).file, 'C:\\b\\tool.cmd', 'a relative folder is skipped');
  assert.equal(windowsCommand('root', { PATH: 'C:\\' }, (dir, name) => `${dir}\\${name}` === 'C:\\root.exe').file, 'C:\\root.exe', 'a drive\'s root is a folder');
});

test('GIT_CEILING_DIRECTORIES is read as git reads it: `;` between folders on Windows, where a drive holds a colon', () => {
  const { ceilingOf } = require('../../core/windows.cjs');
  const windows = ceilingOf('C:\\Users\\ana;d:/work/', 'win32');
  assert.deepEqual(['C:\\Users\\ana', 'c:/users/ANA/', 'D:\\work', 'C:\\Users', 'C'].map(windows), [true, true, true, false, false]);
  const posix = ceilingOf('/home/ana:/srv/work/', 'linux');
  assert.deepEqual(['/home/ana', '/srv/work', '/home', 'C:\\Users\\ana'].map(posix), [true, true, false, false]);
  assert.equal(ceilingOf(null, 'win32')('C:\\'), false, 'no ceiling set');
});
