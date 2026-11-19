// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// When the handoff speaks, and that it never blocks: a compaction is silent, a start says the branch's note, /resume-handoff gives it again,
// and the one context notice comes once per session.
const test = require('node:test');
const assert = require('node:assert/strict');
const handoff = require('@atlasbound/handoff');
const { world, startEvent, promptEvent, compactEvent, say, keep, saidAtStart, transcriptAt } = require('./world.cjs');

test('[I-9] a start on a branch with no note says nothing, and no hook answer ever carries a verdict', async () => {
  const w = world();
  const answers = [await handoff.handlers.start(startEvent('s1'), w.io()), await handoff.handlers.prompt(promptEvent('s1', 'add the export'), w.io()),
    await handoff.handlers.compact(compactEvent('s1'), w.io())];
  assert.deepEqual(answers, [{ code: 'note-none' }, { code: 'message-kept' }, { code: 'note-built' }]);
  assert.ok(answers.every((a) => !('verdict' in a) && !('reason' in a)));
});

test('[I-9] a compaction rebuilds the facts without any model and the start after it says the note with fresh facts', async () => {
  const w = world();
  await handoff.handlers.start(startEvent('s1'), w.io());
  await say(w, 's1', ['use the Amount type for money']);
  await keep(w, 's1', { now: 'writing the export', kept: ['use the Amount type for money [m1]'] });
  w.git.commit('Add the export route');
  w.later(20);
  await handoff.handlers.compact(compactEvent('s1'), w.io());
  const said = await saidAtStart(w, 's1', 'compact');
  assert.match(said, /built 2026-11-12T01:20:00\.000Z at HEAD 02020202$/m);
  w.later(45);
  assert.equal(await saidAtStart(w, 's1', 'resume'), said, 'a hook names no age: the same note is the same text, said once per context');
  assert.match(said, /^ {2}1 commit since this session began\n {4}"Add the export route"$/m);
  assert.match(said, /^Now: writing the export$/m);
  assert.doesNotMatch(said, /STALE/);
  assert.deepEqual(w.starts, [], 'nothing was started');
});

test('[I-9] a new session on another branch is not told this branch\'s note, and each branch keeps its own', async () => {
  const w = world({ branch: 'main' });
  await say(w, 's1', ['main only: keep the v1 API']);
  await keep(w, 's1', { kept: ['keep the v1 API [m1]'] });
  w.git.name = 'feature/x';
  assert.equal(await saidAtStart(w, 's2', 'startup'), '');
  w.git.name = 'main';
  assert.match(await saidAtStart(w, 's3', 'startup'), /k1 keep the v1 API/);
});

test('[I-9] /resume-handoff gives the note under its own heading every time, and a bare slash command is not kept as a message', async () => {
  const w = world();
  assert.deepEqual(await handoff.handlers.prompt(promptEvent('s1', '/resume-handoff'), w.io()), { code: 'note-none' });
  await say(w, 's1', ['ship the export this week']);
  await keep(w, 's1', { kept: ['job: ship the export this week [m1]'] });
  const resumed = await handoff.handlers.prompt(promptEvent('s2', '/resume-handoff'), w.io());
  assert.equal(resumed.code, 'resume-said');
  assert.match(resumed.context, /^## Your handoff: where you are\nHandoff note, branch main/);
  assert.match(resumed.context, /k1 job: ship the export this week \[m1, an earlier session\]/);
  assert.deepEqual(await handoff.handlers.prompt(promptEvent('s1', '/handoff'), w.io()), { code: 'message-passed' });
  assert.match((await handoff.handoff(w.io('s1'))).text, /\(1 of 1\):/);
});

test('[I-12] the context notice is said once per session, at the notice point of the model\'s window', async () => {
  const w = world();
  const below = await handoff.handlers.prompt(transcriptAt(w, 's1', { tokens: 500000 }), w.io());
  assert.deepEqual(below, { code: 'message-kept' });
  const due = await handoff.handlers.prompt(transcriptAt(w, 's1', { tokens: 600000 }), w.io());
  assert.equal(due.say.length, 1);
  assert.equal(due.say[0].key, 'handoff.context');
  assert.match(due.say[0].text, /^handoff: this session's context holds 600,000 tokens \(60 % of 1,000,000\): tell the person once/);
  const again = await handoff.handlers.prompt(transcriptAt(w, 's1', { tokens: 700000 }), w.io());
  assert.deepEqual(again, { code: 'message-kept' });
  const codes = w.rows().filter((r) => r.step === 'prompt').map((r) => Object.keys(r.codes).sort());
  assert.deepEqual(codes, [['context-below', 'message-kept', 'note-refreshed'], ['context-notice', 'message-kept', 'note-refreshed'],
    ['context-noticed', 'message-kept', 'note-refreshed']]);
  const unknown = await handoff.handlers.prompt(transcriptAt(w, 's2', { tokens: 120000, model: 'some-other-model' }), w.io());
  assert.match(unknown.say[0].text, /120,000 tokens \(the window of some-other-model is not known here\)/);
});

test('[I-12] on Windows the transcript under the home is read in its own spelling: a drive and backslashes', async () => {
  const w = world();
  const io = { ...w.io(), env: { ...w.io().env, userHome: () => 'C:\\Users\\ana' } };
  const event = { ...transcriptAt(w, 's1', { tokens: 600000 }), transcript_path: 'c:\\Users\\ana\\.claude\\projects\\-fake\\s1.jsonl' };
  const due = await handoff.handlers.prompt(event, io);
  assert.match(due.say?.[0]?.text ?? '', /600,000 tokens/, 'before: a path not under `${home}/` was never read, so no notice');
  const cased = { ...event, session_id: 's2', transcript_path: 'c:\\users\\ANA\\.claude\\projects\\-fake\\s2.jsonl' };
  transcriptAt(w, 's2', { tokens: 600000 });
  assert.match((await handoff.handlers.prompt(cased, io)).say?.[0]?.text ?? '', /600,000 tokens/, 'a Windows folder is one in any case');
});

test('[I-9] an event with no usable session id and a user with no home folder are answered with a code and nothing else', async () => {
  const w = world();
  assert.deepEqual(await handoff.handlers.prompt({ prompt: 'x' }, w.io()), { code: 'handoff-no-session' });
  assert.deepEqual(await handoff.handlers.prompt(promptEvent('../../etc', 'x'), w.io()), { code: 'handoff-no-session' });
  const homeless = world({ home: null });
  assert.deepEqual(await handoff.handlers.start(startEvent('s1'), homeless.io()), { code: 'handoff-no-home' });
  assert.equal((await handoff.handoff(homeless.io('s1'))).text, 'handoff: this user has no home folder, so nothing is kept and nothing is said\n');
  assert.equal(w.home.store.size, 0);
});
