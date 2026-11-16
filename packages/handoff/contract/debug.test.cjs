// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Debug and trace: every hook and every verb leaves one trace row with counts and codes, and `debug handoff` answers why: why a kept
// line is there, why one went, why the note is stale, what was not measured, why the context notice was or was not said.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const handoff = require('@atlasbound/handoff');
const { world, startEvent, editedEvent, say, keep, transcriptAt, HERE } = require('./world.cjs');

test('[I-13] debug handoff names the message each kept line comes from and whether that message is still stored', async () => {
  const w = world();
  await handoff.handlers.start(startEvent('s1'), w.io());
  await say(w, 's1', ['Use tabs.', 'job one and job two']);
  await keep(w, 's1', { kept: ['Use tabs [m1]', 'job: job one [m2]', 'job: job two [m2]'] });
  await handoff.handlers.touched(editedEvent('s1', '/fake/a.js'), w.io());
  const { text, out } = await handoff.debug.handoff(w.io('s1'));
  assert.match(text, new RegExp(`^branch main, HEAD 0101010; store ~/${HERE}$`, 'm'));
  assert.match(text, /^ {2}k1 decision or constraint: kept 2026-11-12T01:00:00\.000Z, quoting m1 of session s1; still stored: m1$/m);
  assert.match(text, /^ {2}k3 job: kept .*, quoting m2 of session s1; still stored: m2$/m);
  assert.match(text, /^session s1: 2 messages seen, 2 stored \(at most 60\), 2 at the last handoff, cited by kept lines: m1, m2; 1 file edited; began at HEAD 0101010$/m);
  assert.deepEqual(out.note.kept.map((k) => [k.k, k.job, k.cites, k.stored]), [[1, false, [1], [1]], [2, true, [2], [2]], [3, true, [2], [2]]]);
  assert.match((await handoff.debug.handoff(w.io('s2'))).text, /k1 .* quoting m1 of session s1; another session's messages are not/m);
});

test('[I-13] debug handoff says why the note is stale, what was not measured and why the context notice was not said', async () => {
  const w = world();
  assert.match((await handoff.debug.handoff(w.io('s1'))).text, /^note: this branch has no note here yet$/m);
  await handoff.handlers.prompt(transcriptAt(w, 's1', { tokens: 100000 }), w.io());
  await handoff.handoff(w.io('s1'));
  w.git.commit('moved on');
  const { text } = await handoff.debug.handoff(w.io('s1'));
  assert.match(text, /^note: built .* at HEAD 0101010; STALE, HEAD is now 0202020; last handoff never, 1 message since$/m);
  assert.match(text, /^ {2}not measured: commits \(this session's start was not seen\)$/m);
  assert.match(text, /^ {2}context notice: 100000 tokens of 1000000 \(claude-sonnet-5-5: sonnet 5 and later\); not said: the context is below the notice point/m);
  assert.match(text, /^plans of DecisionBook: not handed$/m);
  const off = { ...world({ plans: null }).io('s1'), absent: (what) => (what === 'plans' ? 'off' : null) };
  assert.match((await handoff.debug.handoff(off)).text, /^plans of DecisionBook: off$/m, 'the root says why no plan is read');
  assert.match((await handoff.debug.handoff(world({ plans: [] }).io('s1'))).text, /^plans of DecisionBook: read$/m);
});

test('[I-13] every hook and every verb writes one trace row of its own step, with counts and codes only', async () => {
  const w = world();
  await handoff.handlers.start(startEvent('s1'), w.io());
  await say(w, 's1', ['Keep the v1 API.']);
  await handoff.handoff(w.io('s1'));
  await keep(w, 's1', { now: 'half', kept: ['Keep the v1 API [m1]'] });
  await handoff.show(w.io('s1'));
  await handoff.drop(w.io('s1'), { rest: ['1'] });
  const rows = w.rows();
  assert.deepEqual(rows.map((r) => [r.step, r.ok, r.codes, r.n]), [
    ['start', true, { 'note-none': 1 }, { pruned: 0, refreshed: 0 }],
    ['prompt', true, { 'message-kept': 1, 'context-unread': 1, 'note-refreshed': 1 }, { messages: 1 }],
    ['handoff', true, { 'note-built': 1 }, { messages: 1, kept: 0, since: 1 }],
    ['keep', true, { 'note-kept': 1 }, { kept: 1, added: 1, dropped: 0 }],
    ['show', true, { 'note-shown': 1 }, { kept: 1 }],
    ['drop', true, { 'line-dropped': 1 }, { kept: 0 }],
  ]);
  assert.ok(rows.every((r) => r.pkg === 'handoff' && !JSON.stringify(r).includes('v1 API')));
  await assert.rejects(handoff.drop(w.io('s1'), { rest: ['1'] }));
  assert.deepEqual([w.rows().at(-1).ok, w.rows().at(-1).err.code], [false, 'drop-unknown'], 'a refusal is a row with its code');
});

test('[I-15] the verb rows are data in one place, and each names a function of the public entry and a traced step', async () => {
  const called = (row) => row.call.split('.').reduce((entry, key) => entry[key], handoff);
  const manifest = path.join(path.dirname(require.resolve('@atlasbound/handoff')), 'package.json');
  const { verbs: rows } = JSON.parse(fs.readFileSync(manifest, 'utf8')).atlasbound;
  assert.deepEqual(rows.map((row) => row.words.join(' ')), ['handoff', 'handoff keep', 'handoff show', 'handoff drop', 'debug handoff']);
  assert.ok(rows.every((row) => typeof called(row) === 'function' && row.what.length <= 200));
  assert.deepEqual(handoff.vocabulary.steps, ['start', 'prompt', 'touched', 'compact', 'stop', 'handoff', 'keep', 'show', 'drop', 'debug']);
  assert.deepEqual(Object.keys(handoff.handlers), ['start', 'prompt', 'touched', 'compact', 'stop']);
});
