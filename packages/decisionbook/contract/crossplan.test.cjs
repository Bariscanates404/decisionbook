// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Two people's plans on two branches each replace one old person decision (the text of a line on the home page), and the branches
// merge: the two new person decisions stand in two plans, a conflict across plans. Every reader names it like a conflict in one plan
// (who, words, line, none holds), both plans are held (not READY, the gate denies), and the person's answer must name every line of
// it: an answer that names one is refused with the full list (it would make a new conflict), one that names both ends it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verbs, handlers } = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, begin, added, logFile, editEvent, waitsForAnswer } = require('./world.cjs');

const FILE = 'index.html';
const KEY = 'metin.bicimi';
const OLD = 'Son güncelleme: 19 Kasım 2026';
const updateAsk = (supersedes = []) => ({ t: 'question', q: 'Q1', text: 'Which words does the update line use?', decides: KEY, whyNotCode: 'wording',
  proposal: 'as asked', blocking: true, supersedes });
const personSaid = (value, said, supersedes, key = KEY) => ({ t: 'decision', key, value, why: 'their words', by: 'the person', said, answers: 'Q1',
  effect: [`file:${FILE}`], supersedes });
const pagePlan = async (io, title, records) => {
  const id = await begin(io, { title, level: 'micro' });
  await added(io, id, [{ t: 'research', tool: 'read', asked: 'the page', answer: 'a footer line', source: `${FILE}:1` },
    { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the page' }, ...records, { t: 'confirm', by: 'the person', said: 'yes' }]);
  return id;
};
const pageWorld = () => {
  const io = bookWorld({ files: { [FILE]: 'a\n' }, branch: 'main' });
  writeConfig(io, { protect: ['index.html'] });
  return io;
};

/** The old plan, then plan A on one copy and plan B on another, both files kept by the merge. */
async function mergedPlans(keyOfA = KEY) {
  const [io, other] = [pageWorld(), pageWorld()];
  const old = await pagePlan(io, 'Add the last update line', [updateAsk(), personSaid(OLD, OLD, [])]);
  await pagePlan(other, 'Add the last update line', [updateAsk(), personSaid(OLD, OLD, [])]);
  const a = await pagePlan(io, 'Last update text as a date', [updateAsk([`${old}/${KEY}`]),
    personSaid('Güncellendi: 19.11.2026', 'Hepsi olur, devam et.', [`${old}/${KEY}`], keyOfA)]);
  const b = await pagePlan(other, 'Last update text in words', [updateAsk([`${old}/${KEY}`]),
    personSaid('Son değişiklik: 19 Kasım 2026', 'Evet, eski kararı değiştiriyorum.', [`${old}/${KEY}`])]);
  io.fs.writeAtomic(logFile(b), other.fs.readText(logFile(b)));
  return { io, a, b };
}

test('a conflict across plans: every reader names it like one in a plan, and both plans are held', async () => {
  const { io, a, b } = await mergedPlans();
  const across = 'CONFLICT (2 person decisions of this key across plans, none replacing another; none holds until the person says which)';
  for (const [verb, rest] of [['show', [`decision:${KEY}`]], ['show', [a, 'decisions']], ['show', [b, 'decisions']], ['pr', [a]], ['inbox', []]]) {
    const text = (await verbs[verb](io, { rest })).text;
    for (const part of [across, `of ${a}, by the person: "Hepsi olur, devam et."`, `of ${b}, by the person: "Evet, eski kararı değiştiriyorum."`,
      `"supersedes":${JSON.stringify([`${a}/${KEY}`, `${b}/${KEY}`].sort())}`]) assert.ok(text.includes(part), `${verb} ${rest}: ${part}\n${text}`);
    assert.doesNotMatch(text, /metin\.bicimi = (Güncellendi|Son değişiklik)/, `${verb}: no line holds`);
  }
  assert.deepEqual([await waitsForAnswer(io, a), await waitsForAnswer(io, b)], [true, true], 'neither plan is READY while it stands');
  assert.equal((await handlers.preEdit({ ...editEvent(FILE), session_id: 's1' }, io)).code, 'plan-conflict');
});

test('the person\'s answer names every line of the conflict: one that names only the other plan\'s is refused with the full list', async () => {
  const { io, a, b } = await mergedPlans();
  const answer = (supersedes) => added(io, a, { t: 'decision', key: KEY, value: 'Güncellendi: 19.11.2026 geçerli; \'Son değişiklik\' kalkar',
    why: 'their answer', by: 'the person',
    said: '\'Güncellendi: 19.11.2026\' geçerli olsun, \'Son değişiklik\' olan kalksın.', effect: [`file:${FILE}`], supersedes });
  const half = await answer([`${b}/${KEY}`]).then(() => null, (err) => err.message);
  assert.ok(half.startsWith('decision-unnamed: nothing written:') && half.includes(`${a}/${KEY}`) && half.includes(`${b}/${KEY}`), half);
  await answer([`${a}/${KEY}`, `${b}/${KEY}`]);
  const show = (await verbs.show(io, { rest: [`decision:${KEY}`] })).text;
  assert.ok(!show.includes('CONFLICT'), show);
  assert.deepEqual([await waitsForAnswer(io, a), await waitsForAnswer(io, b)], [false, false]);
});

test('two plans replacing one old decision under two key names are a conflict the same way: rivalry follows what was replaced', async () => {
  const { io, a, b } = await mergedPlans('metin');
  for (const id of [a, b]) {
    const text = (await verbs.show(io, { rest: [id, 'decisions'] })).text;
    for (const part of ['CONFLICT (2 person decisions', '"Hepsi olur, devam et."', '"Evet, eski kararı değiştiriyorum."']) assert.ok(text.includes(part), text);
  }
  assert.deepEqual([await waitsForAnswer(io, a), await waitsForAnswer(io, b)], [true, true]);
  assert.equal((await handlers.preEdit({ ...editEvent(FILE), session_id: 's1' }, io)).code, 'plan-conflict');
});
