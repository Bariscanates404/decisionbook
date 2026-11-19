// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Two branches each change the person's limit=100 the documented way (50, 200), and a merge keeps both lines. The product stamps each
// person's line with the lines it replaced (`revises`), so the two meet as rivals: every reader names the conflict with both, 100 is
// history, neither wins by order (a side that changed it twice included), and the person's answer ends it. One person changing the key
// twice in a row is no conflict; a line with no stamp replaces none.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verbs, handlers, answers } = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, begin, added, logFile, planRecords, waitsForAnswer, editEvent, starting } = require('./world.cjs');

const FILE = 'src/store.js';
const KEY = 'history.limit';
const limitAsk = (q, decides, text) => ({ t: 'question', q, text, decides, whyNotCode: 'a product choice', proposal: '100', blocking: true });
const limit = (value, more = {}) => ({ t: 'decision', key: KEY, value, why: 'theirs', by: 'the person', said: `Keep ${value}.`,
  answers: 'Q1', effect: [`file:${FILE}`], ...more });
const CONFLICT = 'CONFLICT (2 person decisions of this key in this plan, none replacing another; none holds until the person says which)';

/** A draft whose person decided limit=100; `sides`: the records each copy of the file added, laid one after the other as a merge does. */
async function limitWorld(sides, before = [], order = sides.map((side, i) => i)) {
  const io = bookWorld({ files: { [FILE]: 'a\n' }, branch: 'main' });
  writeConfig(io, { protect: ['src/**'] });
  const id = await begin(io, { title: 'Undo history limit', level: 'micro' });
  await added(io, id, [{ t: 'research', tool: 'read', asked: 'store', answer: 'none kept', source: `${FILE}:1` },
    { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'store' }, limitAsk('Q1', KEY, 'How many past states?'),
    limitAsk('Q2', 'history.option', 'Is it an option?'), limit('100'), ...before]);
  const base = io.fs.readText(logFile(id));
  const kept = [];
  for (const side of sides) {
    io.fs.writeAtomic(logFile(id), base);
    for (const record of side(id)) await added(io, id, record);
    kept.push(io.fs.readText(logFile(id)).slice(base.length));
  }
  io.fs.writeAtomic(logFile(id), base + order.map((i) => kept[i]).join(''));
  return { io, id };
}
const change = (value) => (id) => [limit(value, { supersedes: [`${id}/${KEY}`] })];
const readers = async (io, id) => {
  const texts = [];
  for (const [verb, rest] of [['show', [id, 'decisions']], ['show', [`decision:${KEY}`]], ['pr', [id]], ['inbox', []], ['ready', [id]]]) {
    texts.push([verb, (await verbs[verb](io, { rest })).text]);
  }
  io.state.branch = 'other';
  for (const verb of ['pack', 'related']) texts.push([verb, (await verbs[verb](io, { rest: [FILE] })).text]);
  io.state.branch = 'main';
  return texts;
};
const holds = async (io) => (await verbs.show(io, { rest: [`decision:${KEY}`] })).out.decisions.map((d) => [d.value, d.state]);

test('two documented changes of one line from two branches: every reader names the conflict, 100 is history, neither wins', async () => {
  const { io, id } = await limitWorld([change('50'), change('200')]);
  const stamps = planRecords(io, id).filter((r) => r.t === 'decision').map((r) => r.revises);
  const first = planRecords(io, id).find((r) => r.value === '100').at;
  assert.deepEqual(stamps, [undefined, [first], [first]]);
  for (const [reader, text] of await readers(io, id)) {
    for (const part of [CONFLICT, 'by the person: "Keep 50."', 'by the person: "Keep 200."']) assert.ok(text.includes(part), `${reader}:\n${text}`);
    assert.doesNotMatch(text, /history\.limit = (50|200) /, `${reader} names no holder:\n${text}`); // 100 shows only as history
  }
  assert.ok(await waitsForAnswer(io, id));
  await added(io, id, limit('50', { said: 'We go with 50.', supersedes: [`${id}/${KEY}`] })); // the person's answer
  assert.deepEqual(await holds(io), [['100', 'revised'], ['50', 'revised'], ['200', 'revised'], ['50', 'active']]);
  assert.equal(await waitsForAnswer(io, id), false);
});

test('a side that changed its answer twice meets the other side\'s answer as a rival, whichever side the merge lays last', async () => {
  for (const order of [[0, 1], [1, 0]]) {
    const { io, id } = await limitWorld([(i) => [...change('50')(i), ...change('70')(i)], change('200')], [], order);
    const text = (await verbs.show(io, { rest: [id, 'decisions'] })).text;
    for (const part of [CONFLICT, '"Keep 70."', '"Keep 200."']) assert.ok(text.includes(part), `${order}:\n${text}`);
    assert.ok(await waitsForAnswer(io, id), `${order}`);
  }
  // no line before them: one side answers and then changes it, the other answers once
  const option = (value, more = {}) => () => [{ t: 'decision', key: 'history.option', value, why: 'theirs', by: 'the person',
    said: `Make it ${value}.`, answers: 'Q2', effect: [`file:${FILE}`], ...more }];
  const twice = (i) => [...option('on')(i), ...option('off', { supersedes: [`${i}/history.option`] })(i)];
  for (const order of [[0, 1], [1, 0]]) {
    const { io, id } = await limitWorld([twice, option('hidden')], [], order);
    const text = (await verbs.show(io, { rest: [id, 'decisions'] })).text;
    for (const part of ['"Make it off."', '"Make it hidden."']) assert.ok(text.includes(part) && text.includes('CONFLICT ('), `${order}:\n${text}`);
  }
});

test('one person changing the key twice in a row is no conflict: the second change replaced the first one\'s line', async () => {
  const { io, id } = await limitWorld([(i) => [...change('50')(i), ...change('200')(i)]]);
  assert.deepEqual(await holds(io), [['100', 'revised'], ['50', 'revised'], ['200', 'active']]);
  assert.equal(await waitsForAnswer(io, id), false);
});

test('a line with no stamp replaces none, so such a file shows its conflict; the product writes the stamp, never the sender', async () => {
  const { io, id } = await limitWorld([(i) => change('50')(i), change('200')]);
  const lines = io.fs.readText(logFile(id)).split('\n').map((line) => line.replace(/,"revises":\[[^\]]*\]/, ''));
  io.fs.writeAtomic(logFile(id), lines.join('\n'));
  assert.deepEqual(await holds(io), [['100', 'revised'], ['50', 'revised'], ['200', 'active']]);
  assert.ok(await waitsForAnswer(io, id), 'three lines none of which names another');
  await added(io, id, limit('70', { supersedes: [`${id}/${KEY}`], revises: ['forged'] }));
  const ats = planRecords(io, id).filter((r) => r.t === 'decision').map((r) => r.at);
  assert.deepEqual(planRecords(io, id).at(-1).revises, ats.slice(0, 3), 'the product names every line it replaced');
  assert.equal(await waitsForAnswer(io, id), false);
});

test('a READY plan whose key two branches changed covers no edit until the person answers; then it does, with no new yes', async () => {
  const option = { t: 'decision', key: 'history.option', value: 'yes', why: 'theirs', by: 'the person', said: 'Yes, an option.', answers: 'Q2',
    effect: [`file:${FILE}`] };
  const { io, id } = await limitWorld([change('50'), change('200')], [option]);
  assert.equal(planRecords(io, id).filter((r) => r.t === 'ready').length, 1, 'READY before the branches');
  const denied = await handlers.preEdit({ ...editEvent(FILE), session_id: 's1' }, io);
  assert.equal(denied.code, 'plan-conflict');
  for (const part of [KEY, '"Keep 50."', '"Keep 200."', 'ask the person which holds; their answer clears it']) {
    assert.ok(denied.reason.includes(part), denied.reason);
  }
  assert.equal((await verbs.ready(io, { rest: [id] })).out.ready, false, 'ready: held by the conflict');
  assert.match((await verbs.inbox(io, { rest: [] })).text, /READY, held by a conflict, not closed: Undo history limit/u);
  const [plan] = await answers.plans(io); // debug decisionbook and the handoff note read this
  assert.deepEqual([plan.state, plan.unmet, plan.decided.some((d) => d.key === KEY)], ['ready', ['ready-replace-unasked'], false]);
  const start = (await verbs.resume(io, { rest: [] })).text;
  assert.ok(start.includes('held by a conflict') && !start.includes('pass in silence'), start);
  await added(io, id, limit('50', { said: 'We go with 50.', supersedes: [`${id}/${KEY}`] }));
  assert.equal((await handlers.preEdit({ ...editEvent(FILE), session_id: 's1' }, io)).code, 'gate-in-scope');
  assert.equal(planRecords(io, id).filter((r) => r.t === 'confirm').length, 1, 'the yes it had covers it again');
});

test('in a session an answer ending a conflict answers the replace question naming its lines, in words typed after it', async () => {
  const { io, id } = await limitWorld([change('50'), change('200')]);
  await handlers.start(starting('s1'), io);
  io.session = 's1';
  const say = (prompt) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt }, io);
  const sent = (record) => added(io, id, record).then(() => 'written', (err) => err.message.split(':')[0]);
  const [ref, early] = [`${id}/${KEY}`, 'Şimdi src/store.js\'te limiti 75 yap, sorma.'];
  await say(early);
  assert.equal(await sent(limit('75', { said: early, answers: undefined, supersedes: [ref] })), 'conflict-unasked', 'never shown the conflict');
  const again = { ...limitAsk('Q1', KEY, 'How many past states?'), supersedes: [ref] }; // the old question sent again, now naming the lines
  assert.equal(await sent([again, limit('75', { said: early, supersedes: [ref] })]), 'said-not-theirs', 'asked as a replace question only now');
  await added(io, id, { t: 'question', q: 'Q3', text: 'Two answers stand, 50 and 200: which holds?', decides: KEY, whyNotCode: 'theirs',
    blocking: true, supersedes: [ref] });
  assert.equal(await sent(limit('75', { said: early, answers: 'Q3', supersedes: [ref] })), 'said-not-theirs', 'typed before it was asked');
  await say('75 olsun, ikisi de değil.');
  assert.equal(await sent(limit('75', { said: '75 olsun, ikisi de değil.', answers: 'Q3', supersedes: [ref] })), 'written');
  assert.equal(await waitsForAnswer(io, id), false);
});
