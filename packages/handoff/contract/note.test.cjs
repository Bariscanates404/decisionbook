// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The note from facts: what the product can measure is written by the product, an unmeasured fact says unknown, the note is one screen
// whatever the facts, and it says STALE when HEAD moved since it was built.
const test = require('node:test');
const assert = require('node:assert/strict');
const handoff = require('@atlasbound/handoff');
const { world, startEvent, editedEvent, say, keep, BOUNDS } = require('./world.cjs');

const BOUND = BOUNDS.note;

/** A session that began, made three commits, edited files and left one file changed. */
async function workedWorld() {
  const w = world({ branch: 'feature/export' });
  await handoff.handlers.start(startEvent('s1'), w.io());
  ['Add the export route', 'Extract Amount', 'Add fixtures'].forEach((subject) => w.git.commit(subject));
  w.git.changed = ['pages/report.js'];
  for (const file of ['lib/amount.js', 'pages/report.js', 'pages/report.js', '/elsewhere/notes.txt']) {
    await handoff.handlers.touched(editedEvent('s1', file.startsWith('/') ? file : `/fake/${file}`), w.io());
  }
  return w;
}

test('[I-1] the note names the branch, HEAD with its subject, the commits since the session began and the changed files', async () => {
  const w = await workedWorld();
  const { text, out } = await handoff.handoff(w.io('s1'));
  assert.equal(out.code, 'note-built');
  assert.match(text, /^Handoff note, branch feature\/export: built 2026-11-12T01:00:00\.000Z \(0 min ago\) at HEAD 04040404$/m);
  assert.match(text, /^ {2}HEAD 04040404 "Add fixtures"$/m);
  assert.match(text, /^ {2}3 commits since this session began\n {4}"Add fixtures"\n {4}"Extract Amount"\n {4}"Add the export route"$/m);
  assert.match(text, /^ {2}1 file changed and not committed\n {4}pages\/report\.js$/m);
  assert.match(text, /^Facts, measured 2026-11-12T01:00:00\.000Z:$/m);
});

test('[I-14] the files a session edited are counted from the edit hook, most edited first, and a file outside is not', async () => {
  const w = await workedWorld();
  const { text } = await handoff.handoff(w.io('s1'));
  assert.match(text, /^ {2}edited in this session, most edited first: pages\/report\.js x2, lib\/amount\.js x1$/m);
  assert.doesNotMatch(text, /elsewhere/);
  const codes = w.rows().filter((r) => r.step === 'touched').map((r) => Object.keys(r.codes)[0]);
  assert.deepEqual(codes, ['file-touched', 'file-touched', 'file-touched', 'file-outside']);
});

test('[I-1] a session whose start was not seen says its commits are unknown, never a guessed count', async () => {
  const w = world();
  await say(w, 's9', ['continue the export']);
  w.git.commit('A commit of an unseen session');
  const { text } = await handoff.handoff(w.io('s9'));
  assert.match(text, /^ {2}commits: unknown \(this session's start was not seen\)$/m);
  assert.doesNotMatch(text, /commits? since this session began/);
});

test('[I-1] the plans of DecisionBook are named by id, state and level when the composition root hands them, else not at all', async () => {
  const plans = [{ id: 'p-export', state: 'ready', level: { level: 'normal' }, unmet: [] }, { id: 'p-two', state: 'draft', level: null, unmet: [{}, {}] }];
  const withBook = world({ plans });
  assert.match((await handoff.handoff(withBook.io('s1'))).text, /^ {2}plan p-export: ready, normal\n {2}plan p-two: draft, 2 unmet$/m);
  assert.match((await handoff.show(withBook.io('s1'))).text, /\/decide <area\.topic>/, 'how a kept line becomes a binding decision');
  const without = world();
  assert.doesNotMatch((await handoff.handoff(without.io('s1'))).text, /plan /);
  assert.doesNotMatch((await handoff.show(without.io('s1'))).text, /\/decide/);
});

test('[I-1] outside an AI session the verb still rebuilds the facts and says where now, next and kept come from', async () => {
  const w = await workedWorld();
  const { text, out } = await handoff.handoff(w.io(null));
  assert.equal(out.code, 'handoff-no-session');
  assert.match(text, /^ {2}HEAD 04040404 "Add fixtures"$/m);
  assert.match(text, /No AI session here/);
  assert.doesNotMatch(text, /atlasbound handoff keep/);
});

test('[I-3] a note read after HEAD moved says STALE with both commits, and a rebuilt one does not', async () => {
  const w = await workedWorld();
  await handoff.handoff(w.io('s1'));
  assert.doesNotMatch((await handoff.show(w.io('s1'))).text, /STALE/);
  w.git.commit('A commit after the note');
  w.later(30);
  const stale = (await handoff.show(w.io('s1'))).text;
  assert.match(stale, /^STALE: HEAD is now 05050505; the facts below were measured at 04040404\.$/m);
  assert.match(stale, /\(30 min ago\)/);
  assert.doesNotMatch((await handoff.handoff(w.io('s1'))).text, /STALE/);
});

test('[I-2] the note stays within its bound of lines and characters whatever the facts, and no kept line is cut for it', async () => {
  const long = (n, c = 'w') => `${c.repeat(8)} `.repeat(Math.ceil(n / 9)).slice(0, n);
  const w = world({ branch: long(200, 'b').replace(/ /g, '/'), plans: Array.from({ length: 9 }, (_, i) => ({ id: long(90, 'p') + i, state: 'draft', unmet: [] })) });
  await handoff.handlers.start(startEvent('s1'), w.io());
  for (let i = 0; i < 40; i += 1) w.git.commit(long(300, 'c'));
  w.git.changed = Array.from({ length: 400 }, (_, i) => `${long(120, 'd').replace(/ /g, '/')}${i}.js`);
  for (let i = 0; i < 30; i += 1) await handoff.handlers.touched(editedEvent('s1', `/fake/${long(150, 't').replace(/ /g, '/')}${i}.js`), w.io());
  await say(w, 's1', Array.from({ length: 12 }, (_, i) => `decision ${i}: ${long(380)}`));
  const kept = Array.from({ length: 7 }, (_, i) => `job: ${long(380)} [m${i + 1}]`); // each quotes its message's 380 characters
  assert.equal((await keep(w, 's1', { now: long(900, 'n'), next: [long(500), long(500), long(500), long(500)], kept })).out.code, 'note-kept');
  const more = Array.from({ length: 5 }, (_, i) => `job: ${long(380)} [m${i + 8}, m1, m2, m3]`);
  assert.equal((await keep(w, 's1', { now: long(900, 'n'), next: [long(500), long(500), long(500)], kept: more })).out.code, 'note-kept');
  w.git.commit('moved');
  const { text } = await handoff.show(w.io('s1'));
  assert.ok(text.length <= BOUND.chars, `${text.length} characters`);
  assert.ok(text.trimEnd().split('\n').length <= BOUND.lines, `${text.split('\n').length} lines`);
  assert.equal((text.match(/^ {2}k\d+ job: /gm) || []).length, 12, 'all twelve kept lines are there');
  assert.match(text, /^STALE: /m);
  assert.match(text, /left out: the note stays on one screen/);
});

const storedKeys = (w, folder) => [...w.home.store.keys()].filter((key) => key.includes(`/${folder}/`) && !key.endsWith('.before.json'));
const refusedBy = (code, key) => (err) => err.code === code && err.message.startsWith(`${code}: ~/${key}: `) && err.message.endsWith('repair the file or move it away');

test('a note that does not read is never taken for no note: hooks and verbs refuse, naming the file, and its bytes stay', async () => {
  const w = world();
  await handoff.handlers.start(startEvent('s1'), w.io());
  await say(w, 's1', ['Money math goes through lib/amount.js, never floats.']);
  assert.equal((await keep(w, 's1', { kept: ['Money math goes through lib/amount.js, never floats [m1]'] })).out.code, 'note-kept');
  const [key] = storedKeys(w, 'notes');
  const backup = key.replace('.json', '.before.json');
  const whole = w.home.store.get(key);
  const cut = whole.trimEnd().slice(0, -1); // a hand edit that lost the last brace
  w.home.writeAtomic(key, cut);
  const backedUp = w.home.store.get(backup);
  const unreadable = refusedBy('note-unreadable', key);
  await assert.rejects(say(w, 's1', ['ok, go on with the export route']), unreadable);
  await assert.rejects(say(w, 's1', ['and the tests too']), unreadable);
  await assert.rejects(handoff.handlers.stop({ session_id: 's1', hook_event_name: 'Stop' }, w.io()), unreadable);
  await assert.rejects(handoff.handlers.start(startEvent('s2'), w.io()), unreadable);
  await assert.rejects(handoff.show(w.io('s1')), unreadable);
  await assert.rejects(handoff.handoff(w.io('s1')), unreadable);
  await assert.rejects(keep(w, 's1', { now: 'the export route' }), unreadable);
  await assert.rejects(handoff.drop(w.io('s1'), { rest: ['1'] }), unreadable);
  assert.equal(w.home.store.get(key), cut, 'nothing is written over it');
  assert.equal(w.home.store.get(backup), backedUp, 'and it never becomes the backup of an empty note');
  w.home.writeAtomic(key, whole); // repaired by the person: the kept line is there as before
  assert.match((await handoff.show(w.io('s1'))).text, /k1 .*Money math goes through lib\/amount\.js, never floats/);
});

test('a session record that does not read keeps its messages: its own hooks and verbs refuse, every other session goes on', async () => {
  const w = world();
  await handoff.handlers.start(startEvent('s1'), w.io());
  await say(w, 's1', ['Use the old parser.', 'Never log the token.', 'Ship on Friday.']);
  const key = storedKeys(w, 'sessions').find((name) => name.endsWith('/s1.json'));
  const cut = w.home.store.get(key).slice(0, 40); // a record cut short
  w.home.writeAtomic(key, cut);
  const unreadable = refusedBy('session-unreadable', key);
  await assert.rejects(say(w, 's1', ['one more thing']), unreadable);
  await assert.rejects(handoff.handoff(w.io('s1')), unreadable);
  await assert.rejects(keep(w, 's1', { now: 'the parser' }), unreadable);
  assert.equal(w.home.store.get(key), cut, 'no fresh record is written over it, so no kept line cites another message');
  w.later(20 * 24 * 60); // past the days a session stays: what does not read is never the one removed
  await handoff.handlers.start(startEvent('s2'), w.io());
  await say(w, 's2', ['Use tabs in the fixtures.']);
  assert.equal(w.home.store.get(key), cut);
  assert.deepEqual(handoff.heard(w.io()).map((row) => row.text), ['Use tabs in the fixtures.'], 'the other session is heard');
});
