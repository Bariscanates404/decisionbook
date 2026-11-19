// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Whose messages a note shows its reader: this session's first, then those of sessions that began before it, each group headed; a
// session running beside this one is its own. A message that asks nothing (a bare path, a slash command a shell turned into one) is not
// kept. A kept line of another session says whether that session was earlier, measured, never assumed.
const test = require('node:test');
const assert = require('node:assert/strict');
const handoff = require('@atlasbound/handoff');
const { world, promptEvent, say, keep, saidAtStart } = require('./world.cjs');

const resumed = async (w, session) => (await handoff.handlers.prompt(promptEvent(session, '/resume-handoff'), w.io())).context;

test('a bare path or a slash command a shell turned into a path is not kept, so it never reaches the fill-in or the note', async () => {
  const w = world();
  await say(w, 's1', ['Keep the CSV column order as it is.']);
  for (const echo of ['C:/Program Files/Git/handoff', 'C:\\Program Files\\Git\\resume-handoff', '/tmp/notes.txt', '~/notes']) {
    assert.deepEqual(await handoff.handlers.prompt(promptEvent('s1', echo), w.io()), { code: 'message-passed' }, echo);
  }
  const { text } = await handoff.handoff(w.io('s1'));
  assert.match(text, /\(1 of 1\):\n {2}m1 Keep the CSV column order as it is\.$/m);
  assert.doesNotMatch(text, /Program Files|notes\.txt|~\/notes/);
  assert.doesNotMatch(await saidAtStart(w, 's2'), /Program Files|notes\.txt/, 'nor the next session\'s note');
  assert.deepEqual(await handoff.handlers.prompt(promptEvent('s1', 'Read /tmp/notes.txt and lib/a.js first.'), w.io()),
    { code: 'message-kept' }, 'a path inside a request is words');
});

test('the note shows this session\'s messages first, then an earlier session\'s, and leaves out a session running beside it', async () => {
  const w = world();
  await say(w, 'early', ['The export must stream its rows.']);
  w.later(1);
  await saidAtStart(w, 'me');
  w.later(1);
  await saidAtStart(w, 'beside');
  await say(w, 'beside', [`In this other task, rename the logger. ${'Long text. '.repeat(80)}`]);
  await say(w, 'me', ['Use the Amount type for money.']);
  const note = await resumed(w, 'me');
  assert.match(note, /^ {2}the person's last messages here, of this session, as they wrote them \(oldest first\):\n {4}- Use the Amount type for money\.\n {2}the person's last messages here, of other sessions, as they wrote them \(oldest first\):\n {4}- The export must stream its rows\.$/m);
  assert.doesNotMatch(note, /rename the logger/, 'a session that began after this one is its own work, not this one\'s');
  assert.match(await resumed(w, 'beside'), /of this session[^\n]*\n {4}- In this other task, rename the logger\./, 'its own reader sees it');
  assert.match(await saidAtStart(w, 'later'), /of other sessions[^\n]*\n(?: {4}- [^\n]*\n)*? {4}- In this other task/, 'a session that begins after both is told both');
});

test('a kept line of another session is called earlier only when that session kept it before this one began', async () => {
  const w = world();
  await saidAtStart(w, 'first');
  w.later(1);
  await say(w, 'second', ['Money math goes through lib/amount.js, never floats.']);
  await keep(w, 'second', { kept: ['Money math goes through lib/amount.js, never floats. [m1]'] });
  const line = /^ {2}k1 Money math goes through lib\/amount\.js, never floats\. \[m1(, [a-z ]+)?\]$/m;
  assert.equal(line.exec(await resumed(w, 'second'))[1], undefined, 'its own session: no mark');
  assert.equal(line.exec((await handoff.show(w.io('second'), {})).text)[1], undefined, 'shown to its own session: no mark');
  assert.equal(line.exec(await resumed(w, 'first'))[1], ', another session', 'kept after this session began: not an earlier one');
  assert.equal(line.exec((await handoff.show(w.io('unseen'), {})).text)[1], ', another session', 'a reader this repository never saw');
  w.later(1);
  assert.equal(line.exec(await saidAtStart(w, 'third'))[1], ', an earlier session');
});
