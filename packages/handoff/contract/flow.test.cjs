// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The note reaches every new session (written only at /handoff or a compaction, a session that ends another way would leave
// `note-none`): brought up to the journal at every message, turn's end and new start, no model. The test uses two cut sessions.
const test = require('node:test');
const assert = require('node:assert/strict');
const handoff = require('@atlasbound/handoff');
const { world, startEvent, editedEvent, say, saidAtStart, BOUNDS } = require('./world.cjs');

const ISSUE = '# Deprecated options\n\nAdd a way to mark an option as deprecated: the library writes a warning that names the option.';
const ANSWERS = ['Answers from me (the developer):',
  '- About "Should it also warn when the value comes from its environment variable?": Only when the person typed the option on the command line.',
  '- About "If the option is passed more than once, should it warn once or every time?": One warning per parse, however many times the option is given.',
  '- About "Please answer Q1–Q3 and say whether the plan is OK to start.": Yes, go ahead.'].join('\n');
const PLAN = { id: '2026-11-12-option-deprecated', state: 'draft', level: { level: 'micro' }, unmet: ['ready-open-question'],
  decided: [{ key: 'deprecated.repeat', value: 'one warning per parse', said: 'One warning per parse, however many times the option is given.' }],
  open: ['Q3: Should help output mark a deprecated option?'] };
const handoffCodes =(w, step) => w.rows().filter((row) => row.step === step).map((row) => Object.keys(row.codes).sort().join('+'));

test('a session cut in its first turn, and one cut after the answers, each leave the next start a note', async () => {
  const w = world({ plans: [PLAN] });
  assert.equal(await saidAtStart(w, 's1'), '', 'the first session of the repository has nothing to be told');
  await say(w, 's1', [ISSUE]); // cut by the boundary in this turn: no turn's end, no /handoff, no compaction
  const second = await saidAtStart(w, 's2');
  assert.match(second, /^ {2}the person's last messages here, as they wrote them \(oldest first\):\n {4}- # Deprecated options/m);
  await say(w, 's2', ['Continue the work on the issue.', ANSWERS]); // cut again, after the person answered
  w.later(1);
  await say(w, 's3', ['Continue the work on the issue.']); // and again, before the answers were recorded
  const third = await saidAtStart(w, 's4');
  assert.match(third, /^ {4}- Answers from me \(the developer\):.*Only when the person typed the option on the command line\..*Yes, go ahead\.$/m,
    'the answers no plan holds yet: whole, two sessions later');
  assert.equal(third.split('One warning per parse, however many times the option is given.').length - 1, 1,
    'the answer the plan holds as the person\'s decision is said once, by the plan\'s line, not a second time in the message');
  assert.doesNotMatch(third, /should it warn once or every time/, 'and the question it quoted goes with it');
  assert.match(third, /^ {2}plan 2026-11-12-option-deprecated: draft, micro, 1 unmet\n {4}decided by the person: deprecated\.repeat = one warning per parse \("One warning per parse, however many times the option is given\."\)\n {4}still asked of the person: Q3: Should help output mark a deprecated option\?$/m);
  assert.deepEqual(handoffCodes(w, 'start'), ['note-none', ...Array(2).fill('note-refreshed+note-said')], 'said at every new session after the first message');
  assert.ok(third.split('\n').length <= BOUNDS.note.lines + 1 && third.length <= BOUNDS.note.chars + 200, 'inside its one screen');
  assert.deepEqual(w.starts, [], 'no model, no process');
});

test('a READY plan says its own decisions at the start, so the note names the plan and prints none of them again', async () => {
  const saids = ['Only when the person typed the option on the command line.', 'One warning per parse, however many times the option is given.',
    'Yes, go ahead.'];
  const ready = { ...PLAN, state: 'ready', unmet: [], open: [], decided: saids.map((said, i) => ({ key: `deprecated.rule${i}`, value: said, said })) };
  const w = world({ plans: [ready] });
  await saidAtStart(w, 's1');
  await say(w, 's1', [ISSUE, ANSWERS]);
  const next = await saidAtStart(w, 's2');
  assert.match(next, /^ {2}plan 2026-11-12-option-deprecated: ready, micro$/m, 'the plan is named with its state');
  assert.doesNotMatch(next, /decided by the person/, 'its decisions are DecisionBook\'s to say, once');
  assert.doesNotMatch(next, /Answers from me|One warning per parse|Yes, go ahead/, 'a message the plan holds whole is not printed a second time');
  assert.match(next, /^ {4}- # Deprecated options/m, 'a message no plan holds is still carried');
});

test('a turn\'s end brings the note up to the journal, and a session that ended without one is caught up at the next start', async () => {
  const w = world({ plans: [PLAN] });
  await handoff.handlers.start(startEvent('s1'), w.io());
  await say(w, 's1', [ISSUE]);
  await handoff.handlers.touched(editedEvent('s1', '/fake/lib/option.js'), w.io());
  assert.deepEqual(await handoff.handlers.stop({ session_id: 's1', hook_event_name: 'Stop' }, w.io()), { code: 'note-refreshed' });
  assert.match((await handoff.show(w.io('s1'), {})).text, /edited in this session, most edited first: lib\/option\.js x1/);
  await handoff.handlers.touched(editedEvent('s1', '/fake/lib/command.js'), w.io()); // the session dies here
  w.git.commit('Add deprecated()');
  const next = await saidAtStart(w, 's2');
  assert.match(next, /lib\/command\.js x1/, 'the edit after the last turn\'s end is in the note');
  assert.doesNotMatch(next, /STALE/, 'measured at this start');
  assert.deepEqual(handoffCodes(w, 'start').at(-1), 'note-refreshed+note-said');
  assert.deepEqual(handoffCodes(w, 'stop'), ['note-refreshed']);
  assert.equal(await saidAtStart(w, 's2', 'compact'), next, 'the same note is the same text: said once per context');
});
