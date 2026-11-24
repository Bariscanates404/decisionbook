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
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, begin, added, logFile, waitsForAnswer, editEvent, starting, wire } = require('./world.cjs');

const { verbs, handlers } = decisionbook;

const KEY = 'note.text';
const FILE = 'lessons/escape.html';
const ASK = (q, decides, text) => ({ t: 'question', q, text, decides, whyNotCode: 'the wording is theirs', proposal: 'the textbook line', blocking: true });
const DRAFT = [{ t: 'research', tool: 'read', asked: 'the lesson', answer: 'a takeaway box', source: `${FILE}:1` },
  { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the lesson' }, { t: 'check', id: 'AC-1', text: 'the note shows', command: 'node --check x' },
  ASK('Q1', KEY, 'What should the note say?'), ASK('Q2', 'note.place', 'Where does the note go?')];
const noteSaid = (said, more = {}) => ({ t: 'decision', key: KEY, value: said, why: 'their wording', whose: 'person', said, answers: 'Q1',
  effect: [`file:${FILE}`], ...more });
const [ABE, ZOE] = ['Escape velocity is the least speed that leaves a planet behind.', 'Escape velocity lets a rocket coast away for good.'];
const CONFLICT = 'CONFLICT (2 person decisions in this plan, none replacing another; none holds until the person says which)';
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
  const { io, id, lineOf } = await mergedWorld([noteSaid(ABE, { whose: 'Abe' }), noteSaid(ZOE)]);
  const parts = [CONFLICT, `line ${lineOf(ABE)}, by Abe, relayed by Amy: "${ABE}"`, `line ${lineOf(ZOE)}, by Amy: "${ZOE}"`,
    `"supersedes":["${id}/${KEY}"]`, `\`git blame -L <line>,<line> .decisionbook/${id}.jsonl\` names the commit and author of each line`];
  for (const [reader, text] of (await readersOf(io, id)).filter(([reader]) => !reader.startsWith('resume'))) { // a draft's start: one line
    for (const part of parts) assert.ok(text.includes(part), `${reader} says ${part}:\n${text}`);
    assert.doesNotMatch(text, /note\.text = |later line|is used/, `${reader} presents no line as the one that holds:\n${text}`);
  }
  assert.ok(await waitsForAnswer(io, id), 'open for the AI to ask');
});

test('(2) only the same value byte for byte is compatible: the same words, or no words, with another value are a conflict', async () => {
  const same = await mergedWorld([noteSaid(ZOE, { said: 'Use this text.' }), noteSaid(ZOE, { said: 'Yes, that one.' })]);
  for (const [reader, text] of await readersOf(same.io, same.id)) assert.doesNotMatch(text, /CONFLICT \(/, `${reader}:\n${text}`);
  assert.equal(await waitsForAnswer(same.io, same.id), false);
  const yes = await mergedWorld([noteSaid(ABE, { said: 'Yes.' }), noteSaid(ZOE, { said: 'Yes.' })]);
  const bare = await mergedWorld([noteSaid(ABE, { said: undefined }), noteSaid(ZOE, { said: undefined })]);
  for (const { io, id } of [yes, bare]) assert.equal(await waitsForAnswer(io, id), true);
});

test('(3) the person\'s documented change replaces the lines before it: its history shows, and no conflict', async () => {
  const { io, id } = await mergedWorld([noteSaid(ABE), noteSaid(ZOE)]);
  await added(io, id, noteSaid(ZOE, { supersedes: [`${id}/${KEY}`] })); // the person's answer to the conflict
  for (const [reader, text] of await readersOf(io, id)) assert.doesNotMatch(text, /CONFLICT \(/, `${reader}:\n${text}`);
  const states = (await verbs.show(io, { rest: [`decision:${KEY}`] })).out.decisions.map((d) => [d.value, d.state]);
  assert.deepEqual(states, [[ABE, 'revised'], [ZOE, 'revised'], [ZOE, 'active']]);
  assert.equal(await waitsForAnswer(io, id), false);
});

test('a merge that puts an AI line after a person\'s on one key: the person\'s line holds in every reader', async () => {
  const { io, id } = await mergedWorld([noteSaid(ABE), { ...noteSaid('An AI text.'), whose: 'assumed', said: undefined }]);
  const states = (await verbs.show(io, { rest: [`decision:${KEY}`] })).out.decisions.map((d) => [d.value, d.by, d.state]);
  assert.deepEqual(states, [[ABE, 'Amy', 'active'], ['An AI text.', 'ai', 'revised']]);
  for (const [reader, text] of await readersOf(io, id)) { // a decision's own node lists its history, the AI's line as no holder
    if (reader.startsWith('show decision:')) assert.match(text, /An AI text\. .*by the AI\) revised in/, text);
    else assert.doesNotMatch(text, /An AI text\./, `${reader}:\n${text}`);
  }
  await added(io, id, [{ t: 'decision', key: 'note.place', value: 'top', why: 'theirs', whose: 'person', said: 'top', answers: 'Q2',
    effect: [`file:${FILE}`] }, { t: 'confirm', by: 'Amy', said: 'go' }]);
  const start = await verbSays(io, 'resume', []); // a READY plan's start: the settled decisions a new session builds from
  assert.ok(start.includes(ABE) && !start.includes('An AI text.'), start);
});

test('in one place, the documented change is one decision; the key again in other words with no supersedes is refused', async () => {
  const io = bookWorld({ files: { [FILE]: 'a\n' }, branch: 'main' });
  writeConfig(io, { protect: ['lessons/**'] });
  const id = await begin(io, { title: 'Escape velocity note', level: 'micro' });
  await added(io, id, [...DRAFT, noteSaid(ABE)]);
  await added(io, id, noteSaid(ZOE, { supersedes: [`${id}/${KEY}`] }));
  assert.ok(!(await verbSays(io, 'show', [id, 'decisions'])).includes('CONFLICT ('), 'the documented change');
  const again = await added(io, id, noteSaid(ABE)).then(() => null, (err) => err.message);
  assert.ok(again.startsWith(`decision-unnamed: nothing written: ${id}/${KEY}:`), again); // the write makes no conflict; only a merge does
});

test('a plan file git left with conflict markers is a merge conflict to every reader, the gate and doctor; it covers no edit', async () => {
  const io = bookWorld({ files: { [FILE]: 'a\n' }, branch: 'main' });
  writeConfig(io, { protect: ['lessons/**'] });
  const id = await begin(io, { title: 'Escape velocity note', level: 'micro' });
  await added(io, id, [...DRAFT.slice(0, 3), { t: 'confirm', by: 'Amy', said: 'yes' }]);
  const [plan, ...rest] = io.fs.readText(logFile(id)).split('\n').filter(Boolean);
  const side = (said) => JSON.stringify({ ...noteSaid(said), at: '2026-11-02T07:00:00.000Z' });
  io.fs.writeAtomic(logFile(id), [plan, ...rest, '<<<<<<< HEAD', side(ABE), '=======', side(ZOE), '>>>>>>> theirs', ''].join('\n'));
  const markers = `.decisionbook/${id}.jsonl has unresolved git conflict markers at lines ${rest.length + 2}, ${rest.length + 4}, `
    + `${rest.length + 6}: resolve them in git`;
  for (const [verb, args] of [['show', [id]], ['ready', [id]]]) {
    await assert.rejects(verbs[verb](io, { rest: args }), (err) => err.code === 'plan-unmerged' && err.message.includes(markers), verb);
  }
  for (const [verb, args] of [['show', [`decision:${KEY}`]], ['find', ['escape']], ['inbox', []], ['resume', []]]) {
    assert.ok((await verbSays(io, verb, args)).includes(markers), `${verb}: ${await verbSays(io, verb, args)}`);
  }
  const gate = await handlers.preEdit({ ...editEvent(FILE), session_id: 's1' }, io);
  assert.deepEqual([gate.verdict, gate.code, gate.reason.includes(markers)], ['deny', 'plan-unmerged', true], gate.reason);
  const doctor = await decisionbook.doctor(io);
  assert.deepEqual([doctor.ok, doctor.says.includes(markers)], [false, true], doctor.says);
  io.fs.writeAtomic(logFile(id), [plan, '<<<<<<< HEAD', side(ABE), '||||||| base', '=======', side(ZOE), '>>>>>>> theirs', ''].join('\n'));
  assert.ok((await verbSays(io, 'inbox', [])).includes('markers at lines 2, 4, 5, 7:'), 'the base line of a three-way merge is a marker too');
  const start = await verbSays(io, 'resume', []);
  assert.ok(start.startsWith('Resolve the merge first') && !start.includes('No plan on this branch'), `no new plan is asked for:\n${start}`);
  assert.ok(!(await verbSays(io, 'inbox', [])).includes('Nothing waits'), 'the inbox counts it');
  const debug = (await decisionbook.debug.decisionbook(io, {})).text;
  assert.ok(debug.includes(`refused ${id}: plan-unmerged`) && debug.includes('markers at lines 2, 4, 5, 7:'), `debug keeps the code and the lines:\n${debug}`);
});

test('a plan file that does not read is unknown, never absent: start, resume, inbox and the gate name it; no new plan asked', async () => {
  const io = bookWorld({ files: { [FILE]: 'a\n' }, branch: 'main' });
  writeConfig(io, { protect: ['lessons/**'] });
  const id = await begin(io, { title: 'Escape velocity note', level: 'micro' });
  await added(io, id, [...DRAFT.slice(0, 3), { t: 'confirm', by: 'Amy', said: 'yes' }]);
  const whole = io.fs.readText(logFile(id));
  const [plan, ...rest] = whole.split('\n').filter(Boolean);
  const unread = (place) => `a record could not be read: .decisionbook/${id}.jsonl${place} (record-invalid); what it holds is unknown, not absent`;
  const startSays = async () => ((await handlers.session({ session_id: 's1', source: 'startup' }, io)).say ?? []).map((s) => s.text).join('\n');
  io.fs.writeAtomic(logFile(id), ['{"t":"plan", cut', ...rest, ''].join('\n')); // its first line broken: the whole file reads as no plan
  for (const said of [await verbSays(io, 'resume', []), await verbSays(io, 'inbox', []), await startSays()]) {
    assert.ok(said.includes(unread('')) && !said.includes('No plan on this branch') && !said.includes('Nothing waits'), said);
  }
  assert.ok((await verbSays(io, 'resume', [])).startsWith('Repair it first'), 'it leads, as an unfinished merge does');
  const gate = await handlers.preEdit({ ...editEvent(FILE), session_id: 's1' }, io);
  assert.deepEqual([gate.verdict, gate.code, gate.reason.includes(unread(''))], ['deny', 'plan-none', true], gate.reason);
  io.fs.writeAtomic(logFile(id), [plan, rest[0], '{"t":"decision", cut', ...rest.slice(1), ''].join('\n')); // one line of it broken
  for (const verb of ['resume', 'inbox', 'plan']) { // `plan`: the bare verb, which says how planning works
    assert.ok((await verbSays(io, verb, [])).includes(unread(':3')), `${verb}: ${await verbSays(io, verb, [])}`);
  }
  const related = (await verbs.related(io, { rest: [FILE] })).text;
  assert.equal(related.split(unread(':3')).length, 2, `related says it once:\n${related}`);
  io.fs.writeAtomic(logFile(id), whole); // repaired: nothing of it is said
  for (const verb of ['resume', 'inbox', 'plan']) assert.ok(!(await verbSays(io, verb, [])).includes('could not be read'), verb);
});

test('beside an earlier plan\'s conflict, an answer typed before its question is on record is unasked, never not theirs', async () => {
  const io = bookWorld({ files: { [FILE]: 'a\n' }, branch: 'main' });
  writeConfig(io, { protect: ['lessons/**'] });
  const old = await begin(io, { title: 'Escape velocity note', level: 'micro' });
  const TYPED = 'Yes, the textbook line, in bold.';
  await added(io, old, [...DRAFT.slice(0, 4), noteSaid(TYPED, { value: 'The textbook line, bold.' }), { t: 'confirm', by: 'Amy', said: 'go' }]);
  const [head, ...rest] = io.fs.readText(logFile(old)).split('\n');
  const first = rest.findIndex((line) => line.includes('"t":"decision"'));
  const twin = JSON.stringify({ ...JSON.parse(rest[first]), value: TYPED, at: '2026-11-02T06:00:00.900Z' }); // the same words written again,
  io.fs.writeAtomic(logFile(old), [head, ...rest.slice(0, first + 1), twin, ...rest.slice(first + 1)].join('\n')); // by a version with no stamp
  const ref = `${old}/${KEY}`;
  await handlers.start(starting('s1'), io);
  io.session = 's1';
  const say = (prompt) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt }, io);
  await say('Add a last-checked line under the note. Earlier decisions stay.');
  const made = await verbs.create(io, { rest: [wire({ title: 'Last checked line', why: 'they asked', success: 'the line shows', kind: 'feature',
    level: 'micro', records: DRAFT.slice(0, 3) })] });
  assert.ok(made.text.includes(`${ref}: CONFLICT (2 person decisions in this plan`) && made.text.includes(`record the replace question first ({"t":"question","supersedes":["${ref}"]})`), made.text);
  const id = made.out.id;
  const ask = { ...ASK('Q1', KEY, 'Two lines of yours stand for the note: does it stay as it is?'), supersedes: [ref] };
  const stays = { ...noteSaid('The note stays as it is.', { value: TYPED }), supersedes: [ref] };
  const sent = (records) => added(io, id, records).then((res) => res.text, (err) => err.message);
  await say('The note stays as it is. Yes, add the line.');
  const early = await sent([ask, stays]); // asked in the chat only: the question reaches the record with the answer
  assert.ok(early.startsWith(`conflict-unasked: nothing written: record 2 of 2: ${ref}: this answer ends a conflict, and no replace question`)
    && !early.includes('quotes the person'), early);
  await sent([ask, ASK('Q2', 'note.place', 'Where does the line go?')]);
  assert.ok((await sent([stays])).startsWith('conflict-unasked: '), 'typed before the question was on record');
  assert.ok((await verbSays(io, 'inbox', [])).includes('CONFLICT'), 'the conflict waits for the person');
  await say('The note stays as it is.');
  assert.ok((await sent([stays])).includes(`recorded, by Amy: ${KEY}: "The note stays as it is.", replaces ${ref}`), 'their answer after it');
  // the answer ends the conflict at once, though its plan is still a draft that waits for another answer
  assert.match(await verbSays(io, 'show', [id]), new RegExp(`^${id} draft `), 'Q2 is still open');
  assert.ok(!(await verbSays(io, 'inbox', [])).includes('CONFLICT') && !(await verbSays(io, 'show', [`decision:${KEY}`])).includes('CONFLICT'),
    'no reader shows the conflict any more');
});
