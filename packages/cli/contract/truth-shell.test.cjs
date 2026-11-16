// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the shell gate against a human's verdict, through the real bin. 119 commands of the kind an AI coding session runs
// (test/fixtures/shell-commands.json: 72 reads, 47 writes) meet `atlasbound hook PreToolUse` in a git repository that
// protects app/** and config/** as the person's danger zones under a READY plan this machine said yes to (truth-world.cjs says why). The answer
// is written by hand per row: a read, and a write of no protected file outside the plan, is silence; a write of one is an ask that names that file.
// The repository's bytes are compared before and after: the gate never writes a file of the repository.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { portRow, snapshot, replyJson } = require('./support.cjs');
const { shellWorld, tableWorld, shellEvent, expectedReply, againstHuman } = require('./truth-world.cjs');
const TABLE = require('../test/fixtures/shell-commands.json');

/** The repository's own files (its store `.atlasbound/` aside: the port keeps its trace and context records there). */
const sourceBytes = (repo) => Object.fromEntries(Object.entries(snapshot(repo)).filter(([key]) => !key.startsWith('.atlasbound/')));

test('119 real commands through the real hook entry: reads are silent, and every danger write outside the plan is asked', async () => {
  const { repo, env, said } = tableWorld(TABLE.policy);
  assert.deepEqual([TABLE.rows.length, TABLE.rows.filter((row) => row.human.verdict === 'allow').length], [119, 97],
    'the hand verdicts: 72 reads and 25 writes the gate must let pass, 22 it must ask');
  const row = portRow(repo, 'PreToolUse', 'Bash');
  const { bin } = shellWorld();
  const gone = JSON.parse(fs.readFileSync(path.join(path.dirname(bin), '..', 'contracts', 'host.json'), 'utf8')).rowGone;
  assert.ok(row.endsWith(`"${bin}" hook PreToolUse; echo '${gone}'`), `the row the host runs is the entry this test calls: ${row}`);
  const [read, write] = [TABLE.rows.find((r) => r.human.verdict === 'allow'), TABLE.rows.find((r) => r.human.verdict === 'ask')];
  assert.deepEqual(replyJson(said('PreToolUse', shellEvent(repo, read))), {}, 'through the settings row the host runs: the first read is silent');
  assert.deepEqual(replyJson(said('PreToolUse', shellEvent(repo, write))), expectedReply(write),
    'through the settings row: the first protected write is asked by its file');
  const before = sourceBytes(repo);
  const replies = await againstHuman(repo, env, TABLE.rows);
  assert.equal(replies.filter(({ got }) => (got.hookSpecificOutput || {}).permissionDecision === 'deny').length, 0, 'no command of the table is denied');
  assert.deepEqual(sourceBytes(repo), before, 'the gate wrote no file of the repository');
});
