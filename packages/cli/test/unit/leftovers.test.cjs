// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The earlier version's MCP server still in memory, and its event store: a process table of each platform as kit's reader takes it (a
// Windows machine's rows as the field report held them, a ps listing), a home in memory. The installed earlier version's processes are
// named with their ids and stop `leftovers remove`; someone's own copy of the engine is named and left alone; nothing is ended.
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: { proc }, testing: { memoryFs, fixedClock } } = require('@atlasbound/kit');
const HOST = require('../../contracts/host.json');
const { leftovers, leftoversRemove } = require('../../steps/leftovers.cjs');

const NPM = 'C:\\Users\\ana\\AppData\\Roaming\\npm\\node_modules\\atlasbound';
const WINDOWS = [[14624, 18104, 1, 'cmd.exe', 'cmd /c atlasbound mcp serve'], [26816, 14624, 2, 'node.exe', `"node"   "${NPM}\\bin\\atlasbound" mcp serve`],
  [4148, 26816, 3, 'node.exe', `node ${NPM}\\engine\\mcp\\server.cjs`],
  [500, 4, 4, 'node.exe', `"C:\\Program Files\\nodejs\\node.exe" ${NPM}\\bin\\atlasbound.cjs hook PreToolUse`], [501, 4, 5, 'Code.exe', '']]
  .map((row) => row.join('\t')).join('\r\n');
const POSIX = [' 4148   900 S    node /usr/local/lib/node_modules/atlasbound/engine/mcp/server.cjs', ' 4149   900 S    node /usr/local/bin/atlasbound mcp serve',
  ' 6440  5470 S+   node /Users/ana/projects/atlasbound/engine/mcp/server.cjs', ' 6441  5470 S+   node engine/mcp/server.cjs',
  ' 6442  5470 S+   node /Users/ana/projects/atlasbound/bin/atlasbound mcp serve',
  '  700     1 S    node /usr/local/lib/node_modules/atlasbound/bin/atlasbound.cjs hook PreToolUse', '  701     1 S    grep engine/mcp/server.cjsx'].join('\n');
const COPIES = POSIX.split('\n').slice(2).join('\n'); // no installed earlier version: someone's own copies, and 0.25's own server
const LEFT = { '.atlasbound/egress-log.jsonl': '{"kind":"cloud_call"}\n', '.atlasbound/identity.json': '{}\n', '.atlasbound/handoff-here/x': 'kept\n' };
const STORE = { '.mcp-observatory/lab/sessions/nosession/events.jsonl': '{}\n', '.mcp-observatory/atlasbound/store-metrics.json': '{}\n' };

/** The io a leftovers verb reads: a home in memory, the host's user files in it, the machine's processes as kit's reader gives them. */
const leftoversIo = (files, rows) => ({ home: memoryFs(files), host: { user: HOST.hostUser }, env: { get: () => null }, clock: fixedClock(),
  proc: { running: () => rows } });
const leftoverLines = (text) => text.trim().split('\n');

for (const [platform, table, pids] of [['win32', WINDOWS, [14624, 26816, 4148]], ['darwin', POSIX, [4148, 4149]]]) {
  test(`${platform}: the installed earlier version's server still running is named by pid, and leftovers remove takes nothing while it runs`, () => {
    const io = leftoversIo(LEFT, proc.running(table, platform));
    const listed = leftovers([], io);
    assert.deepEqual([listed.out.running, listed.out.found, listed.n.running], [pids, 2 + pids.length, pids.length]);
    for (const pid of pids) assert.match(listed.text, new RegExp(`^ {2}pid ${pid}: the earlier version's MCP server, still running in memory: .*(server\\.cjs|mcp serve)`, 'm'));
    assert.doesNotMatch(listed.text, /pid (500|501|700|701):/, '0.25\'s own server and any other process are no leftover');
    assert.deepEqual(leftoverLines(listed.text).slice(-2), ['first close every AI session opened before the upgrade (or end those PIDs yourself): an open one keeps '
      + 'the earlier version\'s server running in memory, and that server writes its files back',
    'to take them out: atlasbound leftovers remove (you, at your own terminal); it keeps a copy of each first']);
    const before = new Map(io.home.store);
    const stopped = leftoversRemove([], io);
    assert.deepEqual([stopped.exit, stopped.out, stopped.codes], [1, { taken: [], running: pids }, { 'leftovers-running': 1 }]);
    assert.equal(leftoverLines(stopped.text)[0],
      `atlasbound leftovers remove: nothing was taken: the earlier version's server still runs here (pid ${pids.join(', ')})`);
    assert.deepEqual(leftoverLines(stopped.text).slice(-2), ['close every AI session opened before the upgrade (or end those PIDs yourself): an open one keeps '
      + 'the earlier version\'s server running in memory, and that server writes its files back', 'then run atlasbound leftovers remove again']);
    assert.deepEqual(new Map(io.home.store), before, 'no file taken, no copy made: the server would write them back');
  });
}

test('a copy of the earlier engine run from a folder of someone\'s own is named and left alone: it stops no removal', () => {
  const io = leftoversIo({ ...LEFT, ...STORE }, proc.running(COPIES, 'darwin'));
  const listed = leftovers([], io);
  assert.deepEqual([listed.out.running, listed.out.found], [[], 2]);
  for (const pid of [6440, 6441, 6442]) {
    assert.match(listed.text, new RegExp(`^ {2}pid ${pid}: a process running atlasbound's earlier engine from a folder that is no installed package, left alone: node `, 'm'));
  }
  assert.match(listed.text, /^ {2}~\/\.mcp-observatory: the earlier version's event store \(2 folders: one per repository, and its own\); nothing here takes it: delete the folder yourself once no earlier version runs$/m);
  const done = leftoversRemove([], io);
  assert.deepEqual([done.exit, done.out.taken], [undefined, ['~/.atlasbound/egress-log.jsonl', '~/.atlasbound/identity.json']]);
  assert.deepEqual([...io.home.store.keys()].filter((key) => !key.startsWith('.atlasbound/leftovers-backup/')).sort(),
    ['.atlasbound/handoff-here/x', ...Object.keys(STORE)].sort(), 'the event store stays: the person deletes it');
  assert.equal(leftoverLines(done.text).at(-1), 'restart every AI session: each reads its settings again, and one opened before the upgrade keeps the earlier '
    + 'version\'s server running in memory until it is closed');
  const after = leftovers([], io);
  assert.deepEqual([after.out.found, leftoverLines(after.text)[0]], [0, 'atlasbound leftovers: nothing from before 0.25 is left to take out; what is named below is left alone'],
    'the head never says "nothing is left" over a process it then names');
  assert.equal(leftoverLines(after.text).length, 5, 'the three copies and the event store are still named beside it');
});

test('only its server left running is a leftover of its own; a listing that does not answer is said, never read as no process', () => {
  const only = leftovers([], leftoversIo({}, proc.running(WINDOWS, 'win32')));
  assert.deepEqual([only.out.found, leftoverLines(only.text).at(-1).startsWith('first close every AI session')], [3, true], 'nothing for the verb to take');
  const unread = leftoversIo(LEFT, proc.running(null, 'linux'));
  assert.match(leftovers([], unread).text, /^ {2}not read: the running processes \(the system's listing did not answer\)$/m);
  const stopped = leftoversRemove([], unread);
  assert.deepEqual([stopped.exit, stopped.out, stopped.codes], [1, { taken: [], running: [] }, { 'leftovers-unread': 1 }], 'unknown is not "none running": nothing is taken');
  assert.match(stopped.text, /^atlasbound leftovers remove: nothing was taken: the system's listing of the running processes did not answer, so the earlier version's server may still run here\n/);
  assert.equal(leftoversRemove([], leftoversIo(LEFT, proc.running(COPIES, 'darwin'))).out.taken.length, 2, 'a listing that answers with no such process stops nothing');
});
