// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Two people answer one question of one plan on two copies of a branch, and `git merge` keeps both sides' lines. Three cases, apart:
// (1) the two person decisions of the key conflict (another value, in other words): every reader of what holds (show, a decision's
// node, pr, the plan pack, related, inbox, ready) names a conflict with both lines, whose each is, their words and where, says that
// neither holds, and asks for the person's answer; (2) two compatible ones (the same value byte for byte, whatever the words) raise
// nothing, and the same words with another value are no compatible ones; (3) a decision the person replaced the documented way (its key again, naming it in `supersedes`) shows its
// history and no conflict.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verbs } = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, begin, added, logFile, waitsForAnswer } = require('./world.cjs');

const KEY = 'note.text';
const FILE = 'lessons/escape.html';
const ASK = (q, decides, text) => ({ t: 'question', q, text, decides, whyNotCode: 'the wording is theirs', proposal: 'the textbook line', blocking: true });
const DRAFT = [{ t: 'research', tool: 'read', asked: 'the lesson', answer: 'a takeaway box', source: `${FILE}:1` },
  { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the lesson' }, { t: 'check', id: 'AC-1', text: 'the note shows', command: 'node --check x' },
  ASK('Q1', KEY, 'What should the note say?'), ASK('Q2', 'note.place', 'Where does the note go?')];
const noteSaid = (said, more = {}) => ({ t: 'decision', key: KEY, value: said, why: 'their wording', by: 'the person', said, answers: 'Q1',
  effect: [`file:${FILE}`], ...more });
const [ALI, ZEY] = ['Escape velocity is the least speed that leaves a planet behind.', 'Escape velocity lets a rocket coast away for good.'];
const CONFLICT = 'CONFLICT (2 person decisions of this key in this plan, none replacing another; none holds until the person says which)';
const READERS = (id) => [['show', [id, 'decisions']], ['show', [`decision:${KEY}`]], ['pr', [id]], ['inbox', []], ['ready', [id]],
  ['resume', []]];
const verbSays = async (io, verb, rest) => (await verbs[verb](io, { rest })).text;

/** A draft whose Q1 two people answered at their own terminals on two copies of its file (`sides`: each the record its side added),
 * then merged keeping both sides' lines. */
async function mergedWorld(sides) {
  const io = bookWorld({ files: { [FILE]: 'a\n' }, branch: 'main' });
  writeConfig(io, { protect: ['lessons/**'] });
  const id = await begin(io, { title: 'Escape velocity note', level: 'micro' });
  await added(io, id, DRAFT);
  const base = io.fs.readText(logFile(id));
  const kept = [];
  for (const record of sides) {
    io.fs.writeAtomic(logFile(id), base);
    await added(io, id, record);
    kept.push(io.fs.readText(logFile(id)).slice(base.length));
  }
  io.fs.writeAtomic(logFile(id), base + kept.join('')); // what a merge that keeps both sides' lines leaves
  const lineOf = (said) => io.fs.readText(logFile(id)).split('\n').findIndex((line) => line.includes(said)) + 1;
  return { io, id, lineOf };
}
/** Every reader's text of plan `id`, and the plan pack and the cards read from another branch. */
async function readersOf(io, id) {
  const texts = [];
  for (const [verb, rest] of READERS(id)) texts.push([`${verb} ${rest.join(' ')}`, await verbSays(io, verb, rest)]);
  const branch = io.state.branch;
  io.state.branch = 'other'; // from another branch, the plan is an earlier one of the area
  texts.push(['pack', await verbSays(io, 'pack', [FILE])], ['related', await verbSays(io, 'related', [FILE])]);
  io.state.branch = branch;
  return texts;
}

test('(1) a conflict a merge kept: every reader names it with both lines, whose, their words, where; holds neither; asks', async () => {
  const { io, id, lineOf } = await mergedWorld([noteSaid(ALI, { saidBy: 'Ali' }), noteSaid(ZEY)]);
  const parts = [CONFLICT, `line ${lineOf(ALI)}, by the person (relayed from Ali): "${ALI}"`, `line ${lineOf(ZEY)}, by the person: "${ZEY}"`,
    `"supersedes":["${id}/${KEY}"]`, `\`git blame -L <line>,<line> .decisionbook/${id}.jsonl\` names the commit and author of each line`];
  for (const [reader, text] of (await readersOf(io, id)).filter(([reader]) => !reader.startsWith('resume'))) { // a draft's start: one line
    for (const part of parts) assert.ok(text.includes(part), `${reader} says ${part}:\n${text}`);
    assert.doesNotMatch(text, /note\.text = |later line|is used/, `${reader} presents no line as the one that holds:\n${text}`);
  }
  assert.ok(await waitsForAnswer(io, id), 'open for the AI to ask');
});

test('(2) only the same value byte for byte is compatible: the same words, or no words, with another value are a conflict', async () => {
  const same = await mergedWorld([noteSaid(ZEY, { said: 'Use this text.' }), noteSaid(ZEY, { said: 'Yes, that one.' })]);
  for (const [reader, text] of await readersOf(same.io, same.id)) assert.doesNotMatch(text, /CONFLICT \(/, `${reader}:\n${text}`);
  assert.equal(await waitsForAnswer(same.io, same.id), false);
  const yes = await mergedWorld([noteSaid(ALI, { said: 'Yes.' }), noteSaid(ZEY, { said: 'Yes.' })]);
  const bare = await mergedWorld([noteSaid(ALI, { said: undefined }), noteSaid(ZEY, { said: undefined })]);
  for (const { io, id } of [yes, bare]) assert.equal(await waitsForAnswer(io, id), true);
});

test('(3) the person\'s documented change replaces the lines before it: its history shows, and no conflict', async () => {
  const { io, id } = await mergedWorld([noteSaid(ALI), noteSaid(ZEY)]);
  await added(io, id, noteSaid(ZEY, { supersedes: [`${id}/${KEY}`] })); // the person's answer to the conflict
  for (const [reader, text] of await readersOf(io, id)) assert.doesNotMatch(text, /CONFLICT \(/, `${reader}:\n${text}`);
  const states = (await verbs.show(io, { rest: [`decision:${KEY}`] })).out.decisions.map((d) => [d.value, d.state]);
  assert.deepEqual(states, [[ALI, 'revised'], [ZEY, 'revised'], [ZEY, 'active']]);
  assert.equal(await waitsForAnswer(io, id), false);
});

test('a merge that puts an AI line after a person\'s on one key: the person\'s line holds in every reader', async () => {
  const { io, id } = await mergedWorld([noteSaid(ALI), { ...noteSaid('An AI text.'), by: 'ai', said: undefined }]);
  const states = (await verbs.show(io, { rest: [`decision:${KEY}`] })).out.decisions.map((d) => [d.value, d.by, d.state]);
  assert.deepEqual(states, [[ALI, 'the person', 'active'], ['An AI text.', 'ai', 'revised']]);
  for (const [reader, text] of await readersOf(io, id)) { // a decision's own node lists its history, the AI's line as no holder
    if (reader.startsWith('show decision:')) assert.match(text, /An AI text\. .*by the AI\) revised in/, text);
    else assert.doesNotMatch(text, /An AI text\./, `${reader}:\n${text}`);
  }
  await added(io, id, [{ t: 'decision', key: 'note.place', value: 'top', why: 'theirs', by: 'the person', said: 'top', answers: 'Q2',
    effect: [`file:${FILE}`] }, { t: 'confirm', by: 'the person', said: 'go' }]);
  const start = await verbSays(io, 'resume', []); // a READY plan's start: the settled decisions a new session builds from
  assert.ok(start.includes(ALI) && !start.includes('An AI text.'), start);
});

test('in one place, the documented change is one decision; the key again in other words with no supersedes is refused', async () => {
  const io = bookWorld({ files: { [FILE]: 'a\n' }, branch: 'main' });
  writeConfig(io, { protect: ['lessons/**'] });
  const id = await begin(io, { title: 'Escape velocity note', level: 'micro' });
  await added(io, id, [...DRAFT, noteSaid(ALI)]);
  await added(io, id, noteSaid(ZEY, { supersedes: [`${id}/${KEY}`] }));
  assert.ok(!(await verbSays(io, 'show', [id, 'decisions'])).includes('CONFLICT ('), 'the documented change');
  const again = await added(io, id, noteSaid(ALI)).then(() => null, (err) => err.message);
  assert.ok(again.startsWith(`decision-unnamed: nothing written: ${id}/${KEY}:`), again); // the write makes no conflict; only a merge does
});
