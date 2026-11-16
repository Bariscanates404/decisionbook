// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Where the person's words are: the head of each message in their home folder, for the session, screened for secrets and bounded.
// Nothing of them is in the repository or in a trace row, no process is started, and one folder holds it all for a purge.
const test = require('node:test');
const assert = require('node:assert/strict');
const handoff = require('@atlasbound/handoff');
const { world, startEvent, editedEvent, compactEvent, promptEvent, say, keep, homeText, repoText, HERE, BOUNDS: ALL } = require('./world.cjs');

const PHRASE = 'the zebra crossing protocol';
const SECRET = ['sk', 'live', '9f8e7d6c5b4a39281706f5e4d3c2b1a0'].join('_'); // built here: no file holds a key's full shape
const BOUNDS = ALL.message;

/** A whole session: a start, messages with a planted phrase and a planted secret, an edit, a handoff, a reply, a compaction, a start. */
async function wholeSession(w) {
  await handoff.handlers.start(startEvent('s1'), w.io());
  await say(w, 's1', [`Always follow ${PHRASE} for payments.`, `use this key: api_key = "${SECRET}" in staging`]);
  await handoff.handlers.touched(editedEvent('s1', '/fake/src/pay.js'), w.io());
  await handoff.handoff(w.io('s1'));
  await keep(w, 's1', { now: 'payments half-wired', kept: [`Always follow ${PHRASE} for payments [m1]`] });
  await handoff.handlers.compact(compactEvent('s1'), w.io());
  await handoff.handlers.start(startEvent('s1', 'compact'), w.io());
  await handoff.debug.handoff(w.io('s1'));
}

test('[I-10] after a whole session a planted phrase is in the home store and nowhere in the repository or a trace row', async () => {
  const w = world();
  await wholeSession(w);
  assert.ok(homeText(w).includes(PHRASE), 'the home store holds the head of the message and the kept line');
  assert.ok(!repoText(w).includes('zebra'), 'the repository holds nothing of it');
  const rows = w.rows();
  assert.deepEqual([...new Set(rows.map((r) => r.step))].sort(), ['compact', 'debug', 'handoff', 'keep', 'prompt', 'start', 'touched']);
  assert.ok(rows.every((r) => !JSON.stringify(r).includes('zebra') && !JSON.stringify(r).includes('pay.js')), 'a trace row holds counts and codes');
  assert.ok([...w.home.store.keys()].every((key) => key.startsWith(`${HERE}/`)), 'everything is under this repository\'s one folder in the home');
  assert.deepEqual(handoff.homeStores(w.io()), [HERE], 'the folder uninstall --purge removes');
  assert.equal(handoff.keptStores, undefined, 'nothing is kept in the repository');
});

test('[I-4] a secret in a message is screened before the head is kept, and never reaches the fill-in', async () => {
  const w = world();
  await wholeSession(w);
  assert.ok(!homeText(w).includes(SECRET) && !repoText(w).includes(SECRET));
  assert.match((await handoff.handoff(w.io('s1'))).text, /^ {2}m2 use this key: api_key = "?\[[^\]]+\]/m);
});

test('[I-11] nothing starts a process: after a whole session the process door recorded no start', async () => {
  const w = world();
  await wholeSession(w);
  await handoff.show(w.io('s1'));
  await handoff.drop(w.io('s1'), { rest: ['1'] });
  assert.deepEqual(w.starts, []);
});

test('[I-4] a message is kept as a clipped head and a session holds a bounded number, the oldest uncited going first', async () => {
  const w = world();
  await say(w, 's1', ['The first decision: tabs, never spaces.', `long ${'x'.repeat(2000)}`]);
  await keep(w, 's1', { kept: ['The first decision: tabs, never spaces. [m1]'] }); // a sentence with a negation, whole
  await say(w, 's1', Array.from({ length: BOUNDS.perSession + 5 }, (_, i) => `filler ${i}`));
  const session = JSON.parse(w.home.store.get(`${HERE}/sessions/s1.json`));
  assert.equal(session.count, BOUNDS.perSession + 7);
  assert.equal(session.messages.length, BOUNDS.perSession);
  assert.deepEqual(session.messages.slice(0, 2).map((m) => m.n), [1, 9], 'the cited message stays, the oldest uncited went');
  assert.ok(session.messages.every((m) => m.text.length <= BOUNDS.chars));
  const { text } = await handoff.handoff(w.io('s1'));
  assert.match(text, new RegExp(`\\(${BOUNDS.perSession} of ${BOUNDS.perSession + 7}\\):`));
  const listed = text.split('\n').filter((line) => /^ {2}m\d+ /.test(line)).join('\n');
  assert.ok(listed.length <= BOUNDS.shown + BOUNDS.perSession * 8, `${listed.length} characters of messages`);
});

test('[I-4] the messages go to DecisionBook as id, time and text; the record of a session unseen for two weeks leaves the home', async () => {
  const w = world();
  await say(w, 'aaaaaaaa-1111', ['Callers use lib/sched only.']);
  assert.deepEqual(handoff.heard(w.io()), [{ id: 'aaaaaaaa.1', at: '2026-11-12T01:00:00.000Z', text: 'Callers use lib/sched only.' }]);
  await handoff.handlers.touched(editedEvent('aaaaaaaa-1111', '/fake/a.js'), w.io());
  w.later(60 * 24 * (ALL.sessionDays + 1));
  await handoff.handlers.start(startEvent('s2'), w.io());
  assert.deepEqual(handoff.heard(w.io()), []);
  assert.deepEqual([...w.home.store.keys()].filter((key) => key.includes('aaaaaaaa')), []);
  assert.deepEqual(await handoff.handlers.prompt(promptEvent('s2', 'hello again'), w.io()), { code: 'message-kept' });
});
