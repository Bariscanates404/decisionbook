// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A teammate's standing decision is replaced by the person in one answer: their decision that names it in `supersedes`, their own
// words beside it. The sentences are a person's, in Turkish and in English: the new decision stands in the old one's place, never
// beside it, and shows who replaced it with which words.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, wire, planRecords, starting, theirAnswer, stateOf } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const LESSON = 'lessons/orbit-transfer.html';
const replaceAsks = (q, decides, text, proposal) => ({ t: 'question', q, text, decides, whyNotCode: 'only the person changes it', proposal, blocking: true });
const TR = { task: 'Ders 16\'daki Hohmann transfer hesaplayıcısına Jüpiter ön ayar düğmesi ekle.',
  old: 'Sadece Dünya, Venüs ve Mars ön ayar düğmeleri olsun, Jüpiter olmasın; kaydırıcı aralığı 0,4–5 AU.',
  asks: [replaceAsks('Q1', 'calc.presets', 'Daha önce kişi \'Jüpiter olmasın\' diye karar vermişti (decision:inputs). Bu kararı Jüpiter eklenecek şekilde değiştirdiğini '
    + 'onaylıyor musun?', 'Evet, inputs kararı değişsin: Dünya, Venüs, Mars ve Jüpiter ön ayarları.'),
  replaceAsks('Q2', 'calc.range', 'Jüpiter 5,203 AU, kaydırıcı üst sınırı ise 5 AU (bu da kararın parçası). Üst sınır 5,5 AU\'ya çıksın mı?', 'Evet, max 5,5 AU (min 0,4 aynı kalır).'),
  replaceAsks('Q3', 'calc.button', 'Düğme etiketi \'Jüpiter\' olsun ve Mars\'ın sağında, hem Başlangıç hem Hedef satırında yer alsın mı?', 'Etiket \'Jüpiter\', Mars\'tan sonra, iki satırda da.')],
  q4: replaceAsks('Q4', 'calc.inputs', 'Eski karar (decision:inputs: \'Sadece Dünya, Venüs ve Mars ön ayarları, Jüpiter yok; kaydırıcı 0,4–5 AU\') yerine şu geçsin mi: '
    + '\'Ön ayarlar Dünya, Venüs, Mars ve Jüpiter; kaydırıcı 0,4–6 AU\'?', 'Evet, inputs kararı bu metinle değişsin.'),
  said: ['Evet, Jüpiter de olsun, eski kararı değiştiriyorum.', 'Kaydırıcı 0,4–6 AU olsun.', 'Evet, öyle olsun.'],
  read: 'Ön ayarlar Dünya, Venüs, Mars ve Jüpiter olsun; eski \'Jüpiter olmasın\' kararı değişiyor.', // the value as the AI worded it
  approve: 'Onaylıyorum.', yesQ4: 'Evet, Q4\'ü onaylıyorum.', no: 'Hayır, eski karar kalsın.', later: 'Q1 sonra, önce ekibe soracağım.',
  vague: ['Jüpiter de olsun.', 'Evet, ama Jüpiter olmasın.'] };
const EN = { task: 'Add a Jupiter preset button to the Hohmann transfer calculator of lesson 16.',
  old: 'Only Earth, Venus and Mars preset buttons, no Jupiter; the slider range is 0.4–5 AU.',
  asks: [replaceAsks('Q1', 'calc.presets', 'A person decided \'no Jupiter\' earlier (decision:inputs). Do you confirm that this decision changes so that Jupiter is added?',
    'Yes, the inputs decision changes: Earth, Venus, Mars and Jupiter presets.'),
  replaceAsks('Q2', 'calc.range', 'Jupiter is at 5.203 AU and the slider ends at 5 AU (also part of that decision). Should the upper limit rise to 5.5 AU?', 'Yes, max 5.5 AU (min 0.4 stays).'),
  replaceAsks('Q3', 'calc.button', 'Should the button read \'Jupiter\', stand right of Mars, and show in both the Start and the Target row?', 'Label \'Jupiter\', after Mars, in both rows.')],
  q4: replaceAsks('Q4', 'calc.inputs', 'Should this replace the old decision (decision:inputs: \'Only Earth, Venus and Mars presets, no Jupiter; slider 0.4–5 AU\'): '
    + '\'Presets Earth, Venus, Mars and Jupiter; slider 0.4–6 AU\'?', 'Yes, the inputs decision changes to this text.'),
  said: ['Yes, Jupiter too, I am changing the old decision.', 'Make the slider 0.4–6 AU.', 'Yes, do it that way.'],
  read: 'Presets are Earth, Venus, Mars and Jupiter; the old \'no Jupiter\' decision is changed.',
  approve: 'Approved.', yesQ4: 'Yes, I approve Q4.', no: 'No, the old decision stays.', later: 'Q1 later, I will ask the team first.',
  vague: ['Add Jupiter.', 'Yes, but not Jupiter.'] };
const asNumbered = (said) => said.map((sentence, i) => `${i + 1}. ${sentence}`).join(' ');

/** A teammate's plan on another branch holds their decision `inputs` (READY, made at their terminal); then an AI session on this
 * branch gets the task and writes its plan with `asks` (`naming`: Q1 names the decision it asks to replace, in its record; else not
 * even in its text). */
async function replaceWorld(words, { naming = true, asks = words.asks, value = words.old } = {}) {
  const io = bookWorld({ files: { [LESSON]: 'a\nb\n' }, branch: 'master' });
  writeConfig(io, { protect: ['lessons/**'] });
  const head = { why: 'the lesson needs it', success: 'the calculator shows it', kind: 'feature', level: 'micro' };
  const draft = [{ t: 'research', tool: 'read', asked: 'the presets', answer: 'a PRE list', source: `${LESSON}:1` }, { t: 'item', kind: 'precedent', text: 'the PRE list' },
    { t: 'link', rel: 'plans', to: `file:${LESSON}`, why: 'the calculator' }, { t: 'check', id: 'AC-1', text: 'it shows', command: 'node --check x' }];
  const old = (await verbs.create(io, { rest: [wire({ ...head, title: 'Hohmann calculator', records: [...draft,
    { t: 'decision', key: 'inputs', value, why: 'scope', whose: 'person', said: words.old }, { t: 'confirm', by: 'Eve', said: 'yes' }] })] })).out.id;
  io.state.branch = 'lesson-change';
  await handlers.start(starting('s1'), io);
  io.session = 's1';
  const say = (prompt) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt }, io);
  await say(words.task);
  const ref = `${old}/inputs`;
  const [first, ...rest] = asks;
  const asked = naming ? { ...first, supersedes: [ref] } : { ...first, text: first.text.replace(' (decision:inputs)', '') };
  const id = (await verbs.create(io, { rest: [wire({ ...head, title: 'Jupiter preset', records: [...draft, asked, ...rest] })] })).out.id;
  const add = (records) => verbs.add(io, { rest: [id, wire(records)] });
  const decided = () => planRecords(io, id).filter((r) => r.t === 'decision').map((r) => [r.answers, r.by, r.supersedes || []]);
  const inputs = async () => (await verbs.show(io, { rest: ['decision:inputs'] })).out.decisions.filter((d) => d.state !== 'revised')
    .map((d) => [d.plan === old ? 'old' : 'new', d.state]);
  return { io, old, id, ref, say, add, decided, inputs };
}
/** The person's three answers as the AI records them: the first replaces their teammate's decision `ref`. */
const theirThree = (words, ref) => words.said.map((said, i) => ({ ...theirAnswer(`Q${i + 1}`, ['inputs', 'range', 'button'][i], said, said),
  ...(i === 0 && { supersedes: [ref] }) }));

test('[I-3] the person\'s answer that names a teammate\'s decision in supersedes replaces it in that one add', async () => {
  for (const words of [TR, EN]) {
    const w = await replaceWorld(words);
    await w.say(asNumbered(words.said));
    const res = await w.add(theirThree(words, w.ref));
    assert.deepEqual(w.decided(), [['Q1', 'Amy', [w.ref]], ['Q2', 'Amy', []], ['Q3', 'Amy', []]], 'what their answer replaces, as the AI read it');
    assert.equal(stateOf(res), 'READY', 'their answers are their yes: no second message');
    assert.deepEqual(await w.inputs(), [['old', 'superseded'], ['new', 'active']], 'one live decision of the key, never two');
    const shown = (await verbs.show(w.io, { rest: ['decision:inputs'] })).text;
    assert.ok(shown.includes(` superseded by ${w.id}/inputs (Amy, 2026-11-02: "${words.said[0]}")`), `who replaced it, when, their sentence:\n${shown}`);
    const card = (await verbs.related(w.io, { rest: [LESSON] })).text;
    assert.ok(card.includes(` replaced by ${w.id}/inputs (Amy, 2026-11-02: "${words.said[0]}")`), card);
    w.io.state.branch = 'master'; // the teammate's next session on their READY plan reads their decision as replaced, never as settled
    assert.ok((await verbs.resume(w.io, { rest: [] })).text.includes(`", replaced by ${w.id}/inputs (Amy, 2026-11-02: "${words.said[0]}")`));
  }
});

// A replaced decision of a person carries their own sentence (up to 240 characters): the mark stood behind it, at the far end of a
// 600-character line, and was read as no mark at all.
test('[I-3] a replaced decision says so before the person\'s own sentence, in show of the key and of its plan', async () => {
  const w = await replaceWorld(TR, { value: 'Jüpiter yok, 0,4–5 AU.' });
  await w.say(asNumbered(TR.said));
  await w.add(theirThree(TR, w.ref));
  const mark = `- inputs = Jüpiter yok, 0,4–5 AU. (scope; by Amy) superseded by ${w.id}/inputs (Amy, 2026-11-02: "${TR.said[0]}"); Amy: "${TR.old}"`;
  assert.equal((await verbs.show(w.io, { rest: ['decision:inputs'] })).text.split('\n')[1], `${mark} in ${w.old}`);
  assert.ok((await verbs.show(w.io, { rest: [w.old, 'decisions'] })).text.split('\n').includes(mark));
});

test('a question whose text or key names a person\'s decision is refused until its record names it, before the person is asked', async () => {
  for (const words of [TR, EN]) { // a question that names the decision in its text only
    const w = await replaceWorld(words, { naming: false, asks: words.asks.slice(1) });
    const refusal = (record) => w.add([record]).then(() => null, (err) => [err.code, err.message]);
    for (const asked of [words.q4, replaceAsks('Q4', 'inputs', words.asks[1].text, words.q4.proposal)]) { // by its text, by its key
      const [code, said] = await refusal(asked);
      assert.deepEqual([code, said.includes(`to ask the person to replace it, add "supersedes":["${w.ref}"] to this question`)], ['question-settled', true], said);
    }
    const unknown = await refusal({ ...words.q4, supersedes: ['decision:inputs'] });
    assert.deepEqual([unknown[0], unknown[1].includes('decision:inputs')], ['supersede-unknown', true], String(unknown));
    assert.equal((await w.add([{ ...words.q4, supersedes: [w.ref] }])).out.code, 'plan-recorded', 'naming it, the question is the way to replace it');
  }
});

test('[I-3] a draft\'s decision that replaces one on the person\'s words shows as replacing it, pending until READY, no conflict', async () => {
  const w = await replaceWorld(TR, { asks: TR.asks.slice(0, 1) });
  await w.say('Evet.');
  await w.add([{ ...theirAnswer('Q1', 'inputs', TR.asks[0].proposal, 'Evet.'), supersedes: [w.ref] },
    { t: 'question', q: 'Q2', text: 'Renk ne olsun?', decides: 'color', whyNotCode: 'taste', proposal: 'Mavi.', blocking: true }]);
  const lines = (await verbs.show(w.io, { rest: ['decision:inputs'] })).text.split('\n').filter((line) => line.startsWith('- inputs'));
  assert.deepEqual(lines.map((line) => [line.includes('CONFLICT'), line.includes(`replaces ${w.ref} (pending until READY)`)]), [[false, false], [false, true]],
    lines.join('\n'));  // set aside before it was ever READY, the draft's line is history to every reader, as it is to the core
  await w.say('Bunu bırak, vazgeçtim.');
  await w.add([{ t: 'aside', by: '', said: 'Bunu bırak, vazgeçtim.' }]);
  const after = (await verbs.show(w.io, { rest: ['decision:inputs'] })).text.split('\n').filter((line) => line.startsWith('- inputs'));
  assert.deepEqual(after.map((line) => / (active|set aside)(?:[;, ]|$)/.exec(line)?.[1]), ['active', 'set aside'], after.join('\n'));
  const value = TR.asks[0].proposal;
  for (const verb of ['pack', 'related']) {
    const text = (await verbs[verb](w.io, { rest: [LESSON] })).text;
    assert.ok(!text.split('\n').some((line) => /^- inputs = /.test(line) && line.includes(value)), `${verb} serves no line of the plan set aside:\n${text}`);
  }
});
