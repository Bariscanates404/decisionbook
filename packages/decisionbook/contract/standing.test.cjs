// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A person's standing decision on a file holds against every later plan that edits that file: before READY the plan places it (the
// person's answer replaces or keeps it) or says in a non-goal why its change leaves it. A plan that only reads the file places nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, wire, starting, stateOf, editEvent, ruling } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const LESSON = 'dersler/16-hohmann-transfer.html';
const INPUTS = 'Jüpiter (5,203 AU) ön ayarı eklenir; kaydırıcı aralığı 0,4–6 AU.';
const head = (title) => ({ title, why: 'the lesson', success: 'it shows', kind: 'chore', level: 'micro' });
const plansLink = (file = LESSON) => ({ t: 'link', rel: 'plans', to: `file:${file}`, why: 'the buttons are built there' });

/** A teammate's closed plan holds the person's `inputs` (Jupiter in, 0.4–6 AU) and `hours` on the lesson; then an AI session on the
 * same branch where the person typed `task`. */
async function editorWorld(task) {
  const io = bookWorld({ files: { [LESSON]: 'a\nb\n', 'dersler/15.html': 'c\n' }, branch: 'team-zey' });
  writeConfig(io, { protect: ['dersler/**'] });
  const ali = (await verbs.create(io, { rest: [wire({ ...head('Jupiter preset and hours'), records: [plansLink(),
    { t: 'decision', key: 'inputs', value: INPUTS, why: 'Jupiter too', by: 'Ali', said: 'Evet, Jüpiter de olsun.' },
    { t: 'decision', key: 'hours', value: 'hours beside days', why: 'hours', by: 'Ali', said: 'saat de gösterilsin' },
    { t: 'confirm', by: 'Ali', said: 'Evet.' }] })] })).out.id;
  io.state.commits = [{ after: 'h0', sha: 'c1', subject: 'Jupiter preset', body: `DecisionBook: ${ali}`, files: [LESSON] }];
  io.state.head = 'c1';
  await verbs.close(io, { rest: [ali] });
  await handlers.start(starting('s1'), io);
  io.session = 's1';
  const say = (prompt) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt }, io);
  await say(task);
  const plan = async (title, records) => { // its id, and what `new` answered
    const made = await verbs.create(io, { rest: [wire({ ...head(title), records })] });
    return { id: made.out.id, text: made.text };
  };
  const add = (id, records) => verbs.add(io, { rest: [id, wire(records)] });
  const shown = async () => (await verbs.show(io, { rest: ['decision:inputs'] })).out.decisions.map((d) => [d.plan === ali ? 'ali' : 'new', d.state]);
  return { io, say, plan, add, shown, refs: [`${ali}/inputs`, `${ali}/hours`] };
}

test('a plan reversing a standing decision on its file is not READY on a yes alone; the person\'s answer replaces it', async () => {
  const w = await editorWorld('Ders 16 hesaplayıcısındaki Jüpiter ön ayar düğmesini kaldır.');
  const { id, text } = await w.plan('Remove the Jupiter button', [plansLink(), { t: 'check', id: 'AC-1', text: 'no Jupiter', command: 'node --check x' }]);
  assert.ok(text.includes(`${w.refs[0]} = "${INPUTS}" holds on ${LESSON}, which this plan edits`), text);
  assert.match(text, /Ask the person the replace question/u);
  const said = 'Evet, eski kararı değiştiriyorum: Jüpiter düğmesi olmasın.';
  await w.say(`1. ${said} 2. Önerdiğin gibi.`);
  assert.equal(stateOf(await w.add(id, [{ t: 'confirm', by: 'the person', said }])), 'ready-replace-unasked', 'their yes alone replaces nothing');
  assert.deepEqual([ruling(await handlers.preEdit({ ...editEvent(LESSON), session_id: 's1' }, w.io)), await w.shown()],
    [['deny', 'plan-draft-here'], [['ali', 'active']]], 'no edit, and the old decision still the one that holds');
  await w.add(id, [{ t: 'research', tool: 'read', asked: 'the presets', answer: 'a PRE list', source: `${LESSON}:1` },
    { t: 'question', q: 'Q1', text: 'Jüpiter kalksın mı?', decides: 'inputs', whyNotCode: 'a person decided it', proposal: 'Jüpiter yok', supersedes: [w.refs[0]] },
    { t: 'item', kind: 'non-goal', text: 'the hours line stays as it is', covers: [w.refs[1]] }]);
  const done = await w.add(id, [{ t: 'decision', key: 'inputs', value: 'Jüpiter düğmesi yok.', why: 'removed', by: 'the person', said, answers: 'Q1',
    supersedes: [w.refs[0]], effect: ['check:AC-1'] }]);
  assert.deepEqual([stateOf(done), await w.shown()], ['READY', [['ali', 'superseded'], ['new', 'active']]]);
});

test('a change that leaves a standing decision says why in a non-goal; a plan that only reads the file places nothing', async () => {
  const w = await editorWorld('Jüpiter düğmesinin rengini turuncu yap');
  const { id: orange, text } = await w.plan('Orange Jupiter button', [plansLink()]);
  assert.ok(text.includes(`${w.refs[1]} = "hours beside days" holds on ${LESSON}`), text);
  await w.say('Önerilerini kabul ediyorum.');
  assert.equal(stateOf(await w.add(orange, [{ t: 'confirm', by: '', said: 'Önerilerini kabul ediyorum.' }])), 'ready-replace-unasked');
  const left = await w.add(orange, [{ t: 'item', kind: 'non-goal', text: 'the colour leaves which presets exist and the hours line', covers: w.refs }]);
  assert.deepEqual([stateOf(left), await w.shown()], ['READY', [['ali', 'active']]]);
  const { id: reader } = await w.plan('Lesson 15 note', [plansLink('dersler/15.html'),
    { t: 'research', tool: 'read', asked: 'how lesson 16 words it', answer: 'a note', source: `${LESSON}:1` }]);
  await w.say('Tamam, devam.');
  assert.equal(stateOf(await w.add(reader, [{ t: 'confirm', by: '', said: 'Tamam, devam.' }])), 'READY', 'read, not edited: nothing to place');
});
