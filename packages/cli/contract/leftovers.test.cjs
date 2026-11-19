// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What an AtlasBound from before 0.25 left in a person's home, through the real bin with a scratch home: hook rows in the host's user
// settings that run the earlier version's hooks folder (Windows spelling, as a Windows install wrote them), an MCP server named atlasbound
// in the host's own file, its sign-in key and send log. Doctor names them; only the person takes them out, and a copy of each stays.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { makeWorld, makeRepo, tmp, run, typedYes, realTable, writeFiles, snapshot, fileJson: read } = require('./support.cjs');

const OLD = 'node "C:\\\\npm\\\\node_modules\\\\atlasbound\\\\engine\\\\hooks\\\\session-start.cjs"';
const MINE = 'echo mine';
const SETTINGS = { theme: 'dark', hooks: { SessionStart: [{ hooks: [{ type: 'command', command: OLD }, { type: 'command', command: MINE }] }],
  PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: OLD.replace('session-start', 'pre-tool') }] }] } };
const STATE = { numStartups: 3, mcpServers: { atlasbound: { command: 'cmd', args: ['/c', 'atlasbound', 'mcp', 'serve'] }, mine: { command: 'x' } },
  projects: { 'D:/work/lab': { mcpServers: { atlasbound: { command: 'atlasbound' } } } } };

function earlierHome() {
  const home = tmp('cli-leftovers-home-');
  writeFiles(home, { '.claude/settings.json': JSON.stringify(SETTINGS), '.claude.json': JSON.stringify(STATE),
    '.atlasbound/credentials': '{"key":"old"}\n', '.atlasbound/egress-log.jsonl': '{"kind":"cloud_call"}\n', '.atlasbound/handoff-here/x': 'kept\n' });
  return home;
}

test('doctor names what an install from before 0.25 left in the home and the command that takes it out; a clean home: none', () => {
  const world = makeWorld();
  const repo = makeRepo();
  const home = earlierHome();
  const doctor = run(world.bin, ['doctor', '--target', repo], { env: { HOME: home } });
  const line = doctor.out.split('\n').find((l) => l.trim().startsWith('leftovers'));
  assert.match(line, /failed {2}~\/\.claude\/settings\.json: 2 hook rows run the earlier version's hooks folder/, doctor.out);
  assert.match(line, /an MCP server named atlasbound \(user, D:\/work\/lab\)/);
  assert.match(line, /~\/\.atlasbound\/credentials: .*~\/\.atlasbound\/egress-log\.jsonl: .*atlasbound leftovers remove \(you, at your own terminal\)/);
  assert.match(doctor.out, /^doctor: problem/m);
  const clean = run(world.bin, ['doctor', '--target', repo]).out.split('\n').find((l) => l.trim().startsWith('leftovers'));
  assert.match(clean, /measured {2}nothing from before 0\.25/);
});

test('leftovers remove is the person\'s: the AI is refused; the person\'s run keeps a copy, then takes the earlier version\'s', () => {
  const world = makeWorld();
  const repo = makeRepo();
  const home = earlierHome();
  const before = snapshot(home);
  const listed = run(world.bin, ['leftovers', '--target', repo], { env: { HOME: home } });
  assert.equal(listed.code, 0, listed.err);
  assert.match(listed.out, /^to take them out: atlasbound leftovers remove/m);
  const ai = run(world.bin, ['leftovers', 'remove', '--target', repo], { env: { HOME: home }, ai: true });
  assert.equal(ai.code, 1);
  assert.match(ai.err, /person-only: leftovers remove/);
  assert.deepEqual(snapshot(home), before, 'refused: the home is as it was');
  const { env } = typedYes({ HOME: home });
  const done = run(world.bin, ['leftovers', 'remove', '--target', repo], { env });
  assert.equal(done.code, 0, done.err);
  assert.deepEqual(read(home, '.claude/settings.json'), { theme: 'dark', hooks: { SessionStart: [{ hooks: [{ type: 'command', command: MINE }] }] } });
  const state = read(home, '.claude.json');
  assert.deepEqual([state.numStartups, state.mcpServers, state.projects['D:/work/lab'].mcpServers], [3, { mine: { command: 'x' } }, {}]);
  assert.deepEqual(fs.readdirSync(path.join(home, '.atlasbound')).sort(), ['handoff-here', 'leftovers-backup'], '0.25\'s own store stays');
  const [stamp] = fs.readdirSync(path.join(home, '.atlasbound', 'leftovers-backup'));
  const copy = path.join(home, '.atlasbound', 'leftovers-backup', stamp);
  assert.deepEqual(fs.readdirSync(copy).sort(), ['.claude.json', 'credentials', 'egress-log.jsonl', 'settings.json']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(copy, 'settings.json'), 'utf8')), SETTINGS, 'the copy is the file as it was');
  assert.match(done.out, new RegExp(`a copy of each is in ~/\\.atlasbound/leftovers-backup/${stamp}`));
  const again = run(world.bin, ['leftovers', 'remove', '--target', repo], { env });
  assert.match(again.out, /nothing from before 0\.25 is left/);
});

test('while the earlier version\'s server still runs (a real process in the system\'s listing), leftovers remove takes nothing', async () => {
  const world = makeWorld();
  const repo = makeRepo();
  const home = earlierHome();
  // the earlier version as npm installed it, its server script started as an AI session would have and left running
  const server = path.join(tmp('cli-leftovers-npm-'), 'node_modules', 'atlasbound', 'engine', 'mcp', 'server.cjs');
  writeFiles(path.dirname(server), { 'server.cjs': 'setInterval(() => {}, 1000);\n' });
  const child = spawn(process.execPath, [server], { stdio: 'ignore' });
  const { env } = typedYes({ HOME: home });
  const real = realTable({ HOME: home }); // the machine's own process table, where the stand-in runs
  try {
    const before = snapshot(home);
    const listed = run(world.bin, ['leftovers', '--target', repo], { env: real });
    assert.match(listed.out, new RegExp(`^ {2}pid ${child.pid}: the earlier version's MCP server, still running in memory: .*server\\.cjs$`, 'm'));
    assert.match(listed.out, /^first close every AI session opened before the upgrade \(or end those PIDs yourself\)/m);
    const doctor = run(world.bin, ['doctor', '--target', repo], { env: real }).out.split('\n').find((l) => l.trim().startsWith('leftovers'));
    assert.match(doctor, new RegExp(`failed {2}pid ${child.pid}: the earlier version's MCP server, still running in memory`));
    // the person's run: where the test's person answers the process listing itself (tty-preload), its table holds that command line too
    const stopped = run(world.bin, ['leftovers', 'remove', '--target', repo], { env: { ...env, TTY_PRELOAD_ABOVE: `node ${server}` } });
    assert.equal(stopped.code, 1, stopped.out + stopped.err);
    assert.match(stopped.out, /^atlasbound leftovers remove: nothing was taken: the earlier version's server still runs here \(pid [\d, ]+\)$/m);
    assert.match(stopped.out, /^then run atlasbound leftovers remove again$/m);
    assert.deepEqual(snapshot(home), before, 'nothing taken, no copy made, and the process still runs');
    assert.equal(child.exitCode, null, 'the product ends no process: that is the person\'s');
  } finally {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
  const done = run(world.bin, ['leftovers', 'remove', '--target', repo], { env });
  assert.equal(done.code, 0, done.err);
  assert.deepEqual(fs.readdirSync(path.join(home, '.atlasbound')).sort(), ['handoff-here', 'leftovers-backup'], 'the person ended it: the leftovers go');
});
